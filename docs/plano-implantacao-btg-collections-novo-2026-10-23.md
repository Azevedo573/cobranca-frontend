# Plano de implantação — Integração BTG para Cobranças

**Base do documento:** roteiro de integração BTG fornecido pelo solicitante em 23 de outubro de 2026. Este plano não pressupõe arquitetura, banco de dados, telas, regras ou código do sistema existente.

# Resumo da Demanda

Implantar uma nova integração com o BTG Empresas para criar e acompanhar cobranças digitais. A solução deve iniciar no Sandbox, usar OAuth 2.0 Authorization Code, obter os dados da conta recebedora, emitir o instrumento de cobrança escolhido, registrar o identificador retornado, receber eventos de pagamento em produção e conciliar o resultado com o título financeiro interno.

A implantação deve ser segura, auditável, idempotente e preparada para operar separadamente nos ambientes Sandbox e Produção.

# Classificação

**Integração financeira crítica**, com impacto em cobrança, dados pessoais de pagadores, contas bancárias, conciliação financeira e auditoria.

Prioridade sugerida: **alta**.

Complexidade sugerida: **grande**.

# Problema Atual

Não existe um fluxo novo, formalizado e homologável para:

- autorizar o sistema a acessar uma conta BTG;
- selecionar a empresa e conta que receberá os valores;
- gerar uma cobrança por API;
- registrar o vínculo entre a cobrança interna e o identificador BTG;
- impedir emissão duplicada;
- receber pagamentos e demais mudanças de status;
- manter rastreabilidade de cada comando financeiro.

Também ainda não foi tomada a decisão de produto sobre qual instrumento de cobrança será o primeiro a entrar em operação nem sobre o modelo de integração apropriado.

# Solução Proposta

Criar um módulo próprio de **Cobranças BTG**, separado em seis capacidades dependentes:

| Módulo | Responsabilidade | Depende de |
|---|---|---|
| `btg-configuracao` | Configuração de ambiente, aplicativo, escopos e conexão | — |
| `btg-autorizacao` | OAuth Authorization Code, consentimento, tokens e renovação | `btg-configuracao` |
| `btg-contas` | Consulta e escolha da empresa, conta e chave Pix recebedora | `btg-autorizacao` |
| `btg-emissao` | Validação, idempotência e criação de cobrança | `btg-contas` |
| `btg-conciliacao` | Consulta de status e baixa financeira controlada | `btg-emissao` |
| `btg-webhooks` | Recebimento, validação e reprocessamento de eventos | `btg-emissao`, `btg-conciliacao` |

Ordem de implantação: `btg-configuracao` → `btg-autorizacao` → `btg-contas` → `btg-emissao` → `btg-conciliacao` → `btg-webhooks`.

A proposta inicial para a primeira entrega é suportar **um único instrumento**. A recomendação é começar por **boleto com QR Code Pix (BolePix)**, porque oferece dois meios de pagamento no mesmo título. Essa decisão deve ser aprovada antes da especificação técnica. Boleto simples, Pix com vencimento, Pix imediato e Link de Pagamento ficam como extensões posteriores.

# Escopo

A primeira implantação deve cobrir:

1. Cadastro seguro da configuração BTG por ambiente.
2. Consentimento OAuth por usuário autorizado do BTG e armazenamento protegido de tokens.
3. Consulta das empresas, contas e chaves Pix autorizadas pelo token.
4. Escolha explícita da conta recebedora antes da primeira emissão.
5. Criação de cobrança no Sandbox para validação de contrato.
6. Emissão em Produção somente após homologação, aprovação operacional e ativação explícita.
7. Registro do identificador BTG, payload normalizado, resposta e status da cobrança.
8. Cancelamento controlado de cobrança ainda elegível.
9. Consulta manual de status e conciliação automática agendada.
10. Endpoint de webhook HTTPS, validação de autenticidade, idempotência e fila de reprocessamento.
11. Histórico de auditoria de configuração, autorização, emissão, cancelamento, conciliação e eventos.
12. Painel administrativo de saúde da integração e fila de exceções.

# Fora do Escopo

A primeira entrega não deve incluir:

