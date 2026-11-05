# Resumo da Demanda

**Status: aprovada em 05/11/2026 às 17:42; implementada e validada no desenvolvimento; não aplicada na VPS.**

Permitir cadastrar a conta recebedora do escritório manualmente em Produção quando a consulta Accounts não estiver disponível no aplicativo BTG. Não basta habilitar o botão: cadastro, vínculo e pré-requisitos de emissão precisam reconhecer a nova origem sem converter contas de Sandbox em contas reais.

Premissas propostas: integração First-Party do escritório; a conta informada deve pertencer ao CNPJ configurado; cadastro administrativo confirmado; nenhum envio bancário ou deploy nesta etapa. A ausência de Accounts não elimina a necessidade de autorização Collections pelo banco.

Contratos de implementação: acrescentar `confirmadoPorId` (int nullable) e `confirmadoEm` (timestamp nullable) à conta; nova mutation administrativa `cadastrarContaManualProducao` com campos do cadastro, `dadosConferidos: true` e confirmação literal acima. Opção de servidor `BTG_ACCOUNTS_ENABLED=false` dispensa Accounts no próximo consentimento e bloqueia consulta oficial com mensagem clara; ausente ou true preserva comportamento atual. Status OAuth publica somente `consultaContasHabilitada`, sem segredos. Não modificar configuração efetiva do Sandbox desta sessão.

# Classificação

Evolução da integração financeira e alteração de regra de negócio. Prioridade alta; complexidade média. Exceção à regra anteriormente aprovada em `SPEC-gate-2-btg-producao.md`, que exigia conta obtida pela API. O cadastro manual Sandbox continua isolado conforme sua especificação original.

# Problema Atual

A UI e o backend recusam cadastro manual em Produção. A liberação de emissão exige uma conta com origem `api` vinculada a condomínio. O usuário informou dificuldade para habilitar o escopo de consulta da conta, embora tenha concluído a conexão OAuth de Produção após ajustar Client ID/Secret. Não há evidência nesta sessão de uma cobrança real emitida.

# Solução Proposta

Criar uma origem distinta `manual_producao`, com agência e conta digitadas, nome/CNPJ do titular e confirmação explícita do administrador. Exibir “Manual — Produção / confirmada pelo administrador”, nunca “validada pela API BTG”. O banco poderá recusar a conta na primeira emissão; cadastro local não comprova titularidade nem garante habilitação bancária.

A API Collections recebe conta por `account.branch` e `account.number`; o identificador local da conta manual não é enviado como accountId oficial. A autorização de emissão permanece Collections. A consulta Accounts torna-se opcional para este caminho, inclusive na configuração dos escopos OAuth, sem substituir Accounts por Open Finance nem modificar silenciosamente o token conectado.

# Escopo

Cadastro manual administrativo em Produção; validações de dados e CNPJ do escritório; auditoria e confirmação; vínculo explícito por condomínio; elegibilidade revisada para esta origem; atualização dos rótulos antigos que afirmam indiscriminadamente que Produção está bloqueada; configuração explícita da opção de consultar contas no OAuth quando esse produto não estiver habilitado.

# Fora do Escopo

Envio real, liberação automática de emissão, cadastro de contas de terceiros, troca de credenciais/tokens existentes, inferência de accountId bancário, alteração de CNAB, acordos, valores, prazos ou baixa financeira. Não implantar a Central Jurídica na VPS como consequência desta mudança bancária.

# Módulos Impactados

Configuração BTG, OAuth, contas recebedoras, vínculo condomínio–conta, pré-condições de emissão por acordo/remessa, auditoria, schema/migração aditiva e testes. Stack existente: React/TypeScript, tRPC, Drizzle/MySQL e Vitest; sem dependências novas.

# Regras de Negócio

