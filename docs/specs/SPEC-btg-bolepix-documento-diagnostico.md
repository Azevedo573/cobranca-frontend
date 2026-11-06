# Especificação — documento BolePix e diagnóstico protegido

Status: aprovada pelo usuário em 06/11/2026 às 16:38:30 para implementação e testes no desenvolvimento. Origem: HTTP 400 da emissão #1, parcela #19 do acordo #5. Sem autorização de reenvio, recuperação da reserva ou novo deploy na VPS.

## Objetivo

Corrigir o identificador documental incompatível com o contrato oficial BolePix e tornar erros futuros investigáveis sem expor dados pessoais/segredos. Preservar a reserva canônica, exclusividade API/CNAB e identificação da tentativa já realizada.

## Evidência e limite da conclusão

O schema específico `CreateBankslipPixRequest`/`BankslipPixDetailRequest` do asset oficial declara `detail.documentNumber` obrigatório, string com `maxLength:15`. O emissor atual envia `parcela_acordo-19-R1`, com 20 caracteres, comprovadamente incompatível. O erro original foi descartado pelo cliente; não se pode afirmar que essa foi a única causa da resposta 400. [1] [2]

O objeto 400 documentado contém `name`, `brn`, `reason` e `invalidParams`, com itens `name`, `reason` e `value`. `value` nunca deverá ser exibido/persistido no diagnóstico. O exemplo de erro não é um catálogo completo de causas. [1] [2]

## Escopo

Backend Collections v2, montagem/validação do payload, mensagem segura nas telas já existentes e registros locais permitidos. Mantém React/tRPC/Drizzle/MySQL, sem bibliotecas novas, migração ou concessão de acesso.

1. Gerar identificador compacto determinístico para novas requisições, por exemplo `PA19R1` para parcela #19/revisão 1. Validar IDs/revisão e o limite final, sem truncar IDs ou criar colisões.
2. Validar `documentNumber` com até 15 caracteres e `correlationId` com até 20 antes de qualquer POST. Aplicar os limites oficiais de endereço quando um endereço for enviado: city50/street40/number10/neighborhood20/zipCode8. Valores de endereço não são truncados automaticamente; mensagens indicam o campo a revisar. Não exigir formatos não declarados a partir de exemplos.
3. Capturar resposta de erro com limite de tamanho, parsing defensivo e metadados/mensagens sanitizadas. Incluir código HTTP e nomes de campos/motivos seguros; nunca valores de `invalidParams`, corpo integral, headers de autorização, CPF/CNPJ, e-mail, telefone, conta ou Pix. Corpo não JSON, vazio, excessivo ou ilegível mantém mensagem genérica segura.
4. Mostrar erro sanitizado nas telas existentes, que já exibem a mensagem do item; preservar registro limitado em `btgRemessaItens.mensagem` e auditoria administrativa existente quando o fluxo permitir. Se a definição de persistência exigir mudança de schema, pedir nova aprovação antes de fazê-la.

## Fora do escopo

Reenviar emissão #1, limpar sua reserva, mudar revisão/externalId/canal, migrar títulos, cancelar cobrança, gerar CNAB como alternativa de erro, alterar valores/datas/snapshots, mudar conta/CNPJ/credenciais/OAuth/webhook ou implantar na VPS. Não recriar título para descobrir o erro. A melhoria não recupera retrospectivamente a resposta já descartada.

## Identificadores e compatibilidade

`documentNumber` é referência documental enviada ao banco; não é o nosso número local `1000000018`, nem um Collection ID. Não modificar registros existentes. Preservar `externalId=v2:prd:parcela_acordo:19:r1`, chave idempotente e vínculo parcela/acordo/integração. O contrato consultado não estabelece requisito UUID para `detail.externalId`, nem `additionalProperties:false`; sua ausência das propriedades declaradas não comprova que causou a recusa. Não remover ou reformatar esse campo como hipótese não demonstrada. [2]

## Segurança e regra financeira

Erro 400/422/500, timeout e falha de persistência continuam sem reenvio/fallback automático e sem liberação de canal. A emissão atual #1 permanece `incerta`, com seu erro histórico preservado. A recuperação dessa tentativa requer verificar situação no BTG e aprovação específica; a aprovação desta proposta não autoriza novo POST nem mudança de status.

Validar erros com dados sintéticos que contenham CPF/CNPJ, e-mails, tokens e payload Pix; garantir que nenhum deles aparece na mensagem/registro. Acesso administrativo e carteira continuam validados no router. Não transformar mensagem bancária em HTML executável.

