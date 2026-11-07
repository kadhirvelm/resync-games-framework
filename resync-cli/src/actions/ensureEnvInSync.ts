import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_LOCAL_ENV_VALUES } from "../constants/defaultEnv";
import { getRoot } from "../utils/getRoot";
import { logColorMessage } from "../utils/logColorMessage";

function getSecretKeys() {
  return Object.entries(DEFAULT_LOCAL_ENV_VALUES)
    .filter(([_, value]) => value.includes("replace-with-local-credentials"))
    .map(([key]) => key);
}

function getDefinedKeys(otherKeys: string[]) {
  return Object.entries(DEFAULT_LOCAL_ENV_VALUES)
    .filter(([key]) => !otherKeys.includes(key))
    .map(([key]) => key);
}

function categorizeKeys(keys: [string, string][]) {
  const secrets: { [key: string]: string } = {};
  const other: { [key: string]: string } = {};

  const secretKeys = getSecretKeys();
  const otherKeys = getDefinedKeys(secretKeys);

  for (const [key, value] of keys) {
    if (key === "") {
      continue;
    }

    if (secretKeys.includes(key)) {
      secrets[key] = value;
    } else if (otherKeys.includes(key)) {
      other[key] = value;
    }
  }

  return { other, secrets };
}

export function ensureEnvFileInSync() {
  const root = getRoot();
  const envFile = join(root, ".env");
  if (!existsSync(envFile)) {
    writeFileSync(envFile, "");
  }

  const envFileContent = readFileSync(envFile, "utf8");
  let envFileContentObject = Object.fromEntries(
    envFileContent.split("\n").map((line) => {
      const [key, ...value] = line.split("=");
      return [key, value.join("=")];
    }),
  );

  // Hostname overrides for `resync dev --network`. Kept even though they are not
  // default local values, so a developer can pin them in `.env`. Shell exports
  // still win at read time.
  const ngrokSettings: Record<string, string> = {};
  for (const [key, value] of Object.entries(envFileContentObject)) {
    if (key.startsWith("NGROK_") && value !== "") {
      ngrokSettings[key] = value;
    }
  }

  // Make sure to account for the locally loaded environment variables - used for CI
  // Process.env should take precedence over the file to allow CI overrides
  envFileContentObject = { ...envFileContentObject, ...process.env } as Record<
    string,
    string
  >;

  let totalChanges = 0;

  const finalEnvFileContent = envFileContentObject;
  for (const [key, value] of Object.entries(DEFAULT_LOCAL_ENV_VALUES)) {
    if (envFileContentObject[key] !== undefined) {
      continue;
    }

    finalEnvFileContent[key] = value;
    totalChanges++;
  }

  if (totalChanges > 0) {
    logColorMessage(
      `Added ${totalChanges} environment variables to .env file`,
      "yellow",
    );
  } else {
    logColorMessage("Environment file is in sync", "green");
  }

  const { other, secrets } = categorizeKeys(
    Object.entries(finalEnvFileContent),
  );

  const otherAsString = Object.entries(other)
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  const secretsAsString = Object.entries(secrets)
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  const ngrokAsString = Object.entries(ngrokSettings)
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");

  writeFileSync(
    envFile,
    [otherAsString, secretsAsString, ngrokAsString]
      .filter(Boolean)
      .join("\n\n"),
  );

  return {
    ...other,
    ...secrets,
    ...ngrokSettings,
  };
}
