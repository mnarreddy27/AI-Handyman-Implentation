/**
 * imageAnalysis.ts
 *
 * Analyzes one or more photos for any handyman task using Gemini Vision.
 * Returns observations, parameter inferences, validation flags,
 * and additional complexity detected from the images.
 *
 * Resilience additions:
 *   - Retry with exponential backoff on transient Gemini failures (429/5xx/timeout)
 *   - Hard timeout so a hung request doesn't block the estimate forever
 *   - Result caching so identical (photo + task + params) calls skip the API entirely
 *   - Defensive JSON parsing — a malformed Gemini response throws a typed error
 *     instead of crashing the process
 */

import { GoogleGenAI, Type } from "@google/genai";
import { TaskDefinition, TaskParams } from "./taskRegistry";
import { ImageAnalysisResult } from "./types";
import { ImageAnalysisError, GeminiResponseParseError, withRetry, withTimeout } from "./errors";
import { buildCacheKey, getCached, setCached } from "./cache";

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
const GEMINI_TIMEOUT_MS = Number(process.env.GEMINI_TIMEOUT_MS ?? 30_000);
const CACHE_TTL_SECONDS = Number(process.env.IMAGE_ANALYSIS_CACHE_TTL_SECONDS ?? 3600);

// ─── Gemini response schema ──────────────────────────────────────────────────

const IMAGE_ANALYSIS_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    observations: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "List of concrete visual observations relevant to the installation or repair task.",
    },
    confidence: {
      type: Type.NUMBER,
      description: "Overall confidence from 0.0 to 1.0 in the image analysis.",
    },
    parameterOverrides: {
      type: Type.OBJECT,
      description:
        "Key-value pairs where keys match the task's parameter keys. " +
        "Only include fields you can confidently infer from the image(s). " +
        "Values should match the expected type (string, number, or boolean).",
      additionalProperties: true,
    },
    validationFlags: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description:
        "Conflicts between what the image shows and what the user provided. " +
        "Each item is a human-readable note like: " +
        "'User said drywall but image shows brick wall.'",
    },
    additionalComplexityMinutes: {
      type: Type.INTEGER,
      description:
        "Extra minutes to add beyond the standard param-based estimate, " +
        "due to issues visible in the photo that no parameter captures. " +
        "E.g. cluttered work area (+10), water damage requiring treatment (+20). " +
        "Use 0 if no additional complexity is detected.",
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
        "(e.g. 'bathroom tile regrouting', 'exterior light fixture replacement').",
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
  const match = base64.match(/^data:[^;]+;base64,(.+)$/);
  return match ? match[1] : base64;
}

function buildPrompt(
  task: TaskDefinition,
  userParams: TaskParams,
  imageCount: number
): string {
  const paramLines = Object.entries(userParams)
    .map(([k, v]) => `  ${k}: ${JSON.stringify(v)}`)
    .join("\n");

  return `You are an expert handyman estimator analyzing ${imageCount > 1 ? `${imageCount} photos` : "a photo"} of a job site.

TASK: ${task.label}
TASK DESCRIPTION: ${task.imageHints}

USER-PROVIDED PARAMETERS:
${paramLines || "  (none provided)"}

INSTRUCTIONS:
1. Analyze the image(s) carefully for details relevant to this specific task.
2. Populate parameterOverrides ONLY for fields you can confidently infer from the image.
   - For the "other" task, infer as much as possible (materials, scope, access, complexity).
   - Parameter keys must exactly match the task's parameter keys listed above.
3. Note any conflicts between what the user stated and what the image shows in validationFlags.
4. Set additionalComplexityMinutes for issues the standard parameters don't capture
   (poor access, unexpected damage, hazardous conditions, site complexity, etc.).
5. Write actionable installerNotes — things the technician should know before arrival.
6. Set confidence between 0.0 (very unclear photo) and 1.0 (crystal clear, high certainty).

Return only valid JSON matching the schema. Be specific and honest — do not guess if the image is unclear.`;
}

function safeParseGeminiJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new GeminiResponseParseError(
      `Gemini returned malformed JSON: ${err instanceof Error ? err.message : String(err)}`,
      text.slice(0, 500) // truncate so logs/errors don't balloon
    );
  }
}

function normalizeResult(parsed: any): ImageAnalysisResult {
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

/** A safe fallback result used when Gemini fails after all retries are exhausted. */
function degradedFallbackResult(reason: string): ImageAnalysisResult {
  return {
    observations: [],
    confidence: 0,
    parameterOverrides: {},
    validationFlags: [],
    additionalComplexityMinutes: 0,
    installerNotes: [
      `Photo analysis unavailable (${reason}). Estimate is based on submitted parameters only — confirm details on-site.`,
    ],
  };
}

// ─── Multi-image analysis ────────────────────────────────────────────────────

export interface PhotoInput {
  base64: string;
  mediaType: "image/jpeg" | "image/png" | "image/webp";
}

export interface AnalyzeOptions {
  /** If true, throws on Gemini failure instead of returning a degraded fallback result. */
  throwOnFailure?: boolean;
}

export async function analyzeJobPhotos(
  photos: PhotoInput[],
  task: TaskDefinition,
  userParams: TaskParams = {},
  options: AnalyzeOptions = {}
): Promise<ImageAnalysisResult> {
  if (photos.length === 0) {
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
  const cacheKey = buildCacheKey(task.id, photos.map(p => p.base64), userParams);
  const cached = getCached(cacheKey);
  if (cached) {
    return cached;
  }

  const prompt = buildPrompt(task, userParams, photos.length);

  const contents: Array<{ text: string } | { inlineData: { data: string; mimeType: string } }> = [
    { text: prompt },
    ...photos.map((photo) => ({
      inlineData: {
        data: stripBase64Prefix(photo.base64),
        mimeType: photo.mediaType,
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
              responseJsonSchema: IMAGE_ANALYSIS_SCHEMA,
              temperature: 0.2,
            },
          }),
          GEMINI_TIMEOUT_MS
        );

        if (!response.text) {
          // Empty response is often transient (safety filter, truncation) — treat as retryable
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
            `[imageAnalysis] Retry ${attempt}/${GEMINI_MAX_RETRIES} for task "${task.id}" after error:`,
            error instanceof Error ? error.message : error
          );
        },
      }
    );

    setCached(cacheKey, result, CACHE_TTL_SECONDS);
    return result;

  } catch (error) {
    console.error(`[imageAnalysis] Failed for task "${task.id}" after retries:`, error);

    if (options.throwOnFailure) {
      if (error instanceof ImageAnalysisError || error instanceof GeminiResponseParseError) {
        throw error;
      }
      throw new ImageAnalysisError(
        `Image analysis failed: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error, retryable: false }
      );
    }

    // Default behavior: degrade gracefully so a Gemini outage doesn't break
    // the whole estimate — the user still gets a time estimate from params alone.
    const reason = error instanceof Error ? error.message : "unknown error";
    return degradedFallbackResult(reason);
  }
}