# Spec: Emissão BolePix BTG v2 por Acordo

## Objetivo

Transferir a origem operacional da emissão BolePix BTG v2 de uma cobrança avulsa para um acordo ativo. Após a criação de um acordo, o usuário administrador poderá abrir uma revisão das parcelas e enviá-las ao BTG em uma única ação controlada.

O objetivo é garantir que o valor, vencimento e composição financeira enviados ao BTG derivem do acordo formalizado, preservando a idempotência por parcela, o vínculo com o acordo e a trilha de auditoria.

### História de usuário

Como administrador, após criar um acordo, quero selecionar quais parcelas pendentes serão enviadas ao BTG, com todas pré-selecionadas, para homologar ou emitir os BolePix do acordo sem criar boletos para dívidas avulsas ou duplicar títulos já processados.

### Premissas aprovadas

1. O seletor abre no contexto de um acordo ativo.
2. Parcelas pendentes ou atrasadas ficam pré-selecionadas, inclusive a entrada quando ela existir.
3. O usuário pode desmarcar parcelas antes de confirmar.
4. A ação não é automática: uma confirmação explícita é obrigatória.
5. A fase atual continua limitada ao Sandbox; as respostas são simuladas por Wiremock e não persistem cobranças no portal BTG.
6. A emissão permanece restrita a administradores enquanto a homologação estiver ativa.
7. A experiência aprovada combina um cabeçalho executivo no detalhe do acordo com um painel lateral de seleção, mantendo o contexto do acordo visível durante a revisão.

## Problema atual

O backend aceita `origemTipo: cobranca` e `origemTipo: parcela_acordo`. A interface de detalhe do devedor permite abrir uma emissão para dívida avulsa, enquanto as telas de acordo contêm botões individuais por parcela misturados à configuração legada `modoBoleto=api_btg`.

Isso conflita com a regra de negócio aprovada: a cobrança via API BTG só pode ser enviada depois que um acordo foi criado.

## Escopo

- Remover a emissão BolePix v2 de cobranças avulsas no frontend e bloquear essa origem no backend.
- Criar uma operação de lote por acordo com seleção explícita de parcelas.
- Pré-selecionar parcelas pendentes e atrasadas, incluindo entrada; excluir parcelas pagas ou canceladas.
- Validar que todas as parcelas selecionadas pertencem ao acordo ativo informado.
- Exibir motivos de bloqueio antes da confirmação para parcela vinculada a CNAB/BTG legado, sem vencimento ou com dados do pagador insuficientes.
- Preservar a idempotência por parcela e retornar resultado individual de cada seleção.
- Exibir ação de revisão/envio após a criação do acordo e no detalhe de um acordo ativo.
- Registrar auditoria agregada da solicitação e manter os registros canônicos existentes por parcela.
- Comunicar em toda a interface que o Sandbox é uma simulação e não cria cobrança persistida no portal bancário.

## Fora do Escopo

- Emissão em Produção, boleto real ou PIX real.
- Envio automático ao criar acordo.
- Cancelamento em massa, reemissão por revisão, alteração de parcela ou recuperação de cobranças históricas.
- Exclusão da emissão avulsa já registrada no Sandbox: o registro histórico será preservado.
- Mudança no fluxo de CNAB 240 ou no legado `api_btg`.

## Tech Stack

- React 19, TypeScript, Vite, Tailwind e componentes shadcn.
- Express 4, tRPC 11, Zod e Drizzle ORM.
- MySQL para acordos, parcelas, emissões e auditoria.
- API BTG Collections BolePix, exclusivamente no endpoint Sandbox atual.
- Vitest para testes unitários e de contrato.

## Comandos

```bash
cd /home/ubuntu/cobranca-frontend
pnpm exec vitest run server/btg-v2-acordo-emissao.test.ts --no-file-parallelism --reporter=verbose
pnpm exec vitest run --no-file-parallelism --reporter=default
pnpm check
pnpm build
```

## Estrutura do Projeto

```text
client/src/pages/AcordoDetalhes.tsx                 # Ação principal e estado do acordo
client/src/components/BTGEnviarParcelasAcordoModal.tsx # Seleção, revisão e confirmação
client/src/components/RealizarAcordoModal.tsx       # Ação disponível após criar o acordo
client/src/pages/DevedorDetalhes.tsx                # Remove entrada de emissão avulsa
server/routers/btg-v2.ts                            # Procedure de lote exclusiva de acordo
server/btg-v2/issuance.ts                           # Validação de origem e emissão por parcela
server/btg-v2-acordo-emissao.test.ts                # Regras e idempotência do lote
docs/specs/                                         # Especificação e documentação operacional
```

## Fluxo Proposto

