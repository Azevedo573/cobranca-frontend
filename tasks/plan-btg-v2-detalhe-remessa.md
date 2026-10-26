# Plano — Detalhe Operacional de Remessa BTG

1. Ampliar `btgV2.detalheRemessa` com joins somente leitura para parcela, acordo, devedor e conta recebedora, mantendo o filtro pela integração ativa e a permissão de administrador.
2. Evoluir o Sheet de detalhe existente para um painel executivo: status, ambiente, totais, datas, conta mascarada e observação.
3. Exibir itens emitidos e pendentes com contexto de acordo/devedor, vencimento, valor, mensagem, Collection ID e meios de pagamento disponíveis.
4. Preservar apenas a conciliação manual existente como ação explícita; não adicionar emissão, cancelamento ou consulta automática.
5. Executar testes de RBAC/BTG, TypeScript e build.
