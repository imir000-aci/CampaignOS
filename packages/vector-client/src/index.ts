import postgres from "postgres";

export interface VectorSearchResult {
  id: string;
  score: number;
  [key: string]: unknown;
}

export interface VectorSearchOptions {
  connectionString: string;
  table: string;
  embeddingColumn: string;
  idColumn?: string;
  returnColumns?: string[];
  limit?: number;
  filter?: string;
  filterParams?: unknown[];
}

export async function vectorSearch(
  embedding: number[],
  opts: VectorSearchOptions
): Promise<VectorSearchResult[]> {
  const {
    connectionString,
    table,
    embeddingColumn,
    idColumn = "id",
    returnColumns = [],
    limit = 10,
    filter,
    filterParams = [],
  } = opts;

  const sql = postgres(connectionString, { max: 2 });

  const selectCols = [idColumn, `1 - (${embeddingColumn} <=> $1::vector) AS score`, ...returnColumns].join(", ");
  const where = filter ? `WHERE ${filter}` : "";
  const paramOffset = filterParams.length;

  try {
    const vectorLiteral = `[${embedding.join(",")}]`;
    const query = `
      SELECT ${selectCols}
      FROM ${table}
      ${where}
      ORDER BY ${embeddingColumn} <=> $1::vector
      LIMIT ${limit}
    `;

    const rows = await sql.unsafe(query, [vectorLiteral, ...filterParams]);
    return rows as VectorSearchResult[];
  } finally {
    await sql.end();
  }
}

export async function upsertEmbedding(
  connectionString: string,
  table: string,
  idColumn: string,
  idValue: string,
  embeddingColumn: string,
  embedding: number[],
  additionalColumns?: Record<string, unknown>
): Promise<void> {
  const sql = postgres(connectionString, { max: 2 });

  const additionalCols = additionalColumns ? Object.keys(additionalColumns) : [];
  const additionalVals = additionalColumns ? Object.values(additionalColumns) : [];
  const allCols = [idColumn, embeddingColumn, ...additionalCols];
  const allVals = [idValue, `[${embedding.join(",")}]::vector`, ...additionalVals];

  const insertCols = allCols.join(", ");
  const insertPlaceholders = allVals.map((_, i) => {
    if (i === 1) return `$${i + 1}::vector`;
    return `$${i + 1}`;
  }).join(", ");

  const updateSet = [
    `${embeddingColumn} = EXCLUDED.${embeddingColumn}`,
    ...additionalCols.map((c) => `${c} = EXCLUDED.${c}`),
  ].join(", ");

  try {
    await sql.unsafe(
      `INSERT INTO ${table} (${insertCols}) VALUES (${insertPlaceholders})
       ON CONFLICT (${idColumn}) DO UPDATE SET ${updateSet}`,
      [idValue, `[${embedding.join(",")}]`, ...additionalVals]
    );
  } finally {
    await sql.end();
  }
}

export async function createHnswIndex(
  connectionString: string,
  table: string,
  column: string,
  m = 16,
  efConstruction = 64
): Promise<void> {
  const sql = postgres(connectionString, { max: 1 });
  try {
    await sql.unsafe(`
      CREATE INDEX IF NOT EXISTS ${table}_${column}_hnsw
      ON ${table} USING hnsw (${column} vector_cosine_ops)
      WITH (m = ${m}, ef_construction = ${efConstruction})
    `);
  } finally {
    await sql.end();
  }
}
