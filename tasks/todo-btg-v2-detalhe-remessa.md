# Tarefas — Detalhe Operacional de Remessa BTG

- [x] Ampliar a consulta de detalhe com dados locais de parcela, acordo, devedor e conta recebedora.
  - Aceite: nenhum dado vem de chamada externa; o lote continua limitado à integração ativa.
  - Verificar: RBAC BTG e TypeScript.
- [x] Evoluir o Sheet do detalhe com resumo, status, dados do lote e itens emitidos.
  - Aceite: Collection ID, Pix, linha e boleto aparecem somente quando persistidos.
  - Verificar: TypeScript e build.
- [x] Validar regressões financeiras.
  - Aceite: nenhuma ação de reemissão automática é introduzida.
  - Verificar: testes BTG, suíte completa e build.
