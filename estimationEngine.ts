// estimationEngine.ts
//Parameter Types + Estimation Engine

export interface TVInstallParams {
  // TV
  screenSizeInches: number;       // diagonal
  weightLbs: number;
  mountType: "fixed" | "tilt" | "full_motion";
  
  // Wall
  wallMaterial: "drywall" | "brick" | "concrete" | "tile" | "plaster";
  studsAvailable: boolean | null;
  existingMount: boolean;
  
  // Environment
  mountHeight: number;            // inches from floor
  aboveFireplace: boolean;
  roomType: "living_room" | "bedroom" | "outdoor" | "commercial";
  
  // Wiring
  outletPosition: "behind_tv_area" | "nearby" | "far";
  inWallCableRouting: boolean;
  cableSurfaceRaceway: boolean;
  
  // Access
  furnitureToMove: boolean;
  ladderRequired: boolean;
  obstacles: string[];
}

export interface EstimationResult {
  estimatedMinutes: number;
  rangeMin: number;
  rangeMax: number;
  confidenceLevel: "high" | "medium" | "low";
  breakdown: Record<string, number>;  // task → minutes
  flags: string[];                    // warnings for the installer
  imageValidationNotes: string[];
}

// ─── Base times (minutes) ────────────────────────────────────────────────────

const BASE_INSTALL_TIME = 45; // standard drywall, fixed mount, easy access

const WALL_MATERIAL_ADDERS: Record<string, number> = {
  drywall:   0,
  plaster:  15,
  tile:     25,
  brick:    35,
  concrete: 40,
};

const MOUNT_TYPE_ADDERS: Record<string, number> = {
  fixed:       0,
  tilt:       10,
  full_motion: 25,
};

function tvSizeAdder(inches: number): number {
  if (inches <= 43) return 0;
  if (inches <= 55) return 5;
  if (inches <= 65) return 15;
  if (inches <= 75) return 25;
  return 40; // 85"+
}

function tvWeightAdder(lbs: number): number {
  if (lbs <= 30) return 0;
  if (lbs <= 60) return 10;
  if (lbs <= 100) return 20;
  return 35;
}

// ─── Main estimator ──────────────────────────────────────────────────────────

export function estimateInstallTime(
  params: TVInstallParams,
  imageResult: ImageAnalysisResult | null
): EstimationResult {
  
  // Merge image inferences into params (image overrides if confidence is high)
  const merged = { ...params };
  if (imageResult && imageResult.confidence >= 0.75) {
    Object.assign(merged, imageResult.parameterOverrides);
  }

  const breakdown: Record<string, number> = {};
  const flags: string[] = [];

  // Base
  breakdown["base_install"] = BASE_INSTALL_TIME;

  // Wall material
  breakdown["wall_material"] = WALL_MATERIAL_ADDERS[merged.wallMaterial] ?? 20;
  if (merged.wallMaterial !== "drywall") {
    flags.push(`${merged.wallMaterial} wall requires specialty anchors and drilling`);
  }

  // No studs → toggle anchors needed
  if (merged.studsAvailable === false) {
    breakdown["toggle_anchors"] = 20;
    flags.push("No studs found — toggle/masonry anchors add time");
  }

  // Mount type
  breakdown["mount_type"] = MOUNT_TYPE_ADDERS[merged.mountType];

  // TV size & weight
  breakdown["tv_size"] = tvSizeAdder(merged.screenSizeInches);
  breakdown["tv_weight"] = tvWeightAdder(merged.weightLbs);
  if (merged.weightLbs > 80) flags.push("Heavy TV — second person may be required");

  // Above fireplace
  if (merged.aboveFireplace) {
    breakdown["fireplace_mount"] = 30;
    flags.push("Above-fireplace mounts require special cable routing and positioning");
  }

  // Cable management
  if (merged.inWallCableRouting) {
    breakdown["in_wall_wiring"] = 35;
    flags.push("In-wall cable routing adds significant time and may need permit check");
  } else if (merged.cableSurfaceRaceway) {
    breakdown["raceway"] = 10;
  }

  // Outlet distance
  if (merged.outletPosition === "far") {
    breakdown["outlet_extension"] = 20;
    flags.push("Outlet not near TV location — extension or new outlet may be needed");
  } else if (merged.outletPosition === "nearby") {
    breakdown["outlet_routing"] = 8;
  }

  // Access & environment
  if (merged.furnitureToMove) breakdown["furniture_move"] = 15;
  if (merged.ladderRequired)   breakdown["ladder_setup"] = 10;
  if (merged.existingMount)    breakdown["remove_old_mount"] = 15;
  if (merged.mountHeight > 72) {
    breakdown["high_mount_adj"] = 10;
    flags.push("High mount (>6ft) — ladder positioning adds complexity");
  }

  // Obstacles
  if (merged.obstacles.includes("crown_molding")) {
    breakdown["crown_molding"] = 10;
  }
  if (merged.obstacles.includes("built_in_shelving")) {
    breakdown["built_in_nav"] = 15;
    flags.push("Built-in shelving detected — routing cables will require extra care");
  }

  const total = Object.values(breakdown).reduce((a, b) => a + b, 0);

  // Confidence: lower if image had low confidence or params were missing
  const missingParams = [params.wallMaterial, params.weightLbs, params.mountType]
    .filter(v => v == null).length;
  
  let confidenceLevel: "high" | "medium" | "low" = "high";
  if (missingParams >= 2 || (imageResult && imageResult.confidence < 0.6)) {
    confidenceLevel = "low";
  } else if (missingParams === 1 || (imageResult && imageResult.confidence < 0.8)) {
    confidenceLevel = "medium";
  }

  const buffer = confidenceLevel === "high" ? 0.15
               : confidenceLevel === "medium" ? 0.25 : 0.4;

  return {
    estimatedMinutes: total,
    rangeMin: Math.round(total * (1 - buffer / 2)),
    rangeMax: Math.round(total * (1 + buffer)),
    confidenceLevel,
    breakdown,
    flags,
    imageValidationNotes: imageResult?.validationFlags ?? []
  };
}
