# Resumo da Ocorrência

O retorno completo capturado na VPS em 09/11/2026 identificou `phoneNumber` como inválido no BolePix da parcela 1 do acordo #7, referência `PA21R1`. O usuário aprovou a correção do telefone e os testes no desenvolvimento às 10:13. Nenhum CPF, telefone real ou corpo completo é reproduzido neste documento.

# Classificação e Prioridade

Falha de integração e normalização cadastral; prioridade alta. A correção é restrita ao adaptador BTG e à mensagem de validação anterior ao envio. Implantação e operação bancária reais são etapas distintas.

# Módulo Impactado

Montagem BolePix em `server/btg-v2/bolepix.ts` e propagação segura de erro local em `server/btg-v2/issuance.ts`. Os fluxos por acordo e remessa reutilizam esses componentes.

# Comportamento Atual

Antes da correção, a entrada nacional do cadastro recebia somente o sinal `+` na saída do adaptador. Faltava completar o código de país 55. A máscara existente recebe DDD e número com até 11 dígitos; não foi alterada nem utilizada como contorno para forçar DDI.

# Comportamento Esperado

Produzir `+55` seguido do DDD e do número nacional válido, sem duplicar DDI ou inventar dígitos. Ausência continua opcional. Entrada preenchida e inválida deve impedir o POST e apresentar orientação segura, sem expor o telefone na mensagem.

# Como Reproduzir

Exemplo sintético: `(21) 4000-0000` era transformado em `+2140000000`. O resultado corrigido é `+552140000000`. Os testes reproduzem a montagem e o emissor com mocks; não usam o pagador real nem chamam a API bancária.

# Diagnóstico Inicial

A evidência bancária retornou HTTP 400/BadRequestError e apontou `invalidParams.name=phoneNumber`. Isso identifica o campo recusado, mas não comprova aprovação dos demais campos ou inexistência de título no banco. A captura criptografada permitiu diagnosticar a causa efetiva.

# Causa Provável

Defeito confirmado no código anterior: `+` seguido de todos os dígitos cadastrados não distingue um telefone nacional de um internacional. O exemplo oficial de Collections contém `+55` [1]. A validação estrutural usa o plano brasileiro e os DDD publicados pela Anatel [2] [3].

# Impactos Identificados

Telefones nacionais válidos eram representados incorretamente na integração. Digitar 55 no formulário limitado a 11 dígitos poderia truncar ou deslocar o número. A correção não modifica cadastro, telefone principal/alternativo, conta recebedora, valores, vencimentos ou referências da cobrança.

# Correção Proposta

Implementado `normalizarTelefonePagadorBtgV2`: nacional fixo de 10 dígitos e móvel de 11 são normalizados para `+55`; brasileiro internacional de 12/13 com ou sem sinal é preservado com um único DDI. A lista de 67 DDD foi conferida na publicação Anatel de 2026 [2]. Prefixos fixos 2–5 e móvel 9 seguem o plano comunicado à UIT [3].

O DDD nacional 55 é reconhecido pelo comprimento e pela presença explícita do sinal: não perde os seus dígitos. Aceitam-se pontuações comuns, sem descartar letras, ramais, controles embutidos, prefixos de operadora ou DDI estrangeiro silenciosamente. Não se acrescentam DDD ou nono dígito a cadastros incompletos.

# Regra Atual e Regra Corrigida

Regra anterior: qualquer sequência numérica não vazia recebia `+`. Regra corrigida: interpretar nacional/internacional brasileiro, validar estrutura e produzir formato canônico. Nulo, indefinido, vazio ou apenas espaços omitem `phoneNumber`; valor preenchido inválido bloqueia a montagem.

Validação estrutural não verifica existência, titularidade, ativação ou consentimento do titular do telefone. A aceitação final depende do BTG e de todos os dados do título.

# Alterações Técnicas Necessárias

O helper puro foi integrado uma única vez à montagem do payload. O emissor preserva a mensagem estática de `BtgV2BolePixError` apenas quando o cliente ainda não foi invocado, convertendo-a no erro de configuração já utilizado pelo fluxo. Erros após envio e erros desconhecidos mantêm proteção conservadora.

Não houve nova interface, mudança de layout, API, dependência ou migração. As telas existentes por acordo/remessa exibem a orientação segura através de seus resultados textuais.

