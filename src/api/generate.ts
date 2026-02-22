import type { FastifyInstance } from "fastify";
import { validateInput, InputValidationError } from "../modules/input.js";
import { runPipeline } from "../core/orchestrator.js";
import { createChildLogger } from "../utils/logger.js";

const log = createChildLogger("api:generate");

export async function registerGenerateRoute(app: FastifyInstance) {
    app.post("/generate", async (request, reply) => {
        const requestId = crypto.randomUUID();
        log.info({ requestId }, "Generate request received");

        try {
            // Step 1: Validate input
            const input = validateInput(request.body);

            // Step 2: Run the pipeline
            log.info({ requestId, input }, "Starting pipeline");
            const output = await runPipeline(input);

            log.info(
                {
                    requestId,
                    confidence: output.confidence_level,
                    time: output.generation_time_sec,
                },
                "Pipeline completed"
            );

            return reply.status(200).send(output);
        } catch (err) {
            if (err instanceof InputValidationError) {
                log.warn({ requestId, error: err.message }, "Validation error");
                return reply.status(400).send({
                    error: "validation_error",
                    message: err.message,
                });
            }

            // Log full error and expose details for debugging
            const errObj = err as any;
            const errorDetail = {
                message: errObj?.message || String(err),
                code: errObj?.code || errObj?.status || undefined,
                type: errObj?.type || undefined,
                apiError: errObj?.error || undefined,
                stack: errObj?.stack?.split("\n").slice(0, 5) || undefined,
            };
            log.error({ requestId, errorDetail }, "❌ Pipeline failed");
            return reply.status(500).send({
                error: "internal_error",
                message: errObj?.message || "An unexpected error occurred.",
                detail: errorDetail,
            });
        }
    });

    // Health check
    app.get("/health", async () => {
        return { status: "ok", service: "hypepack-pr", timestamp: new Date().toISOString() };
    });
}
