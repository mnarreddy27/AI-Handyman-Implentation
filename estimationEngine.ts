/**
 * estimationEngine.ts
 *
 * Pure, math-based estimation engine.
 * Each task has its own modifier table. The engine looks up the task's modifiers,
 * applies them sequentially against the reconciled params, and returns a time estimate.
 *
 * No external API calls — this is deterministic arithmetic only.
 */

import { TaskParams } from "./taskRegistry";
import { EstimationResult } from "./types";

// ─── Modifier types ──────────────────────────────────────────────────────────

interface ModifierFn {
  (params: TaskParams): number;
}

interface NoteFn {
  (params: TaskParams): string | null;
}

interface Modifier {
  key: string;
  minutes: ModifierFn;
  notice?: NoteFn;
}

// ─── Shared sub-tables ───────────────────────────────────────────────────────

const WALL_MATERIAL_MINUTES: Record<string, number> = {
  drywall: 0, plaster: 15, tile: 25, brick: 35,
  concrete: 40, unknown: 20, wood_siding: 10,
  vinyl_siding: 10, stucco: 20, concrete_block: 30,
};

function wallMaterialAdder(params: TaskParams): number {
  const mat = String(params.wallMaterial ?? "drywall");
  return WALL_MATERIAL_MINUTES[mat] ?? 15;
}

function wallMaterialNote(params: TaskParams): string | null {
  const mat = String(params.wallMaterial ?? "drywall");
  if (mat === "drywall" || mat === "unknown") return null;
  return `${mat} surface requires specialty anchors or slower drilling`;
}

function countAdder(key: string, perItemMinutes: number): ModifierFn {
  return (params) => {
    const count = Number(params[key] ?? 1);
    return Math.max(0, (count - 1)) * perItemMinutes;
  };
}

function boolAdder(key: string, minutesIfTrue: number): ModifierFn {
  return (params) => (params[key] === true || params[key] === "true" ? minutesIfTrue : 0);
}

function selectAdder(key: string, table: Record<string, number>, defaultMinutes = 0): ModifierFn {
  return (params) => {
    const val = String(params[key] ?? "");
    return table[val] ?? defaultMinutes;
  };
}

function sizeAdder(key: string, thresholds: [number, number][]): ModifierFn {
  return (params) => {
    const val = Number(params[key] ?? 0);
    for (const [threshold, minutes] of [...thresholds].reverse()) {
      if (val > threshold) return minutes;
    }
    return 0;
  };
}

// ─── Per-task modifier tables ────────────────────────────────────────────────

