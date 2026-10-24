# Mapa de Capacidades — Gate 1: Segurança de Acesso e Isolamento por Condomínio

## Objetivo

Corrigir o controle de acesso efetivo no servidor para que sessões, permissões e recursos pertençam ao condomínio autorizado. O Gate 1 não redesenha funcionalidades; ele fecha acessos indevidos no backend sem remover histórico, alterar valores financeiros ou reconfigurar integrações.

## Política aprovada

**Somente `admin` possui visão global.** `sindico`, `cobrador`, `colaborador` e `advogado` podem acessar um ou mais condomínios, mas exclusivamente aqueles com vínculo ativo registrado para a pessoa usuária. O campo atual `users.condominioId` permanece como vínculo principal de compatibilidade; a nova associação persistida registra os demais condomínios autorizados. `colaborador` e `advogado` também obedecem à matriz de perfil por módulo e ação.

## Módulos

| ID | Responsabilidade | Depende de |
|---|---|---|
| `identity-session` | Validar a identidade real do login condominial, o status de usuário e o status ativo do condomínio | — |
| `rbac-server` | Alinhar a matriz de permissões do servidor ao frontend, incluindo advogado | — |
| `tenant-core` | Registrar vínculos múltiplos, resolver o condomínio efetivo, bloquear escopo forjado e validar propriedade de recursos por ID | `identity-session`, `rbac-server` |
| `tenant-financeiro` | Aplicar o guard de tenant em devedores, cobranças, tentativas, acordos, parcelas, relatórios e exportações | `tenant-core` |
| `tenant-juridico-vinculado` | Aplicar o guard em processos, prazos, demandas, tarefas, TJRJ, MNI e visões jurídicas que já possuem vínculo de condomínio/processo | `tenant-core` |
| `tenant-juridico-global` | Modelar vínculo por condomínio e restringir/publicar dados hoje globais: PJe, DOERJ, publicações, monitoramentos e intimações sem processo | `tenant-core` |

**Ordem de implementação:** `identity-session` e `rbac-server` em paralelo → `tenant-core` → `tenant-financeiro` e `tenant-juridico-vinculado` em paralelo → `tenant-juridico-global`.

## Fronteiras entre Módulos

- `identity-session` não muda roles ou permissões; ele somente recupera a pessoa autenticada correta e bloqueia usuário/condomínio inativos.
- `rbac-server` não decide escopo de dados; ele decide se o papel/perfil tem autorização para uma ação.
- `tenant-core` não altera regras de domínio; ele produz escopo confiável e valida a propriedade de IDs.
- `tenant-financeiro` e `tenant-juridico-vinculado` consomem somente as funções do `tenant-core`; não reproduzem SQL de escopo no router.
- `tenant-juridico-global` é separado porque há entidades sem `condominioId`. Ele exigirá migration aditiva e estratégia de backfill/restrição temporária; não deve ser introduzido silenciosamente junto de mudanças de permissão.

## Política de Falha

- Tentativa de escolher explicitamente um `condominioId` sem vínculo ativo: `FORBIDDEN`.
- ID de recurso de outro condomínio: resposta genérica `NOT_FOUND`, evitando enumeração de dados e IDs.
- Recurso global sem vínculo condominial: somente `admin` até associação/backfill seguro.
- Usuário local sem vínculo ativo: `FORBIDDEN`.

## Critérios de Saída do Gate 1

1. Nenhum usuário local consegue ler, editar, excluir, emitir, baixar, sincronizar ou exportar dados de condomínio sem vínculo ativo por chamada direta ao servidor.
2. Advogado sem perfil/permissão é bloqueado pelo backend, não apenas pela interface.
3. Sessões condominiais preservam a identidade individual e recusam condomínio/usuário inativo.
4. Dados jurídicos globais permanecem indisponíveis a não-admin até a migração que cria o vínculo por condomínio ser concluída e validada.
5. Há testes negativos de dois condomínios para cada módulo e todos os testes/build passam.
