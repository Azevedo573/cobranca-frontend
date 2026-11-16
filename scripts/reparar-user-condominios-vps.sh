#!/usr/bin/env bash
set +x
set -euo pipefail
umask 077

[ "$(id -u)" = 0 ] || { echo 'Execute como root na VPS.'; exit 1; }
[ "$#" = 1 ] || { echo 'Informe o helper recuperado por commit/hash.'; exit 1; }
helper="$1"
test -f "$helper" && test ! -L "$helper" || { echo 'Helper ausente ou symlink. Pare.'; exit 1; }
for cmd in git node mysqldump flock; do
  command -v "$cmd" >/dev/null || { echo "Comando ausente: $cmd"; exit 1; }
done
cd /var/www/cobranca
[ "$(pwd -P)" = /var/www/cobranca ] || { echo 'Diretorio diferente do aprovado.'; exit 1; }
[ "$(git rev-parse HEAD)" = 77893949b1ced99e97a75dc69a9a912af2c3513f ] || { echo 'Versao diferente da ultima VPS confirmada. Pare para revisao.'; exit 1; }
[ "$(git branch --show-current)" = main ]
git diff --quiet
git diff --cached --quiet
test -f .env && test ! -L .env
test -d node_modules
exec 9>/var/lock/cobranca-deploy.lock
flock -n 9 || { echo 'Outro deploy/reparo esta em execucao. Pare aqui.'; exit 1; }
[ "$(git rev-parse HEAD)" = 77893949b1ced99e97a75dc69a9a912af2c3513f ] || { echo 'Versao mudou durante a preparacao. Pare.'; exit 1; }
git diff --quiet
git diff --cached --quiet
test -f .env && test ! -L .env
node --check "$helper"
node "$helper" --apply 'CONFIRMAR SOMENTE ESTRUTURA USER CONDOMINIOS'
