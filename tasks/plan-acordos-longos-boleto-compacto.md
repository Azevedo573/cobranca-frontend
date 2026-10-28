# Plano Técnico — Acordos longos: boleto compacto e plano completo

## Sequência

1. Extrair resumo puro do plano de parcelas, testado com entrada e 64 parcelas.
2. Substituir a tabela integral no boleto individual pelo resumo, preservando cartões, composição histórica e ficha bancária.
3. Criar gerador PDF informativo de plano completo, com paginação explícita e cabeçalho repetido.
4. Expor procedure de geração protegida por permissão e tenancy, salvando um novo arquivo e registrando auditoria.
5. Incluir botão no detalhe do acordo, com estado de carregamento e abertura do arquivo retornado.
6. Validar com cenário longo, suíte, TypeScript e build.

## Riscos e mitigação

- **Valor do título alterado indevidamente:** o gerador de boleto continua recebendo `dados.valor = parcela.amount`; coberto por regressão.
- **Plano truncado:** paginação pura testada, com cabeçalho por página e validação visual no PDF de 65 etapas.
- **Vazamento entre condomínios:** procedure usa `requirePermission("acordos", "visualizar")` e `assertAcordoAcessivel`.
- **Arquivos antigos substituídos:** chave de armazenamento contém timestamp; somente novo arquivo é criado.

## Reversão

Reverter apenas gerador compacto, procedure e botão. Não há migration, alteração de banco, remessa, título ou dado financeiro a desfazer.