- operação financeira real no Sandbox;
- baixa automática irreversível sem regras de conciliação aprovadas;
- múltiplos instrumentos de cobrança simultaneamente;
- parcelamento, renegociação ou acordo gerados diretamente pela API BTG;
- split de recebíveis, protesto, negativação, Pix Automático ou Link de Pagamento;
- importação de históricos antigos;
- captura de cartão ou tela própria de checkout;
- acesso de usuários comuns a Client Secret, tokens, chaves Pix ou dados completos de conta;
- ativação de Produção antes da homologação formal do aplicativo BTG.

# Módulos Impactados

Como esta é uma implantação nova, os módulos a criar são:

- Configuração de integrações financeiras;
- Autorização BTG;
- Cadastro de contas recebedoras;
- Gestão de cobranças;
- Conciliação financeira;
- Central de eventos/webhooks;
- Auditoria e segurança;
- Painel operacional e relatórios.

# Regras de Negócio

1. **Modelo de integração:** a implantação deve começar somente após decidir se o aplicativo será First-Party ou Third-Party. First-Party é apropriado quando a mesma empresa titular da conta BTG consome os recursos. Se o produto emitir em nome de empresas diferentes, essa decisão precisa ser reavaliada com o BTG antes do desenvolvimento.

2. **Instrumento inicial:** apenas um tipo de cobrança poderá estar ativo na primeira versão. A escolha deve ser registrada como configuração e não embutida em código.

3. **Conta recebedora:** nenhuma cobrança pode ser criada sem uma empresa, agência e conta recebedora ativas e aprovadas para aquele ambiente.

4. **Ambiente:** Sandbox e Produção devem ter credenciais, tokens, contas, URLs e registros inteiramente segregados. Um token Sandbox nunca pode ser usado em Produção.

5. **Consentimento:** a primeira autorização exige login e consentimento de usuário BTG adequado. Em Produção, a autorização só deve ser aceita se o usuário tiver a permissão exigida pelo BTG.

6. **Segredos:** `client_secret`, access token, refresh token e segredo de webhook não podem aparecer em frontend, logs, banco em texto puro, exportações ou mensagens de erro.

7. **Renovação:** o access token e o refresh token devem ser renovados em processo de servidor. A falha de renovação deve bloquear novas emissões e criar uma exceção operacional, nunca tentar emitir com token inválido.

8. **Idempotência:** uma tentativa de emissão deve possuir uma chave determinística. Repetições do mesmo comando não podem gerar duas cobranças no BTG.

9. **Imutabilidade financeira:** uma cobrança emitida não deve ser apagada. Cancelamento, expiração, pagamento, estorno e falha devem ser registrados como novos eventos de status.

10. **Baixa de pagamento:** somente eventos válidos e conciliados podem atualizar a situação financeira interna. Divergência de valor, identificador desconhecido, pagamento parcial ou status inesperado deve ir para revisão humana.

11. **Webhook:** o evento deve ser processado uma única vez, mesmo que o BTG reenvie a mesma notificação. O corpo original, cabeçalhos relevantes, data de recebimento e resultado do processamento devem ficar registrados.

12. **Sandbox:** respostas Sandbox servem para validar autenticação e contrato. Elas não comprovam liquidação, webhook, saldo ou comportamento financeiro de Produção.

# Fluxo da Funcionalidade

## Fluxo de configuração e autorização

1. Um administrador financeiro cria a configuração do ambiente Sandbox.
2. O sistema valida a presença de Client ID, Client Secret, URI de retorno e chave de proteção de tokens.
3. O administrador inicia a conexão BTG.
4. O sistema cria um `state` de uso único, redireciona ao BTG Id e aguarda o callback HTTPS.
5. O responsável faz login, seleciona a empresa autorizada e concede os escopos solicitados.
6. O callback valida `state`, troca o código por tokens e salva os tokens cifrados.
7. O sistema consulta empresas, contas e chaves Pix disponíveis.
8. O administrador escolhe a conta recebedora padrão do ambiente.

## Fluxo de emissão

1. Usuário autorizado seleciona um título interno elegível.
2. O sistema valida pagador, valor, vencimento, instrumento, conta recebedora e inexistência de emissão ativa.
3. O sistema reserva uma chave de idempotência e cria uma tentativa local em estado `processando`.
4. O backend envia a solicitação ao BTG.
5. Em sucesso, o sistema salva o identificador BTG, dados de pagamento retornados, status e data da emissão.
6. Em falha, a tentativa é registrada com código, mensagem segura e orientação operacional.
7. O título passa a exibir o estado da integração, sem receber baixa financeira por mera criação da cobrança.

