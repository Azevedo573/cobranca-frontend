# Especificação — correção de webhook BTG para Bearer

Aprovada pelo usuário em 06/11/2026 às 14:05:14, a partir de `docs/ocorrencias/OCORRENCIA-btg-webhook-bearer-2026-11-06.md`. Base `ce005f48`; escopo exclusivamente autenticação e processamento seguro do webhook, mensagens e documentação. Sem emissão ou deploy automático.

## Objetivo e contrato

Receber as notificações de Collections do BTG conforme documentação oficial: `Authorization: Bearer <webhook secret>`, envelope `webhookId`, `event`, `data`, correlação de entrega no header `x-correlation-id`. `webhookId` é a inscrição, não o identificador exclusivo de cada evento. O valor de `BTG_WEBHOOK_SECRET` precisa corresponder ao cadastro no BTG; não é Client Secret OAuth. Corpo bruto continua sendo usado para hash/deduplicação, não para assinatura HMAC.

Comparação de token em tempo constante com hashes de comprimento fixo. Recusar segredo ausente, Bearer incorreto/malformado, cabeçalho múltiplo e assinatura HMAC isolada. Não criar fallback que aceite HMAC quando Bearer falhar. Nenhum segredo vai ao frontend, log, Git ou tabela de entregas.

Validar o JSON e os tipos/limites antes de acessar o banco. Evento desconhecido autenticado recebe confirmação sem mutação financeira. Reconhecer os eventos documentados de Collections e aliases de cancelamento já compatíveis; não interpretar evento desconhecido como pagamento.

## Dados, processamento e concorrência

Sem alteração de schema. Preservar a chave única existente por integração/hash, e registrar somente hash/metadados. O campo legado `assinaturaValida` indica autenticação aceita nesta implementação, não uma prova de HMAC.

Registrar a entrega antes do processamento e bloquear seu registro dentro da transação. Somente entrega processada/ignorada terminal retorna como duplicada. Entrega recebida ou falha deve poder ser processada novamente. Baixa de emissão/origem/acordo e conclusão da entrega devem ser atômicas. Em falha, rollback financeiro e resposta de falha que permita a retentativa do BTG; nenhum ACK de sucesso para processamento incompleto.

Exigir ambiente e integração coerentes com a configuração atual. Encontrar a emissão por integração/collectionId; se houver ambiguidade, não escolher a primeira. Não modificar coleção externa ou outro condomínio. Baixa exige valor efetivamente pago explícito (`amountPaid` ou alias já suportado `paidAmount`) integral em centavos; `amount` nominal isolado não comprova o valor pago. Não recalcular principal, encargos ou snapshots. Pagamento parcial/divergente deve permanecer para revisão, sem baixa.

Uma emissão já paga não tem data/valor sobrescrito por outra entrega. Evento de criação tardio não reabre título cancelado/expirado. Validar a origem e sua carteira; confirmar o acordo somente quando suas parcelas estiverem todas pagas, sob locks que evitem perda em pagamentos simultâneos. Não reativar acordo cancelado. Metadados de falha precisam permitir retentativa sem rebaixar uma entrega já concluída por outro trabalhador.

## Arquivos e convenções

`server/btg-v2/webhook.ts` e eventual helper do mesmo módulo; `server/btg-v2-webhook.test.ts` e novos testes do handler em `server/`; mensagem pontual em `server/routers/btg-v2.ts`; texto pontual em `client/src/pages/configuracoes/BTGConfig.tsx`; documentos de operação e especificações existentes. TypeScript/tRPC/Express/Drizzle existentes, sem nova dependência.

Usar helpers pequenos e funções tipadas, por exemplo `validarAutenticacaoWebhookBtgV2(authorization: unknown, secret: string): boolean`. Checagens de configuração/autenticação falham antes de banco ou mutações. Erros ao cliente retornam códigos genéricos, nunca o erro bruto SQL/driver.

## Plano e tarefas

1. Atualizar a autenticação e os testes puros de Bearer/estados.
2. Ajustar envelope e processamento transacional, com testes do handler em memória, sem banco/BTG reais.
3. Corrigir mensagens e documentos em frente independente, mantendo segredo obrigatório, OAuth, conta elegível e confirmação administrativa de emissão.
4. Rodar testes específicos, suíte serial, TypeScript e build; atualizar ocorrência/backlog e salvar checkpoint validado pelo GitHub.
5. Após entrega, orientar configuração real e nova atualização manual da VPS. Homologação bancária externa permanece pendente.

## Comandos e estratégia de testes

- Específicos: `pnpm exec vitest run server/btg-v2-webhook.test.ts server/btg-v2-webhook-handler.test.ts server/btg-v2-manual-producao-router.test.ts --no-file-parallelism --reporter=default`.
- Completa: `pnpm exec vitest run --no-file-parallelism --reporter=default`.
- Tipagem: `pnpm check`.
- Compilação: `pnpm build`.

Cobrir autenticação, corpo inválido, integração/ambiente/coleção/origem alheia, evento desconhecido, pagamento integral, nominal sem valor pago, parcial/divergente, datas inválidas, coleção ambígua, entrega repetida, título já pago, reentrega após falha e rollback financeiro. Usar fixtures em memória; não inserir entregas falsas na VPS/desenvolvimento real.

## Limites e reversão

Sempre preservar autenticação, auditoria, limites de valor, RBAC da liberação e segredos protegidos. Pedir aprovação adicional para migração/dependência ou ampliação de regra financeira. Nunca liberar emissão automaticamente, enviar cobrança, modificar credenciais/tokens, fazer SQL de dados reais ou desativar checagens para remover o aviso.

Reversão operacional preserva banco/histórico; voltar à versão HMAC não comprova integração funcional. Não restaurar dump antigo sobre novas transações. Se houver falha crítica, interromper a liberação e corrigir antes de retomar o piloto. Cadastro do callback e validação real pelo banco não podem ser inferidos da existência da variável.

## Fontes verificadas em 06/11/2026

- https://developers.empresas.btgpactual.com/docs/starting-doc/Integrando/Webhooks/utilize-webhooks-para-receber-atualiza%C3%A7%C3%B5es-sobre-produtos-conectados
- https://developers.empresas.btgpactual.com/docs/tecspecs/Banking%20-%20Collections-spec
