# Plano técnico — Gestão de Remessas BTG

## Ordem de implementação
1. Criar as entidades aditivas `btgRemessas` e `btgRemessaItens`, e a referência opcional de emissão para remessa.
2. Implementar o domínio do lote: elegibilidade, contadores, transições de status e resumo de resultados.
3. Criar procedures administrativas para fila por condomínio, criação/envio do lote, listagem, detalhe e conciliação.
4. Integrar a emissão idempotente por parcela ao lote, registrando cada resultado sem repetir cobranças.
5. Criar a tela Banco → Remessas BTG, o painel lateral de criação e o detalhe do lote.
6. Conectar rota e navegação; manter Conciliação BTG como visão operacional de títulos.
7. Validar migrations, testes de domínio/RBAC, TypeScript, build e fluxo visual.

## Riscos e controles
- Duplicidade: reservas e chaves idempotentes existentes permanecem obrigatórias; uma parcela já emitida não volta à fila.
- Mistura de beneficiários: lote de um único condomínio, validado pelo servidor antes da criação.
- Falha parcial: lote e itens são persistidos antes das chamadas; não há reenvio automático.
- Produção: a emissão continua subordinada à liberação BTG já existente e à confirmação explícita da tela.