const TASK_MODIFIERS: Record<string, Modifier[]> = {

  // ── TV installation ────────────────────────────────────────────────────

  tv_installation: [
    { key: "wall_material",      minutes: wallMaterialAdder, notice: wallMaterialNote },
    { key: "tv_diagonal_size",   minutes: sizeAdder("tvDiagonal", [[43,0],[55,5],[65,15],[75,25],[999,40]]),
                                  notice: (p) => Number(p.tvDiagonal) >= 75 ? "Large TV — second person likely required" : null },
    { key: "tv_weight",          minutes: sizeAdder("tvWeightLbs", [[30,0],[60,10],[100,20],[999,35]]),
                                  notice: (p) => Number(p.tvWeightLbs) > 80 ? "Heavy TV — confirm two-person crew" : null },
    { key: "mount_type",         minutes: selectAdder("mountType", { fixed: 0, tilting: 10, full_motion: 25 }) },
    { key: "above_fireplace",    minutes: boolAdder("aboveFireplace", 30),
                                  notice: (p) => p.aboveFireplace ? "Above-fireplace mount requires careful heat clearance and routing" : null },
    { key: "mount_height",       minutes: sizeAdder("mountHeight", [[72,0],[84,10],[999,20]]),
                                  notice: (p) => Number(p.mountHeight) > 72 ? "High mount — ladder adds complexity" : null },
    { key: "wire_concealment",   minutes: selectAdder("wireConcealment", { none: 0, external_track: 10, in_wall: 35 }),
                                  notice: (p) => p.wireConcealment === "in_wall" ? "In-wall routing may require permit review" : null },
    { key: "outlet_position",    minutes: selectAdder("outletPosition", { behind_tv_area: 0, nearby: 8, far: 20, unknown: 5 }),
                                  notice: (p) => p.outletPosition === "far" ? "Outlet far from TV — extension or new outlet may be needed" : null },
    { key: "stud_access",        minutes: (p) => p.studAccess === false ? 20 : 0,
                                  notice: (p) => p.studAccess === false ? "No studs confirmed — toggle anchors add time" : null },
  ],

  // ── TV cord concealment ────────────────────────────────────────────────

  tv_cord_concealment: [
    { key: "cord_count",         minutes: countAdder("cordCount", 5) },
    { key: "wall_material",      minutes: wallMaterialAdder, notice: wallMaterialNote },
    { key: "concealment_method", minutes: selectAdder("concealmentMethod", { surface_raceway: 0, in_wall: 30, behind_furniture: 0 }) },
    { key: "distance",           minutes: sizeAdder("distanceToOutletInches", [[24,0],[48,10],[72,20],[999,30]]) },
  ],

  // ── Shelf installation ─────────────────────────────────────────────────

  shelf_bracket_installation: [
    { key: "shelf_count",        minutes: countAdder("shelfCount", 20) },
    { key: "wall_material",      minutes: wallMaterialAdder, notice: wallMaterialNote },
    { key: "shelf_length",       minutes: sizeAdder("shelfLengthInches", [[24,0],[48,5],[72,10],[999,15]]) },
    { key: "weight_capacity",    minutes: selectAdder("shelfWeightCapacity", { light_decor: 0, books_medium: 10, heavy_items: 20 }) },
    { key: "no_studs",          minutes: (p) => p.studAccess === false ? 15 : 0 },
    { key: "existing_hardware",  minutes: boolAdder("existingHardware", 10) },
    { key: "mount_height",       minutes: sizeAdder("mountHeight", [[72,0],[84,10],[999,20]]) },
  ],

  // ── Mirror/picture hanging ─────────────────────────────────────────────

  mirror_picture_hanging: [
    { key: "item_count",         minutes: countAdder("itemCount", 10) },
    { key: "item_type",          minutes: selectAdder("itemType", { light_frame: 0, heavy_mirror: 20, gallery_wall: 15, mixed: 10 }) },
    { key: "wall_material",      minutes: wallMaterialAdder, notice: wallMaterialNote },
    { key: "mount_height",       minutes: sizeAdder("mountHeight", [[72,0],[84,10],[999,20]]) },
    { key: "weight_heavy",       minutes: sizeAdder("heaviestItemLbs", [[15,0],[40,10],[999,20]]) },
  ],

  // ── Curtain/blind installation ─────────────────────────────────────────

  curtain_rod_blind_installation: [
    { key: "window_count",       minutes: countAdder("windowCount", 20) },
    { key: "item_type",          minutes: selectAdder("itemType", { curtain_rod: 0, roller_blind: 5, venetian_blind: 10, cellular_shade: 10, mixed: 10 }) },
    { key: "mount_type",         minutes: selectAdder("mountType", { inside_mount: 5, outside_mount: 0 }) },
    { key: "wall_material",      minutes: wallMaterialAdder, notice: wallMaterialNote },
    { key: "existing_hardware",  minutes: boolAdder("existingHardware", 5) },
  ],

  // ── Ceiling fan swap ───────────────────────────────────────────────────

  ceiling_fan_swap: [
    { key: "ceiling_height",     minutes: sizeAdder("ceilingHeightFt", [[8,0],[10,15],[999,25]]),
                                  notice: (p) => Number(p.ceilingHeightFt) > 9 ? "High ceiling — scaffolding or tall ladder required" : null },
    { key: "fan_diameter",       minutes: sizeAdder("fanBladeDiameterInches", [[42,0],[52,5],[60,10],[999,15]]) },
    { key: "replacing_existing", minutes: boolAdder("replacingExisting", 15) },
    { key: "has_remote",         minutes: boolAdder("hasRemote", 10) },
    { key: "box_type",           minutes: selectAdder("existingBoxType", { fan_rated: 0, standard_light: 20, unknown: 10 }),
                                  notice: (p) => p.existingBoxType === "standard_light" ? "Junction box may need upgrade to fan-rated brace" : null },
  ],

  // ── Smart home device ──────────────────────────────────────────────────

  smart_home_device: [
    { key: "device_type",        minutes: selectAdder("deviceType", { smart_thermostat: 0, video_doorbell: 10, smart_lock: 15, smart_switch: 5, security_camera: 20, other: 10 }) },
    { key: "replacing_existing", minutes: (p) => p.replacingExisting === false ? 20 : 0,
                                  notice: (p) => p.replacingExisting === false ? "New installation (no existing device) — wiring run may be needed" : null },
    { key: "wiring_available",   minutes: (p) => p.wiringAvailable === false ? 30 : 0,
                                  notice: (p) => p.wiringAvailable === false ? "No existing wiring — may require electrician for power run" : null },
    { key: "wall_material",      minutes: wallMaterialAdder, notice: wallMaterialNote },
  ],

  // ── Smoke/CO detector ─────────────────────────────────────────────────

  smoke_co_detector: [
    { key: "unit_count",         minutes: countAdder("unitCount", 12) },
    { key: "power_type",         minutes: selectAdder("powerType", { battery: 0, hardwired: 20, hardwired_with_battery_backup: 25 }),
                                  notice: (p) => p.powerType !== "battery" ? "Hardwired install — power must be cut during installation" : null },
    { key: "replacing_existing", minutes: boolAdder("replacingExisting", 5) },
    { key: "ceiling_mount",      minutes: (p) => p.ceilingMount === false ? 5 : 0 },
  ],

  // ── Baby/child safety ──────────────────────────────────────────────────

  baby_child_safety: [
    { key: "item_count",         minutes: countAdder("itemCount", 8) },
    { key: "item_types_complex", minutes: (p) => {
        const items = Array.isArray(p.itemTypes) ? p.itemTypes as string[] : [];
        return (items.includes("stair_gate") ? 15 : 0) +
               (items.includes("furniture_anchor") ? 5 : 0);
      },
      notice: (p) => {
        const items = Array.isArray(p.itemTypes) ? p.itemTypes as string[] : [];
        return items.includes("stair_gate") ? "Stair gates require precise measurement and stud location" : null;
      }
    },
    { key: "wall_material",      minutes: wallMaterialAdder, notice: wallMaterialNote },
  ],

  // ── Grab bar installation ──────────────────────────────────────────────

  grab_bar_safety_rail: [
    { key: "bar_count",          minutes: countAdder("barCount", 25) },
    { key: "location",           minutes: selectAdder("location", { shower: 10, toilet: 5, bathtub: 10, hallway: 0, stairs: 15 }) },
    { key: "wall_material",      minutes: wallMaterialAdder, notice: wallMaterialNote },
    { key: "no_studs",           minutes: (p) => p.studAccess === false ? 20 : 0,
                                  notice: (p) => p.studAccess === false ? "No studs — toggle bolts or blocking required for safety-rated load" : null },
  ],

  // ── Furniture assembly ─────────────────────────────────────────────────

  furniture_assembly: [
    { key: "furniture_type",     minutes: selectAdder("furnitureType", { bed_frame: 20, wardrobe: 40, desk: 10, bookcase: 15, dresser: 15, sofa: 25, dining_table: 20, other: 10 }) },
    { key: "item_count",         minutes: countAdder("itemCount", 35) },
    { key: "box_count",          minutes: countAdder("boxCount", 5) },
    { key: "no_instructions",    minutes: (p) => p.hasInstructions === false ? 20 : 0,
                                  notice: (p) => p.hasInstructions === false ? "No instructions — assembly will take longer" : null },
    { key: "room_access",        minutes: (p) => p.roomIsAccessible === false ? 20 : 0,
                                  notice: (p) => p.roomIsAccessible === false ? "Tight access — navigating stairs/hallways adds time" : null },
  ],

  // ── Outdoor furniture ──────────────────────────────────────────────────

  outdoor_furniture_assembly: [
    { key: "job_type",           minutes: selectAdder("jobType", { new_assembly: 0, repair: 10, both: 20 }) },
    { key: "furniture_type",     minutes: selectAdder("furnitureType", { table: 10, chair_set: 15, lounger: 5, swing: 25, umbrella_base: 5, other: 5 }) },
    { key: "item_count",         minutes: countAdder("itemCount", 20) },
    { key: "has_rust",           minutes: boolAdder("hasRust", 20),
                                  notice: (p) => p.hasRust ? "Rust present — penetrating oil and extra time needed" : null },
  ],

  // ── Mailbox ────────────────────────────────────────────────────────────

  mailbox_install: [
    { key: "mount_type",         minutes: selectAdder("mountType", { post_mount: 15, wall_mount: 5 }) },
    { key: "replacing_existing", minutes: boolAdder("replacingExisting", 10) },
    { key: "post_condition",     minutes: selectAdder("postCondition", { good: 0, needs_replacement: 20, no_post: 25, not_applicable: 0 }),
                                  notice: (p) => p.postCondition === "needs_replacement" ? "Post replacement adds significant time and concrete setting time" : null },
    { key: "ground_type",        minutes: selectAdder("groundType", { soil: 0, concrete: 15, asphalt: 15, unknown: 5 }) },
  ],

  // ── Exterior decor mounting ────────────────────────────────────────────

  exterior_decor_mounting: [
    { key: "item_count",         minutes: countAdder("itemCount", 8) },
    { key: "item_type",          minutes: selectAdder("itemType", { address_numbers: 5, address_plaque: 10, flag_bracket: 5, wreath_hanger: 0, light_fixture: 20, other: 5 }) },
    { key: "wall_material",      minutes: wallMaterialAdder, notice: wallMaterialNote },
  ],

  // ── Pet door ──────────────────────────────────────────────────────────

  pet_door_installation: [
    { key: "door_material",      minutes: selectAdder("doorMaterial", { hollow_core_wood: 0, solid_wood: 10, metal: 20, existing_cutout: 0 }) },
    { key: "pet_door_size",      minutes: selectAdder("petDoorSize", { small: 0, medium: 5, large: 10, extra_large: 15 }) },
    { key: "existing_cutout",    minutes: (p) => p.existingCutout === true ? -10 : 0 },
  ],

  // ── Deck staining ──────────────────────────────────────────────────────

  deck_staining: [
    { key: "surface_type",       minutes: selectAdder("surfaceType", { deck: 0, fence: 0, both: 20 }) },
    { key: "area_sq_ft",         minutes: sizeAdder("areaSqFt", [[50,0],[100,15],[200,30],[999,60]]) },
    { key: "existing_condition", minutes: selectAdder("existingCondition", { good_clean: 0, needs_light_prep: 20, peeling_heavy_prep: 45 }),
                                  notice: (p) => p.existingCondition === "peeling_heavy_prep" ? "Heavy prep (stripping/sanding) required before staining" : null },
    { key: "coat_count",         minutes: (p) => (Number(p.coatCount ?? 1) - 1) * 30 },
  ],

  // ── Garage shelving ────────────────────────────────────────────────────

  garage_shelving: [
    { key: "linear_feet",        minutes: sizeAdder("linearFeet", [[8,0],[16,15],[24,30],[999,50]]) },
    { key: "item_types",         minutes: (p) => {
        const items = Array.isArray(p.itemTypes) ? p.itemTypes as string[] : [];
        return (items.includes("overhead_storage") ? 30 : 0) + (items.length - 1) * 10;
      }
    },
    { key: "wall_material",      minutes: wallMaterialAdder, notice: wallMaterialNote },
  ],

  // ── Garage wall org ────────────────────────────────────────────────────

  garage_wall_organization: [
    { key: "system_type",        minutes: selectAdder("systemType", { track_rail: 0, slatwall: 20, cabinet: 40, mixed: 30 }) },
    { key: "wall_space",         minutes: sizeAdder("wallSpaceSqFt", [[20,0],[40,20],[80,40],[999,60]]) },
    { key: "wall_material",      minutes: wallMaterialAdder, notice: wallMaterialNote },
  ],

  // ── Closet organization ────────────────────────────────────────────────

  closet_organization: [
    { key: "closet_type",        minutes: selectAdder("closetType", { reach_in_single: 0, reach_in_double: 20, walk_in_small: 30, walk_in_large: 60 }) },
    { key: "system_type",        minutes: selectAdder("systemType", { wire_shelving: 0, wood_shelving: 15, modular_cabinet: 30, mixed: 20 }) },
    { key: "wall_material",      minutes: wallMaterialAdder, notice: wallMaterialNote },
    { key: "existing_hardware",  minutes: boolAdder("existingHardware", 15) },
  ],

  // ── Attic hatch insulation ─────────────────────────────────────────────

  attic_hatch_insulation: [
    { key: "hatch_area",         minutes: (p) => {
        const w = Number(p.hatchWidthInches ?? 22), h = Number(p.hatchHeightInches ?? 30);
        const sqFt = (w * h) / 144;
        return sqFt > 6 ? 10 : 0;
      }
    },
    { key: "existing_cover",     minutes: boolAdder("existingCover", 10) },
    { key: "access_difficulty",  minutes: selectAdder("accessDifficulty", { easy: 0, moderate_ladder: 10, difficult_tight_space: 20 }) },
  ],

  // ── Door hinge/alignment ───────────────────────────────────────────────

  door_hinge_alignment: [
    { key: "door_count",         minutes: countAdder("doorCount", 20) },
    { key: "severity",           minutes: selectAdder("issueSeverity", { minor_stick: 0, moderate_sag: 10, severe_misalignment: 25 }) },
    { key: "hinge_count",        minutes: (p) => Math.max(0, (Number(p.hingeCount ?? 3) - 3)) * 5 },
    { key: "door_type",          minutes: selectAdder("doorType", { hollow_core: 0, solid_wood: 5, exterior: 10, unknown: 0 }) },
  ],

  // ── Door/cabinet hardware ──────────────────────────────────────────────

  door_cabinet_hardware: [
    { key: "item_count",         minutes: countAdder("itemCount", 3) },
    { key: "hardware_type",      minutes: selectAdder("hardwareType", { knobs: 0, pulls: 0, hinges: 5, mixed: 3 }) },
    { key: "hole_fit",           minutes: (p) => p.existingHoleFits === false ? (Number(p.itemCount ?? 4) * 5) : 0,
                                  notice: (p) => p.existingHoleFits === false ? "New holes needed — drilling adds significant time" : null },
  ],

  // ── Door weather stripping ─────────────────────────────────────────────

  door_weatherstripping: [
    { key: "door_count",         minutes: countAdder("doorCount", 20) },
    { key: "strip_type",         minutes: selectAdder("stripType", { full_perimeter: 10, bottom_sweep_only: 0, sides_and_top: 5 }) },
    { key: "door_type",          minutes: selectAdder("doorType", { standard_exterior: 0, sliding: 15, french: 20, garage_adjacent: 5 }) },
  ],

  // ── Garage door weather stripping ─────────────────────────────────────

  garage_door_weatherstripping: [
    { key: "door_size",          minutes: selectAdder("doorType", { single_car: 0, double_car: 20 }) },
    { key: "strip_locations",    minutes: (p) => {
        const locs = Array.isArray(p.stripLocation) ? p.stripLocation as string[] : [];
        return (locs.includes("bottom_seal") ? 15 : 0) +
               (locs.includes("side_seals") ? 20 : 0) +
               (locs.includes("top_seal") ? 10 : 0) +
               (locs.includes("threshold") ? 15 : 0);
      }
    },
    { key: "existing_hardware",  minutes: boolAdder("existingHardware", 10) },
  ],

  // ── Screen door/window repair ──────────────────────────────────────────

  screen_door_repair: [
    { key: "screen_count",       minutes: countAdder("screenCount", 15) },
    { key: "screen_type",        minutes: selectAdder("screenType", { window_screen: 0, screen_door: 10, sliding_screen_door: 15 }) },
    { key: "damage_type",        minutes: selectAdder("damageType", { torn_screen_only: 0, broken_frame: 20, missing_spline: 10, full_replacement: 5 }) },
  ],

  // ── Window latch/lock ──────────────────────────────────────────────────

  window_latch_lock: [
    { key: "window_count",       minutes: countAdder("windowCount", 10) },
    { key: "window_type",        minutes: selectAdder("windowType", { single_hung: 0, double_hung: 5, casement: 10, sliding: 5, unknown: 5 }) },
    { key: "existing_hardware",  minutes: boolAdder("existingHardware", 5) },
  ],

  // ── Window weatherseal ─────────────────────────────────────────────────

  window_weatherseal: [
    { key: "window_count",       minutes: countAdder("windowCount", 12) },
    { key: "seal_type",          minutes: selectAdder("sealType", { foam_tape: 0, v_strip: 5, rope_caulk: 5, silicone_caulk: 10, full_perimeter: 15 }) },
    { key: "window_type",        minutes: selectAdder("windowType", { single_hung: 0, double_hung: 5, casement: 10, sliding: 5, unknown: 5 }) },
  ],

  // ── Faucet aerator ─────────────────────────────────────────────────────

  faucet_aerator: [
    { key: "faucet_count",       minutes: countAdder("faucetCount", 10) },
    { key: "faucet_type",        minutes: selectAdder("faucetType", { bathroom_standard: 0, kitchen_standard: 5, kitchen_pull_out: 15 }) },
    { key: "job_type",           minutes: selectAdder("jobType", { clean_only: 0, replace: 5 }) },
  ],

  // ── Showerhead replacement ─────────────────────────────────────────────

  showerhead_replacement: [
    { key: "type",               minutes: selectAdder("showerheadType", { standard_fixed: 0, handheld: 5, rain_head: 10, combo: 15 }) },
    { key: "pipe_arm",           minutes: selectAdder("pipeArmCondition", { good: 0, corroded_may_need_replacement: 20 }),
                                  notice: (p) => p.pipeArmCondition === "corroded_may_need_replacement" ? "Pipe arm may need replacement — corrosion adds risk of leak" : null },
  ],

  // ── Toilet seat ────────────────────────────────────────────────────────

  toilet_seat_replacement: [
    { key: "seat_type",          minutes: selectAdder("newSeatType", { standard: 0, slow_close: 5, bidet_seat: 20 }) },
    { key: "toilet_shape",       minutes: selectAdder("toiletShape", { round: 0, elongated: 0, unknown: 5 }) },
  ],

  // ── Toilet flapper/handle ──────────────────────────────────────────────

  toilet_flapper_handle: [
    { key: "parts",              minutes: (p) => {
        const parts = Array.isArray(p.partToReplace) ? p.partToReplace as string[] : [];
        return (parts.includes("flapper") ? 10 : 0) +
               (parts.includes("handle") ? 8 : 0) +
               (parts.includes("fill_valve") ? 20 : 0) +
               (parts.includes("flush_valve") ? 25 : 0);
      }
    },
    { key: "tank_access",        minutes: (p) => p.tankAccessible === false ? 10 : 0 },
  ],

  // ── Sink drain trap ────────────────────────────────────────────────────

  sink_drain_trap: [
    { key: "sink_type",          minutes: selectAdder("sinkType", { bathroom_single: 0, bathroom_double: 10, kitchen_single: 5, kitchen_double: 15 }) },
    { key: "trap_material",      minutes: selectAdder("trapMaterial", { pvc_plastic: 0, chrome_metal: 10, unknown: 5 }),
                                  notice: (p) => p.trapMaterial === "chrome_metal" ? "Metal traps can be stubborn — penetrating oil may be needed" : null },
    { key: "access_difficulty",  minutes: selectAdder("accessDifficulty", { open_accessible: 0, full_cabinet: 5, very_tight: 15 }) },
  ],

  // ── Garbage disposal ───────────────────────────────────────────────────

  garbage_disposal: [
    { key: "issue_type",         minutes: selectAdder("issueType", { wont_start_reset: 0, jammed_humming: 10, leaking: 15, noisy: 10 }) },
    { key: "access_difficulty",  minutes: selectAdder("accessDifficulty", { open_accessible: 0, full_cabinet: 5, very_tight: 15 }) },
  ],

  // ── Interior wall painting ─────────────────────────────────────────────

  interior_wall_painting: [
    { key: "room_type",          minutes: selectAdder("roomType", { small_bathroom: 0, bedroom: 30, living_room: 60, open_concept: 90 }) },
    { key: "wall_condition",     minutes: selectAdder("wallCondition", { good_clean: 0, needs_light_prep: 30, significant_repairs_needed: 60 }) },
    { key: "coat_count",         minutes: (p) => (Number(p.coatCount ?? 2) - 1) * 45 },
    { key: "ceiling",            minutes: boolAdder("includesCeiling", 45) },
    { key: "furniture_move",     minutes: boolAdder("furnitureToMove", 20) },
    { key: "area_sq_ft",         minutes: sizeAdder("roomSizeSqFt", [[150,0],[250,20],[400,40],[999,60]]) },
  ],

  // ── Cabinet painting ───────────────────────────────────────────────────

  cabinet_painting: [
    { key: "scope",              minutes: selectAdder("scope", { doors_and_drawers_only: 0, doors_boxes_and_frames: 45, full_including_interior: 90 }) },
    { key: "surface_condition",  minutes: selectAdder("surfaceCondition", { clean_good_condition: 0, needs_degloss_and_sand: 40, heavy_prep_needed: 80 }) },
    { key: "cabinet_count",      minutes: sizeAdder("cabinetCount", [[6,0],[12,20],[20,40],[999,60]]) },
    { key: "hardware_removal",   minutes: boolAdder("includesHardwareRemoval", 20) },
  ],

  // ── Trim/baseboard painting ────────────────────────────────────────────

  trim_baseboard_painting: [
    { key: "scope",              minutes: selectAdder("scope", { baseboards_only: 0, baseboards_and_door_casings: 20, full_room_trim: 35 }) },
    { key: "linear_feet",        minutes: sizeAdder("linearFeet", [[20,0],[50,10],[100,25],[999,40]]) },
    { key: "trim_condition",     minutes: selectAdder("trimCondition", { good: 0, needs_light_sand: 15, needs_caulk_and_fill: 30 }) },
  ],

  // ── Interior paint touch-up ────────────────────────────────────────────

  interior_paint_touchup: [
    { key: "area_count",         minutes: countAdder("areaCount", 5) },
    { key: "damage_size",        minutes: selectAdder("damageSize", { small_scuffs: 0, medium_patches: 10, large_sections: 20 }) },
    { key: "matching_paint",     minutes: (p) => p.matchingPaintAvailable === false ? 15 : 0,
                                  notice: (p) => p.matchingPaintAvailable === false ? "No matching paint on hand — color matching adds time" : null },
  ],

  // ── Drywall patching ───────────────────────────────────────────────────

  drywall_patching: [
    { key: "hole_count",         minutes: countAdder("holeCount", 5) },
    { key: "hole_size",          minutes: sizeAdder("largestHoleDiameterInches", [[1,0],[3,15],[6,30],[999,45]]) },
    { key: "texture_type",       minutes: selectAdder("textureType", { smooth: 0, orange_peel: 10, knockdown: 15, skip_trowel: 20, unknown: 10 }) },
    { key: "includes_paint",     minutes: boolAdder("includesPaint", 15) },
  ],

  // ── Caulking ──────────────────────────────────────────────────────────

  caulking: [
    { key: "linear_feet",        minutes: sizeAdder("linearFeet", [[10,0],[20,10],[40,20],[999,35]]) },
    { key: "locations",          minutes: (p) => {
        const locs = Array.isArray(p.location) ? p.location as string[] : [];
        return (locs.length - 1) * 10;
      }
    },
    { key: "existing_condition", minutes: selectAdder("existingCondition", { clean_removal: 0, moldy_needs_treatment: 20, partial_missing: 5 }),
                                  notice: (p) => p.existingCondition === "moldy_needs_treatment" ? "Mold treatment required before recaulking — adds significant time" : null },
  ],

  // ── Grout touch-up ─────────────────────────────────────────────────────

  grout_touchup: [
    { key: "area_sq_ft",         minutes: sizeAdder("areaSqFt", [[5,0],[15,15],[30,30],[999,50]]) },
    { key: "condition",          minutes: selectAdder("condition", { stained_cosmetic: 0, cracked_partial: 20, missing_sections: 35 }) },
    { key: "location",           minutes: selectAdder("tileLocation", { bathroom_floor: 0, shower_walls: 15, kitchen_backsplash: 5, other: 5 }) },
  ],

  // ── Baseboard/trim repair ──────────────────────────────────────────────

  baseboard_trim_repair: [
    { key: "linear_feet",        minutes: sizeAdder("linearFeet", [[5,0],[15,10],[30,20],[999,35]]) },
    { key: "damage_type",        minutes: selectAdder("damageType", { loose_reattach: 0, gaps_caulk_fill: 5, broken_replace_section: 20, mixed: 15 }) },
  ],

  // ── Minor carpentry ────────────────────────────────────────────────────

  minor_carpentry: [
    { key: "job_type",           minutes: selectAdder("jobType", { trim_cut_and_install: 0, wood_filler_repair: 0, corner_cap: 5, mixed: 10 }) },
    { key: "complexity",         minutes: selectAdder("complexity", { simple_straight_cuts: 0, compound_angles: 20, custom_fitting: 35 }) },
  ],

  // ── Squeaky floor ──────────────────────────────────────────────────────

  squeaky_floor: [
    { key: "squeak_count",       minutes: countAdder("squeakCount", 8) },
    { key: "floor_type",         minutes: selectAdder("floorType", { hardwood: 0, carpet: 15, lvp_laminate: 10, other: 10 }) },
    { key: "basement_access",    minutes: (p) => p.basementAccess === true ? -10 : 0,
                                  notice: (p) => p.basementAccess === true ? "Sub-floor access speeds up screw placement" : null },
  ],

  // ── Tile re-grouting ───────────────────────────────────────────────────

  tile_regrouting: [
    { key: "area_sq_ft",         minutes: sizeAdder("areaSqFt", [[10,0],[25,20],[50,40],[999,70]]) },
    { key: "grout_line_width",   minutes: selectAdder("groutLineWidth", { narrow_under_1_8in: 10, standard_1_8_to_1_4in: 0, wide_over_1_4in: 0 }) },
    { key: "existing_condition", minutes: selectAdder("existingCondition", { cosmetic_staining: 0, cracked_sections: 20, needs_full_removal: 40 }) },
  ],

  // ── Deck board tightening ──────────────────────────────────────────────

  deck_board_tightening: [
    { key: "deck_area",          minutes: sizeAdder("deckAreaSqFt", [[50,0],[100,15],[200,30],[999,50]]) },
    { key: "board_condition",    minutes: selectAdder("boardCondition", { good_just_loose: 0, warped_some_boards: 20, rot_present: 0 }),
                                  notice: (p) => p.boardCondition === "rot_present" ? "Rot detected — board replacement may be needed (out of scope for tightening)" : null },
  ],

  // ── Cabinet repair ─────────────────────────────────────────────────────

  cabinet_repair: [
    { key: "door_count",         minutes: countAdder("doorCount", 8) },
    { key: "issue_types",        minutes: (p) => {
        const issues = Array.isArray(p.issueType) ? p.issueType as string[] : [];
        return (issues.includes("stripped_screw_holes") ? 15 : 0) +
               (issues.includes("misaligned_doors") ? 10 : 0) +
               (issues.includes("door_wont_close") ? 8 : 0);
      }
    },
  ],

  // ── Other (fully AI-driven) ────────────────────────────────────────────

  other: [
    { key: "complexity",
      minutes: selectAdder("estimatedComplexity", { simple_quick: 0, moderate: 20, complex_specialized: 45 }),
      notice: (p) => p.estimatedComplexity === "complex_specialized" ? "Complex/specialized task — confirm technician skill set before dispatch" : null },
    { key: "wall_material", minutes: wallMaterialAdder, notice: wallMaterialNote },
  ],
};

