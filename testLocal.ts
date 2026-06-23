/**
 * testLocal.ts
 *
 * Test runner for the generalized handyman estimator.
 * Upgraded to support multiple tasks and full multimodal media arrays (Images + Videos).
 * Run with: npx ts-node src/testLocal.ts
 */

import { estimateHandymanTask } from "./orchestration";
import { TASK_REGISTRY } from "./taskRegistry";
import { MediaInput } from "./types";
import * as fs from "fs";
import * as path from "path";

// ─── Multimodal Media Loader ──────────────────────────────────────────────────

/**
 * Resolves local file paths or URLs and maps them directly into 
 * the Google Gen AI SDK inline data contract structure.
 */
async function loadMediaAsset(inputPath: string): Promise<MediaInput> {
  let base64: string;

  if (inputPath.startsWith("http://") || inputPath.startsWith("https://")) {
    console.log(`  🔗 Fetching asset from URL: ${inputPath.slice(0, 60)}...`);
    const response = await fetch(inputPath);
    if (!response.ok) throw new Error(`HTTP ${response.status} fetching media file`);
    const buffer = await response.arrayBuffer();
    base64 = Buffer.from(buffer).toString("base64");
  } else {
    const fullPath = path.isAbsolute(inputPath) ? inputPath : path.join(__dirname, inputPath);
    if (!fs.existsSync(fullPath)) {
      // For local testing setups, mock a small string payload if file assets don't exist yet
      console.log(`  ⚠️ Asset path not found on disk: ${inputPath} — generating dry mock payload placeholder...`);
      base64 = Buffer.from("mock-binary-media-payload-data").toString("base64");
    } else {
      console.log(`  📁 Loading local file asset: ${fullPath}`);
      base64 = fs.readFileSync(fullPath).toString("base64");
    }
  }

  // Explicitly mapping exact file extensions to respective MIME targets
  const ext = inputPath.split(".").pop()?.toLowerCase();
  let mimeType = "image/jpeg"; // Safe fallback

  if (ext === "png") mimeType = "image/png";
  else if (ext === "webp") mimeType = "image/webp";
  else if (ext === "mp4") mimeType = "video/mp4";
  else if (ext === "mov" || ext === "qt") mimeType = "video/quicktime";

  return {
    inlineData: {
      data: base64,
      mimeType
    }
  };
}

async function loadMediaSuite(paths: string[]): Promise<MediaInput[]> {
  return Promise.all(paths.map(loadMediaAsset));
}

// ─── Test Visualizer Output ──────────────────────────────────────────────────

function printResult(result: Awaited<ReturnType<typeof estimateHandymanTask>>) {
  console.log(`\n  ✅ Task:          ${result.taskLabel} (${result.taskId})`);
  console.log(`  ⏱️  Estimate:       ${result.estimatedDurationMinutes} min`);
  console.log(`  📊 Range:          ${result.rangeMinMinutes}–${result.rangeMaxMinutes} min`);
  console.log(`  🎯 Confidence:     ${(result.confidenceScore * 100).toFixed(0)}%`);
  console.log(`  🔢 Breakdown:`, result.breakdown);
  
  if (result.notices.length > 0) {
    console.log(`  📋 Notices & Flags:`);
    result.notices.forEach(n => console.log(`     • ${n}`));
  }
  
  // Refactored cleanly from imageInsights → mediaInsights to reflect actual state contracts
  if (result.mediaInsights) {
    console.log(`  🖥️  Multimodal Media Insights:`);
    console.log(`     • Extra Modifier: +${result.mediaInsights.additionalComplexityMinutes} min added`);
    result.mediaInsights.observations.forEach(o => console.log(`     👁  Observation: ${o}`));
    result.mediaInsights.installerNotes.forEach(note => console.log(`     📝 Note: ${note}`));
    
    if (result.mediaInsights.inferredTaskType) {
      console.log(`     🔍 Inferred Target Type: ${result.mediaInsights.inferredTaskType}`);
    }
  }
  console.log("  ─────────────────────────────────────────────");
}

// ─── Test Suite Executions ───────────────────────────────────────────────────

