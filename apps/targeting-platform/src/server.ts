import Fastify from "fastify";
import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import { initTelemetry } from "@campaignos/otel";
import { targetingRoutes } from "./routes/targeting";

initTelemetry({ serviceName: "targeting-platform" });

const app = Fastify({ logger: false });

const jwtSecret = process.env["JWT_SECRET"] ?? (() => { throw new Error("JWT_SECRET required"); })();
const port = parseInt(process.env["PORT"] ?? "3030");

await app.register(cors, { origin: process.env["ALLOWED_ORIGINS"]?.split(",") ?? true });
await app.register(jwt, { secret: jwtSecret });

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

await app.register(targetingRoutes);

app.get("/health", async () => ({ status: "ok", service: "targeting-platform" }));

try {
  await app.listen({ port, host: "0.0.0.0" });
  console.log(`targeting-platform listening on :${port}`);
} catch (err) {
  console.error(err);
  process.exit(1);
}
