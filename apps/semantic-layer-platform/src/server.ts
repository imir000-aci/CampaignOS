import Fastify from "fastify";
import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import { initTelemetry } from "@campaignos/otel";
import { entityRoutes } from "./routes/entities";
import { queryRoutes } from "./routes/query";
import { schemaRoutes } from "./routes/schema";
import { config } from "./config";

initTelemetry({ serviceName: "semantic-layer-platform" });

const app = Fastify({ logger: false });

await app.register(cors, { origin: process.env["ALLOWED_ORIGINS"]?.split(",") ?? true });

await app.register(jwt, { secret: config.jwtSecret });

app.decorate(
  "authenticate",
  async (request: Parameters<typeof app.authenticate>[0], reply: Parameters<typeof app.authenticate>[1]) => {
    try {
      await request.jwtVerify();
    } catch {
      reply.status(401).send({ error: "Unauthorized" });
    }
  }
);

await app.register(entityRoutes);
await app.register(queryRoutes);
await app.register(schemaRoutes);

app.get("/health", async () => ({ status: "ok", service: "semantic-layer-platform" }));

// Internal service-to-service endpoint (no JWT required, API key only)
app.get(
  "/internal/entities/:type/:id",
  {
    preHandler: async (request, reply) => {
      const apiKey = request.headers["x-api-key"];
      const expected = process.env["SVC_KEY_SEMANTIC_LAYER"];
      if (!apiKey || apiKey !== expected) {
        reply.status(401).send({ error: "Unauthorized" });
      }
    },
  },
  async (request, reply) => {
    const { type, id } = request.params as { type: string; id: string };
    const { resolveEntity } = await import("./services/entity-resolver");
    const entity = await resolveEntity(type.toUpperCase(), id);
    if (!entity) return reply.status(404).send({ error: "Not found" });
    return reply.send(entity);
  }
);

try {
  await app.listen({ port: config.port, host: "0.0.0.0" });
  console.log(`semantic-layer-platform listening on :${config.port}`);
} catch (err) {
  console.error(err);
  process.exit(1);
}
