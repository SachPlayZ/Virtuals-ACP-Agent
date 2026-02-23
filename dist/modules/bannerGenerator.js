import axios from "axios";
import OpenAI from "openai";
import sharp from "sharp";
import { createChildLogger } from "../utils/logger.js";
import { withRetry } from "../utils/retry.js";
import { uploadBuffer } from "./assetUploader.js";
const log = createChildLogger("bannerGenerator");
/**
 * Get the Shotstack API base URL depending on environment.
 */
function getShotstackBase() {
    const env = process.env.SHOTSTACK_ENV || "stage";
    return `https://api.shotstack.io/edit/${env}`;
}
/**
 * Generate a hero banner:
 * 1. Generate background via OpenAI DALL-E 3 (prompt built from Creative Brief + Tone Profile)
 * 2. Composite with logo + tagline via Shotstack
 * 3. Upload 1200×628 JPG to S3
 */
export async function generateBanner(ticker, visualThemes, logo, tagline, brief, tone) {
    // Step 1: Generate background image via DALL-E 3
    let bgUrl;
    try {
        const dallePrompt = buildDallePrompt(visualThemes, brief, tone);
        bgUrl = await withRetry(() => generateBackground(dallePrompt), { label: "dalle-bg-gen", maxRetries: 2 });
        log.info({ bgUrl }, "Background generated via DALL-E 3");
    }
    catch (err) {
        log.warn({ error: err }, "Background generation failed, using fallback");
        bgUrl = await generateFallbackBackground(ticker, logo.brandColors);
    }
    // Step 2: Composite via Shotstack
    let compositeUrl;
    try {
        compositeUrl = await withRetry(() => compositeViaShotstack(bgUrl, logo.finalLogoUrl, tagline, logo.brandColors), { label: "shotstack-banner", maxRetries: 2 });
        log.info({ compositeUrl }, "Banner composited via Shotstack");
    }
    catch (err) {
        log.warn({ error: err }, "Shotstack composite failed, using background only");
        compositeUrl = bgUrl;
    }
    // Step 3: Download, resize to 1200×628, and upload
    const finalUrl = await finalizeAndUpload(compositeUrl, ticker);
    return { heroBannerUrl: finalUrl };
}
/**
 * Build a rich DALL-E prompt from Creative Brief + Tone Profile + Visual Themes.
 */
function buildDallePrompt(visualThemes, brief, tone) {
    return `${visualThemes.image_prompt}. 
Style: ${tone.theme} aesthetic, ${tone.profileName} tone. 
Brand colors: ${brief.brandColors.primary} and ${brief.brandColors.secondary}. 
Project: ${brief.projectName}. 
Ultra high resolution, cinematic, no text, no typography, no letters, no words.`;
}
async function generateBackground(prompt) {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const response = await client.images.generate({
        model: "dall-e-3",
        prompt,
        n: 1,
        size: "1792x1024",
        quality: "hd",
    });
    const imageUrl = response.data?.[0]?.url;
    if (!imageUrl)
        throw new Error("No image URL in DALL-E response");
    return imageUrl;
}
async function generateFallbackBackground(ticker, colors) {
    // Generate a gradient placeholder and upload to S3
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
    const buffer = await sharp(Buffer.from(svg)).jpeg({ quality: 90 }).toBuffer();
    const key = `banners/fallback-${ticker.toLowerCase()}-${Date.now()}.jpg`;
    return uploadBuffer(key, buffer, "image/jpeg");
}
async function compositeViaShotstack(bgUrl, logoUrl, tagline, colors) {
    const apiKey = process.env.SHOTSTACK_API_KEY;
    if (!apiKey)
        throw new Error("SHOTSTACK_API_KEY not set");
    const timeline = {
        background: "#000000",
        tracks: [
            {
                clips: [
                    {
                        asset: {
                            type: "html",
                            html: `<div style="font-family:Arial,sans-serif;color:white;text-align:center;padding:20px;">
                <p style="font-size:28px;font-weight:bold;text-shadow:2px 2px 8px rgba(0,0,0,0.8);">${tagline}</p>
              </div>`,
                            width: 800,
                            height: 100,
                        },
                        start: 0,
                        length: 1,
                        position: "bottom",
                        offset: { y: -0.05 },
                    },
                ],
            },
            {
                clips: [
                    {
                        asset: { type: "image", src: logoUrl },
                        start: 0,
                        length: 1,
                        fit: "none",
                        scale: 0.3,
                        position: "center",
                        offset: { y: 0.05 },
                    },
                ],
            },
            {
                clips: [
                    {
                        asset: { type: "image", src: bgUrl },
                        start: 0,
                        length: 1,
                        fit: "cover",
                    },
                ],
            },
        ],
    };
    const renderRes = await axios.post(`${getShotstackBase()}/render`, {
        timeline,
        output: {
            format: "jpg",
            resolution: "hd",
            size: { width: 1200, height: 628 },
        },
    }, {
        headers: {
            "x-api-key": apiKey,
            "Content-Type": "application/json",
        },
        timeout: 30000,
    });
    const renderId = renderRes.data?.response?.id;
    if (!renderId)
        throw new Error("No render ID from Shotstack");
    return await pollShotstackRender(renderId, apiKey);
}
async function pollShotstackRender(renderId, apiKey) {
    const maxWait = 120_000;
    const interval = 5_000;
    const start = Date.now();
    while (Date.now() - start < maxWait) {
        const res = await axios.get(`${getShotstackBase()}/render/${renderId}`, {
            headers: { "x-api-key": apiKey },
            timeout: 10000,
        });
        const status = res.data?.response?.status;
        if (status === "done") {
            return res.data.response.url;
        }
        if (status === "failed") {
            throw new Error(`Shotstack render failed: ${renderId}`);
        }
        await new Promise((r) => setTimeout(r, interval));
    }
    throw new Error(`Shotstack render timed out: ${renderId}`);
}
async function finalizeAndUpload(imageUrl, ticker) {
    // Download the image
    const res = await axios.get(imageUrl, {
        responseType: "arraybuffer",
        timeout: 30000,
    });
    // Resize to exact dimensions and convert to JPEG
    const buffer = await sharp(Buffer.from(res.data))
        .resize(1200, 628, { fit: "cover" })
        .jpeg({ quality: 90 })
        .toBuffer();
    const key = `banners/${ticker.toLowerCase()}-${Date.now()}.jpg`;
    return uploadBuffer(key, buffer, "image/jpeg");
}
//# sourceMappingURL=bannerGenerator.js.map