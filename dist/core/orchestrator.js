import { createChildLogger } from "../utils/logger.js";
import { startTimer } from "../utils/timers.js";
import { resolveToken } from "../modules/tokenResolver.js";
import { scrapeWebsite } from "../modules/websiteScraper.js";
import { generatePosts } from "../modules/postGenerator.js";
import { manageLogo } from "../modules/logoManager.js";
import { generateBanner } from "../modules/bannerGenerator.js";
import { generateVideo } from "../modules/videoGenerator.js";
import { computeConfidence } from "../modules/confidenceScorer.js";
import { classifyUtility } from "../modules/utilityClassifier.js";
import { buildCreativeBrief } from "../modules/creativeBrief.js";
import { resolveToneProfile } from "../modules/toneProfile.js";
const log = createChildLogger("orchestrator");
/**
 * Master orchestrator — executes the 3-stage pipeline.
 *
 * STAGE 1: Data Resolution (sequential)
 *   → resolveToken → scrapeWebsite → manageLogo → classifyUtility → buildCreativeBrief
 *
 * STAGE 2: Intent & Theme Resolution
 *   → resolveToneProfile
 *
 * STAGE 3: Coordinated Generation (parallel)
 *   → generatePosts + generateBanner + generateVideo
 *
 * Always returns a valid GenerateJobOutput. Never throws to caller.
 */
