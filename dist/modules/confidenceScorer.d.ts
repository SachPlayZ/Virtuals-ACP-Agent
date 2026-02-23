import type { ConfidenceFactors } from "../types/job.types.js";
/**
 * Compute confidence score from 1-4 based on pipeline success factors.
 *
 * +1 if website found
 * +1 if official logo used
 * +1 if all 3 clips succeeded
 * +1 if no fallbacks used
 */
export declare function computeConfidence(factors: ConfidenceFactors): 1 | 2 | 3 | 4;
//# sourceMappingURL=confidenceScorer.d.ts.map