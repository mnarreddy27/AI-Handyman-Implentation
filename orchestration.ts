import { analyzeInstallImage } from "./imageAnalysis";
import { estimateInstallTime } from "./estimationEngine";
import {
  CompiledInstallParams,
  ImageAnalysisResult,
  TVInstallEstimateOutput,
  TVInstallParams,
} from "./types";

type MediaType = "image/jpeg" | "image/png" | "image/webp";

const DEFAULT_PARAMS: TVInstallParams = {
  tvWidth: 48,
  tvHeight: 28,
  tvDepth: 2.5,
  tvDiagonal: 55,
  wallMaterial: "drywall",
  mountType: "fixed",
  mountHeight: 60,
  aboveFireplace: false,
  wireConcealment: "none",
};

const TV_PARAM_KEYS: (keyof TVInstallParams)[] = [
  "tvWidth",
  "tvHeight",
  "tvDepth",
  "tvDiagonal",
  "wallMaterial",
  "mountType",
  "mountHeight",
  "aboveFireplace",
  "wireConcealment",
];

function isBlank<T>(value: T | undefined | null): value is undefined | null {
  return value === undefined || value === null;
}

function valuesConflict<T>(left: T, right: T): boolean {
  return left !== right;
}

function inferImageOverrides(image: ImageAnalysisResult): Partial<TVInstallParams> {
  const inferred: Partial<TVInstallParams> = { ...image.parameterOverrides };

  if (isBlank(inferred.wallMaterial) && image.wallType !== "unknown") {
    inferred.wallMaterial = image.wallType;
  }

  if (isBlank(inferred.aboveFireplace)) {
    inferred.aboveFireplace = image.aboveFireplace;
  }

  if (isBlank(inferred.mountHeight) && image.estimatedMountHeight != null) {
    inferred.mountHeight = image.estimatedMountHeight;
  }

  return inferred;
}

function reconcileInstallParams(
  userInput: Partial<TVInstallParams>,
  image: ImageAnalysisResult | null
): { params: CompiledInstallParams; notices: string[]; confidenceScore: number } {
  const notices: string[] = [];
  const imageOverrides = image ? inferImageOverrides(image) : {};
  const reconciled: Partial<TVInstallParams> = { ...userInput };

  for (const key of TV_PARAM_KEYS) {
    const userValue = userInput[key];
    const imageValue = imageOverrides[key];

    if (!isBlank(userValue) && !isBlank(imageValue) && valuesConflict(userValue, imageValue)) {
      notices.push(
        `Using your ${key} value (${String(userValue)}) over AI suggestion (${String(imageValue)}).`
      );
      reconciled[key] = userValue;
      continue;
    }

    if (!isBlank(userValue)) {
      reconciled[key] = userValue;
      continue;
    }

    if (!isBlank(imageValue)) {
      reconciled[key] = imageValue;
      notices.push(`Filled missing ${key} from photo analysis.`);
      continue;
    }
  }

  const finalTvParams: TVInstallParams = {
    tvWidth: reconciled.tvWidth ?? DEFAULT_PARAMS.tvWidth,
    tvHeight: reconciled.tvHeight ?? DEFAULT_PARAMS.tvHeight,
    tvDepth: reconciled.tvDepth ?? DEFAULT_PARAMS.tvDepth,
    tvDiagonal: reconciled.tvDiagonal ?? DEFAULT_PARAMS.tvDiagonal,
    wallMaterial: reconciled.wallMaterial ?? DEFAULT_PARAMS.wallMaterial,
    mountType: reconciled.mountType ?? DEFAULT_PARAMS.mountType,
    mountHeight: reconciled.mountHeight ?? DEFAULT_PARAMS.mountHeight,
    aboveFireplace: reconciled.aboveFireplace ?? DEFAULT_PARAMS.aboveFireplace,
    wireConcealment: reconciled.wireConcealment ?? DEFAULT_PARAMS.wireConcealment,
  };

  const compiled: CompiledInstallParams = {
    ...finalTvParams,
    existingMount: image?.existingMount ?? false,
    outletPosition: image?.outletPosition ?? "unknown",
    obstaclesDetected: image?.obstaclesDetected ?? [],
  };

  if (image) {
    notices.push(...image.validationFlags);

    if (!image.outletVisible) {
      notices.push("No outlet visible in photo — verify power location on site.");
    }
  }

  const missingUserFields = TV_PARAM_KEYS.filter((key) => isBlank(userInput[key])).length;
  const imageConfidence = image?.confidence ?? 0.55;
  const completenessBoost = Math.max(0, 1 - missingUserFields * 0.08);
  const confidenceScore = Math.min(1, Math.max(0.35, imageConfidence * completenessBoost));

  return { params: compiled, notices, confidenceScore };
}

/**
 * Orchestrates image analysis (when provided), parameter reconciliation, and estimation.
 */
export async function orchestrateTVInstallEstimate(
  userInput: Partial<TVInstallParams>,
  imageBase64?: string,
  imageMediaType: MediaType = "image/jpeg"
): Promise<TVInstallEstimateOutput> {
  let imageResult: ImageAnalysisResult | null = null;

  if (imageBase64) {
    imageResult = await analyzeInstallImage(imageBase64, imageMediaType, userInput);
  }

  const { params, notices, confidenceScore } = reconcileInstallParams(userInput, imageResult);
  const estimation = estimateInstallTime(params, confidenceScore);

  const { tvWidth, tvHeight, tvDepth, tvDiagonal, wallMaterial, mountType, mountHeight, aboveFireplace, wireConcealment } =
    params;

  return {
    estimatedDurationMinutes: estimation.estimatedDurationMinutes,
    rangeMinMinutes: estimation.rangeMinMinutes,
    rangeMaxMinutes: estimation.rangeMaxMinutes,
    confidenceScore: estimation.confidenceScore,
    reconciledParams: {
      tvWidth,
      tvHeight,
      tvDepth,
      tvDiagonal,
      wallMaterial,
      mountType,
      mountHeight,
      aboveFireplace,
      wireConcealment,
    },
    notices: [...notices, ...estimation.notices],
    breakdown: estimation.breakdown,
  };
}

/** Backward-compatible alias for callers expecting the previous orchestrator name. */
export const runTVInstallEstimate = orchestrateTVInstallEstimate;
