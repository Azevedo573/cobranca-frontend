# Operação — API BTG principal e CNAB alternativo

Implementação no desenvolvimento aprovada em 06/11/2026 e tecnicamente concluída na mesma data. Este manual não confirma implantação na VPS, emissão bancária, entrega de mensagens ao devedor ou homologação do webhook. Os resultados de testes simulados estão registrados ao final.

## Escolha do canal

O fluxo permanece **dívida → acordo ativo → parcelas → revisão e confirmação de envio**. A API BTG é a ação principal da experiência nova; CNAB é uma alternativa explicitamente escolhida pelo administrador. Criar uma dívida ou um acordo não realiza emissão automática.

No detalhe do acordo, use **Enviar ao BTG pela API** para revisar as parcelas, conta e ambiente da integração v2. Se preferir arquivo, use **Gerar remessa CNAB** e revise a seleção na gestão CNAB. Cada lote possui um condomínio e um canal. A preferência visual não altera contas, `modoBoleto` histórico ou títulos antigos.

| Situação da parcela | Tratamento |
|---|---|
| Livre, sem vínculo ou emissão | Pode escolher API ou CNAB, conforme configuração e permissões |
| Número somente reservado localmente pelo servidor | Não obriga CNAB; permanece disponível se não houver outro impedimento |
| Número antigo de origem desconhecida | Revisão e confirmação administrativa individual; sem liberação em massa |
| Canal API reservado, enviado ou incerto | Não pode gerar outro título CNAB |
| Canal CNAB reservado ou arquivo gerado | Não pode encaminhar novo título pela API |
| Boleto/coleção/Pix/retorno legado ou emissão v2 existente | Usar/revisar o registro existente, não emitir outro |
| Paga, cancelada ou acordo inativo | Bloqueada para nova emissão |

Gerar o arquivo CNAB não significa que ele já foi transmitido ou aceito pelo banco. A emissão API disponibiliza os meios de pagamento retornados pelo BTG ao Luminus; enviar esses meios ao devedor continua uma ação separada. Não há fallback automático API → CNAB ou novo envio automático por WhatsApp/e-mail.

## Reserva antiga — caso do acordo #5/parcela #19

A leitura fornecida pelo usuário indicou número `1000000018`, status `nao_enviado`, acordo ativo e ausência de vínculos bancários nos registros consultados. Antes de confirmar a origem local, o administrador deve conferir que o título não foi encaminhado, registrado ou distribuído fora do sistema. Ausência de campos no banco não prova inexistência de boleto no banco ou enviado ao devedor.

A ação **Confirmar reserva local** exige declaração e o texto `CONFIRMAR RESERVA LOCAL`. O servidor verifica novamente número esperado, acordo, parcela e todas as evidências bancárias sob lock. Surgindo vínculo ou mudança do número, a ação é recusada. Em sucesso, altera somente a origem da numeração e registra ator, data e estado anterior/posterior. Não altera `1000000018`, valor, vencimento, snapshots, saldo ou canal e não envia cobrança.

Se uma reserva já tiver sido confirmada em outra aba, atualize os dados. Não repetir confirmações em massa. Se houver título real em outro canal, não usar a confirmação como cancelamento ou método de reemissão.

## Erros e incerteza

Falha na API, timeout, reserva pendente ou resposta incerta exige revisão do registro canônico e/ou conciliação. Não gerar CNAB para contornar a incerteza. Falha ao preparar CNAB após adquirir o canal também permanece bloqueada para investigação; geração de arquivo e disponibilidade do storage não devem liberar automaticamente outro emissor.

Falha na auditoria de confirmação desfaz o marcador dentro da transação. Nenhum erro será interpretado como autorização para enviar uma segunda cobrança.

## Migração futura na VPS — não executada nesta etapa

A migration `drizzle/0100_organic_guardsmen.sql` acrescenta somente `parcelasAcordo.nossoNumeroOrigem` e `parcelasAcordo.canalBancario`, nullable, sem backfill. Dados antigos continuam null, e vínculos existentes continuam bloqueando nova emissão.

Após autorização posterior, confirmar a versão da VPS, fazer backup do código/build, banco e `.env`, atualizar para o commit testado pelo GitHub e conferir estrutura. O provisionador específico permite checagem e aplicação restrita:

```bash
cd /var/www/cobranca || exit 1
node scripts/provisionar-btg-canais.cjs --check
# Aplicar somente após revisão do resultado e backup:
node scripts/provisionar-btg-canais.cjs --apply "CONFIRMAR ESTRUTURA CANAIS BTG"
node scripts/provisionar-btg-canais.cjs --check
```

Não usar `pnpm db:push`, migrações históricas ou SQL para apagar números/coleções. O script aceita estrutura parcial conhecida com uma das duas colunas e aplica apenas a coluna que falta; tipos/defaults inesperados são recusados. DDL MySQL pode confirmar cada comando independentemente, portanto uma falha requer conferir o estado antes de repetir. O provisionador não registra/baixa/cancela títulos, não reclassifica parcelas e não ativa emissão.

Compilar o código em build temporário, verificar TypeScript/build e permissões de leitura do usuário `cobranca`, fazer troca reversível do dist e reiniciar somente a aplicação conforme roteiro já utilizado. Validar HTTP e as filas antes de qualquer operação financeira. Não alterar chave de criptografia, tokens, segredo de webhook ou conta para esta migração.

## Piloto e reversão

O piloto real deve conferir uma parcela nova livre, o caso antigo confirmado individualmente e bloqueio recíproco por canal. Revisar valores, vencimento, condomínio, conta, ambiente e beneficiário antes do envio financeiro. O pagamento real e o webhook permanecem uma homologação separada; fixtures não substituem a confirmação pelo BTG.

Rollback de código deve preservar novos marcadores, emissões e histórico. Não restaurar dump antigo sobre transações novas nem apagar reservas para reenviar títulos. Voltar ao código anterior pode bloquear novamente números locais; títulos já encaminhados devem continuar protegidos pelos vínculos existentes.

## Validação técnica

Concluída no desenvolvimento em 06/11/2026: suíte serial com **1227 testes aprovados e 1 externo opt-in ignorado**, TypeScript, build e diff sem erros. As frentes API, CNAB, legado e UI foram integradas; a fila API inclui o número esperado para a confirmação individual. O CNAB também revalida acordo, valor, vencimento e evidências bancárias depois de gerar o arquivo, antes do vínculo final. Falha dessa revalidação mantém a reserva e a identificação do arquivo para revisão, sem liberar outro canal.

Os componentes reais de situação e confirmação foram inspecionados no navegador com dados fictícios e callbacks locais: sem declaração ou sem literal, o botão permaneceu bloqueado; com ambos, habilitou apenas a simulação local. Nenhuma confirmação foi enviada ao servidor. Sem sessão, a gestão redirecionou ao login conforme esperado. Não houve homologação autenticada de emissão real.

A concorrência foi exercitada com fixtures transacionais serializadas e helpers/emissor completos, sem chamadas BTG ou banco real. Isso verifica os guards e a ordem de reserva no código, mas não substitui um teste de interleaving no InnoDB de Produção. Nenhuma cobrança real foi enviada, parcela #19 reclassificada, segredo alterado ou mudança implantada na VPS.
