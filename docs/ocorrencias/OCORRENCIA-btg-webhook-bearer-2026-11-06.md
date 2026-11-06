# Resumo da Ocorrência

Em 06/11/2026, após cadastrar a conta manual na VPS, o administrador tentou liberar emissão BTG em Produção e recebeu: “Configure o segredo HMAC do webhook BTG antes de liberar emissões de Produção.” A versão de referência é `ce005f48`. A mensagem impede a liberação; esse bloqueio não constitui envio de cobrança. O relato não demonstra cobrança emitida ou duplicada.

# Classificação e Prioridade

Falha de integração e autenticação de webhook, prioridade alta. Afeta a liberação de emissão e o recebimento seguro de notificações financeiras. Não é somente um ajuste visual ou uma variável ausente.

# Módulo Impactado

BTG v2: liberação administrativa em `server/routers/btg-v2.ts`, autenticação e processamento em `server/btg-v2/webhook.ts`, documentação de Produção e testes de webhook. Conta manual, Central Jurídica, OAuth e valores de acordos não fazem parte da correção proposta.

# Comportamento Atual

A liberação exige `BTG_WEBHOOK_SECRET` não vazio e apresenta o requisito como segredo HMAC. O receptor aceita assinatura SHA-256 hexadecimal em `x-btg-signature` ou `x-signature`, calculada sobre o corpo bruto. Não autentica a mensagem pelo cabeçalho `Authorization: Bearer`.

# Comportamento Esperado

Autenticar notificações conforme o contrato oficial BTG consultado em 06/11/2026: `Authorization: Bearer <webhook secret>`, por HTTPS. O segredo local precisa corresponder ao do webhook configurado no aplicativo BTG. A existência da variável sozinha não comprova cadastro ou entrega do webhook. A documentação também exige consentimento no escopo do produto para receber seus eventos. [1]

# Como Reproduzir

Com servidor em Produção, OAuth conectado e conta cadastrada, tentar liberar emissão sem `BTG_WEBHOOK_SECRET` definido no processo. O router recusa a operação. Mesmo que se preencha um valor arbitrário, um webhook no formato Bearer documentado continua sendo recusado pelo receptor atual, pois ele exige HMAC.

# Diagnóstico Inicial

O print confirma a mensagem do requisito local ausente. A inspeção do código confirma uma incompatibilidade adicional: o padrão de autenticação implementado não é o documentado pelo BTG. Não foram lidas credenciais, tokens ou configurações reais da VPS nesta análise.

# Causa Provável

A implementação adotou um mecanismo genérico de assinatura HMAC em vez do mecanismo Bearer descrito na documentação BTG. O requisito de autenticar notificações deve permanecer, mas a forma de validação e sua mensagem precisam corresponder ao banco. A documentação de configuração existente também precisa ser corrigida. [1]

# Impactos Identificados

Sem correção, a liberação fica bloqueada ou o receptor recusa notificações legítimas, prejudicando a baixa automática. Remover a autenticação ou preencher uma chave sem correspondência bancária pode criar uma falsa sensação de prontidão. Autenticação não dispensa checagem de ambiente, integração, coleção e valor, nem processamento idempotente e seguro.

# Correção Proposta

Substituir a exigência de HMAC pela validação estrita de Bearer com comparação segura e segredo não vazio. Manter `BTG_WEBHOOK_SECRET` como variável protegida, agora corretamente descrita como segredo do webhook, sem confundi-la com Client Secret, access token OAuth ou chave de criptografia. Não aceitar assinatura HMAC como alternativa para contornar Bearer inválido.

Atualizar a mensagem de liberação e as instruções do portal/VPS. Usar a rota existente `POST https://luminus.gomesesilvaadv.com.br/api/webhooks/btg/v2/producao`. O cadastro do callback e o segredo efetivo dependem de conferência pelo administrador no aplicativo BTG; não solicitar o valor pelo chat.

# Regra Atual e Regra Corrigida

Atual: segredo local obrigatório, referido como HMAC, com receptor baseado em assinatura hexadecimal. Proposta: segredo local obrigatório correspondente ao webhook BTG, validado por Bearer; ausência, divergência ou cabeçalho inválido recusam a entrega sem alteração financeira. Nenhuma liberação ou emissão automática é autorizada por esta proposta.

# Alterações Técnicas Necessárias

Backend: ajustar autenticação do receptor e mensagem do requisito de Produção. Revisar o envelope documentado (`webhookId`, `event`, `data`) e o uso de identificadores de entrega sem confundir o ID da inscrição com o ID de um evento. A ficha técnica descreve eventos `collections.created`, `collections.paid`, `collections.expired` e cancelamento, com `collectionId` no objeto `data`. [1] [2]

