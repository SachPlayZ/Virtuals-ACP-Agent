import { createChildLogger } from "../utils/logger.js";
const log = createChildLogger("input");
const KNOWN_INTENTS = ["launch", "hype", "stealth", "engage"];
const KNOWN_THEMES = ["cyberpunk", "space", "minimalist", "retro-arcade"];
export class InputValidationError extends Error {
    constructor(message) {
        super(message);
        this.name = "InputValidationError";
    }
}
/**
 * Validate and normalise raw request body into GenerateJobInput.
 * Intent and theme are both optional — they will be auto-resolved later.
 * Custom free-text values are accepted for both.
 */
export function validateInput(raw) {
    if (!raw || typeof raw !== "object") {
        throw new InputValidationError("Request body must be a JSON object");
    }
    const body = raw;
    if (!body.ticker && !body.contractAddress) {
        throw new InputValidationError("At least one of 'ticker' or 'contractAddress' is required");
    }
    if (body.ticker && typeof body.ticker !== "string") {
        throw new InputValidationError("'ticker' must be a string");
    }
    if (body.contractAddress && typeof body.contractAddress !== "string") {
        throw new InputValidationError("'contractAddress' must be a string");
    }
    // Intent: optional, accepts known presets or custom free-text
    let intent;
    if (body.intent) {
        if (typeof body.intent !== "string") {
            throw new InputValidationError("'intent' must be a string");
        }
        intent = body.intent.toLowerCase().trim();
        if (!KNOWN_INTENTS.includes(intent)) {
            log.info({ intent }, "Custom intent provided (not a preset)");
        }
    }
    // Theme: optional, accepts known presets or custom free-text
    let theme;
    if (body.theme) {
        if (typeof body.theme !== "string") {
            throw new InputValidationError("'theme' must be a string");
        }
        theme = body.theme.toLowerCase().trim();
        if (!KNOWN_THEMES.includes(theme)) {
            log.info({ theme }, "Custom theme provided (not a preset)");
        }
    }
    // Also accept legacy 'style' field as alias for 'theme'
    if (!theme && body.style) {
        if (typeof body.style === "string") {
            theme = body.style.toLowerCase().trim();
            log.info({ theme }, "Using legacy 'style' field as 'theme'");
        }
    }
    const input = {
        ticker: body.ticker,
        contractAddress: body.contractAddress,
        intent,
        theme,
    };
    log.info({ input }, "Input validated");
    return input;
}
//# sourceMappingURL=input.js.map