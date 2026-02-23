import axios from "axios";
import sharp from "sharp";
import ColorThief from "colorthief";
import { createChildLogger } from "../utils/logger.js";
import { withRetry } from "../utils/retry.js";
import { uploadBuffer } from "./assetUploader.js";
const log = createChildLogger("logoManager");
/**
 * Fetch logo and extract brand colors.
 * If no logo URL → generate SVG placeholder.
 * Never throws — always returns a LogoResult.
 */
export async function manageLogo(ticker, logoUrl) {
    let logoBuffer;
    if (logoUrl) {
        try {
            logoBuffer = await withRetry(() => downloadImage(logoUrl), { label: "logo-download", maxRetries: 2 });
            log.info({ logoUrl }, "Official logo downloaded");
        }
        catch (err) {
            log.warn({ logoUrl, error: err }, "Logo download failed, using placeholder");
            logoBuffer = await createPlaceholderLogo(ticker);
        }
    }
    else {
        log.info("No logo URL, generating placeholder");
        logoBuffer = await createPlaceholderLogo(ticker);
    }
    // Ensure it's PNG for consistency
    const pngBuffer = await sharp(logoBuffer).png().toBuffer();
    // Extract brand colors from the image
    const brandColors = await extractColors(pngBuffer);
    // Upload to S3
    const key = `logos/${ticker.toLowerCase()}-${Date.now()}.png`;
    const finalLogoUrl = await uploadBuffer(key, pngBuffer, "image/png");
    log.info({ finalLogoUrl, brandColors }, "Logo processed");
    return { finalLogoUrl, brandColors };
}
async function downloadImage(url) {
    const res = await axios.get(url, {
        responseType: "arraybuffer",
        timeout: 15000,
    });
    return Buffer.from(res.data);
}
async function createPlaceholderLogo(ticker) {
    const svg = `<svg width="512" height="512" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" style="stop-color:#6366f1"/>
        <stop offset="100%" style="stop-color:#8b5cf6"/>
      </linearGradient>
    </defs>
    <rect width="512" height="512" rx="64" fill="url(#bg)"/>
    <text x="256" y="280" font-family="Arial,sans-serif" font-size="120" font-weight="bold"
          fill="white" text-anchor="middle" dominant-baseline="middle">
      ${ticker.toUpperCase().slice(0, 4)}
    </text>
  </svg>`;
    return sharp(Buffer.from(svg)).png().toBuffer();
}
/**
 * Extract dominant colors from PNG buffer using ColorThief.
 * Primary = most common color, Secondary = 2nd most common.
 */
async function extractColors(pngBuffer) {
    try {
        const fs = await import("fs/promises");
        const tmpPath = `/tmp/logo-${Date.now()}.png`;
        await fs.writeFile(tmpPath, pngBuffer);
        const dominant = await ColorThief.getColor(tmpPath);
        const palette = await ColorThief.getPalette(tmpPath, 5);
        await fs.unlink(tmpPath).catch(() => { });
        const primary = rgbToHex(dominant[0], dominant[1], dominant[2]);
        const secondary = palette && palette.length > 1
            ? rgbToHex(palette[1][0], palette[1][1], palette[1][2])
            : "#8b5cf6";
        return { primary, secondary };
    }
    catch (err) {
        log.warn({ error: err }, "Color extraction failed, using defaults");
        return { primary: "#6366f1", secondary: "#8b5cf6" };
    }
}
function rgbToHex(r, g, b) {
    return "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("");
}
//# sourceMappingURL=logoManager.js.map