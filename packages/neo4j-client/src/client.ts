import neo4j, { type Driver, type Session, type QueryResult } from "neo4j-driver";

let _driver: Driver | null = null;

export function getNeo4jDriver(): Driver {
  if (_driver) return _driver;

  const uri = process.env["NEO4J_URI"] ?? "bolt://localhost:7687";
  const user = process.env["NEO4J_USER"] ?? "neo4j";
  const password = process.env["NEO4J_PASSWORD"];

  if (!password) throw new Error("NEO4J_PASSWORD environment variable is required");

  _driver = neo4j.driver(uri, neo4j.auth.basic(user, password), {
    maxConnectionPoolSize: 50,
    connectionAcquisitionTimeout: 5000,
    logging: neo4j.logging.console("warn"),
  });

  return _driver;
}

export async function runQuery<T = Record<string, unknown>>(
  cypher: string,
  params?: Record<string, unknown>
): Promise<QueryResult> {
  const driver = getNeo4jDriver();
  const session = driver.session({ defaultAccessMode: neo4j.session.READ });
  try {
    return await session.run(cypher, params);
  } finally {
    await session.close();
  }
}

export async function runWriteQuery(
  cypher: string,
  params?: Record<string, unknown>
): Promise<QueryResult> {
  const driver = getNeo4jDriver();
  const session = driver.session({ defaultAccessMode: neo4j.session.WRITE });
  try {
    return await session.writeTransaction((tx) => tx.run(cypher, params));
  } finally {
    await session.close();
  }
}

export async function closeNeo4j(): Promise<void> {
  if (_driver) {
    await _driver.close();
    _driver = null;
  }
}
