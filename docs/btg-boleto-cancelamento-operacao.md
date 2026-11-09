# Resumo da Demanda

Evolução aprovada em 09/11/2026: completar o fluxo dívida criada → negociação → acordo → parcelas emitidas pela API BTG → boleto em PDF com os dados da mesma emissão. Incluir cancelamento administrativo individual, confirmado pelo banco, sem apagar a dívida ou o acordo.

A implementação está no desenvolvimento. Esta entrega não efetua novo envio, cancelamento ou deploy na VPS.

# Classificação

Integração e melhoria documental/operacional financeira. Prioridade alta; complexidade grande por envolver fontes históricas, dados bancários, autorização e concorrência.

# Problema Atual

O PDF legado dependia da configuração CNAB e de números locais. Os dados efetivamente emitidos pela API precisavam de um caminho documental próprio. Também era necessário distinguir pedido de cancelamento aceito de cancelamento confirmado e proteger o PDF contra uso de um título encerrado.

# Solução Proposta

A fonte documental é a emissão canônica atual da parcela, com revisão e identidade conferidas. O PDF Luminus apresenta a linha digitável, o código de barras, o nosso número e, quando válido, o Pix Copia e Cola retornados pelo banco. Não cria outro título nem calcula códigos CNAB como alternativa.

O pagador e o beneficiário vêm do snapshot mínimo cifrado da emissão. Alterar um cadastro depois não altera os dados históricos do boleto. Capturas antigas só podem originar snapshot quando estão completas, íntegras, compatíveis e dentro do prazo; dados ausentes nunca são inventados.

O cancelamento tem prévia, confirmação individual com motivo, operação persistida e consulta de resultado. Não há DELETE automático nem repetição automática após erro.

# Escopo

PDF individual e lote com resultados por parcela; consulta explícita dos dados bancários; linha e Pix disponíveis somente em título elegível; integração nas telas de acordo, parcelas, devedor, remessa e conciliação; cancelamento individual; proteção de histórico e dos handlers legados; migração aditiva0103 e provisionador seletivo.

# Fora do Escopo

Emissão ou cancelamento reais nesta entrega, novas credenciais, permissões automáticas, reclassificação de títulos históricos, troca automática API/CNAB, envio por WhatsApp/e-mail, cancelamento de acordo inteiro, conciliação financeira durante uma consulta documental e implantação na VPS sem autorização posterior.

O download de um PDF oficial do BTG não será feito por uma URL arbitrária. Enquanto não existir uma origem oficial verificável, o documento disponível é o PDF Luminus identificado como tal, com dados da emissão bancária. Não é apresentado como arquivo oficial fornecido pelo banco.

# Módulos Impactados

- `btg-titulo-contexto`: autorização, identidade, revisão e situação comum.
- `btg-boleto`: snapshot, códigos, projeção, consulta e geração documental.
- `btg-cancelamento`: prévia, confirmação, operação e resultado.

Consumidores: acordo, devedor, parcelas, remessas BTG e conciliação. Os renderizadores e guardas CNAB continuam como caminho distinto.

# Regras de Negócio

Uma parcela não muda de canal ao baixar o PDF ou cancelar o título. O nosso número oficial não é substituído por número local. Valor e vencimento precisam corresponder à emissão e à parcela. Os códigos precisam corresponder entre si, ao valor, ao banco e ao fator de vencimento.

Pagamento confirmado tem prioridade sobre cancelamento. Parcela paga ou com indício de pagamento exige conciliação/revisão, não cancelamento automático. O cancelamento não baixa dívida, não quita parcela, não cancela acordo, não libera outro canal e não gera nova revisão de emissão.

Estados pagos, cancelados, expirados, incertos, divergentes ou em confirmação de cancelamento não oferecem o documento como novo meio de pagamento. Um PDF já baixado não pode ser recolhido do dispositivo do destinatário; o sistema bloqueia novas disponibilizações e preserva o histórico.

# Fluxo da Funcionalidade

