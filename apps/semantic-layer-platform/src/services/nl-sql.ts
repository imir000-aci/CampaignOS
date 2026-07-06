import Anthropic from "@anthropic-ai/sdk";
import { getServiceDb, nlQueryHistory, semanticSchema } from "@campaignos/db-client";
import { createLogger } from "@campaignos/otel";
import { config } from "../config";

const log = createLogger("semantic-layer-platform");

const SCHEMA_CONTEXT = `
You are a SQL assistant for CampaignOS — a retail marketing platform operating at Albertsons scale.
Generate read-only PostgreSQL SELECT queries only. Never generate INSERT/UPDATE/DELETE/DROP/ALTER.

Available tables and key columns:

-- strategy_db (campaigns, kpis)
campaigns: id, name, status, objective, brief_text, start_date, end_date,
           budget_total_cents, channel_mix, owner_user_id, division_id, banner_id
campaign_kpis: id, campaign_id, metric_name, target_value, measurement_window_days

-- audience_db (customers, audiences)
customer_attributes: customer_id, loyalty_tier, lifetime_value_cents,
                     days_since_last_purchase, preferred_banner_id, age_band,
                     has_children, zip_code, digital_enrolled
audiences: id, name, audience_type, status, estimated_size, campaign_id
audience_members: audience_id, customer_id, score, included_at

-- offer_db (offers, redemptions)
offers: id, name, offer_type, status, discount_value, budget_total_cents,
        budget_remaining_cents, valid_from, valid_until
offer_redemptions: offer_id, customer_id, discount_applied_cents

-- measurement_db (revenue, attribution)
revenue_events: event_id, customer_id, store_id, total_amount_cents, occurred_at, channel
revenue_event_items: revenue_event_id, product_id, quantity, unit_price_cents, offer_id
campaign_attributions: revenue_event_id, campaign_id, attribution_model,
                       attributed_revenue_cents
measurement_rollups: campaign_id, rollup_date, channel, impressions, clicks,
                     conversions, attributed_revenue_cents, roas

Rules:
- Always alias amount/cents columns as human-readable names (e.g. budget_total_cents / 100 AS budget_dollars)
- Use LIMIT 1000 unless the user asks for aggregates or totals
- Use parameterized-style comments for dynamic values like dates
- Return only the SQL query, no explanation
`.trim();

const DANGEROUS_KEYWORDS = /\b(INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE|CREATE|GRANT|REVOKE|EXECUTE|EXEC)\b/i;

export interface NlQueryResult {
  sql: string;
  isValid: boolean;
  errorMessage?: string;
}

export async function naturalLanguageToSql(
  naturalLanguage: string,
  userId: string
): Promise<NlQueryResult> {
  const db = getServiceDb("POSTGRES_SEMANTIC_URL", semanticSchema);

  if (!config.anthropicApiKey) {
    const fallback = CURATED_QUERIES[normalizeQuery(naturalLanguage)];
    if (fallback) {
      await persistQuery(db, userId, naturalLanguage, fallback, true, null);
      return { sql: fallback, isValid: true };
    }
    return {
      sql: "",
      isValid: false,
      errorMessage: "NL→SQL requires ANTHROPIC_API_KEY. Set it or use the structured filter API.",
    };
  }

  const client = new Anthropic({ apiKey: config.anthropicApiKey });

  let generatedSql = "";
  let isValid = false;
  let errorMessage: string | undefined;

  try {
    const message = await client.messages.create({
      model: config.nlSqlModel,
      max_tokens: config.nlSqlMaxTokens,
      system: SCHEMA_CONTEXT,
      messages: [{ role: "user", content: naturalLanguage }],
    });

    const textContent = message.content.find((c) => c.type === "text");
    generatedSql = textContent?.text?.trim() ?? "";

    // Strip markdown fences if present
    generatedSql = generatedSql.replace(/^```sql\n?/i, "").replace(/\n?```$/, "").trim();

    if (DANGEROUS_KEYWORDS.test(generatedSql)) {
      isValid = false;
      errorMessage = "Generated query contains disallowed operations.";
      generatedSql = "";
    } else if (!generatedSql.toUpperCase().startsWith("SELECT")) {
      isValid = false;
      errorMessage = "Generated query is not a SELECT statement.";
      generatedSql = "";
    } else {
      isValid = true;
    }
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : "LLM call failed";
    log.error("NL→SQL generation failed", { error: errorMessage });
  }

  await persistQuery(db, userId, naturalLanguage, generatedSql || null, isValid, errorMessage ?? null);

  return { sql: generatedSql, isValid, errorMessage };
}

async function persistQuery(
  db: ReturnType<typeof getServiceDb>,
  userId: string,
  naturalLanguage: string,
  sql: string | null,
  isValid: boolean,
  error: string | null
): Promise<void> {
  try {
    await db.insert(nlQueryHistory).values({
      userId,
      naturalLanguage,
      generatedSql: sql,
      isValid,
      errorMessage: error,
    });
  } catch {
    // Non-fatal: history persistence failure doesn't block the response
  }
}

function normalizeQuery(q: string): string {
  return q.toLowerCase().replace(/\s+/g, " ").trim();
}

const CURATED_QUERIES: Record<string, string> = {
  "show active campaigns": `SELECT id, name, status, objective, start_date, end_date,
  budget_total_cents / 100 AS budget_dollars
FROM campaigns WHERE status = 'ACTIVE' AND deleted_at IS NULL LIMIT 50`,

  "total revenue by campaign": `SELECT c.name AS campaign, c.id AS campaign_id,
  SUM(ca.attributed_revenue_cents) / 100 AS attributed_revenue_dollars
FROM campaign_attributions ca
JOIN campaigns c ON ca.campaign_id = c.id
WHERE ca.attribution_model = 'LAST_TOUCH'
GROUP BY c.id, c.name
ORDER BY attributed_revenue_dollars DESC LIMIT 100`,

  "top redeemed offers": `SELECT o.name, o.offer_type, COUNT(r.id) AS redemption_count,
  SUM(r.discount_applied_cents) / 100 AS total_discount_dollars
FROM offers o
JOIN offer_redemptions r ON r.offer_id = o.id
GROUP BY o.id, o.name, o.offer_type
ORDER BY redemption_count DESC LIMIT 20`,

  "audience size summary": `SELECT audience_type, status,
  AVG(estimated_size) AS avg_size,
  COUNT(*) AS audience_count
FROM audiences WHERE deleted_at IS NULL
GROUP BY audience_type, status ORDER BY audience_count DESC`,
};
