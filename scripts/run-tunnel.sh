#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
config="$root/cloudflared/config.yml"
computer_config="$root/cloudflared/computer.yml"
tunnel="${TUNNEL_NAME:-webhook-automator}"
computer_tunnel="${COMPUTER_TUNNEL_NAME:-computer-viewer}"
host="${TUNNEL_HOSTNAME:-agent.alhwyn.com}"
zone_host="${TUNNEL_ZONE_HOSTNAME:-${host#*.}}"
viewer_host="${COMPUTER_VIEWER_TUNNEL_HOSTNAME:-viewer.$zone_host}"
desktop_host="${COMPUTER_TUNNEL_HOSTNAME:-desktop.$zone_host}"

if [[ ! -f "$config" || ! -f "$computer_config" ]]; then
  echo "Missing a Cloudflare tunnel config." >&2
  echo "" >&2
  echo "Generate it from your existing Cloudflare tunnel:" >&2
  echo "  bun run tunnel:setup" >&2
  echo "" >&2
  echo "For a one-off dev URL without a named tunnel:" >&2
  echo "  bun run tunnel:quick" >&2
  exit 1
fi

cloudflared tunnel --config "$config" ingress validate
cloudflared tunnel --config "$computer_config" ingress validate
echo "Phone viewer: https://$viewer_host/computer/<task-id>?token=<run-token>"
echo "Desktop stream: https://$desktop_host"

cloudflared tunnel \
  --config "$config" \
  run \
  --dns-resolver-addrs 1.1.1.1:53 \
  "$tunnel" &
webhook_pid=$!

cloudflared tunnel \
  --config "$computer_config" \
  run \
  --dns-resolver-addrs 1.1.1.1:53 \
  "$computer_tunnel" &
computer_pid=$!

shutdown() {
  trap - EXIT
  kill -TERM "$webhook_pid" "$computer_pid" 2>/dev/null || true
  wait "$webhook_pid" "$computer_pid" 2>/dev/null || true
}

trap 'exit 0' INT TERM
trap shutdown EXIT

while kill -0 "$webhook_pid" 2>/dev/null && kill -0 "$computer_pid" 2>/dev/null; do
  sleep 1
done

echo "A Cloudflare tunnel process stopped unexpectedly." >&2
exit 1
