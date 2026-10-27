import { spawnSync } from "node:child_process";

/**
 * Talking to the test database through `psql`, as the roles a Supabase
 * request actually runs as.
 *
 * Every query made "as" someone runs in a transaction that sets the role and
 * the signed-in user exactly the way PostgREST does for a real request, and
 * is rolled back afterwards, so one test's write is never another's fixture.
 */

export type Who = "anon" | { user: string };

export type Result = { ok: true; rows: string[][] } | { ok: false; error: string };

const psql = (url: string, sql: string): Result => {
  const out = spawnSync(process.env.PSQL ?? "psql", ["-X", "-q", "-At", "-F", "\t", "-v", "ON_ERROR_STOP=1", "-d", url], {
    input: sql,
    encoding: "utf8",
  });
  if (out.error) throw out.error;
  if (out.status !== 0) return { ok: false, error: (out.stderr || out.stdout).trim() };
  const rows = out.stdout
    .split("\n")
    .filter((line) => line !== "")
    .map((line) => line.split("\t"));
  return { ok: true, rows };
};

/** A database URL with a different database name on the same server. */
export const onDatabase = (server: string, name: string) =>
  server.replace(/^(postgres(?:ql)?:\/\/[^/?]*)(\/[^?]*)?/, `$1/${name}`);

/** As the database owner: fixtures, schema, the checks no role should be able to make. */
export function admin(url: string, sql: string): string[][] {
  const result = psql(url, sql);
  if (!result.ok) throw new Error(result.error);
  return result.rows;
}

/** As a request would run it: anonymous, or signed in as a user. */
export function as(url: string, who: Who, sql: string): Result {
  const role =
    who === "anon"
      ? "set local role anon;\n"
      : `set local role authenticated;\nset local request.jwt.claim.sub = '${who.user}';\n`;
  return psql(url, `begin;\n${role}${sql};\nrollback;\n`);
}

/** The rows a query returns as someone, failing the test if it errors. */
export function rowsAs(url: string, who: Who, sql: string): string[][] {
  const result = as(url, who, sql);
  if (!result.ok) throw new Error(result.error);
  return result.rows;
}
