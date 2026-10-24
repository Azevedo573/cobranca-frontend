# Tarefas — Gestão de Remessas BTG

- [x] Modelar `btgRemessas`, `btgRemessaItens` e referência opcional em emissão
  - Aceite: migration somente aditiva; emissões históricas preservadas.
  - Verificar: geração/revisão SQL e schema TypeScript.
- [x] Implementar domínio de lote e testes de status/contadores
  - Aceite: resumo correto para sucesso, falha total, parcial e itens já existentes.
  - Verificar: Vitest unitário.
- [x] Implementar fila e envio administrativo por condomínio
  - Aceite: uma única origem condominial; conta vinculada; lote persistido antes de chamadas externas.
  - Verificar: testes de router/RBAC e mocks de emissão.
- [x] Implementar listagem, detalhe e conciliação por lote
  - Aceite: totais e itens refletem o histórico persistido; conciliação não baixa pagamento divergente.
  - Verificar: testes de domínio e router.
- [x] Criar tela Banco → Remessas BTG
  - Aceite: seleção, revisão, confirmação, progresso e acompanhamento por item.
  - Verificar: TypeScript e revisão visual.
- [x] Registrar rota e menu Banco
  - Aceite: acesso exclusivo de administrador.
  - Verificar: teste RBAC e navegação.
- [x] Validar entrega
  - Aceite: testes relevantes, `pnpm test`, `pnpm check`, `pnpm build` e checkpoint.

- [ ] Homologar manualmente uma remessa no Sandbox
  - Aceite: administrador cria uma remessa de acordo elegível, acompanha os itens e consulta/concilia o resultado sem duplicidade.
  - Verificar: execução assistida pelo usuário no ambiente Sandbox; não foi disparada automaticamente pela implementação.
