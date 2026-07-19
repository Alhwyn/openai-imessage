#!/usr/bin/env bash
# Runs after the Kasm desktop session is up. Lock the coordinate space used by
# the computer-use model (compose sets COMPUTER_DISPLAY_* / VNC_RESOLUTION).
set -euo pipefail

echo "Executing kasm_post_run_user.sh"

width="${COMPUTER_DISPLAY_WIDTH:-1280}"
height="${COMPUTER_DISPLAY_HEIGHT:-800}"
display="${DISPLAY:-:1}"

for _ in $(seq 1 30); do
  if xdpyinfo -display "$display" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

DISPLAY="$display" xrandr --output VNC-0 --mode "${width}x${height}" 2>/dev/null \
  || DISPLAY="$display" xrandr -s "${width}x${height}" 2>/dev/null \
  || true

actual="$(timeout 3 xdpyinfo -display "$display" 2>/dev/null | awk '/dimensions:/ {print $2; found=1} END { if (!found) exit 0 }' || true)"
echo "Desktop locked to ${width}x${height} (actual=${actual})"
