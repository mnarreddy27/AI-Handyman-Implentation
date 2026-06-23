/**
 * testLocal.ts
 *
 * Test runner for the generalized handyman estimator.
 * Supports multiple tasks and full multimodal media arrays (Images + Videos).
 * Run with: npx ts-node src/testLocal.ts
 *
 * Includes:
 *   - Correct MIME mapping for HEIC/HEIF images and MOV videos (previously
 *     fell through to wrong fallback types)
 *   - Automatic conversion of HEIC -> JPEG and MOV -> MP4 before anything
 *     gets base64-encoded or sent to Gemini, since Gemini doesn't reliably
 *     support either source format
 *   - Magic-byte validation for non-converted formats, so a corrupted or
 *     mislabeled file fails with a clear message instead of a Gemini 400
 */

import { estimateHandymanTask } from "./orchestration";
import { TASK_REGISTRY } from "./taskRegistry";
import { MediaInput } from "./types";
import { normalizeMediaForGemini, needsConversion } from "./mediaConversion";
import * as fs from "fs";
import * as path from "path";

// ─── Multimodal Media Loader ──────────────────────────────────────────────────

/** Put your test images/videos in this folder, next to testLocal.ts. */
const ASSETS_DIR = path.join(__dirname, "test-assets");

function mimeTypeForExtension(ext: string | undefined): string {
  switch (ext) {
    case "png": return "image/png";
    case "webp": return "image/webp";
    case "jpg":
    case "jpeg": return "image/jpeg";
    case "heic": return "image/heic";
    case "heif": return "image/heif";
    case "mp4": return "video/mp4";
    case "mov":
    case "qt": return "video/quicktime";
    case "webm": return "video/webm";
    default: return "image/jpeg"; // last-resort fallback
  }
}

/**
 * Resolves local file paths or URLs, converts HEIC/MOV to Gemini-friendly
 * formats if needed, and maps the result into the SDK inline data contract.
 */
async function loadMediaAsset(inputPath: string): Promise<MediaInput> {
  let rawBuffer: Buffer;

  if (inputPath.startsWith("http://") || inputPath.startsWith("https://")) {
    console.log(`  🔗 Fetching asset from URL: ${inputPath.slice(0, 60)}...`);
    const response = await fetch(inputPath);
    if (!response.ok) throw new Error(`HTTP ${response.status} fetching media file`);
    rawBuffer = Buffer.from(await response.arrayBuffer());
  } else {
    const candidatePaths = path.isAbsolute(inputPath)
      ? [inputPath]
      : [path.join(ASSETS_DIR, inputPath), path.join(__dirname, inputPath)];

    const fullPath = candidatePaths.find(p => fs.existsSync(p));

    if (!fullPath) {
      throw new Error(
        `Asset not found: "${inputPath}".\n` +
        `  Looked in:\n${candidatePaths.map(p => `    - ${p}`).join("\n")}\n` +
        `  Fix: place the file at one of those paths, or pass an absolute path / URL.`
      );
    }

    console.log(`  📁 Loading local file asset: ${fullPath}`);
    rawBuffer = fs.readFileSync(fullPath);
  }

  const ext = inputPath.split(".").pop()?.toLowerCase();
  const claimedMimeType = mimeTypeForExtension(ext);

  // Sanity-check the raw bytes before we even consider conversion —
  // catches truncated downloads / wrong-extension files early.
  validateMagicBytes(inputPath, claimedMimeType, rawBuffer);

  // ── Convert HEIC -> JPEG and MOV -> MP4 if needed ─────────────────────────
  let finalBuffer = rawBuffer;
  let finalMimeType = claimedMimeType;

  if (needsConversion(claimedMimeType)) {
    console.log(`  🔄 Converting ${claimedMimeType} -> Gemini-compatible format...`);
    const result = await normalizeMediaForGemini(rawBuffer, claimedMimeType);
    finalBuffer = result.buffer;
    finalMimeType = result.mimeType;
    console.log(`  ✅ Converted to ${finalMimeType} (${(finalBuffer.length / 1024).toFixed(0)}KB)`);
  }

  return {
    inlineData: {
      data: finalBuffer.toString("base64"),
      mimeType: finalMimeType,
    },
  };
}

