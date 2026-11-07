import { type ChildProcess, execSync, spawn } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir, userInfo } from "node:os";
import { join } from "node:path";
import { logColorMessage } from "./logColorMessage";

/**
 * Public HTTPS URLs for the local stack once ngrok has connected. Each maps to
 * the local HTTPS listener of the same name.
 */
export interface NgrokUrls {
  /** Tunnel in front of the Next.js frontend on `https://localhost:3000`. */
  frontend: string;
  /** Tunnel in front of the NestJS API on `https://localhost:8080`. */
  backend: string;
}

const TUNNEL_NAMES: Array<keyof NgrokUrls> = ["frontend", "backend"];

/** Env var holding an explicit reserved domain for each tunnel. */
export const NGROK_DOMAIN_ENV_VARS: Record<keyof NgrokUrls, string> = {
  backend: "NGROK_BACKEND_DOMAIN",
  frontend: "NGROK_FRONTEND_DOMAIN",
};

/**
 * Wildcard domain reserved once in ngrok (e.g. `dev.example.com`, reserved
 * as `*.dev.example.com`). Every developer gets their own
 * `<dev>-<tunnel>.<suffix>` hostnames under it, so any number of people can
 * run `resync dev --network` at the same time.
 */
export const NGROK_DOMAIN_SUFFIX_ENV_VAR = "NGROK_DOMAIN_SUFFIX";

/** Overrides the OS username used as the per-developer hostname prefix. */
export const NGROK_DEV_NAME_ENV_VAR = "NGROK_DEV_NAME";

/**
 * ngrok-managed base domain used when no `NGROK_DOMAIN_SUFFIX` is configured.
 * Paid accounts can create `*.ngrok.app` hostnames on the fly, and the
 * namespace is shared by every ngrok customer, so hostnames are prefixed with
 * the product name to avoid clashing with other accounts.
 */
const DEFAULT_NGROK_BASE_DOMAIN = "ngrok.app";
const DEFAULT_NGROK_HOSTNAME_PREFIX = "resync-game-framework";

const TUNNEL_PORTS: Record<keyof NgrokUrls, number> = {
  backend: 8080,
  frontend: 3000,
};

const TUNNEL_HOST_LABELS: Record<keyof NgrokUrls, string> = {
  backend: "api",
  frontend: "frontend",
};

function readSetting(
  key: string,
  environmentFile: Record<string, string>,
): string | undefined {
  return process.env[key] || environmentFile[key] || undefined;
}

/** DNS-label-safe developer identifier, e.g. `kadhir` or `jane-doe`. */
export function getNgrokDevName(
  environmentFile: Record<string, string>,
): string {
  const raw =
    readSetting(NGROK_DEV_NAME_ENV_VAR, environmentFile) ?? userInfo().username;
  const label = raw
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return label === "" ? "dev" : label;
}

/**
 * Public hostname for `name`. Precedence: explicit `NGROK_*_DOMAIN`, then
 * `<dev>-<label>.<NGROK_DOMAIN_SUFFIX>`, otherwise
 * `resync-game-framework-<dev>-<label>.ngrok.app`. Shell exports win over `.env`
 * so a one-off `NGROK_FRONTEND_DOMAIN=... resync dev --network` still works.
 *
 * Every tunnel is always given its own hostname: asking ngrok for a random
 * address (`url: https://`) makes it reuse the account's single dev domain,
 * which pools the frontend and API onto one hostname.
 */
export function getReservedNgrokDomain(
  name: keyof NgrokUrls,
  environmentFile: Record<string, string>,
): string {
  const explicit = readSetting(NGROK_DOMAIN_ENV_VARS[name], environmentFile);
  if (explicit !== undefined) return explicit;

  const devName = getNgrokDevName(environmentFile);
  const label = TUNNEL_HOST_LABELS[name];
  const suffix = readSetting(NGROK_DOMAIN_SUFFIX_ENV_VAR, environmentFile);
  if (suffix !== undefined) {
    return `${devName}-${label}.${suffix.replace(/^\*?\.?/, "")}`;
  }

  return `${DEFAULT_NGROK_HOSTNAME_PREFIX}-${devName}-${label}.${DEFAULT_NGROK_BASE_DOMAIN}`;
}

/**
 * Guidance shown when ngrok cannot give each process its own hostname. Kept in
 * one place so the pre-flight check and the runtime check say the same thing.
 */
export const DISTINCT_HOSTNAMES_HELP = [
  "A remote tester's browser loads the frontend from one hostname and calls the API on another, so each process needs its own public hostname.",
  "Custom hostnames are a paid ngrok feature; free accounts only have their single *.ngrok-free.dev dev domain, which ngrok pools every tunnel onto.",
  "Fix: run `ngrok config add-authtoken <token>` with a paid ngrok account token. Hostnames default to resync-game-framework-<you>-{frontend,api}.ngrok.app; set NGROK_DOMAIN_SUFFIX or distinct NGROK_FRONTEND_DOMAIN / NGROK_BACKEND_DOMAIN to change them.",
].join("\n");

