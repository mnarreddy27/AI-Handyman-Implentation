/**
 * imageAnalysis.ts
 *
 * Analyzes one or more photos or videos for any handyman task using Gemini Vision.
 * Returns observations, parameter inferences, validation flags,
 * and additional complexity detected from the visual/auditory media assets.
 *
 * Resilience additions:
 * - Retry with exponential backoff on transient Gemini failures (429/5xx/timeout)
 * - Hard timeout so a hung request doesn't block the estimate forever
 * - Result caching so identical (media + task + params) calls skip the API entirely
 * - Defensive JSON parsing — a malformed Gemini response throws a typed error
 * instead of crashing the process
 * - Imports normalized assets from mediaConversion to handle HEIC/MOV transparently
 */

import { GoogleGenAI, Type } from "@google/genai";
import { TaskDefinition, TaskParams } from "./taskRegistry";
import { MediaAnalysisResult, MediaInput } from "./types";
import { ImageAnalysisError, GeminiResponseParseError, withRetry, withTimeout } from "./errors";
import { buildCacheKey, getCached, setCached } from "./cache";
import { normalizeMediaForGemini } from "./mediaConversion";

function getClient(): GoogleGenAI {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    throw new ImageAnalysisError(
      "GOOGLE_API_KEY is not set. Copy .env.example to .env and add your Gemini API key.",
      { retryable: false }
    );
  }
  return new GoogleGenAI({ apiKey });
}

const GEMINI_MAX_RETRIES = Number(process.env.GEMINI_MAX_RETRIES ?? 3);
const GEMINI_RETRY_BASE_DELAY_MS = Number(process.env.GEMINI_RETRY_BASE_DELAY_MS ?? 500);
// Increased threshold from 30s to 90s to comfortably swallow larger converted video payloads
const GEMINI_TIMEOUT_MS = Number(process.env.GEMINI_TIMEOUT_MS ?? 90_000);
const CACHE_TTL_SECONDS = Number(process.env.IMAGE_ANALYSIS_CACHE_TTL_SECONDS ?? 3600);

// ─── Gemini response schema ──────────────────────────────────────────────────

const MEDIA_ANALYSIS_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    observations: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "List of concrete visual or auditory observations relevant to the installation, repair, or setup task.",
    },
    confidence: {
      type: Type.NUMBER,
      description: "Overall confidence from 0.0 to 1.0 in the media analysis.",
    },
    parameterOverrides: {
      type: Type.OBJECT,
      description:
        "Key-value pairs where keys match the task's parameter keys. " +
        "Only include fields you can confidently infer from the media assets. " +
        "Values should match the expected type (string, number, or boolean).",
      additionalProperties: true,
    },
    validationFlags: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description:
        "Conflicts between what the media shows/reveals and what the user provided. " +
        "Each item is a human-readable note like: " +
        "'User said drywall but media shows brick wall.'",
    },
    additionalComplexityMinutes: {
      type: Type.INTEGER,
      description:
        "CRITICAL BEHAVIOR RULE DEPENDING ON THE TASK ID:\n" +
        "1. For standard tasks: Return extra minutes to add BEYOND the standard base estimate.\n" +
        "2. For the 'other' task: There is NO base estimate. This field MUST represent the TOTAL estimated duration " +
        "in minutes for a professional technician to complete the entire job from scratch based on the description and media content.",
    },
    installerNotes: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description:
        "Practical notes for the installer about what they'll encounter on-site. " +
        "Be specific and actionable.",
    },
    inferredTaskType: {
      type: Type.STRING,
      nullable: true,
      description:
        "Only for 'other' tasks: your best description of what the task actually is " +
        "(e.g. 'bathroom tile regrouting', 'exterior light fixture replacement', 'tree removal').",
    },
    inferredComplexity: {
      type: Type.STRING,
      enum: ["simple", "moderate", "complex"],
      nullable: true,
      description: "Only for 'other' tasks: inferred complexity level.",
    },
  },
  required: [
    "observations",
    "confidence",
    "parameterOverrides",
    "validationFlags",
    "additionalComplexityMinutes",
    "installerNotes",
  ],
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function stripBase64Prefix(base64: string): string {
  if (!base64) return "";
  if (base64.includes(",")) {
    return base64.split(",")[1];
  }
  return base64.trim();
}

