export interface Timer {
    /** Returns elapsed time in seconds */
    elapsed(): number;
    /** Returns elapsed time in milliseconds */
    elapsedMs(): number;
}

export function startTimer(): Timer {
    const start = Date.now();
    return {
        elapsed() {
            return (Date.now() - start) / 1000;
        },
        elapsedMs() {
            return Date.now() - start;
        },
    };
}
