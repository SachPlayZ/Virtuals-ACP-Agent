import type { GenerateJobInput, CampaignIntent, VisualStyle } from "../types/job.types.js";
import { createChildLogger } from "../utils/logger.js";

const log = createChildLogger("input");

const VALID_INTENTS: CampaignIntent[] = ["launch", "announcement", "community"];
const VALID_STYLES: VisualStyle[] = ["cyberpunk", "space", "minimalist", "retro"];

export class InputValidationError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "InputValidationError";
    }
}

export function validateInput(raw: unknown): GenerateJobInput {
    if (!raw || typeof raw !== "object") {
        throw new InputValidationError("Request body must be a JSON object");
    }

    const body = raw as Record<string, unknown>;

    if (!body.ticker && !body.contractAddress) {
        throw new InputValidationError(
            "At least one of 'ticker' or 'contractAddress' is required"
        );
    }

    if (body.ticker && typeof body.ticker !== "string") {
        throw new InputValidationError("'ticker' must be a string");
    }

    if (body.contractAddress && typeof body.contractAddress !== "string") {
        throw new InputValidationError("'contractAddress' must be a string");
    }

    // Intent: optional, defaults to "launch"
    let intent: CampaignIntent = "launch";
    if (body.intent) {
        if (!VALID_INTENTS.includes(body.intent as CampaignIntent)) {
            throw new InputValidationError(
                `'intent' must be one of: ${VALID_INTENTS.join(", ")}`
            );
        }
        intent = body.intent as CampaignIntent;
    }

    // Style: optional, defaults to "cyberpunk"
    let style: VisualStyle = "cyberpunk";
    if (body.style) {
        if (!VALID_STYLES.includes(body.style as VisualStyle)) {
            throw new InputValidationError(
                `'style' must be one of: ${VALID_STYLES.join(", ")}`
            );
        }
        style = body.style as VisualStyle;
    }

    const input: GenerateJobInput = {
        ticker: body.ticker as string | undefined,
        contractAddress: body.contractAddress as string | undefined,
        intent,
        style,
    };

    log.info({ input }, "Input validated");
    return input;
}
