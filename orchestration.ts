/**
 * orchestration.ts
 *
 * Orchestrates the full estimation pipeline for any handyman task:
 * 1. Validate the task ID against the registry
 * 2. Send media and/or text to Gemini for analysis and time estimation
 * 3. Reconcile user context with AI-inferred parameter overrides
 * 4. Return the unified output
 *
 * All time estimates come from Gemini — no math-based estimation engine.
 */

import { estimateJobWithGemini } from "./imageAnalysis";
import { getTask } from "./taskRegistry";
import { HandymanEstimateOutput, MediaInput, TaskParams } from "./types";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getUserNotes(params: TaskParams): string | undefined {
  const notes = params.notes;
  return typeof notes === "string" && notes.trim().length > 0 ? notes.trim() : undefined;
}

function reconcileParams(
  userParams: TaskParams,
  overrides: TaskParams | undefined
): TaskParams {
  const reconciled: TaskParams = { ...userParams };
  if (!overrides) return reconciled;

  for (const [key, value] of Object.entries(overrides)) {
    if (reconciled[key] === undefined) {
      reconciled[key] = value;
    }
  }

  return reconciled;
}

function buildRange(totalMinutes: number, confidenceScore: number) {
  const buffer = confidenceScore >= 0.8 ? 0.15 : confidenceScore >= 0.6 ? 0.25 : 0.4;
  return {
    rangeMinMinutes: Math.max(15, Math.round(totalMinutes * (1 - buffer / 2))),
    rangeMaxMinutes: Math.round(totalMinutes * (1 + buffer)),
  };
}

// ─── Main orchestrator ────────────────────────────────────────────────────────

export async function estimateHandymanTask(
  taskId: string,
  userParams: TaskParams,
  mediaItems: MediaInput[] = []
): Promise<HandymanEstimateOutput> {
  const task = getTask(taskId);
  if (!task) {
    throw new Error(`Unknown task ID: "${taskId}". Check taskRegistry.ts for valid IDs.`);
  }

  const hasMedia = mediaItems.length > 0;
  const hasNotes = Boolean(getUserNotes(userParams));

  if (!hasMedia && !hasNotes) {
    throw new Error(
      `Task "${taskId}" requires at least one photo/video or descriptive notes for Gemini to estimate.`
    );
  }

  const geminiResult = await estimateJobWithGemini(task, userParams, mediaItems);
  const reconciledParams = reconcileParams(userParams, geminiResult.parameterOverrides);

  const totalMinutes = geminiResult.estimatedDurationMinutes;
  const confidenceScore = Math.min(1, Math.max(0.35, geminiResult.confidence));
  const { rangeMinMinutes, rangeMaxMinutes } = buildRange(totalMinutes, confidenceScore);

  const allNotices: string[] = [
    ...geminiResult.validationFlags,
    ...geminiResult.installerNotes,
  ];

  return {
    taskId: task.id,
    taskLabel: task.label,

    estimatedDurationMinutes: totalMinutes,
    rangeMinMinutes,
    rangeMaxMinutes,
    confidenceScore,

    reconciledParams,
    notices: Array.from(new Set(allNotices)),

    breakdown: { ai_total_estimate: totalMinutes },

    mediaInsights: hasMedia
      ? {
          observations: geminiResult.observations,
          installerNotes: geminiResult.installerNotes,
          estimatedDurationMinutes: geminiResult.estimatedDurationMinutes,
          inferredTaskType: geminiResult.inferredTaskType || task.label,
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
