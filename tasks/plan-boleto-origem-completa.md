# Plano — boleto com origem completa paginada

Decisão aprovada em 09/11/2026 às 17:12: manter origem integral e paginar; ficha bancária completa ao final. Spec: `docs/specs/SPEC-boleto-origem-completa-paginada-2026-11-09.md`.

## Sequência e critérios

- [x] Confirmar se a origem deve sair do boleto ou continuar; usuário escolheu manter/dividir.
- [x] Registrar regras, escopo, limites e reversão antes do código.
- [x] Criar regressões RED com PDFs reais sintéticos: comparação isolada em 5cded7aa com 21 falhas/14 aprovações nos 35 testes iniciais; desenvolvimento não foi revertido.
- [x] Substituir origem adaptativa por planejamento/renderização integral por altura; cabeçalhos repetidos e primeira página aproveitada.
- [x] Paginar resumo/avisos muito longos sem perder conteúdo, preservando semântica financeira; principal da mesma dívida não repetido na continuação.
- [x] Reservar a ficha inteira depois da origem com medidas compatíveis com seu desenho, sem quebra interna ou página exclusiva obrigatória; instruções medidas e ficha maior que A4 bloqueada explicitamente.
- [x] Adaptar somente expectativas documentais antigas invalidadas pela opção aprovada; manter todos os testes de códigos/valor/Pix/permissões/snapshots.
- [x] Rodar testes direcionados: oito arquivos/131 testes aprovados; 53 novos (12 planejador + 41 PDF). TypeScript, build e diff check aprovados.
- [x] Concluir suíte completa serial com BTG_SANDBOX_CREDENTIAL_CHECK=false: 125 arquivos/2.640 testes aprovados e um externo opt-in ignorado.
- [x] Renderizar/inspecionar amostras fictícias curtas e longas; QR/Pix 143 bytes CRC C133 e I25 de 44 dígitos decodificados das páginas 300 DPI, sem pagamento.
- [x] Atualizar documentação/backlog e preparar checkpoint de desenvolvimento com escopo restrito à paginação.
- [ ] Implantação e homologação na VPS somente após nova autorização e confirmação de saída; não executar migration ou operação bancária por este plano.

## Responsabilidades paralelas

Parent: especificação, renderizador/paginador e integração/checagem final.
Agente de testes novos: apenas `server/boleto-origem-paginada.test.ts`.
Agente de regressão: apenas três testes documentais existentes (`origem-documentos-pdf`, `btg-boleto-pdf`, `boleto-sem-destaque-valor`).

## Limites

Sem alteração de banco, schemas, dependências, frontend/tRPC, snapshots, emissor, canal, valor, status ou arquivos antigos. Dados e exemplos estritamente fictícios. Sem BTG real ou VPS. Não incluir Central Jurídica.
