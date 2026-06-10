// tvInstallEstimator.ts
//Main Orchestrator
import { analyzeInstallImage } from "./imageAnalysis";
import { estimateInstallTime, TVInstallParams, EstimationResult } from "./estimationEngine";

export async function runTVInstallEstimate(
  params: Partial<TVInstallParams>,
  imageBase64?: string,
  imageMediaType: "image/jpeg" | "image/png" | "image/webp" = "image/jpeg"
): Promise<EstimationResult> {

  let imageResult = null;

  if (imageBase64) {
    console.log("Analyzing installation photo...");
    imageResult = await analyzeInstallImage(imageBase64, imageMediaType, params);
    
    // Fill missing params from image if confident
    if (imageResult.confidence >= 0.75) {
      params = { ...params, ...imageResult.parameterOverrides };
    }
  }

  // Apply safe defaults for anything still missing
  const finalParams: TVInstallParams = {
    screenSizeInches:    params.screenSizeInches    ?? 55,
    weightLbs:           params.weightLbs           ?? 35,
    mountType:           params.mountType           ?? "fixed",
    wallMaterial:        params.wallMaterial        ?? "drywall",
    studsAvailable:      params.studsAvailable      ?? true,
    existingMount:       params.existingMount       ?? false,
    mountHeight:         params.mountHeight         ?? 60,
    aboveFireplace:      params.aboveFireplace      ?? false,
    roomType:            params.roomType            ?? "living_room",
    outletPosition:      params.outletPosition      ?? "nearby",
    inWallCableRouting:  params.inWallCableRouting  ?? false,
    cableSurfaceRaceway: params.cableSurfaceRaceway ?? false,
    furnitureToMove:     params.furnitureToMove     ?? false,
    ladderRequired:      params.ladderRequired      ?? false,
    obstacles:           params.obstacles           ?? [],
  };

  return estimateInstallTime(finalParams, imageResult);
}
