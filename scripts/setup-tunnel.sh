#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
host="${TUNNEL_HOSTNAME:-agent.alhwyn.com}"
zone_host="${TUNNEL_ZONE_HOSTNAME:-${host#*.}}"
viewer_host="${COMPUTER_VIEWER_TUNNEL_HOSTNAME:-viewer.$zone_host}"
desktop_host="${COMPUTER_TUNNEL_HOSTNAME:-desktop.$zone_host}"
port="${AGENT_PORT:-4001}"
viewer_port="${COMPUTER_VIEWER_PORT:-6902}"
desktop_port="${COMPUTER_LIVE_VIEW_PORT:-6901}"
tunnel="${TUNNEL_NAME:-webhook-automator}"
computer_tunnel="${COMPUTER_TUNNEL_NAME:-computer-viewer}"

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

computer_id="$(cloudflared tunnel list | awk -v name="$computer_tunnel" '$2 == name { print $1; exit }')"
if [[ -z "$computer_id" ]]; then
  cloudflared tunnel create "$computer_tunnel"
  computer_id="$(cloudflared tunnel list | awk -v name="$computer_tunnel" '$2 == name { print $1; exit }')"
fi
if [[ -z "$computer_id" ]]; then
  echo "Could not create or find computer tunnel \"$computer_tunnel\"." >&2
  exit 1
fi

computer_credentials="${HOME}/.cloudflared/${computer_id}.json"
if [[ ! -f "$computer_credentials" ]]; then
  echo "Missing credentials file: $computer_credentials" >&2
  exit 1
fi

cat > "$root/cloudflared/computer.yml" <<EOF
tunnel: $computer_tunnel
credentials-file: $computer_credentials

ingress:
  - hostname: $viewer_host
    service: http://127.0.0.1:$viewer_port
  - hostname: $desktop_host
    service: https://127.0.0.1:$desktop_port
    originRequest:
      noTLSVerify: true
  - service: http_status:404
EOF

cloudflared tunnel route dns --overwrite-dns "$tunnel" "$host"
cloudflared tunnel route dns --overwrite-dns "$computer_tunnel" "$viewer_host"
cloudflared tunnel route dns --overwrite-dns "$computer_tunnel" "$desktop_host"
cloudflared tunnel --config "$root/cloudflared/config.yml" ingress validate
cloudflared tunnel --config "$root/cloudflared/computer.yml" ingress validate

echo "Wrote Cloudflare tunnel configs"
echo "  Webhook: https://$host -> 127.0.0.1:$port"
echo "  Viewer:  https://$viewer_host -> 127.0.0.1:$viewer_port"
echo "  Desktop: https://$desktop_host -> 127.0.0.1:$desktop_port"
