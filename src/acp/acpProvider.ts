import AcpClientModule, {
    AcpContractClientV2,
    AcpJob,
    AcpJobPhases,
    AcpMemo,
    DeliverablePayload,
} from "@virtuals-protocol/acp-node";
import { createChildLogger } from "../utils/logger.js";
import { runPipeline } from "../core/orchestrator.js";
import type { GenerateJobInput } from "../types/job.types.js";

// CJS/ESM interop: in ESM context the default export is nested under .default
const AcpClient = (AcpClientModule as any).default ?? AcpClientModule;

const log = createChildLogger("acp-provider");

// ── Env helpers ──────────────────────────────────────────────
function requireEnv(key: string): string {
    const val = process.env[key];
    if (!val) throw new Error(`Missing required env var: ${key}`);
    return val;
}

// ── Parse ACP job requirement into GenerateJobInput ─────────
function parseRequirement(job: AcpJob): GenerateJobInput {
    let req: Record<string, unknown> = {};
    try {
        if (typeof job.requirement === "string") {
            req = JSON.parse(job.requirement);
        } else if (typeof job.requirement === "object" && job.requirement !== null) {
            req = job.requirement as Record<string, unknown>;
        }
    } catch {
        log.warn({ jobId: job.id, raw: job.requirement }, "Could not parse requirement as JSON, treating as ticker");
        if (typeof job.requirement === "string") {
            return { ticker: job.requirement.replace(/^\$/, "") };
        }
    }

    return {
        ticker: (req.ticker as string) || undefined,
        contractAddress: (req.contractAddress ?? req.contract_address) as string | undefined,
        intent: (req.intent as string) || undefined,
        theme: (req.theme ?? req.style) as string | undefined,
    };
}

// ── Start the ACP Provider ──────────────────────────────────
export async function startAcpProvider(): Promise<void> {
    const privateKey = requireEnv("ACP_WALLET_PRIVATE_KEY") as `0x${string}`;
    const entityId = parseInt(requireEnv("ACP_ENTITY_ID"), 10);
    const agentWallet = requireEnv("ACP_AGENT_WALLET_ADDRESS") as `0x${string}`;

    if (isNaN(entityId)) {
        throw new Error("ACP_ENTITY_ID must be a valid number");
    }

    log.info(
        { entityId, agentWallet: `${agentWallet.slice(0, 6)}…${agentWallet.slice(-4)}` },
        "Initialising ACP provider…"
    );

    new AcpClient({
        acpContractClient: await AcpContractClientV2.build(
            privateKey,
            entityId,
            agentWallet,
        ),

        // ── onNewTask: react to job lifecycle events ─────────
        onNewTask: async (job: AcpJob, memoToSign?: AcpMemo) => {
            log.info(
                { jobId: job.id, phase: job.phase, nextPhase: memoToSign?.nextPhase },
                "ACP job event received"
            );

            // ── PHASE 1: Buyer requests a job → accept & send requirement ──
            if (
                job.phase === AcpJobPhases.REQUEST &&
                memoToSign?.nextPhase === AcpJobPhases.NEGOTIATION
            ) {
                try {
                    const input = parseRequirement(job);

                    if (!input.ticker && !input.contractAddress) {
                        log.warn({ jobId: job.id }, "Rejecting: no ticker or contractAddress in requirement");
                        await job.reject("Requirement must include at least a 'ticker' or 'contractAddress'");
                        return;
                    }

                    log.info({ jobId: job.id, input }, "Accepting job and sending requirement");
                    await job.accept("HypePack PR can generate this media bundle");
                    await job.createRequirement(
                        `Generating crypto launch media bundle for ${input.ticker || input.contractAddress}. ` +
                        `Deliverable includes: hero banner, launch video, 3 X posts, brand colors, and tone profile. ` +
                        `Please make payment to proceed.`
                    );
                } catch (err) {
                    log.error({ jobId: job.id, error: err }, "Error processing job request");
                    await job.reject("Internal error processing requirement");
                }
            }

            // ── PHASE 2: Buyer paid → generate media bundle & deliver ──
            else if (
                job.phase === AcpJobPhases.TRANSACTION &&
                memoToSign?.nextPhase === AcpJobPhases.EVALUATION
            ) {
                log.info({ jobId: job.id }, "Payment received — starting media generation pipeline");

                try {
                    const input = parseRequirement(job);
                    const output = await runPipeline(input);

                    // Deliverable must match the offering's deliverable schema
                    const deliverable = {
                        hero_banner_url: output.hero_banner_url,
                        launch_video_url: output.launch_video_url,
                        x_post_1: output.x_post_1,
                        x_post_2: output.x_post_2,
                        x_post_3: output.x_post_3,
                        produced_by: output.produced_by,
                    };

                    log.info(
                        {
                            jobId: job.id,
                            confidence: output.confidence_level,
                            time: output.generation_time_sec,
                        },
                        "Pipeline complete — delivering results"
                    );

                    await job.deliver(deliverable);
                    log.info({ jobId: job.id }, "✅ Job delivered successfully");
                } catch (err) {
                    log.error({ jobId: job.id, error: err }, "❌ Pipeline failed for ACP job");
                    await job.reject("Media generation pipeline failed");
                }
            }
        },

        // ── onEvaluate: handle evaluation feedback ──────────
        onEvaluate: async (job: AcpJob) => {
            log.info(
                { jobId: job.id, phase: job.phase },
                "Evaluation event received"
            );

            if (job.phase === AcpJobPhases.COMPLETED) {
                log.info({ jobId: job.id }, "✅ Job completed and evaluated successfully");
            } else if (job.phase === AcpJobPhases.REJECTED) {
                log.warn({ jobId: job.id }, "⚠️ Job was rejected during evaluation");
            }
        },
    });

    log.info("🟢 ACP Provider is live and listening for jobs");
}
