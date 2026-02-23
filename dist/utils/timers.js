export function startTimer() {
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
//# sourceMappingURL=timers.js.map