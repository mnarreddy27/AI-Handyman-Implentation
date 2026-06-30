/**
 * taskRegistry.ts
 *
 * Central registry for every supported handyman task.
 * Each entry defines:
 * - id:          unique snake_case identifier
 * - label:       display name shown in the app
 * - category:    grouping for the UI
 * - baseMinutes: baseline time before any modifiers
 * - imageHints:  what the AI should look for in photos for this task
 */

export interface TaskDefinition {
  id: string;
  label: string;
  category: TaskCategory;
  baseMinutes: number;
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
  },

  {
    id: "tv_cord_concealment",
    label: "TV cord concealment",
    category: "mounting",
    baseMinutes: 35,
    imageHints: `Look for: number of visible cords/cables, wall material, distance from TV to outlet,
existing raceways or conduit, baseboard proximity.`,
  },

  {
    id: "shelf_bracket_installation",
    label: "Shelf and bracket installation",
    category: "mounting",
    baseMinutes: 30,
    imageHints: `Look for: wall material, stud locations, existing shelf hardware, shelf length,
number of brackets visible or needed, obstacles like tile backsplash.`,
  },

  {
    id: "mirror_picture_hanging",
    label: "Mirror and picture hanging",
    category: "mounting",
    baseMinutes: 20,
    imageHints: `Look for: wall material, existing holes or picture rail, number of pieces to hang,
heavy mirror vs. light framed art, level/plumb reference points available.`,
  },

  {
    id: "curtain_rod_blind_installation",
    label: "Curtain rod and blind installation",
    category: "mounting",
    baseMinutes: 35,
    imageHints: `Look for: window count, wall/frame material around window, existing hardware or holes,
inside vs. outside mount, blind type (roller, venetian, cellular).`,
  },

  // ── Smart Home & Safety ────────────────────────────────────────────────

  {
    id: "smart_home_device",
    label: "Smart home device install (Nest, Ring, etc.)",
    category: "smart_home",
    baseMinutes: 30,
    imageHints: `Look for: existing device being replaced, junction box or wiring visible, doorbell chime unit,
thermostat wiring, Wi-Fi router distance, mounting surface material.`,
  },

  {
    id: "smoke_co_detector",
    label: "Smoke and CO detector install",
    category: "safety",
    baseMinutes: 15,
    imageHints: `Look for: ceiling vs. wall mount location, existing detector or knockout, wiring visible (hardwired vs. battery),
number of units to install.`,
  },

  {
    id: "baby_child_safety",
    label: "Baby and child safety hardware",
    category: "safety",
    baseMinutes: 20,
    imageHints: `Look for: staircase presence, banister type, wall material at gate location,
furniture that needs anchoring, cabinet hardware, existing safety devices.`,
  },

  {
    id: "grab_bar_safety_rail",
    label: "Safety rail or grab bar install",
    category: "safety",
    baseMinutes: 35,
    imageHints: `Look for: bathroom tile or drywall, stud locations, existing bars or blocking,
toilet or shower proximity, floor type for floor-mounted rails.`,
  },

  // ── Assembly ───────────────────────────────────────────────────────────

  {
    id: "furniture_assembly",
    label: "Furniture assembly",
    category: "assembly",
    baseMinutes: 50,
    imageHints: `Look for: flat-pack boxes and their approximate size, furniture type (bed frame, desk, wardrobe),
room space available for assembly, existing furniture to navigate around, number of boxes.`,
  },

  {
    id: "outdoor_furniture_assembly",
    label: "Outdoor furniture assembly or repair",
    category: "outdoor",
    baseMinutes: 35,
    imageHints: `Look for: outdoor furniture type, rust or corrosion, missing hardware, deck or patio surface,
tools available, number of pieces.`,
  },

  // ── Outdoor & Exterior ─────────────────────────────────────────────────

  {
    id: "mailbox_install",
    label: "Mailbox install or replacement",
    category: "outdoor",
    baseMinutes: 30,
    imageHints: `Look for: existing post condition, ground type (soil, concrete), post-mount vs. wall-mount,
distance from curb, existing mounting hardware.`,
  },

  {
    id: "exterior_decor_mounting",
    label: "Exterior decor and address plaque mounting",
    category: "outdoor",
    baseMinutes: 20,
    imageHints: `Look for: exterior wall material (brick, stucco, wood siding, vinyl), existing holes,
item to be mounted (address numbers, wreath hanger, flag bracket, plaque).`,
  },

  {
    id: "pet_door_installation",
    label: "Pet door installation (pre-cut only)",
    category: "outdoor",
    baseMinutes: 60,
    imageHints: `Look for: door material (hollow-core, solid wood, glass, wall panel), existing cutout,
pet door size relative to door, door thickness.`,
  },

  {
    id: "deck_staining",
    label: "Fence or deck staining (small section)",
    category: "outdoor",
    baseMinutes: 45,
    imageHints: `Look for: deck or fence size, existing stain condition, wood type, surface preparation needed,
peeling or cracking, obstacles around the area.`,
  },

  // ── Storage & Organization ─────────────────────────────────────────────

  {
    id: "garage_shelving",
    label: "Garage shelving and pegboard install",
    category: "storage",
    baseMinutes: 45,
    imageHints: `Look for: wall material (drywall, concrete block, wood stud), wall space available,
existing shelving or pegboard, ceiling height, floor obstructions.`,
  },

  {
    id: "garage_wall_organization",
    label: "Garage wall organization system",
    category: "storage",
    baseMinutes: 60,
    imageHints: `Look for: wall material, wall space, existing hooks or rails, number of wall panels or tracks visible,
tool storage, sports equipment presence.`,
  },

  {
    id: "closet_organization",
    label: "Closet organization system assembly",
    category: "storage",
    baseMinutes: 90,
    imageHints: `Look for: closet type (reach-in, walk-in), existing rod and shelf, wall material,
closet dimensions, number of hanging sections.`,
  },

  // ── Doors & Windows ────────────────────────────────────────────────────

  {
    id: "ceiling_fan_swap",
    label: "Ceiling fan swap (existing wiring only)",
    category: "mounting",
    baseMinutes: 60,
    imageHints: `Look for: existing ceiling fan or light fixture, junction box type (standard vs. fan-rated),
ceiling height, fan blade span, remote vs. wall switch wiring.`,
  },

  {
    id: "door_hinge_alignment",
    label: "Door hinge and alignment fix",
    category: "doors_windows",
    baseMinutes: 25,
    imageHints: `Look for: door sag direction, hinge condition, gap between door and frame,
paint buildup on hinges, number of hinges, door type (hollow vs. solid).`,
  },

  {
    id: "door_cabinet_hardware",
    label: "Door or cabinet hardware swap",
    category: "doors_windows",
    baseMinutes: 15,
    imageHints: `Look for: number of doors/drawers, existing hardware condition, hole pattern (single vs. dual hole),
knob vs. pull, furniture finish.`,
  },

  {
    id: "door_weatherstripping",
    label: "Door weather stripping replacement",
    category: "doors_windows",
    baseMinutes: 30,
    imageHints: `Look for: door condition, existing weatherstrip damage, door perimeter (top, sides, bottom sweep),
door type (interior vs. exterior), gap size visible.`,
  },

  {
    id: "garage_door_weatherstripping",
    label: "Garage door weather stripping",
    category: "doors_windows",
    baseMinutes: 35,
    imageHints: `Look for: garage door type (single vs. double), condition of existing seal bottom and sides,
side seal tracks, gaps in seal, door material.`,
  },

  {
    id: "screen_door_repair",
    label: "Screen door or window screen repair",
    category: "doors_windows",
    baseMinutes: 25,
    imageHints: `Look for: screen size, damage type (torn screen, broken frame, missing spline),
screen door vs. window screen, frame material (aluminum vs. wood), number of screens.`,
  },

  {
    id: "window_latch_lock",
    label: "Window latch or lock replacement",
    category: "doors_windows",
    baseMinutes: 20,
    imageHints: `Look for: window type (single/double hung, casement, sliding), existing latch condition,
paint buildup, number of windows, hardware finish.`,
  },

  {
    id: "window_weatherseal",
    label: "Window weatherseal replacement",
    category: "doors_windows",
    baseMinutes: 25,
    imageHints: `Look for: window condition, existing seal deterioration, number of windows, window type,
draft gaps visible, caulk condition.`,
  },

  // ── Plumbing ───────────────────────────────────────────────────────────

  {
    id: "faucet_aerator",
    label: "Faucet aerator cleaning or replacement",
    category: "plumbing",
    baseMinutes: 15,
    imageHints: `Look for: faucet type (kitchen vs. bathroom), aerator condition (mineral buildup, damage),
under-sink access, shutoff valve location.`,
  },

  {
    id: "showerhead_replacement",
    label: "Showerhead replacement",
    category: "plumbing",
    baseMinutes: 20,
    imageHints: `Look for: existing showerhead type, pipe arm condition (corrosion, mineral buildup),
accessibility in shower stall, water pressure indication.`,
  },

  {
    id: "toilet_seat_replacement",
    label: "Toilet seat replacement",
    category: "plumbing",
    baseMinutes: 15,
    imageHints: `Look for: toilet shape (round vs. elongated), seat condition, bolt access under tank,
existing seat style (standard, slow-close, bidet).`,
  },

  {
    id: "toilet_flapper_handle",
    label: "Toilet flapper or handle replacement",
    category: "plumbing",
    baseMinutes: 20,
    imageHints: `Look for: toilet tank access, existing flapper condition, running water signs,
handle mechanism, flapper size.`,
  },

  {
    id: "sink_drain_trap",
    label: "Sink drain trap cleaning",
    category: "plumbing",
    baseMinutes: 35,
    imageHints: `Look for: under-sink space accessibility, trap type (P-trap vs. S-trap), PVC vs. metal trap,
water damage or corrosion, bucket space for water.`,
  },

  {
    id: "garbage_disposal",
    label: "Garbage disposal reset or minor fix",
    category: "plumbing",
    baseMinutes: 20,
    imageHints: `Look for: disposal unit brand/model, reset button location, visible jams or leaks,
under-sink space, dishwasher connection present.`,
  },

  // ── Painting & Repairs ─────────────────────────────────────────────────

  {
    id: "interior_wall_painting",
    label: "Interior wall painting (single room)",
    category: "painting",
    baseMinutes: 90,
    imageHints: `Look for: room size, wall condition (cracks, holes, old paint), ceiling height,
number of doors and windows, furniture present, wall color contrast.`,
  },

  {
    id: "cabinet_painting",
    label: "Cabinet painting or refinishing",
    category: "painting",
    baseMinutes: 240,
    imageHints: `Look for: number of cabinet doors, cabinet condition, grease or grime buildup,
existing paint or stain, hardware removal needed, kitchen vs. bathroom cabinets.`,
  },

  {
    id: "trim_baseboard_painting",
    label: "Trim and baseboard painting",
    category: "painting",
    baseMinutes: 40,
    imageHints: `Look for: linear feet of trim, trim condition, tape needed, existing color contrast,
doorways and window casings included.`,
  },

  {
    id: "interior_paint_touchup",
    label: "Interior paint touch-up",
    category: "painting",
    baseMinutes: 20,
    imageHints: `Look for: scuff or damage size and count, wall color, touch-up area accessibility,
matching paint available (cans visible).`,
  },

  {
    id: "drywall_patching",
    label: "Drywall patching (nail holes, small dings)",
    category: "repairs",
    baseMinutes: 25,
    imageHints: `Look for: hole count and sizes, drywall damage extent, texture type (smooth, orange peel, knockdown),
existing paint color, location height.`,
  },

  {
    id: "caulking",
    label: "Caulking (tubs, sinks, windows)",
    category: "repairs",
    baseMinutes: 25,
    imageHints: `Look for: existing caulk condition (cracked, moldy, missing), surface type (tub surround, window frame, sink),
linear feet to caulk, mold presence.`,
  },{
    id: "grout_touchup",
    label: "Grout touch-up (cosmetic)",
    category: "repairs",
    baseMinutes: 35,
    imageHints: `Look for: grout condition (cracked, stained, missing), tile type and size, area size,
grout color matching challenges, mold or mildew.`,
  },

  {
    id: "baseboard_trim_repair",
    label: "Baseboard and trim repair or reattachment",
    category: "repairs",
    baseMinutes: 30,
    imageHints: `Look for: loose or detached trim sections, gaps at wall or floor, paint condition,
nail holes, length of affected trim.`,
  },

  {
    id: "minor_carpentry",
    label: "Minor carpentry (trim cuts, wood filler)",
    category: "repairs",
    baseMinutes: 35,
    imageHints: `Look for: damaged wood sections, gaps, trim mismatches, tool access, wood type and finish.`,
  },

  {
    id: "squeaky_floor",
    label: "Squeaky floor fix (screw-down method)",
    category: "repairs",
    baseMinutes: 25,
    imageHints: `Look for: floor covering type (hardwood, carpet, LVP), access to subfloor from below,
squeak location count, furniture that needs moving.`,
  },

  {
    id: "tile_regrouting",
    label: "Tile re-grouting (cosmetic)",
    category: "repairs",
    baseMinutes: 50,
    imageHints: `Look for: tile area size, grout line width, existing grout condition, tile type,
grout color, mold presence.`,
  },

  {
    id: "deck_board_tightening",
    label: "Deck board tightening (surface screws)",
    category: "outdoor",
    baseMinutes: 30,
    imageHints: `Look for: deck board condition, screw vs. nail fasteners, board gaps, rot or damage,
deck size, access around deck.`,
  },

  {
    id: "cabinet_repair",
    label: "Cabinet repair (loose doors, hinges)",
    category: "repairs",
    baseMinutes: 20,
    imageHints: `Look for: cabinet type (face-frame vs. frameless), hinge type, door count,
hinge condition, stripped screw holes, alignment issues.`,
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
  }
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