function buildPrompt(
  task: TaskDefinition,
  userParams: TaskParams,
  mediaCount: number
): string {
  const paramLines = Object.entries(userParams)
    .map(([k, v]) => `   ${k}: ${JSON.stringify(v)}`)
    .join("\n");

  const durationInstruction = task.id === "other"
    ? `CRITICAL TIME ESTIMATION RULE FOR 'OTHER' TASK:
       Because this is an unclassified ('other') task, there is no system baseline time. 
       You must populate the 'additionalComplexityMinutes' field with the TOTAL duration (in minutes) required 
       for a professional handyman to complete the entire job from setup to cleanup. 
       Do not provide a modifier; estimate the absolute total execution time (e.g., 120 for a 2-hour task).`
    : `4. Set additionalComplexityMinutes for complications the standard parameters don't capture.
       Examples: poor physical access, structural damage, surrounding hazards, heavy setup overhead, etc. 
       This number will be added to a predefined baseline time.`;

  return `You are an expert handyman estimator analyzing ${mediaCount} media file(s) (pictures and/or videos) of a job site.

TASK: ${task.label}
TASK ID: ${task.id}
TASK DESCRIPTION: ${task.imageHints}

USER-PROVIDED PARAMETERS:
${paramLines || "   (none provided)"}

INSTRUCTIONS:
1. Analyze the image(s) and video frame(s) carefully for contextual details relevant to this specific task.
2. Populate parameterOverrides ONLY for fields you can confidently infer from the provided media.
   - For the "other" task, infer as much as possible (materials, scope, environment scope, access constraints, complexity).
   - Parameter keys must exactly match the task's parameter keys listed above.
3. Note any conflicts between what the user stated and what the media reveals in validationFlags.

${durationInstruction}

5. Write actionable installerNotes — adjustments the technician should expect before arriving.
6. Set confidence between 0.0 (very blurry/unusable media) and 1.0 (crystal clear, high certainty context).

Return only valid JSON matching the schema. Be specific, structured, and honest — do not guess blindly if the media asset is vague or unclear.`;
}

function safeParseGeminiJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new GeminiResponseParseError(
      `Gemini returned malformed JSON: ${err instanceof Error ? err.message : String(err)}`,
      text.slice(0, 500)
    );
  }
}

function normalizeResult(parsed: any): MediaAnalysisResult {
  return {
    observations: Array.isArray(parsed?.observations) ? parsed.observations : [],
    confidence: clamp(Number(parsed?.confidence ?? 0.5), 0, 1),
    parameterOverrides: typeof parsed?.parameterOverrides === "object" && parsed.parameterOverrides !== null
      ? parsed.parameterOverrides
      : {},
    validationFlags: Array.isArray(parsed?.validationFlags) ? parsed.validationFlags : [],
    additionalComplexityMinutes: Math.max(0, Number(parsed?.additionalComplexityMinutes ?? 0)),
    installerNotes: Array.isArray(parsed?.installerNotes) ? parsed.installerNotes : [],
    inferredTaskType: typeof parsed?.inferredTaskType === "string" ? parsed.inferredTaskType : undefined,
    inferredComplexity: ["simple", "moderate", "complex"].includes(parsed?.inferredComplexity)
      ? parsed.inferredComplexity
      : undefined,
  };
}

function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function degradedFallbackResult(reason: string): MediaAnalysisResult {
  return {
    observations: [],
    confidence: 0,
    parameterOverrides: {},
    validationFlags: [],
    additionalComplexityMinutes: 0,
    installerNotes: [
      `Media analysis unavailable (${reason}). Estimate is based on submitted parameters only — confirm details on-site.`,
    ],
  };
}

