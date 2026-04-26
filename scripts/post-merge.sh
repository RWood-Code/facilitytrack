#!/bin/bash
set -e
pnpm install --frozen-lockfile
# SQLite databases auto-migrate at runtime via lib/db getDb(); no `drizzle-kit push` needed.
mkdir -p artifacts/api-server/.data artifacts/license-server/.data
