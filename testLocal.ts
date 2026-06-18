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

  try {
    console.log("── Test 1: Cabinet Painting (Blank Parameters) ─────────────");
    
    const photos = await loadPhotos(["CabinetOne.jpeg", "CabinetTwo.jpeg"]); 
  
    
    const result = await estimateHandymanTask("cabinet_painting", {}, photos);
  
    printResult(result);
  } catch (err) {
    console.error("  ❌ Test 1 failed:", err);
  }

  try {
    console.log("── Test 2: Cabinet Painting (Blank Parameters) ─────────────");
    
    const photos = await loadPhotos(["CabinetOne.jpeg"]); 
  
    
    const result = await estimateHandymanTask("cabinet_painting", {}, photos);
  
    printResult(result);
  } catch (err) {
    console.error("  ❌ Test 2 failed:", err);
  }

  try {
    console.log("── Test 3: Toilet Replacement (Blank Parameters) ─────────────");
    
    const photos = await loadPhotos(["ToiletOne.jpeg", "ToiletTwo.jpeg"]); 
  
    
    const result = await estimateHandymanTask("toilet_seat_replacement", {}, photos);
  
    printResult(result);
  } catch (err) {
    console.error("  ❌ Test 3 failed:", err);
  }

  try {
    console.log("── Test 4: Toilet Replacement (Blank Parameters) ─────────────");
    
    const photos = await loadPhotos(["ToiletOne.jpeg"]); 
  
    
    const result = await estimateHandymanTask("toilet_seat_replacement", {}, photos);
  
    printResult(result);
  } catch (err) {
    console.error("  ❌ Test 4 failed:", err);
  }

 







  

   console.log("\n✅ All tests complete.");
 }

 runTests().catch(console.error);