## Fluxo de pagamento e conciliação

1. Em Produção, o BTG entrega um webhook ao endpoint HTTPS do sistema.
2. O sistema valida assinatura/origem, deduplica o evento e armazena-o antes de processar.
3. O evento é associado à cobrança pelo identificador BTG e/ou chave de correlação.
4. A regra de conciliação compara status e valores.
5. Se a conciliação for íntegra, o sistema atualiza o título e registra o histórico.
6. Se houver divergência, o título fica em `revisão financeira`, sem baixa automática.
7. Uma rotina de reconciliação consulta periodicamente cobranças pendentes para recuperar falhas de entrega de webhook.

# Telas e Experiência do Usuário

A interface deve seguir a identidade visual aprovada do produto, privilegiar clareza operacional e manter ações financeiras críticas separadas de ações informativas.

## Tela: Configuração BTG

**Objetivo:** exibir a situação de cada ambiente e iniciar ou revogar o consentimento.

**Campos e estados:** ambiente, conexão, empresa autorizada mascarada, conta padrão mascarada, escopos, expiração do token, última renovação, último erro e status do webhook. Nenhum segredo deve ser exibido.

**Ações:** conectar conta, reconectar, selecionar conta recebedora, testar contrato Sandbox, consultar saúde e desativar integração.

**Permissão:** administrador financeiro.

**Alertas:** token próximo da expiração, conexão inválida, conta não selecionada, ambiente de Produção não homologado e webhook não configurado.

## Tela: Contas BTG

**Objetivo:** permitir selecionar a empresa, a agência, a conta e, quando aplicável, a chave Pix de destino.

**Campos:** empresa, CNPJ mascarado, agência, conta mascarada, tipo de conta, chave Pix mascarada, situação e data da última consulta.

**Ações:** atualizar lista, definir como conta padrão e inativar seleção.

**Permissão:** administrador financeiro.

## Tela: Emitir cobrança

**Objetivo:** revisar os dados antes de enviar um comando financeiro.

**Campos obrigatórios:** instrumento, valor, vencimento, pagador, documento do pagador, conta recebedora e identificador interno do título.

**Campos condicionais:** e-mail, telefone, endereço, instruções e chave Pix, conforme instrumento escolhido e contrato do BTG.

**Ações:** validar dados, emitir, cancelar emissão em processamento quando tecnicamente possível e voltar.

**Estados:** rascunho, dados pendentes, elegível, processando, emitida, falha, cancelada, paga, expirada e em revisão.

**Permissão:** operador financeiro com alçada de emissão; cancelamento exige perfil superior ou regra de dupla aprovação, a definir.

## Tela: Detalhe da cobrança

**Objetivo:** concentrar informação operacional sem permitir alteração de dados imutáveis do título já emitido.

**Dados:** instrumento, status BTG, linha digitável, QR Code/EMV quando disponível, identificador BTG, histórico de tentativas, eventos recebidos, valores, vencimento, conta recebedora mascarada e responsável por cada ação.

**Ações:** copiar dados de pagamento, consultar status, solicitar cancelamento e abrir exceção financeira.

## Tela: Central de exceções BTG

**Objetivo:** tratar falhas de emissão, erros de token, eventos não associados, divergências e pagamentos parciais.

**Ações:** revisar, reprocessar evento, conciliar manualmente com justificativa, solicitar nova autorização e encerrar exceção.

**Permissão:** administrador financeiro e equipe de conciliação.

# Dados e Banco de Dados

A modelagem deve ser nova, com migrações auditáveis e sem dependência de estruturas legadas.

## Entidades mínimas

- `btg_integracoes`: ambiente, modelo de integração, situação, empresa autorizada, conta padrão, configuração de webhook e metadados não sensíveis.
- `btg_tokens`: vínculo com a integração, access token cifrado, refresh token cifrado, expiração, escopos, data de renovação e situação. Deve haver uma chave por integração/empresa autorizada.
- `btg_estados_oauth`: hash do state, URI de retorno, expiração, usuário que iniciou e data de consumo.
- `btg_contas`: empresa, CNPJ, agência, conta, tipo, situação e dados mascarados para exibição.
- `btg_chaves_pix`: vínculo com conta, tipo, valor cifrado ou mascarado, situação e data da consulta.
- `btg_cobrancas`: título interno, integração, conta, instrumento, idempotency key, identificador BTG, chave de correlação, payload normalizado, resposta normalizada, status, datas e valores.
- `btg_tentativas_emissao`: número da tentativa, momento, resultado, código técnico, mensagem segura e identificador de correlação.
- `btg_eventos_webhook`: identificador externo, hash do corpo, cabeçalhos necessários, corpo protegido, data de recebimento, resultado, tentativas de processamento e associação à cobrança.
- `btg_conciliacoes`: cobrança, evento ou consulta de origem, valores esperados/recebidos, decisão, justificativa, usuário responsável e data.
- `btg_auditoria`: ações administrativas e financeiras relevantes, sem segredos e sem token bruto.

