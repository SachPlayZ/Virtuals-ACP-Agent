import { createChildLogger } from "./logger.js";
const log = createChildLogger("retry");
/**
 * Wraps an async function with retry logic.
 * Uses exponential backoff. Logs warnings on retry, logs error on final failure.
 */
export async function withRetry(fn, opts = {}) {
    const { maxRetries = 2, baseDelayMs = 1000, label = "operation" } = opts;
    let lastError;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            return await fn();
        }
        catch (err) {
            lastError = err;
            if (attempt < maxRetries) {
                const delay = baseDelayMs * Math.pow(2, attempt);
                log.warn({ attempt: attempt + 1, maxRetries, delay, label }, `Retry ${attempt + 1}/${maxRetries} for "${label}" — waiting ${delay}ms`);
                await new Promise((r) => setTimeout(r, delay));
            }
        }
    }
    log.error({ label, error: lastError }, `All ${maxRetries} retries exhausted for "${label}"`);
    throw lastError;
}
//# sourceMappingURL=retry.js.map