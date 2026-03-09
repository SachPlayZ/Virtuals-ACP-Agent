import axios from "axios";
import OpenAI from "openai";
import sharp from "sharp";
import type { BannerResult, VisualThemes, LogoResult, CreativeBrief, ToneProfile } from "../types/job.types.js";
import { createChildLogger } from "../utils/logger.js";
import { withRetry } from "../utils/retry.js";
import { uploadBuffer } from "./assetUploader.js";

const log = createChildLogger("bannerGenerator");

/**
 * Generate a hero banner:
 * 1. Download the token logo
 * 2. Pass the logo + a rich prompt to gpt-image-1 (images.edit) so the banner
 *    organically integrates the logo into the design — no crude pasting
 * 3. Upload the final 1200×628 JPG to S3
 *
 * Fallback chain:
 *   gpt-image-1 edit → DALL-E 3 generate (no logo) → gradient fallback
 */
export async function generateBanner(
    ticker: string,
    visualThemes: VisualThemes,
    logo: LogoResult,
    tagline: string,
    brief: CreativeBrief,
    tone: ToneProfile
): Promise<BannerResult> {
    let bannerBuffer: Buffer | null = null;

    // Primary: gpt-image-1 edit with logo as reference image
    try {
        bannerBuffer = await withRetry(
            () => generateBannerWithLogo(visualThemes, logo, tagline, brief, tone),
            { label: "gpt-image-banner", maxRetries: 2 }
        );
        log.info("Banner generated via gpt-image-1 with integrated logo");
    } catch (err: any) {
        log.warn({ error: err.message }, "gpt-image-1 banner failed, falling back to DALL-E 3");
    }

    // Fallback: DALL-E 3 text-to-image (no logo integration)
    if (!bannerBuffer) {
        try {
            const fallbackPrompt = buildFallbackPrompt(visualThemes, brief, tone, tagline);
            bannerBuffer = await withRetry(
                () => generateWithoutLogo(fallbackPrompt),
                { label: "gpt-image-fallback", maxRetries: 2 }
            );
            log.info("Banner generated via gpt-image-1 fallback (no logo)");
        } catch (err: any) {
            log.warn({ error: err.message }, "gpt-image-1 fallback failed, using gradient");
        }
    }

    // Last resort: gradient placeholder
    if (!bannerBuffer) {
        bannerBuffer = await generateFallbackGradient(ticker, logo.brandColors);
        log.info("Using gradient fallback banner");
    }

    // Resize to exact banner dimensions and upload
    const finalBuffer = await sharp(bannerBuffer)
        .resize(1200, 628, { fit: "cover" })
        .jpeg({ quality: 90 })
        .toBuffer();

    const key = `banners/${ticker.toLowerCase()}-${Date.now()}.jpg`;
    const finalUrl = await uploadBuffer(key, finalBuffer, "image/jpeg");

    return { heroBannerUrl: finalUrl };
}

/**
 * Downloads the logo, then calls gpt-image-1 images.edit with the logo as
 * a reference image. The model generates a full banner design that naturally
 * blends the logo into the scene, matching colors and style.
 */
async function generateBannerWithLogo(
    visualThemes: VisualThemes,
    logo: LogoResult,
    tagline: string,
    brief: CreativeBrief,
    tone: ToneProfile
): Promise<Buffer> {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    // Download the logo as a buffer
    log.info({ logoUrl: logo.finalLogoUrl }, "Downloading logo for banner generation");
    const logoRes = await axios.get(logo.finalLogoUrl, {
        responseType: "arraybuffer",
        timeout: 15000,
    });

    // Convert to PNG for gpt-image-1 compatibility (it requires png/webp/jpg)
    const logoPng = await sharp(Buffer.from(logoRes.data))
        .png()
        .toBuffer();

    const logoFile = new File([new Uint8Array(logoPng)], "logo.png", { type: "image/png" });

    const prompt = buildEditPrompt(visualThemes, logo, tagline, brief, tone);
    log.info({ promptLength: prompt.length }, "Sending logo + prompt to gpt-image-1");

    const response = await client.images.edit({
        model: "gpt-image-1",
        image: logoFile,
        prompt,
        n: 1,
        size: "1536x1024",
        quality: "high",
    });

    const b64 = response.data?.[0]?.b64_json;
    if (!b64) throw new Error("No b64_json in gpt-image-1 response");

    return Buffer.from(b64, "base64");
}

