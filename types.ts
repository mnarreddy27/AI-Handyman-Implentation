export interface TVInstallParams {
  tvWidth: number;
  tvHeight: number;
  tvDepth: number;
  tvDiagonal: number;
  wallMaterial: "drywall" | "brick" | "concrete" | "tile" | "plaster" | "unknown";
  mountType: "fixed" | "tilting" | "full_motion";
  mountHeight: number;
  aboveFireplace: boolean;
  wireConcealment: "none" | "external_track" | "in_wall";
}

export interface ImageAnalysisResult {
  wallType: "drywall" | "brick" | "concrete" | "tile" | "plaster" | "unknown";
  outletVisible: boolean;
  outletPosition: "behind_tv_area" | "nearby" | "far" | "unknown";
  obstaclesDetected: string[];
  existingMount: boolean;
  aboveFireplace: boolean;
  estimatedMountHeight: number | null;
  confidence: number;
  parameterOverrides: Partial<TVInstallParams>;
  validationFlags: string[];
}

export interface FinalEstimateResponse {
  estimatedDurationMinutes: number;
  confidenceScore: number;
  reconciledParams: TVInstallParams;
  notices: string[];
}

/** Resolved parameters used by the estimation engine after orchestration reconciliation. */
export interface CompiledInstallParams extends TVInstallParams {
  existingMount: boolean;
  outletPosition: ImageAnalysisResult["outletPosition"];
  obstaclesDetected: string[];
}

export interface EstimationResult {
  estimatedDurationMinutes: number;
  rangeMinMinutes: number;
  rangeMaxMinutes: number;
  confidenceScore: number;
  breakdown: Record<string, number>;
  notices: string[];
}

export interface TVInstallEstimateOutput extends FinalEstimateResponse {
  rangeMinMinutes: number;
  rangeMaxMinutes: number;
  breakdown: Record<string, number>;
}
