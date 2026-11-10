# Plano — alcance dos usuários por condomínios

Aprovado em 10/11/2026 às 11:41 apenas para Advogado e Colaborador interno. Spec `docs/specs/SPEC-usuarios-escopo-condominios-2026-11-10.md`. Cobrador/Síndico mantidos; sem grants a pessoas existentes, alteração BTG ou deploy.

## Contrato e banco
- [x] Registrar spec/escopo/limites e responsabilidades antes do código.
- [x] Criar teste RED: guard anterior 12 falhas/7 aprovações em 19 cenários novos.
- [x] Acrescentar users.escopoCondominios enum nullable, preservando NULL legado; User permite projeções históricas e autorização fresca.
- [x] Gerar/revisar migration0104_futuristic_sersi: apenas ALTER TABLE users ADD enum nullable sem default não nulo/backfill.
- [x] Aplicar/conferir somente essa migration no desenvolvimento e preparar provisionador seletivo/idempotente para revisão futura, não executar VPS; 13 testes de definições sintéticas aprovados.

## Implementação
- [x] Guard central com identidade/escopo atual por ID inclusive admin, ativos globais/futuros, carteira restrita/legada, sem sentinela profissional; 24 testes novos + seis legados aprovados.
- [x] Serviço/users CRUD transacional, fresh admin/rollback/auditoria/role/escopo/payload, DTOs/listagem; 44 testes novos + contratos anteriores aprovados.
- [x] Formulário/listagem com duas escolhas só elegíveis, legado/dirty/caches/confirmação e 52 testes de estado/payload/hidratação; sem redesign geral.
- [x] Revisão de cinco famílias de consumidores por workflow somente leitura, seguida de integração por responsabilidades/trechos distintos.
- [x] Consumidores/filtros/guards por ID explícitos sem bypasss novos: 64 financeiros, 34 Jurídico, 56 relatórios, 53 documentos e 31 identidade, todos específicos aprovados. NULL preserva legado.

## Validação
- [x] Cenários de criação/edição global e selecionados, principal opcional/contexto, antigo preservado, ID não autorizado, inactive/future/revoke, role não elegível, último admin, misturas/payloads inválidos e rollback nos 371 testes novos específicos.
- [x] Regressões novas Jurídico tarefas pessoais/RBAC e BTG admin-only sem rede bancária; contratos legados aprovados após compatibilização de fixtures.
- [x] Compatibilizar oito arquivos de fixtures legadas por identidade/papel/estado/NULL/aliases, sem alterar expectativas ou guards; todas as regressões passadas.
- [x] Tipos, build, suíte final serial: 134 arquivos/3.011 testes aprovados e um BTG externo opt-in ignorado; sem erros não tratados. Diff e escopo/schema/dependências/provisionador conferidos.
- [x] TypeScript e build integrados aprovados; nenhuma dependência/migration antiga alterada.
- [x] Inspeção do componente real com dados/callbacks fictícios: Advogado global/restrito e Colaborador global principal null; entrada main restaurada e fixture removida, sem cadastro real.
- [x] Registrar evidências, pendências e reversão; preparar estado validado para checkpoint restrito de desenvolvimento.
- [ ] Após autorização própria: provisionamento/deploy seletivo VPS e piloto de cadastro; não incluídos nesta aprovação.

## Reversão e limites

Não apagar usuários, vínculos, enum com dados ou auditoria; não restaurar banco/financeiro. Falha de mutation deve reverter atomicamente concessão/carteira. Se necessário suspender feature e revisar código preservando estado legado/pessoas existentes. Não misturar migração0098 Central Jurídica. URLs antigas já emitidas podem não ser revogáveis por carteira; política de links fora de escopo.
