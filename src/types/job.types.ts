// ─── Input DTO ───────────────────────────────────────────────
export type CampaignIntent = "launch" | "announcement" | "community";
export type VisualStyle = "cyberpunk" | "space" | "minimalist" | "retro";

export interface GenerateJobInput {
    ticker?: string;
    contractAddress?: string;
    intent: CampaignIntent;
    style: VisualStyle;
}

// ─── Module Results ──────────────────────────────────────────
export interface TokenResolution {
    logoUrl?: string;
    contractAddress?: string;
    websiteUrl?: string;
    resolutionSource: "coingecko" | "dexscreener" | "user" | "fallback";
}

export interface WebsiteScrapeResult {
    extractedText?: string;
    found: boolean;
}

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
    brand_colors: {
        primary: string;
        secondary: string;
    };
    confidence_level: 1 | 2 | 3 | 4;
    generation_time_sec: number;
    data_source: "website" | "thematic_only" | "mixed";
}

// ─── Internal Job Context ────────────────────────────────────
export interface JobContext {
    input: GenerateJobInput;
    token: TokenResolution;
    website: WebsiteScrapeResult;
    posts: PostGenerationResult;
    logo: LogoResult;
    banner: BannerResult;
    video: VideoResult;
    confidence: ConfidenceFactors;
    fallbacksUsed: boolean;
}
