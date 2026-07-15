#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
config="$root/cloudflared/config.yml"
tunnel="${TUNNEL_NAME:-webhook-automator}"

if [[ ! -f "$config" ]]; then
  echo "Missing $config" >&2
  echo "" >&2
  echo "Generate it from your existing Cloudflare tunnel:" >&2
  echo "  bun run tunnel:setup" >&2
  echo "" >&2
  echo "For a one-off dev URL without a named tunnel:" >&2
  echo "  bun run tunnel:quick" >&2
  exit 1
fi

exec cloudflared tunnel \
  --config "$config" \
  run \
  --dns-resolver-addrs 1.1.1.1:53 \
  "$tunnel"