/**
 * Build a detailed prompt for gpt-image-1 edit mode.
 * The prompt instructs the model to create a complete banner design that
 * organically integrates the provided logo image.
 */
function buildEditPrompt(
    visualThemes: VisualThemes,
    logo: LogoResult,
    tagline: string,
    brief: CreativeBrief,
    tone: ToneProfile
): string {
    return `Create a stunning, professional hero banner (landscape, 1536x1024) for a crypto token launch.

LOGO INTEGRATION:
- The attached image is the token's logo. Integrate it naturally into the banner design.
- Place the logo prominently but organically — it should feel like part of the design, not pasted on top.
- The logo should be clearly recognizable and undistorted.

DESIGN DIRECTION:
${visualThemes.image_prompt}

STYLE & AESTHETIC:
- Theme: ${tone.theme}
- Tone: ${tone.profileName}
- Brand colors: primary ${brief.brandColors.primary}, secondary ${brief.brandColors.secondary}
- Use these colors throughout the design — in gradients, lighting, accents, and atmospheric effects.

TEXT TO INCLUDE:
- Include the tagline "${tagline}" in a clean, modern font that complements the design.
- The text should be legible, well-positioned, and styled to match the overall aesthetic.

PROJECT CONTEXT:
- Project: ${brief.projectName}
- ${brief.oneLiner || ""}

QUALITY:
- Ultra high resolution, cinematic lighting, professional grade.
- Modern, premium feel — this should look like a top-tier crypto project launch banner.
- The composition should be balanced and visually striking.`;
}

/**
 * Build a gpt-image-1 prompt for text-to-image fallback (no logo integration).
 */
function buildFallbackPrompt(
    visualThemes: VisualThemes,
    brief: CreativeBrief,
    tone: ToneProfile,
    tagline: string
): string {
    return `Create a professional crypto token launch banner (landscape, 1536x1024).

${visualThemes.image_prompt}

Style: ${tone.theme} aesthetic, ${tone.profileName} tone.
Brand colors: primary ${brief.brandColors.primary}, secondary ${brief.brandColors.secondary}.
Project: ${brief.projectName}.
Include the text "${tagline}" in clean modern typography.
Ultra high resolution, cinematic lighting, professional grade, visually striking.`;
}

/**
 * gpt-image-1 text-to-image fallback (no logo, just a banner with text).
 * Returns base64-decoded buffer.
 */
async function generateWithoutLogo(prompt: string): Promise<Buffer> {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    log.info({ promptLength: prompt.length }, "Sending text-only prompt to gpt-image-1");

    const response = await client.images.generate({
        model: "gpt-image-1",
        prompt,
        n: 1,
        size: "1536x1024",
        quality: "high",
    });

    const b64 = response.data?.[0]?.b64_json;
    if (!b64) throw new Error("No b64_json in gpt-image-1 response");

    return Buffer.from(b64, "base64");
}

/**
 * Last resort: generate a gradient image with the ticker text.
 */
async function generateFallbackGradient(
    ticker: string,
    colors: { primary: string; secondary: string }
): Promise<Buffer> {
    const svg = `<svg width="1200" height="628" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" style="stop-color:${colors.primary}"/>
        <stop offset="100%" style="stop-color:${colors.secondary}"/>
      </linearGradient>
      <radialGradient id="glow" cx="50%" cy="50%" r="60%">
        <stop offset="0%" style="stop-color:white;stop-opacity:0.1"/>
        <stop offset="100%" style="stop-color:transparent;stop-opacity:0"/>
      </radialGradient>
    </defs>
    <rect width="1200" height="628" fill="url(#bg)"/>
    <rect width="1200" height="628" fill="url(#glow)"/>
    <text x="600" y="340" font-family="Arial,sans-serif" font-size="72" font-weight="bold"
          fill="white" text-anchor="middle" opacity="0.3">
      $${ticker.toUpperCase()}
    </text>
  </svg>`;

    return sharp(Buffer.from(svg)).jpeg({ quality: 90 }).toBuffer();
}
