/**
 * imageAnalysis.ts
 *
 * Analyzes one or more photos or videos for any handyman task using Gemini Vision.
 * Returns observations, validation flags, and additional complexity detected from the
 * visual/auditory media assets based on general text descriptions.
 *
 * Resilience additions:
 * - Retry with exponential backoff on transient Gemini failures (429/5xx/timeout)
 * - Hard timeout so a hung request doesn't block the estimate forever
 * - Result caching so identical (media + task + params) calls skip the API entirely
 * - Defensive JSON parsing — a malformed Gemini response throws a typed error instead of crashing
 * - Imports normalized assets from mediaConversion to handle HEIC/MOV transparently
 */

import { GoogleGenAI, Type } from "@google/genai";
import { TaskDefinition, TaskParams } from "./taskRegistry";
import { MediaAnalysisResult, MediaInput } from "./types";
import { ImageAnalysisError, GeminiResponseParseError, withRetry, withTimeout } from "./errors";
import { buildCacheKey, getCached, setCached } from "./cache";
import { normalizeMediaForGemini } from "./mediaConversion";

function getClient(): GoogleGenAI {
  // Try to use GOOGLE_API_KEY first, fallback to GEMINI_API_KEY if that's what is set
  const apiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
  
  if (!apiKey) {
    throw new ImageAnalysisError(
      "Gemini API key is not set. Please ensure GOOGLE_API_KEY or GEMINI_API_KEY is configured.",
      { retryable: false }
    );
  }

  // Explicitly passing the apiKey inside the initialization object bypassed the internal undefined read error
  return new GoogleGenAI({ apiKey: apiKey });
}

const GEMINI_MAX_RETRIES = Number(process.env.GEMINI_MAX_RETRIES ?? 3);
const GEMINI_RETRY_BASE_DELAY_MS = Number(process.env.GEMINI_RETRY_BASE_DELAY_MS ?? 500);
const GEMINI_TIMEOUT_MS = Number(process.env.GEMINI_TIMEOUT_MS ?? 90_000);
const CACHE_TTL_SECONDS = Number(process.env.IMAGE_ANALYSIS_CACHE_TTL_SECONDS ?? 3600);

// ─── Gemini response schema ──────────────────────────────────────────────────

