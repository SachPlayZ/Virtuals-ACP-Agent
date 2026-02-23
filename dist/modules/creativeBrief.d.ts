import type { CreativeBrief, TokenResolution, LogoResult, UtilityClass, WebsiteScrapeResult } from "../types/job.types.js";
/**
 * Build a Creative Brief from resolved pipeline data.
 * This is the single source of truth passed to all generators.
 */
export declare function buildCreativeBrief(ticker: string, token: TokenResolution, logo: LogoResult, utilityClass: UtilityClass, website: WebsiteScrapeResult): CreativeBrief;
//# sourceMappingURL=creativeBrief.d.ts.map