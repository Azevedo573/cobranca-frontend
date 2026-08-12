#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="${APP_DIR:-/var/www/cobranca}"
UNITS=(luminus-regua.service luminus-regua.timer luminus-whatsapp-fila.service luminus-whatsapp-fila.timer)

if [[ "${EUID}" -ne 0 ]]; then
  echo "Execute como root: sudo bash infra/systemd/instalar-jobs-vps.sh" >&2
  exit 1
fi

for requisito in "$APP_DIR/node_modules/.bin/tsx" "$APP_DIR/scripts/executar-regua.mjs" "$APP_DIR/scripts/processar-whatsapp-fila.mjs"; do
  [[ -e "$requisito" ]] || { echo "Arquivo obrigatório não encontrado: $requisito" >&2; exit 1; }
done

for unidade in "${UNITS[@]}"; do
  install -o root -g root -m 0644 "$APP_DIR/infra/systemd/$unidade" "/etc/systemd/system/$unidade"
done

systemctl daemon-reload
systemctl enable --now luminus-regua.timer luminus-whatsapp-fila.timer
systemctl --no-pager list-timers luminus-regua.timer luminus-whatsapp-fila.timer
echo "Timers instalados. Consulte logs com: journalctl -u luminus-regua.service -u luminus-whatsapp-fila.service -n 100 --no-pager"