// ─── Confidence → buffer ─────────────────────────────────────────────────────

function confidenceBuffer(score: number): number {
  if (score >= 0.8) return 0.15;
  if (score >= 0.6) return 0.25;
  return 0.4;
}

// ─── Main estimator ──────────────────────────────────────────────────────────

export function estimateTaskTime(
  taskId: string,
  baseMinutes: number,
  params: TaskParams,
  confidenceScore = 0.75,
  additionalComplexityMinutes = 0
): EstimationResult {
  const modifiers = TASK_MODIFIERS[taskId] ?? [];
  const breakdown: Record<string, number> = {};
  const notices: string[] = [];

  // Always start with the task's base time
  breakdown["base_time"] = baseMinutes;

  for (const modifier of modifiers) {
    const added = modifier.minutes(params);
    if (added !== 0) {
      breakdown[modifier.key] = added;
    }
    const note = modifier.notice?.(params);
    if (note) notices.push(note);
  }

  // Image-detected complexity
  if (additionalComplexityMinutes > 0) {
    breakdown["image_detected_complexity"] = additionalComplexityMinutes;
  }

  const estimatedDurationMinutes = Object.values(breakdown).reduce((a, b) => a + b, 0);
  const buffer = confidenceBuffer(confidenceScore);

  return {
    estimatedDurationMinutes: Math.max(5, estimatedDurationMinutes),
    rangeMinMinutes: Math.max(5, Math.round(estimatedDurationMinutes * (1 - buffer / 2))),
    rangeMaxMinutes: Math.round(estimatedDurationMinutes * (1 + buffer)),
    confidenceScore,
    breakdown,
    notices,
  };
}