// ============================================================
// SHEN AI — Retry Utility with Exponential Backoff
// ============================================================

export interface RetryOptions {
    maxRetries: number;
    initialDelayMs: number;
    maxDelayMs: number;
    backoffFactor: number;
    retryableErrors?: (error: Error) => boolean;
}

const DEFAULT_RETRY_OPTIONS: RetryOptions = {
    maxRetries: 3,
    initialDelayMs: 1000,
    maxDelayMs: 10000,
    backoffFactor: 2,
    retryableErrors: (error: Error) => {
        // Retry on network errors, rate limits, and server errors
        const message = error.message.toLowerCase();
        return (
            message.includes("timeout") ||
            message.includes("network") ||
            message.includes("econnreset") ||
            message.includes("econnrefused") ||
            message.includes("etimedout") ||
            message.includes("rate limit") ||
            message.includes("429") ||
            message.includes("500") ||
            message.includes("502") ||
            message.includes("503") ||
            message.includes("504")
        );
    },
};

/**
 * Sleep for a specified duration.
 */
function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Calculate delay with exponential backoff and jitter.
 */
function calculateDelay(attempt: number, options: RetryOptions): number {
    const exponentialDelay = options.initialDelayMs * Math.pow(options.backoffFactor, attempt);
    const jitter = Math.random() * 0.3 * exponentialDelay; // 0-30% jitter
    const delay = Math.min(exponentialDelay + jitter, options.maxDelayMs);
    return delay;
}

/**
 * Execute a function with retry logic and exponential backoff.
 * 
 * @param fn - The async function to execute
 * @param options - Retry configuration options
 * @returns The result of the function
 * @throws The last error if all retries fail
 */
export async function withRetry<T>(
    fn: () => Promise<T>,
    options: Partial<RetryOptions> = {}
): Promise<T> {
    const opts: RetryOptions = { ...DEFAULT_RETRY_OPTIONS, ...options };
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
        try {
            return await fn();
        } catch (error) {
            lastError = error as Error;

            // Check if we should retry
            const shouldRetry = opts.retryableErrors
                ? opts.retryableErrors(lastError)
                : true;

            // Don't retry if not retryable or max retries reached
            if (!shouldRetry || attempt >= opts.maxRetries) {
                throw lastError;
            }

            // Calculate delay and wait
            const delay = calculateDelay(attempt, opts);
            await sleep(delay);
        }
    }

    throw lastError || new Error("Retry failed with unknown error");
}

/**
 * Create a retryable version of a function.
 * 
 * @param fn - The async function to make retryable
 * @param options - Retry configuration options
 * @returns A new function that will retry on failure
 */
export function makeRetryable<TArgs extends any[], TResult>(
    fn: (...args: TArgs) => Promise<TResult>,
    options: Partial<RetryOptions> = {}
): (...args: TArgs) => Promise<TResult> {
    return (...args: TArgs) => withRetry(() => fn(...args), options);
}