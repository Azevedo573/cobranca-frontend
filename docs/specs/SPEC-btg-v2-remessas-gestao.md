# Especificação — Gestão de Remessas BolePix BTG

## Resumo da Demanda
Transformar o envio de parcelas de acordos ao BTG em uma operação semelhante a uma remessa: o operador monta um lote, revisa as parcelas, confirma o envio e acompanha o resultado de cada cobrança em uma tela própria.

## Classificação
Nova funcionalidade financeira e de integração bancária. Prioridade alta; complexidade média.

## Problema Atual
A emissão BolePix está disponível a partir do detalhe de um acordo e cada chamada retorna resultados por parcela. Embora as emissões sejam idempotentes e persistidas, não há um registro operacional que represente o envio como um lote, com totais, responsável, status consolidado, filtros e acompanhamento centralizado.

## Objetivo
Permitir que o escritório envie parcelas elegíveis de acordos ao BTG como uma **remessa BolePix por condomínio**, acompanhe o processamento, identifique falhas e concilie títulos pagos sem misturar beneficiários, condomínios ou fluxos CNAB.

## Escopo
- Nova tela **Banco → Remessas BTG**, no padrão visual atual do sistema: cabeçalho executivo, KPIs, filtros, tabela de lotes e detalhe lateral/expansível.
- Criação de uma remessa por condomínio, com parcelas de acordos ativos selecionadas em uma fila.
- Pré-seleção de parcelas elegíveis; bloqueio explícito de itens pagos, cancelados, já enviados por CNAB, já vinculados a BolePix ou pertencentes a outro condomínio.
- Revisão do lote: quantidade, valor total, acordos/devedores, vencimentos e conta recebedora.
- Confirmação explícita para envio; reserva do lote antes de qualquer chamada externa.
- Envio sequencial, idempotente, com resultado individual persistido por parcela.
- Estados do lote: `rascunho`, `enviando`, `processada`, `processada_parcialmente`, `falha`, `cancelada`.
- Tela de gestão para acompanhar totais, emissões, links de boleto/Pix, erros, pagamentos e conciliação.
- Reutilização da conciliação manual/em lote BTG já existente, agora acessível a partir do lote e da gestão.
- Auditoria para criação, confirmação, envio, falhas, conciliação e cancelamento.

## Fora do Escopo
- Substituir ou remover CNAB 240.
- Misturar parcelas de condomínios diferentes na mesma remessa BTG.
- Emitir dívidas avulsas fora de um acordo ativo.
- Baixar pagamentos parciais automaticamente.
- Liberar Produção automaticamente ou alterar credenciais BTG.
- Reemitir automaticamente títulos com falha/incerteza.

## Usuários e Permissões
- **Administrador:** cria, envia, consulta, concilia e cancela remessas BTG.
- Nesta primeira etapa, síndico, colaborador, cobrador e advogado não terão acesso à operação financeira BTG.
- O servidor continua validando o condomínio de cada parcela, conta recebedora e integração antes de cada emissão.

## Regras de Negócio
1. Uma remessa BTG pertence a exatamente um condomínio e a uma integração/ambiente BTG.
2. Uma remessa só pode conter parcelas de acordos ativos do mesmo condomínio.
3. Apenas parcelas pendentes ou atrasadas, sem `nossoNumero`, remessa CNAB, boleto legado ou emissão BTG anterior são elegíveis.
4. A conta recebedora deve estar ativa e vinculada ao condomínio antes da confirmação.
5. O lote é persistido como `rascunho` antes do envio; no início passa a `enviando`.
6. Cada emissão mantém a idempotência atual por parcela. Um reenvio do mesmo lote não pode criar nova cobrança para uma parcela já registrada.
7. O lote finaliza como:
   - `processada`: todas as parcelas foram emitidas ou já possuíam emissão idempotente;
   - `processada_parcialmente`: ao menos uma parcela foi emitida e ao menos uma falhou;
   - `falha`: nenhuma parcela foi emitida;
   - `cancelada`: lote cancelado antes do início do envio.
8. Um lote que começou a enviar não pode ser apagado. Cancelamento não cancela automaticamente títulos já emitidos; cada título exige cancelamento confirmado no BTG.
9. A conciliação só baixa a parcela quando o BTG confirmar pagamento integral com valor idêntico, em centavos.
10. Em Sandbox, a interface deixa claro que as respostas podem ser estáticas; em Produção, a tela indica envio real e requer a liberação já existente.

## Dados e Banco de Dados
### Nova tabela `btgRemessas`
- `id`, `btgIntegracaoId`, `condominioId`, `status`;
- `totalSelecionado`, `totalEmitido`, `totalFalha`, `valorTotalCentavos`;
- `usuarioCriadorId`, `criadaEm`, `iniciadaEm`, `finalizadaEm`, `canceladaEm`;
- `erroResumo`, `observacao`, `createdAt`, `updatedAt`.

