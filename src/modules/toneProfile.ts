import type { ToneProfile, UtilityClass } from "../types/job.types.js";
import { createChildLogger } from "../utils/logger.js";

const log = createChildLogger("toneProfile");

const TWENTY_FOUR_HOURS_SEC = 86_400;

/**
 * Known Tone Profile name mapping.
 * Key format: "utilityClass:intent:theme"
 */
const PROFILE_NAMES: Record<string, string> = {
    "protocol:launch:minimalist": "The Institutional Reveal",
    "protocol:launch:cyberpunk": "The Genesis Protocol",
    "protocol:hype:cyberpunk": "The Builder's Signal",
    "protocol:hype:minimalist": "The Quiet Powerhouse",
    "protocol:stealth:cyberpunk": "The Shadow Architect",
    "protocol:stealth:minimalist": "The Silent Deploy",
    "protocol:engage:space": "The Frontier Builder",
    "protocol:engage:minimalist": "The Open Standard",
    "culture:launch:retro-arcade": "The Pixel Drop",
    "culture:launch:space": "The Cosmic Debut",
    "culture:hype:retro-arcade": "The Hype Machine",
    "culture:hype:space": "The Galactic Wave",
    "culture:stealth:retro-arcade": "The Underground Legend",
    "culture:stealth:space": "The Dark Horse",
    "culture:engage:space": "The Community Arc",
    "culture:engage:retro-arcade": "The Player One Alliance",
    "hybrid:launch:cyberpunk": "The Dual Signal",
    "hybrid:launch:minimalist": "The Crossover Event",
    "hybrid:hype:cyberpunk": "The Momentum Stack",
    "hybrid:hype:space": "The Orbital Push",
    "hybrid:stealth:retro-arcade": "The Hidden Gem",
    "hybrid:engage:space": "The Coalition Build",
};

/**
 * Auto-resolve intent if not provided by user.
 * Under 24h → "launch", otherwise → "hype".
 */
function resolveIntent(userIntent?: string, tokenAgeSec?: number | null): string {
    if (userIntent) return userIntent.toLowerCase();
    if (tokenAgeSec !== null && tokenAgeSec !== undefined && tokenAgeSec < TWENTY_FOUR_HOURS_SEC) {
        return "launch";
    }
    return "hype";
}

/**
 * Auto-resolve theme if not provided by user.
 * Protocol/AI → minimalist or cyberpunk
 * Culture/Meme → retro-arcade or space
 * Hybrid → cyberpunk (default)
 */
function resolveTheme(userTheme?: string, utilityClass?: UtilityClass): string {
    if (userTheme) return userTheme.toLowerCase();
    switch (utilityClass) {
        case "protocol":
            return "minimalist";
        case "culture":
            return "retro-arcade";
        case "hybrid":
        default:
            return "cyberpunk";
    }
}

/**
 * Generate a profile name from the lookup table, or synthesize one dynamically.
 */
function resolveProfileName(utilityClass: UtilityClass, intent: string, theme: string): string {
    const key = `${utilityClass}:${intent}:${theme}`;
    if (PROFILE_NAMES[key]) return PROFILE_NAMES[key];

    // Dynamic name for custom combos
    const classLabel = utilityClass.charAt(0).toUpperCase() + utilityClass.slice(1);
    const intentLabel = intent.charAt(0).toUpperCase() + intent.slice(1);
    return `The ${classLabel} ${intentLabel}`;
}

/**
 * Resolve the full Tone Profile from user input + auto-detection.
 */
export function resolveToneProfile(
    utilityClass: UtilityClass,
    userIntent?: string,
    userTheme?: string,
    tokenAgeSec?: number | null
): ToneProfile {
    const intent = resolveIntent(userIntent, tokenAgeSec);
    const theme = resolveTheme(userTheme, utilityClass);
    const profileName = resolveProfileName(utilityClass, intent, theme);

    const profile: ToneProfile = {
        utilityClass,
        intent,
        theme,
        profileName,
    };

    log.info(
        { intent, theme, profileName, autoIntent: !userIntent, autoTheme: !userTheme },
        `Tone Profile resolved: "${profileName}"`
    );
    return profile;
}