## Requisitos de dados

- Valores monetários internos devem usar inteiros em centavos; a conversão para o formato do BTG deve ocorrer somente no adaptador de API.
- Datas devem ser armazenadas em UTC e apresentadas no fuso do usuário.
- Documentos pessoais e dados de contato devem observar minimização, mascaramento na interface e controle de acesso.
- Payloads e respostas devem passar por normalização e redaction antes de persistência; segredos e tokens nunca podem ser gravados em logs.
- Índices únicos devem impedir duplicidade por `idempotencyKey`, identificador BTG e identificador externo de webhook.

# Permissões

- **Administrador financeiro:** configura ambientes, inicia/revoga autorização, escolhe conta recebedora, habilita Produção e trata exceções críticas.
- **Operador financeiro:** emite cobranças para títulos elegíveis e consulta status, dentro de sua alçada.
- **Conciliador financeiro:** analisa divergências, reprocessa eventos e decide conciliações manuais justificadas.
- **Auditor:** consulta histórico e relatórios sem emitir, cancelar, configurar ou revelar dados sensíveis.
- **Usuário comum:** não vê segredos, tokens, chaves Pix integrais, configurações bancárias nem ações financeiras administrativas.

A emissão, o cancelamento e a conciliação manual devem validar simultaneamente perfil, escopo organizacional e situação do título.

# Integrações e Automações

## Integrações BTG necessárias

1. Autorização OAuth Authorization Code.
2. Renovação de token via refresh token.
3. Consulta de empresas, contas e chaves Pix autorizadas.
4. Criação, consulta e cancelamento do instrumento escolhido.
5. Webhooks de eventos de cobrança em Produção.
6. Consulta de status para reconciliação de contingência.

## Automações

- Renovar tokens com antecedência e alertar antes da expiração do refresh token.
- Executar conciliação programada de cobranças pendentes.
- Reprocessar webhooks transitórios com retentativas limitadas e backoff.
- Criar exceção quando houver pagamento parcial, divergência de valor, identificador desconhecido ou erro não recuperável.
- Alertar administradores sobre falha de conexão, webhook inativo e acúmulo de exceções.

# Histórico e Auditoria

Devem ser auditados, no mínimo:

- criação, edição e inativação de configurações;
- início, conclusão, recusa e falha de autorização OAuth;
- consulta e seleção de empresa, conta e chave Pix;
- validação, tentativa, sucesso e falha de emissão;
- cancelamento e alteração de status;
- recepção, validação, duplicidade, processamento e reprocessamento de webhook;
- conciliação automática e manual;
- alterações de permissão e ativação de Produção.

Cada registro deve conter autor quando houver ação humana, data/hora, ambiente, identificadores de correlação e motivo. Tokens, segredos e dados completos de conta não podem ser incluídos no histórico.

# Critérios de Aceite

1. **Autorização Sandbox**
   - Dado que a configuração Sandbox está completa,
   - Quando um administrador inicia a conexão,
   - Então o sistema redireciona ao BTG com state único e retorna somente após validar o callback.

2. **Segurança do consentimento**
   - Dado que o callback recebe um state inexistente, expirado ou já usado,
   - Quando tenta concluir a autorização,
   - Então o sistema rejeita a operação sem salvar tokens e registra o incidente técnico sem expor dados sensíveis.

3. **Seleção de conta**
   - Dado que a autorização foi concluída,
   - Quando há mais de uma conta disponível,
   - Então nenhuma emissão é liberada até um administrador selecionar explicitamente a conta recebedora.

4. **Validação antes de emitir**
   - Dado que um título não possui pagador, documento, valor, vencimento ou conta recebedora válidos,
   - Quando o operador tenta emitir,
   - Então o sistema bloqueia a solicitação e informa quais campos precisam ser corrigidos.

