import "dotenv/config";
import Fastify from "fastify";
import { registerGenerateRoute } from "./api/generate.js";
import { startAcpProvider } from "./acp/acpProvider.js";
import { logger } from "./utils/logger.js";

const PORT = parseInt(process.env.PORT || "3000", 10);
const HOST = process.env.HOST || "0.0.0.0";

async function main() {
    const app = Fastify({
        logger: false, // We use our own pino logger
        bodyLimit: 1_048_576, // 1MB
        requestTimeout: 300_000, // 5 minute timeout for long-running generation
    });

    // Register routes
    await registerGenerateRoute(app);

    // Start ACP Provider (if configured)
    const acpConfigured = process.env.ACP_WALLET_PRIVATE_KEY && process.env.ACP_ENTITY_ID && process.env.ACP_AGENT_WALLET_ADDRESS;
    if (acpConfigured) {
        try {
            await startAcpProvider();
            logger.info("🔗 ACP Provider connected to Virtuals Protocol");
        } catch (err) {
            const e = err as Error;
            logger.error({ error: e.message, stack: e.stack }, "⚠️ ACP Provider failed to start — continuing with HTTP-only mode");
        }
    } else {
        logger.warn("ACP env vars not set (ACP_WALLET_PRIVATE_KEY, ACP_ENTITY_ID, ACP_AGENT_WALLET_ADDRESS) — skipping ACP provider");
    }

    // Graceful shutdown
    const signals: NodeJS.Signals[] = ["SIGINT", "SIGTERM"];
    for (const signal of signals) {
        process.on(signal, async () => {
            logger.info({ signal }, "Shutdown signal received");
            await app.close();
            process.exit(0);
        });
    }

    // Start server
    try {
        await app.listen({ port: PORT, host: HOST });
        logger.info({ port: PORT, host: HOST }, `🚀 HYPEPACK PR server listening`);
    } catch (err) {
        logger.fatal({ error: err }, "Failed to start server");
        process.exit(1);
    }
}

main();