/**
 * Builds the tunnel specs for the frontend and API. Each gets its own
 * hostname; two tunnels on one hostname would be pooled and split requests
 * across processes (`Cannot GET /` from Nest).
 *
 * @param environmentFile - Parsed root `.env`, consulted for hostnames.
 * @returns One spec per tunnel, in `TUNNEL_NAMES` order.
 * @throws When two configured hostnames collide.
 */
export function tunnelsToStart(
  environmentFile: Record<string, string>,
): NgrokTunnelSpec[] {
  const tunnels = TUNNEL_NAMES.map((name) => ({
    domain: getReservedNgrokDomain(name, environmentFile),
    name,
    port: TUNNEL_PORTS[name],
  }));

  const domains = tunnels.map((tunnel) => tunnel.domain);
  if (new Set(domains).size !== domains.length) {
    throw new Error(
      `NGROK_*_DOMAIN values must be distinct per tunnel; got ${domains.join(", ")}.\n${DISTINCT_HOSTNAMES_HELP}`,
    );
  }

  return tunnels;
}

export interface NgrokSession {
  urls: NgrokUrls;
  /** The `ngrok start` agent process. Killing it tears every tunnel down. */
  child: ChildProcess;
}

export interface NgrokTunnelSpec {
  name: keyof NgrokUrls;
  port: number;
  /** Public hostname (e.g. `resync-game-framework-kadhir-frontend.ngrok.app`). */
  domain: string;
}

const NGROK_START_TIMEOUT_MS = 30_000;

function ensureNgrokInstalled() {
  try {
    execSync("which ngrok", { stdio: "ignore" });
  } catch {
    logColorMessage(
      "ngrok is not installed. Install it (https://ngrok.com/download), then run `ngrok config add-authtoken <token>`.",
      "red",
    );
    process.exit(1);
  }
}

/**
 * Resolves the user's default ngrok config (holds the authtoken) so we can
 * layer our generated tunnel definitions on top of it via a second `--config`.
 */
