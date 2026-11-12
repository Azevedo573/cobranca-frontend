#!/usr/bin/env bash
set +x
set -euo pipefail
umask 077

root=/var/www/cobranca
base=7a37548b2a392a6b8d6590966da2026eed6ccc3a
versao=77893949b1ced99e97a75dc69a9a912af2c3513f
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
    printf '\nFALHA: pare e envie o erro. Não repita o roteiro inteiro.\n'
    [ -z "$backup" ] || printf 'Backup preservado: %s\n' "$backup"
    [ -z "$anterior" ] || printf 'Build anterior: %s/dist\n' "$anterior"
    if [ "$trocado" = 1 ]; then
      echo 'O dist foi trocado. Revise a ativação/serviço antes de continuar.'
    else
      echo 'O dist ativo não foi substituído. O código Git pode ter sido atualizado.'
    fi
    echo 'Nenhuma migração ou reentrega de evento foi executada pelo roteiro. Não restaure o banco automaticamente.'
  fi
  exit "$rc"
}
trap finalizar EXIT

[ "$(id -u)" = 0 ] || { echo 'Execute como root na VPS.'; exit 1; }
for cmd in git node pnpm mysqldump sudo curl sha256sum tar flock mktemp env; do
  command -v "$cmd" >/dev/null || { echo "Comando ausente: $cmd"; exit 1; }
done
cd "$root"
[ "$(pwd -P)" = "$root" ] || { echo 'Diretório diferente do aprovado.'; exit 1; }
test "$(git branch --show-current)" = main
git diff --quiet
git diff --cached --quiet
exec 9>/var/lock/cobranca-deploy.lock
flock -n 9 || { echo 'Outro deploy está em execução. Pare aqui.'; exit 1; }
test -s .env
test ! -L .env
test -d node_modules
test ! -L dist
test -s dist/index.js
test -s dist/public/index.html
grupo="$(id -gn cobranca)"
origem="$(git rev-parse HEAD)"
case "$(git remote get-url origin)" in
  https://github.com/Azevedo573/cobranca-frontend|https://github.com/Azevedo573/cobranca-frontend.git|git@github.com:Azevedo573/cobranca-frontend.git) ;;
  *) echo 'Remoto diferente do repositório aprovado. Pare aqui.'; exit 1;;
esac

conferir_env() {
  test -f .env && test ! -L .env || {
    echo '.env deixou de ser arquivo regular sem symlink. Pare para revisão.'; return 1;
  }
  cmp -s .env "$backup/env.original" || {
    echo '.env mudou durante o deploy. Pare para revisão; nenhum segredo exibido.'; return 1;
  }
}
conferir_pm2() {
  sudo -u cobranca pm2 jlist 9>&- | node -e '
let s="";process.stdin.on("data",x=>s+=x);process.stdin.on("end",()=>{
  try {
    const p=JSON.parse(s).filter(x=>x.name==="cobranca");
    if(p.length!==1||p[0].pm2_env.status!=="online"||p[0].pm2_env.pm_exec_path!=="/var/www/cobranca/dist/index.js")throw Error();
    console.log("PM2: cobranca online, usando /var/www/cobranca/dist/index.js");
  } catch {console.error("PM2 diferente do esperado. Nenhum ambiente/segredo exibido.");process.exit(1);}
});'
}

printf '\n=== VERIFICAÇÃO INICIAL ===\n'
printf 'Código atual: %s\n' "$origem"
conferir_pm2
test "$(curl -sS --max-time 15 -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/login-admin)" = 200

printf '\n=== GITHUB — VERSÃO FIXADA ===\n'
git fetch origin main
git cat-file -e "$versao^{commit}"
git merge-base --is-ancestor "$versao" origin/main
git merge-base --is-ancestor "$base" HEAD || { echo 'Origem anterior/divergente da VPS confirmada. Pare para revisão.'; exit 1; }
git merge-base --is-ancestor HEAD "$versao" || { echo 'Origem posterior/divergente do alvo. Pare para revisão.'; exit 1; }
if ! dependencias="$(git diff --name-only HEAD "$versao" -- package.json pnpm-lock.yaml)"; then
  echo 'Git falhou ao conferir dependências. Nada será alterado.'; exit 1
fi
test -z "$dependencias" || { echo 'Dependências diferentes. Pare para revisão; nenhuma instalação será executada.'; exit 1; }
if ! estrutura="$(git diff --name-only HEAD "$versao" -- drizzle server/_core client)"; then
  echo 'Git falhou ao conferir schema/core/cliente. Nada será alterado.'; exit 1
