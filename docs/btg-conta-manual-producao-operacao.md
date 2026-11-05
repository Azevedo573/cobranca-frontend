# Conta BTG manual em Produção — operação e implantação controlada

Implementação aprovada em 05/11/2026. Este documento não comprova implantação, titularidade ou emissão bancária. A VPS permanece na versão documental anterior à Central Jurídica até uma operação de release explicitamente autorizada.

## O que muda

A conta do escritório poderá ser cadastrada pelo administrador com origem **Manual — Produção**, sem consultar Accounts. Agência, número, titular e CNPJ devem ser conferidos em fonte bancária confiável. CNPJ deve ser válido e igual ao da integração First-Party configurada. O cadastro registra confirmação administrativa, não validação pela API BTG.

Contas **Manual — Sandbox** não migram para Produção. Dados de contas já usadas não são corrigidos retroativamente: cadastrar a nova conta e ajustar explicitamente o vínculo futuro. Boletos já emitidos permanecem associados ao beneficiário anterior.

## Configuração sem o produto Accounts

Para operar pelo caminho manual quando o aplicativo não possui consulta Accounts, adicionar ou ajustar somente esta opção no `.env` da VPS, em etapa operacional posterior:

```dotenv
BTG_ACCOUNTS_ENABLED=false
```

Se ausente ou `true`, permanece o escopo de Accounts usado anteriormente. A opção controla as permissões do **próximo consentimento**. Não remove permissões nem modifica tokens já conectados automaticamente. Reinício da aplicação e nova autorização OAuth devem ser realizados conscientemente pelo administrador; não trocar Client ID/Secret ou chave de criptografia por causa desta opção.

O consentimento sem Accounts continua exigindo `openid` e `brn:btg:empresas:banking:collections`. Open Finance não é substituto de Collections. A consulta oficial fica indisponível nesse modo; o cadastro manual local não faz nenhuma requisição ao banco.

## Uso após implantação

Abrir Banco → BTG — Configuração → Contas e condomínios. Confirmar ambiente Produção e conta OAuth conectada. Clicar em Cadastrar manualmente, preencher agência/número sem formatação e sem perda de zeros, titular/CNPJ e rótulo. Conferir o resumo, marcar a declaração de conferência e digitar `CADASTRAR CONTA PRODUCAO`. O sistema deve identificar a origem manual e mostrar o registro de confirmação, sem ativar emissão.

Selecionar explicitamente o condomínio e salvar o vínculo à conta do escritório. Não selecionar conta do condomínio nem terceiros neste modelo. Antes da primeira emissão, confirmar o beneficiário esperado com o responsável bancário. Se o BTG recusar a conta ou a autorização, preservar o erro e não trocar valores/dados aleatoriamente nem repetir uma emissão incerta.

## Emissão continua separada

Cadastrar conta não libera BolePix. Permanece necessária a confirmação `LIBERAR PRODUCAO`, com OAuth conectado, conta elegível, vínculo e webhook adequadamente configurado. Um segredo de webhook arbitrário só para passar pela verificação do servidor não comprova assinatura bancária: alinhar o contrato real com o BTG e homologar entrega, HMAC, deduplicação e baixa antes de disponibilizar cobranças ao cliente.

O fluxo segue acordo ativo → parcelas pendentes elegíveis → remessa de um condomínio → revisão e confirmação → envio. Parcela com CNAB/registro bancário conflitante ou emissão existente não pode ser duplicada. Uma resposta incerta não é autorização para reenviar. A primeira emissão real exige aprovação do pagador/parcela, valor, vencimento e conta recebedora, e conferência do beneficiário retornado antes de entregar o título.

## Migração estrutural exclusiva BTG

`drizzle/0099_brave_true_believers.sql` amplia somente `btgContasRecebedoras`: origem `manual_producao`, `confirmadoPorId` e `confirmadoEm` nullable. Não converte contas ou confirmações anteriores e não atualiza registros financeiros. Já aplicada somente no desenvolvimento; não aplicada na VPS nesta implementação.

Para uma futura aplicação aprovada, existe o utilitário `scripts/provisionar-btg-conta-manual-producao.cjs`. Ele não executa migrations gerais nem registra/aplica a migração Jurídica 0098. Verifica o enum anterior, colunas e defaults, recusa estrutura incompatível, é idempotente e exige confirmação antes de conectar em modo de aplicação. As três DDL fazem commit implícito no MySQL; se houver falha parcial, interromper rollout e reavaliar em modo check.