1. Criar a dívida e formalizar a negociação/acordo pelo fluxo existente.
2. Escolher parcelas e emitir pelo botão principal da API BTG. A emissão é uma ação distinta do documento.
3. Após resultado confirmado, abrir o bloco **Boleto BTG** na parcela/acordo ou no detalhe da remessa.
4. Se dados completos estiverem persistidos, usar **PDF**, linha digitável ou Pix habilitados. Recarregar a página não emite novamente.
5. Se aparecerem dados pendentes, usar **Consultar dados no BTG**. É somente consulta GET; não baixa, não cancela, não emite nem cria remessa.
6. Se o snapshot ou os códigos estiverem incompletos/divergentes, conferir o diagnóstico. Não usar cadastro atual para completar a emissão antiga.
7. Para cancelar, abrir a ação individual da emissão, preparar a prévia e revisar ambiente, valor, parcela, conta mascarada e revisão.
8. Informar motivo de5–500 caracteres, digitar `CANCELAR COBRANÇA BTG` e marcar a ciência. A prévia expira e precisa de nova consulta quando desatualizada.
9. Confirmar uma única vez. Se o resultado permanecer em confirmação ou ocorrer erro, usar **Consultar resultado no BTG**, sem repetir o cancelamento.
10. Somente `CANCELED` ou webhook autenticado compatível confirma cancelamento. `CANCEL_FAILED` não é sucesso; pagamento ou divergência gera revisão.

# Telas e Experiência do Usuário

O componente compartilhado distingue API, CNAB e não emitido; mostra indisponibilidade e motivos em vez de oferecer um documento calculado por outro canal. A página de acordo também oferece geração documental em lote; itens sem PDF elegível retornam seu motivo individualmente.

A prévia de cancelamento mostra valor, vencimento, ambiente, IDs e conta mascarada. O botão fica bloqueado até o motivo, literal e ciência estarem corretos. Durante a solicitação, ações concorrentes ficam desabilitadas. Conteúdo temporário e prévias são descartados ao fechar ou mudar identidade.

Os downloads usam base64 autenticado, Blob local e revogação da URL temporária. Nenhum PDF de pagamento desta operação é enviado a storage público ou guardado em localStorage.

# Dados e Banco de Dados

Migração `drizzle/0103_modern_luke_cage.sql`, aprovada explicitamente em 09/11/2026,11:41, aplicada somente no desenvolvimento:

- `btgBoletoSnapshots`: um snapshot cifrado por emissão, identidade, revisão, hashes, diagnóstico e estado de completude.
- `btgCancelamentos`: chave única por emissão, prévia/expiração, ator, motivo e consulta cifrados, estado, HTTP/código e datas.

Somente CREATE TABLE/INDEX. Não há backfill nem alteração de valores, títulos, tokens ou registros anteriores. A chave de criptografia existente não deve ser regenerada enquanto houver dados cifrados dependentes dela.

O snapshot novo é registrado na mesma transação da captura do pedido, antes do POST da emissão. O snapshot legado comprovado é validado em leitura nas listagens e só materializado durante a geração documental, com auditoria transacional.

# Permissões

Na primeira versão, consulta bancária, download API e cancelamento são administrativos. O servidor consulta usuário ativo/não excluído e seu papel fresco, sem confiar apenas no estado da sessão ou nos botões.

Também confere parcela/acordo/pagador/condomínio, integração, conta, canal, valor, data e cadeia de revisão. IDs alheios ou contexto contraditório não permitem arquivo, consulta ou efeito bancário. Não foram concedidas permissões novas automaticamente.

# Integrações e Automações

A emissão existente continua separada e idempotente. A geração de PDF é local, sem fetch/POST/DELETE. A consulta documental é GET explícito e não executa conciliação. O cancelamento é DELETE individual confirmado pelo usuário; a confirmação de estado usa GET ou webhook Bearer autenticado.

Não há polling bancário automático para completar o documento, envio externo de PDF, fallback CNAB, cancelamento de lote ou retry automático. Consulta parcial não apaga campos válidos; linha equivalente apenas com separadores visuais não troca os dados originais.

# Histórico e Auditoria

Auditoria persistida registra geração, materialização do snapshot, consulta documental, prévia e confirmação do cancelamento e resultado. Motivo/consulta ficam cifrados; não se copiam CPF, endereço, conta completa, códigos ou corpo bruto para logs livres.

A geração revalida estado e revisão após renderizar, antes de entregar os bytes. Falha de auditoria aborta a entrega. Cancelamento mantém a mesma chave, preserva tentativas e resultados originais das remessas e não apaga PDFs/títulos históricos.

O webhook registra indícios de conflito e preserva prioridade de pagamento, com rollback e reentrega segura se houver falha transacional.

# Critérios de Aceite

