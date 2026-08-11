# Jobs Exclusivos da VPS

## Diretriz

As integrações e rotinas automáticas do Luminus devem executar apenas na VPS. O processo web do PM2 serve a aplicação HTTP e não inicia timers de régua ou fila WhatsApp. As execuções são iniciadas por unidades `systemd` com o usuário restrito `cobranca`.

## Jobs preparados

| Job | Unidade | Frequência | Efeito |
|---|---|---:|---|
| Régua de cobrança | `luminus-regua.timer` | Horária | Avalia réguas ativas e registra o resultado por régua. |
| Fila WhatsApp | `luminus-whatsapp-fila.timer` | 1 minuto | Processa mensagens já enfileiradas, respeitando janelas, limites e retentativas. |

## Instalação na VPS

Após atualizar o código e concluir o build, copie as unidades, recarregue o `systemd` e habilite os timers:

```bash
cd /var/www/cobranca
sudo cp infra/systemd/luminus-*.service infra/systemd/luminus-*.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now luminus-regua.timer luminus-whatsapp-fila.timer
sudo systemctl list-timers 'luminus-*'
```

O arquivo `/var/www/cobranca/.env` deve pertencer ao usuário `cobranca` e conter as variáveis das integrações. Nenhuma credencial deve ser escrita nas unidades ou enviada ao repositório.

## Monitoramento e recuperação

```bash
sudo systemctl status luminus-regua.timer luminus-whatsapp-fila.timer
sudo journalctl -u luminus-regua.service -n 100 --no-pager
sudo journalctl -u luminus-whatsapp-fila.service -n 100 --no-pager
sudo systemctl start luminus-regua.service
```

Em caso de comportamento inesperado, pause os dois timers com `sudo systemctl disable --now luminus-regua.timer luminus-whatsapp-fila.timer`. O processo web e os dados já gravados permanecem intactos; a reversão consiste em desabilitar os timers e restaurar o checkpoint anterior do aplicativo após avaliação humana.
