/**
 * mediaConversion.ts
 *
 * Normalizes incoming media into formats Gemini reliably supports, BEFORE
 * any base64 encoding, validation, or API calls happen.
 *
 * Why this exists:
 * - iPhones default to HEIC for photos and HEVC-in-MOV for video.
 * - Massive uncompressed WebP images can trigger bulky network payload timeouts.
 * - Rather than reject or hit timeouts on these formats, we transparently
 * convert/compress them down server-side first.
 */

import sharp from "sharp";
import ffmpeg from "fluent-ffmpeg";
import heicDecode from "heic-decode";
import { writeFile, readFile, unlink, mkdtemp } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { ImageAnalysisError } from "./errors";

// ─── Format detection ────────────────────────────────────────────────────────

// Added image/webp to the compression watchlist to prevent payload network timeouts
const COMPRESSIBLE_IMAGE_MIME_TYPES = new Set(["image/heic", "image/heif", "image/webp"]);
const CONVERTIBLE_VIDEO_MIME_TYPES = new Set(["video/quicktime"]); // .mov

export function needsImageConversion(mimeType: string): boolean {
  return COMPRESSIBLE_IMAGE_MIME_TYPES.has(mimeType.toLowerCase());
}

export function needsVideoConversion(mimeType: string): boolean {
  return CONVERTIBLE_VIDEO_MIME_TYPES.has(mimeType.toLowerCase());
}

export function needsConversion(mimeType: string): boolean {
  return needsImageConversion(mimeType) || needsVideoConversion(mimeType);
}

// ─── Image conversion & Compression ──────────────────────────────────────────

/**
 * Normalizes and compresses image assets. For HEIC/HEIF files, it runs a pure JS 
 * decoder first to bypass binary constraints. For formats like WebP, it passes 
 * the buffer directly to sharp to downscale and optimize into a clean progressive JPEG.
 */
export async function processAndCompressImage(
  buffer: Buffer,
  mimeType: string
): Promise<{ buffer: Buffer; mimeType: "image/jpeg" }> {
  try {
    const cleanMime = mimeType.toLowerCase();
    let sharpInput: any = buffer;
    let sharpOptions: any = {};

    // If it's an iOS HEIC file, handle decoding the raw pixel matrix first
    if (cleanMime.includes("heic") || cleanMime.includes("heif")) {
      const { width, height, data } = await heicDecode({ buffer });
      sharpInput = data;
      sharpOptions = { raw: { width, height, channels: 4 } };
    }

    // Process, scale down, and optimize payload footprint
    const converted = await sharp(sharpInput, sharpOptions)
      .resize({
        width: 1600,              // Cap maximum resolution to capture workspace details safely
        height: 1600,
        fit: "inside",            // Keep original proportions completely intact
        withoutEnlargement: true  // Prevent upscaling smaller mock assets
      })
      .jpeg({ quality: 85, progressive: true }) // Production-balanced baseline compression
      .toBuffer();

    return { buffer: converted, mimeType: "image/jpeg" };
  } catch (err) {
    throw new ImageAnalysisError(
      `Failed to convert/compress image asset (${mimeType}): ${err instanceof Error ? err.message : String(err)}.`,
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
    const { buffer: converted, mimeType: newMimeType } = await processAndCompressImage(buffer, mimeType);
    return { buffer: converted, mimeType: newMimeType, wasConverted: true, originalMimeType: mimeType };
  }

  if (needsVideoConversion(mimeType)) {
    const { buffer: converted, mimeType: newMimeType } = await convertMovToMp4(buffer);
    return { buffer: converted, mimeType: newMimeType, wasConverted: true, originalMimeType: mimeType };
  }

  // No conversion needed — pass through unchanged
  return { buffer, mimeType, wasConverted: false, originalMimeType: mimeType };
}