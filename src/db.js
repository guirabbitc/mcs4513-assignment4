import pg from "pg";

export const DATABASE_URL =
  process.env.DATABASE_URL ||
  "postgres://postgres:postgres@localhost:5432/enrollmentnow_test";

// Safety rule from the assignment: automated tests never touch production data.
// This app refuses to connect to any database whose name does not end in "_test".
const dbName = new URL(DATABASE_URL).pathname.slice(1);
if (!dbName.endsWith("_test")) {
  throw new Error(
    `Refusing to connect to "${dbName}". Tests must use a separate *_test database.`
  );
}

export const db = new pg.Pool({ connectionString: DATABASE_URL, max: 5 });

export async function getMigrationLevel() {
  const result = await db.query(
    "SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1"
  );
  return result.rows[0]?.version ?? "none";
}