Testes: autenticação e processamento com dependências simuladas, inclusive falha/reentrega. Frontend: alterar texto explicativo somente se necessário; não remover controles administrativos. Banco: nenhuma migração prevista para a troca do mecanismo de autenticação; qualquer necessidade adicional exige revisão prévia. Nenhuma dependência nova prevista.

# Correção de Dados Existentes

Não alterar cobranças, acordos, parcelas, beneficiários, valores ou registros de conta. Não apagar tokens nem histórico de entregas. Se existirem notificações reais recusadas, reprocessar somente depois da correção e de conferir o estado bancário; não presumir que existam entregas recusadas neste caso.

# Histórico e Auditoria

Preservar metadados de entrega e processamento sem gravar segredo ou cabeçalho Authorization. Diferenciar autenticação válida de assinatura criptográfica na documentação: Bearer não é HMAC. Manter os controles de liberação auditada. A presença do segredo não comprova homologação do webhook.

# Plano de Testes

Validar Bearer correto, ausente, inválido e malformado. Confirmar que HMAC isolado não habilita o processamento. Testar corpo inválido, evento desconhecido, ambiente incorreto, coleção alheia/inexistente e valor divergente sem baixa. Validar evento de pagamento com `amountPaid`, repetição sem baixa duplicada e reentrega após falha sem perda do processamento. Testar que a liberação continua negada sem segredo, OAuth ou conta elegível. [1] [2]

Executar testes específicos, suíte completa serial, `pnpm check` e `pnpm build`. O teste real de cadastro e entrega no BTG não é substituído por testes sintéticos.

# Plano de Reversão

Antes de nova atualização na VPS, preservar backup de código/configuração. Se houver falha crítica, interromper a liberação/emissão e revisar logs protegidos. Não restaurar banco antigo sobre novas transações, não apagar entregas e não retornar a HMAC como se fosse compatível com Bearer. Código anterior pode ser restaurado operacionalmente, mas mantém a incompatibilidade e não deve ser utilizado para homologar o webhook.

# Critérios de Aceite

Mensagem e receptor correspondem ao padrão oficial; segredo inválido nunca altera dados; segredo não é exposto; controles de escopo/valor permanecem; reentrega não causa duplicidade ou perda de processamento. A emissão só é liberada conscientemente pelo administrador após configuração e validação do callback. Testes e compilação aprovados antes de propor a atualização pelo GitHub.

# Riscos e Dependências

Dependência do cadastro efetivo de webhook no aplicativo de Produção e do consentimento Collections. A documentação consultada usa Bearer e não fundamenta o mecanismo HMAC atual. Se o portal apresentar outro contrato para esse aplicativo, confrontar suas instruções antes de implementar um modo adicional. Nenhuma chave deve ser gerada apenas para contornar o bloqueio. [1]

# Pendências para Validação

A correção e os testes foram aprovados pelo usuário em 06/11/2026 às 14:05:14. A implementação no desenvolvimento passou em 191 testes específicos: 114 do handler com banco simulado, 18 de autenticação/estado/valor e 59 de liberação administrativa/interface. A validação inclui recusa de cabeçalhos duplicados/tipos/datas inválidos antes do banco, ausência de fallback HMAC, metadados protegidos, rollback da baixa e reentrega, não rebaixamento de entrega terminal, vínculo/valor integral e preservação de snapshots. Não houve conexão bancária ou escrita de dados reais nesses testes.

Conferência do cadastro do webhook no portal BTG, configuração protegida do segredo na VPS, homologação real de entrega e nova atualização controlada continuam pendentes. A conta cadastrada pelo usuário não foi consultada nem alterada. Teste simulado de transação/locks não equivale a teste de concorrência em MySQL real.

# Próximos Passos

A validação técnica final passou em 06/11/2026: 986 testes aprovados, um externo BTG opt-in ignorado, 80 suítes aprovadas e uma ignorada. TypeScript, build frontend/backend e `git diff --check` aprovados. O servidor local respondeu HTTP 200. Não há alteração de schema, migration ou dependência. O corpo bruto é preservado para hash/deduplicação; apenas o comentário do parser foi atualizado, sem alteração de rota/limite.

Salvar checkpoint e disponibilizar pelo GitHub. Depois orientar atualização manual da VPS e cadastro do webhook/segredo correspondente no BTG. Não emitir cobrança, desativar autenticação ou substituir credenciais como parte desta correção. A conclusão técnica não comprova homologação real da baixa nem ativa emissão.

## Referências

[1]: https://developers.empresas.btgpactual.com/docs/starting-doc/Integrando/Webhooks/utilize-webhooks-para-receber-atualiza%C3%A7%C3%B5es-sobre-produtos-conectados "BTG Empresas — Webhooks e autenticação por segredo Bearer"
[2]: https://developers.empresas.btgpactual.com/docs/tecspecs/Banking%20-%20Collections-spec "BTG Empresas — Ficha técnica Collections e eventos de webhook"
