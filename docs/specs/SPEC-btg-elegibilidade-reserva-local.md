# Especificação — API BTG principal, CNAB alternativo e reserva local

Status: proposta técnica revisada para aprovação em 06/11/2026. O usuário definiu às 15:16:26 que deseja poder enviar cobranças por API ou CNAB e que a API seja a forma principal. Base produtiva de referência `4d47413a`; caso de teste: acordo #5/parcela #19. Não há implementação, migração, reclassificação ou emissão autorizada nesta revisão documental.

## Resumo da Demanda

Disponibilizar dois canais bancários para as parcelas de acordos: **API BTG como caminho principal** e **remessa CNAB como alternativa escolhida pelo administrador**. Uma reserva de nosso número não pode forçar a escolha do CNAB. A mesma parcela não pode gerar dois títulos por canais diferentes.

## Classificação

Correção de elegibilidade combinada com melhoria do fluxo financeiro. Prioridade alta, complexidade média. A integração API e o CNAB existentes serão reaproveitados; não criar outro emissor ou reescrever a integração bancária.

## Problema Atual

A criação de acordo pode atribuir `nossoNumero` mesmo com status `nao_enviado`. A elegibilidade API interpreta o número como vínculo legado e bloqueia a parcela antes do POST. A tela também usa configurações históricas `modoBoleto` para algumas ações, o que não deve significar que todas as parcelas novas estão irrevogavelmente presas a um canal.

A consulta da VPS fornecida pelo usuário mostra acordo #5 ativo, parcela #19 pendente, número `1000000018`, sem remessa, dados bancários legados ou emissão v2 registrada. Isso não equivale a uma consulta ao banco nem prova ausência de encaminhamento externo do boleto.

## Solução Proposta

Criar uma experiência de **revisão e envio de cobranças** que privilegie a API BTG. No acordo e na gestão bancária, a ação principal será `Enviar ao BTG pela API`. A ação secundária será `Gerar remessa CNAB`. Ambas operam sobre parcelas elegíveis do mesmo condomínio, mantendo revisão e confirmação.

A escolha do canal é feita para as parcelas selecionadas no momento da operação, não impondo um canal único a todas as parcelas do acordo. Cada lote usa somente um canal; parcelas distintas do mesmo acordo podem usar canais distintos quando isso for escolhido explicitamente e não houver vínculos anteriores. Não mudar automaticamente o canal de títulos históricos.

## Escopo

- API selecionada/destacada como padrão na experiência nova de envio, sem disparo automático.
- CNAB disponível como alternativa explícita, usando layout, configuração e geração existentes.
- Identificar reserva local de número separadamente de canal bancário reservado/encaminhado.
- Elegibilidade e locks compartilhados entre API, CNAB e caminhos legados para evitar dupla emissão.
- Tratamento administrativo individual de reservas existentes ambíguas, como a parcela #19.
- Motivos de bloqueio específicos e histórico do canal por parcela/lote.
- Atualização de caches e preservação de boleto/Pix/resultados bancários já registrados.

## Fora do Escopo

Emissão avulsa de dívida sem acordo; envio automático ao criar dívida/acordo; fallback automático API → CNAB; cancelamento/reemissão de título registrado; migração em massa de acordos antigos; alteração de valores/snapshots; envio automático novo por WhatsApp, e-mail ou SMS; alteração OAuth, conta, webhook ou escopos; deploy automático na VPS.

A API emite/registra a cobrança no BTG e disponibiliza os meios de pagamento retornados ao Luminus. Enviar a cobrança ao banco não comprova envio de mensagem ao devedor; a distribuição existente do boleto/linha/Pix será preservada, sem criar automação externa neste corte.

## Módulos Impactados

Criação/detalhe de acordo, gestão bancária, seleção de parcelas, CNAB, emissão API BTG v2, elegibilidade, reserva concorrente, auditoria e testes. As mudanças na criação não devem fazer `modoBoleto=api_btg` acionar o emissor legado como se fosse a integração v2.

## Regras de Negócio

1. Dívida continua sendo formalizada em acordo ativo antes do envio ao BTG. Somente parcelas pendentes/atrasadas elegíveis podem ser encaminhadas.
2. API é a ação principal, mas CNAB não será removido ou automaticamente usado quando a API falhar.
3. Criar dívida/acordo ou reservar numeração não emite nem escolhe definitivamente o canal.
4. Uma parcela pode ter apenas um canal bancário reservado/encaminhado por vez. Remessa gerada, envio em andamento, emissão existente ou estado incerto impedem envio pelo outro canal.
5. Falha/timeout/incerteza na API não permite gerar CNAB para contornar o estado. O título precisa de revisão/conciliação antes de qualquer nova decisão.
6. Número com origem desconhecida permanece bloqueado para revisão. Registros antigos não serão convertidos automaticamente em reserva local.
7. Evidência de remessa/coleção/retorno/boleto/Pix legado ou reserva/emissão v2 prevalece sobre qualquer marcador local.
8. API e CNAB devem conferir os dados atuais e reservar o canal de forma atômica, com lock da parcela e consulta das reservas concorrentes. Locks/checks também valem para os caminhos legados existentes, não só para a fila nova.
9. Nenhuma alteração de número, valor, vencimento, snapshot, saldo ou acordo ocorrerá apenas para tornar a parcela elegível.
10. Alteração do canal de uma parcela ainda livre é escolha do usuário. Canal de título já registrado não pode ser trocado por um seletor simples.

