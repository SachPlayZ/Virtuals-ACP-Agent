import type { BannerResult, VisualThemes, LogoResult, CreativeBrief, ToneProfile } from "../types/job.types.js";
/**
 * Generate a hero banner:
 * 1. Generate background via OpenAI DALL-E 3 (prompt built from Creative Brief + Tone Profile)
 * 2. Composite with logo + tagline via Shotstack
 * 3. Upload 1200×628 JPG to S3
 */
export declare function generateBanner(ticker: string, visualThemes: VisualThemes, logo: LogoResult, tagline: string, brief: CreativeBrief, tone: ToneProfile): Promise<BannerResult>;
//# sourceMappingURL=bannerGenerator.d.ts.map