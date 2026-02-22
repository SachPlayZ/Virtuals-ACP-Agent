import OpenAI from "openai";
import type {
    GenerateJobInput,
    PostGenerationResult,
    VisualThemes,
    WebsiteScrapeResult,
} from "../types/job.types.js";
import { createChildLogger } from "../utils/logger.js";
import { withRetry } from "../utils/retry.js";

const log = createChildLogger("postGenerator");

/**
 * Generate 3 X posts + visual themes using OpenAI GPT.
 * Posts come first (per spec) — visual themes are derived alongside.
 */
export async function generatePosts(
    input: GenerateJobInput,
    website: WebsiteScrapeResult,
    brandColors: { primary: string; secondary: string }
): Promise<PostGenerationResult> {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const ticker = input.ticker || "TOKEN";
    const model = process.env.OPENAI_MODEL || "gpt-4o";

    const systemPrompt = buildSystemPrompt(brandColors);
    const userPrompt = buildUserPrompt(ticker, input, website);

    const result = await withRetry(
        async () => {
            const completion = await client.chat.completions.create({
                model,
                max_completion_tokens: 2000,
                temperature: 0.8,
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: userPrompt },
                ],
            });

            const text = completion.choices[0]?.message?.content || "";
            return parseResponse(text, ticker);
        },
        { label: "openai-post-gen", maxRetries: 2 }
    );

    log.info(
        { postLengths: result.posts.map((p) => p.length) },
        "Posts generated"
    );
    return result;
}

function buildSystemPrompt(brandColors: { primary: string; secondary: string }): string {
    return `You are an elite crypto marketing copywriter and visual director.
You write viral X (Twitter) posts for token launches.
Your posts are sharp, punchy, crypto-native — never cringe.
You also design visual direction for campaign assets.

The brand colors for this token are:
- Primary: ${brandColors.primary}
- Secondary: ${brandColors.secondary}

When generating the "visualThemes" (mood, color_cues, lighting, etc.), cleverley use these brand colors as stylistic guides, background accents, or thematic hints. Ensure the visual direction feels harmonic with these colors without being forced or rigid.

RESPOND ONLY with valid JSON — no markdown, no commentary.`;
}

function buildUserPrompt(
    ticker: string,
    input: GenerateJobInput,
    website: WebsiteScrapeResult
): string {
    const contextBlock = website.found
        ? `The project has a real website. Extracted info:
"""
${website.extractedText}
"""
You may reference ONE real utility from the website. Do NOT hallucinate features not mentioned.`
        : `No website exists for this token. Use the ticker "${ticker}" as a metaphor.
Focus on vibe, FOMO, and narrative energy. Make NO fake utility claims.`;

    return `Generate a crypto launch campaign for $${ticker}.

Campaign intent: ${input.intent}
Visual style: ${input.style}

${contextBlock}

Return JSON with this exact structure:
{
  "posts": [
    "post1 (250-280 chars, include hashtags, crypto-native tone)",
    "post2 (250-280 chars, include hashtags, crypto-native tone)",
    "post3 (250-280 chars, include hashtags, may be thread-style with 🧵)"
  ],
  "visualThemes": {
    "mood": "one-line mood description",
    "color_cues": "primary color palette description",
    "lighting_style": "lighting description for visuals",
    "motion_style": "motion/animation style",
    "texture_keywords": ["keyword1", "keyword2", "keyword3"],
    "clip1_prompt": "10-word prompt for atmosphere clip",
    "clip2_prompt": "10-word prompt for ticker energy reveal clip",
    "clip3_prompt": "10-word prompt for logo hold + tagline clip",
    "image_prompt": "detailed prompt for hero banner background image, ${input.style} style"
  }
}

STRICT RULES:
- Each post MUST be 250-280 characters. Count carefully.
- Include relevant hashtags like #crypto, #$${ticker}, etc.
- Posts must feel authentic — no corporate-speak.
- Visual themes must match the "${input.style}" aesthetic.
- JSON only — no extra text.`;
}

function parseResponse(text: string, ticker: string): PostGenerationResult {
    try {
        // Try to extract JSON from the response
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error("No JSON found in response");

        const parsed = JSON.parse(jsonMatch[0]);

        // Validate posts
        if (!Array.isArray(parsed.posts) || parsed.posts.length < 3) {
            throw new Error("Expected 3 posts in response");
        }

        // Enforce character limits — trim if needed
        const posts = parsed.posts.slice(0, 3).map((post: string) => {
            if (post.length > 280) return post.slice(0, 277) + "...";
            return post;
        }) as [string, string, string];

        // Validate visual themes
        const vt = parsed.visualThemes || {};
        const visualThemes: VisualThemes = {
            mood: vt.mood || `High-energy ${ticker} launch`,
            color_cues: vt.color_cues || "Neon blue and purple gradients",
            lighting_style: vt.lighting_style || "Cinematic dramatic lighting",
            motion_style: vt.motion_style || "Smooth zoom with particle effects",
            texture_keywords: Array.isArray(vt.texture_keywords)
                ? vt.texture_keywords
                : ["metallic", "holographic", "glitch"],
            clip1_prompt: vt.clip1_prompt || `Dark atmospheric intro with ${ticker} energy`,
            clip2_prompt: vt.clip2_prompt || `${ticker} ticker reveal with dynamic lighting`,
            clip3_prompt: vt.clip3_prompt || `${ticker} logo hold with tagline overlay`,
            image_prompt: vt.image_prompt || `Futuristic crypto banner for ${ticker}, cinematic`,
        };

        return { posts, visualThemes };
    } catch (err) {
        log.warn({ error: err }, "Failed to parse GPT response, using fallback");
        return buildFallbackResult(ticker);
    }
}

function buildFallbackResult(ticker: string): PostGenerationResult {
    return {
        posts: [
            `$${ticker} just entered the chat and the energy is unmatched. This isn't just another token — it's a movement. Early believers know what's coming. The timeline is about to shift. Are you positioned? #crypto #${ticker} #web3 #bullish`.slice(0, 280),
            `We've seen a hundred launches. $${ticker} hits different. The community is locked in, the vision is clear, and the momentum is building fast. Don't sleep on this one. NFA but the signs are all there. #${ticker} #crypto #altcoins #gems`.slice(0, 280),
            `🧵 Why $${ticker} is the play right now:\n\n1/ The narrative is shifting\n2/ Community is growing organically\n3/ Smart money is accumulating\n\nThis is your alpha. Bookmark this. #${ticker} #crypto #alpha #dyor`.slice(0, 280),
        ],
        visualThemes: {
            mood: `Intense ${ticker} launch energy`,
            color_cues: "Electric blue, deep purple, neon accents",
            lighting_style: "Cinematic volumetric lighting with lens flares",
            motion_style: "Smooth zoom transitions with particle dispersal",
            texture_keywords: ["metallic", "holographic", "circuit-board"],
            clip1_prompt: `Dark cosmic atmosphere with floating ${ticker} particles`,
            clip2_prompt: `${ticker} ticker exploding with golden light energy`,
            clip3_prompt: `${ticker} logo crystallizing with tagline fade-in`,
            image_prompt: `Futuristic crypto launch banner for ${ticker}, neon cyberpunk style, dramatic lighting`,
        },
    };
}
