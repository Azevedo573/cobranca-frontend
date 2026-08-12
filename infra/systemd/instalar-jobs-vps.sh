#!/usr/bin/env bash
set -Eeuo pipefail

PROJECT_DIR="${PROJECT_DIR:-/var/www/cobranca}"
UNITS=(luminus-regua.service luminus-regua.timer luminus-whatsapp-fila.service luminus-whatsapp-fila.timer)

if [[ $EUID -ne 0 ]]; then
  echo "Execute como root (ou com sudo)." >&2
  exit 1
fi

for requisito in "$PROJECT_DIR/node_modules/.bin/tsx" "$PROJECT_DIR/scripts/executar-regua-vps.ts" "$PROJECT_DIR/scripts/processar-whatsapp-fila-vps.ts"; do
  [[ -e "$requisito" ]] || { echo "Arquivo obrigatório não encontrado: $requisito" >&2; exit 1; }
done

for unidade in "${UNITS[@]}"; do
  install -o root -g root -m 0644 "$PROJECT_DIR/infra/systemd/$unidade" "/etc/systemd/system/$unidade"
done

systemctl daemon-reload
systemctl enable luminus-regua.timer luminus-whatsapp-fila.timer
systemctl start luminus-regua.timer luminus-whatsapp-fila.timer
systemctl --no-pager list-timers luminus-regua.timer luminus-whatsapp-fila.timer
echo "Timers instalados. Consulte logs com: journalctl -u luminus-regua.service -u luminus-whatsapp-fila.service -n 100 --no-pager"