// ─── Mixed Media analysis ───────────────────────────────────────────────────

export interface AnalyzeOptions {
  /** If true, throws on Gemini failure instead of returning a degraded fallback result. */
  throwOnFailure?: boolean;
}

/**
 * Accepts an array of dynamic MediaInputs (images, videos, or mixed) and 
 * processes them concurrently against the Gemini multimodal framework.
 */
export async function analyzeJobMedia(
  mediaItems: MediaInput[],
  task: TaskDefinition,
  userParams: TaskParams = {},
  options: AnalyzeOptions = {}
): Promise<MediaAnalysisResult> {
  if (mediaItems.length === 0) {
    return {
      observations: [],
      confidence: 0,
      parameterOverrides: {},
      validationFlags: [],
      additionalComplexityMinutes: 0,
      installerNotes: [],
    };
  }

  // ── Cache check ──────────────────────────────────────────────────────────
  const cacheKey = buildCacheKey(task.id, mediaItems.map(m => m.inlineData.data), userParams);
  const cached = getCached(cacheKey);
  if (cached) {
    return cached as MediaAnalysisResult;
  }

  // ── Unified Media Normalization Layer ─────────────────────────────────────
  // Intercepts and flattens HEIC pictures and raw MOV video files into 
  // Gemini-compliant payloads via mediaConversion utilities.
  const processedMediaItems = await Promise.all(
    mediaItems.map(async (item) => {
      try {
        const rawBytes = Buffer.from(stripBase64Prefix(item.inlineData.data), "base64");
        const converted = await normalizeMediaForGemini(rawBytes, item.inlineData.mimeType);

        return {
          inlineData: {
            data: converted.buffer.toString("base64"),
            mimeType: converted.mimeType,
          },
        };
      } catch (err) {
        console.error(`[mediaAnalysis] Normalization step failed for asset. Using fallback raw layout:`, err);
        return item;
      }
    })
  );

  const prompt = buildPrompt(task, userParams, processedMediaItems.length);

  const contents: Array<{ text: string } | { inlineData: { data: string; mimeType: string } }> = [
    { text: prompt },
    ...processedMediaItems.map((item) => ({
      inlineData: {
        data: stripBase64Prefix(item.inlineData.data),
        mimeType: item.inlineData.mimeType,
      },
    })),
  ];

  try {
    const result = await withRetry(
      async () => {
        const ai = getClient();
        const response = await withTimeout(
          ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents,
            config: {
              responseMimeType: "application/json",
              responseJsonSchema: MEDIA_ANALYSIS_SCHEMA,
              temperature: 0.0,
              seed: 42, 
            },
          }),
          GEMINI_TIMEOUT_MS
        );

        if (!response.text) {
          throw new ImageAnalysisError("Gemini returned an empty response", { retryable: true });
        }

        const parsed = safeParseGeminiJson(response.text);
        return normalizeResult(parsed);
      },
      {
        maxRetries: GEMINI_MAX_RETRIES,
        baseDelayMs: GEMINI_RETRY_BASE_DELAY_MS,
        onRetry: (attempt, error) => {
          console.warn(
            `[mediaAnalysis] Retry ${attempt}/${GEMINI_MAX_RETRIES} for task "${task.id}" after error:`,
            error instanceof Error ? error.message : error
          );
        },
      }
    );

    setCached(cacheKey, result, CACHE_TTL_SECONDS);
    return result;

  } catch (error) {
    console.error(`[mediaAnalysis] Failed for task "${task.id}" after retries:`, error);

    if (options.throwOnFailure) {
      if (error instanceof ImageAnalysisError || error instanceof GeminiResponseParseError) {
        throw error;
      }
      throw new ImageAnalysisError(
        `Media analysis failed: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error, retryable: false }
      );
    }

    const reason = error instanceof Error ? error.message : "unknown error";
    return degradedFallbackResult(reason);
  }
}