import type { LogoResult } from "../types/job.types.js";
/**
 * Fetch logo and extract brand colors.
 * If no logo URL → generate SVG placeholder.
 * Never throws — always returns a LogoResult.
 */
export declare function manageLogo(ticker: string, logoUrl?: string): Promise<LogoResult>;
//# sourceMappingURL=logoManager.d.ts.map