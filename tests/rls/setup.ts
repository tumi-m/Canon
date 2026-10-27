import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { TestProject } from "vitest/node";
import { admin, onDatabase } from "./db";

declare module "vitest" {
  export interface ProvidedContext {
    rlsUrl: string;
  }
}

const read = (path: string) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8");

/**
 * A database of its own for every run, made on the server RLS_DATABASE_URL
 * points at and dropped afterwards. Nothing already on that server is read
 * or touched, so pointing it at a shared Postgres cannot cost anybody data.
 *
 * The migration under test is the real one, unedited: if it does not apply
 * here, it does not apply.
 */
export default function setup(project: TestProject) {
  const server = process.env.RLS_DATABASE_URL;
  if (!server) {
    throw new Error(
      "the RLS tests need a Postgres server: set RLS_DATABASE_URL, e.g. " +
        "postgresql://postgres:postgres@localhost:5432/postgres. CI runs one as a service.",
    );
  }
  const name = `canon_rls_${process.pid}_${Date.now()}`;
  admin(server, `create database ${name}`);
  const url = onDatabase(server, name);
  admin(url, read("./supabase-shim.sql"));
  admin(url, read("../../supabase/migrations/0001_canon_init.sql"));
  project.provide("rlsUrl", url);
  return () => {
    admin(server, `drop database if exists ${name} with (force)`);
  };
}
