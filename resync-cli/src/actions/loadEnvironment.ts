import { existsSync } from "node:fs";
import { config } from "dotenv";
import { getRoot } from "../utils/getRoot";
import { logColorMessage } from "../utils/logColorMessage";

export function loadEnvironment() {
  const root = getRoot();
  const rootEnv = `${root}/.env`;

  if (!existsSync(rootEnv)) {
    throw new Error(`Environment file not found at ${rootEnv}`);
  }

  // Need to load the environment variables into process.env manually here, because of the live process
  const newEnvironment = config({ path: rootEnv });
  process.env = {
    ...process.env,
    ...newEnvironment.parsed,
  };
  logColorMessage(`Environment variables loaded from ${rootEnv}`, "yellow");
}
