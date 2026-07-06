import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { eq, and, isNull, desc } from "drizzle-orm";
import {
  getServiceDb,
  experienceSchema,
  experiences,
  experienceVariants,
  experienceSlots,
  experienceTemplates,
} from "@campaignos/db-client";
import type { JwtPayload, RbacRole } from "@campaignos/types";
import { hasPermission } from "@campaignos/rbac";
import { createLogger } from "@campaignos/otel";

const log = createLogger("experience-platform");

const CreateBody = z.object({
  campaignId: z.string().uuid(),
  experienceType: z.enum(["EMAIL", "PUSH", "SMS", "LANDING_PAGE", "IN_APP", "DISPLAY", "PAID_SOCIAL", "PAID_SEARCH"]),
  name: z.string().min(1).max(500),
  description: z.string().optional(),
  variants: z.array(z.object({
    variantKey: z.string().min(1).max(100),
    weight: z.number(),
    isControl: z.boolean().optional(),
    name: z.string().max(255).optional(),
  })).optional(),
});

const VariantBody = z.object({
  variantKey: z.string().min(1).max(100),
  weight: z.number(),
  isControl: z.boolean().optional(),
  name: z.string().max(255).optional(),
});

const VariantPatchBody = z.object({
  weight: z.number().optional(),
  name: z.string().max(255).optional(),
});

function db() { return getServiceDb("POSTGRES_EXPERIENCE_URL", experienceSchema); }
function getUser(r: { user: unknown }): JwtPayload { return r.user as JwtPayload; }

