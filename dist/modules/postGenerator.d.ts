import type { CreativeBrief, ToneProfile, PostGenerationResult, WebsiteScrapeResult } from "../types/job.types.js";
/**
 * Generate 3 X posts + visual themes using OpenAI GPT.
 * Driven by the Creative Brief + Tone Profile.
 */
export declare function generatePosts(brief: CreativeBrief, tone: ToneProfile, website: WebsiteScrapeResult): Promise<PostGenerationResult>;
//# sourceMappingURL=postGenerator.d.ts.map