**Dado** um título API ativo, compatível e com snapshot/códigos válidos, **quando** gerar o PDF, **então** o documento usa os códigos da mesma emissão sem novo envio ou cálculo CNAB.

**Dado** um cadastro alterado depois da emissão, **quando** baixar o boleto, **então** o pagador/beneficiário congelados permanecem e dados atuais não completam lacunas históricas.

**Dado** cancelamento em confirmação, pagamento, divergência ou revisão alterada, **quando** tentar entregar o PDF, **então** a operação bloqueia antes de expor um meio de pagamento ativo.

**Dado** um lote com um ID de outro acordo, **quando** gerar os documentos, **então** o lote falha antes de renderizar; em lote autorizado, indisponibilidade documental é reportada por item.

**Dado** DELETE aceito sem confirmação, **quando** consultar o resultado, **então** mantém em confirmação e não muda a dívida/acordo para cancelado ou pago.

**Dado** pagamento concorrente/autenticado, **quando** processar cancelamento ou webhook, **então** pagamento prevalece, conflitos ficam auditados e não existe falsa quitação ou confirmação.

# Tarefas Técnicas

Provider, snapshot, consulta, renderizador API, routers, cancelamento, UI compartilhada, provisionador e regressões específicos implementados. Validadores cobrem44 dígitos de barras,47 da linha, DVs, correspondência, banco/valor/fator2025 e Pix TLV/CRC.

Os testes de lote/estado/autorização/snapshot/cancelamento/corridas/auditoria usam fixtures isoladas. O PDF sintético foi inspecionado e os testes decodificam o código I25 do arquivo para compará-lo à fixture. Esses testes não substituem leitura por aplicativo bancário real.

Validação definitiva09/11/2026:2568testes aprovados e1externoBTGopt-in ignorado, em121suítes aprovadas/1ignorada. TypeScript, build e diff aprovados; desenvolvimento respondeuHTTP200. A execução específica integrada teve15suítes/507testes aprovados; a frente final de webhook teve3suítes/198testes aprovados, incluindo66novasregressões.

Os componentes reais de cancelamento foram inspecionados no navegador com dados e callbacks fictícios, conferindo confirmação inicialmente desabilitada e estado em confirmação; a amostra foi removida e a página normal restaurada. Nenhuma conta real ou chamada bancária fez parte destes testes.

# Riscos e Dependências

Dados bancários ausentes ou divergentes bloqueiam, não são reconstruídos. Captura antiga expurgada/expirada/incompleta não permite inventar snapshot. Geração documental em lote tem limite100 parcelas por chamada.

A consulta pública precisa fornecer identidade suficiente; respostas ambíguas não autorizam substituição de dados nem cancelamento. A concorrência simulada em memória precisa de homologação específica no MySQL/InnoDB real. URLs/documentos já enviados a terceiros não podem ser retirados retroativamente.

Retorno seguro: preservar backup de código/build/banco/.env e novas tabelas aditivas. Não apagar snapshots, operações ou evidências para voltar o código. Se existir cancelamento solicitado/em confirmação, bloquear repetição e documentos ativos até consulta/validação da situação; voltar o build não desfaz efeito bancário. Não regenerar a chave criptográfica nem executar reset de estado financeiro para recuperar uma operação.

# Pendências para Validação

Aprovação e execução da implantação da0103 na VPS, teste do PDF de uma cobrança efetivamente emitida, leitura dos códigos em aplicativo bancário sem efetuar pagamento, reload nas telas e consulta parcial real. Cancelamento real somente de título expressamente selecionado/autorizado, com conferência posterior no BTG e no Luminus.

Não cancelar uma cobrança de produção apenas para testar. Nenhum título real foi emitido, cancelado ou alterado pelos testes desta entrega.

# Próximos Passos

Concluir o checkpoint técnico. Depois, mediante autorização de implantação: inventário da VPS → backup de código/banco/.env → pull fixado no commit validado → provisionador0103 seletivo → TypeScript/build isolado → troca reversível de dist → reinício somente da aplicação → HTTP local/HTTPS → homologação do documento e cancelamento individual autorizado.

Checagem estrutural futura: `node scripts/provisionar-btg-boletos-cancelamentos.cjs --check`. A aplicação exige a confirmação textual indicada pelo próprio provisionador. Não usar `drizzle-kit migrate` ou executar migrações históricas indiscriminadamente.