5. **Idempotência**
   - Dado que duas solicitações idênticas de emissão chegam para o mesmo título,
   - Quando a primeira já está processando ou emitida,
   - Então a segunda não cria outra cobrança e apresenta a tentativa existente.

6. **Sandbox**
   - Dado que o ambiente ativo é Sandbox,
   - Quando o operador executa o teste de contrato,
   - Então o sistema usa somente as credenciais e URLs Sandbox, registra a resposta simulada e não altera o status financeiro do título para pago.

7. **Persistência de emissão**
   - Dado que o BTG retorna sucesso na criação,
   - Quando o sistema conclui a emissão,
   - Então armazena o identificador BTG, os dados de pagamento permitidos, o status e o histórico da tentativa.

8. **Webhook idempotente**
   - Dado que o BTG entrega novamente um evento já processado,
   - Quando o endpoint recebe a duplicidade,
   - Então o sistema reconhece o evento, não repete baixa nem conciliação e mantém o histórico de recebimento.

9. **Divergência financeira**
   - Dado que um evento de pagamento possui valor diferente do esperado,
   - Quando ocorre a conciliação,
   - Então a cobrança fica em revisão e nenhuma baixa automática é feita.

10. **Controle de acesso**
   - Dado que um usuário sem alçada financeira acessa o módulo,
   - Quando tenta visualizar segredos, selecionar conta, emitir, cancelar ou conciliar,
   - Então o sistema bloqueia a ação e registra a tentativa conforme a política de auditoria.

# Tarefas Técnicas

## Fase 0 — Decisões e homologação de escopo

- [ ] Definir o modelo de integração: First-Party ou Third-Party.
  - Aceite: decisão documentada com titularidade da conta, empresas autorizadas e responsabilidade operacional.
  - Verificar: validação com o gestor financeiro e com o BTG, se necessário.

- [ ] Definir o instrumento inicial de cobrança.
  - Aceite: um único instrumento aprovado, com campos obrigatórios e regras de negócio documentadas.
  - Verificar: revisão do fluxo de emissão e da experiência do usuário.

- [ ] Obter a documentação contratual atualizada dos endpoints e schemas necessários.
  - Aceite: contratos de OAuth, contas, chaves Pix, criação, consulta, cancelamento e webhook anexados à especificação técnica.
  - Verificar: revisão de API com exemplos Sandbox e Produção.

## Banco de dados

- [ ] Criar as entidades de integração, tokens cifrados, states OAuth, contas, cobranças, tentativas, eventos, conciliações e auditoria.
  - Aceite: migrations reversíveis, índices de idempotência e segregação por ambiente.
  - Verificar: testes de migration e restrições únicas.

- [ ] Implementar política de redaction, cifragem e retenção de dados sensíveis.
  - Aceite: token, segredo e chave Pix não aparecem em texto puro fora do cofre ou da camada criptográfica.
  - Verificar: testes de serialização, logs e permissões.

## Back-end

- [ ] Implementar adaptador OAuth Authorization Code.
  - Aceite: gera state único, valida callback, troca código, cifra tokens e renova acesso.
  - Verificar: testes unitários de state, token, expiração, falha e renovação.

- [ ] Implementar cliente de contas e chave Pix.
  - Aceite: consulta e normaliza empresas, contas e chaves autorizadas.
  - Verificar: testes com fixtures oficiais Sandbox.

- [ ] Implementar adaptador de emissão do instrumento aprovado.
  - Aceite: converte valores, valida campos, aplica idempotência, registra tentativa e normaliza resposta.
  - Verificar: testes unitários de payload, testes de contrato Sandbox e bloqueio de duplicidade.

- [ ] Implementar consulta, cancelamento e conciliação.
  - Aceite: status externo não baixa automaticamente sem regra de conciliação aprovada.
  - Verificar: testes de transição de estado, falhas e divergência de valor.

- [ ] Implementar endpoint e fila de webhook.
  - Aceite: valida evento, persiste antes de processar, suporta reenvio e não duplica efeitos financeiros.
  - Verificar: testes de assinatura, duplicidade, reprocessamento e eventos fora de ordem.

- [ ] Implementar jobs de renovação, conciliação e alerta.
  - Aceite: jobs são observáveis, idempotentes e têm limites de retentativa.
  - Verificar: testes com relógio controlado e cenários de indisponibilidade.

## Front-end

