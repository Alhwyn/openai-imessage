#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
host="${TUNNEL_HOSTNAME:-agent.alhwyn.com}"
port="${AGENT_PORT:-4001}"
tunnel="${TUNNEL_NAME:-webhook-automator}"

if ! command -v cloudflared >/dev/null 2>&1; then
  echo "cloudflared is not installed. Install it first: https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation/" >&2
  exit 1
fi

id="$(cloudflared tunnel list | awk -v name="$tunnel" '$2 == name { print $1; exit }')"

if [[ -z "$id" ]]; then
  echo "No Cloudflare tunnel named \"$tunnel\" found." >&2
  echo "" >&2
  echo "Create one, then run this script again:" >&2
  echo "  cloudflared tunnel login" >&2
  echo "  cloudflared tunnel create $tunnel" >&2
  echo "  bun run tunnel:setup" >&2
  exit 1
fi

credentials="${HOME}/.cloudflared/${id}.json"

if [[ ! -f "$credentials" ]]; then
  echo "Missing credentials file: $credentials" >&2
  echo "Re-authenticate or recreate the tunnel, then run: bun run tunnel:setup" >&2
  exit 1
fi

cat > "$root/cloudflared/config.yml" <<EOF
tunnel: $tunnel
credentials-file: $credentials

ingress:
  - hostname: $host
    service: http://127.0.0.1:$port
  - service: http_status:404
EOF

echo "Wrote cloudflared/config.yml for tunnel \"$tunnel\" ($host -> 127.0.0.1:$port)"
