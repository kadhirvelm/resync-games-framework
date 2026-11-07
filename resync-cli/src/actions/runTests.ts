import { execSync } from "node:child_process";
import { DATABASE_HOST_URL } from "../constants/database";
import { getRoot } from "../utils/getRoot";
import { loadEnvironment } from "./loadEnvironment";

const TEST_TYPES = ["frontend", "backend", "all"] as const;

export function runTests(
  testType: "backend" | "frontend" | "all",
  args?: string[],
) {
  loadEnvironment();

  if (!TEST_TYPES.includes(testType)) {
    throw new Error(
      `Invalid test type: ${testType}. Must be one of: ${TEST_TYPES.join(", ")}`,
    );
  }

  const root = getRoot();

  if (testType !== "frontend") {
    // Reset the test database before running the tests
    execSync("bunx prisma migrate reset --force", {
      cwd: `${root}/packages/database`,
      env: {
        ...process.env,
        DATABASE_HOST_URL,
      },
      stdio: "inherit",
    });
  }

  if (testType === "backend") {
    execSync(`bun test ${args?.join(" ")}`, {
      cwd: `${root}/packages/backend`,
      env: {
        ...process.env,
        DATABASE_HOST_URL,
      },
      stdio: "inherit",
    });
    return;
  }

  if (testType === "frontend") {
    execSync(`bun test ${args?.join(" ")}`, {
      cwd: `${root}/packages/frontend`,
    });
    return;
  }

  execSync(`bun test`, {
    cwd: `${root}/packages/backend`,
    env: {
      ...process.env,
      DATABASE_HOST_URL,
    },
    stdio: "inherit",
  });
  execSync(`bun test`, {
    cwd: `${root}/packages/frontend`,
    stdio: "inherit",
  });
}
