import { execSync } from "node:child_process";
import { exit } from "node:process";
import postgres from "postgres";
import {
  DATABASE_HOST_URL,
  SHADOW_DATABASE_HOST_URL,
} from "../constants/database";
import { logColorMessage } from "../utils/logColorMessage";

/**
 * Made to be run from the root of the repo.
 */
export async function checkMigrations() {
  process.env.DATABASE_HOST_URL = DATABASE_HOST_URL;
  process.env.SHADOW_DATABASE_HOST_URL = SHADOW_DATABASE_HOST_URL;

  // Connect to the 'postgres' database (default maintenance DB)
  const systemClient = postgres({
    database: "postgres",
    host: "localhost",
    password: "test-database",
    port: 5432,
    username: "postgres",
  });

  await systemClient`DROP DATABASE IF EXISTS "test-shadow";`;
  await systemClient`CREATE DATABASE "test-shadow";`;
  await systemClient.end();

  const result = execSync(
    `bun run prisma migrate diff --from-migrations ./prisma/migrations --to-schema ./prisma/schema.prisma`,
    {
      cwd: "./packages/database",
      env: {
        ...process.env,
        DATABASE_HOST_URL,
        SHADOW_DATABASE_HOST_URL,
      },
    },
  )
    .toString()
    .trim();

  if (result === "No difference detected.") {
    logColorMessage("Migrations are in sync. Good to go.", "green");
    exit(0);
  }

  logColorMessage(
    `Migrations are not in sync. Please run bun run database db:create-migration to generate the migration files:\n${result}`,
    "red",
  );
  exit(1);
}
