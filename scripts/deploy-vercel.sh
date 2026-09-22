#!/usr/bin/env bash
# Vercel-only deploy of the static frontend. Render is unaffected: it builds
# from render.yaml and never runs this script or reads vercel.json.
#
# Why a staging dir: deploying the repo root makes the Vercel CLI detect the
# Express backend (via render.yaml) and refuse a static deploy. Why the two
# overrides: on Vercel the browser talks to the API through vercel.json's
# same-origin proxy, so the API base must be the page's own origin, and
# socket.io must start on HTTP polling because Vercel rewrites can't proxy
# WebSocket upgrades.
#
# Usage: scripts/deploy-vercel.sh           -> preview deployment
#        scripts/deploy-vercel.sh --prod    -> production deployment
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
STAGE="$(mktemp -d)"
trap 'cd / && rm -rf "$STAGE"' EXIT

cp "$REPO_ROOT"/{index.html,app.js,api.js,mockData.js,translations.js,worksetu_logo.png,vercel.json} "$STAGE"/
mkdir -p "$STAGE/.vercel"
cp "$REPO_ROOT/scripts/vercel-project.json" "$STAGE/.vercel/project.json"

sed -i 's|window.WORKSETU_API_BASE = window.WORKSETU_API_BASE \|\| "http://localhost:4000";|window.WORKSETU_API_BASE = window.location.origin;|' "$STAGE/index.html"
sed -i 's|transports: \["websocket", "polling"\]|transports: ["polling", "websocket"]|' "$STAGE/api.js"

grep -q 'WORKSETU_API_BASE = window.location.origin' "$STAGE/index.html" || { echo "API base override failed"; exit 1; }
grep -q 'transports: \["polling", "websocket"\]' "$STAGE/api.js" || { echo "socket transport override failed"; exit 1; }

cd "$STAGE"
vercel deploy --yes "$@"
