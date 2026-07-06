import Fastify from "fastify";
import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import rateLimit from "@fastify/rate-limit";
import { initTelemetry } from "@campaignos/otel";
import { authRoutes } from "./routes";
import { config } from "./config";

initTelemetry({ serviceName: "auth-service", sampleRate: 1.0 });

const app = Fastify({ logger: false });

await app.register(cors, { origin: process.env["ALLOWED_ORIGINS"]?.split(",") ?? true });

await app.register(rateLimit, {
  max: 20,
  timeWindow: "1 minute",
  keyGenerator: (req) => req.ip,
});

await app.register(jwt, {
  secret: config.jwtSecret,
});

app.decorate("authenticate", async (request: Parameters<typeof app.authenticate>[0], reply: Parameters<typeof app.authenticate>[1]) => {
  try {
    await request.jwtVerify();
  } catch {
    reply.status(401).send({ error: "Unauthorized" });
  }
});

await app.register(authRoutes);

app.get("/health", async () => ({ status: "ok", service: "auth-service" }));

try {
  await app.listen({ port: config.port, host: "0.0.0.0" });
  console.log(`auth-service listening on :${config.port}`);
} catch (err) {
  console.error(err);
  process.exit(1);
}
