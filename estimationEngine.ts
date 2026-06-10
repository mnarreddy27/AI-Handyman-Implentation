import { CompiledInstallParams, EstimationResult } from "./types";

const BASE_INSTALL_MINUTES = 45;

const WALL_MATERIAL_MINUTES: Record<CompiledInstallParams["wallMaterial"], number> = {
  drywall: 0,
  plaster: 15,
  tile: 25,
  brick: 35,
  concrete: 40,
  unknown: 20,
};

const MOUNT_TYPE_MINUTES: Record<CompiledInstallParams["mountType"], number> = {
  fixed: 0,
  tilting: 10,
  full_motion: 25,
};

const WIRE_CONCEALMENT_MINUTES: Record<CompiledInstallParams["wireConcealment"], number> = {
  none: 0,
  external_track: 10,
  in_wall: 35,
};

const OUTLET_POSITION_MINUTES: Record<CompiledInstallParams["outletPosition"], number> = {
  behind_tv_area: 0,
  nearby: 8,
  far: 20,
  unknown: 5,
};

interface SequentialModifier {
  key: string;
  minutes: (params: CompiledInstallParams) => number;
  notice?: (params: CompiledInstallParams) => string | null;
}

function tvDiagonalMinutes(diagonal: number): number {
  if (diagonal <= 43) return 0;
  if (diagonal <= 55) return 5;
  if (diagonal <= 65) return 15;
  if (diagonal <= 75) return 25;
  return 40;
}

function tvDepthMinutes(depth: number): number {
  if (depth <= 2) return 0;
  if (depth <= 3.5) return 5;
  return 10;
}

function mountHeightMinutes(height: number): number {
  if (height <= 72) return 0;
  if (height <= 84) return 10;
  return 20;
}

function obstacleMinutes(obstacles: string[]): number {
  let total = 0;

  for (const obstacle of obstacles) {
    const normalized = obstacle.toLowerCase();

    if (normalized.includes("crown") || normalized.includes("molding")) {
      total += 10;
    } else if (normalized.includes("shelf") || normalized.includes("built-in")) {
      total += 15;
    } else if (normalized.includes("fireplace") || normalized.includes("mantel")) {
      total += 10;
    } else if (normalized.includes("window") || normalized.includes("curtain")) {
      total += 8;
    } else {
      total += 5;
    }
  }

  return total;
}

/**
 * Sequential modifier matrix: each step adds minutes on top of the running total.
 * Order matters — base time first, then wall, size, mount, environment, wiring, access.
 */
const MODIFIER_SEQUENCE: SequentialModifier[] = [
  {
    key: "base_install",
    minutes: () => BASE_INSTALL_MINUTES,
  },
  {
    key: "wall_material",
    minutes: (params) => WALL_MATERIAL_MINUTES[params.wallMaterial],
    notice: (params) =>
      params.wallMaterial === "drywall"
        ? null
        : `${params.wallMaterial} wall requires specialty anchors and slower drilling`,
  },
  {
    key: "tv_diagonal",
    minutes: (params) => tvDiagonalMinutes(params.tvDiagonal),
    notice: (params) =>
      params.tvDiagonal >= 75 ? "Large TV — second person may be required" : null,
  },
  {
    key: "tv_depth",
    minutes: (params) => tvDepthMinutes(params.tvDepth),
  },
  {
    key: "mount_type",
    minutes: (params) => MOUNT_TYPE_MINUTES[params.mountType],
  },
  {
    key: "above_fireplace",
    minutes: (params) => (params.aboveFireplace ? 30 : 0),
    notice: (params) =>
      params.aboveFireplace
        ? "Above-fireplace mounts require careful heat clearance and cable routing"
        : null,
  },
  {
    key: "mount_height",
    minutes: (params) => mountHeightMinutes(params.mountHeight),
    notice: (params) =>
      params.mountHeight > 72 ? "High mount — ladder positioning adds complexity" : null,
  },
  {
    key: "wire_concealment",
    minutes: (params) => WIRE_CONCEALMENT_MINUTES[params.wireConcealment],
    notice: (params) =>
      params.wireConcealment === "in_wall"
        ? "In-wall cable routing adds significant time and may need permit review"
        : null,
  },
  {
    key: "outlet_position",
    minutes: (params) => OUTLET_POSITION_MINUTES[params.outletPosition],
    notice: (params) =>
      params.outletPosition === "far"
        ? "Outlet is far from the TV location — extension or new outlet may be needed"
        : null,
  },
  {
    key: "existing_mount_removal",
    minutes: (params) => (params.existingMount ? 15 : 0),
    notice: (params) =>
      params.existingMount ? "Existing mount must be removed before installation" : null,
  },
  {
    key: "site_obstacles",
    minutes: (params) => obstacleMinutes(params.obstaclesDetected),
    notice: (params) =>
      params.obstaclesDetected.length > 0
        ? `Obstacles detected: ${params.obstaclesDetected.join(", ")}`
        : null,
  },
];

function confidenceBuffer(score: number): number {
  if (score >= 0.8) return 0.15;
  if (score >= 0.6) return 0.25;
  return 0.4;
}

/**
 * Pure, math-based install time estimator.
 * Applies modifiers sequentially; no side effects or external API calls.
 */
export function estimateInstallTime(
  params: CompiledInstallParams,
  confidenceScore = 0.75
): EstimationResult {
  const breakdown: Record<string, number> = {};
  const notices: string[] = [];

  for (const modifier of MODIFIER_SEQUENCE) {
    const addedMinutes = modifier.minutes(params);
    breakdown[modifier.key] = addedMinutes;

    const notice = modifier.notice?.(params);
    if (notice) {
      notices.push(notice);
    }
  }

  const estimatedDurationMinutes = Object.values(breakdown).reduce(
    (total, minutes) => total + minutes,
    0
  );

  const buffer = confidenceBuffer(confidenceScore);

  return {
    estimatedDurationMinutes,
    rangeMinMinutes: Math.round(estimatedDurationMinutes * (1 - buffer / 2)),
    rangeMaxMinutes: Math.round(estimatedDurationMinutes * (1 + buffer)),
    confidenceScore,
    breakdown,
    notices,
  };
}
