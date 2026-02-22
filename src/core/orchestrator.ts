import type {
    GenerateJobInput,
    GenerateJobOutput,
    ConfidenceFactors,
} from "../types/job.types.js";
import { createChildLogger } from "../utils/logger.js";
import { startTimer } from "../utils/timers.js";
import { resolveToken } from "../modules/tokenResolver.js";
import { scrapeWebsite } from "../modules/websiteScraper.js";
import { generatePosts } from "../modules/postGenerator.js";
import { manageLogo } from "../modules/logoManager.js";
import { generateBanner } from "../modules/bannerGenerator.js";
import { generateVideo } from "../modules/videoGenerator.js";
import { computeConfidence } from "../modules/confidenceScorer.js";

const log = createChildLogger("orchestrator");

/**
 * Master orchestrator — executes the 11-step pipeline.
 * Always returns a valid GenerateJobOutput. Never throws to caller.
 */
export async function runPipeline(
    input: GenerateJobInput
): Promise<GenerateJobOutput> {
    const timer = startTimer();
    let fallbacksUsed = false;

    log.info({ input }, "═══════════════ PIPELINE STARTED ═══════════════");

    // ── Step 1: Validate Input (already done at API layer) ──
    log.info("✅ Step 1: Input already validated");

    // ── Step 2: Resolve Token Metadata ──
    log.info("⏳ Step 2: Resolving token metadata...");
    const stepTimer2 = startTimer();
    const token = await resolveToken(input.ticker, input.contractAddress);
    if (token.resolutionSource === "fallback") fallbacksUsed = true;
    log.info(
        {
            elapsed: `${stepTimer2.elapsed().toFixed(1)}s`,
            source: token.resolutionSource,
            logoUrl: token.logoUrl || "(none)",
            websiteUrl: token.websiteUrl || "(none)",
            contractAddress: token.contractAddress || "(none)",
        },
        "✅ Step 2: Token resolved"
    );

    // ── Step 3: Scrape Website ──
    log.info({ url: token.websiteUrl || "(none)" }, "⏳ Step 3: Scraping website...");
    const stepTimer3 = startTimer();
    const website = await scrapeWebsite(token.websiteUrl);
    log.info(
        {
            elapsed: `${stepTimer3.elapsed().toFixed(1)}s`,
            found: website.found,
            textLength: website.extractedText?.length || 0,
        },
        website.found ? "✅ Step 3: Website scraped" : "⚠️ Step 3: No website content found"
    );

    // ── Step 4: Fetch/Generate Logo & Extract Brand Colors ──
    log.info({ logoUrl: token.logoUrl || "(placeholder)" }, "⏳ Step 4: Managing logo...");
    const stepTimer4 = startTimer();
    const ticker = input.ticker || "TOKEN";
    const logo = await manageLogo(ticker, token.logoUrl);
    const officialLogo = !!token.logoUrl && (token.resolutionSource === "coingecko" || token.resolutionSource === "dexscreener");
    log.info(
        {
            elapsed: `${stepTimer4.elapsed().toFixed(1)}s`,
            finalLogoUrl: logo.finalLogoUrl,
            brandColors: logo.brandColors,
            official: officialLogo,
        },
        "✅ Step 4: Logo/Colors processed"
    );

    // ── Step 5: Generate Posts + Visual Themes (with color awareness) ──
    log.info({ model: process.env.OPENAI_MODEL || "gpt-4o" }, "⏳ Step 5: Generating posts + visual themes...");
    const stepTimer5 = startTimer();
    const posts = await generatePosts(input, website, logo.brandColors);
    log.info(
        {
            elapsed: `${stepTimer5.elapsed().toFixed(1)}s`,
            post1Len: posts.posts[0]?.length,
            post2Len: posts.posts[1]?.length,
            post3Len: posts.posts[2]?.length,
            mood: posts.visualThemes.mood,
        },
        "✅ Step 5: Posts generated"
    );


    // ── Step 7: Generate Banner ──
    log.info("⏳ Step 7: Generating banner (DALL-E 3 + Shotstack)...");
    const stepTimer7 = startTimer();
    const tagline = extractTagline(posts.posts[0], ticker);
    log.info({ tagline }, "  → Banner tagline selected");
    const banner = await generateBanner(
        ticker,
        posts.visualThemes,
        logo,
        tagline
    );
    log.info(
        {
            elapsed: `${stepTimer7.elapsed().toFixed(1)}s`,
            heroBannerUrl: banner.heroBannerUrl,
        },
        "✅ Step 7: Banner generated"
    );

    // ── Step 8: Generate Video (parallel clips) ──
    log.info("⏳ Step 8: Generating video (Runway Gen-4 + Shotstack)...");
    const stepTimer8 = startTimer();
    const video = await generateVideo(
        ticker,
        posts.visualThemes,
        logo,
        banner.heroBannerUrl,
        input.style
    );
    if (video.clipsSucceeded < 2) fallbacksUsed = true;
    log.info(
        {
            elapsed: `${stepTimer8.elapsed().toFixed(1)}s`,
            clipsSucceeded: video.clipsSucceeded,
            launchVideoUrl: video.launchVideoUrl,
        },
        video.clipsSucceeded === 2
            ? "✅ Step 8: Video generated (all clips)"
            : `⚠️ Step 8: Video generated (${video.clipsSucceeded}/2 clips)`
    );

    // ── Step 9: Upload All Assets (done inside each module) ──
    log.info("✅ Step 9: Assets uploaded (handled per module)");

    // ── Step 10: Compute Confidence Score ──
    const factors: ConfidenceFactors = {
        websiteFound: website.found,
        officialLogo,
        allClipsSucceeded: video.clipsSucceeded === 2,
        noFallbacksUsed: !fallbacksUsed,
    };
    const confidenceLevel = computeConfidence(factors);
    log.info({ factors, confidenceLevel }, "✅ Step 9: Confidence computed");

    // ── Step 10: Return ACP JSON ──
    const generationTimeSec = timer.elapsed();
    const dataSource = determineDataSource(website.found, token.resolutionSource);

    const output: GenerateJobOutput = {
        hero_banner_url: banner.heroBannerUrl,
        launch_video_url: video.launchVideoUrl,
        x_post_1: posts.posts[0],
        x_post_2: posts.posts[1],
        x_post_3: posts.posts[2],
        brand_colors: logo.brandColors,
        confidence_level: confidenceLevel,
        generation_time_sec: Math.round(generationTimeSec * 100) / 100,
        data_source: dataSource,
    };

    log.info(
        {
            totalTime: `${generationTimeSec.toFixed(1)}s`,
            confidenceLevel,
            dataSource,
        },
        "═══════════════ PIPELINE COMPLETE ═══════════════"
    );

    return output;
}

function extractTagline(firstPost: string, ticker: string): string {
    const sentence = firstPost.split(/[.!?]/)[0]?.trim();
    if (sentence && sentence.length > 10 && sentence.length <= 80) {
        return sentence;
    }
    return `$${ticker.toUpperCase()} — The Next Chapter`;
}

function determineDataSource(
    websiteFound: boolean,
    resolutionSource: string
): "website" | "thematic_only" | "mixed" {
    if (websiteFound && (resolutionSource === "coingecko" || resolutionSource === "dexscreener")) return "website";
    if (!websiteFound && resolutionSource === "fallback") return "thematic_only";
    return "mixed";
}
