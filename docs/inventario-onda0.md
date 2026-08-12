# Inventário Operacional — Onda 0

Este documento registra a linha de base usada para a estabilização operacional do Luminus. Ele deve ser atualizado sempre que uma integração, um job ou uma rota administrativa for adicionada.

## Rotinas identificadas

| Chave sugerida | Origem | Função | Situação na Onda 0 |
|---|---|---|---|
| `tjrj.sincronizar_movimentos` | Ação manual no processo | Busca e persiste movimentações do TJRJ | Registro operacional implementado |
| `tjrj.sincronizar_todos` | Ação manual em lote | Atualiza processos TJRJ ativos | Próxima cobertura de observabilidade |
| `pje.sincronizar_publicacoes` | Endpoint agendado | Pesquisa e persiste publicações PJe | Próxima cobertura de observabilidade |
| `doerj.monitoramento` | Rotina externa/agendada | Monitora termos no Diário Oficial RJ | Próxima cobertura de observabilidade |
| `whatsapp.fila` | Processo interno recorrente | Processa mensagens pendentes da fila | Próxima cobertura de observabilidade |
| `regua.cobranca` | Processo interno recorrente | Avalia e executa réguas de cobrança | Próxima cobertura de observabilidade |
| `alertas.prazos` | Endpoint agendado | Gera alertas jurídicos de prazo | Próxima cobertura de observabilidade |
| `alertas.inadimplencia` | Endpoint agendado | Gera alertas de acordo em atraso | Próxima cobertura de observabilidade |
| `cnab.retorno` | Ação manual/webhook | Importa e concilia retorno bancário | Próxima cobertura de observabilidade |

## Estrutura de observabilidade

A tabela `execucoesOperacionais` registra execuções de integrações sem persistir credenciais ou payloads sensíveis. Ela contém chave/nome da rotina, origem, status, início/fim, duração, contadores, escopo resumido, resultado resumido e erro.

O painel **Administração → Agendamentos** apresenta a saúde operacional com o último estado conhecido de cada rotina que já adota o registro, além das execuções mais recentes. Inicialmente, a sincronização manual de movimentações do TJRJ está coberta.

## Critérios de expansão

Cada nova rotina deverá usar `iniciarExecucaoOperacional` no início e `finalizarExecucaoOperacional` em todos os encerramentos de sucesso, alerta e falha. A rotina não pode deixar de executar caso a gravação do log falhe.

O resultado registrado deve conter apenas métricas e identificadores operacionais necessários. Senhas, tokens, chaves de API e outros campos sensíveis são automaticamente redigidos pelo helper.