# Correção de Dados Existentes

Nenhum UPDATE cadastral ou financeiro foi executado. A representação é ajustada somente na saída do adaptador. Se o número real estiver incorreto, precisa de correção cadastral com informação verificada; o sistema não inventa dígitos.

# Histórico e Auditoria

Capturas anteriores e tentativas incertas são preservadas. Uma nova falha local de validação antes do cliente segue a política já existente: reserva/canal conservados e prova temporal de falha anterior ao POST. Corrigir o telefone não escala revisão ou libera reenvio automático. A canônica anterior é reutilizada sem POST.

Não foram produzidos logs com telefones reais, tokens, CPF ou conteúdo bancário bruto. Nenhuma cobrança foi recuperada, cancelada, reenviada ou emitida no BTG real nesta implementação.

# Plano de Testes

158 testes unitários novos cobrem formatos, idempotência da normalização, todos os DDD válidos e inexistentes, DDD 55, ausência, entradas incompletas/estrangeiras, controles, caracteres inválidos e não truncamento. Os testes existentes de documento e payload foram mantidos.

A suíte de integração de canais contém 111 casos e testa emissor/acordo/remessa com fixtures em memória: telefone válido chega normalizado ao mock; ausência omite o campo; telefone inválido não chama o cliente nem fetch; mensagem não reflete a entrada; cadastro/valores/datas/IDs ficam intactos; canônica incerta sem Collection ID continua sem reenvio.

Validação definitiva: suíte serial com 2.072 testes aprovados em 107 arquivos, um teste/arquivo externo BTG opt-in ignorado; TypeScript e build aprovados. Os testes unitários e os de integração foram executados no estado exato do código entregue. O servidor de desenvolvimento estava ativo, sem erros atuais de LSP/TypeScript na verificação de saúde. Não houve homologação no banco real.

# Plano de Reversão

Se houver regressão, retornar somente código do helper/adaptador e mensagem de erro ao checkpoint anterior após avaliação. Não restaurar banco, excluir evidências ou resetar tentativas para repetir POST. Uma futura atualização da VPS requer backup, build isolado e ativação aprovada.

# Critérios de Aceite

Dado telefone nacional válido, produzir `+55` com DDD/número intactos. Dado internacional brasileiro completo, não duplicar 55. Dado DDD nacional 55, preservar todos os dígitos. Dado ausência, omitir o campo. Dado número inválido, não executar POST e apresentar orientação estática sem valor sensível. Dada tentativa incerta anterior, não reclassificar, apagar, escalar revisão ou reenviar por causa desta correção.

# Riscos e Dependências

A correção de formato não comprova que todos os outros campos estejam aceitos pelo BTG. HTTP 400 e listagem vazia não se tornam prova automática para reenvio. Não contornar uma tentativa incerta criando acordo substituto ou mudando canal. A validação em memória não substitui homologação bancária ou testes concorrentes InnoDB reais.

# Pendências para Validação

A validação técnica foi concluída e o estado será identificado pelo checkpoint da entrega. A atualização da VPS e o teste financeiro real ainda não foram autorizados nesta aprovação. O usuário informou aplicação das estruturas 0101/0102 e ativação do build `1c70e62d`; isso não foi alterado pelo desenvolvimento da correção do telefone. Esta correção não exige migração adicional.

# Próximos Passos

Após testes e checkpoint, disponibilizar a correção pelo GitHub para futura atualização autorizada da VPS. Situação/reenvio de qualquer título histórico depende do fluxo controlado de recuperação e de prova suficiente; não instruir retry cego.

## Referências

[1]: https://developers.empresas.btgpactual.com/docs/api-specs-target/Banking%20-%20Collections/criar-cobranca "BTG — Criar Cobrança; exemplo payer.phoneNumber com +55"
[2]: https://www.gov.br/anatel/pt-br/assuntos/noticias/implementacao-das-novas-areas-locais-da-telefonia-fixa-comeca-em-janeiro-com-reducao-de-4-118-para-67-areas "Anatel — relação dos 67 DDD nacionais no cronograma 2026"
[3]: https://www.itu.int/dms_pub/itu-t/oth/02/02/T020200001D0003PDFE.pdf "Anatel/UIT — plano brasileiro, prefixos fixos e nono dígito móvel"
