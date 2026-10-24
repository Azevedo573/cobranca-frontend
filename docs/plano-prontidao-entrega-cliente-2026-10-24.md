# Plano de Prontidão Funcional para Entrega ao Cliente

## Resumo da Demanda

Suspender temporariamente a migração visual global e concentrar o desenvolvimento na entrega funcional segura do Sistema de Gestão de Cobranças. A referência visual aprovada continua válida para qualquer tela nova ou ajuste localizado, mas não é um requisito de bloqueio para o go-live.

## Classificação

Correção crítica de segurança, integridade financeira, jurídico e integrações; prioridade crítica e complexidade grande.

## Problema Atual

O código e a suíte atual passam em TypeScript e testes unitários, mas a auditoria de leitura identificou falhas comprovadas que impedem uma entrega operacional segura: acesso cross-tenant por identificadores, permissões aplicadas apenas na interface em fluxos importantes, segredos de integração expostos, baixa indevida de liquidação parcial CNAB, geração de remessa global com dados de cedente/sacado incorretos, login condominial que perde a identidade real, jobs jurídicos expostos e cálculo de prazo que chama dias corridos de dias úteis.

O `todo.md` histórico contém muitas tarefas já implementadas ou ultrapassadas; ele não será usado isoladamente como critério de pronto. A fonte de decisão será este plano, evidências de teste, checklist de homologação e critérios de aceite por fluxo.

## Solução Proposta

Executar o trabalho em cinco gates sequenciais. Nenhum gate altera a regra comercial sem especificação; ele corrige autorização, escopo, integridade e comunicação de limitações já existentes. Cada gate deve ter testes negativos, typecheck, suíte completa, build e homologação controlada antes do próximo.

## Escopo de Entrega Inicial Segura

A entrega inicial poderá incluir operação por condomínio, cadastro/importação, devedores, cobranças, acordos, boletos/CNAB por condomínio, jurídico com permissões e integrações autenticadas, desde que todos os gates obrigatórios abaixo estejam concluídos.

O BTG permanece rotulado e bloqueado como **Sandbox/homologação** até haver autorização expressa e homologação de Produção. Não deve ser prometida emissão BolePix real ao cliente nesta entrega.

## Fora do Escopo Imediato

- Migração visual global.
- BTG em Produção, webhook real e conciliação de Produção.
- Resolução financeira automática de exceções CNAB ou liquidações parciais.
- Alertas jurídicos consolidados, busca global e melhorias de produtividade.
- Refatoração ampla de rotas, schemas, front-end ou design system.

## Gate 0 — Definição de Escopo Comercial e Homologação

### Objetivo

Confirmar quais módulos serão habilitados para o primeiro cliente e impedir que funcionalidades parcialmente homologadas sejam apresentadas como produtivas.

### Ações

1. Confirmar se o cliente utilizará, no primeiro dia: cobrança, CNAB, jurídico, WhatsApp, e-mail, importação e login de condomínio.
2. Definir um ambiente de homologação com ao menos dois condomínios de teste, um administrador, um síndico, um colaborador e um advogado com perfil restrito.
3. Listar integrações reais disponíveis: banco/CNAB, Microsoft 365, Z-API, PJe/DOERJ, TJRJ, MNI e BTG.
4. Publicar limitações operacionais: BTG Sandbox, exceções CNAB manuais e integrações ainda sem credencial/homologação.

### Critério de aceite

Dado o escopo comercial aprovado, quando o checklist de release for iniciado, então cada módulo terá responsável, ambiente, credencial de homologação e status “habilitar”, “ocultar” ou “Sandbox”.

## Gate 1 — Segurança de Acesso e Isolamento por Condomínio (P0)

### Objetivo

Garantir que qualquer autorização seja aplicada pelo servidor e que uma sessão de um condomínio nunca leia ou altere dados de outro condomínio.

### Correções obrigatórias

