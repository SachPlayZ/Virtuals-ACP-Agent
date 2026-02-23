import { createChildLogger } from "../utils/logger.js";
const log = createChildLogger("creativeBrief");
/**
 * Build a Creative Brief from resolved pipeline data.
 * This is the single source of truth passed to all generators.
 */
export function buildCreativeBrief(ticker, token, logo, utilityClass, website) {
    const projectName = token.projectName || ticker.toUpperCase();
    // One-liner: use first sentence of website text, or project name fallback
    let oneLiner = `${projectName} — a ${utilityClass} token on Base`;
    if (website.found && website.extractedText) {
        const firstSentence = website.extractedText.split(/[.!?]/)[0]?.trim();
        if (firstSentence && firstSentence.length > 10 && firstSentence.length <= 120) {
            oneLiner = firstSentence;
        }
    }
    // Token age in seconds (null if unknown)
    let tokenAgeSec = null;
    if (token.pairCreatedAt) {
        tokenAgeSec = Math.floor((Date.now() - token.pairCreatedAt) / 1000);
    }
    const brief = {
        projectName,
        ticker: ticker.toUpperCase(),
        utilityClass,
        oneLiner,
        logoUrl: logo.finalLogoUrl,
        brandColors: logo.brandColors,
        tokenAgeSec,
        socialLinks: token.socialLinks || {},
    };
    log.info({ projectName, utilityClass, tokenAgeSec, hasSocials: !!token.socialLinks }, "Creative Brief built");
    return brief;
}
//# sourceMappingURL=creativeBrief.js.map