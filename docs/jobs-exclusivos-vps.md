# Jobs Exclusivos da VPS

## Objetivo

Régua de Cobrança e processamento da fila WhatsApp não são iniciados pelo processo web do PM2. Ambos devem ser executados apenas na VPS, sob o usuário `cobranca`, por timers `systemd` independentes.

## Sequência de implantação

Primeiro faça o deploy normal da aplicação. Em seguida, como `root`, execute o instalador versionado no projeto. O instalador valida a presença dos scripts e das dependências, instala quatro unidades em `/etc/systemd/system`, recarrega o `systemd` e ativa os timers. Ele não dispara uma rodada manual imediata da régua.

```bash
cd /var/www/cobranca
git pull
pnpm build
sudo -u cobranca pm2 restart cobranca --update-env

sudo bash infra/systemd/instalar-jobs-vps.sh
systemctl --no-pager list-timers luminus-regua.timer luminus-whatsapp-fila.timer
```

## Operação e diagnóstico

O timer da régua dispara em base horária, com pequena aleatoriedade para evitar concorrência no horário exato. O timer da fila WhatsApp processa uma rodada por minuto; os próprios limites, janelas e atrasos anti-ban continuam sendo respeitados pelo código existente. As unidades usam `flock`, impedindo sobreposição de duas rodadas do mesmo job.

```bash
journalctl -u luminus-regua.service -n 100 --no-pager
journalctl -u luminus-whatsapp-fila.service -n 100 --no-pager
systemctl status luminus-regua.timer luminus-whatsapp-fila.timer --no-pager
```

## Rollback

Se for necessário interromper os jobs, desative os timers. Isso não altera mensagens, filas, cobranças ou títulos já gravados.

```bash
sudo systemctl disable --now luminus-regua.timer luminus-whatsapp-fila.timer
```

Para restaurar uma versão anterior do aplicativo, use o checkpoint correspondente e faça o deploy habitual. Não reative a inicialização em memória junto com os timers, pois isso causaria risco de execução duplicada.