1. Criar uma camada reutilizável de escopo por recurso no backend: devedor, cobrança, acordo, parcela, processo, prazo, demanda, publicação, arquivo e entidade de integração.
2. Para todo endpoint com ID, carregar o recurso, derivar o condomínio e validar contra `ctx.user.condominioId`; somente administradores globais terão exceção explícita e auditável.
3. Alinhar RBAC do servidor ao frontend: colaborador **e advogado** devem obedecer perfil, módulo e ação; síndico/cobrador devem obedecer escopo de condomínio.
4. Proteger relatórios, exportações e dashboards para impedir consulta consolidada indevida.
5. Corrigir o login de condomínio para restaurar o usuário real do token customizado, verificar conta ativa e validar condomínio ativo. Não converter toda sessão em um síndico compartilhado.
6. Testar acesso direto por tRPC com dois condomínios e todos os roles relevantes.

### Critérios de aceite

- Dado um síndico, cobrador, colaborador ou advogado do Condomínio A, quando informar o ID de um recurso do Condomínio B, então o servidor retorna `FORBIDDEN` ou `NOT_FOUND` sem revelar dados.
- Dado um advogado sem a permissão do módulo jurídico, quando chamar a procedure diretamente, então o servidor retorna `FORBIDDEN`.
- Dado dois usuários do mesmo condomínio, quando fizerem login condominial, então auditoria e sessão identificam o usuário verdadeiro, não uma identidade compartilhada.
- Dado um condomínio inativo ou arquivado, quando tentar login, então o acesso é negado.

## Gate 2 — Integridade Financeira e Documental (P0)

### Objetivo

Evitar baixa financeira indevida, arquivos bancários inconsistentes e documentos com dados incorretos.

### Correções obrigatórias

1. Suspender a baixa automática para retorno CNAB código `07` (liquidação parcial). Registrar exceção em revisão, manter saldo pendente e não concluir cobrança/acordo até regra de pagamento parcial ser aprovada.
2. Restringir remessa CNAB global a administrador financeiro até existir desenho homologado multi-cedente. Operação normal deve exigir e validar `condominioId`.
3. Na geração de CNAB, bloquear títulos de condomínios/beneficiários incompatíveis no mesmo arquivo e garantir beneficiário/sacado corretos por título.
4. Corrigir boleto PDF para usar endereço do devedor como sacado e endereço do condomínio/beneficiário como cedente.
5. Validar na criação e baixa de acordo que devedor, cobranças, parcelas e condomínio pertencem à mesma carteira; executar operações compostas em transação.
6. Definir data de competência dos dashboards de recuperação e corrigir filtros para usar data de pagamento, não data de criação da parcela.

### Critérios de aceite

- Dado um retorno CNAB parcial, quando for processado, então nenhuma cobrança, parcela ou acordo é quitado automaticamente.
- Dado títulos de condomínios distintos, quando forem selecionados para remessa, então o sistema impede arquivo misto não homologado.
- Dado um boleto, quando gerado, então sacado e beneficiário exibem endereços de fontes corretas.
- Dado falha no meio da criação/baixa de um acordo, quando a transação falhar, então não ficam parcelas, vínculos ou status parciais.

## Gate 3 — Proteção de Credenciais, Canais e Jobs (P0)

### Objetivo

Impedir exposição/alteração de segredos, abuso de canais de comunicação e injeção de publicações ou sincronizações jurídicas.

### Correções obrigatórias

1. Restringir WhatsApp, e-mail, MNI e suas configurações a permissão administrativa explícita no servidor; nunca confiar na visibilidade da tela.
2. Remover token/client token/senha de todos os DTOs de resposta; manter valores mascarados no frontend.
3. Criptografar segredos em repouso ou migrar para cofre de ambiente aprovado. A rotação deve manter segredo atual quando o formulário estiver em branco.
4. Corrigir a configuração de e-mail para não sobrescrever segredo com espaço/branco e para falhar visivelmente quando o envio real não estiver disponível.
5. Tratar falha de registro de webhook Z-API como erro/estado degradado, não sucesso.
6. Exigir autenticação verificável de scheduler (HMAC/token rotacionável) para endpoints PJe/DOERJ e impedir ingestão forjada.
7. Restringir MNI a administrador designado, não retornar senha, proibir WSDL arbitrário e limitar endpoints a HTTPS permitido.
8. Registrar autoria e resultado de alterações de configuração e ações de canal.

