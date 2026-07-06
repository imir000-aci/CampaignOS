import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { naturalLanguageToSql } from "../services/nl-sql";
import { getServiceDb, nlQueryHistory, semanticSchema } from "@campaignos/db-client";
import { eq, desc, isNull } from "drizzle-orm";
import { hasPermission } from "@campaignos/rbac";
import type { JwtPayload } from "@campaignos/types";

const NlQueryBody = z.object({
  query: z.string().min(5).max(1000),
});

const FeedbackBody = z.object({
  queryId: z.string().uuid(),
  positive: z.boolean(),
});

export async function queryRoutes(app: FastifyInstance): Promise<void> {
  // POST /semantic/query — NL→SQL
  app.post("/semantic/query", { onRequest: [app.authenticate] }, async (request, reply) => {
    const body = NlQueryBody.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({ error: "Invalid request body", details: body.error.flatten() });
    }

    const user = request.user as JwtPayload;
    const result = await naturalLanguageToSql(body.data.query, user.sub);

    if (!result.isValid) {
      return reply.status(422).send({
        error: "Could not generate valid SQL",
        message: result.errorMessage,
      });
    }

    return reply.send({ sql: result.sql });
  });

  // GET /semantic/query/history — recent NL→SQL queries for current user
  app.get("/semantic/query/history", { onRequest: [app.authenticate] }, async (request, reply) => {
    const user = request.user as JwtPayload;
    const db = getServiceDb("POSTGRES_SEMANTIC_URL", semanticSchema);

    const rows = await db
      .select({
        id: nlQueryHistory.id,
        naturalLanguage: nlQueryHistory.naturalLanguage,
        generatedSql: nlQueryHistory.generatedSql,
        isValid: nlQueryHistory.isValid,
        feedbackPositive: nlQueryHistory.feedbackPositive,
        createdAt: nlQueryHistory.createdAt,
      })
      .from(nlQueryHistory)
      .where(eq(nlQueryHistory.userId, user.sub))
      .orderBy(desc(nlQueryHistory.createdAt))
      .limit(50);

    return reply.send({ data: rows });
  });

  // POST /semantic/query/feedback — thumbs up/down on a query result
  app.post("/semantic/query/feedback", { onRequest: [app.authenticate] }, async (request, reply) => {
    const body = FeedbackBody.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({ error: "Invalid request body" });
    }

    const user = request.user as JwtPayload;
    const db = getServiceDb("POSTGRES_SEMANTIC_URL", semanticSchema);

    await db
      .update(nlQueryHistory)
      .set({ feedbackPositive: body.data.positive })
      .where(eq(nlQueryHistory.id, body.data.queryId));

    return reply.status(204).send();
  });
}
