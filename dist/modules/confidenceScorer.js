import { createChildLogger } from "../utils/logger.js";
const log = createChildLogger("confidenceScorer");
/**
 * Compute confidence score from 1-4 based on pipeline success factors.
 *
 * +1 if website found
 * +1 if official logo used
 * +1 if all 3 clips succeeded
 * +1 if no fallbacks used
 */
export function computeConfidence(factors) {
    let score = 0;
    if (factors.websiteFound)
        score++;
    if (factors.officialLogo)
        score++;
    if (factors.allClipsSucceeded)
        score++;
    if (factors.noFallbacksUsed)
        score++;
    // Minimum score is 1
    const finalScore = Math.max(1, score);
    log.info({ factors, finalScore }, "Confidence computed");
    return finalScore;
}
//# sourceMappingURL=confidenceScorer.js.map