import axios from "axios";
import RunwayML from "@runwayml/sdk";
import type { VideoResult, VisualThemes, LogoResult } from "../types/job.types.js";
import { createChildLogger } from "../utils/logger.js";
import { withRetry } from "../utils/retry.js";
import { uploadBuffer } from "./assetUploader.js";

const log = createChildLogger("videoGenerator");

/**
 * Get the Shotstack API base URL depending on environment.
 * stage = sandbox (free, watermarked), v1 = production.
 */
function getShotstackBase(): string {
    const env = process.env.SHOTSTACK_ENV || "stage";
    return `https://api.shotstack.io/edit/${env}`;
}

/**
 * Generate a 5s launch video:
 * 1. Generate 3 clips in parallel via Runway Gen-4.5 (official SDK)
 * 2. Stitch clips + transitions + music via Shotstack
 * 3. Export 1920×1080 MP4, upload to S3
 */
export async function generateVideo(
    ticker: string,
    visualThemes: VisualThemes,
    logo: LogoResult,
    bannerUrl: string,
    style: string
): Promise<VideoResult> {
    // Step 1: Generate 3 clips in parallel via Runway Gen-4.5
    const clipPrompts = [
        visualThemes.clip1_prompt,
        visualThemes.clip2_prompt,
        visualThemes.clip3_prompt,
    ];

    const clipResults = await Promise.allSettled(
        clipPrompts.map((prompt, i) =>
            withRetry(
                () => generateRunwayClip(prompt),
                { label: `runway-clip-${i + 1}`, maxRetries: 1 }
            )
        )
    );

    const clips: (string | null)[] = clipResults.map((r, i) => {
        if (r.status === "fulfilled") {
            log.info({ clip: i + 1 }, "Clip generated");
            return r.value;
        }
        log.warn({ clip: i + 1, error: r.reason?.message || r.reason }, "Clip generation failed");
        return null;
    });

    const successfulClips = clips.filter((c): c is string => c !== null);
    const clipsSucceeded = successfulClips.length;

    if (clipsSucceeded === 0) {
        log.warn("All clips failed, generating fallback video");
        const fallbackUrl = await generateFallbackVideo(ticker, bannerUrl, logo, style);
        return { launchVideoUrl: fallbackUrl, clipsSucceeded: 0 };
    }

    // Step 2: Stitch via Shotstack
    let videoUrl: string;
    try {
        videoUrl = await withRetry(
            () => stitchViaShotstack(successfulClips, ticker, logo.brandColors, style),
            { label: "shotstack-video-stitch", maxRetries: 2 }
        );
        log.info({ videoUrl }, "Video stitched");
    } catch (err) {
        log.warn({ error: err }, "Shotstack stitching failed, using first clip");
        videoUrl = successfulClips[0];
    }

    // Step 3: Upload final video
    const finalUrl = await finalizeAndUploadVideo(videoUrl, ticker);
    return { launchVideoUrl: finalUrl, clipsSucceeded };
}

/**
 * Generate a single clip via Runway Gen-4.5 using the official SDK.
 * Text-to-video mode — omit promptImage.
 */
async function generateRunwayClip(prompt: string): Promise<string> {
    const apiKey = process.env.RUNWAY_API_KEY;
    if (!apiKey) throw new Error("RUNWAY_API_KEY not set");

    const client = new RunwayML({ apiKey });

    log.info({ prompt: prompt.slice(0, 80), model: "gen4.5" }, "⏳ Sending Runway text-to-video request");

    const task = await client.textToVideo
        .create({
            model: "gen4.5" as any,
            promptText: prompt,
            ratio: "1280:720" as any,
            duration: 6,
        })
        .waitForTaskOutput();

    log.info({ taskId: task.id, status: task.status }, "Runway task completed");

    // The output is an array of URLs
    const outputUrl = task.output?.[0];
    if (!outputUrl) throw new Error("No output URL from Runway task");

    return outputUrl;
}

async function stitchViaShotstack(
    clipUrls: string[],
    ticker: string,
    colors: { primary: string; secondary: string },
    style: string
): Promise<string> {
    const apiKey = process.env.SHOTSTACK_API_KEY;
    if (!apiKey) throw new Error("SHOTSTACK_API_KEY not set");

    const targetDuration = clipUrls.length >= 3 ? 15 : clipUrls.length === 2 ? 10 : 6;
    const transitionOverlap = 0.5; // fade transition overlap
    const clipDuration = (targetDuration + transitionOverlap * (clipUrls.length - 1)) / clipUrls.length;
    const totalDuration = targetDuration;

    const clips = clipUrls.map((url, i) => ({
        asset: { type: "video" as const, src: url, volume: 0 },
        start: i * (clipDuration - transitionOverlap),
        length: clipDuration,
        transition: i > 0 ? { in: "fade" as const } : undefined,
    }));

    // Add ticker overlay on last clip
    const overlayClip = {
        asset: {
            type: "html" as const,
            html: `<div style="font-family:Arial,sans-serif;color:white;text-align:center;">
        <p style="font-size:48px;font-weight:bold;text-shadow:2px 2px 12px rgba(0,0,0,0.9);">$${ticker.toUpperCase()}</p>
      </div>`,
            width: 600,
            height: 80,
        },
        start: totalDuration - 4,
        length: 4,
        position: "bottom" as const,
        offset: { y: -0.08 },
    };

    const soundtrackSrc = getSoundtrackForStyle(style);

    const timeline = {
        background: "#000000",
        soundtrack: {
            src: soundtrackSrc,
            effect: "fadeOut",
        },
        tracks: [
            { clips: [overlayClip] },
            { clips },
        ],
    };

    const renderRes = await axios.post(
        `${getShotstackBase()}/render`,
        {
            timeline,
            output: {
                format: "mp4",
                resolution: "hd",
                size: { width: 1920, height: 1080 },
            },
        },
        {
            headers: {
                "x-api-key": apiKey,
                "Content-Type": "application/json",
            },
            timeout: 30000,
        }
    );

    const renderId = renderRes.data?.response?.id;
    if (!renderId) throw new Error("No render ID from Shotstack");

    return await pollShotstackRender(renderId, apiKey);
}