### Alteração aditiva em `btgCobrancasEmitidas`
- `btgRemessaId` opcional, com índice;
- emissões históricas permanecem sem lote e continuam visíveis na tela de conciliação.

Não serão apagadas tabelas, emissões ou remessas CNAB existentes.

## Fluxo Proposto
1. Administrador acessa **Banco → Remessas BTG**.
2. Escolhe um condomínio com conta BTG vinculada.
3. O sistema lista parcelas elegíveis de acordos ativos daquele condomínio, já pré-selecionadas.
4. Administrador revisa o lote, remove itens se necessário e confirma o envio.
5. Sistema cria o cabeçalho da remessa, reserva a operação e envia as parcelas sequencialmente.
6. Cada resultado é vinculado ao lote; o painel atualiza os totais e erros.
7. Administrador acompanha o lote na tabela, abre detalhes, copia Pix/linha digitável, abre boleto, concilia ou cancela uma cobrança individual quando permitido.

## Telas e Experiência do Usuário
### 1. Gestão de Remessas BTG
- Header: título, badge de ambiente, botão `Nova remessa` e `Conciliar pendentes`.
- KPIs: rascunhos, em processamento, emitidas, com falha/confirmação pendente e pagamentos conciliados.
- Filtros: condomínio, status, período e ambiente exibido somente leitura.
- Tabela: número do lote, condomínio, data, responsável, quantidade, valor, progresso, status e ações.
- Estados vazios e alertas de configuração incompleta.

### 2. Painel lateral “Nova remessa”
- Seletor obrigatório de condomínio.
- Conta recebedora identificada e mascarada.
- Tabela de parcelas com acordo, devedor, vencimento, valor, motivo de bloqueio e checkbox.
- Resumo fixo com quantidade e valor selecionado.
- Confirmação: `ENVIAR REMESSA` em Produção; confirmação simplificada e identificada em Sandbox.

### 3. Detalhe do lote
- Cabeçalho com status e totais.
- Linha por parcela com resultado, Collection ID, links de boleto/Pix, erro e ações permitidas.
- Histórico de eventos da remessa e botão de conciliação de itens pendentes.

## Validações e Mensagens
- `Selecione parcelas do mesmo condomínio para montar a remessa.`
- `Nenhuma parcela elegível foi encontrada para este condomínio.`
- `A conta recebedora BTG não está vinculada ou está inativa para este condomínio.`
- `Esta parcela já pertence a uma remessa CNAB ou a uma emissão BTG e não pode ser enviada novamente.`
- `A remessa foi registrada, mas contém itens que exigem revisão.`
- `O pagamento parcial ou divergente foi mantido para revisão; nenhuma baixa automática foi aplicada.`

## Histórico e Auditoria
Registrar, sem segredos ou dados de cartão:
- criação/cancelamento do lote;
- confirmação e início de envio;
- totais e resultados consolidados;
- falhas por item (código, sem payload sensível);
- conciliações, cancelamentos e usuário responsável.

## Critérios de Aceite
- Dado um condomínio com conta BTG ativa e parcelas elegíveis, quando o administrador confirmar uma remessa, então o sistema cria um lote persistido antes de chamar o BTG.
- Dado uma seleção com parcelas de outro condomínio, quando tentar enviar, então o sistema bloqueia a operação sem criar lote nem cobrança.
- Dado uma parcela CNAB ou BTG já vinculada, quando a fila for aberta, então ela aparece bloqueada com motivo claro.
- Dado um lote com falhas e sucessos, quando finalizar, então fica `processada_parcialmente`, exibe contadores e permite investigação por item.
- Dado uma parcela paga parcialmente ou com valor divergente, quando o status for conciliado, então não há baixa automática.
- Dado um usuário não administrador, quando tentar acessar procedures ou tela de remessas, então recebe bloqueio de acesso.

## Estratégia de Testes
- Unitários: seleção de lote, status consolidado, idempotência e transições permitidas.
- Router: RBAC, condomínio único, conta vinculada e criação prévia do lote.
- Integração com mocks: resultado parcial, falha total, título já existente e conciliação.
- Frontend: estados de seleção, bloqueios, confirmação e resumo de totais.
- Regressão: `pnpm test`, `pnpm check` e `pnpm build`.

## Limites e Decisões que Precisam de Aprovação
1. O lote BTG deve ser obrigatoriamente **de um único condomínio** para preservar conta recebedora e beneficiário.
2. A primeira versão será exclusiva para administradores, como as atuais operações BTG.
3. Cada remessa será enviada imediatamente após confirmação; não haverá agendamento nesta etapa.
4. Lotes parcialmente enviados não terão botão de reenvio automático: a ação por item dependerá de revisão para evitar duplicidade.
