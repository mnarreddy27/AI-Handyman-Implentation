/**
 * taskRegistry.ts
 *
 * Central registry for every supported handyman task.
 * Each entry defines:
 *   - id:          unique snake_case identifier
 *   - label:       display name shown in the app
 *   - category:    grouping for the UI
 *   - baseMinutes: baseline time before any modifiers
 *   - params:      parameter schema the frontend renders as a form
 *   - imageHints:  what the AI should look for in photos for this task
 */

export type ParamType =
  | "number"
  | "boolean"
  | "select"
  | "multiselect"
  | "text";

export interface ParamDefinition {
  key: string;
  label: string;
  type: ParamType;
  options?: string[];          // for select / multiselect
  unit?: string;               // e.g. "inches", "lbs"
  optional?: boolean;          // if true, image can fill this in
  defaultValue?: string | number | boolean;
}

export interface TaskDefinition {
  id: string;
  label: string;
  category: TaskCategory;
  baseMinutes: number;
  params: ParamDefinition[];
  imageHints: string;          // injected into the AI prompt
}

export type TaskCategory =
  | "mounting"
  | "assembly"
  | "smart_home"
  | "safety"
  | "outdoor"
  | "doors_windows"
  | "plumbing"
  | "painting"
  | "repairs"
  | "storage"
  | "other";

// ─── Shared param building blocks ──────────────────────────────────────────

const WALL_MATERIAL_PARAM: ParamDefinition = {
  key: "wallMaterial",
  label: "Wall material",
  type: "select",
  options: ["drywall", "brick", "concrete", "tile", "plaster", "unknown"],
  optional: true,
  defaultValue: "drywall",
};

const MOUNT_HEIGHT_PARAM: ParamDefinition = {
  key: "mountHeight",
  label: "Mount height from floor (inches)",
  type: "number",
  unit: "inches",
  optional: true,
  defaultValue: 60,
};

const EXISTING_HARDWARE_PARAM: ParamDefinition = {
  key: "existingHardware",
  label: "Removing existing hardware first?",
  type: "boolean",
  defaultValue: false,
};

const STUD_ACCESS_PARAM: ParamDefinition = {
  key: "studAccess",
  label: "Stud finder available / studs located?",
  type: "boolean",
  defaultValue: true,
};

// ─── Task Registry ──────────────────────────────────────────────────────────

