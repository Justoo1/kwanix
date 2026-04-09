#!/usr/bin/env bash
# Generates TypeScript types from the FastAPI OpenAPI schema.
# Requires the API server to be running at localhost:8000.
#
# Usage: bash infrastructure/scripts/generate_types.sh
set -e

OUTPUT="apps/web/types/api.generated.ts"

echo "Fetching OpenAPI schema from http://localhost:8000/openapi.json ..."
npx openapi-typescript http://localhost:8000/openapi.json -o "$OUTPUT"
echo "✅ Types generated at $OUTPUT"
echo "   Commit this file to keep the frontend in sync with the backend."
