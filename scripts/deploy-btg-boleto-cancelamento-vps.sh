#!/usr/bin/env bash
set +x
set -euo pipefail
umask 077

root=/var/www/cobranca
versao=ca85568ceeaa68d1a558f74695a1e819ebe0602d
backup=''
stage=''
anterior=''
trocado=0

finalizar() {
  rc=$?
  trap - EXIT
  [ -z "$backup" ] || rm -f "$backup/mysql-client.cnf"
  [ -z "$stage" ] || rm -f "$stage/.env"
  if [ "$rc" -ne 0 ]; then
    printf '\nFALHA: pare e envie o erro. Não repita o bloco inteiro.\n'
    [ -z "$backup" ] || printf 'Backup preservado: %s\n' "$backup"
    [ -z "$anterior" ] || printf 'Build anterior: %s/dist\n' "$anterior"
    if [ "$trocado" = 1 ]; then
      echo 'O build foi trocado. É necessário revisar a ativação/serviço antes de continuar.'
    else
      echo 'O build ativo não foi substituído. A DDL pode ter sido aplicada; não restaure o banco automaticamente.'
    fi
  fi
  exit "$rc"
}
trap finalizar EXIT

cd "$root"
test "$(id -u)" = 0
test "$(git branch --show-current)" = main
case "$(git rev-parse HEAD)" in
  807de655d0a67f7246b8609fd45b6a62f6f9fa65|ca85568ceeaa68d1a558f74695a1e819ebe0602d) ;;
  *) echo 'Versão de origem diferente da informada. Pare para revisão antes do backup/deploy.'; exit 1;;
esac
git diff --quiet
git diff --cached --quiet
for cmd in git node pnpm mysqldump sudo curl sha256sum tar flock; do
  command -v "$cmd" >/dev/null || { echo "Comando ausente: $cmd"; exit 1; }
done
exec 9>/var/lock/cobranca-deploy.lock
flock -n 9 || { echo 'Outro deploy está em execução. Pare aqui.'; exit 1; }
test -s .env
test -d node_modules
test ! -L dist
test -s dist/index.js
test -s dist/public/index.html
grupo="$(id -gn cobranca)"

printf '\n=== VERIFICAÇÃO INICIAL ===\n'
git log -1 --format='%h'
sudo -u cobranca pm2 jlist | node -e 'let s="";process.stdin.on("data",x=>s+=x);process.stdin.on("end",()=>{const p=JSON.parse(s).filter(x=>x.name==="cobranca");if(p.length!==1||p[0].pm2_env.status!=="online")process.exit(1);console.log("PM2: cobranca online");});'
test "$(curl -sS --max-time 15 -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/login-admin)" = 200

mkdir -p /var/backups/cobranca
backup="$(mktemp -d /var/backups/cobranca/btg-boleto-cancelamento-$(date +%F-%H%M%S)-XXXXXX)"
chmod 700 "$backup"
export BACKUP_BTG_DIR="$backup"
printf '\n=== BACKUP DA APLICAÇÃO ===\n'
git rev-parse HEAD > "$backup/commit-anterior.txt"
git status --short > "$backup/git-status-anterior.txt"
cp .env "$backup/env.original"
tar --exclude='./node_modules' --exclude='./.git' --exclude='./.pm2' -czf "$backup/aplicacao.tar.gz" .
tar -tzf "$backup/aplicacao.tar.gz" >/dev/null

printf '\n=== BACKUP DO BANCO ===\n'
banco="$(node <<'NODE'
const fs=require('node:fs'),path=require('node:path');
try {
  const e=require('dotenv').parse(fs.readFileSync('.env','utf8'));
  const u=new URL(e.DATABASE_URL||'');
  const nome=decodeURIComponent(u.pathname.slice(1));
  if(u.protocol!=='mysql:'||!/^[A-Za-z0-9_]+$/.test(nome))throw Error();
  const d={host:u.hostname.replace(/^\[|\]$/g,''),port:u.port||'3306',user:decodeURIComponent(u.username),password:decodeURIComponent(u.password)};
  if(!d.host||!d.user||Object.values(d).some(v=>/[\x00\r\n]/.test(v)))throw Error();
  if(!e.BTG_TOKEN_ENCRYPTION_KEY||Buffer.from(e.BTG_TOKEN_ENCRYPTION_KEY.trim(),'base64').length!==32)throw Error();
  const cnf='[client]\n'+Object.entries(d).map(([k,v])=>`${k}=${JSON.stringify(v)}`).join('\n')+'\n';
  fs.writeFileSync(path.join(process.env.BACKUP_BTG_DIR,'mysql-client.cnf'),cnf,{mode:0o600,flag:'wx'});
  process.stdout.write(nome);
} catch {console.error('Falha de configuração/chave. Nenhum segredo exibido. Pare aqui.');process.exit(1);}
NODE
)"
if ! mysqldump --defaults-extra-file="$backup/mysql-client.cnf" --single-transaction --quick --skip-lock-tables --no-tablespaces --set-gtid-purged=OFF --routines --events --triggers --databases "$banco" > "$backup/banco.sql" 2> "$backup/mysqldump-erro.log"; then
  echo "Falha no backup. Detalhes locais: $backup/mysqldump-erro.log"; exit 1