1. Somente administrador e integração de Produção com OAuth conectado podem cadastrar esta origem.
2. Agência/conta obrigatórias, somente dígitos e preservação de zeros à esquerda. Não corrigir ou acrescentar dígitos automaticamente; copiar conforme contrato bancário.
3. Nome do titular e CNPJ obrigatórios. CNPJ validado e idêntico ao `BTG_COMPANY_ID` da integração atual. Isto verifica consistência local, não titularidade bancária.
4. Exigir confirmação literal `CADASTRAR CONTA PRODUCAO` e declaração de conferência dos dados na fonte bancária do escritório.
5. Origem `manual_sandbox` nunca elegível para Produção. Contas existentes não são promovidas ou reclassificadas automaticamente.
6. Registrar usuário/data da confirmação e preservar eventos de alteração. Emissão deve revalidar ambiente, origem e titular; mudança do CNPJ configurado invalida elegibilidade de conta antiga.
7. Não sobrescrever dados bancários de registros já usados em emissão; cadastrar outra conta e alterar explicitamente o vínculo futuro. Identificador interno determinístico por ambiente/CNPJ/agência/conta, distinto dos IDs oficiais.
8. Cadastro não muda `emissaoHabilitada`. Liberação continua exigindo confirmação `LIBERAR PRODUCAO`, conta elegível vinculada, OAuth e webhook configurado, além da homologação operacional.
9. A emissão mantém acordo ativo, parcela elegível, idempotência/reserva, exclusão mútua com CNAB e registro do resultado original BTG.
10. Consulta oficial continua disponível se autorizada; não reconciliar automaticamente uma conta manual com uma oficial nem marcar confirmação manual como validação API.
11. Não remover ou adicionar escopos de uma sessão silenciosamente. Configurar explicitamente o modo sem Accounts quando necessário; reconexão OAuth somente pelo usuário. Sempre manter `openid` e Collections no fluxo de emissão.

# Fluxo da Funcionalidade

Admin conecta BTG de Produção → cadastra conta com confirmação → vínculo explícito ao condomínio → verifica webhook/homologação → liberação separada → seleção de parcelas de acordo e remessa → revisão humana e envio. Esta implementação não executa os passos de envio, pagamento ou liberação.

# Telas e Experiência do Usuário

Tela BTG — Integração e emissão, aba Contas e condomínios: habilitar cadastro manual conforme ambiente/conexão. Diálogo de Produção distinto do Sandbox, campos obrigatórios, resumo mascarado, declaração de responsabilidade e confirmação textual. Estado vazio e erros não retêm sucesso aparente. Não desabilitar validações no frontend para contornar o backend.

Mensagens: “Conta manual registrada em Produção; cadastro não validado pela API BTG”, “O CNPJ da conta deve ser o do escritório titular da integração” e “OAuth/webhook/liberação de emissão continuam obrigatórios”. Botão de consulta deve explicar a necessidade do acesso Accounts se esse recurso estiver desativado. Rótulos de produção e emissão refletem o estado real, sem textos de homologação Sandbox aplicados a todas as contas.

# Dados e Banco de Dados

Preservar `api` e `manual_sandbox` e acrescentar `manual_producao` ao enum de origem. Acrescentar campos nullable para confirmação administrativa (ator/data), sem preencher retroativamente ou alterar contas legadas. Identificador local não representa accountId do BTG. Migração aditiva revisada, sem DROP/DELETE ou conversão de origens. Aplicação na VPS exige roteiro específico com backup e revisão; não executar migrations gerais que tragam a Central Jurídica.

# Permissões

APIs administrativas existentes permanecem restritas a admin. Vínculos e emissão continuam limitados à integração/ambiente e ao condomínio da parcela. Não conceder perfil, papel, carteira ou acesso adicional a usuários.

# Integrações e Automações

Cadastro somente local, sem request bancário. Emissão continua no endpoint oficial Collections e pode ser recusada pelo banco. Nenhuma automação nova. Webhook permanece requisito independente; não cadastrar um segredo arbitrário para satisfazer o gate sem alinhar a assinatura realmente fornecida pelo BTG.

# Histórico e Auditoria

Registrar origem, ambiente, ator, data, declaração/confirmacão, conta interna e dados mascarados. Nunca registrar tokens, Secret ou chave de criptografia. Mudança de vínculo não altera títulos emitidos anteriormente nem seus beneficiários. Falhas/recusas bancárias preservam evidência e não geram retry cego.

# Critérios de Aceite