## Fluxo da Funcionalidade

1. Administrador cria/revisa o acordo. Nenhuma emissão acontece neste passo.
2. Escolhe parcelas na revisão de envio; API aparece como caminho principal.
3. Se optar por API, revisa conta, devedor, valores, vencimentos e confirmação de envio real; o backend reserva o canal e reutiliza o fluxo v2 idempotente existente.
4. Se optar por CNAB, revisa o lote e confirma geração; o backend reserva o canal e reutiliza a geração CNAB do condomínio. Gerar o arquivo não significa transmiti-lo automaticamente ao banco.
5. O resultado mostra canal, parcela, número/lote, situação e meios de pagamento quando realmente disponíveis.
6. Parcela encaminhada por um canal aparece bloqueada no outro, com motivo específico.
7. Faltando configuração API, mostrar a pendência e permitir escolha explícita de CNAB apenas se a parcela estiver livre e o CNAB estiver configurado. Não selecionar fallback silenciosamente.

## Telas e Experiência do Usuário

### Acordo e gestão bancária

Ação principal `Enviar ao BTG pela API`; ação secundária `Gerar remessa CNAB`. Seleção obrigatória de parcelas, condomínio único e um canal por lote. Canal será indicado por texto/badge, sem confundir API v2 com o legado `api_btg`. Controles financeiros continuam exclusivos do administrador.

Estados: configuração pendente, carregando, sem parcelas elegíveis, revisão, envio/geração em andamento, sucesso, parcial, falha/incerteza e bloqueio por outro canal. Não esconder motivo de bloqueio ou oferecer ação financeira fictícia.

### Confirmação de reserva existente

No contexto da parcela bloqueada por número de origem desconhecida, oferecer ação administrativa de confirmar que o número foi somente reservado pelo sistema. Exigir declaração/literal de que a parcela não foi enviada, registrada ou distribuída em outro canal. Revalidar todos os vínculos atuais sob transação; recusar se algum surgir. Auditoria estrita com ator, data, motivo e estados anterior/posterior; rollback em falha da auditoria.

Para a parcela #19, esta ação poderá preservar `1000000018` e registrar a origem local após a conferência humana. Confirmar reserva não envia cobrança nem cancela título no banco. Nenhuma confirmação em massa ou inferência por data/nome/perfil será feita.

### Mensagens

Distinguir `Numeração de origem não confirmada`, `Parcela reservada/enviada pela API`, `Parcela vinculada a remessa CNAB`, `Parcela paga/cancelada` e `Acordo não está ativo`. Sucesso de emissão API somente após resultado bancário apropriado; geração CNAB é geração de arquivo, não comprovante de envio ou registro.

## Dados e Banco de Dados

Proposta de migration aditiva nas parcelas:

- `nossoNumeroOrigem`: nullable enum `reserva_local` / `legado`, para diferenciar numeração reservada de origem histórica/encaminhada.
- `canalBancario`: nullable enum `api_btg_v2` / `cnab240` / `legado`, registrando a reserva/uso bancário, não apenas preferência visual.

Dados atuais ficam null, sem backfill automático. Vínculos existentes continuam sendo fonte de bloqueio mesmo sem marcador. `modoBoleto` e configurações de condomínio não serão alterados em massa. Não usar a preferência de interface como prova de inexistência de emissão.

A reserva automática de numeração, quando mantida na criação, será identificada explicitamente como local e não escolherá CNAB. Se a numeração for atribuída apenas na operação CNAB, isso deve preservar as ações existentes e ser registrado no plano técnico, sem modificar números atuais. O número retornado pelo BTG v2 fica no registro canônico de emissão, sem apagar o histórico local.

Contratos de origem/canal são controlados pelo servidor. Não aceitar marcador livre em formulários comuns. Auditoria administrativa será gravada na mesma transação que a confirmação, usando a infraestrutura existente.

## Permissões

Manter RBAC e carteira multi-condomínio. Operações BTG v2 e confirmação financeira continuam administrativas; preservar as permissões CNAB existentes, sem ampliar a usuários que não tinham acesso. Nenhuma gerente jurídica receberá privilégios financeiros para este fluxo. Frontend não substitui guards por ID no servidor.

## Integrações e Automações

