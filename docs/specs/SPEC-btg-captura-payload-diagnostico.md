# Resumo da Demanda

Capturar o corpo JSON exato transmitido no POST BolePix e o retorno recebido, vinculados à tentativa canônica, para diagnosticar erros de validação sem testar cobranças por tentativa e erro. Solicitação do usuário em 06/11/2026 às17:46:22. Estado: proposta para aprovação; nenhum código, DDL, dado financeiro ou envio alterado nesta etapa.

# Classificação

Melhoria corretiva de diagnóstico financeiro/integração, prioridade alta, complexidade média. É uma única capacidade: evidência protegida de uma tentativa HTTP BTG.

# Problema Atual

A VPS73cdeb56 recebeu400 em remessa2/acordo6/parcela20/R$18,52. O item está sem btgCobrancaEmitidaId e a auditoria138 sem diagnosticosHttp. O código vincula a emissão ao item apenas no sucesso; ID nulo no item não prova ausência da emissão canônica. O emissor reserva antes do POST e mantém estado incerto após falha. A resposta bruta é descartada e o catálogo estrito devolve mensagem genérica quando campos/razões não são reconhecidos. Não é possível recuperar retrospectivamente o corpo descartado da remessa1 ou2. Reconstituir a partir do cadastro atual não seria prova do JSON exato enviado.

# Solução Proposta

Persistir uma evidência criptografada com o JSON serializado uma única vez e utilizar essa mesma string como body do fetch. Salvar HTTP status e corpo da resposta, inclusive erro, com limite explícito. Guardar datas UTC, IDs locais e correlação. Não salvar headers, Authorization, access/refresh token, Client Secret, segredo de webhook ou conteúdo do .env. A captura não altera a requisição financeira nem habilita nova revisão, retry, fallback CNAB ou recuperação de reservas.

# Escopo

Todas as novas tentativas de POST BolePix v2, tanto pelo acordo quanto pela remessa, depois de implantação autorizada. Captura antes do envio, retorno de sucesso/erro e falha de transporte identificada sem inventar resposta. Consulta administrativa por emissão/remessa. Correção da ligação local do diagnóstico ao resultado de falha e sua auditoria, sem reclassificar emissões antigas.

# Fora do Escopo

Reenvio, cancelamento ou liberação de emissões1/2; alteração de valores, vencimentos, contas, documentos do pagador, externalId ou chave idempotente; leitura de conta Accounts; nova integração; mudanças OAuth/webhook/CNAB; logs públicos; exportação automática; automações de cobrança ou expurgo agendado; reconstrução de corpos antigos; captura de respostas OAuth.

# Módulos Impactados

Backend BTG cliente/emissão/remessas e router administrativo; schema Drizzle aditivo; painel de detalhe da remessa; auditoria; testes. Stack existente TypeScript/React/tRPC/Drizzle/MySQL/Node crypto, sem dependências novas.

# Regras de Negócio

O registro deve existir antes do POST: se sua gravação falhar, não enviar. Gravação inicial não significa que o banco recebeu o pedido. Estados distinguirão preparado, envio iniciado, resposta recebida e transporte sem confirmação. O registro canônico e a exclusividade de canal continuam intactos. Se o POST ocorreu e persistir o retorno falhar, manter a emissão incerta, preservar a evidência inicial e não repetir o POST. Não usar captura de diagnóstico como prova de cobrança emitida; status e Collection ID do banco continuam necessários.

Proposta de retenção: acesso ao conteúdo por30dias. Depois disso, expurgo manual administrativo dos corpos criptografados, com confirmação e auditoria, preservando IDs, hashes, status HTTP e metadados de histórico. Não implementar timer nem eliminação automática nesta etapa. Backups podem preservar versões anteriores e devem seguir a política de proteção/expurgo do escritório; não alegar exclusão física universal. Retenção e expurgo precisam de aprovação antes de habilitar a captura em Produção.

# Fluxo da Funcionalidade

1. Reservar a emissão pelos guards atuais e preparar o payload sem modificá-lo para diagnóstico.
2. Serializar uma única vez, calcular SHA256, cifrar e persistir evidência associada à emissão/parcela/remessa e ator.
3. Marcar início da tentativa; enviar exatamente a string capturada com os headers existentes, sem salvar esses headers.
4. Ler a resposta uma única vez com limites de bytes/prazo. Cifrar o corpo de resposta antes de parse/normalização; o cliente consome a mesma leitura. Não exigir um segundo request para obter diagnóstico.
5. Conservar o diagnóstico sanitizado para lista/toast/auditoria. Disponibilizar conteúdo completo somente por ação administrativa explícita e auditada.

# Telas e Experiência do Usuário

No detalhe de remessa, mostrar status HTTP, ID da evidência e aviso de dados pessoais. Ação “Ver diagnóstico técnico” com confirmação de finalidade: mostra o JSON de envio e a resposta como texto inerte, nunca HTML executável. Não colocar corpo inteiro em lista, toast, query de polling, localStorage, URLs públicas ou console. Abrir por ação individual com cache curto/descarte ao fechar. Estados: sem captura histórica, gravação incompleta, resposta ausente, resposta limitada, chave indisponível ou conteúdo expirado. Download plaintext somente se solicitado e aprovado separadamente; esta proposta contempla visualização administrativa no sistema, não publicação do arquivo.

# Dados e Banco de Dados

