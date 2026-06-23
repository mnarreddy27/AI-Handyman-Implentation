/**
 * mediaConversion.ts
 *
 * Normalizes incoming media into formats Gemini reliably supports, BEFORE
 * any base64 encoding, validation, or API calls happen.
 *
 * Why this exists:
 * - iPhones default to HEIC for photos and HEVC-in-MOV for video.
 * - Gemini's inline API does not reliably accept either format.
 * - Rather than reject every iPhone user's upload, we transparently
 * convert HEIC -> JPEG and MOV -> MP4 server-side first.
 *
 * Dependencies (add to package.json):
 * npm install sharp fluent-ffmpeg heic-decode
 * npm install -D @types/fluent-ffmpeg
 *
 * System requirement:
 * ffmpeg must be installed on the host machine running this code.
 * - Mac:     brew install ffmpeg
 * - Ubuntu: apt-get install ffmpeg
 * - Railway/Render/Docker: add `apt-get install -y ffmpeg` to your build step,
 * or use a base image that already includes it (e.g. node:20-bookworm + apt install).
 * sharp does NOT need any system dependency — it ships prebuilt binaries.
 */

import sharp from "sharp";
import ffmpeg from "fluent-ffmpeg";
import heicDecode from "heic-decode";
import { writeFile, readFile, unlink, mkdtemp } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { ImageAnalysisError } from "./errors";

// ─── Format detection ────────────────────────────────────────────────────────

const HEIC_MIME_TYPES = new Set(["image/heic", "image/heif"]);
const CONVERTIBLE_VIDEO_MIME_TYPES = new Set(["video/quicktime"]); // .mov

export function needsImageConversion(mimeType: string): boolean {
  return HEIC_MIME_TYPES.has(mimeType);
}

export function needsVideoConversion(mimeType: string): boolean {
  return CONVERTIBLE_VIDEO_MIME_TYPES.has(mimeType);
}

export function needsConversion(mimeType: string): boolean {
  return needsImageConversion(mimeType) || needsVideoConversion(mimeType);
}

// ─── Image conversion: HEIC/HEIF -> JPEG ──────────────────────────────────────

/**
 * Converts HEIC/HEIF bytes to JPEG using a pure JS parser first to bypass native
 * libheif reference limit guardrails, then uses sharp to compress the pixel array.
 * Returns the converted buffer and its new MIME type.
 */
export async function convertHeicToJpeg(buffer: Buffer): Promise<{ buffer: Buffer; mimeType: "image/jpeg" }> {
  try {
    // Decode with pure JavaScript to completely ignore native cross-reference/security bounds
    const { width, height, data } = await heicDecode({ buffer });

    // Package the raw unrolled frame into standard progressive JPEG format
    const converted = await sharp(data, {
      raw: { width, height, channels: 4 }
    })
    .jpeg({ quality: 90 })
    .toBuffer();

    return { buffer: converted, mimeType: "image/jpeg" };
  } catch (err) {
    throw new ImageAnalysisError(
      `Failed to convert HEIC image to JPEG: ${err instanceof Error ? err.message : String(err)}. ` +
      `The file may be corrupted or not a valid HEIC.`,
      { cause: err, retryable: false }
    );
  }
}

// ─── Video conversion: MOV (HEVC) -> MP4 (H.264) ──────────────────────────────

/**
 * Converts MOV/HEVC video to standard H.264 MP4 using ffmpeg.
 * Runs through temp files because fluent-ffmpeg works on file paths, not buffers directly.
 * Temp files are always cleaned up, including on failure.
 */
export async function convertMovToMp4(buffer: Buffer): Promise<{ buffer: Buffer; mimeType: "video/mp4" }> {
  const tempDir = await mkdtemp(join(tmpdir(), "media-convert-"));
  const inputPath = join(tempDir, "input.mov");
  const outputPath = join(tempDir, "output.mp4");

  try {
    await writeFile(inputPath, buffer);

    await new Promise<void>((resolve, reject) => {
      ffmpeg(inputPath)
        .videoCodec("libx264")
        .audioCodec("aac")
        .outputOptions(["-movflags", "+faststart"]) // web-friendly MP4
        .on("end", () => resolve())
        .on("error", (err) => reject(err))
        .save(outputPath);
    });

    const converted = await readFile(outputPath);
    return { buffer: converted, mimeType: "video/mp4" };

  } catch (err) {
    throw new ImageAnalysisError(
      `Failed to convert MOV video to MP4: ${err instanceof Error ? err.message : String(err)}. ` +
      `Ensure ffmpeg is installed on this server, and the file is a valid video.`,
      { cause: err, retryable: false }
    );
  } finally {
    // Always clean up temp files, even if conversion failed
    await unlink(inputPath).catch(() => {});
    await unlink(outputPath).catch(() => {});
  }
}

// ─── Unified entry point ──────────────────────────────────────────────────────

export interface ConversionResult {
  buffer: Buffer;
  mimeType: string;
  wasConverted: boolean;
  originalMimeType: string;
}

/**
 * Takes raw file bytes + their claimed MIME type, and returns bytes guaranteed
 * to be in a Gemini-supported format. No-op if no conversion is needed.
 */
export async function normalizeMediaForGemini(
  buffer: Buffer,
  mimeType: string
): Promise<ConversionResult> {

  if (needsImageConversion(mimeType)) {
    const { buffer: converted, mimeType: newMimeType } = await convertHeicToJpeg(buffer);
    return { buffer: converted, mimeType: newMimeType, wasConverted: true, originalMimeType: mimeType };
  }

  if (needsVideoConversion(mimeType)) {
    const { buffer: converted, mimeType: newMimeType } = await convertMovToMp4(buffer);
    return { buffer: converted, mimeType: newMimeType, wasConverted: true, originalMimeType: mimeType };
  }

  // No conversion needed — pass through unchanged
  return { buffer, mimeType, wasConverted: false, originalMimeType: mimeType };
}