import type { GenerateJobInput } from "../types/job.types.js";
export declare class InputValidationError extends Error {
    constructor(message: string);
}
/**
 * Validate and normalise raw request body into GenerateJobInput.
 * Intent and theme are both optional — they will be auto-resolved later.
 * Custom free-text values are accepted for both.
 */
export declare function validateInput(raw: unknown): GenerateJobInput;
//# sourceMappingURL=input.d.ts.map