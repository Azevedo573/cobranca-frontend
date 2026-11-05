# Plano — Conta manual BTG em Produção

Aprovado em 05/11/2026, 17:42. Implementação técnica concluída no desenvolvimento. Fonte: `docs/specs/SPEC-btg-conta-manual-producao.md`. Sem deploy, envio bancário, liberação automática, alteração de segredos ou concessões de acesso.

## Entrega técnica

- [x] Registrar aprovação e exceção à conta API obrigatória, com contratos compartilhados.
- [x] Schema: preservar api/manual_sandbox, acrescentar manual_producao e confirmadoPorId/confirmadoEm nullable; migration 0099 com três ALTER exclusivamente na tabela BTG.
- [x] Backend: normalização/CNPJ com DVs igual ao escritório; admin/OAuth/ambiente/declaração/confirmação; ID local distinto; conta imutável e cadastro idempotente.
- [x] Cadastro/auditoria na mesma transação; rollback em falha; nenhum request bancário ou ativação automática no cadastro.
- [x] Guardas: liberação/vínculo/prévia/remessa/emissão recusam origem inválida, confirmação incompleta e CNPJ/configuração/conta alterados; reserva usa locks e snapshots.
- [x] Revalidar dados atuais também antes do POST; reserva incerta preservada para revisão, sem retry automático. Mantidos webhook, acordo/parcela, idempotência/CNAB e valores.
- [x] OAuth: BTG_ACCOUNTS_ENABLED=false controla próximo consentimento; nenhum token existente modificado; status seguro e consulta oficial bloqueada localmente antes de token/fetch nesse modo.
- [x] UI: cadastro por ambiente conectado, formulário/declaração/confirmacão, resumo mascarado, origem/confirmador/data, rótulos reais e consulta opcional; caches/erros/pending preservados.
- [x] Testes direcionados: 60 novos backend, 50 OAuth, 23 UI, 12 provisionador; legado/Sandbox preservados, cenários financeiros isolados e chamadas externas simuladas.
- [x] SQL aditivo aplicado somente no desenvolvimento; nenhum dado de teste inserido. Provisionador exclusivo verificado em --check; falta de confirmação bloqueia antes da conexão.
- [x] Projeto integrado: 856 testes aprovados/1 externo opt-in ignorado; pnpm check, pnpm build e git diff --check aprovados.
- [x] Inspeção visual dos componentes reais com dados fictícios/callback local; antes/depois da declaração/texto literal; sem login ou request bancário.
- [x] Pacote seletivo BTG sobre 85a610a6: patch aplicado em worktree local; 705 testes aprovados/1 externo opt-in ignorado; TypeScript/build aprovados; não inclui Central Jurídica, migration 0098, .env ou metadados agregados.
- [x] Atualizar specs anteriores, manual de operação/migração exclusiva e rollback; documentação e backlog preparados para checkpoint técnico de desenvolvimento.

## Adoção externa — pendente e não autorizada nesta implementação

- [ ] Confirmar commit/alterações locais da VPS e aprovar implantação seletiva, com backup e verificações, sem git pull main indiscriminado.
- [ ] Aplicar somente a estrutura 0099 e o código BTG selecionado; verificar PM2/HTTP/login/configuração.
- [ ] Administrador conferir dados bancários reais, cadastrar conta e vincular ao condomínio.
- [ ] Homologar webhook/assinatura/deduplicação e baixa integral em Produção com evidências; liberação de emissão separada.
- [ ] Revisar primeira parcela/remessa/valor/vencimento/conta antes de emitir e beneficiário original retornado antes de entregar boleto.

A homologação humana e a aceitação bancária não foram substituídas pelos testes. A VPS não recebeu código/DDL desta sessão. Não criar segredos de webhook arbitrários para passar pelo gate. Consultar `docs/btg-conta-manual-producao-operacao.md` na etapa futura.
