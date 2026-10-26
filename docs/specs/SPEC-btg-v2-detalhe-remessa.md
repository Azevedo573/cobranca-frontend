# Especificação — Detalhe Operacional de Remessa BTG

## Objetivo

Permitir que administradores abram uma remessa BTG e entendam, em uma única tela lateral, o estado do lote e de cada parcela emitida, sem reenviar cobranças nem disparar consultas automáticas ao BTG.

## Usuário e problema

O administrador já encontra a remessa na gestão, mas o painel existente mostra apenas totais e um resultado resumido por item. Faltam contexto financeiro, vínculo com acordo/devedor, dados de vencimento e identificadores da emissão.

## Escopo

- Evoluir o painel lateral acionado por `Acompanhar` em **Banco → Remessas BTG**.
- Cabeçalho com número, ambiente, status, condomínio e totais em cartões.
- Exibir dados operacionais do lote: criação, início/finalização, observação, conta recebedora mascarada e resumo de falha quando houver.
- Exibir cada item com acordo, devedor, parcela/entrada, vencimento, valor, resultado, mensagem operacional e dados persistidos da emissão.
- Para emissão existente, mostrar status, Collection ID copiável, data de emissão, Pix copia-e-cola, linha digitável e link de boleto apenas se cada campo estiver disponível.
- Manter a conciliação manual já existente como ação explícita do administrador.

## Fora do escopo

- Criar, reenviar, cancelar ou alterar cobranças a partir da visão de detalhe.
- Fazer consultas BTG automáticas ao abrir o painel.
- Alterar valores, vencimentos, acordos, parcelas ou remessas existentes.
- Expor CPF/CNPJ, tokens ou credenciais bancárias.

## Dados e permissões

- Reutilizar `btgRemessas`, `btgRemessaItens`, `btgCobrancasEmitidas`, `parcelasAcordo`, `acordos`, `devedores` e conta recebedora já vinculada.
- Nenhuma migration.
- Procedure `btgV2.detalheRemessa` continua exclusiva de administrador e limitada à integração/ambiente ativo.

## Regras e exceções

1. Um item sem emissão mostra apenas dados da parcela e sua mensagem atual.
2. Um item com falha mostra mensagem sem sugerir reenvio automático.
3. Links e dados de pagamento só são mostrados quando persistidos localmente.
4. Collection ID pode se repetir no Sandbox; é apresentado como identificador de resposta do ambiente, não como prova de cobrança real.
5. O painel permanece somente leitura, exceto pela conciliação manual existente.

## Design

Usar o padrão da referência administrativa atual: superfície clara, cartões de métrica com bordas suaves, azul institucional como destaque, verde para sucesso, âmbar para atenção, vermelho para falha e hierarquia compacta em um painel lateral responsivo.

## Critérios de aceite

- Dado um administrador e uma remessa processada, quando clicar em `Acompanhar`, então vê status, totais, condomínio, datas e todos os itens sem sair da lista.
- Dado um item emitido, quando abrir o detalhe, então vê acordo, devedor, vencimento, valor, resultado e os dados BTG disponíveis.
- Dado um item sem Pix, linha ou boleto persistido, então a interface não exibe botões vazios.
- Dado um usuário não administrador, quando invocar a procedure de detalhe, então recebe bloqueio de permissão.
- A abertura do detalhe não cria, reenvia ou consulta nenhuma cobrança automaticamente.

## Validação

- Teste de RBAC da procedure de detalhe.
- Testes existentes de remessas e emissões.
- `pnpm check` e `pnpm build`.
