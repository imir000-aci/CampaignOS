import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

interface ServiceMigrationConfig {
  envVar: string;
  migrationsFolder: string;
}

const SERVICES: ServiceMigrationConfig[] = [
  { envVar: "POSTGRES_STRATEGY_URL", migrationsFolder: "strategy" },
  { envVar: "POSTGRES_AUDIENCE_URL", migrationsFolder: "audience" },
  { envVar: "POSTGRES_TARGETING_URL", migrationsFolder: "targeting" },
  { envVar: "POSTGRES_EXPERIENCE_URL", migrationsFolder: "experience" },
  { envVar: "POSTGRES_EXPERIMENT_URL", migrationsFolder: "experiment" },
  { envVar: "POSTGRES_MEASUREMENT_URL", migrationsFolder: "measurement" },
  { envVar: "POSTGRES_RECOMMENDATION_URL", migrationsFolder: "recommendation" },
  { envVar: "POSTGRES_OFFER_URL", migrationsFolder: "offer" },
  { envVar: "POSTGRES_BUNDLE_URL", migrationsFolder: "bundle" },
  { envVar: "POSTGRES_CREATIVE_URL", migrationsFolder: "creative" },
  { envVar: "POSTGRES_SEMANTIC_URL", migrationsFolder: "semantic" },
  { envVar: "POSTGRES_ACTIVATION_URL", migrationsFolder: "activation" },
  { envVar: "POSTGRES_AUTH_URL", migrationsFolder: "auth" },
  { envVar: "POSTGRES_AGENT_URL", migrationsFolder: "agent" },
];

async function runMigrations(target?: string): Promise<void> {
  const targets = target
    ? SERVICES.filter((s) => s.migrationsFolder === target)
    : SERVICES;

  if (targets.length === 0) {
    console.error(`Unknown migration target: ${target}`);
    process.exit(1);
  }

  let failed = 0;

  for (const service of targets) {
    const url = process.env[service.envVar];
    if (!url) {
      console.warn(`Skipping ${service.migrationsFolder}: ${service.envVar} not set`);
      continue;
    }

    const migrationsPath = path.join(
      __dirname,
      `../migrations/${service.migrationsFolder}`
    );

    try {
      const sql = postgres(url, { max: 1 });
      const db = drizzle(sql);
      await migrate(db, { migrationsFolder: migrationsPath });
      await sql.end();
      console.log(`✓ ${service.migrationsFolder}`);
    } catch (err) {
      console.error(`✗ ${service.migrationsFolder}:`, err);
      failed++;
    }
  }

  if (failed > 0) {
    console.error(`\n${failed} migration(s) failed.`);
    process.exit(1);
  }

  console.log("\nAll migrations complete.");
}

const target = process.argv[2];
await runMigrations(target);