async function pollShotstackRender(
    renderId: string,
    apiKey: string
): Promise<string> {
    const maxWait = 180_000;
    const interval = 10_000;
    const start = Date.now();

    while (Date.now() - start < maxWait) {
        const res = await axios.get(
            `${getShotstackBase()}/render/${renderId}`,
            {
                headers: { "x-api-key": apiKey },
                timeout: 10000,
            }
        );

        const status = res.data?.response?.status;
        if (status === "done") return res.data.response.url;
        if (status === "failed") throw new Error(`Shotstack video render failed: ${renderId}`);

        await new Promise((r) => setTimeout(r, interval));
    }

    throw new Error(`Shotstack video render timed out: ${renderId}`);
}

async function generateFallbackVideo(
    ticker: string,
    bannerUrl: string,
    logo: LogoResult,
    style: string
): Promise<string> {
    const apiKey = process.env.SHOTSTACK_API_KEY;
    if (!apiKey) {
        log.error("No SHOTSTACK_API_KEY for fallback video");
        return bannerUrl;
    }

    const soundtrackSrc = getSoundtrackForStyle(style);

    const timeline = {
        background: "#000000",
        soundtrack: {
            src: soundtrackSrc,
            effect: "fadeOut",
        },
        tracks: [
            {
                clips: [
                    {
                        asset: {
                            type: "html" as const,
                            html: `<div style="font-family:Arial,sans-serif;color:white;text-align:center;">
                <p style="font-size:64px;font-weight:bold;">$${ticker.toUpperCase()}</p>
                <p style="font-size:24px;opacity:0.8;">IS HERE</p>
              </div>`,
                            width: 800,
                            height: 200,
                        },
                        start: 1.5,
                        length: 3.5,
                        position: "center" as const,
                        transition: { in: "fade" as const },
                    },
                ],
            },
            {
                clips: [
                    {
                        asset: { type: "image" as const, src: bannerUrl },
                        start: 0,
                        length: 5,
                        fit: "cover" as const,
                        effect: "zoomIn" as const,
                    },
                ],
            },
        ],
    };

    try {
        const renderRes = await axios.post(
            `${getShotstackBase()}/render`,
            {
                timeline,
                output: { format: "mp4", resolution: "hd", size: { width: 1920, height: 1080 } },
            },
            {
                headers: { "x-api-key": apiKey, "Content-Type": "application/json" },
                timeout: 30000,
            }
        );

        const renderId = renderRes.data?.response?.id;
        if (!renderId) throw new Error("No render ID");

        return await pollShotstackRender(renderId, apiKey);
    } catch (err) {
        log.error({ error: err }, "Fallback video generation failed");
        return bannerUrl;
    }
}

async function finalizeAndUploadVideo(
    videoUrl: string,
    ticker: string
): Promise<string> {
    try {
        const res = await axios.get(videoUrl, {
            responseType: "arraybuffer",
            timeout: 60000,
        });

        const key = `videos/${ticker.toLowerCase()}-${Date.now()}.mp4`;
        return await uploadBuffer(key, Buffer.from(res.data), "video/mp4");
    } catch (err) {
        log.warn({ error: err }, "Video upload failed, returning source URL");
        return videoUrl;
    }
}

/**
 * Maps the visual style to a matching royalty-free soundtrack URL.
 */
function getSoundtrackForStyle(style: string): string {
    switch (style) {
        case "cyberpunk":
            return "https://shotstack-assets.s3.ap-southeast-2.amazonaws.com/music/freemusicarchive/cyberpunk-bass.mp3"; // high energy electronic
        case "space":
            return "https://shotstack-assets.s3.ap-southeast-2.amazonaws.com/music/unminus/ambisax.mp3"; // ambient/spacious
        case "retro":
            return "https://shotstack-assets.s3.ap-southeast-2.amazonaws.com/music/freemusicarchive/synthwave.mp3"; // retro synth
        case "minimalist":
        default:
            return "https://shotstack-assets.s3.ap-southeast-2.amazonaws.com/music/unminus/dreamy.mp3"; // clean, chill beat
    }
}
