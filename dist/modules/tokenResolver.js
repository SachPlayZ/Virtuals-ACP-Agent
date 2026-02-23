import axios from "axios";
import { createChildLogger } from "../utils/logger.js";
import { withRetry } from "../utils/retry.js";
const log = createChildLogger("tokenResolver");
const DEXSCREENER_BASE = "https://api.dexscreener.com";
const TARGET_CHAIN = "base";
/**
 * Resolve token metadata via DexScreener (base chain), with graceful fallbacks.
 * Never throws — always returns a TokenResolution.
 *
 * Resolution chain:
 * 1. If ticker provided → DexScreener search, filter to base chain
 * 2. If contractAddress provided → DexScreener token lookup on base
 * 3. Fallback → use ticker only
 */
export async function resolveToken(ticker, contractAddress) {
    // Strategy 1: Search by ticker on DexScreener
    if (ticker) {
        try {
            const resolution = await withRetry(() => searchDexScreener(ticker), { label: "dexscreener-search", maxRetries: 2 });
            if (resolution) {
                log.info({ ticker, source: "dexscreener" }, "Token resolved via DexScreener search");
                return resolution;
            }
        }
        catch (err) {
            log.warn({ ticker, error: err }, "DexScreener search failed");
        }
    }
    // Strategy 2: Lookup by contract address on DexScreener
    if (contractAddress) {
        try {
            const resolution = await withRetry(() => lookupByAddress(contractAddress), { label: "dexscreener-address", maxRetries: 2 });
            if (resolution) {
                log.info({ contractAddress, source: "dexscreener" }, "Token resolved via DexScreener CA lookup");
                return resolution;
            }
        }
        catch (err) {
            log.warn({ contractAddress, error: err }, "DexScreener CA lookup failed");
        }
        // Accept user-provided CA as fallback
        log.info({ contractAddress }, "Using user-provided contract address");
        return {
            contractAddress,
            resolutionSource: "user",
        };
    }
    // Strategy 3: Full fallback
    log.warn("No token data available, using full fallback");
    return {
        resolutionSource: "fallback",
    };
}
/**
 * Search DexScreener for a token by ticker, filtering to base chain.
 */
async function searchDexScreener(ticker) {
    const res = await axios.get(`${DEXSCREENER_BASE}/latest/dex/search`, {
        params: { q: ticker },
        timeout: 10000,
    });
    const pairs = res.data.pairs;
    if (!pairs || pairs.length === 0)
        return null;
    // Find a pair on the target chain matching the ticker
    const match = pairs.find((p) => p.chainId === TARGET_CHAIN &&
        p.baseToken.symbol.toLowerCase() === ticker.toLowerCase());
    if (!match) {
        // Try any base chain pair
        const basePair = pairs.find((p) => p.chainId === TARGET_CHAIN);
        if (!basePair)
            return null;
        return extractFromPair(basePair);
    }
    return extractFromPair(match);
}
/**
 * Lookup token by contract address on base chain.
 */
async function lookupByAddress(contractAddress) {
    const res = await axios.get(`${DEXSCREENER_BASE}/tokens/v1/${TARGET_CHAIN}/${contractAddress}`, { timeout: 10000 });
    const pairs = res.data.pairs;
    if (!pairs || pairs.length === 0)
        return null;
    return extractFromPair(pairs[0]);
}
/**
 * Extract TokenResolution from a DexScreener pair object.
 * Now includes: projectName, socialLinks, pairCreatedAt.
 */
function extractFromPair(pair) {
    const logoUrl = pair.info?.imageUrl || undefined;
    const websiteUrl = pair.info?.websites?.[0]?.url || undefined;
    const contractAddress = pair.baseToken.address || undefined;
    const projectName = pair.baseToken.name || undefined;
    const pairCreatedAt = pair.pairCreatedAt || undefined;
    // Extract social links
    const socialLinks = { website: websiteUrl };
    if (pair.info?.socials) {
        for (const social of pair.info.socials) {
            const t = social.type?.toLowerCase();
            if (t === "twitter" || t === "x") {
                socialLinks.twitter = social.url;
            }
            else if (t === "telegram") {
                socialLinks.telegram = social.url;
            }
            else if (t === "discord") {
                socialLinks.discord = social.url;
            }
        }
    }
    return {
        projectName,
        logoUrl,
        contractAddress,
        websiteUrl,
        socialLinks,
        pairCreatedAt,
        resolutionSource: "dexscreener",
    };
}
//# sourceMappingURL=tokenResolver.js.map