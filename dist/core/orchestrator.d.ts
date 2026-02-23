import type { GenerateJobInput, GenerateJobOutput } from "../types/job.types.js";
/**
 * Master orchestrator — executes the 3-stage pipeline.
 *
 * STAGE 1: Data Resolution (sequential)
 *   → resolveToken → scrapeWebsite → manageLogo → classifyUtility → buildCreativeBrief
 *
 * STAGE 2: Intent & Theme Resolution
 *   → resolveToneProfile
 *
 * STAGE 3: Coordinated Generation (parallel)
 *   → generatePosts + generateBanner + generateVideo
 *
 * Always returns a valid GenerateJobOutput. Never throws to caller.
 */
export declare function runPipeline(input: GenerateJobInput): Promise<GenerateJobOutput>;
//# sourceMappingURL=orchestrator.d.ts.map