## Arquivos e estilo

Arquivos principais: `server/btg-v2/bolepix.ts`, `server/btg-v2/issuance.ts`, `server/btg-v2/client.ts`; testes em `server/*btg*.test.ts`. Usar helpers tipados, mensagens em português, exceções existentes/derivadas compatíveis e funções puras para geração/redação. Preservar contratos das telas e resultados canônicos.

Contrato do helper de erros em `server/btg-v2/errors.ts`: exportar `BtgV2HttpError` derivado de `BtgV2ConfigurationError`, com `diagnostico` já sanitizado, e `obterDiagnosticoHttpBtg(error)` que retorna somente dados de uma instância reconhecida. Tipo `BtgV2DiagnosticoHttp`: `httpStatus:number`, `camposInvalidos:string[]`, `motivos:string[]`, `requestId?:string`, `codigo?:string`. Nenhum campo arbitrário é repassado. `motivos` deve preservar somente frases reconhecidas/seguras ou templates genéricos; nomes de campos precisam de allowlist. Não é suficiente remover apenas dígitos de mensagens bancárias desconhecidas, pois podem conter nomes/endereço/segredos.

Leitura do corpo limitada em streaming a 32 KiB, até 5 segundos na resposta de erro; no máximo cinco campos/motivos reconhecidos e mensagem final até 500 caracteres. Corpo excessivo, pendente ou ilegível é cancelado e usa fallback. GET/DELETE podem usar o mesmo helper defensivo sem mudar URL, parâmetros ou semântica. Diagnóstico opcional de resultado (`diagnosticoHttp`) deriva apenas desse helper e pode ser preservado em auditoria administrativa existente; o cliente/telas não recebem corpo original. Não persistir um payload novo nem modificar a emissão canônica existente.

## Plano de testes e aceite

- Gerador retorna `PA19R1` e identificadores distintos para parcelas distintas; IDs/revisões inválidos e identificadores >15 são recusados, sem truncamento.
- Payload aceita documento de 15 caracteres, recusa 16, preserva montante/data/tipo/conta/origem. CorrelationId20 aceita/21 recusa. Limites de endereço testados individualmente sem expor valores.
- Cliente simulado com erro 400 e `invalidParams` mostra campo/motivo seguros e HTTP, sem `value`; JSON malformado/não JSON/vazio/grande ou leitura falha mantém fallback.
- Testes de redação cobrem segredos/dados pessoais em campos e motivos, sem retry; sucesso BolePix inalterado.
- Reserva #1 não sofre alteração, e nenhuma consulta canônica implica outro POST. Bloqueios API/CNAB e RBAC/carteira permanecem.
- Suíte completa serial, TypeScript, build e diff aprovados antes do checkpoint. Não homologar com emissão real sem nova autorização.

## Comandos

```bash
pnpm exec vitest run server/btg-v2-bolepix.test.ts server/btg-v2-client.test.ts --no-file-parallelism --reporter=default
pnpm exec vitest run --no-file-parallelism --reporter=default
pnpm check
pnpm build
```

## Reversão e próximos passos

Rollback de código mantém dados existentes e reserva/canal protegidos; não restaurar dump antigo. Implementação e validação concluídas no desenvolvimento em 06/11/2026: 188 regressões específicas e suíte completa com 1343 testes aprovados/1 externo opt-in ignorado, TypeScript, build e diff aprovados. Leitura local /login-admin HTTP200; telas não foram exercitadas com emissão autenticada real. Testes de HTTP e banco usam fixtures, não a API BTG ou o banco da VPS.

Helpers de geração/limites e diagnóstico protegido integrados ao emissor/cliente, sem alterar externalId/chave/valores/datas/conta/canal canônico. Resultado e auditoria administrativa preservam apenas diagnóstico permitido. Sem schema/migration/dependências ou credenciais alterados. A canônica #1 incerta foi exercitada em fixture sem nenhuma escrita ou POST. Em Produção, o erro original continua sem corpo recuperável pelo código anterior.

Depois, mediante solicitação, planejar deploy específico e diagnóstico/recuperação da emissão #1 em etapas separadas. A VPS permanece 5756c31b e o envio real continua dependendo de revisão e confirmação do usuário.

## Referências

[1]: https://developers.empresas.btgpactual.com/docs/api-specs-target/Banking%20-%20Collections/criar-cobranca "BTG Collections — criação e respostas de erro"
[2]: https://developers.empresas.btgpactual.com/assets/js/b05136c2.10e8401d.js "Asset oficial de criar-cobranca.api.mdx com schema específico BolePix"
