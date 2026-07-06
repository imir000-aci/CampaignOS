import { runWriteQuery } from "./client";

const CONSTRAINTS = [
  "CREATE CONSTRAINT customer_id IF NOT EXISTS FOR (c:Customer) REQUIRE c.id IS UNIQUE",
  "CREATE CONSTRAINT product_id IF NOT EXISTS FOR (p:Product) REQUIRE p.id IS UNIQUE",
  "CREATE CONSTRAINT offer_id IF NOT EXISTS FOR (o:Offer) REQUIRE o.id IS UNIQUE",
  "CREATE CONSTRAINT campaign_id IF NOT EXISTS FOR (c:Campaign) REQUIRE c.id IS UNIQUE",
  "CREATE CONSTRAINT store_id IF NOT EXISTS FOR (s:Store) REQUIRE s.id IS UNIQUE",
  "CREATE CONSTRAINT audience_id IF NOT EXISTS FOR (a:Audience) REQUIRE a.id IS UNIQUE",
  "CREATE CONSTRAINT category_id IF NOT EXISTS FOR (c:Category) REQUIRE c.id IS UNIQUE",
  "CREATE CONSTRAINT bundle_id IF NOT EXISTS FOR (b:Bundle) REQUIRE b.id IS UNIQUE",
  "CREATE CONSTRAINT division_id IF NOT EXISTS FOR (d:Division) REQUIRE d.id IS UNIQUE",
  "CREATE CONSTRAINT banner_id IF NOT EXISTS FOR (b:Banner) REQUIRE b.id IS UNIQUE",
];

const INDEXES = [
  "CREATE INDEX customer_zip IF NOT EXISTS FOR (c:Customer) ON (c.zipCode)",
  "CREATE INDEX customer_loyalty IF NOT EXISTS FOR (c:Customer) ON (c.loyaltyTier)",
  "CREATE INDEX product_category IF NOT EXISTS FOR (p:Product) ON (p.categoryId)",
  "CREATE INDEX offer_status IF NOT EXISTS FOR (o:Offer) ON (o.status)",
];

export async function applyNeo4jSchema(): Promise<void> {
  for (const stmt of [...CONSTRAINTS, ...INDEXES]) {
    await runWriteQuery(stmt);
  }
  console.log("Neo4j schema applied.");
}
