import "dotenv/config";
import Fastify from "fastify";
import { registerGenerateRoute } from "./api/generate.js";
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
