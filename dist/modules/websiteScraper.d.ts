import type { WebsiteScrapeResult } from "../types/job.types.js";
/**
 * Scrape a token's homepage for hero/about text.
 * Never throws — returns { found: false } on failure.
 */
export declare function scrapeWebsite(websiteUrl?: string): Promise<WebsiteScrapeResult>;
//# sourceMappingURL=websiteScraper.d.ts.map