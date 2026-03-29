#!/usr/bin/env bash
# Release gate: format, lint, typecheck, tests, examples, pack sanity check, npm publish.
# Requires Docker for integration tests and examples (PostgreSQL on localhost:5433).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

DB_STARTED=0
PUBLISH_SUCCEEDED=0

cleanup() {
  if [ "$DB_STARTED" -eq 1 ]; then
    npm run db:down || true
  fi
}

finish() {
  local code=$?
  trap - EXIT
  cleanup
  if [ "$code" -eq 0 ] && [ "$PUBLISH_SUCCEEDED" -eq 1 ]; then
    rm -f "$ROOT"/*.tgz
    echo "Removed pack tarballs under repository root."
  fi
  exit "$code"
}
trap finish EXIT

die() {
  echo "error: $*" >&2
  exit 1
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "missing required command: $1"
}

echo "==> Checking toolchain"
require_cmd node
require_cmd npm

NPM_USER="$(npm whoami 2>/dev/null)" || die "not logged in to npm; run npm login"
echo "    npm user: $NPM_USER"

REGISTRY="$(npm config get registry)"
echo "    registry: $REGISTRY"

require_cmd docker
docker compose version >/dev/null 2>&1 || die "docker compose is required (tests / examples)"
docker info >/dev/null 2>&1 || die "docker daemon does not appear to be running"

if [ ! -d node_modules ]; then
  die "node_modules missing; run npm ci or npm install"
fi

echo "==> Removing dist/"
rm -rf dist

echo "==> Prettier (check)"
npm run prettier:check

echo "==> ESLint"
npm run lint

echo "==> Typecheck (library)"
npm run typecheck

echo "==> Starting test database"
npm run db:up
DB_STARTED=1

echo "==> Tests"
npm test

echo "==> Typecheck examples"
npm run typecheck:examples

echo "==> Example (queries)"
npm run example

echo "==> Example (schema generation)"
npm run example:schema

echo "==> Build"
npm run build

echo "==> Verify pack (npm pack)"
rm -f "$ROOT"/*.tgz
npm pack
shopt -s nullglob
TGZ=( "$ROOT"/*.tgz )
shopt -u nullglob
[ "${#TGZ[@]}" -eq 1 ] || die "expected exactly one .tgz in repo root after npm pack, found ${#TGZ[@]}"

echo "==> Publish (pass-through args: $*)"
npm publish "$@"
PUBLISH_SUCCEEDED=1
echo "Publish finished successfully."
