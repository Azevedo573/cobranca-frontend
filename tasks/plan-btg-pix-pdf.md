# Correção — Pix ausente no PDF API BTG

Relato09/11/2026: /devedores/1/detalhes, boleto sem QR/Copia e Cola. Escopo: validador GUI Pix, preservação de bytes e regressões. Sem mudanças financeiras, schema, migração, dependências ou deploy. Spec: docs/specs/SPEC-btg-boleto.md; ocorrência: docs/ocorrencias/OCORRENCIA-btg-pix-ausente-pdf-2026-11-09.md.

- [x] Rastrear botão → projeção → router → montagem → PDF; registrar a supressão de Pix recusado.
- [x] Confirmar detail.emv e exemplo de GUI minúsculo nos contratos oficiais POST/GET BTG, sem API real.
- [x] Reproduzir o defeito com EMV sintético e CRC correto; dois casos falham antes da mudança.
- [x] Corrigir somente a comparação ASCII do GUI; retornar exatamente o mesmo payload e validar CRC/TLV sobre os bytes originais.
- [x] Validar maiúsculo/minúsculo/misto, recusa de CRC inválido/outra GUI/Unicode semelhante, projeção e router preservando códigos/canônica e sem rede.
- [x] Validar consulta simulada: Pix novo/ausência em resposta parcial/rollback por CRC inválido.
- [x] PDF sintético uma página; leitura independente do QR via libzbar da página300DPI:140bytes/CRC62A7 idênticos; Copia e Cola integral e I25 conferido.
- [x] 196testes específicos/4suítes; completa serial2581aprovados/1externoBTGopt-in ignorado;13novasregressões.
- [x] TypeScript/build/diff aprovados; desenvolvimentoHTTP200.
- [x] Atualizar ocorrência/spec/backlog e preparar checkpoint do estado exato validado.

## Pendências externas

- [ ] Identificar acordo/parcela/PDF da cobrança real e confirmar origem e EMV/estado do Pix sem publicar dados sensíveis.
- [x] Usuário autorizou em09/11/2026 às14:23 o deploy da correção na VPS.
- [x] Preparar/validar roteiro peloGitHub:39cenários isolados/918verificações/0falhas; sintaxe/hash conferidos, semVPS/banco/serviços reais.
- [ ] Executar/confirmar o deploy autorizado de2ead4388 com backup/build isolado/troca reversível; sem migração nova. Roteiro GitHub: scripts/deploy-btg-pix-pdf-vps.sh.
- [ ] Baixar novamente o PDF da canônica e conferir QR/Copia e Cola na VPS sem pagamento, emissão, cancelamento ou reenvio.

O defeito sintético e a incompatibilidade documental estão confirmados; isso não comprova sozinho a causa no título real. Ausência de Pix no retorno ou PDF antigo/CNAB permanecem hipóteses até a evidência real. Reversão só do commit de correção, mantendo os dados e o título bancário.
