import { execSync } from "node:child_process";
import postgres from "postgres";
import { getRoot } from "../utils/getRoot";
import { logColorMessage } from "../utils/logColorMessage";
import { ensureEnvFileInSync } from "./ensureEnvInSync";
import { loadEnvironment } from "./loadEnvironment";

export async function createTestDatabase() {
  try {
    // Connect to the 'postgres' database (default maintenance DB)
    const systemClient = postgres({
      database: "postgres",
      host: "localhost",
      password: "test-database",
      port: 5432,
      username: "postgres",
    });

    await systemClient`DROP DATABASE IF EXISTS "test";`;
    await systemClient`CREATE DATABASE "test";`;
    logColorMessage("Test database created.", "yellow");

    await systemClient.end();
  } catch (error) {
    logColorMessage(`Failed to create test database: ${error}`, "red");
    throw error;
  }
}

export async function database(args: string[]) {
  ensureEnvFileInSync();
  loadEnvironment();
  const root = getRoot();

  execSync(`bun run ${args.join(" ")}`, {
    cwd: `${root}/packages/database`,
    env: {
      ...process.env,
    },
    stdio: "inherit",
  });
}
