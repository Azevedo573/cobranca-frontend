# Tarefas — Conta recebedora manual BTG v2 no Sandbox

- [x] Modelar origem do cadastro da conta como `api` ou `manual_sandbox`.
  - Aceite: migration é apenas aditiva e registros existentes assumem `api`.
  - Verificar: migration revisada e aplicada somente no Sandbox.

- [x] Validar e normalizar conta manual.
  - Aceite: agência e conta são obrigatórias, preservam zeros, aceitam apenas dígitos e ID interno não contém dados bancários em texto.
  - Verificar: teste unitário dos cenários válidos e inválidos.

- [x] Criar mutation administrativa de cadastro manual.
  - Aceite: exige Sandbox, OAuth conectado e confirmação `CADASTRAR`; persiste origem manual e audita sem número completo.
  - Verificar: teste RBAC e typecheck.

- [x] Exibir e cadastrar conta no painel BTG.
  - Aceite: alerta visual, diálogo de confirmação e badge `Cadastro manual — Sandbox`; não há ação equivalente em Produção.
  - Verificar: typecheck e revisão da tela autenticada.

- [x] Validar e salvar checkpoint.
  - Aceite: testes relevantes, suíte completa e build aprovados; nenhuma chamada financeira ou deploy.
  - Verificar: comandos registrados e checkpoint salvo.

- [ ] Cadastrar uma conta de homologação pelo painel e vinculá-la a um condomínio de teste.
  - Aceite: a conta é exibida com badge `Manual — Sandbox`, vinculada explicitamente ao condomínio e habilita apenas o fluxo de homologação.
  - Verificar: revisão administrativa do dado digitado e confirmação da interface; não emitir BolePix nesta etapa.