### Critérios de aceite

- Dado um usuário sem alçada administrativa, quando chamar configuração de WhatsApp, e-mail ou MNI, então recebe `FORBIDDEN` e não recebe segredo.
- Dado uma edição de e-mail sem novo segredo, quando salvar, então o segredo atual permanece válido.
- Dado falha no webhook WhatsApp, quando salvar instância, então a interface mostra status de falha e não “configurada”.
- Dada requisição de scheduler sem assinatura válida, quando chamar endpoint PJe/DOERJ, então recebe rejeição antes de consultar/gravar dados.

## Gate 4 — Segurança Jurídica, Prazos e Navegação (P0/P1)

### Objetivo

Permitir que o módulo jurídico seja usado sem exposição de processos, duplicação de dados ou prazo calculado de forma enganosa.

### Correções obrigatórias

1. Aplicar Gate 1 às procedures de processos, prazos, demandas, publicações, TJRJ, PJe e MNI, incluindo leitura, mutação, lote e sincronização.
2. Desabilitar a geração automática de prazo MNI por padrão até existir cálculo de dias úteis com calendário de feriados e regra parametrizada; exibir confirmação humana da data.
3. Corrigir links para a rota canônica de demanda e preservar filtro `condominioId` no destino.
4. Declarar a rota fixa do Kanban de publicações antes da rota dinâmica por ID e testar acesso direto.
5. Tornar sincronização MNI idempotente por identificador externo, corrigir origem para `mni` e impedir duplicação de partes/movimentos.
6. Integrar sincronização MNI à tela somente após os controles anteriores, exibindo resultado, data e origem.
7. Restringir “Sincronizar Todos” TJRJ a permissão explícita, escopo autorizado, rate limiting e auditoria.

### Critérios de aceite

- Dado uma intimação com prazo configurado, quando o sistema sugerir uma data, então deixa claro que a contagem depende de confirmação humana até existir calendário homologado.
- Dado uma sincronização MNI repetida com o mesmo payload, quando executada duas vezes, então não duplica partes nem movimentações.
- Dado o Kanban de publicações ou link de demanda, quando aberto por URL/menu, então chega à tela correta com contexto preservado.
- Dado usuário sem permissão, quando disparar sincronização em lote, então o servidor bloqueia a ação.

## Gate 5 — Homologação de Fluxos e Release

### Objetivo

Validar a operação completa com dados controlados, evidência e plano de reversão.

### Checklist obrigatório

1. Executar `pnpm check`, `pnpm exec vitest run --no-file-parallelism --reporter=default` e `pnpm build`.
2. Validar dois condomínios e matriz de usuários: admin, síndico, cobrador, colaborador restrito, advogado restrito e usuário sem sessão.
3. Homologar criação/edição/importação de devedor, tentativa de cobrança, acordo, parcela, boleto, remessa/retorno CNAB e relatório por condomínio.
4. Homologar e-mail de recuperação de senha com entrega real, WhatsApp QR/webhook/fila em ambiente permitido e jobs systemd da VPS.
5. Homologar jurídico: demanda, processo, prazo manual, publicação, TJRJ individual e autorização/erro de integrações não configuradas.
6. Registrar limitações aceitas, responsável operacional e procedimento de contingência para CNAB parcial, falhas de e-mail, WhatsApp e integrações judiciais.
7. Criar checkpoint e executar deploy controlado somente após aprovação explícita do checklist.

## Módulos Impactados

Autenticação, RBAC, backend tRPC, DB helpers, cobranças, acordos, parcelas, CNAB, boletos PDF, relatórios, WhatsApp, e-mail, MNI, PJe/DOERJ, TJRJ, processos, demandas, prazos, publicações e navegação jurídica.

## Dados e Banco de Dados

Provavelmente serão necessárias migrations aditivas apenas para chaves externas/idempotência MNI, status de webhook/execução e criptografia/rotação de segredos, após especificação própria. Correções de escopo, autorização, DTO e transações não exigem alteração destrutiva de dados. Nenhum dado financeiro ou jurídico existente deve ser apagado; inconsistências serão identificadas, corrigidas por processo auditável ou marcadas para revisão.

