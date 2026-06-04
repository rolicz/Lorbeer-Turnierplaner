#!/usr/bin/env bash
# Generate TypeScript types from the backend OpenAPI schema.
# Run from the repo root: bash scripts/gen_types.sh
set -euo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$REPO/frontend/src/api/generated/schema.d.ts"

mkdir -p "$(dirname "$OUT")"

echo "Dumping OpenAPI schema..."
PYTHONPATH="$REPO/backend" "$REPO/backend/.venv/bin/python" \
  "$REPO/scripts/dump_openapi.py" 2>/dev/null > /tmp/_openapi.json

echo "Generating TypeScript types..."
cd "$REPO/frontend"
npx openapi-typescript /tmp/_openapi.json -o "$OUT"

echo "Done: $OUT"
