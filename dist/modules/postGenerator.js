import OpenAI from "openai";
import { createChildLogger } from "../utils/logger.js";
import { withRetry } from "../utils/retry.js";
const log = createChildLogger("postGenerator");
/**
 * Generate 3 X posts + visual themes using OpenAI GPT.
 * Driven by the Creative Brief + Tone Profile.
 */
export async function generatePosts(brief, tone, website) {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const model = process.env.OPENAI_MODEL || "gpt-4o";
    const systemPrompt = buildSystemPrompt(brief, tone);
    const userPrompt = buildUserPrompt(brief, tone, website);
    const result = await withRetry(async () => {
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
        return parseResponse(text, brief.ticker, tone);
    }, { label: "openai-post-gen", maxRetries: 2 });
    log.info({ postLengths: result.posts.map((p) => p.length) }, "Posts generated");
    return result;
}
function buildSystemPrompt(brief, tone) {
    const guardrailBlock = buildGuardrails(tone);
    return `You are an elite crypto marketing copywriter and visual director.
You write viral X (Twitter) posts for token campaigns.
Your posts are sharp, punchy, crypto-native — never cringe.
You also design visual direction for campaign assets.

=== TONE PROFILE: "${tone.profileName}" ===
Utility class: ${tone.utilityClass}
Intent: ${tone.intent}
Theme: ${tone.theme}

Write in the voice of the "${tone.profileName}" archetype.
${tone.utilityClass === "protocol" ? "Use technical, builder-centric vocabulary. Emphasise infrastructure and innovation." : ""}
${tone.utilityClass === "culture" ? "Use community-first, culture-native vocabulary. Emphasise vibes, belonging, and momentum." : ""}
${tone.utilityClass === "hybrid" ? "Blend technical credibility with community energy." : ""}

The brand colors for this token are:
- Primary: ${brief.brandColors.primary}
- Secondary: ${brief.brandColors.secondary}

When generating the "visualThemes" (mood, color_cues, lighting, etc.), cleverly use these brand colors as stylistic guides, background accents, or thematic hints. Ensure the visual direction feels harmonic with these colors without being forced or rigid.
${guardrailBlock}
RESPOND ONLY with valid JSON — no markdown, no commentary.`;
}
function buildGuardrails(tone) {
    const rules = [];
    // Minimalist theme excludes hype words UNLESS intent = stealth
    if (tone.theme === "minimalist" && tone.intent !== "stealth") {
        rules.push("GUARDRAIL: Do NOT use the words LFG, Moon, Degen, Ape, or similar hype slang. Keep the tone clean and institutional.");
    }
    // Protocol tokens should avoid meme culture
    if (tone.utilityClass === "protocol" && tone.intent !== "engage") {
        rules.push("GUARDRAIL: Avoid meme culture references. This is a serious protocol — the language should reflect that.");
    }
    // Stealth intent should be mysterious and understated
    if (tone.intent === "stealth") {
        rules.push("GUARDRAIL: Be mysterious and understated. No overt shilling. Create intrigue, not FOMO.");
    }
    if (rules.length === 0)
        return "";
    return "\n" + rules.join("\n") + "\n";
}
function buildUserPrompt(brief, tone, website) {
    const contextBlock = website.found
        ? `The project has a real website. Extracted info:
"""
${website.extractedText}
"""
You may reference ONE real utility from the website. Do NOT hallucinate features not mentioned.`
        : `No website exists for this token. Use the ticker "$${brief.ticker}" as a metaphor.
Focus on vibe, FOMO, and narrative energy. Make NO fake utility claims.`;
    const socialBlock = brief.socialLinks.twitter
        ? `The project has active socials (Twitter: ${brief.socialLinks.twitter}).`
        : "";
    return `Generate a crypto campaign for $${brief.ticker} (${brief.projectName}).

Project: ${brief.oneLiner}
Tone Profile: "${tone.profileName}" (${tone.utilityClass} + ${tone.intent} + ${tone.theme})
${socialBlock}

${contextBlock}

Return JSON with this exact structure:
{
  "posts": [
    "post1 (250-280 chars, include 2-3 hashtags, crypto-native tone)",
    "post2 (250-280 chars, include 2-3 hashtags, crypto-native tone)",
    "post3 (250-280 chars, include 2-3 hashtags, may be thread-style with 🧵)"
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
    "image_prompt": "detailed prompt for hero banner background image, ${tone.theme} style, featuring brand colors ${brief.brandColors.primary} and ${brief.brandColors.secondary}"
  }
}

STRICT RULES:
- Each post MUST be 250-280 characters. Count carefully.
- Use the REAL project name "${brief.projectName}" and ticker "$${brief.ticker}" in posts.
- Include 2-3 relevant hashtags like #crypto, #$${brief.ticker}, etc.
- Posts must feel authentic — no corporate-speak.
- Visual themes must match the "${tone.theme}" aesthetic.
- JSON only — no extra text.`;
}
function parseResponse(text, ticker, tone) {
    try {
        // Try to extract JSON from the response
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (!jsonMatch)
            throw new Error("No JSON found in response");
        const parsed = JSON.parse(jsonMatch[0]);
        // Validate posts
        if (!Array.isArray(parsed.posts) || parsed.posts.length < 3) {
            throw new Error("Expected 3 posts in response");
        }
        // Enforce character limits — trim if needed
        let posts = parsed.posts.slice(0, 3).map((post) => {
            if (post.length > 280)
                return post.slice(0, 277) + "...";
            return post;
        });
        // Apply guardrails post-hoc
        if (tone.theme === "minimalist" && tone.intent !== "stealth") {
            posts = posts.map((post) => post.replace(/\b(LFG|Moon|Degen|WAGMI)\b/gi, "")
                .replace(/\s{2,}/g, " ")
                .trim());
        }
        // Validate visual themes
        const vt = parsed.visualThemes || {};
        const visualThemes = {
            mood: vt.mood || `High-energy ${ticker} ${tone.intent}`,
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
    }
    catch (err) {
        log.warn({ error: err }, "Failed to parse GPT response, using fallback");
        return buildFallbackResult(ticker);
    }
}
function buildFallbackResult(ticker) {
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
//# sourceMappingURL=postGenerator.js.map