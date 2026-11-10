#!/usr/bin/env bash
set +x
set -euo pipefail
umask 077

root=/var/www/cobranca
base=b1da399e953397703a1669bb9eb17d1397781f34
versao=7a37548b2a392a6b8d6590966da2026eed6ccc3a
backup=''
stage=''
anterior=''
trocado=0
ddl_iniciado=0

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
    if [ "$ddl_iniciado" = 1 ]; then
      echo 'A migration0104 pode estar aplicada. Confira a estrutura antes de retomar; não remova a coluna nem restaure o banco automaticamente.'
    else
      echo 'Este roteiro ainda não iniciou a aplicação da migration0104.'
    fi
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
if ! estrutura="$(git diff --name-only HEAD "$versao" -- drizzle)"; then
  echo 'Git falhou ao conferir migrations. Nada será alterado.'; exit 1
fi
while IFS= read -r arquivo; do
  case "$arquivo" in
    drizzle/schema.ts|drizzle/0104_futuristic_sersi.sql|drizzle/meta/0104_snapshot.json|drizzle/meta/_journal.json|'') ;;
    *) echo "Estrutura fora da migration0104: $arquivo. Pare para revisão."; exit 1;;
  esac
done <<< "$estrutura"

printf '\n=== BACKUP DA APLICAÇÃO ===\n'
mkdir -p /var/backups/cobranca
backup="$(mktemp -d /var/backups/cobranca/usuarios-escopo-$(date +%F-%H%M%S)-XXXXXX)"
chmod 700 "$backup"
export BACKUP_USUARIOS_DIR="$backup"
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
  if(!e.BTG_TOKEN_ENCRYPTION_KEY||Buffer.from(e.BTG_TOKEN_ENCRYPTION_KEY.trim(),'base64').length!==32)throw Error();
  const cnf='[client]\n'+Object.entries(d).map(([k,v])=>`${k}=${JSON.stringify(v)}`).join('\n')+'\n';
  fs.writeFileSync(path.join(process.env.BACKUP_USUARIOS_DIR,'mysql-client.cnf'),cnf,{mode:0o600,flag:'wx'});
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
stage="$(mktemp -d "$root/.build-usuarios-escopo-XXXXXX")"
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

printf '\n=== MIGRAÇÃO SELETIVA 0104 ===\n'
sha256sum --status -c "$backup/SHA256SUMS"
conferir_env
git diff --quiet
git diff --cached --quiet
test "$(git rev-parse HEAD)" = "$versao"
env -u DATABASE_URL node scripts/provisionar-usuarios-escopo-condominios.cjs --check
ddl_iniciado=1
env -u DATABASE_URL node scripts/provisionar-usuarios-escopo-condominios.cjs --apply 'CONFIRMAR CAMPO ESCOPO CONDOMINIOS'
env -u DATABASE_URL node scripts/provisionar-usuarios-escopo-condominios.cjs --check
echo 'Somente users.escopoCondominios nullable conferido; nenhuma migration0098/geral, alteração de usuários ou concessão em lote.'

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
anterior="$(mktemp -d "$root/.dist-anterior-usuarios-escopo-XXXXXX")"
printf '%s/dist\n' "$anterior" > "$backup/build-anterior-dir.txt"
mv dist "$anterior/dist"
if ! mv "$stage/dist" dist; then
  mv "$anterior/dist" dist
  echo 'Troca falhou. Build anterior recolocado; PM2 não reiniciado. Coluna0104 preservada.'
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
echo 'Migration0104 conferida; HTTP200 local/HTTPS e PM2 online. Nenhuma migração Jurídica executada.'
echo 'Credenciais e acessos existentes preservados. Nenhum cadastro real, concessão em lote, emissão, cancelamento, reenvio ou baixa por este roteiro.'