Reutilizar Collections/API BTG v2 e CNAB 240. Nenhuma chamada ao banco durante desenvolvimento/testes; nenhuma mudança de credenciais. Webhook/consentimento/conta/liberação de Produção precisam permanecer corretos e homologados separadamente. Não introduzir agendador, retry automático ou novo serviço de entrega ao devedor.

## Histórico e Auditoria

Preservar acordos, parcelas, números, remessas, PDFs, emissões e meios de pagamento. Auditar escolha efetiva/reserva de canal, confirmação local, geração/envio e bloqueios pertinentes. Não registrar tokens, segredo do webhook, CPF/CNPJ completo ou conteúdo Pix na auditoria de decisão de canal. Um evento financeiro anterior nunca será apagado para liberar outro emissor.

## Critérios de Aceite

- Dado um acordo novo ativo com parcelas livres, quando abrir a revisão, então API é a ação principal e CNAB permanece disponível como alternativa, sem emissão automática.
- Dada uma parcela com reserva local comprovada e nenhum vínculo, quando selecionar API, então número local não provoca falso bloqueio.
- Dada uma parcela livre, quando escolher CNAB, então é gerado um lote CNAB conforme configuração existente, sem POST à API BTG.
- Dada uma reserva/emissão API, quando tentar CNAB, então o backend recusa; reciprocamente CNAB gerado impede novo envio API.
- Dada disputa simultânea API/CNAB pela mesma parcela, quando ambas confirmarem, então só uma operação reserva/encaminha o título.
- Dado número antigo de origem desconhecida, quando abrir a fila, então permanece em revisão; confirmação individual exige declaração e ausência de vínculos atuais, com auditoria transacional.
- Dada parcela #19 confirmada como reserva local pelo administrador, quando revisar API, então preserva `1000000018`, valores e histórico, sem envio causado pela confirmação.
- Dada API indisponível ou estado incerto, quando a operação falhar, então não ocorre fallback automático para CNAB.
- Dada dívida sem acordo ou parcela paga/cancelada, quando tentar emitir, então nenhum canal cria novo título por esse fluxo.

## Tarefas Técnicas

Após aprovação: plano/checklist por etapas, testes de domínio e origem/canal; schema/migration revisada; criação/reserva/consumo e locks nos caminhos API/CNAB/legado; política única de elegibilidade; confirmação auditada; interface com API principal e CNAB alternativo; regressões e manual de operação/migração restrita. Reaproveitar telas/hooks existentes, evitando dois contratos incompatíveis.

Arquivos principais: `drizzle/schema.ts`, nova migration específica, `server/routers.ts` (criação/CNAB/legado), `server/db-acordos.ts`, helpers/router de domínio bancário, `server/btg-v2/issuance.ts` e `remessas.ts`, componentes de envio/gestão/acordo e testes em `server/*.test.ts`.

Usar TypeScript tipado, Zod, tRPC e Drizzle existentes, sem dependências novas. Exemplo do contrato de domínio:

```ts
type OrigemNossoNumero = 'reserva_local' | 'legado' | null;
type CanalBancario = 'api_btg_v2' | 'cnab240' | 'legado' | null;
// Canal efetivo/reservado não é preferência visual.
// Evidência bancária prevalece sobre qualquer marcador local.
```

Testes com fixtures/mocks, sem banco real ou emissão. Cobrir ambas as direções de exclusão, concorrência, auditoria/rollback, legado ambíguo, snapshots/numeração, RBAC/carteira, status e filas. Executar específicos antes da validação completa na raiz do projeto:

```bash
pnpm exec vitest run --no-file-parallelism --reporter=default
pnpm check
pnpm build
git diff --check
```

## Riscos e Dependências

Títulos distribuídos/registrados fora do sistema exigem conferência humana, não podem ser inferidos de null. Caminhos legados podem concorrer com a API e precisam usar a mesma trava; marcar canal só no frontend não resolve. Mudança de preferência não transforma `api_btg` legado em v2. API retorna título/meios de pagamento, não comprova mensagem ao devedor. Homologação bancária externa e configuração CNAB continuam dependências distintas.

Reversão preserva os dados e históricos; não restaurar dump antigo sobre transações novas. Código anterior poderá voltar a bloquear números reservados. Sem exclusão de registros ou reclassificação em massa. Deploy futuro exigirá backup, migration exclusiva e teste controlado, sem `db:push` global.

## Pendências para Validação

A preferência API principal/CNAB alternativo foi definida pelo usuário. Falta aprovar este corte técnico com rastreabilidade/colunas aditivas e confirmação administrativa das reservas atuais. O administrador ainda deverá conferir o título #19 antes de qualquer confirmação real. Verificar cadastro/entrega real do webhook separadamente.

## Próximos Passos

Aprovar a proposta revisada e gerar plano/checklist técnico; implementar e validar no desenvolvimento, sem emissões ou reclassificações reais. Depois entregar checkpoint pelo GitHub e orientar atualização manual da VPS. Confirmação da parcela #19 e primeira emissão permanecem ações separadas, explícitas e revisadas.
