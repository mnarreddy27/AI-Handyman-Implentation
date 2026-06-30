/**
 * orchestration.ts
 *
 * Orchestrates the full estimation pipeline for any handyman task:
 * 1. Validate the task ID against the registry
 * 2. Analyze job site media files (unlimited pictures, videos, or mixed)
 * 3. Reconcile user context and media observations
 * 4. Run the estimation engine (or handle dynamic pure-AI estimation for 'other')
 * 5. Return the unified output
 */

import { analyzeJobMedia } from "./imageAnalysis";
import { estimateTaskTime } from "./estimationEngine";
import { getTask } from "./taskRegistry";
import { HandymanEstimateOutput, MediaAnalysisResult, MediaInput, TaskParams } from "./types";

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Calculate overall confidence score based directly on media asset analysis.
 */
function calcConfidence(mediaResult: MediaAnalysisResult | null): number {
  const mediaConfidence = mediaResult?.confidence ?? 0.55;
  return Math.min(1, Math.max(0.35, mediaConfidence));
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

  // 2. Analyze media assets (supports 0 to N images/videos concurrently)
  let mediaResult: MediaAnalysisResult | null = null;

  if (mediaItems.length > 0) {
    mediaResult = await analyzeJobMedia(mediaItems, task, userParams);
  }

  // 3. Collect all descriptive notices
  const allNotices: string[] = [
    ...(mediaResult?.validationFlags ?? []),
    ...(mediaResult?.installerNotes ?? []),
  ];

  // 4. Determine confidence score
  const confidenceScore = calcConfidence(mediaResult);

  // ─── 5. Run Estimation ─────────────────────────────────────────────────────
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
      userParams,
      confidenceScore,
      mediaResult?.additionalComplexityMinutes ?? 0
    );
  }

  // Merge estimation engine tracking notices
  allNotices.push(...estimation.notices);

  // 6. Build unified output matching workspace layout contracts
  return {
    taskId: task.id,
    taskLabel: task.label,

    estimatedDurationMinutes: estimation.estimatedDurationMinutes,
    rangeMinMinutes: estimation.rangeMinMinutes,
    rangeMaxMinutes: estimation.rangeMaxMinutes,
    confidenceScore: estimation.confidenceScore,

    reconciledParams: userParams,
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