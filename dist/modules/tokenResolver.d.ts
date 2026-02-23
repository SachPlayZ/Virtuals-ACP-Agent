import type { TokenResolution } from "../types/job.types.js";
/**
 * Resolve token metadata via DexScreener (base chain), with graceful fallbacks.
 * Never throws — always returns a TokenResolution.
 *
 * Resolution chain:
 * 1. If ticker provided → DexScreener search, filter to base chain
 * 2. If contractAddress provided → DexScreener token lookup on base
 * 3. Fallback → use ticker only
 */
export declare function resolveToken(ticker?: string, contractAddress?: string): Promise<TokenResolution>;
//# sourceMappingURL=tokenResolver.d.ts.map