Nova tabela proposta btgHttpDiagnosticos, sem backfill e sem alteração dos montantes ou estados financeiros históricos. Metadados: ID, btgIntegracaoId, btgCobrancaEmitidaId, btgRemessaId nullable, parcelaAcordoId, condominioId, usuarioId, operacao, estadoCaptura, httpStatus nullable, correlationId enviado, payloadSha256, respostaSha256 nullable, versaoCriptografia, capturaCriadaEm, respostaRecebidaEm nullable, conteudoExpurgadoEm nullable e sinal de limite/erro de gravação. Corpos em texto cifrado, tamanho limitado (payload64KiB, resposta64KiB). Ao superar limite da resposta, não representar prefixo como retorno completo; guardar bytes limitados cifrados e sinalizar truncamento. Nunca truncar o payload que será enviado; se exceder o limite, bloquear antes do POST.

Criptografia AES256GCM com IV aleatório e autenticação. Usar chave derivada via HKDF da BTG_TOKEN_ENCRYPTION_KEY existente com domínio separado btg-diagnostico-v1; não exibir nem rotacionar essa chave. AAD vincula ambiente/integração/emissão/ID de captura. Ciphertext não pode ser trocado entre registros sem falha de autenticação. Não usar o criptograma de token como envelope de diagnóstico. Perda/troca da chave torna conteúdos inacessíveis; documentar backup protegido da chave existente.

# Permissões

Somente administrador ativo autenticado para consultar/descriptografar. As rotas verificam o registro e o contexto de condomínio; não criar concessões RBAC automáticas. Auditoria estrita antes de devolver plaintext: se registrar acesso falhar, negar a leitura. Nenhum acesso a advogados, colaboradores, síndicos, cobradores ou pessoas não autenticadas por ID ou listagem. Conteúdo bancário de resposta é dado não confiável, inclusive quando cifrado: renderizar como texto, não seguir links/instruções nem executar HTML.

# Integrações e Automações

Mesma API Collections, payload e número de POSTs preservados. Sem nova autenticação, endpoints bancários, scopes ou jobs. A futura implantação na VPS é uma etapa separada com backup e migração seletiva revisada; não executar migrations gerais.

# Histórico e Auditoria

Registrar captura, leitura e expurgo com IDs técnicos, ator/data e finalidade, sem plaintext ou segredo em metadata/errorMessage. Relacionar falha por remessa à emissão realmente reservada, sem inferir ID por contador nem limpar reserva. Histórico financeiro permanece imutável e separado da retenção do corpo de diagnóstico.

# Critérios de Aceite

- Dado um payload preparado, quando emitir, então body enviado e conteúdo decifrado são byte a byte iguais, inclusive caracteres/zeros à esquerda; nenhum truncamento ou segunda serialização divergente.
- Dado sucesso ou400 com campos desconhecidos, quando receber a resposta, então guardar o corpo recebido cifrado e identificável, sem exigir nomes/frases do catálogo para persistir a evidência.
- Dado falha de gravação antes do POST, então nenhum envio; dado falha depois do envio, então nenhuma repetição nem liberação da canônica.
- Dado envio por acordo ou remessa, então o mesmo mecanismo captura diagnóstico e vincula IDs, sem duplicidade de POST.
- Dado ator sem autorização ou auditoria de leitura falha, então não devolver plaintext.
- Dado banco de testes, então nenhuma substring do CPF/endereço/token/segredo aparece em ciphertext, auditoria, logs ou erros. Headers de autenticação nunca participam da evidência.
- Dado corpo acima do limite ou resposta incompleta, então informar estado limitado/ausente sem declarar captura completa.
- Dado registro anterior à implantação, então mostrar “Sem captura histórica”, sem reconstruir ou reenviar automaticamente.
- Dado chave/AAD alterados, então negar decifragem com erro genérico sem dump de conteúdo.
- Dado consulta/visualização de diagnóstico, então não marcar parcela paga, emissão emitida, revisada ou cancelada.

# Tarefas Técnicas

Após aprovação: schema/crypto/captura e testes; integrar cliente/emissão/remessa mantendo uma leitura e uma requisição; APIs administrativas auditadas; interface textual; provisionador seletivo e manual; testes completos e checkpoint. Caminhos previstos server/btg-v2/diagnosticos*.ts, server/routers/btg-diagnosticos.ts, server/*.test.ts, componente de diagnóstico BTG e drizzle/schema.ts/migração nova. Não alterar vendor/framework sem necessidade.

Comandos de validação: pnpm exec vitest run --no-file-parallelism --reporter=default; pnpm check; pnpm build; git diff --check. Testes com banco/fetch/crypto fictícios, sem BTG real. Padrão de funções TypeScript nomeadas, erro sanitizado e tRPC para interface.

# Riscos e Dependências

Payload/retorno contêm dados pessoais e financeiros: cifrar em repouso não substitui controle de acesso, HTTPS e proteção de backups. Um admin autorizado visualizará conteúdo completo. A resposta pode ecoar campos sensíveis; não espalhá-la em logs/toasts. A validade da chave existente e a nova tabela são pré-condições; indisponibilidade pode bloquear novo POST para não perder evidência. Conteúdo exato revela o pedido, mas não garante que o banco informará causa detalhada. Testes em memória não equivalem a transações InnoDB reais.

# Pendências para Validação

Aprovar nova captura cifrada, visualização administrativa, retenção30dias/expurgo manual e DDL aditiva no desenvolvimento. Nenhum novo deploy ou envio real está autorizado por esta proposta. Consultar diretamente a canônica da parcela20 permanece pendente, pois join anterior por item nulo não a localizou; isso não depende de nova emissão.

# Próximos Passos

Revisar a proposta com o usuário. Depois de aprovada, gerar o plano e implementar no desenvolvimento. Implantação na VPS e qualquer emissão real continuam sujeitas a etapas separadas.
