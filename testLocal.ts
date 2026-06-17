/**
 * testLocal.ts
 *
 * Test runner for the generalized handyman estimator.
 * Supports multiple tasks, multiple photos (URL or local file).
 * Run with: npx ts-node src/testLocal.ts
 */

import { estimateHandymanTask, orchestrateTVInstallEstimate } from "./orchestration";
import { PhotoInput } from "./imageAnalysis";
import { TASK_REGISTRY } from "./taskRegistry";
import * as fs from "fs";
import * as path from "path";

// ─── Image loader ─────────────────────────────────────────────────────────────

async function loadPhoto(inputPath: string): Promise<PhotoInput> {
  let base64: string;

  if (inputPath.startsWith("http://") || inputPath.startsWith("https://")) {
    console.log(`  🔗 Fetching from URL: ${inputPath.slice(0, 60)}...`);
    const response = await fetch(inputPath);
    if (!response.ok) throw new Error(`HTTP ${response.status} fetching image`);
    const buffer = await response.arrayBuffer();
    base64 = Buffer.from(buffer).toString("base64");
  } else {
    const fullPath = path.isAbsolute(inputPath) ? inputPath : path.join(__dirname, inputPath);
    if (!fs.existsSync(fullPath)) throw new Error(`File not found: ${fullPath}`);
    console.log(`  📁 Loading local file: ${fullPath}`);
    base64 = fs.readFileSync(fullPath).toString("base64");
  }

  const ext = inputPath.split(".").pop()?.toLowerCase();
  const mediaType =
    ext === "png" ? "image/png" :
    ext === "webp" ? "image/webp" :
    "image/jpeg";

  return { base64, mediaType };
}

async function loadPhotos(paths: string[]): Promise<PhotoInput[]> {
  return Promise.all(paths.map(loadPhoto));
}

// ─── Test runner ──────────────────────────────────────────────────────────────

function printResult(result: Awaited<ReturnType<typeof estimateHandymanTask>>) {
  console.log(`\n  ✅ Task:          ${result.taskLabel}`);
  console.log(`  ⏱️  Estimate:       ${result.estimatedDurationMinutes} min`);
  console.log(`  📊 Range:          ${result.rangeMinMinutes}–${result.rangeMaxMinutes} min`);
  console.log(`  🎯 Confidence:     ${(result.confidenceScore * 100).toFixed(0)}%`);
  console.log(`  🔢 Breakdown:`, result.breakdown);
  if (result.notices.length > 0) {
    console.log(`  📋 Notices:`);
    result.notices.forEach(n => console.log(`     • ${n}`));
  }
  if (result.imageInsights) {
    console.log(`  📷 Image insights:`);
    result.imageInsights.observations.forEach(o => console.log(`     👁  ${o}`));
    if (result.imageInsights.inferredTaskType) {
      console.log(`     🔍 Inferred type: ${result.imageInsights.inferredTaskType}`);
    }
  }
  console.log("  ─────────────────────────────────────────────");
}

// ─── Tests ───────────────────────────────────────────────────────────────────

async function runTests() {
  console.log("🚀 Handyman Estimator — Multi-Task Test Suite\n");
  console.log(`📋 Registry contains ${TASK_REGISTRY.length} tasks\n`);

  // ── Test 1: TV installation with a single URL photo ───────────────────────
  try {
    console.log("── Test 1: TV Installation (single photo, URL) ───────────────");
    const photos = await loadPhotos([
      "https://www.tvinstallationone.com/assets/img/blogimg/b10_TV-Above-Fireplace.webp",
    ]);

    const result = await estimateHandymanTask("tv_installation", {
      tvDiagonal: 65,
      wallMaterial: "drywall",   // image should override this to brick or stone
      mountType: "tilting",
      mountHeight: 60,
      aboveFireplace: false,     // image should override this to true
      wireConcealment: "in_wall",
    }, photos);

    printResult(result);
  } catch (err) {
    console.error("  ❌ Test 1 failed:", err);
  }

  // ── Test 2: Furniture assembly, no photos ─────────────────────────────────
  try {
    console.log("── Test 2: Furniture Assembly (no photos) ─────────────────────");
    const result = await estimateHandymanTask("furniture_assembly", {
      furnitureType: "wardrobe",
      itemCount: 2,
      boxCount: 8,
      hasInstructions: true,
      roomIsAccessible: false,
    });
    printResult(result);
  } catch (err) {
    console.error("  ❌ Test 2 failed:", err);
  }

  // ── Test 3: Bathroom caulking with multiple local photos ──────────────────
  // Swap these paths for real local files, or use URLs
  try {
    console.log("── Test 3: Caulking (multi-photo — using placeholder URL) ──────");
    const photos = await loadPhotos([
      "https://images.unsplash.com/photo-1552321554-5fefe8c9ef14?w=800",
      "https://images.unsplash.com/photo-1584622781564-1d987f7333c1?w=800",
    ]);

    const result = await estimateHandymanTask("caulking", {
      location: ["tub_surround", "bathroom_sink"],
      linearFeet: 25,
      existingCondition: "moldy_needs_treatment",
    }, photos);

    printResult(result);
  } catch (err) {
    console.error("  ❌ Test 3 failed:", err);
  }

  // ── Test 4: Smart thermostat (single photo) ───────────────────────────────
  try {
    console.log("── Test 4: Smart Thermostat (params only, no photos) ──────────");
    const result = await estimateHandymanTask("smart_home_device", {
      deviceType: "smart_thermostat",
      replacingExisting: true,
      wiringAvailable: true,
    });
    printResult(result);
  } catch (err) {
    console.error("  ❌ Test 4 failed:", err);
  }

  // ── Test 5: "Other" task — fully AI-inferred ──────────────────────────────
  try {
    console.log("── Test 5: Other task — AI infers from description + photo ────");
    const photos = await loadPhotos([
      "https://images.unsplash.com/photo-1563861826100-9cb868fdbe1c?w=800",
    ]);

    const result = await estimateHandymanTask("other", {
      taskDescription: "The exterior light fixture next to the garage door is loose and one bulb socket is broken. Needs to be fixed or replaced.",
      estimatedComplexity: "moderate",
    }, photos);

    printResult(result);
  } catch (err) {
    console.error("  ❌ Test 5 failed:", err);
  }

  // ── Test 6: Backward-compat TV alias (existing callers won't break) ────────
  try {
    console.log("── Test 6: orchestrateTVInstallEstimate alias (backward compat)");
    const result = await orchestrateTVInstallEstimate({
      tvDiagonal: 55,
      mountType: "fixed",
      wallMaterial: "drywall",
      wireConcealment: "none",
    });
    printResult(result);
  } catch (err) {
    console.error("  ❌ Test 6 failed:", err);
  }

  console.log("\n✅ All tests complete.");
}

runTests().catch(console.error);