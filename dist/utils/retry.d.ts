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
export declare function withRetry<T>(fn: () => Promise<T>, opts?: RetryOptions): Promise<T>;
//# sourceMappingURL=retry.d.ts.map