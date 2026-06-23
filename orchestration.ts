/**
 * orchestration.ts
 *
 * Orchestrates the full estimation pipeline for any handyman task:
 * 1. Validate the task ID against the registry
 * 2. Analyze job site media files (unlimited pictures, videos, or mixed)
 * 3. Reconcile user params + media inferences (media overrides on conflict)
 * 4. Run the estimation engine (or handle dynamic pure-AI estimation for 'other')
 * 5. Return the unified output
 */

import { analyzeJobMedia } from "./imageAnalysis";
import { estimateTaskTime } from "./estimationEngine";
import { getTask } from "./taskRegistry";
import { HandymanEstimateOutput, MediaAnalysisResult, MediaInput, TaskParams } from "./types";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isBlank(value: unknown): boolean {
  return value === undefined || value === null || value === "";
}

function valuesConflict(a: unknown, b: unknown): boolean {
  return String(a) !== String(b);
}

/**
 * Merge user-supplied params with media inferences.
 * Rules:
 * - Media insights win on conflict (more reliable for real-world visual parameters).
 * - Media analysis fills in missing user params silently.
 * - Conflicts are surfaced as warnings in the notices suite.
 */
function reconcileParams(
  userParams: TaskParams,
  mediaResult: MediaAnalysisResult | null,
  taskParamKeys: string[]
): { reconciled: TaskParams; notices: string[] } {
  const notices: string[] = [];
  const mediaOverrides = mediaResult?.parameterOverrides ?? {};
  const reconciled: TaskParams = { ...userParams };

  for (const key of taskParamKeys) {
    const userVal = userParams[key];
    const mediaVal = mediaOverrides[key];

    if (!isBlank(userVal) && !isBlank(mediaVal) && valuesConflict(userVal, mediaVal)) {
      notices.push(
        `⚠️ Mismatch on "${key}": user said "${userVal}" but media indicates "${mediaVal}" — using verified media value.`
      );
      reconciled[key] = mediaVal;
      continue;
    }

    if (!isBlank(userVal)) {
      reconciled[key] = userVal;
      continue;
    }

    if (!isBlank(mediaVal)) {
      reconciled[key] = mediaVal;
      notices.push(`🖥️ "${key}" filled from multimodal asset analysis: ${mediaVal}`);
    }
  }

  return { reconciled, notices };
}

/**
 * Calculate overall confidence score.
 * Starts at the visual/media asset confidence, then penalizes for missing user params.
 */
function calcConfidence(
  userParams: TaskParams,
  mediaResult: MediaAnalysisResult | null,
  taskParamKeys: string[]
): number {
  const mediaConfidence = mediaResult?.confidence ?? 0.55;
  const requiredKeys = taskParamKeys.filter(k => !k.startsWith("optional"));
  const missingCount = requiredKeys.filter(k => isBlank(userParams[k])).length;
  const completenessBoost = Math.max(0, 1 - missingCount * 0.08);
  return Math.min(1, Math.max(0.35, mediaConfidence * completenessBoost));
}

// ─── Main orchestrator ────────────────────────────────────────────────────────

export async function estimateHandymanTask(
  taskId: string,
  userParams: TaskParams,
  mediaItems: MediaInput[] = []
): Promise<HandymanEstimateOutput> {

  // 1. Look up the task
  const task = getTask(taskId);
  if (!task) {
    throw new Error(`Unknown task ID: "${taskId}". Check taskRegistry.ts for valid IDs.`);
  }

  const taskParamKeys = task.params.map(p => p.key);

  // 2. Analyze media assets (supports 0 to N images/videos concurrently)
  let mediaResult: MediaAnalysisResult | null = null;

  if (mediaItems.length > 0) {
    mediaResult = await analyzeJobMedia(mediaItems, task, userParams);
  }

  // 3. Reconcile params
  const { reconciled, notices: reconcileNotices } = reconcileParams(
    userParams,
    mediaResult,
    taskParamKeys
  );

  // 4. Collect all notices
  const allNotices: string[] = [
    ...reconcileNotices,
    ...(mediaResult?.validationFlags ?? []),
    ...(mediaResult?.installerNotes ?? []),
  ];

  // 5. Confidence score
  const confidenceScore = calcConfidence(userParams, mediaResult, taskParamKeys);

  // ─── 6. Run Estimation ─────────────────────────────────────────────────────
  let estimation;

  if (task.id === "other") {
    // 🧠 Pure Semantic Route: The AI provides the ENTIRE duration estimate
    const totalAiMinutes = mediaResult?.additionalComplexityMinutes ?? 45;
    
    estimation = {
      estimatedDurationMinutes: totalAiMinutes,
      rangeMinMinutes: Math.max(15, Math.round(totalAiMinutes * 0.8)),
      rangeMaxMinutes: Math.round(totalAiMinutes * 1.2),
      confidenceScore: confidenceScore,
      breakdown: {
        ai_custom_estimate: totalAiMinutes
      },
      notices: []
    };
  } else {
    // ⚙️ Standard Route: Base + modifiers calculated through the engine
    estimation = estimateTaskTime(
      task.id,
      task.baseMinutes,
      reconciled,
      confidenceScore,
      mediaResult?.additionalComplexityMinutes ?? 0
    );
  }

  // Merge estimation notices
  allNotices.push(...estimation.notices);

  // 7. Build output matching HandymanEstimateOutput layout contracts
  return {
    taskId: task.id,
    taskLabel: task.label,

    estimatedDurationMinutes: estimation.estimatedDurationMinutes,
    rangeMinMinutes: estimation.rangeMinMinutes,
    rangeMaxMinutes: estimation.rangeMaxMinutes,
    confidenceScore: estimation.confidenceScore,

    reconciledParams: reconciled,
    notices: [...new Set(allNotices)], // deduplicate

    breakdown: estimation.breakdown,

    mediaInsights: mediaResult
      ? {
          observations: mediaResult.observations,
          installerNotes: mediaResult.installerNotes,
          additionalComplexityMinutes: mediaResult.additionalComplexityMinutes,
          inferredTaskType: mediaResult.inferredTaskType,
        }
      : undefined,
  };
}

// ─── Backward-compatible alias for legacy callers ───────────────────────────

export async function orchestrateTVInstallEstimate(
  userParams: TaskParams,
  imageBase64?: string,
  imageMediaType: "image/jpeg" | "image/png" | "image/webp" = "image/jpeg"
): Promise<HandymanEstimateOutput> {
  const mediaItems: MediaInput[] = imageBase64
    ? [{ inlineData: { data: imageBase64, mimeType: imageMediaType } }]
    : [];

  return estimateHandymanTask("tv_installation", userParams, mediaItems);
}