1. O usuário cria o acordo normalmente; nenhuma emissão é feita nesse momento.
2. O estado de sucesso da criação oferece a ação `Revisar parcelas para enviar ao BTG`.
3. A ação abre o modal do acordo, que carrega as parcelas, o estado da integração e emissões canônicas já existentes.
4. Parcelas pendentes e atrasadas elegíveis aparecem pré-selecionadas. A entrada é tratada como parcela elegível quando estiver pendente ou atrasada.
5. Parcelas pagas, canceladas, já vinculadas a CNAB/BTG legado ou que falhem em pré-requisito são mostradas bloqueadas, com motivo, sem caixa de seleção.
6. O usuário pode desmarcar parcelas elegíveis e revisa quantidade, valor total e vencimentos.
7. Ao confirmar, o frontend envia `acordoId` e a lista de `parcelaIds` selecionados ao backend.
8. O backend valida o acordo ativo, a associação de todas as parcelas e os pré-requisitos. Depois processa uma parcela por vez, reaproveitando a trava de idempotência existente.
9. O resultado retorna por parcela: simulada com sucesso, emissão já existente, bloqueada ou falha/incerta. Não haverá repetição automática após falha incerta.
10. A tela atualiza a lista de parcelas e exibe o resumo da simulação Sandbox.

## Regras de Negócio

1. Somente parcelas de um acordo com status `ativo` podem iniciar a emissão BolePix v2.
2. A procedure não aceitará mais `origemTipo: cobranca`; emissão direta de dívida avulsa será recusada no servidor, mesmo que uma interface antiga a invoque.
3. A seleção deve conter pelo menos uma parcela elegível.
4. Uma parcela selecionada deve pertencer ao `acordoId` informado. IDs de outro acordo devem falhar antes de qualquer POST ao BTG.
5. Parcelas `pago` ou `cancelado` não podem ser selecionadas.
6. Parcela com `nossoNumero`, `remessaId`, `btgCollectionId` legado ou status de remessa diferente de `nao_enviado` não pode ser enviada ao BolePix v2.
7. Cada parcela conserva uma chave de idempotência própria. Caso exista emissão canônica anterior para a mesma integração, origem e revisão, o resultado informa `já existente`, sem criar nova emissão.
8. Uma falha após o início do POST continua como `incerta`; o lote não tenta reenviar a parcela automaticamente.
9. O lote permite resultado parcial. Cada parcela recebe seu resultado e as demais elegíveis continuam processadas; a interface deve deixar claro o que ocorreu.
10. A integração deve estar ativa, o OAuth conectado, a homologação habilitada e o condomínio deve possuir conta recebedora vinculada.
11. O pagador precisa possuir CPF/CNPJ, nome, telefone e endereço completo conforme as validações atuais de BolePix.
12. O Sandbox usa `x-response: success`, portanto o resultado positivo deve ser rotulado como simulação; nunca como cobrança persistida no portal BTG.

## Telas e Experiência do Usuário

### Pós-criação do acordo

No estado de sucesso do `RealizarAcordoModal`, será exibido o botão secundário `Revisar parcelas para enviar ao BTG`. Ele só fica disponível após o retorno do ID do acordo criado e abre o seletor contextualizado.

### Detalhe do acordo

No cabeçalho do acordo ativo haverá o botão `Enviar parcelas ao BTG`. Ele abre o mesmo seletor reutilizável. A tabela de parcelas mostra a situação BolePix v2 apenas como estado/histórico; não terá um botão de emissão avulso por linha.

### Seletor de parcelas

O painel lateral à direita terá resumo do acordo, aviso de Sandbox, lista com número, valor, vencimento, situação, caixa de seleção e motivo de bloqueio. O cabeçalho terá seleção de todas as elegíveis. O rodapé fixo mostrará quantidade e valor das parcelas selecionadas, preservando o detalhe do acordo ao fundo.

A confirmação exibirá texto inequívoco: `Simular envio de N parcelas ao BTG Sandbox`. O botão só fica habilitado se houver seleção elegível e nenhum pré-requisito global pendente.

### Detalhe do devedor

A ação `Emitir BolePix` para cobranças avulsas será removida. O usuário verá a orientação de que a emissão BTG é disponibilizada depois da formalização de um acordo.

## Dados e Banco de Dados

Não é necessária migration para o primeiro corte. A tabela `btgCobrancasEmitidas` já registra uma emissão por `origemTipo`, `origemId` e revisão, e continuará sendo a fonte de verdade por parcela.

A emissão histórica de cobrança avulsa existente no Sandbox não será excluída nem alterada. Ela será mantida apenas para auditoria. Novas emissões avulsas serão bloqueadas.

O log de auditoria receberá um evento agregado por solicitação, contendo `acordoId`, quantidade selecionada, quantidade simulada, emissões já existentes, bloqueios e falhas. Nenhum token, documento completo do pagador, QR Code ou conteúdo sensível será registrado no audit log.

## Permissões

- A revisão pode ser visível aos perfis que podem visualizar o acordo, mas o envio/confirmar é exclusivo de `admin` enquanto o router BTG v2 for administrativo.
- Todas as procedures de lote permanecem protegidas por `adminProcedure`.
- A checagem de permissão no frontend não substitui a proteção no backend.

## Integrações e Automações

A operação de lote chamará internamente a emissão já existente para cada parcela, de forma sequencial e idempotente. Não será criada automação agendada e não ocorrerá chamada na abertura da tela.

## Histórico e Auditoria

