#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="/var/www/cobranca"
UNITS=(
  luminus-regua.service
  luminus-regua.timer
  luminus-whatsapp-fila.service
  luminus-whatsapp-fila.timer
)

if [[ "${EUID}" -ne 0 ]]; then
  echo "Execute como root: sudo bash infra/systemd/instalar-jobs-vps.sh" >&2
  exit 1
fi

for unit in "${UNITS[@]}"; do
  install -m 0644 "${APP_DIR}/infra/systemd/${unit}" "/etc/systemd/system/${unit}"
done

systemctl daemon-reload
systemctl enable --now luminus-regua.timer luminus-whatsapp-fila.timer
systemctl list-timers 'luminus-*'