function getDefaultNgrokConfigPath(): string {
  try {
    const output = execSync("ngrok config check", {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    const match = output.match(/Valid configuration file at (.+)/);
    if (match?.[1]) return match[1].trim();
  } catch {
    // Fall through to the error below.
  }

  logColorMessage(
    "No ngrok config found. Run `ngrok config add-authtoken <token>` first.",
    "red",
  );
  process.exit(1);
}

/**
 * ngrok refuses to merge config files of different versions, so the generated
 * tunnel file has to match whatever `ngrok config add-authtoken` wrote.
 */
function getNgrokConfigVersion(defaultConfigPath: string): 2 | 3 {
  const match = readFileSync(defaultConfigPath, "utf-8").match(
    /^version:\s*["']?(\d)/m,
  );
  return match?.[1] === "2" ? 2 : 3;
}

function renderV2TunnelConfig(tunnels: NgrokTunnelSpec[]): string {
  const blocks = tunnels.map(({ name, port, domain }) =>
    [
      `  ${name}:`,
      "    proto: http",
      `    addr: https://localhost:${port}`,
      `    domain: ${domain}`,
    ].join("\n"),
  );
  return `version: "2"\ntunnels:\n${blocks.join("\n")}\n`;
}

/**
 * Renders an ngrok v3 endpoint file with one pinned hostname per endpoint.
 *
 * @param tunnels - Endpoints to publish.
 * @returns YAML contents for the generated ngrok config.
 */
export function renderV3EndpointConfig(tunnels: NgrokTunnelSpec[]): string {
  const blocks = tunnels.map(({ name, port, domain }) =>
    [
      `  - name: ${name}`,
      `    url: https://${domain}`,
      "    upstream:",
      `      url: https://localhost:${port}`,
    ].join("\n"),
  );
  return `version: 3\nagent: {}\nendpoints:\n${blocks.join("\n")}\n`;
}

function writeTunnelConfig(
  tunnels: NgrokTunnelSpec[],
  defaultConfigPath: string,
): string {
  const content =
    getNgrokConfigVersion(defaultConfigPath) === 2
      ? renderV2TunnelConfig(tunnels)
      : renderV3EndpointConfig(tunnels);

  const configDir = mkdtempSync(join(tmpdir(), "resync-ngrok-"));
  const configPath = join(configDir, "ngrok.yml");
  writeFileSync(configPath, content);
  return configPath;
}

/**
 * Kills any ngrok agent left over from a previous `resync dev --network` session.
 * ngrok accounts are limited to a small number of concurrent agent sessions,
 * so an orphaned agent would make the next start fail.
 */
export function killExistingNgrokSessions(): void {
  if (process.platform === "win32") return;

  try {
    const output = execSync("pgrep -f '[n]grok start .*resync-ngrok-'", {
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .trim();
    if (!output) return;

    for (const rawPid of output.split("\n")) {
      const pid = Number.parseInt(rawPid.trim(), 10);
      if (Number.isNaN(pid) || pid === process.pid) continue;
      logColorMessage(`Killing leftover ngrok agent (PID ${pid})...`, "yellow");
      try {
        process.kill(pid, "SIGKILL");
      } catch {
        // Already exited between pgrep and kill.
      }
    }
  } catch {
    // pgrep exits non-zero when nothing matches — nothing to kill.
  }
}

/**
 * Starts a single ngrok agent exposing the frontend and API, and resolves
 * once both public URLs are known. The agent logs JSON to stdout; we pick the
 * URLs out of its `started tunnel` events so we don't depend on the local web
 * UI port (4040) being free.
 *
 * Only the generated tunnels are started by name, so unrelated tunnels in the
 * user's own ngrok config are left untouched. Each tunnel gets a stable
 * per-developer hostname (see {@link getReservedNgrokDomain}).
 *
 * Rejects when ngrok reports the same hostname for more than one tunnel —
 * that happens on free accounts, which pool everything onto one dev domain,
 * and would route a tester's `GET /` to the API instead of Next.js.
 *
 * @param environmentFile - Parsed root `.env`, consulted for reserved domains
 *   when they aren't exported in the shell.
 */
export async function startNgrok(
  environmentFile: Record<string, string>,
): Promise<NgrokSession> {
  ensureNgrokInstalled();
  killExistingNgrokSessions();

  const defaultConfigPath = getDefaultNgrokConfigPath();
  const tunnels = tunnelsToStart(environmentFile);
  const tunnelConfigPath = writeTunnelConfig(tunnels, defaultConfigPath);

  logColorMessage("Starting ngrok tunnels...", "yellow");

  const child = spawn(
    "ngrok",
    [
      "start",
      ...TUNNEL_NAMES,
      "--config",
      defaultConfigPath,
      "--config",
      tunnelConfigPath,
      "--log",
      "stdout",
      "--log-format",
      "json",
    ],
    { stdio: ["ignore", "pipe", "pipe"] },
  );

  const urls: Partial<NgrokUrls> = {};

  return new Promise<NgrokSession>((resolve, reject) => {
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (error) {
        child.kill("SIGKILL");
        reject(error);
        return;
      }
      resolve({ child, urls: urls as NgrokUrls });
    };

    const timeout = setTimeout(() => {
      finish(
        new Error(
          `ngrok did not report tunnel URLs within ${NGROK_START_TIMEOUT_MS}ms`,
        ),
      );
    }, NGROK_START_TIMEOUT_MS);

    let buffered = "";
    child.stdout?.on("data", (chunk: Buffer) => {
      buffered += chunk.toString();
      const lines = buffered.split("\n");
      buffered = lines.pop() ?? "";

      for (const line of lines) {
        if (line.trim() === "") continue;
        let event: Record<string, unknown>;
        try {
          event = JSON.parse(line);
        } catch {
          continue;
        }

        if (event.lvl === "eror" || event.lvl === "crit") {
          finish(new Error(`ngrok: ${event.err ?? event.msg}`));
          return;
        }

        if (
          event.msg === "started tunnel" &&
          typeof event.name === "string" &&
          typeof event.url === "string" &&
          TUNNEL_NAMES.includes(event.name as keyof NgrokUrls)
        ) {
          urls[event.name as keyof NgrokUrls] = event.url;
        }

        if (!TUNNEL_NAMES.every((name) => urls[name] !== undefined)) continue;

        const sharedHostname = findSharedHostname(urls as NgrokUrls);
        if (sharedHostname !== undefined) {
          finish(
            new Error(
              `ngrok put more than one tunnel on ${sharedHostname}, so a visitor's requests would be split between the frontend and API.\n${DISTINCT_HOSTNAMES_HELP}`,
            ),
          );
          return;
        }

        finish();
        return;
      }
    });

    let stderr = "";
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    child.on("exit", (code) => {
      finish(
        new Error(`ngrok exited early (code ${code}). ${stderr.trim()}`.trim()),
      );
    });
    child.on("error", (error) => finish(error));
  });
}

/**
 * Asks the ngrok agent to shut down, which tears down every tunnel it owns.
 * No-op when there is no session or the agent has already exited.
 */
export function stopNgrok(session: NgrokSession | undefined): void {
  if (!session) return;
  const { child } = session;
  if (child.exitCode !== null || child.signalCode !== null) return;
  try {
    child.kill("SIGTERM");
  } catch {
    // Already gone.
  }
}

/**
 * Returns a public URL that ngrok assigned to more than one tunnel, or
 * `undefined` when every tunnel has its own hostname.
 *
 * @param urls - Public URLs reported by ngrok, one per tunnel.
 */
export function findSharedHostname(urls: NgrokUrls): string | undefined {
  const seen = new Set<string>();
  for (const name of TUNNEL_NAMES) {
    const url = urls[name];
    if (seen.has(url)) return url;
    seen.add(url);
  }
  return undefined;
}

/**
 * Prints the shareable public URLs in a hard-to-miss block.
 */
export function printNgrokUrls(urls: NgrokUrls): void {
  const border = "═".repeat(72);
  logColorMessage(
    [
      "",
      border,
      "  Resync Game Framework is publicly reachable via ngrok — share this link:",
      "",
      `      ${urls.frontend}`,
      "",
      `  API tunnel: ${urls.backend}`,
      "  Tunnels are torn down when this dev process exits.",
      border,
      "",
    ].join("\n"),
    "green",
  );
}
