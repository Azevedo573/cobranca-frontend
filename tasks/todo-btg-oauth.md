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

- [x] Criar a camada BTG v2 aditiva e o painel de integração First-Party.
  - Aceite: existem integração por ambiente, contas recebedoras, vínculo condomínio→conta, políticas de homologação e emissão inicialmente bloqueada.
  - Verificar: migrations `0089` a `0092` revisadas/aplicadas no Sandbox; `pnpm check` aprovado.

- [x] Implementar o contrato de emissão BolePix v2.
  - Aceite: payload usa `BANKSLIP_QRCODE`, valor em BRL decimal, `account`, `detail`, `payer.taxId` e `payer.phoneNumber`; Sandbox envia `x-response: success`.
  - Verificar: testes unitários de payload, resposta, datas e chaves idempotentes.

- [x] Proteger emissão e callback financeiro v2.
  - Aceite: uma reserva única é criada antes do POST, retorno incerto bloqueia reemissão, webhook valida HMAC no corpo bruto e deduplica por hash sem armazenar PII do payload.
  - Verificar: testes de idempotência, HMAC e transições de status; `pnpm check` aprovado.

- [ ] Reconectar o OAuth Sandbox com o escopo `empresas.btgpactual.com/accounts.readonly`, consultar as contas e vincular uma conta a um condomínio de teste.
  - Aceite: em Banco → BTG — Integração e emissão, a consulta manual lista ao menos uma conta e o condomínio de teste fica vinculado.
  - Verificar: o painel mostra “Pronta para homologação” sem expor tokens, Client Secret ou dados de conta completos.

- [ ] Executar uma emissão BolePix no Sandbox e conferir a resposta retornada pelo BTG.
  - Aceite: o registro canônico `btgCobrancasEmitidas` recebe collectionId, status e dados de boleto/Pix sem preencher os campos legados da cobrança/parcela.
  - Verificar: emitir uma única cobrança ou parcela de teste e repetir a ação para confirmar idempotência.

- [ ] Implementar e homologar conciliação/cancelamento v2 com a API BTG antes de liberar Produção.
  - Aceite: consulta e cancelamento atuam somente sobre `btgCobrancasEmitidas`; pagamento confere valor antes de baixar a origem.
  - Verificar: testes de contrato, eventos de webhook em ambiente suportado e revisão financeira.

- [ ] Liberar Produção somente após homologação formal.
  - Aceite: variáveis e callback de Produção configurados separadamente, OAuth reautorizado, conta recebedora confirmada e emissão aprovada pelo responsável.
  - Verificar: checklist de mudança, backup, teste controlado e aprovação explícita.
