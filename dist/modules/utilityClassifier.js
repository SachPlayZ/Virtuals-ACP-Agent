import { createChildLogger } from "../utils/logger.js";
const log = createChildLogger("utilityClassifier");
const PROTOCOL_SIGNALS = [
    "ai", "neural", "infrastructure", "protocol", "agent",
    "chain", "defi", "oracle", "layer", "rollup", "zk",
    "bridge", "swap", "dao", "governance", "staking",
    "validator", "node", "sdk", "api", "smart contract",
];
const CULTURE_SIGNALS = [
    "meme", "community", "moon", "dog", "vibes",
    "pepe", "degen", "ape", "frog", "cat",
    "nft", "pfp", "wagmi", "gm", "fren",
    "shib", "wojak", "chad",
];
/**
 * Classify a token's utility from its description and project name.
 * Scans for keyword signals and returns protocol / culture / hybrid.
 */
export function classifyUtility(description, projectName) {
    const text = `${projectName} ${description}`.toLowerCase();
    let protocolHits = 0;
    let cultureHits = 0;
    for (const s of PROTOCOL_SIGNALS) {
        if (text.includes(s))
            protocolHits++;
    }
    for (const s of CULTURE_SIGNALS) {
        if (text.includes(s))
            cultureHits++;
    }
    let result;
    if (protocolHits > 0 && cultureHits > 0) {
        result = protocolHits >= cultureHits ? "hybrid" : "hybrid";
    }
    else if (protocolHits > 0) {
        result = "protocol";
    }
    else if (cultureHits > 0) {
        result = "culture";
    }
    else {
        // No signals — default to hybrid
        result = "hybrid";
    }
    log.info({ protocolHits, cultureHits, result }, `Utility classified as "${result}"`);
    return result;
}
//# sourceMappingURL=utilityClassifier.js.map