const MEDIA_ANALYSIS_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    observations: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "List of concrete visual or auditory observations regarding the physical space layout, scale, materials, or condition seen in the photos/videos.",
    },
    confidence: {
      type: Type.NUMBER,
      description: "Overall confidence from 0.0 to 1.0 in the media analysis quality.",
    },
    validationFlags: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description:
        "Conflicts between what the user provided in their general notes and what the media reveals. " +
        "Each item is a human-readable note like: " +
        "'User described clean wall but media reveals major water damage background holes.'",
    },
    additionalComplexityMinutes: {
      type: Type.INTEGER,
      description:
        "CRITICAL BEHAVIOR RULE DEPENDING ON THE TASK ID:\n" +
        "1. For standard tasks: Return extra execution minutes to add BEYOND the baseline estimate due to real complications.\n" +
        "2. For the 'other' task: There is NO system baseline time. This field MUST represent the absolute TOTAL estimated duration " +
        "in minutes for a professional technician to complete the entire job from setup to cleanup.",
    },
    installerNotes: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description:
        "Practical, actionable technical notes for the installer about the exact environmental layout context they will encounter on-site.",
    },
    inferredTaskType: {
      type: Type.STRING,
      nullable: true,
      description:
        "Only for 'other' tasks: your best technical description of what the task actually is " +
        "(e.g. 'bathroom shower floor tile regrouting', 'exterior gutter assembly fixture').",
    },
    inferredComplexity: {
      type: Type.STRING,
      enum: ["simple", "moderate", "complex"],
      nullable: true,
      description: "Only for 'other' tasks: inferred complexity classification level.",
    },
  },
  required: [
    "observations",
    "confidence",
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
  const userNotes = userParams.notes || "(No additional descriptive notes provided by user)";

  // The AI is now explicitly told to output the absolute TOTAL time here
  const durationInstruction = `CRITICAL TIME ESTIMATION RULE:
       You must populate the 'additionalComplexityMinutes' field with the absolute TOTAL duration (in minutes) 
       required for a professional handyman to complete this entire job from initial setup, unboxing, and execution to cleanup. 
       Do not just calculate "extra" time or look for deviations—provide your complete, single end-to-end duration estimate based on the physical scale seen in the media and the text description context.`;

  return `You are an expert handyman estimator analyzing ${mediaCount} media file(s) (pictures and/or videos) alongside general project notes.

TASK TYPE: ${task.label}
TASK GUIDELINES: ${task.imageHints}

USER'S GENERAL PROJECT DESCRIPTION:
"${userNotes}"

INSTRUCTIONS:
1. Carefully analyze the media and text for layout spacing, physical materials, current damage, or workspace obstacles.
2. Document concrete physical environment findings inside 'observations'.
3. Cross-reference the user's text description notes with what the media assets reveal. Note any explicit contradictions in 'validationFlags'.

${durationInstruction}

5. Write highly practical, detailed 'installerNotes' preparing the technician for exactly what they will encounter on-site.
6. Set confidence score between 0.0 (unusable quality) and 1.0 (crystal clear, absolute certainty layout context).

Return only valid JSON matching the schema structure. Do not guess blindly or output custom parameter keys.`;
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

function normalizeResult(parsed: unknown): MediaAnalysisResult {
  // Cast to any to cleanly read properties on unknown shape at runtime
  const data = parsed as any;
  
  return {
    observations: Array.isArray(data?.observations) ? data.observations : [],
    confidence: clamp(Number(data?.confidence ?? 0.5), 0, 1),
    validationFlags: Array.isArray(data?.validationFlags) ? data.validationFlags : [],
    additionalComplexityMinutes: Math.max(0, Number(data?.additionalComplexityMinutes ?? 0)),
    installerNotes: Array.isArray(data?.installerNotes) ? data.installerNotes : [],
    inferredTaskType: typeof data?.inferredTaskType === "string" ? data.inferredTaskType : undefined,
    inferredComplexity: ["simple", "moderate", "complex"].includes(data?.inferredComplexity)
      ? data.inferredComplexity
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
    validationFlags: [],
    additionalComplexityMinutes: 0,
    installerNotes: [
      `Media analysis unavailable (${reason}). Estimate is based purely on text descriptions — verify layout constraints on-site.`,
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
      validationFlags: [],
      additionalComplexityMinutes: 0,
      installerNotes: [],
    };
  }

  // ── Cache check ──────────────────────────────────────────────────────────
  const cacheKey = buildCacheKey(task.id, mediaItems.map(m => m.inlineData.data), userParams);
  const isCacheDisabled = true;

  if (!isCacheDisabled) {
    const cached = getCached(cacheKey);
    if (cached) {
      return cached as MediaAnalysisResult;
    }
  } else {
    console.log("🔄 [Cache] Cache disabled by environment. Fetching fresh data from Gemini...");
  }

  // ── Unified Media Normalization Layer ─────────────────────────────────────
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
        
        let response;
        try {
          response = await withTimeout(
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
        } catch (timeoutOrApiErr) {
          throw new ImageAnalysisError(
            `Gemini operational failure: ${timeoutOrApiErr instanceof Error ? timeoutOrApiErr.message : String(timeoutOrApiErr)}`,
            { retryable: true }
          );
        }

        if (!response || !response.text) {
          throw new ImageAnalysisError("Gemini returned an empty response text payload", { retryable: true });
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

    // Only save fresh entries back to disk if cache isn't bypassed globally
    if (!isCacheDisabled) {
      setCached(cacheKey, result, CACHE_TTL_SECONDS);
    }
    
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