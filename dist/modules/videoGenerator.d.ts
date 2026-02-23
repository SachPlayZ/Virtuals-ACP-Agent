import type { VideoResult, VisualThemes, LogoResult, CreativeBrief, ToneProfile } from "../types/job.types.js";
/**
 * Generate an 8s launch video:
 * 1. Generate 2 clips in parallel via Runway Gen-4.5 (official SDK)
 * 2. Stitch clips + transitions + music via Shotstack
 * 3. Export 1280×720 MP4, upload to S3
 */
export declare function generateVideo(ticker: string, visualThemes: VisualThemes, logo: LogoResult, bannerUrl: string, brief: CreativeBrief, tone: ToneProfile, ctaText?: string): Promise<VideoResult>;
//# sourceMappingURL=videoGenerator.d.ts.map