- Registros canônicos de emissão por parcela: `btgCobrancasEmitidas`.
- Registro agregador de intenção e resultado: `auditLogs` por ação de lote.
- Histórico de webhook e conciliação permanece inalterado.
- Não haverá exclusão física de registros financeiros ou de homologação.

## Código e Convenções

```ts
// Um contrato explícito por acordo evita que uma parcela de outro acordo seja enviada.
emitirParcelasAcordo: adminProcedure
  .input(z.object({
    acordoId: z.number().int().positive(),
    parcelaIds: z.array(z.number().int().positive()).min(1).max(50),
  }))
  .mutation(async ({ input, ctx }) => {
    // valida acordo ativo → valida pertencimento → processa sequencialmente → audita resumo
  });
```

Usar nomes em português para o domínio, Zod em toda entrada tRPC, retornos estruturados por parcela e `BtgV2ConfigurationError` para pré-condições. Não usar `any` para contratos novos nem expor segredos ou dados bancários sem máscara.

## Estratégia de Testes

- Teste unitário: seleção padrão contém apenas parcelas pendentes/atrasadas e inclui entrada elegível.
- Teste de serviço: acordo cancelado, parcela de outro acordo, parcela paga e vínculo legado são bloqueados antes de criar reserva.
- Teste de idempotência: repetir o lote retorna a emissão existente por parcela sem chamar novamente o cliente BTG.
- Teste de resultado parcial: parcela válida é simulada, parcela bloqueada aparece no resumo e não interrompe a visibilidade do resultado.
- Teste de permissão: cobrador e síndico não executam a procedure administrativa.
- Teste de regressão: a origem `cobranca` é rejeitada pelo backend e não aparece na tela de devedor.
- Testes de interface: botão pós-criação e botão no detalhe direcionam ao seletor; confirmação exige ao menos uma parcela.
- Validação final: suíte completa, `pnpm check` e `pnpm build`.

## Limites

### Sempre fazer

- Validar acordo ativo, pertencimento da parcela, idempotência e pré-requisitos antes de cada envio.
- Preservar histórico e registrar auditoria agregada.
- Mostrar resultados parciais sem esconder bloqueios ou erros.
- Rodar todos os testes, TypeScript e build antes de checkpoint.

### Perguntar antes

- Criar ou alterar tabelas/migrations.
- Habilitar Produção, mudar ambiente, credenciais, escopos OAuth ou endpoint BTG.
- Alterar a regra de quais perfis podem enviar parcelas.

### Nunca fazer

- Criar cobrança real em Produção durante esta implementação.
- Apagar emissão, acordo, parcela ou histórico de auditoria.
- Reenviar automaticamente uma emissão `incerta`.
- Permitir emissão por cobrança avulsa após esta regra entrar em vigor.
- Armazenar token OAuth, CPF/CNPJ completo ou dados de pagamento em logs de auditoria.

## Critérios de Aceite

1. **Dado** um acordo ativo com três parcelas pendentes, **quando** o administrador abre o seletor, **então** as três aparecem pré-selecionadas.
2. **Dado** um acordo com entrada pendente, **quando** o seletor abre, **então** a entrada também aparece pré-selecionada.
3. **Dado** uma parcela paga, cancelada ou vinculada ao fluxo legado, **quando** o seletor abre, **então** ela não pode ser marcada e apresenta o motivo do bloqueio.
4. **Dado** uma seleção com parcelas de dois acordos, **quando** a procedure é chamada, **então** nenhuma emissão é criada e o servidor recusa a solicitação.
5. **Dado** uma parcela já registrada no BTG v2, **quando** o administrador a seleciona novamente, **então** o resultado informa que ela já existe e não envia novo POST.
6. **Dado** uma emissão de Sandbox bem-sucedida, **quando** o resultado é exibido, **então** a interface informa que é simulação e não cobrança persistida no portal bancário.
7. **Dado** uma cobrança avulsa, **quando** um usuário abre o detalhe do devedor ou tenta chamar o endpoint legado, **então** não encontra ação de emissão e o backend rejeita a origem.
8. **Dado** um usuário não administrador, **quando** tenta confirmar o envio, **então** recebe bloqueio de permissão.

## Riscos e Dependências

- O Sandbox BTG usa stubs; a homologação só valida contrato, tratamento de sucesso/erro e persistência local.
- O acordo pode ter dados do devedor incompletos. O seletor precisa antecipar essa pendência para evitar tentativa indevida.
- A emissão em lote é parcialmente concluível; a interface deve orientar uma nova tentativa somente para itens explicitamente bloqueados por pré-requisito, nunca para itens incertos.
- O fluxo depende de OAuth conectado, conta recebedora vinculada e homologação habilitada.

## Questões em Aberto

Nenhuma para a fase Sandbox. A regra de permissão permanece `admin` por segurança e deve ser reavaliada antes de Produção.

## Sucesso

A implementação estará concluída quando toda emissão BolePix nova estiver vinculada a uma parcela de acordo ativo, com seleção explícita, auditoria agregada, idempotência por parcela, nenhuma ação para dívida avulsa e validação automatizada dos cenários críticos.
