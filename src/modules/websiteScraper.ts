import axios from "axios";
import * as cheerio from "cheerio";
import type { WebsiteScrapeResult } from "../types/job.types.js";
import { createChildLogger } from "../utils/logger.js";
import { withRetry } from "../utils/retry.js";

const log = createChildLogger("websiteScraper");
const MAX_EXTRACTED_CHARS = 1500;

/**
 * Scrape a token's homepage for hero/about text.
 * Never throws — returns { found: false } on failure.
 */
export async function scrapeWebsite(
    websiteUrl?: string
): Promise<WebsiteScrapeResult> {
    if (!websiteUrl) {
        log.info("No website URL provided");
        return { found: false };
    }

    try {
        const html = await withRetry(
            () => fetchPage(websiteUrl),
            { label: "website-scrape", maxRetries: 2 }
        );

        const extractedText = extractContent(html);

        if (!extractedText || extractedText.length < 20) {
            log.warn({ websiteUrl }, "Insufficient content extracted");
            return { found: false };
        }

        log.info(
            { websiteUrl, length: extractedText.length },
            "Website content extracted"
        );
        return { extractedText, found: true };
    } catch (err) {
        log.warn({ websiteUrl, error: err }, "Website scraping failed");
        return { found: false };
    }
}

async function fetchPage(url: string): Promise<string> {
    const res = await axios.get<string>(url, {
        timeout: 15000,
        maxRedirects: 3,
        headers: {
            "User-Agent":
                "Mozilla/5.0 (compatible; HypepackBot/1.0; +https://hypepack.io)",
            Accept: "text/html",
        },
        responseType: "text",
    });
    return res.data;
}

function extractContent(html: string): string {
    const $ = cheerio.load(html);

    // Remove scripts, styles, nav, footer
    $("script, style, nav, footer, header, noscript, iframe").remove();

    const sections: string[] = [];

    // Try hero section
    const heroSelectors = [
        '[class*="hero"]',
        '[id*="hero"]',
        '[class*="banner"]',
        '[class*="landing"]',
        "main > section:first-of-type",
        ".intro",
    ];

    for (const sel of heroSelectors) {
        const text = $(sel).first().text().trim();
        if (text && text.length > 30) {
            sections.push(cleanText(text));
            break;
        }
    }

    // Try about section
    const aboutSelectors = [
        '[class*="about"]',
        '[id*="about"]',
        '[class*="features"]',
        '[class*="description"]',
        "main > section:nth-of-type(2)",
    ];

    for (const sel of aboutSelectors) {
        const text = $(sel).first().text().trim();
        if (text && text.length > 30) {
            sections.push(cleanText(text));
            break;
        }
    }

    // Fallback: grab main or body text
    if (sections.length === 0) {
        const mainText =
            $("main").text().trim() || $("body").text().trim();
        if (mainText) {
            sections.push(cleanText(mainText));
        }
    }

    const combined = sections.join("\n\n");
    return combined.slice(0, MAX_EXTRACTED_CHARS);
}

function cleanText(text: string): string {
    return text
        .replace(/\s+/g, " ")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
}