fi
test -z "$estrutura" || { echo 'Mudanças de schema/core/cliente fora do escopo aprovado. Pare para revisão.'; exit 1; }

printf '\n=== BACKUP DA APLICAÇÃO ===\n'
mkdir -p /var/backups/cobranca
backup="$(mktemp -d /var/backups/cobranca/btg-recebimento-$(date +%F-%H%M%S)-XXXXXX)"
chmod 700 "$backup"
export BACKUP_RECEBIMENTO_DIR="$backup"
printf '%s\n' "$origem" > "$backup/commit-anterior.txt"
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
  const chave=(e.BTG_TOKEN_ENCRYPTION_KEY||'').trim();
  const bytes=Buffer.from(chave,'base64');
  if(bytes.length!==32||!/^[A-Za-z0-9+/]+={0,2}$/.test(chave)||bytes.toString('base64')!==chave)throw Error();
  const cnf='[client]\n'+Object.entries(d).map(([k,v])=>`${k}=${JSON.stringify(v)}`).join('\n')+'\n';
  fs.writeFileSync(path.join(process.env.BACKUP_RECEBIMENTO_DIR,'mysql-client.cnf'),cnf,{mode:0o600,flag:'wx'});
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

printf '\n=== ATUALIZANDO O CÓDIGO ===\n'
conferir_env
git diff --quiet
git diff --cached --quiet
test "$(git rev-parse HEAD)" = "$origem"
git merge --ff-only "$versao"
test "$(git rev-parse HEAD)" = "$versao"
conferir_env

printf '\n=== COMPILAÇÃO ISOLADA ===\n'
stage="$(mktemp -d "$root/.build-btg-recebimento-XXXXXX")"
git archive "$versao" | tar -x -C "$stage"
cp .env "$stage/.env"
ln -s "$root/node_modules" "$stage/node_modules"
(cd "$stage" && pnpm check && pnpm build)
rm -f "$stage/.env"
conferir_env
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

printf '\n=== TROCA REVERSÍVEL DO BUILD ===\n'
sha256sum --status -c "$backup/SHA256SUMS"
sha256sum --status -c "$backup/build-candidate-SHA256SUMS"
conferir_env
test "$(git rev-parse HEAD)" = "$versao"
git diff --quiet
git diff --cached --quiet
test ! -L dist
test ! -L "$stage"
test ! -L "$stage/dist"
anterior="$(mktemp -d "$root/.dist-anterior-btg-recebimento-XXXXXX")"
printf '%s/dist\n' "$anterior" > "$backup/build-anterior-dir.txt"
mv dist "$anterior/dist"
if ! mv "$stage/dist" dist; then
  mv "$anterior/dist" dist
  echo 'Troca falhou. Build anterior recolocado; PM2 não reiniciado.'
  exit 1
fi
trocado=1
sudo -u cobranca pm2 restart cobranca --update-env 9>&-

printf '\n=== VERIFICAÇÃO DO SERVIÇO ===\n'
local_ok=0
for tentativa in {1..30}; do
  codigo="$(curl -s --max-time 3 -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/login-admin || true)"
  if [ "$codigo" = 200 ]; then local_ok=1; break; fi
  sleep 2
done
[ "$local_ok" = 1 ] || { echo 'Aplicação não confirmou HTTP200 local. Pare e informe o erro.'; exit 1; }
sleep 5
conferir_pm2
codigo="$(curl -sS --max-time 20 -o /dev/null -w '%{http_code}' https://luminus.gomesesilvaadv.com.br/login-admin)"
[ "$codigo" = 200 ] || { echo "HTTPS retornou $codigo. Pare para revisão."; exit 1; }
conferir_env
sudo -u cobranca pm2 status 9>&-
printf '\n=== ATUALIZAÇÃO CONCLUÍDA ===\n'
printf 'Versão ativa: %s\nBackup: %s\nBuild anterior: %s/dist\nRegistro local: %s\n' "$versao" "$backup" "$anterior" "$stage"
echo 'Sem migração; HTTP200 local/HTTPS e PM2 online. Credenciais e histórico preservados.'
echo 'Nenhuma emissão, cancelamento, recuperação, baixa manual ou reentrega de evento foi forçada pelo roteiro.'
echo 'Recebimentos normais de novos eventos bancários usam a versão corrigida; acordo12 exige conferência posterior.'
