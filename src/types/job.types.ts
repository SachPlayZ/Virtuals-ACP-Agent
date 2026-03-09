// ─── Input DTO ───────────────────────────────────────────────
export type CampaignIntent = "launch" | "hype" | "stealth" | "engage" | (string & {});
export type VisualTheme = "cyberpunk" | "space" | "minimalist" | "retro-arcade" | (string & {});

export interface GenerateJobInput {
    ticker?: string;
    contractAddress?: string;
    intent?: string;   // optional — auto-resolved from token age if absent
    theme?: string;    // optional — auto-resolved from utility class if absent
}

// ─── Utility Classification ─────────────────────────────────
export type UtilityClass = "protocol" | "culture" | "hybrid";

// ─── Module Results ──────────────────────────────────────────
export interface TokenResolution {
    projectName?: string;
    description?: string;
    logoUrl?: string;
    contractAddress?: string;
    websiteUrl?: string;
    socialLinks?: SocialLinks;
    pairCreatedAt?: number;   // epoch ms from DexScreener
    resolutionSource: "coingecko" | "dexscreener" | "user" | "fallback";
}

export interface SocialLinks {
    twitter?: string;
    telegram?: string;
    discord?: string;
    website?: string;
}

export interface WebsiteScrapeResult {
    extractedText?: string;
    found: boolean;
}

// ─── Creative Brief ──────────────────────────────────────────
export interface CreativeBrief {
    projectName: string;
    ticker: string;
    utilityClass: UtilityClass;
    oneLiner: string;
    logoUrl: string;
    brandColors: { primary: string; secondary: string };
    tokenAgeSec: number | null;
    socialLinks: SocialLinks;
}

// ─── Tone Profile ────────────────────────────────────────────
export interface ToneProfile {
    utilityClass: UtilityClass;
    intent: string;
    theme: string;
    profileName: string;      // e.g. "The Institutional Reveal"
}

// ─── Visual Themes (LLM-generated) ──────────────────────────
export interface VisualThemes {
    mood: string;
    color_cues: string;
    lighting_style: string;
    motion_style: string;
    texture_keywords: string[];
    clip1_prompt: string;
    clip2_prompt: string;
    clip3_prompt: string;
    image_prompt: string;
}

export interface PostGenerationResult {
    posts: [string, string, string];
    visualThemes: VisualThemes;
}

export interface LogoResult {
    finalLogoUrl: string;
    brandColors: {
        primary: string;
        secondary: string;
    };
}

export interface BannerResult {
    heroBannerUrl: string;
}

export interface VideoResult {
    launchVideoUrl: string;
    clipsSucceeded: number;
}

export interface ConfidenceFactors {
    websiteFound: boolean;
    officialLogo: boolean;
    allClipsSucceeded: boolean;
    noFallbacksUsed: boolean;
}

// ─── Final Output DTO (ACP Format) ──────────────────────────
export interface GenerateJobOutput {
    hero_banner_url: string;
    launch_video_url: string;
    x_post_1: string;
    x_post_2: string;
    x_post_3: string;
    produced_by: string;
    brand_colors: {
        primary: string;
        secondary: string;
    };
    tone_profile: string;
    confidence_level: 1 | 2 | 3 | 4;
    generation_time_sec: number;
    data_source: "website" | "thematic_only" | "mixed";
}

// ─── Internal Job Context ────────────────────────────────────
export interface JobContext {
    input: GenerateJobInput;
    token: TokenResolution;
    website: WebsiteScrapeResult;
    brief: CreativeBrief;
    tone: ToneProfile;
    posts: PostGenerationResult;
    logo: LogoResult;
    banner: BannerResult;
    video: VideoResult;
    confidence: ConfidenceFactors;
    fallbacksUsed: boolean;
}