- Dado admin conectado em Produção, quando cadastra dados válidos e confirma, então registra origem manual_producao e confirmação auditável sem request ao banco nem ativação automática.
- Dado não-admin, falta de consentimento, CNPJ divergente, confirmação ausente ou dados inválidos, quando solicita cadastro, então recusa sem efeito parcial.
- Dada conta Sandbox, quando tenta utilizá-la em Produção, então bloqueia antes da emissão.
- Dada conta manual de Produção confirmada e vinculada, quando administrador solicita liberação sem webhook/OAuth, então mantém bloqueada.
- Dada emissão autorizada por outro ato, quando usa conta manual, então envia apenas branch/number corretos, mantém idempotência e conserva recusa do banco sem classificar como sucesso.
- Dado modo sem consulta Accounts explicitamente configurado, quando inicia OAuth, então solicita openid/Collections; consultar contas exige modo/autorização apropriados e mensagem clara.
- Dadas contas e emissões legadas, quando a migração é aplicada, então nenhuma origem, valor, vínculo ou token existente é alterado.

# Tarefas Técnicas

História: como administrador do escritório, quero informar minha conta BTG real manualmente para emitir parcelas de acordos sem depender do produto de consulta Accounts, conservando identificação, controle e responsabilidade auditáveis.

1. Aprovar esta exceção e seus critérios antes da implementação.
2. Backend/banco: schema/migration aditivos, validação de cadastro, confirmação auditável, guardas de liberação e emissão. Revisar transações e identificação local.
3. OAuth: opção explícita para modo sem Accounts, preservando compatibilidade e consentimento já existente; não editar Secrets nesta entrega.
4. Frontend: diálogo por ambiente, indicação da origem, estado real de produção/emissão, erros e invalidação dos caches.
5. Testes: novos cenários de produção, rejeições, legado, isolamento Sandbox/Produção, duplicidade/CNAB, conta/CNPJ alterados, escopos opcionais e chamadas bancárias ausentes no cadastro.
6. Verificar `pnpm exec vitest run --no-file-parallelism --reporter=default`, `pnpm check`, `pnpm build` e diff. Salvar checkpoint de desenvolvimento.
7. Documentar migração específica BTG/VPS e piloto; deployment separado e controlado, sem importar inadvertidamente a evolução Jurídica.

# Riscos e Dependências

Dados digitados incorretos podem impedir emissão ou indicar beneficiário errado. OAuth/CNPJ e declaração humana reduzem inconsistências locais, mas não comprovam titularidade. Necessária conferência no banco e teste controlado posterior com revisão do beneficiário retornado antes de entregar boleto. Não prometer aceitação bancária com base no cadastro local.

A VPS está na versão anterior à Central Jurídica; preparar entrega seletiva da evolução BTG se o usuário solicitar implantação. Webhook de produção ainda não comprovado nesta conversa e continua pendente. A documentação de Accounts tem nomenclaturas diferentes de escopo; isso não é resolvido substituindo automaticamente pelo de Open Finance.

# Pendências para Validação

Aprovação recebida. Desenvolvimento: 856 testes aprovados, um teste externo BTG opt-in ignorado; TypeScript/build aprovados. Formulário real inspecionado com dados fictícios e callback somente local: confirmação bloqueada antes da declaração/texto literal e habilitada depois, sem API/banco. SQL 0099 aplicado somente no desenvolvimento. Cadastro/vínculo/emissão testados com fixtures isoladas, não substituem homologação externa.

Permanecem: acesso ao aplicativo Collections de Produção, conferência dos dados reais pelo administrador, configuração e homologação do webhook, aprovação operacional do release seletivo e revisão da primeira cobrança. Não pedir dados bancários/segredos no chat para implementar.

# Próximos Passos

Concluir o checkpoint e a evidência do pacote BTG seletivo conforme `tasks/plan-btg-conta-manual-producao.md`; seguir `docs/btg-conta-manual-producao-operacao.md` em etapa posterior autorizada. Especificações anteriores atualizadas com a exceção aprovada. Não emitir nem fazer deploy até a etapa operacional específica.

## Referências

[1]: https://developers.empresas.btgpactual.com/docs/api-specs-target/Banking%20-%20Collections/criar-cobranca "Criar Cobrança — conta por agência/número e autorização Collections"
[2]: https://developers.empresas.btgpactual.com/docs/tecspecs/Banking%20-%20Collections-spec "Ficha técnica Collections — escopos e eventos"

Contrato bancário conferido nas fontes [1] e [2] em 05/11/2026. A possibilidade de digitar dados no Luminus é uma regra interna proposta; não representa aprovação ou verificação prévia pelo BTG.