fi
test -s "$backup/banco.sql"
grep -q 'Dump completed on' "$backup/banco.sql"
rm -f "$backup/mysql-client.cnf"
chmod 600 "$backup"/*
sha256sum "$backup/aplicacao.tar.gz" "$backup/banco.sql" "$backup/env.original" > "$backup/SHA256SUMS"
printf 'Backup concluído: %s\n' "$backup"

printf '\n=== ATUALIZANDO PELO GITHUB ===\n'
case "$(git remote get-url origin)" in
  https://github.com/Azevedo573/cobranca-frontend|https://github.com/Azevedo573/cobranca-frontend.git|git@github.com:Azevedo573/cobranca-frontend.git) ;;
  *) echo 'Remoto diferente do repositório aprovado. Pare aqui.'; exit 1;;
esac
git fetch origin main
git cat-file -e "$versao^{commit}"
git merge-base --is-ancestor "$versao" origin/main
git merge-base --is-ancestor HEAD "$versao"
test -z "$(git diff --name-only HEAD "$versao" -- package.json pnpm-lock.yaml)" || { echo 'Dependências diferentes. Pare para revisão.'; exit 1; }
git merge --ff-only "$versao"
test "$(git rev-parse HEAD)" = "$versao"
git diff --quiet
git diff --cached --quiet
cmp -s .env "$backup/env.original"

printf '\n=== MIGRAÇÃO SELETIVA 0103 ===\n'
sha256sum --status -c "$backup/SHA256SUMS"
env -u DATABASE_URL node scripts/provisionar-btg-boletos-cancelamentos.cjs --check
env -u DATABASE_URL node scripts/provisionar-btg-boletos-cancelamentos.cjs --apply 'CONFIRMAR ESTRUTURA BOLETOS E CANCELAMENTO BTG'
env -u DATABASE_URL node scripts/provisionar-btg-boletos-cancelamentos.cjs --check

printf '\n=== COMPILAÇÃO ISOLADA ===\n'
stage="$(mktemp -d "$root/.build-boleto-cancelamento-XXXXXX")"
git archive "$versao" | tar -x -C "$stage"
cp .env "$stage/.env"
ln -s "$root/node_modules" "$stage/node_modules"
(cd "$stage" && pnpm check && pnpm build)
rm -f "$stage/.env"
test -s "$stage/dist/index.js"
test -s "$stage/dist/public/index.html"
chgrp "$grupo" "$stage"
chmod 750 "$stage"
chgrp -R "$grupo" "$stage/dist"
find "$stage/dist" -type d -exec chmod 750 {} +
find "$stage/dist" -type f -exec chmod 640 {} +
sudo -u cobranca head -c 1 "$stage/dist/index.js" >/dev/null
sudo -u cobranca head -c 1 "$stage/dist/public/index.html" >/dev/null
sha256sum "$stage/dist/index.js" "$stage/dist/public/index.html" > "$backup/build-candidate-SHA256SUMS"
printf '%s\n' "$stage" > "$backup/build-candidate-dir.txt"

printf '\n=== ATIVAÇÃO DO BUILD ===\n'
sha256sum --status -c "$backup/SHA256SUMS"
sha256sum --status -c "$backup/build-candidate-SHA256SUMS"
cmp -s .env "$backup/env.original"
test "$(git rev-parse HEAD)" = "$versao"
git diff --quiet
git diff --cached --quiet
test ! -L dist && test ! -L "$stage" && test ! -L "$stage/dist"
anterior="$(mktemp -d "$root/.dist-anterior-boleto-cancelamento-XXXXXX")"
printf '%s/dist\n' "$anterior" > "$backup/build-anterior-dir.txt"
mv dist "$anterior/dist"
if ! mv "$stage/dist" dist; then
  mv "$anterior/dist" dist
  echo 'Troca falhou. Build anterior recolocado, sem reinício.'; exit 1
fi
trocado=1
sudo -u cobranca pm2 restart cobranca --update-env

printf '\n=== VERIFICAÇÃO DO SERVIÇO ===\n'
local_ok=0
for tentativa in $(seq 1 30); do
  codigo="$(curl -s --max-time 3 -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/login-admin || true)"
  if [ "$codigo" = 200 ]; then local_ok=1; break; fi
  sleep 2
done
[ "$local_ok" = 1 ] || { echo 'Aplicação não confirmou HTTP200 local. Pare e informe o erro.'; exit 1; }
sleep 5
sudo -u cobranca pm2 jlist | node -e 'let s="";process.stdin.on("data",x=>s+=x);process.stdin.on("end",()=>{const p=JSON.parse(s).filter(x=>x.name==="cobranca");if(p.length!==1||p[0].pm2_env.status!=="online")process.exit(1);console.log("PM2: cobranca online");});'
codigo="$(curl -sS --max-time 20 -o /dev/null -w '%{http_code}' https://luminus.gomesesilvaadv.com.br/login-admin)"
[ "$codigo" = 200 ] || { echo "HTTPS retornou $codigo. Pare para revisão."; exit 1; }
env -u DATABASE_URL node scripts/provisionar-btg-boletos-cancelamentos.cjs --check
cmp -s .env "$backup/env.original"
sudo -u cobranca pm2 status
printf '\n=== ATUALIZAÇÃO CONCLUÍDA ===\n'
printf 'Versão ativa: %s\nBackup: %s\nBuild anterior: %s/dist\n' "$versao" "$backup" "$anterior"
echo 'Migração0103 conferida; HTTP200 local/HTTPS e PM2 online.'
echo 'Credenciais preservadas. Nenhuma cobrança emitida, cancelada ou reenviada por este roteiro.'
