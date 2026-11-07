#!/usr/bin/env bash
set -euo pipefail

for command in bun docker mkcert; do
  if command -v "$command" >/dev/null 2>&1; then
    continue
  fi

  echo "ERROR: Required command '$command' is not installed." >&2
  exit 1
done

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repository_root"

echo "Installing dependencies..."
bun install --frozen-lockfile

echo "Building the local CLI..."
bun run --cwd resync-cli build

echo "Preparing local environment variables..."
bun run resync ensure-env

echo "Preparing local HTTPS certificates..."
mkdir -p .certs
if [[ ! -f .certs/localhost.pem || ! -f .certs/localhost-key.pem ]]; then
  mkcert -install
  mkcert -cert-file .certs/localhost.pem \
    -key-file .certs/localhost-key.pem \
    localhost 127.0.0.1 ::1
fi

echo "Building the monorepo..."
bun run build

echo "Setup complete. Run 'bun run dev' to start the project."
