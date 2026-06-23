/**
 * types.ts
 *
 * Generalized type definitions for the multi-task handyman estimator.
 * Updated to support both Image and Video multimodal analysis.
 */

// ─── Task params ─────────────────────────────────────────────────────────────

/**
 * User-supplied params for any task.
 * Keys are defined per-task in taskRegistry.ts.
 * Values can be strings, numbers, booleans, or string arrays (multiselect).
 */
export type TaskParams = Record<string, string | number | boolean | string[]>;

// ─── Multimodal Media Inputs ─────────────────────────────────────────────────

/**
 * Represents any structured media item (Image or Video) formatted for the 
 * Google Gen AI SDK inline data payload.
 */
export interface MediaInput {
  inlineData: {
    /** The Base64 encoded string of the asset file */
    data: string;
    /** The explicit file format type (e.g., "image/jpeg", "image/png", "video/mp4", "video/quicktime") */
    mimeType: string;
  };
}

// ─── Media analysis ──────────────────────────────────────────────────────────

/**
 * Renamed from ImageAnalysisResult to reflect comprehensive asset analysis
 * (both pictures and sequential video streams).
 */
export interface MediaAnalysisResult {
  /** General observations relevant to the task — what the AI sees in the photos or video frames. */
  observations: string[];

  /** Confidence of the overall visual/auditory asset analysis (0.0–1.0). */
  confidence: number;

  /**
   * Parameter overrides inferred from the media.
   * Keys match TaskParams keys from the task definition.
   * Only populated where the assets give clear evidence.
   */
  parameterOverrides: TaskParams;

  /**
   * Conflicts: cases where what the media shows differs from what the user stated.
   * Each entry is a human-readable note for the installer.
   */
  validationFlags: string[];

  /**
   * Additional time modifiers the AI detected from the media that aren't
   * covered by the standard param set (e.g. "wall has extensive water damage",
   * "tight space with limited tool access", "audible squeaking indicates subfloor friction").
   */
  additionalComplexityMinutes: number;

  /**
   * Free-text notes to surface to the installer.
   * E.g. "The grout appears moldy — mold treatment may be needed before regrouting."
   */
  installerNotes: string[];

  /**
   * For the "other" task type: the AI's best guess at what category of work this is,
   * and a rough complexity assessment.
   */
  inferredTaskType?: string;
  inferredComplexity?: "simple" | "moderate" | "complex";
}

// ─── Estimation ──────────────────────────────────────────────────────────────

export interface EstimationResult {
  estimatedDurationMinutes: number;
  rangeMinMinutes: number;
  rangeMaxMinutes: number;
  confidenceScore: number;
  /** modifier label → minutes added */
  breakdown: Record<string, number> & {
    base_time?: number;
    media_detected_complexity?: number;
  };
  notices: string[];                    // human-readable warnings for the installer
}

// ─── Orchestrator output ─────────────────────────────────────────────────────

export interface HandymanEstimateOutput {
  taskId: string;
  taskLabel: string;

  estimatedDurationMinutes: number;
  rangeMinMinutes: number;
  rangeMaxMinutes: number;
  confidenceScore: number;

  /** Final params after merging user input + visual media inference. */
  reconciledParams: TaskParams;

  /** All notices: validation flags, installer notes, complexity warnings. */
  notices: string[];

  /** Minute-by-minute breakdown of what drove the estimate. */
  breakdown: Record<string, number> & {
    base_time?: number;
    media_detected_complexity?: number;
  };

  /** * What the media analysis specifically found 
   * (optional — only when image or video assets are provided). 
   */
  mediaInsights?: {
    observations: string[];
    installerNotes: string[];
    additionalComplexityMinutes: number;
    inferredTaskType?: string;
  };
}