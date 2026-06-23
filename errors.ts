/**
 * errors.ts
 *
 * Custom error types + retry logic for external API calls (Gemini).
 * Centralizing this means imageAnalysis.ts stays clean and server.ts can
 * map every error type to the right HTTP status code in one place.
 */

// ─── Error types ─────────────────────────────────────────────────────────────

export class ImageAnalysisError extends Error {
    public readonly cause?: unknown;
    public readonly retryable: boolean;
  
    constructor(message: string, options?: { cause?: unknown; retryable?: boolean }) {
      super(message);
      this.name = "ImageAnalysisError";
      this.cause = options?.cause;
      this.retryable = options?.retryable ?? false;
    }
  }
  
  export class GeminiResponseParseError extends Error {
    public readonly rawResponse: string;
  
    constructor(message: string, rawResponse: string) {
      super(message);
      this.name = "GeminiResponseParseError";
      this.rawResponse = rawResponse;
    }
  }
  
  export class GeminiTimeoutError extends Error {
    constructor(message = "Gemini API call timed out") {
      super(message);
      this.name = "GeminiTimeoutError";
    }
  }
  
  // ─── Retry-with-backoff ──────────────────────────────────────────────────────
  
  export interface RetryOptions {
    maxRetries: number;
    baseDelayMs: number;
    /** Called before each retry attempt, useful for logging. */
    onRetry?: (attempt: number, error: unknown) => void;
  }
  
  /**
   * Determines whether an error from the Gemini SDK is worth retrying.
   * Retryable: rate limits (429), server errors (5xx), network timeouts.
   * Not retryable: invalid API key (401/403), malformed request (400), bad image data.
   */
  export function isRetryableError(error: unknown): boolean {
    if (error instanceof GeminiTimeoutError) return true;
  
    const err = error as { status?: number; code?: string; message?: string };
    const status = err?.status;
  
    if (status === 429) return true;                     // rate limited
    if (status !== undefined && status >= 500) return true; // server error
    if (err?.code === "ECONNRESET" || err?.code === "ETIMEDOUT") return true;
  
    // Some SDK errors surface as plain message strings
    const msg = (err?.message ?? "").toLowerCase();
    if (msg.includes("rate limit") || msg.includes("timeout") || msg.includes("503") || msg.includes("overloaded")) {
      return true;
    }
  
    return false;
  }
  
  /**
   * Runs `fn` with exponential backoff + jitter on retryable failures.
   * Non-retryable errors are thrown immediately without consuming retry attempts.
   */
  export async function withRetry<T>(
    fn: () => Promise<T>,
    options: RetryOptions
  ): Promise<T> {
    let lastError: unknown;
  
    for (let attempt = 0; attempt <= options.maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;
  
        const isLastAttempt = attempt === options.maxRetries;
        if (!isRetryableError(error) || isLastAttempt) {
          throw error;
        }
  
        options.onRetry?.(attempt + 1, error);
  
        const exponential = options.baseDelayMs * Math.pow(2, attempt);
        const jitter = Math.random() * options.baseDelayMs;
        await sleep(exponential + jitter);
      }
    }
  
    // Unreachable, but keeps TypeScript satisfied
    throw lastError;
  }
  
  function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  /**
   * Wraps a promise with a timeout, throwing GeminiTimeoutError if it doesn't resolve in time.
   */
  export function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new GeminiTimeoutError()), timeoutMs)
      ),
    ]);
  }