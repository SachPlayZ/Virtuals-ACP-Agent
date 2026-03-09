/**
 * Test Buyer — run this to send a purchase request to your seller agent.
 *
 * Usage:
 *   npx tsx src/acp/testBuyer.ts
 *
 * Requires separate buyer env vars (see below).
 */
import "dotenv/config";
import AcpClientModule, {
    AcpContractClientV2,
    AcpJobPhases,
    AcpJob,
    AcpMemo,
    AcpAgentSort,
    AcpGraduationStatus,
    AcpOnlineStatus,
    baseAcpX402ConfigV2,
} from "@virtuals-protocol/acp-node";

// CJS/ESM interop
const AcpClient = (AcpClientModule as any).default ?? AcpClientModule;

// ── Buyer env vars ──────────────────────────────────────────
const BUYER_PRIVATE_KEY = process.env.ACP_BUYER_PRIVATE_KEY as `0x${string}`;
const BUYER_ENTITY_ID = parseInt(process.env.ACP_BUYER_ENTITY_ID || "", 10);
const BUYER_WALLET = process.env.ACP_BUYER_WALLET_ADDRESS as `0x${string}`;

if (!BUYER_PRIVATE_KEY || !BUYER_WALLET || isNaN(BUYER_ENTITY_ID)) {
    console.error("❌ Missing buyer env vars. Set these in .env:");
    console.error("   ACP_BUYER_PRIVATE_KEY=0x...");
    console.error("   ACP_BUYER_ENTITY_ID=<number>");
    console.error("   ACP_BUYER_WALLET_ADDRESS=0x...");
    process.exit(1);
}

async function buyer() {
    console.log("🛒 Starting test buyer...\n");

    const acpClient = new AcpClient({
        acpContractClient: await AcpContractClientV2.build(
            BUYER_PRIVATE_KEY,
            BUYER_ENTITY_ID,
            BUYER_WALLET,
            baseAcpX402ConfigV2, // route to x402 for payment, undefined defaulted back to direct transfer
        ),

        onNewTask: async (job: AcpJob, memoToSign?: AcpMemo) => {
            // ── Seller accepted & sent requirement → pay ──
            if (
                job.phase === AcpJobPhases.NEGOTIATION &&
                memoToSign?.nextPhase === AcpJobPhases.TRANSACTION
            ) {
                console.log(`💰 Paying for job ${job.id}...`);
                await job.payAndAcceptRequirement();
                console.log(`✅ Job ${job.id} paid\n`);
            }

            // ── Seller rejected after payment → sign rejection ──
            else if (
                job.phase === AcpJobPhases.TRANSACTION &&
                memoToSign?.nextPhase === AcpJobPhases.REJECTED
            ) {
                console.log(`⚠️ Signing job ${job.id} rejection memo, reason: ${memoToSign?.content}`);
                await memoToSign?.sign(true, "Accepts job rejection");
                console.log(`Job ${job.id} rejection memo signed`);
            }

            // ── Job completed → show deliverable ──
            else if (job.phase === AcpJobPhases.COMPLETED) {
                const deliverable = await job.getDeliverable();
                console.log(`\n🎉 Job ${job.id} COMPLETED!`);
                console.log("📦 Deliverable:", JSON.stringify(deliverable, null, 2));
            }

            // ── Job rejected ──
            else if (job.phase === AcpJobPhases.REJECTED) {
                console.log(`❌ Job ${job.id} rejected by seller`);
            }
        },
    });

    // ── Find your seller agent directly by wallet address ────
    const SELLER_WALLET = process.env.ACP_AGENT_WALLET_ADDRESS as `0x${string}`;

    if (!SELLER_WALLET) {
        console.error("❌ Set ACP_AGENT_WALLET_ADDRESS in .env (your seller's wallet)");
        process.exit(1);
    }

    console.log(`🔍 Looking up seller agent ${SELLER_WALLET}...\n`);

    const sellerAgent = await acpClient.getAgent(SELLER_WALLET, {
        showHiddenOfferings: true,
    });

    if (!sellerAgent) {
        console.error("❌ Seller agent not found. Make sure it's registered and online.");
        process.exit(1);
    }

    console.log(`Found: ${sellerAgent.name} (${sellerAgent.walletAddress})`);
    for (const offering of sellerAgent.jobOfferings) {
        console.log(`  - ${offering.name} | ${offering.price}`);
    }

    const chosenOffering = sellerAgent.jobOfferings[0];

    if (!chosenOffering) {
        console.error("❌ Seller agent has no job offerings.");
        process.exit(1);
    }

    // Workaround: ACP API returns cached schemas with custom formats
    // (e.g. "address") that AJV strict mode rejects. Strip them.
    // Also fix the required array if the API cache is stale.
    const KNOWN_FORMATS = new Set(["date-time", "date", "time", "email", "uri", "url", "uuid", "hostname", "ipv4", "ipv6", "regex"]);
    function stripUnknownFormats(schema: any) {
        if (!schema || typeof schema !== "object") return;
        if (schema.format && !KNOWN_FORMATS.has(schema.format)) {
            console.log(`  ⚠️ Stripping unknown format "${schema.format}"`);
            delete schema.format;
        }
        if (schema.properties) {
            for (const prop of Object.values(schema.properties)) {
                stripUnknownFormats(prop);
            }
        }
        if (schema.items) stripUnknownFormats(schema.items);
    }
    stripUnknownFormats(chosenOffering.requirement);
    stripUnknownFormats((chosenOffering as any).deliverable);

    // Fix stale required array — only "ticker" is required now
    const reqSchema = chosenOffering.requirement as any;
    if (reqSchema?.required) {
        reqSchema.required = ["ticker"];
        console.log("  ⚠️ Overriding stale required array to [\"ticker\"]");
    }

    console.log(`\n📤 Initiating job with ${sellerAgent.name} (${chosenOffering.name})...`);

    const jobId = await chosenOffering.initiateJob(
        {
            ticker: "GOAT",
            intent: "stealth",
        },
        undefined, // evaluator address — undefined = skip-evaluation
    );

    console.log(`✅ Job ${jobId} initiated! Waiting for seller to respond...\n`);
}

buyer().catch((err) => {
    console.error("❌ Buyer error:", err);
    process.exit(1);
});