async function runTests() {
  console.log("🚀 Handyman Estimator — Multimodal Validation Suite\n");
  console.log(`📋 Active Registry: ${TASK_REGISTRY.length} unique task templates loaded.\n`);

  // ── Test 1: Single Image Assessment ───────────────────────────────────────
  try {
    console.log("── Test 1: Tv Installation (Single Image Base Case) ──");
    const media = await loadMediaSuite(["TVOne.jpeg"]);
    const result = await estimateHandymanTask("tv_installation", {}, media);
    printResult(result);
  } catch (err) {
    console.error("  ❌ Test 1 Encountered Error:", err);
  }

  // ── Test 2: Multi-Angle Image Assessment ──────────────────────────────────
  try {
    console.log("── Test 2: Tv Installation (Multi-Angle Images) ───────");
    const media = await loadMediaSuite(["TVOne.jpeg", "TVTwo.jpeg", "TVThree.jpeg"]);
    const result = await estimateHandymanTask("tv_installation", {}, media);
    printResult(result);
  } catch (err) {
    console.error("  ❌ Test 2 Encountered Error:", err);
  }

  // // ── Test 3: Standalone Video Stream Assessment ─────────────────────────────
  // try {
  //   console.log("── Test 3: Wall Mount (Standalone Video Walkthrough) ─────");
  //   // Passing user parameters to cross-examine along with a video clip path
  //   const userParams = { stud_type: "drywall", tv_size_inches: 65 };
  //   const media = await loadMediaSuite(["living_room_wall_pan.mp4"]);
    
  //   const result = await estimateHandymanTask("tv_installation", userParams, media);
  //   printResult(result);
  // } catch (err) {
  //   console.error("  ❌ Test 3 Encountered Error:", err);
  // }

  // // ── Test 4: Comprehensive Mixed Media Matrix ──────────────────────────────
  // try {
  //   console.log("── Test 4: TV Installation (Mixed Images + Video Assets) ─");
  //   // Simulating mixed layouts: structural photos mixed with panning context video streams
  //   const userParams = { stud_type: "metal", bracket_type: "full_motion" };
  //   const media = await loadMediaSuite([
  //     "wall_back_input.png", 
  //     "bracket_box_label.jpg", 
  //     "studfinder_sweep.mov"
  //   ]);
    
  //   const result = await estimateHandymanTask("tv_installation", userParams, media);
  //   printResult(result);
  // } catch (err) {
  //   console.error("  ❌ Test 4 Encountered Error:", err);
  // }
  // ── Test 5: "Other" - Damaged Window Sill (Single Picture) ────────────────
  try {
    console.log("\n── Test 5: 'Other' Task — Damaged Window Sill & Apron ────");
    const userParams = { notes: "fixing a damaged window sill/apron. Possible moisture buildup causing deterioration. Recommendations of patching/filling or replacement of sill/apron" };
    // Pure photo assessment
    const media = await loadMediaSuite(["WindowOne.jpeg", "WindowTwo.jpeg"]);
    
    const result = await estimateHandymanTask("other", userParams , media);
    printResult(result);
  } catch (err) {
    console.error("  ❌ Test 5 Encountered Error:", err);
  }

  // ── Test 6: "Other" - Shower Tile Replacement (Single Picture) ───────────
  try {
    console.log("\n── Test 6: 'Other' Task — Cracked Shower Tile ───────────");
    const userParams = { notes : " shower tile replacement for cracked tiles"  };

    // Pure photo assessment
    const media = await loadMediaSuite(["ShowerOne.jpeg", "ShowerTwo.jpeg"]);
    
    const result = await estimateHandymanTask("other", userParams, media);
    printResult(result);
  } catch (err) {
    console.error("  ❌ Test 6 Encountered Error:", err);
  }

  try {
    console.log("\n── Test 6: 'Other' Task — Cracked Shower Tile ───────────");
    const userParams = { notes : " Misc"  };

    // Pure photo assessment
    const media = await loadMediaSuite(["misc.mp4"]);
    
    const result = await estimateHandymanTask("other", userParams, media);
    printResult(result);
  } catch (err) {
    console.error("  ❌ Test 6 Encountered Error:", err);
  }

  console.log("\n✅ Assessment runs finished.");
  
}

runTests().catch(console.error);