import { execSync } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getRoot } from "./getRoot";
import { logColorMessage } from "./logColorMessage";
import { getReservedNgrokDomain, type NgrokUrls } from "./ngrok";

const DEFAULT_FRONTEND_URL = "https://localhost:3000";

/**
 * A tunnel URL a previous `--network` run wrote and whose tunnel died with
 * it: either a free-plan `*.ngrok-free.*` address, or the hostname the CLI
 * itself derives for this developer. Hostnames the developer tunnels by hand
 * (not matching the CLI's derived one) are left alone.
 */
function isCliManagedNgrokUrl(
  url: string | undefined,
  name: keyof NgrokUrls,
  environmentFile: Record<string, string>,
) {
  if (url === undefined) return false;
  if (url.includes("ngrok-free.")) return true;

  return url === `https://${getReservedNgrokDomain(name, environmentFile)}`;
}

/**
 * A backend URL the developer pointed somewhere other than this machine.
 * Preserved across `resync dev` runs so the frontend can target a remote API.
 * CLI-managed ngrok hostnames are not deliberate — they die with the process.
 */
function isDeliberateBackendUrl(
  url: string | undefined,
  environmentFile: Record<string, string>,
) {
  if (url === undefined || url === "") return false;
  if (isCliManagedNgrokUrl(url, "backend", environmentFile)) return false;
  return !url.includes("localhost") && !url.includes("127.0.0.1");
}

function resolveBackendUrl(
  environmentFile: Record<string, string>,
  ipAddress: string,
  ngrokUrls?: NgrokUrls,
) {
  if (ngrokUrls) return ngrokUrls.backend;

  if (
    isDeliberateBackendUrl(environmentFile.BACKEND_API_URL, environmentFile)
  ) {
    return environmentFile.BACKEND_API_URL;
  }

  return `https://${ipAddress}:8080`;
}

/**
 * Resets tunnel URLs left behind by a previous `--network` run to localhost;
 * keeps anything else the developer set deliberately.
 */
function resolveFrontendUrl(
  environmentFile: Record<string, string>,
  tunnelUrl: string | undefined,
) {
  if (tunnelUrl) return tunnelUrl;

  const current = environmentFile.FRONTEND_URL;
  if (
    current === undefined ||
    current === "" ||
    isCliManagedNgrokUrl(current, "frontend", environmentFile)
  ) {
    return DEFAULT_FRONTEND_URL;
  }
  return current;
}

function replaceEnvValue(key: string, value: string) {
  execSync(`sed -i.bak "s|^${key}=.*|${key}=${value}|" .env`, {
    cwd: getRoot(),
  });
}

/**
 * Rewrites the URL-related entries of the root `.env`.
 *
 * @param ipAddress - Host the local servers bind to (`PUBLIC_URL`).
 * @param environmentFile - Current `.env` contents, used to preserve
 *   deliberate overrides (e.g. a deployed `BACKEND_API_URL`).
 * @param ngrokUrls - When present, `FRONTEND_URL` and `BACKEND_API_URL` point
 *   at the public tunnels instead of localhost.
 */
export function updatePublicUrl(
  ipAddress: string,
  environmentFile: Record<string, string>,
  ngrokUrls?: NgrokUrls,
) {
  replaceEnvValue("PUBLIC_URL", ipAddress);
  replaceEnvValue(
    "BACKEND_API_URL",
    resolveBackendUrl(environmentFile, ipAddress, ngrokUrls),
  );
  replaceEnvValue(
    "FRONTEND_URL",
    resolveFrontendUrl(environmentFile, ngrokUrls?.frontend),
  );

  execSync("rm .env.bak", {
    cwd: getRoot(),
  });
}

export function updatePublicUrlJs(ipAddress: string) {
  // Check if packages/frontend/publicUrl.js exists, if not create it
  const root = getRoot();
  const publicUrlPath = join(root, "packages/frontend/publicUrl.js");
  if (!existsSync(publicUrlPath)) {
    writeFileSync(publicUrlPath, `export const PUBLIC_URL = "";\n`);
    logColorMessage("Created packages/frontend/publicUrl.js", "yellow");
  }

  // Replace the PUBLIC_URL in packages/frontend/publicUrl.js
  execSync(
    `sed -i.bak 's|^export const PUBLIC_URL =.*|export const PUBLIC_URL = "${ipAddress}";|' publicUrl.js && rm publicUrl.js.bak`,
    { cwd: `${getRoot()}/packages/frontend` },
  );
  logColorMessage(`Updated PUBLIC_URL in .env file to ${ipAddress}`, "yellow");
}