## Permissões

A autorização será validada no servidor por role, perfil, ação, condomínio e propriedade do recurso. A interface continuará escondendo ações não autorizadas, mas essa camada será complementar, nunca a única defesa.

## Integrações e Automações

BTG será mantido apenas em Sandbox até etapa própria de produção. CNAB usará homologação bancária. PJe/DOERJ exigirão autenticação de job. WhatsApp e e-mail exigirão teste de entrega real em ambiente autorizado. MNI exige credencial protegida e sincronização idempotente.

## Histórico e Auditoria

Alterações de configurações sensíveis, ações em lote, remessas, retorno, baixa e integrações devem registrar autor, condomínio, data, origem, resultado e referência externa, sem registrar segredos ou conteúdo sensível em texto aberto.

## Tarefas Técnicas

### Backend e segurança

- [ ] Implementar guardas reutilizáveis de tenancy por recurso e aplicar a todas as procedures por ID.
- [ ] Alinhar RBAC de advogado/colaborador entre cliente e servidor.
- [ ] Corrigir sessão/login de condomínio e validação de status ativo.
- [ ] Sanitizar DTOs, proteger/criptografar segredos e restringir configurações.
- [ ] Autenticar jobs PJe/DOERJ e validar origem/payload.

### Financeiro

- [ ] Tratar CNAB parcial como exceção sem baixa automática.
- [ ] Restringir/corrigir CNAB global e validar dados de beneficiário/sacado.
- [ ] Corrigir endereço de sacado no PDF.
- [ ] Tornar criação e baixa de acordo transacionais e consistentes.
- [ ] Corrigir competência temporal de KPIs financeiros.

### Jurídico

- [ ] Aplicar tenancy/RBAC no servidor às APIs jurídicas.
- [ ] Desativar/sinalizar cálculo automático de prazo até regra útil homologada.
- [ ] Corrigir navegações de demandas e kanban de publicações.
- [ ] Tornar MNI idempotente, com origem e UI de sincronização corretas.
- [ ] Restringir e auditar sincronização TJRJ em lote.

### Testes e homologação

- [ ] Criar testes negativos cross-tenant para IDs e relatórios.
- [ ] Criar testes de matriz role × módulo × ação, incluindo advogado.
- [ ] Criar testes CNAB parcial, boleto PDF e transações de acordo.
- [ ] Criar testes de segredos mascarados, jobs autenticados, MNI idempotente e rotas jurídicas.
- [ ] Executar checklist de Gate 5 e registrar evidências de homologação.

## Riscos e Dependências

A entrega depende de definição comercial dos módulos ativos, acesso a ambientes de homologação, credenciais reais de e-mail/WhatsApp/banco quando esses recursos estiverem no escopo, e decisão sobre política de pagamento parcial CNAB. A correção de dias úteis jurídicos depende da regra aplicável e do calendário de feriados aceito pelo escritório, portanto não será presumida.

## Pendências para Validação

1. Quais módulos precisam estar efetivamente habilitados para o primeiro cliente: jurídico, CNAB, WhatsApp, e-mail, importação, login de condomínio e BTG?
2. A operação usará mais de um condomínio/cedente no primeiro go-live?
3. Qual regra operacional será usada provisoriamente para liquidação parcial CNAB: manter em revisão manual ou permitir baixa proporcional após especificação?
4. O cliente terá acesso de síndico, cobrador, colaborador e advogado desde o primeiro dia ou somente administrador?
5. Há ambiente de homologação e credenciais para Microsoft 365, Z-API, banco/CNAB e integrações jurídicas?

## Próximos Passos

A primeira implementação recomendada é o **Gate 1 — Segurança de Acesso e Isolamento por Condomínio**, pois ele protege simultaneamente cobrança, relatórios, jurídico e cadastros. Após a confirmação do escopo comercial, a correção será dividida em especificações menores e testáveis, começando por guards de tenancy e RBAC no servidor.
