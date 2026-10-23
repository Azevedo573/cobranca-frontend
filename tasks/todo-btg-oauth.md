# Tarefas — OAuth BTG Authorization Code

- [x] Criar schema e migration aditiva para estados OAuth e tokens cifrados.
  - Aceite: nenhuma tabela financeira existente é alterada; estados e tokens possuem índices de consulta.
  - Verificar: migration SQL revisada e schema TypeScript compilado.

- [x] Implementar utilitário de criptografia e serviço OAuth BTG.
  - Aceite: gera URL com state, valida expiração/uso único, troca código e renova token sem registrar segredo.
  - Verificar: testes unitários de estado, cifra, callback e refresh.

- [x] Conectar o serviço de Collections ao novo token OAuth.
  - Aceite: não existe `grant_type=client_credentials` no caminho de Collections.
  - Verificar: teste de regressão e busca estática direcionada.

- [x] Criar callback Express e procedures administrativas com RBAC.
  - Aceite: somente administrador inicia autorização; callback retorna resultado seguro ao administrador sem expor token.
  - Verificar: testes de permissão e callback inválido.

- [x] Atualizar configuração BTG no frontend.
  - Aceite: mostra estado seguro, URI de callback e ação Conectar/Reautorizar; não exibe segredo de webhook ou token.
  - Verificar: `pnpm check` e build.

- [x] Validar e salvar checkpoint.
  - Aceite: testes relevantes, suíte completa, typecheck e build passam; sem deploy.
  - Verificar: comandos registrados e checkpoint criado.

- [ ] Cadastrar a URI de callback do ambiente correspondente no portal BTG e configurar os segredos no servidor.
  - Aceite: o botão “Conectar conta BTG” abre o consentimento e retorna com status conectado, sem exibir tokens.
  - Verificar: fluxo Authorization Code no Sandbox, depois homologação controlada em Produção.