export async function experienceRoutes(app: FastifyInstance): Promise<void> {
  // GET /experiences/templates — registered BEFORE /experiences/:id to avoid route conflict
  app.get("/experiences/templates", { onRequest: [app.authenticate] }, async (_request, reply) => {
    const rows = await db()
      .select()
      .from(experienceTemplates)
      .where(isNull(experienceTemplates.deletedAt))
      .orderBy(desc(experienceTemplates.createdAt));

    return reply.send({ data: rows });
  });

  // GET /experiences?campaign_id=&type=
  app.get("/experiences", { onRequest: [app.authenticate] }, async (request, reply) => {
    const q = request.query as Record<string, string>;
    const conditions = [isNull(experiences.deletedAt)];
    if (q["campaign_id"]) conditions.push(eq(experiences.campaignId, q["campaign_id"]));
    if (q["type"]) conditions.push(eq(experiences.experienceType, q["type"] as never));

    const rows = await db()
      .select()
      .from(experiences)
      .where(and(...conditions))
      .orderBy(desc(experiences.createdAt));

    return reply.send({ data: rows });
  });

  // POST /experiences
  app.post("/experiences", { onRequest: [app.authenticate] }, async (request, reply) => {
    const user = getUser(request);
    if (!hasPermission(user.role as RbacRole, "experiences:create")) {
      return reply.status(403).send({ error: "Forbidden" });
    }

    const body = CreateBody.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({ error: "Validation failed", details: body.error.flatten() });
    }

    const store = db();
    const [experience] = await store
      .insert(experiences)
      .values({
        campaignId: body.data.campaignId,
        experienceType: body.data.experienceType,
        name: body.data.name,
        description: body.data.description,
        status: "DRAFT",
      })
      .returning();

    if (!experience) throw new Error("Insert returned no rows");

    if (body.data.variants?.length) {
      await store.insert(experienceVariants).values(
        body.data.variants.map((v) => ({
          experienceId: experience.id,
          variantKey: v.variantKey,
          weight: v.weight,
          isControl: v.isControl ?? false,
          name: v.name,
        }))
      );
    }

    return reply.status(201).send(experience);
  });

  // GET /experiences/:id
  app.get("/experiences/:id", { onRequest: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const [experience] = await db()
      .select()
      .from(experiences)
      .where(and(eq(experiences.id, id), isNull(experiences.deletedAt)))
      .limit(1);

    if (!experience) return reply.status(404).send({ error: "Experience not found" });

    const [variants, slots] = await Promise.all([
      db()
        .select()
        .from(experienceVariants)
        .where(and(eq(experienceVariants.experienceId, id), isNull(experienceVariants.deletedAt))),
      db()
        .select()
        .from(experienceSlots)
        .where(and(eq(experienceSlots.experienceId, id), isNull(experienceSlots.deletedAt))),
    ]);

    return reply.send({ ...experience, variants, slots });
  });

  // PUT /experiences/:id
  app.put("/experiences/:id", { onRequest: [app.authenticate] }, async (request, reply) => {
    const user = getUser(request);
    if (!hasPermission(user.role as RbacRole, "experiences:create")) {
      return reply.status(403).send({ error: "Forbidden" });
    }

    const { id } = request.params as { id: string };
    const body = CreateBody.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({ error: "Validation failed", details: body.error.flatten() });
    }

    const [updated] = await db()
      .update(experiences)
      .set({
        campaignId: body.data.campaignId,
        experienceType: body.data.experienceType,
        name: body.data.name,
        description: body.data.description,
        updatedAt: new Date(),
      })
      .where(and(eq(experiences.id, id), isNull(experiences.deletedAt)))
      .returning();

    if (!updated) return reply.status(404).send({ error: "Experience not found" });
    return reply.send(updated);
  });

  // DELETE /experiences/:id
  app.delete("/experiences/:id", { onRequest: [app.authenticate] }, async (request, reply) => {
    const user = getUser(request);
    if (!hasPermission(user.role as RbacRole, "experiences:create")) {
      return reply.status(403).send({ error: "Forbidden" });
    }

    const { id } = request.params as { id: string };
    const [deleted] = await db()
      .update(experiences)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(experiences.id, id), isNull(experiences.deletedAt)))
      .returning({ id: experiences.id });

    if (!deleted) return reply.status(404).send({ error: "Experience not found" });
    return reply.status(204).send();
  });

  // POST /experiences/:id/variants
  app.post("/experiences/:id/variants", { onRequest: [app.authenticate] }, async (request, reply) => {
    const user = getUser(request);
    if (!hasPermission(user.role as RbacRole, "experiences:create")) {
      return reply.status(403).send({ error: "Forbidden" });
    }

    const { id } = request.params as { id: string };

    const [experience] = await db()
      .select()
      .from(experiences)
      .where(and(eq(experiences.id, id), isNull(experiences.deletedAt)))
      .limit(1);

    if (!experience) return reply.status(404).send({ error: "Experience not found" });

    const body = VariantBody.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({ error: "Validation failed", details: body.error.flatten() });
    }

    const [variant] = await db()
      .insert(experienceVariants)
      .values({
        experienceId: id,
        variantKey: body.data.variantKey,
        weight: body.data.weight,
        isControl: body.data.isControl ?? false,
        name: body.data.name,
      })
      .returning();

    if (!variant) throw new Error("Insert returned no rows");

    return reply.status(201).send(variant);
  });

  // PATCH /experiences/:id/variants/:variantId
  app.patch("/experiences/:id/variants/:variantId", { onRequest: [app.authenticate] }, async (request, reply) => {
    const user = getUser(request);
    if (!hasPermission(user.role as RbacRole, "experiences:create")) {
      return reply.status(403).send({ error: "Forbidden" });
    }

    const { id, variantId } = request.params as { id: string; variantId: string };
    const body = VariantPatchBody.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({ error: "Validation failed", details: body.error.flatten() });
    }

    const [updated] = await db()
      .update(experienceVariants)
      .set({ ...body.data, updatedAt: new Date() })
      .where(
        and(
          eq(experienceVariants.id, variantId),
          eq(experienceVariants.experienceId, id),
          isNull(experienceVariants.deletedAt)
        )
      )
      .returning();

    if (!updated) return reply.status(404).send({ error: "Variant not found" });
    return reply.send(updated);
  });

  // DELETE /experiences/:id/variants/:variantId
  app.delete("/experiences/:id/variants/:variantId", { onRequest: [app.authenticate] }, async (request, reply) => {
    const user = getUser(request);
    if (!hasPermission(user.role as RbacRole, "experiences:create")) {
      return reply.status(403).send({ error: "Forbidden" });
    }

    const { id, variantId } = request.params as { id: string; variantId: string };
    const [deleted] = await db()
      .update(experienceVariants)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(experienceVariants.id, variantId),
          eq(experienceVariants.experienceId, id),
          isNull(experienceVariants.deletedAt)
        )
      )
      .returning({ id: experienceVariants.id });

    if (!deleted) return reply.status(404).send({ error: "Variant not found" });
    return reply.status(204).send();
  });
}
