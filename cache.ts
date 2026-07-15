/**
 * cache.ts
 *
 * In-memory cache for image analysis results, keyed by a hash of
 * (photo bytes + taskId + relevant user params).
 *
 * Why include params in the cache key: the same photo analyzed for "tv_installation"
 * vs "other" produces different results, and userParams are injected into the prompt
 * as context — so the cache key must reflect everything that affects the AI's output.
 *
 * This is process-local (resets on server restart). For multi-instance deployments,
 * swap this for Redis — the interface (get/set) stays identical, only the
 * implementation changes.
 */

import { createHash } from "crypto";
import { MediaAnalysisResult, TaskParams } from "./types";

interface CacheEntry {
  value: MediaAnalysisResult;
  expiresAt: number;
}

const store = new Map<string, CacheEntry>();

// Periodic cleanup so the map doesn't grow unbounded with expired entries
const CLEANUP_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes
let cleanupTimer: NodeJS.Timeout | null = null;

function startCleanupTimer() {
  if (cleanupTimer) return;
  cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store.entries()) {
      if (entry.expiresAt <= now) store.delete(key);
    }
  }, CLEANUP_INTERVAL_MS);
  // Don't keep the process alive just for cleanup in scripts/tests
  cleanupTimer.unref?.();
}

/**
 * Builds a stable cache key from photo bytes + task + params.
 * Uses SHA-256 over the concatenated base64 strings (cheap relative to the
 * Gemini call it's protecting) plus a JSON-stable stringification of params.
 */
export function buildCacheKey(
  taskId: string,
  photoBase64List: string[],
  userParams: TaskParams
): string {
  const hash = createHash("sha256");
  hash.update(taskId);

  for (const photo of photoBase64List) {
    hash.update(photo);
  }

  // Sort keys for stability — {a:1,b:2} and {b:2,a:1} must hash identically
  const sortedParams = Object.keys(userParams)
    .sort()
    .reduce((acc, key) => {
      acc[key] = userParams[key];
      return acc;
    }, {} as TaskParams);

  hash.update(JSON.stringify(sortedParams));

  return hash.digest("hex");
}

export function getCached(key: string): MediaAnalysisResult | null {
  const entry = store.get(key);
  if (!entry) return null;

  if (entry.expiresAt <= Date.now()) {
    store.delete(key);
    return null;
  }

  return entry.value;
}

export function setCached(key: string, value: MediaAnalysisResult, ttlSeconds: number): void {
  if (ttlSeconds <= 0) return; // caching disabled

  startCleanupTimer();
  store.set(key, {
    value,
    expiresAt: Date.now() + ttlSeconds * 1000,
  });
}

/** For tests / debugging — clears the entire cache. */
export function clearCache(): void {
  store.clear();
}

/** For observability — current cache size. */
export function cacheSize(): number {
  return store.size;
}