export async function runPipeline(input) {
    const timer = startTimer();
    let fallbacksUsed = false;
    log.info({ input }, "═══════════════ PIPELINE STARTED ═══════════════");
    // ════════════════════════════════════════════════════════════════
    // STAGE 1: DATA RESOLUTION
    // ════════════════════════════════════════════════════════════════
    log.info("━━━ STAGE 1: DATA RESOLUTION ━━━");
    // ── Step 1.1: Resolve Token Metadata ──
    log.info("⏳ Step 1.1: Resolving token metadata...");
    const stepTimer1 = startTimer();
    const token = await resolveToken(input.ticker, input.contractAddress);
    if (token.resolutionSource === "fallback")
        fallbacksUsed = true;
    log.info({
        elapsed: `${stepTimer1.elapsed().toFixed(1)}s`,
        source: token.resolutionSource,
        projectName: token.projectName || "(none)",
        logoUrl: token.logoUrl || "(none)",
        websiteUrl: token.websiteUrl || "(none)",
        hasSocials: !!token.socialLinks?.twitter,
    }, "✅ Step 1.1: Token resolved");
    // ── Step 1.2: Scrape Website ──
    log.info({ url: token.websiteUrl || "(none)" }, "⏳ Step 1.2: Scraping website...");
    const stepTimer2 = startTimer();
    const website = await scrapeWebsite(token.websiteUrl);
    log.info({
        elapsed: `${stepTimer2.elapsed().toFixed(1)}s`,
        found: website.found,
        textLength: website.extractedText?.length || 0,
    }, website.found ? "✅ Step 1.2: Website scraped" : "⚠️ Step 1.2: No website content found");
    // ── Step 1.3: Fetch/Generate Logo & Extract Brand Colors ──
    log.info({ logoUrl: token.logoUrl || "(placeholder)" }, "⏳ Step 1.3: Managing logo...");
    const stepTimer3 = startTimer();
    const ticker = input.ticker || "TOKEN";
    const logo = await manageLogo(ticker, token.logoUrl);
    const officialLogo = !!token.logoUrl && (token.resolutionSource === "coingecko" || token.resolutionSource === "dexscreener");
    log.info({
        elapsed: `${stepTimer3.elapsed().toFixed(1)}s`,
        finalLogoUrl: logo.finalLogoUrl,
        brandColors: logo.brandColors,
        official: officialLogo,
    }, "✅ Step 1.3: Logo/Colors processed");
    // ── Step 1.4: Classify Utility ──
    const description = website.extractedText || token.description || "";
    const projectName = token.projectName || ticker;
    const utilityClass = classifyUtility(description, projectName);
    log.info({ utilityClass }, "✅ Step 1.4: Utility classified");
    // ── Step 1.5: Build Creative Brief ──
    const brief = buildCreativeBrief(ticker, token, logo, utilityClass, website);
    log.info({ projectName: brief.projectName, utilityClass: brief.utilityClass, oneLiner: brief.oneLiner }, "✅ Step 1.5: Creative Brief built");
    // ════════════════════════════════════════════════════════════════
    // STAGE 2: INTENT & THEME RESOLUTION
    // ════════════════════════════════════════════════════════════════
    log.info("━━━ STAGE 2: INTENT & THEME RESOLUTION ━━━");
    const tone = resolveToneProfile(utilityClass, input.intent, input.theme, brief.tokenAgeSec);
    log.info({ intent: tone.intent, theme: tone.theme, profileName: tone.profileName }, `✅ Stage 2: Tone Profile resolved → "${tone.profileName}"`);
    // ════════════════════════════════════════════════════════════════
    // STAGE 3: COORDINATED GENERATION (parallel)
    // ════════════════════════════════════════════════════════════════
    log.info("━━━ STAGE 3: COORDINATED GENERATION ━━━");
    const stageTimer3 = startTimer();
    // Generate posts first (needed for banner tagline and video CTA)
    log.info({ model: process.env.OPENAI_MODEL || "gpt-4o" }, "⏳ Step 3.1: Generating posts + visual themes...");
    const posts = await generatePosts(brief, tone, website);
    log.info({
        post1Len: posts.posts[0]?.length,
        post2Len: posts.posts[1]?.length,
        post3Len: posts.posts[2]?.length,
        mood: posts.visualThemes.mood,
    }, "✅ Step 3.1: Posts generated");
    // Extract tagline and CTA from the best post
    const tagline = extractTagline(posts.posts[0], ticker);
    const ctaText = extractCta(posts.posts[0], ticker);
    // Run banner + video in parallel
    log.info("⏳ Step 3.2: Generating banner + video in parallel...");
    const [bannerResult, videoResult] = await Promise.all([
        generateBanner(ticker, posts.visualThemes, logo, tagline, brief, tone)
            .then((b) => {
            log.info({ heroBannerUrl: b.heroBannerUrl }, "✅ Banner generated");
            return b;
        }),
        generateVideo(ticker, posts.visualThemes, logo, logo.finalLogoUrl, brief, tone, ctaText)
            .then((v) => {
            if (v.clipsSucceeded < 2)
                fallbacksUsed = true;
            log.info({ clipsSucceeded: v.clipsSucceeded, launchVideoUrl: v.launchVideoUrl }, v.clipsSucceeded === 2
                ? "✅ Video generated (all clips)"
                : `⚠️ Video generated (${v.clipsSucceeded}/2 clips)`);
            return v;
        }),
    ]);
    log.info({ elapsed: `${stageTimer3.elapsed().toFixed(1)}s` }, "✅ Stage 3 complete");
    // ════════════════════════════════════════════════════════════════
    // FINAL: Confidence + Output
    // ════════════════════════════════════════════════════════════════
    const factors = {
        websiteFound: website.found,
        officialLogo,
        allClipsSucceeded: videoResult.clipsSucceeded === 2,
        noFallbacksUsed: !fallbacksUsed,
    };
    const confidenceLevel = computeConfidence(factors);
    log.info({ factors, confidenceLevel }, "✅ Confidence computed");
    const generationTimeSec = timer.elapsed();
    const dataSource = determineDataSource(website.found, token.resolutionSource);
    const output = {
        hero_banner_url: bannerResult.heroBannerUrl,
        launch_video_url: videoResult.launchVideoUrl,
        x_post_1: posts.posts[0],
        x_post_2: posts.posts[1],
        x_post_3: posts.posts[2],
        brand_colors: logo.brandColors,
        tone_profile: tone.profileName,
        confidence_level: confidenceLevel,
        generation_time_sec: Math.round(generationTimeSec * 100) / 100,
        data_source: dataSource,
    };
    log.info({
        totalTime: `${generationTimeSec.toFixed(1)}s`,
        confidenceLevel,
        dataSource,
        toneProfile: tone.profileName,
    }, "═══════════════ PIPELINE COMPLETE ═══════════════");
    return output;
}
function extractTagline(firstPost, ticker) {
    const sentence = firstPost.split(/[.!?]/)[0]?.trim();
    if (sentence && sentence.length > 10 && sentence.length <= 80) {
        return sentence;
    }
    return `$${ticker.toUpperCase()} — The Next Chapter`;
}
function extractCta(firstPost, ticker) {
    // Try to get a punchy short line from the post
    const lines = firstPost.split(/[.!?\n]/).map((l) => l.trim()).filter(Boolean);
    const short = lines.find((l) => l.length > 5 && l.length <= 50);
    if (short)
        return short;
    return `$${ticker.toUpperCase()}`;
}
function determineDataSource(websiteFound, resolutionSource) {
    if (websiteFound && (resolutionSource === "coingecko" || resolutionSource === "dexscreener"))
        return "website";
    if (!websiteFound && resolutionSource === "fallback")
        return "thematic_only";
    return "mixed";
}
//# sourceMappingURL=orchestrator.js.map