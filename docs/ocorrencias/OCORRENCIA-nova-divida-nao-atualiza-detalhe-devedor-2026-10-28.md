# Resumo da Ocorrência

- **Data:** 28/10/2026
- **Módulo:** Detalhe do devedor — `/devedores/:id/detalhes`
- **Tipo:** melhoria corretiva de atualização de interface
- **Prioridade:** média
- **Impacto:** operacional e de experiência do usuário

## Comportamento Anterior

Após cadastrar uma nova dívida pelo modal **Nova Dívida**, o registro era persistido corretamente, mas a tela continuava mostrando a lista anterior até um recarregamento manual.

## Causa Confirmada

O modal invalidava `cobrancas.getByDevedor`, enquanto a tela de detalhe renderiza a lista com `cobrancas.getComAcordos`. As métricas e a visão consolidada também podiam permanecer em cache.

## Correção Aplicada

Após a confirmação da criação, o modal agora aguarda a invalidação das consultas de lista unificada de cobranças, lista legada, dados do devedor e visão consolidada. Só então ele fecha e confirma que a lista foi atualizada.

## Impacto em Dados e Banco

Nenhuma alteração de schema, valor, status, acordo, título ou histórico. A correção só atualiza caches do cliente após a resposta de criação já confirmada pelo servidor.

## Plano de Testes

- Cadastro de dívida em devedor sem acordo: a tabela e métricas devem atualizar automaticamente.
- Cadastro de dívida em devedor com acordo: a lista unificada deve refletir o novo débito sem recarregar a página.
- Falha de criação: nenhuma lista deve ser alterada.
- Regressão: validar a política de invalidação e a checagem TypeScript/build.

## Plano de Reversão

Reverter somente a chamada de atualização de consultas no modal. Não requer backup, migração ou reprocessamento de dados.

## Critérios de Aceite

- A nova dívida aparece automaticamente em `/devedores/:id/detalhes` após o modal confirmar o cadastro.
- Contadores, métricas e visão consolidada passam a refletir a nova cobrança.
- Nenhuma nova dívida é criada durante a atualização da interface.
