import { createChildLogger } from "./logger.js";

const log = createChildLogger("retry");

export interface RetryOptions {
    /** Maximum number of retries (default: 2) */
    maxRetries?: number;
    /** Base delay in ms between retries — doubled each attempt (default: 1000) */
    baseDelayMs?: number;
    /** Label for log messages */
    label?: string;
}

/**
 * Wraps an async function with retry logic.
 * Uses exponential backoff. Logs warnings on retry, logs error on final failure.
 */
export async function withRetry<T>(
    fn: () => Promise<T>,
    opts: RetryOptions = {}
): Promise<T> {
    const { maxRetries = 2, baseDelayMs = 1000, label = "operation" } = opts;

    let lastError: unknown;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            return await fn();
        } catch (err) {
            lastError = err;
            if (attempt < maxRetries) {
                const delay = baseDelayMs * Math.pow(2, attempt);
                log.warn(
                    { attempt: attempt + 1, maxRetries, delay, label },
                    `Retry ${attempt + 1}/${maxRetries} for "${label}" — waiting ${delay}ms`
                );
                await new Promise((r) => setTimeout(r, delay));
            }
        }
    }

    log.error(
        { label, error: lastError },
        `All ${maxRetries} retries exhausted for "${label}"`
    );
    throw lastError;
}
