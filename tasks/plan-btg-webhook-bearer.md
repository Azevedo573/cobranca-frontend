# Plano — correção do webhook BTG para Bearer

Aprovação do usuário: 06/11/2026 às 14:05:14. Especificação: `docs/specs/SPEC-btg-webhook-bearer.md`. Base de código: `ce005f48`.

## Entrega técnica

- [x] Conferir documentação oficial BTG, diagnosticar incompatibilidade HMAC/Bearer e registrar ocorrência.
- [x] Implementar autenticação Bearer estrita, comparação segura, sem fallback HMAC ou exposição de segredo.
- [x] Validar envelope e tipos antes do banco; separar inscrição webhookId de identificador de entrega.
- [x] Preservar hash e metadados sem persistir conteúdo financeiro/pessoal integral ou Authorization.
- [x] Processar entrega, emissão, parcela/cobrança e conclusão do acordo em transação, com locks e revalidação de vínculo.
- [x] Permitir retomar entrega recebida/falha, sem ACK prematuro de duplicata nem baixa parcialmente persistida.
- [x] Exigir valor efetivamente pago explícito e integral; valor nominal isolado não autoriza baixa.
- [x] Preservar pagamento terminal e datas existentes; criação tardia não reabre cancelamento/expiração.
- [x] Corrigir mensagem/UI e instruções de webhook, preservando guardas de liberação e variável BTG_WEBHOOK_SECRET.
- [x] Validar 77 testes iniciais de autenticação/liberação/UI e TypeScript.
- [x] Validar 114 testes do handler com rollback/reentrega em banco simulado; 191 testes específicos aprovados ao integrar autenticação/liberação/UI.
- [x] Executar suíte completa serial: 986 testes aprovados, um externo opt-in ignorado; TypeScript e build frontend/backend aprovados.
- [x] Registrar resultados, atualizar backlog e preparar checkpoint para entrega pelo GitHub, sem deploy.

## Etapas externas — não realizadas por esta correção

- [ ] Atualizar manualmente a VPS para o checkpoint corrigido, após backup e revisão, sem migração adicional.
- [ ] Configurar o webhook do aplicativo BTG de Produção e o segredo correspondente protegido na VPS.
- [ ] Homologar entrega autêntica, autenticação, reentrega e baixa; presença de segredo não substitui este teste.
- [ ] Revisar primeira cobrança real e liberar emissão administrativamente, sem criação automática de cobrança.

Nenhum SQL de dados reais, chamada BTG, nova dependência, alteração de schema, ajuste de credenciais ou concessão de permissão está autorizado pelo trabalho técnico. A conta já cadastrada e os tokens existentes devem permanecer intactos. O rollback não deve remover estruturas ou restaurar banco antigo sobre novas transações.