- [ ] Criar telas de configuração, autorização e seleção de conta.
  - Aceite: nenhum segredo é exibido; estados de conexão são claros e acessíveis.
  - Verificar: testes de interface e revisão de permissões.

- [ ] Criar revisão de emissão e detalhe de cobrança.
  - Aceite: usuário vê validações antes de confirmar e não consegue duplicar emissão por clique repetido.
  - Verificar: teste de interação e cenário de falha de rede.

- [ ] Criar central de exceções e histórico.
  - Aceite: divergências têm responsável, justificativa e trilha de resolução.
  - Verificar: teste de fluxo de revisão manual.

## Testes

- [ ] Cobrir unitariamente criptografia, expiração, normalização, payloads, idempotência e transições de status.
- [ ] Criar testes de integração contra fixtures e Sandbox, marcados como execução manual/opt-in.
- [ ] Criar testes end-to-end dos fluxos administrativos sem usar credenciais reais na suíte automática.
- [ ] Criar testes de segurança de autorização, escopo organizacional, dados sensíveis e webhook.
- [ ] Executar teste de recuperação após indisponibilidade do BTG, callback interrompido e webhook duplicado.

## Documentação

- [ ] Documentar variáveis de ambiente, cofre de segredos e rotação de chaves.
- [ ] Documentar cadastro de callback, escopos, homologação e ativação de Produção.
- [ ] Criar runbook de incidentes: token expirado, webhook indisponível, emissão pendente, divergência e cancelamento.
- [ ] Criar guia operacional para emissão, exceções e conciliação.

# Riscos e Dependências

| Risco ou dependência | Impacto | Mitigação |
|---|---|---|
| Modelo First-Party/Third-Party indefinido | Pode invalidar autorização, titularidade e arquitetura de tokens | Decidir antes da especificação técnica |
| Instrumento inicial indefinido | Multiplica payloads, telas e cenários de teste | Entregar um único instrumento na primeira fase |
| Contratos de endpoint não validados | Risco de payload incompatível | Usar somente a referência oficial vigente e fixtures de contrato |
| Homologação de Produção do BTG | Pode atrasar a ativação real | Iniciar Sandbox cedo e preparar documentação de homologação em paralelo |
| Tokens e segredos expostos | Risco crítico de segurança e fraude | Cofre de segredos, cifragem, redaction e revisão de logs |
| Emissão duplicada | Risco financeiro e operacional | Chave de idempotência, bloqueio por título e auditoria |
| Webhook perdido ou duplicado | Baixa incorreta ou títulos pendentes | Persistência antes do processamento, deduplicação e conciliação programada |
| Divergência de pagamento | Risco de baixa financeira incorreta | Fila de exceções e aprovação humana |
| Sandbox não simula a liquidação real | Falsa sensação de cobertura | Homologação controlada em Produção antes da liberação geral |

# Pendências para Validação

1. Qual será o modelo de integração aprovado: First-Party ou Third-Party?
2. Qual instrumento será lançado primeiro: boleto simples, BolePix, Pix com vencimento, Pix imediato ou Link de Pagamento?
3. A conta recebedora será única ou haverá uma conta por empresa/unidade de negócio?
4. Quem terá alçada para emitir, cancelar e conciliar manualmente?
5. A baixa automática será permitida para pagamentos integrais? Como tratar parcial, a maior e a menor?
6. Qual prazo de vencimento, prazo após vencimento, juros, multa, desconto e regras de cancelamento devem ser aplicados?
7. Há necessidade de enviar cobrança por e-mail, SMS, WhatsApp ou somente exibir os dados de pagamento?
8. Qual política de retenção deve ser aplicada aos eventos de webhook e aos dados pessoais do pagador?
9. Quem será responsável por concluir a homologação do aplicativo em Produção com o BTG?
10. Qual ambiente seguro será usado para armazenar Client Secret, tokens e chaves de criptografia?

# Próximos Passos

1. Aprovar ou ajustar o mapa de capacidades e o escopo inicial.
2. Responder às pendências de negócio, principalmente modelo de integração e instrumento inicial.
3. Obter os contratos oficiais de API necessários para o instrumento aprovado.
4. Converter este plano em uma especificação técnica do módulo `btg-configuracao`.
5. Implementar e homologar cada módulo na ordem de dependência definida, sem ativar Produção antes do aceite dos cenários Sandbox, segurança e conciliação.
