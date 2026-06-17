/**
 * types.ts
 *
 * Generalized type definitions for the multi-task handyman estimator.
 */

// ─── Task params ─────────────────────────────────────────────────────────────

/**
 * User-supplied params for any task.
 * Keys are defined per-task in taskRegistry.ts.
 * Values can be strings, numbers, booleans, or string arrays (multiselect).
 */
export type TaskParams = Record<string, string | number | boolean | string[]>;

// ─── Image analysis ──────────────────────────────────────────────────────────

export interface ImageAnalysisResult {
  /** General observations relevant to the task — what the AI sees in the photo. */
  observations: string[];

  /** Confidence of the overall image analysis (0.0–1.0). */
  confidence: number;

  /**
   * Parameter overrides inferred from the image.
   * Keys match TaskParams keys from the task definition.
   * Only populated where the image gives clear evidence.
   */
  parameterOverrides: TaskParams;

  /**
   * Conflicts: cases where what the image shows differs from what the user stated.
   * Each entry is a human-readable note for the installer.
   */
  validationFlags: string[];

  /**
   * Additional time modifiers the AI detected from the image that aren't
   * covered by the standard param set (e.g. "wall has extensive water damage",
   * "tight space with limited tool access").
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
  breakdown: Record<string, number>;   // modifier label → minutes added
  notices: string[];                   // human-readable warnings for the installer
}

// ─── Orchestrator output ─────────────────────────────────────────────────────

export interface HandymanEstimateOutput {
  taskId: string;
  taskLabel: string;

  estimatedDurationMinutes: number;
  rangeMinMinutes: number;
  rangeMaxMinutes: number;
  confidenceScore: number;

  /** Final params after merging user input + image inference. */
  reconciledParams: TaskParams;

  /** All notices: validation flags, installer notes, complexity warnings. */
  notices: string[];

  /** Minute-by-minute breakdown of what drove the estimate. */
  breakdown: Record<string, number>;

  /** What the image analysis specifically found (optional — only when images provided). */
  imageInsights?: {
    observations: string[];
    installerNotes: string[];
    additionalComplexityMinutes: number;
    inferredTaskType?: string;
  };
}