/**
 * Checks the first few bytes against known file signatures ("magic numbers").
 * Operates on raw bytes BEFORE base64 encoding and before conversion, so it
 * validates what's actually on disk, not a guess based on the file extension.
 * Skips formats without a simple fixed-offset signature (HEIC, video containers).
 */
function validateMagicBytes(filename: string, mimeType: string, buffer: Buffer): void {
  const signatures: Record<string, number[]> = {
    "image/jpeg": [0xff, 0xd8, 0xff],
    "image/png": [0x89, 0x50, 0x4e, 0x47],
    "image/webp": [0x52, 0x49, 0x46, 0x46], // "RIFF"
  };

  const expected = signatures[mimeType];
  if (!expected) return; // HEIC/video signatures aren't simple fixed-offset checks — skip

  const matches = expected.every((byte, i) => buffer[i] === byte);

  if (!matches) {
    throw new Error(
      `"${filename}" does not look like a valid ${mimeType} file.\n` +
      `  Expected byte signature: [${expected.map(b => b.toString(16)).join(" ")}]\n` +
      `  Got: [${Array.from(buffer.slice(0, expected.length)).map(b => b.toString(16)).join(" ")}]\n` +
      `  This usually means the file is corrupted, truncated, or mislabeled — ` +
      `check the file on disk before sending it to Gemini.`
    );
  }
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
  console.log(`📂 Looking for test assets in: ${ASSETS_DIR}\n`);

  // ── Test 1: Single Image Assessment ───────────────────────────────────────
  try {
    console.log("── Test 1: TV Installation: (Single Image Base Case) ──");
    const media = await loadMediaSuite(["IMG_1468.HEIC"]);
    const result = await estimateHandymanTask("tv_installation", {}, media);
    printResult(result);
  } catch (err) {
    console.error("  ❌ Test 1 Encountered Error:", err instanceof Error ? err.message : err);
  }

  // ── Test 2: HEIC image (auto-converted to JPEG) ───────────────────────────
  // try {
  //   console.log("\n── Test 2: HEIC Conversion Check (iPhone Photo) ──────────");
  //   const media = await loadMediaSuite(["iphone_photo.heic"]);
  //   const result = await estimateHandymanTask("other", { notes: "general iphone photo test" }, media);
  //   printResult(result);
  // } catch (err) {
  //   console.error("  ❌ Test 2 Encountered Error:", err instanceof Error ? err.message : err);
  // }

  // // ── Test 3: MOV video (auto-converted to MP4) ──────────────────────────────
  // try {
  //   console.log("\n── Test 3: MOV Conversion Check (iPhone Video) ───────────");
  //   const media = await loadMediaSuite(["iphone_video.mov"]);
  //   const result = await estimateHandymanTask("other", { notes: "general iphone video test" }, media);
  //   printResult(result);
  // } catch (err) {
  //   console.error("  ❌ Test 3 Encountered Error:", err instanceof Error ? err.message : err);
  // }

  // // ── Test 4: Mixed media — JPEG + HEIC + MOV together ──────────────────────
  // try {
  //   console.log("\n── Test 4: Mixed Format Batch (JPEG + HEIC + MOV) ────────");
  //   const media = await loadMediaSuite(["ToiletOne.jpeg", "iphone_photo.heic", "iphone_video.mov"]);
  //   const result = await estimateHandymanTask("other", { notes: "mixed format batch test" }, media);
  //   printResult(result);
  // } catch (err) {
  //   console.error("  ❌ Test 4 Encountered Error:", err instanceof Error ? err.message : err);
  // }

  console.log("\n✅ Assessment runs finished.");
}

runTests().catch(console.error);