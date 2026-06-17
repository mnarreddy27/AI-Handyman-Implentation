/**
 * orchestration.ts
 *
 * Orchestrates the full estimation pipeline for any handyman task:
 *   1. Validate the task ID against the registry
 *   2. Analyze job site photos (one or many)
 *   3. Reconcile user params + image inferences (image wins on conflict)
 *   4. Run the estimation engine
 *   5. Return the unified output
 */

import { analyzeJobPhotos, PhotoInput } from "./imageAnalysis";
import { estimateTaskTime } from "./estimationEngine";
import { getTask } from "./taskRegistry";
import { TaskParams } from "./taskRegistry";
import { HandymanEstimateOutput, ImageAnalysisResult } from "./types";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isBlank(value: unknown): boolean {
  return value === undefined || value === null || value === "";
}

function valuesConflict(a: unknown, b: unknown): boolean {
  return String(a) !== String(b);
}

/**
 * Merge user-supplied params with image inferences.
 * Rules:
 *   - Image wins on conflict (more reliable for visual properties).
 *   - Image fills in missing user params silently.
 *   - Conflicts are surfaced as notices.
 */
function reconcileParams(
  userParams: TaskParams,
  imageResult: ImageAnalysisResult | null,
  taskParamKeys: string[]
): { reconciled: TaskParams; notices: string[] } {
  const notices: string[] = [];
  const imageOverrides = imageResult?.parameterOverrides ?? {};
  const reconciled: TaskParams = { ...userParams };

  for (const key of taskParamKeys) {
    const userVal = userParams[key];
    const imageVal = imageOverrides[key];

    if (!isBlank(userVal) && !isBlank(imageVal) && valuesConflict(userVal, imageVal)) {
      notices.push(
        `⚠️ Mismatch on "${key}": user said "${userVal}" but photo indicates "${imageVal}" — using photo value.`
      );
      reconciled[key] = imageVal;
      continue;
    }

    if (!isBlank(userVal)) {
      reconciled[key] = userVal;
      continue;
    }

    if (!isBlank(imageVal)) {
      reconciled[key] = imageVal;
      notices.push(`📷 "${key}" filled from photo analysis: ${imageVal}`);
    }
  }

  return { reconciled, notices };
}

/**
 * Calculate overall confidence score.
 * Starts at the image confidence, then penalizes for missing user params.
 */
function calcConfidence(
  userParams: TaskParams,
  imageResult: ImageAnalysisResult | null,
  taskParamKeys: string[]
): number {
  const imageConfidence = imageResult?.confidence ?? 0.55;
  const requiredKeys = taskParamKeys.filter(k => !k.startsWith("optional"));
  const missingCount = requiredKeys.filter(k => isBlank(userParams[k])).length;
  const completenessBoost = Math.max(0, 1 - missingCount * 0.08);
  return Math.min(1, Math.max(0.35, imageConfidence * completenessBoost));
}

// ─── Main orchestrator ────────────────────────────────────────────────────────

export async function estimateHandymanTask(
  taskId: string,
  userParams: TaskParams,
  photos: PhotoInput[] = []
): Promise<HandymanEstimateOutput> {

  // 1. Look up the task
  const task = getTask(taskId);
  if (!task) {
    throw new Error(`Unknown task ID: "${taskId}". Check taskRegistry.ts for valid IDs.`);
  }

  const taskParamKeys = task.params.map(p => p.key);

  // 2. Analyze photos (supports 0 to N images)
  let imageResult: ImageAnalysisResult | null = null;

  if (photos.length > 0) {
    imageResult = await analyzeJobPhotos(photos, task, userParams);
  }

  // 3. Reconcile params
  const { reconciled, notices: reconcileNotices } = reconcileParams(
    userParams,
    imageResult,
    taskParamKeys
  );

  // 4. Collect all notices
  const allNotices: string[] = [
    ...reconcileNotices,
    ...(imageResult?.validationFlags ?? []),
    ...(imageResult?.installerNotes ?? []),
  ];

  // 5. Confidence score
  const confidenceScore = calcConfidence(userParams, imageResult, taskParamKeys);

  // 6. Run estimation
  const estimation = estimateTaskTime(
    task.id,
    task.baseMinutes,
    reconciled,
    confidenceScore,
    imageResult?.additionalComplexityMinutes ?? 0
  );

  // Merge estimation notices
  allNotices.push(...estimation.notices);

  // 7. Build output
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

    imageInsights: imageResult
      ? {
          observations: imageResult.observations,
          installerNotes: imageResult.installerNotes,
          additionalComplexityMinutes: imageResult.additionalComplexityMinutes,
          inferredTaskType: imageResult.inferredTaskType,
        }
      : undefined,
  };
}

// ─── Backward-compatible alias for TV-specific callers ────────────────────────

export async function orchestrateTVInstallEstimate(
  userParams: TaskParams,
  imageBase64?: string,
  imageMediaType: PhotoInput["mediaType"] = "image/jpeg"
): Promise<HandymanEstimateOutput> {
  const photos: PhotoInput[] = imageBase64
    ? [{ base64: imageBase64, mediaType: imageMediaType }]
    : [];

  return estimateHandymanTask("tv_installation", userParams, photos);
}