export const TASK_REGISTRY: TaskDefinition[] = [

  // ── TV & Mounting ──────────────────────────────────────────────────────

  {
    id: "tv_installation",
    label: "TV installation",
    category: "mounting",
    baseMinutes: 45,
    imageHints: `Look for: wall material, existing mount brackets, outlet location relative to the TV area,
fireplace presence below the intended mount spot, obstacles like crown molding or built-in shelving,
estimated mount height. Infer TV size if visible.`,
    params: [
      { key: "tvDiagonal", label: "TV screen size (diagonal inches)", type: "number", unit: "inches", optional: true },
      { key: "tvWidth", label: "TV width (inches)", type: "number", unit: "inches", optional: true },
      { key: "tvHeight", label: "TV height (inches)", type: "number", unit: "inches", optional: true },
      { key: "tvDepth", label: "TV depth (inches)", type: "number", unit: "inches", optional: true },
      { key: "tvWeightLbs", label: "TV weight (lbs)", type: "number", unit: "lbs", optional: true },
      { key: "mountType", label: "Mount type", type: "select", options: ["fixed", "tilting", "full_motion"], defaultValue: "fixed" },
      WALL_MATERIAL_PARAM,
      MOUNT_HEIGHT_PARAM,
      { key: "aboveFireplace", label: "Mounting above a fireplace?", type: "boolean", defaultValue: false },
      { key: "wireConcealment", label: "Wire concealment", type: "select", options: ["none", "external_track", "in_wall"], defaultValue: "none" },
      { key: "outletPosition", label: "Outlet position", type: "select", options: ["behind_tv_area", "nearby", "far", "unknown"], optional: true },
    ],
  },

  {
    id: "tv_cord_concealment",
    label: "TV cord concealment",
    category: "mounting",
    baseMinutes: 35,
    imageHints: `Look for: number of visible cords/cables, wall material, distance from TV to outlet,
existing raceways or conduit, baseboard proximity.`,
    params: [
      { key: "cordCount", label: "Number of cords to hide", type: "number", defaultValue: 3 },
      { key: "concealmentMethod", label: "Concealment method", type: "select", options: ["surface_raceway", "in_wall", "behind_furniture"] },
      WALL_MATERIAL_PARAM,
      { key: "distanceToOutletInches", label: "Distance from TV to outlet (inches)", type: "number", unit: "inches", optional: true },
    ],
  },

  {
    id: "shelf_bracket_installation",
    label: "Shelf and bracket installation",
    category: "mounting",
    baseMinutes: 30,
    imageHints: `Look for: wall material, stud locations, existing shelf hardware, shelf length,
number of brackets visible or needed, obstacles like tile backsplash.`,
    params: [
      { key: "shelfCount", label: "Number of shelves", type: "number", defaultValue: 1 },
      { key: "shelfLengthInches", label: "Shelf length (inches)", type: "number", unit: "inches", optional: true },
      { key: "shelfWeightCapacity", label: "Expected load", type: "select", options: ["light_decor", "books_medium", "heavy_items"] },
      WALL_MATERIAL_PARAM,
      MOUNT_HEIGHT_PARAM,
      STUD_ACCESS_PARAM,
      EXISTING_HARDWARE_PARAM,
    ],
  },

  {
    id: "mirror_picture_hanging",
    label: "Mirror and picture hanging",
    category: "mounting",
    baseMinutes: 20,
    imageHints: `Look for: wall material, existing holes or picture rail, number of pieces to hang,
heavy mirror vs. light framed art, level/plumb reference points available.`,
    params: [
      { key: "itemCount", label: "Number of items to hang", type: "number", defaultValue: 1 },
      { key: "itemType", label: "Item type", type: "select", options: ["light_frame", "heavy_mirror", "gallery_wall", "mixed"] },
      { key: "heaviestItemLbs", label: "Heaviest item weight (lbs)", type: "number", unit: "lbs", optional: true },
      WALL_MATERIAL_PARAM,
      MOUNT_HEIGHT_PARAM,
      STUD_ACCESS_PARAM,
    ],
  },

  {
    id: "curtain_rod_blind_installation",
    label: "Curtain rod and blind installation",
    category: "mounting",
    baseMinutes: 35,
    imageHints: `Look for: window count, wall/frame material around window, existing hardware or holes,
inside vs. outside mount, blind type (roller, venetian, cellular).`,
    params: [
      { key: "windowCount", label: "Number of windows", type: "number", defaultValue: 1 },
      { key: "itemType", label: "Type", type: "select", options: ["curtain_rod", "roller_blind", "venetian_blind", "cellular_shade", "mixed"] },
      { key: "mountType", label: "Mount type", type: "select", options: ["inside_mount", "outside_mount"] },
      { key: "wallMaterial", label: "Wall/frame material", type: "select", options: ["drywall", "wood_trim", "concrete", "tile", "unknown"], optional: true },
      EXISTING_HARDWARE_PARAM,
    ],
  },

  // ── Smart Home & Safety ────────────────────────────────────────────────

  {
    id: "smart_home_device",
    label: "Smart home device install (Nest, Ring, etc.)",
    category: "smart_home",
    baseMinutes: 30,
    imageHints: `Look for: existing device being replaced, junction box or wiring visible, doorbell chime unit,
thermostat wiring, Wi-Fi router distance, mounting surface material.`,
    params: [
      { key: "deviceType", label: "Device type", type: "select", options: ["smart_thermostat", "video_doorbell", "smart_lock", "smart_switch", "security_camera", "other"] },
      { key: "replacingExisting", label: "Replacing an existing device?", type: "boolean", defaultValue: true },
      { key: "wiringAvailable", label: "Existing wiring available?", type: "boolean", defaultValue: true },
      WALL_MATERIAL_PARAM,
    ],
  },

  {
    id: "smoke_co_detector",
    label: "Smoke and CO detector install",
    category: "safety",
    baseMinutes: 15,
    imageHints: `Look for: ceiling vs. wall mount location, existing detector or knockout, wiring visible (hardwired vs. battery),
number of units to install.`,
    params: [
      { key: "unitCount", label: "Number of detectors", type: "number", defaultValue: 1 },
      { key: "powerType", label: "Power type", type: "select", options: ["battery", "hardwired", "hardwired_with_battery_backup"] },
      { key: "replacingExisting", label: "Replacing existing units?", type: "boolean", defaultValue: false },
      { key: "ceilingMount", label: "Ceiling mount (vs. wall)?", type: "boolean", defaultValue: true },
    ],
  },

  {
    id: "baby_child_safety",
    label: "Baby and child safety hardware",
    category: "safety",
    baseMinutes: 20,
    imageHints: `Look for: staircase presence, banister type, wall material at gate location,
furniture that needs anchoring, cabinet hardware, existing safety devices.`,
    params: [
      { key: "itemTypes", label: "Items to install", type: "multiselect", options: ["stair_gate", "furniture_anchor", "cabinet_locks", "outlet_covers", "door_knob_covers", "corner_guards"] },
      { key: "itemCount", label: "Total number of items", type: "number", defaultValue: 1 },
      WALL_MATERIAL_PARAM,
    ],
  },

  {
    id: "grab_bar_safety_rail",
    label: "Safety rail or grab bar install",
    category: "safety",
    baseMinutes: 35,
    imageHints: `Look for: bathroom tile or drywall, stud locations, existing bars or blocking,
toilet or shower proximity, floor type for floor-mounted rails.`,
    params: [
      { key: "barCount", label: "Number of bars/rails", type: "number", defaultValue: 1 },
      { key: "location", label: "Location", type: "select", options: ["shower", "toilet", "bathtub", "hallway", "stairs"] },
      WALL_MATERIAL_PARAM,
      STUD_ACCESS_PARAM,
    ],
  },

  // ── Assembly ───────────────────────────────────────────────────────────

  {
    id: "furniture_assembly",
    label: "Furniture assembly",
    category: "assembly",
    baseMinutes: 50,
    imageHints: `Look for: flat-pack boxes and their approximate size, furniture type (bed frame, desk, wardrobe),
room space available for assembly, existing furniture to navigate around, number of boxes.`,
    params: [
      { key: "furnitureType", label: "Furniture type", type: "select", options: ["bed_frame", "wardrobe", "desk", "bookcase", "dresser", "sofa", "dining_table", "other"] },
      { key: "itemCount", label: "Number of pieces", type: "number", defaultValue: 1 },
      { key: "boxCount", label: "Number of boxes", type: "number", optional: true },
      { key: "hasInstructions", label: "Instructions included?", type: "boolean", defaultValue: true },
      { key: "roomIsAccessible", label: "Easy room access (no tight stairs/hallways)?", type: "boolean", defaultValue: true },
    ],
  },

  {
    id: "outdoor_furniture_assembly",
    label: "Outdoor furniture assembly or repair",
    category: "outdoor",
    baseMinutes: 35,
    imageHints: `Look for: outdoor furniture type, rust or corrosion, missing hardware, deck or patio surface,
tools available, number of pieces.`,
    params: [
      { key: "jobType", label: "Job type", type: "select", options: ["new_assembly", "repair", "both"] },
      { key: "furnitureType", label: "Furniture type", type: "select", options: ["table", "chair_set", "lounger", "swing", "umbrella_base", "other"] },
      { key: "itemCount", label: "Number of pieces", type: "number", defaultValue: 1 },
      { key: "hasRust", label: "Rust or significant wear present?", type: "boolean", defaultValue: false },
    ],
  },

  // ── Outdoor & Exterior ─────────────────────────────────────────────────

  {
    id: "mailbox_install",
    label: "Mailbox install or replacement",
    category: "outdoor",
    baseMinutes: 30,
    imageHints: `Look for: existing post condition, ground type (soil, concrete), post-mount vs. wall-mount,
distance from curb, existing mounting hardware.`,
    params: [
      { key: "mountType", label: "Mount type", type: "select", options: ["post_mount", "wall_mount"] },
      { key: "replacingExisting", label: "Replacing existing mailbox?", type: "boolean", defaultValue: true },
      { key: "postCondition", label: "Existing post condition", type: "select", options: ["good", "needs_replacement", "no_post", "not_applicable"], optional: true },
      { key: "groundType", label: "Ground type", type: "select", options: ["soil", "concrete", "asphalt", "unknown"], optional: true },
    ],
  },

  {
    id: "exterior_decor_mounting",
    label: "Exterior decor and address plaque mounting",
    category: "outdoor",
    baseMinutes: 20,
    imageHints: `Look for: exterior wall material (brick, stucco, wood siding, vinyl), existing holes,
item to be mounted (address numbers, wreath hanger, flag bracket, plaque).`,
    params: [
      { key: "itemType", label: "Item type", type: "select", options: ["address_numbers", "address_plaque", "flag_bracket", "wreath_hanger", "light_fixture", "other"] },
      { key: "itemCount", label: "Number of items", type: "number", defaultValue: 1 },
      { key: "wallMaterial", label: "Exterior wall material", type: "select", options: ["brick", "stucco", "wood_siding", "vinyl_siding", "concrete", "unknown"], optional: true },
    ],
  },

  {
    id: "pet_door_installation",
    label: "Pet door installation (pre-cut only)",
    category: "outdoor",
    baseMinutes: 60,
    imageHints: `Look for: door material (hollow-core, solid wood, glass, wall panel), existing cutout,
pet door size relative to door, door thickness.`,
    params: [
      { key: "doorMaterial", label: "Door/panel material", type: "select", options: ["hollow_core_wood", "solid_wood", "metal", "existing_cutout"], optional: true },
      { key: "petDoorSize", label: "Pet door size", type: "select", options: ["small", "medium", "large", "extra_large"] },
      { key: "existingCutout", label: "Pre-cut opening already exists?", type: "boolean", defaultValue: false },
    ],
  },

  {
    id: "deck_staining",
    label: "Fence or deck staining (small section)",
    category: "outdoor",
    baseMinutes: 45,
    imageHints: `Look for: deck or fence size, existing stain condition, wood type, surface preparation needed,
peeling or cracking, obstacles around the area.`,
    params: [
      { key: "surfaceType", label: "Surface type", type: "select", options: ["deck", "fence", "both"] },
      { key: "areaSqFt", label: "Approximate area (sq ft)", type: "number", unit: "sq ft", optional: true },
      { key: "existingCondition", label: "Existing surface condition", type: "select", options: ["good_clean", "needs_light_prep", "peeling_heavy_prep"] },
      { key: "coatCount", label: "Number of coats", type: "number", defaultValue: 1 },
    ],
  },

  {
    id: "garage_shelving",
    label: "Garage shelving and pegboard install",
    category: "storage",
    baseMinutes: 45,
    imageHints: `Look for: wall material (drywall, concrete block, wood stud), wall space available,
existing shelving or pegboard, ceiling height, floor obstructions.`,
    params: [
      { key: "itemTypes", label: "Items to install", type: "multiselect", options: ["wall_shelving", "freestanding_shelving", "pegboard", "overhead_storage"] },
      { key: "linearFeet", label: "Approximate linear feet of shelving", type: "number", unit: "ft", optional: true },
      { key: "wallMaterial", label: "Garage wall material", type: "select", options: ["drywall", "concrete_block", "wood_stud", "unknown"], optional: true },
    ],
  },

  {
    id: "garage_wall_organization",
    label: "Garage wall organization system",
    category: "storage",
    baseMinutes: 60,
    imageHints: `Look for: wall material, wall space, existing hooks or rails, number of wall panels or tracks visible,
tool storage, sports equipment presence.`,
    params: [
      { key: "systemType", label: "System type", type: "select", options: ["track_rail", "slatwall", "cabinet", "mixed"] },
      { key: "wallSpaceSqFt", label: "Wall space (sq ft)", type: "number", unit: "sq ft", optional: true },
      { key: "wallMaterial", label: "Garage wall material", type: "select", options: ["drywall", "concrete_block", "wood_stud", "unknown"], optional: true },
    ],
  },

  {
    id: "closet_organization",
    label: "Closet organization system assembly",
    category: "storage",
    baseMinutes: 90,
    imageHints: `Look for: closet type (reach-in, walk-in), existing rod and shelf, wall material,
closet dimensions, number of hanging sections.`,
    params: [
      { key: "closetType", label: "Closet type", type: "select", options: ["reach_in_single", "reach_in_double", "walk_in_small", "walk_in_large"] },
      { key: "systemType", label: "System type", type: "select", options: ["wire_shelving", "wood_shelving", "modular_cabinet", "mixed"] },
      WALL_MATERIAL_PARAM,
      EXISTING_HARDWARE_PARAM,
    ],
  },

  {
    id: "attic_hatch_insulation",
    label: "Attic hatch insulation cover install",
    category: "repairs",
    baseMinutes: 35,
    imageHints: `Look for: hatch size, existing cover or insulation, hatch location in ceiling or wall,
clearance around hatch, access difficulty.`,
    params: [
      { key: "hatchWidthInches", label: "Hatch width (inches)", type: "number", unit: "inches", optional: true },
      { key: "hatchHeightInches", label: "Hatch height (inches)", type: "number", unit: "inches", optional: true },
      { key: "existingCover", label: "Existing cover to remove?", type: "boolean", defaultValue: false },
      { key: "accessDifficulty", label: "Access difficulty", type: "select", options: ["easy", "moderate_ladder", "difficult_tight_space"] },
    ],
  },

  // ── Doors & Windows ────────────────────────────────────────────────────

  {
    id: "ceiling_fan_swap",
    label: "Ceiling fan swap (existing wiring only)",
    category: "mounting",
    baseMinutes: 60,
    imageHints: `Look for: existing ceiling fan or light fixture, junction box type (standard vs. fan-rated),
ceiling height, fan blade span, remote vs. wall switch wiring.`,
    params: [
      { key: "replacingExisting", label: "Replacing existing fan or fixture?", type: "boolean", defaultValue: true },
      { key: "ceilingHeightFt", label: "Ceiling height (ft)", type: "number", unit: "ft", optional: true },
      { key: "fanBladeDiameterInches", label: "New fan blade diameter (inches)", type: "number", unit: "inches", optional: true },
      { key: "hasRemote", label: "Fan includes remote kit?", type: "boolean", defaultValue: false },
      { key: "existingBoxType", label: "Existing junction box type", type: "select", options: ["fan_rated", "standard_light", "unknown"], optional: true },
    ],
  },

  {
    id: "door_hinge_alignment",
    label: "Door hinge and alignment fix",
    category: "doors_windows",
    baseMinutes: 25,
    imageHints: `Look for: door sag direction, hinge condition, gap between door and frame,
paint buildup on hinges, number of hinges, door type (hollow vs. solid).`,
    params: [
      { key: "doorCount", label: "Number of doors", type: "number", defaultValue: 1 },
      { key: "issueSeverity", label: "Issue severity", type: "select", options: ["minor_stick", "moderate_sag", "severe_misalignment"] },
      { key: "hingeCount", label: "Number of hinges per door", type: "number", defaultValue: 3, optional: true },
      { key: "doorType", label: "Door type", type: "select", options: ["hollow_core", "solid_wood", "exterior", "unknown"], optional: true },
    ],
  },

  {
    id: "door_cabinet_hardware",
    label: "Door or cabinet hardware swap",
    category: "doors_windows",
    baseMinutes: 15,
    imageHints: `Look for: number of doors/drawers, existing hardware condition, hole pattern (single vs. dual hole),
knob vs. pull, furniture finish.`,
    params: [
      { key: "itemCount", label: "Number of knobs/pulls to swap", type: "number", defaultValue: 4 },
      { key: "hardwareType", label: "Hardware type", type: "select", options: ["knobs", "pulls", "hinges", "mixed"] },
      { key: "existingHoleFits", label: "Existing holes fit new hardware?", type: "boolean", defaultValue: true },
    ],
  },

  {
    id: "door_weatherstripping",
    label: "Door weather stripping replacement",
    category: "doors_windows",
    baseMinutes: 30,
    imageHints: `Look for: door condition, existing weatherstrip damage, door perimeter (top, sides, bottom sweep),
door type (interior vs. exterior), gap size visible.`,
    params: [
      { key: "doorCount", label: "Number of doors", type: "number", defaultValue: 1 },
      { key: "stripType", label: "Strip type", type: "select", options: ["full_perimeter", "bottom_sweep_only", "sides_and_top"] },
      { key: "doorType", label: "Door type", type: "select", options: ["standard_exterior", "sliding", "french", "garage_adjacent"] },
    ],
  },

  {
    id: "garage_door_weatherstripping",
    label: "Garage door weather stripping",
    category: "doors_windows",
    baseMinutes: 35,
    imageHints: `Look for: garage door type (single vs. double), condition of existing seal bottom and sides,
side seal tracks, gaps in seal, door material.`,
    params: [
      { key: "doorType", label: "Garage door size", type: "select", options: ["single_car", "double_car"] },
      { key: "stripLocation", label: "Strip location(s)", type: "multiselect", options: ["bottom_seal", "side_seals", "top_seal", "threshold"] },
      EXISTING_HARDWARE_PARAM,
    ],
  },

  {
    id: "screen_door_repair",
    label: "Screen door or window screen repair",
    category: "doors_windows",
    baseMinutes: 25,
    imageHints: `Look for: screen size, damage type (torn screen, broken frame, missing spline),
screen door vs. window screen, frame material (aluminum vs. wood), number of screens.`,
    params: [
      { key: "screenCount", label: "Number of screens", type: "number", defaultValue: 1 },
      { key: "screenType", label: "Screen type", type: "select", options: ["window_screen", "screen_door", "sliding_screen_door"] },
      { key: "damageType", label: "Damage type", type: "select", options: ["torn_screen_only", "broken_frame", "missing_spline", "full_replacement"], optional: true },
    ],
  },

  {
    id: "window_latch_lock",
    label: "Window latch or lock replacement",
    category: "doors_windows",
    baseMinutes: 20,
    imageHints: `Look for: window type (single/double hung, casement, sliding), existing latch condition,
paint buildup, number of windows, hardware finish.`,
    params: [
      { key: "windowCount", label: "Number of windows", type: "number", defaultValue: 1 },
      { key: "windowType", label: "Window type", type: "select", options: ["single_hung", "double_hung", "casement", "sliding", "unknown"], optional: true },
      EXISTING_HARDWARE_PARAM,
    ],
  },

  {
    id: "window_weatherseal",
    label: "Window weatherseal replacement",
    category: "doors_windows",
    baseMinutes: 25,
    imageHints: `Look for: window condition, existing seal deterioration, number of windows, window type,
draft gaps visible, caulk condition.`,
    params: [
      { key: "windowCount", label: "Number of windows", type: "number", defaultValue: 1 },
      { key: "sealType", label: "Seal type", type: "select", options: ["foam_tape", "v_strip", "rope_caulk", "silicone_caulk", "full_perimeter"] },
      { key: "windowType", label: "Window type", type: "select", options: ["single_hung", "double_hung", "casement", "sliding", "unknown"], optional: true },
    ],
  },

  // ── Plumbing ───────────────────────────────────────────────────────────

  {
    id: "faucet_aerator",
    label: "Faucet aerator cleaning or replacement",
    category: "plumbing",
    baseMinutes: 15,
    imageHints: `Look for: faucet type (kitchen vs. bathroom), aerator condition (mineral buildup, damage),
under-sink access, shutoff valve location.`,
    params: [
      { key: "faucetCount", label: "Number of faucets", type: "number", defaultValue: 1 },
      { key: "faucetType", label: "Faucet type", type: "select", options: ["bathroom_standard", "kitchen_standard", "kitchen_pull_out"] },
      { key: "jobType", label: "Job type", type: "select", options: ["clean_only", "replace"] },
    ],
  },

  {
    id: "showerhead_replacement",
    label: "Showerhead replacement",
    category: "plumbing",
    baseMinutes: 20,
    imageHints: `Look for: existing showerhead type, pipe arm condition (corrosion, mineral buildup),
accessibility in shower stall, water pressure indication.`,
    params: [
      { key: "showerheadType", label: "New showerhead type", type: "select", options: ["standard_fixed", "handheld", "rain_head", "combo"] },
      { key: "pipeArmCondition", label: "Pipe arm condition", type: "select", options: ["good", "corroded_may_need_replacement"], optional: true },
    ],
  },

  {
    id: "toilet_seat_replacement",
    label: "Toilet seat replacement",
    category: "plumbing",
    baseMinutes: 15,
    imageHints: `Look for: toilet shape (round vs. elongated), seat condition, bolt access under tank,
existing seat style (standard, slow-close, bidet).`,
    params: [
      { key: "toiletShape", label: "Toilet shape", type: "select", options: ["round", "elongated", "unknown"], optional: true },
      { key: "newSeatType", label: "New seat type", type: "select", options: ["standard", "slow_close", "bidet_seat"] },
    ],
  },

  {
    id: "toilet_flapper_handle",
    label: "Toilet flapper or handle replacement",
    category: "plumbing",
    baseMinutes: 20,
    imageHints: `Look for: toilet tank access, existing flapper condition, running water signs,
handle mechanism, flapper size.`,
    params: [
      { key: "partToReplace", label: "Parts to replace", type: "multiselect", options: ["flapper", "handle", "fill_valve", "flush_valve"] },
      { key: "tankAccessible", label: "Tank lid easily removable?", type: "boolean", defaultValue: true },
    ],
  },

  {
    id: "sink_drain_trap",
    label: "Sink drain trap cleaning",
    category: "plumbing",
    baseMinutes: 35,
    imageHints: `Look for: under-sink space accessibility, trap type (P-trap vs. S-trap), PVC vs. metal trap,
water damage or corrosion, bucket space for water.`,
    params: [
      { key: "sinkType", label: "Sink type", type: "select", options: ["bathroom_single", "bathroom_double", "kitchen_single", "kitchen_double"] },
      { key: "trapMaterial", label: "Trap material", type: "select", options: ["pvc_plastic", "chrome_metal", "unknown"], optional: true },
      { key: "accessDifficulty", label: "Under-sink access", type: "select", options: ["open_accessible", "full_cabinet", "very_tight"] },
    ],
  },

  {
    id: "garbage_disposal",
    label: "Garbage disposal reset or minor fix",
    category: "plumbing",
    baseMinutes: 20,
    imageHints: `Look for: disposal unit brand/model, reset button location, visible jams or leaks,
under-sink space, dishwasher connection present.`,
    params: [
      { key: "issueType", label: "Issue type", type: "select", options: ["wont_start_reset", "jammed_humming", "leaking", "noisy"] },
      { key: "accessDifficulty", label: "Under-sink access", type: "select", options: ["open_accessible", "full_cabinet", "very_tight"] },
    ],
  },

  // ── Painting ───────────────────────────────────────────────────────────

  {
    id: "interior_wall_painting",
    label: "Interior wall painting (single room)",
    category: "painting",
    baseMinutes: 90,
    imageHints: `Look for: room size, wall condition (cracks, holes, old paint), ceiling height,
number of doors and windows, furniture present, wall color contrast.`,
    params: [
      { key: "roomSizeSqFt", label: "Room size (sq ft)", type: "number", unit: "sq ft", optional: true },
      { key: "roomType", label: "Room type", type: "select", options: ["small_bathroom", "bedroom", "living_room", "open_concept"] },
      { key: "wallCondition", label: "Wall condition", type: "select", options: ["good_clean", "needs_light_prep", "significant_repairs_needed"] },
      { key: "coatCount", label: "Number of coats", type: "number", defaultValue: 2 },
      { key: "includesCeiling", label: "Painting ceiling too?", type: "boolean", defaultValue: false },
      { key: "furnitureToMove", label: "Furniture to move?", type: "boolean", defaultValue: true },
    ],
  },

  {
    id: "cabinet_painting",
    label: "Cabinet painting or refinishing",
    category: "painting",
    baseMinutes: 240,
    imageHints: `Look for: number of cabinet doors, cabinet condition, grease or grime buildup,
existing paint or stain, hardware removal needed, kitchen vs. bathroom cabinets.`,
    params: [
      { key: "cabinetCount", label: "Number of cabinet doors/drawers", type: "number", optional: true },
      { key: "scope", label: "Scope", type: "select", options: ["doors_and_drawers_only", "doors_boxes_and_frames", "full_including_interior"] },
      { key: "surfaceCondition", label: "Surface condition", type: "select", options: ["clean_good_condition", "needs_degloss_and_sand", "heavy_prep_needed"] },
      { key: "includesHardwareRemoval", label: "Remove and reinstall hardware?", type: "boolean", defaultValue: true },
    ],
  },

  {
    id: "trim_baseboard_painting",
    label: "Trim and baseboard painting",
    category: "painting",
    baseMinutes: 40,
    imageHints: `Look for: linear feet of trim, trim condition, tape needed, existing color contrast,
doorways and window casings included.`,
    params: [
      { key: "linearFeet", label: "Linear feet of trim", type: "number", unit: "ft", optional: true },
      { key: "scope", label: "Scope", type: "select", options: ["baseboards_only", "baseboards_and_door_casings", "full_room_trim"] },
      { key: "trimCondition", label: "Trim condition", type: "select", options: ["good", "needs_light_sand", "needs_caulk_and_fill"] },
    ],
  },

  {
    id: "interior_paint_touchup",
    label: "Interior paint touch-up",
    category: "painting",
    baseMinutes: 20,
    imageHints: `Look for: scuff or damage size and count, wall color, touch-up area accessibility,
matching paint available (cans visible).`,
    params: [
      { key: "areaCount", label: "Number of areas to touch up", type: "number", defaultValue: 3 },
      { key: "damageSize", label: "Typical damage size", type: "select", options: ["small_scuffs", "medium_patches", "large_sections"] },
      { key: "matchingPaintAvailable", label: "Matching paint on hand?", type: "boolean", defaultValue: true },
    ],
  },

  // ── Repairs ────────────────────────────────────────────────────────────

  {
    id: "drywall_patching",
    label: "Drywall patching (nail holes, small dings)",
    category: "repairs",
    baseMinutes: 25,
    imageHints: `Look for: hole count and sizes, drywall damage extent, texture type (smooth, orange peel, knockdown),
existing paint color, location height.`,
    params: [
      { key: "holeCount", label: "Number of holes/areas", type: "number", defaultValue: 5 },
      { key: "largestHoleDiameterInches", label: "Largest hole diameter (inches)", type: "number", unit: "inches", optional: true },
      { key: "textureType", label: "Wall texture", type: "select", options: ["smooth", "orange_peel", "knockdown", "skip_trowel", "unknown"], optional: true },
      { key: "includesPaint", label: "Paint touch-up included?", type: "boolean", defaultValue: false },
    ],
  },

  {
    id: "caulking",
    label: "Caulking (tubs, sinks, windows)",
    category: "repairs",
    baseMinutes: 25,
    imageHints: `Look for: existing caulk condition (cracked, moldy, missing), surface type (tub surround, window frame, sink),
linear feet to caulk, mold presence.`,
    params: [
      { key: "location", label: "Location(s)", type: "multiselect", options: ["tub_surround", "shower", "kitchen_sink", "bathroom_sink", "windows", "baseboards"] },
      { key: "linearFeet", label: "Approximate linear feet", type: "number", unit: "ft", optional: true },
      { key: "existingCondition", label: "Existing caulk condition", type: "select", options: ["clean_removal", "moldy_needs_treatment", "partial_missing"] },
    ],
  },

  {
    id: "grout_touchup",
    label: "Grout touch-up (cosmetic)",
    category: "repairs",
    baseMinutes: 35,
    imageHints: `Look for: grout condition (cracked, stained, missing), tile type and size, area size,
grout color matching challenges, mold or mildew.`,
    params: [
      { key: "areaSqFt", label: "Area to regrout (sq ft)", type: "number", unit: "sq ft", optional: true },
      { key: "condition", label: "Grout condition", type: "select", options: ["stained_cosmetic", "cracked_partial", "missing_sections"] },
      { key: "tileLocation", label: "Location", type: "select", options: ["bathroom_floor", "shower_walls", "kitchen_backsplash", "other"] },
    ],
  },

  {
    id: "baseboard_trim_repair",
    label: "Baseboard and trim repair or reattachment",
    category: "repairs",
    baseMinutes: 30,
    imageHints: `Look for: loose or detached trim sections, gaps at wall or floor, paint condition,
nail holes, length of affected trim.`,
    params: [
      { key: "linearFeet", label: "Linear feet of trim affected", type: "number", unit: "ft", optional: true },
      { key: "damageType", label: "Damage type", type: "select", options: ["loose_reattach", "gaps_caulk_fill", "broken_replace_section", "mixed"] },
    ],
  },

  {
    id: "minor_carpentry",
    label: "Minor carpentry (trim cuts, wood filler)",
    category: "repairs",
    baseMinutes: 35,
    imageHints: `Look for: damaged wood sections, gaps, trim mismatches, tool access, wood type and finish.`,
    params: [
      { key: "jobType", label: "Job type", type: "select", options: ["trim_cut_and_install", "wood_filler_repair", "corner_cap", "mixed"] },
      { key: "complexity", label: "Complexity", type: "select", options: ["simple_straight_cuts", "compound_angles", "custom_fitting"] },
    ],
  },

  {
    id: "squeaky_floor",
    label: "Squeaky floor fix (screw-down method)",
    category: "repairs",
    baseMinutes: 25,
    imageHints: `Look for: floor covering type (hardwood, carpet, LVP), access to subfloor from below,
squeak location count, furniture that needs moving.`,
    params: [
      { key: "floorType", label: "Floor type", type: "select", options: ["hardwood", "carpet", "lvp_laminate", "other"] },
      { key: "squeakCount", label: "Number of squeak locations", type: "number", defaultValue: 3 },
      { key: "basementAccess", label: "Access from below (basement/crawlspace)?", type: "boolean", defaultValue: false },
    ],
  },

  {
    id: "tile_regrouting",
    label: "Tile re-grouting (cosmetic)",
    category: "repairs",
    baseMinutes: 50,
    imageHints: `Look for: tile area size, grout line width, existing grout condition, tile type,
grout color, mold presence.`,
    params: [
      { key: "areaSqFt", label: "Tile area (sq ft)", type: "number", unit: "sq ft", optional: true },
      { key: "groutLineWidth", label: "Grout line width", type: "select", options: ["narrow_under_1_8in", "standard_1_8_to_1_4in", "wide_over_1_4in"] },
      { key: "existingCondition", label: "Existing grout condition", type: "select", options: ["cosmetic_staining", "cracked_sections", "needs_full_removal"] },
    ],
  },

  {
    id: "deck_board_tightening",
    label: "Deck board tightening (surface screws)",
    category: "outdoor",
    baseMinutes: 30,
    imageHints: `Look for: deck board condition, screw vs. nail fasteners, board gaps, rot or damage,
deck size, access around deck.`,
    params: [
      { key: "deckAreaSqFt", label: "Deck area (sq ft)", type: "number", unit: "sq ft", optional: true },
      { key: "boardCondition", label: "Board condition", type: "select", options: ["good_just_loose", "warped_some_boards", "rot_present"] },
    ],
  },

  {
    id: "cabinet_repair",
    label: "Cabinet repair (loose doors, hinges)",
    category: "repairs",
    baseMinutes: 20,
    imageHints: `Look for: cabinet type (face-frame vs. frameless), hinge type, door count,
hinge condition, stripped screw holes, alignment issues.`,
    params: [
      { key: "doorCount", label: "Number of doors to repair", type: "number", defaultValue: 2 },
      { key: "issueType", label: "Issue type", type: "multiselect", options: ["loose_hinges", "misaligned_doors", "stripped_screw_holes", "door_wont_close"] },
    ],
  },

  // ── "Other" (fully dynamic) ────────────────────────────────────────────

  {
    id: "other",
    label: "Other (describe your task)",
    category: "other",
    baseMinutes: 0,
    imageHints: `This is a custom/unspecified task. Analyze all visible details: what type of work appears to be needed,
materials involved, scope, complexity, tools required, access difficulty, and anything that would affect
how long the job takes. Infer as much as possible from the photo and the user's description.`,
    params: [
      { key: "taskDescription", label: "Describe the task", type: "text" },
      { key: "estimatedComplexity", label: "Estimated complexity", type: "select", options: ["simple_quick", "moderate", "complex_specialized"] },
      WALL_MATERIAL_PARAM,
    ],
  },
];

// ─── Lookup helpers ─────────────────────────────────────────────────────────

export function getTask(taskId: string): TaskDefinition | undefined {
  return TASK_REGISTRY.find((t) => t.id === taskId);
}

export function getTasksByCategory(): Record<TaskCategory, TaskDefinition[]> {
  return TASK_REGISTRY.reduce((acc, task) => {
    if (!acc[task.category]) acc[task.category] = [];
    acc[task.category].push(task);
    return acc;
  }, {} as Record<TaskCategory, TaskDefinition[]>);
}