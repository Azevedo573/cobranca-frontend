#!/usr/bin/env bash
set +x
set -euo pipefail
umask 077

root=/var/www/cobranca
versao=b1da399e953397703a1669bb9eb17d1397781f34
base=2ead4388cc60a0a06207422b8057eea441ade521
stage=''
anterior=''
trocado=0

finalizar() {
  rc=$?
  trap - EXIT
  [ -z "$stage" ] || rm -f "$stage/.env"
  if [ "$rc" -ne 0 ]; then
    printf '\nFALHA: pare e envie o erro. Não repita o roteiro inteiro.\n'
    [ -z "$anterior" ] || printf 'Build anterior: %s/dist\n' "$anterior"
    if [ "$trocado" = 1 ]; then
      echo 'O dist foi trocado. Revise a ativação antes de continuar.'
    else
      echo 'O dist ativo não foi substituído. O código Git pode ter sido atualizado.'
    fi
    echo 'Este roteiro não executa backup, migração ou operação bancária.'
  fi
  exit "$rc"
}
trap finalizar EXIT

[ "$(id -u)" = 0 ] || { echo 'Execute como root na VPS.'; exit 1; }
for cmd in git node pnpm sudo curl sha256sum tar flock mktemp; do
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
env_hash="$(sha256sum .env | cut -d ' ' -f 1)"
origem="$(git rev-parse HEAD)"

conferir_env() {
  test "$(sha256sum .env | cut -d ' ' -f 1)" = "$env_hash" || {
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
case "$(git remote get-url origin)" in
  https://github.com/Azevedo573/cobranca-frontend|https://github.com/Azevedo573/cobranca-frontend.git|git@github.com:Azevedo573/cobranca-frontend.git) ;;
  *) echo 'Remoto diferente do repositório aprovado. Pare aqui.'; exit 1;;
esac

printf '\n=== GITHUB — VERSÃO FIXADA ===\n'
git fetch origin main
git cat-file -e "$versao^{commit}"
git merge-base --is-ancestor "$versao" origin/main
git merge-base --is-ancestor "$base" HEAD || { echo 'Versão anterior à correção Pix ou branch divergente. Pare para revisão.'; exit 1; }
git merge-base --is-ancestor HEAD "$versao" || { echo 'Versão atual posterior/divergente do alvo. Pare para revisão.'; exit 1; }
if ! estrutura_alterada="$(git diff --name-only HEAD "$versao" -- package.json pnpm-lock.yaml drizzle)"; then
  echo 'Git falhou ao conferir estrutura/dependências. Nada será ativado.'; exit 1
fi
test -z "$estrutura_alterada" || { echo 'Banco ou dependências diferentes. Nenhuma migração/instalação será executada.'; exit 1; }
if ! arquivos_alterados="$(git diff --name-only HEAD "$versao")"; then
  echo 'Git falhou ao conferir o escopo. Nada será ativado.'; exit 1
fi
while IFS= read -r arquivo; do
  case "$arquivo" in
    docs/*|tasks/*|todo.md|scripts/deploy-btg-pix-pdf-vps.sh|server/*.test.ts|server/boleto-pdf.ts|server/boleto-origem-paginacao.ts) ;;
    '') ;;
    *) echo "Alteração fora do escopo documental: $arquivo. Pare para revisão."; exit 1;;
  esac
done <<< "$arquivos_alterados"
git merge --ff-only "$versao"
test "$(git rev-parse HEAD)" = "$versao"
conferir_env
echo 'Código atualizado. Sem backup novo, migrations, dependências ou operações BTG.'

printf '\n=== COMPILAÇÃO ISOLADA ===\n'
stage="$(mktemp -d "$root/.build-origem-completa-XXXXXX")"
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
sha256sum "$stage/dist/index.js" "$stage/dist/public/index.html" > "$stage/build-SHA256SUMS"
printf '%s\n' "$origem" > "$stage/commit-anterior.txt"
printf '%s\n' "$versao" > "$stage/commit-candidato.txt"

printf '\n=== TROCA REVERSÍVEL DO BUILD ===\n'
sha256sum --status -c "$stage/build-SHA256SUMS"
conferir_env
test "$(git rev-parse HEAD)" = "$versao"
git diff --quiet
git diff --cached --quiet
test ! -L dist
test ! -L "$stage"
test ! -L "$stage/dist"
anterior="$(mktemp -d "$root/.dist-anterior-origem-completa-XXXXXX")"
printf '%s\n' "$origem" > "$anterior/commit-anterior.txt"
printf '%s/dist\n' "$anterior" > "$stage/build-anterior-dir.txt"
# Preserva apenas o build para reversão: não é backup do banco ou da aplicação.
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
printf 'Versão ativa: %s\nBuild anterior: %s/dist\nRegistro local: %s\n' "$versao" "$anterior" "$stage"
echo 'Sem backup novo ou migração; HTTP200 local/HTTPS e PM2 online.'
echo 'Banco e credenciais preservados. Nenhuma cobrança emitida, cancelada, reenviada ou baixada por este roteiro.'