Comandos para a etapa futura, somente depois de backup e revisão do alvo:

```bash
cd /var/www/cobranca || exit 1
node scripts/provisionar-btg-conta-manual-producao.cjs --check
# Somente com aprovação operacional e backup concluído:
node scripts/provisionar-btg-conta-manual-producao.cjs --apply --confirmar=AMPLIAR_CONTA_MANUAL_BTG_PRODUCAO
node scripts/provisionar-btg-conta-manual-producao.cjs --check
```

Não executar `pnpm db:push`, `drizzle-kit migrate`, `drizzle-kit generate`, o journal global ou scripts de migrations abrangentes na VPS para esta entrega seletiva. Eles podem incluir pendências históricas e a Central Jurídica não solicitada.

## Release de código sem a Central Jurídica

A branch principal do desenvolvimento inclui a Central Jurídica. **Não usar git pull main indiscriminadamente para este ajuste BTG**, nem copiar o schema completo do desenvolvimento para a VPS: isso pode levar schema/código jurídicos sem sua migração ou aprovação.

Preparar e validar um pacote/patch BTG específico sobre o commit confirmado na VPS (última versão de código conhecida: `0720d6a3`, com registro documental `85a610a6`). A alteração de schema no pacote deve conter somente o trecho BTG 0099, sem tabelas/colunas jurídicas. Nenhum journal/snapshot agregado da branch completa deve ser aplicado como substituto da migração específica.

A etapa operacional deverá confirmar o commit real, alterações locais, backup de aplicação/banco/.env, teste de aplicação do patch e validação do código resultante antes de trocar o serviço. Build e permissões de leitura da aplicação permanecem como no procedimento homologado. Nenhum segredo deve ser incluído no pacote, em Git ou no chat. O pacote validado não deve ser enviado/aplicado automaticamente.

## Verificação e retorno seguro

Após rollout aprovado: PM2 online, login local/HTTPS, configuração BTG pronta, origem manual correta, cadastro inválido bloqueado, OAuth e ausência de ativação automática. Só depois iniciar o piloto financeiro separado.

Para rollback de código, restaurar a aplicação/commit pré-release e reiniciar o processo anterior. Não remover enum/colunas nem apagar conta, confirmação ou auditoria. Se já houve emissões, preservá-las e tratar conciliação/cancelamento pelo fluxo auditado; não restaurar snapshot antigo de banco sobre novas transações. Caso seja preciso voltar à consulta oficial, ajustar explicitamente a opção Accounts e reconectar com autorização compatível.

## Pendências externas

Dados reais da conta conferidos pelo administrador; implantação seletiva autorizada; webhook de Produção homologado; teste real de cadastro/vínculo na VPS e revisão da primeira cobrança. Nenhuma dessas etapas é substituída por testes automatizados ou amostras visuais de desenvolvimento.

## Evidência técnica de desenvolvimento — 05/11/2026

Suíte completa serial: 856 testes aprovados, um externo BTG opt-in ignorado. `pnpm check` e `pnpm build` aprovados. Os testes cobrem cadastro/confirmacão administrativa, CNPJ/ambiente, rollback de auditoria, imutabilidade, idempotência, recusa de Sandbox em Produção, alteração de conta/configuração antes do envio, pré-requisitos e payload bancário com fetch simulado.

Inspeção visual: componentes reais com dados fictícios isolados no navegador, sem login nem handlers de API. Botão inicialmente bloqueado, habilitado apenas após declaração e texto literal, com confirmação exclusivamente local. Navegador devolvido à página de login normal. O modo/credenciais efetivos do Sandbox não foram alterados.

Pacote seletivo: patch de 23 arquivos BTG aplicado em worktree local baseado em `85a610a6`, sem a Central Jurídica. Validação independente: 705 testes aprovados/um externo ignorado, TypeScript e build frontend/backend aprovados. A diferença de schema é exclusivamente a conta BTG; não inclui migration 0098 nem journal/snapshots agregados ou `.env`. Essa validação local não comprova o commit/estado atual da VPS, que precisa ser conferido antes do rollout. Consultar o README e manifesto do pacote; nenhuma aplicação remota realizada.
