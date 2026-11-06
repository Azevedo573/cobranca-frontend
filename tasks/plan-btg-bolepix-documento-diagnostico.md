# Plano — documento BolePix e diagnóstico protegido

Aprovado em 06/11/2026 às 16:38:30. Fonte: `docs/specs/SPEC-btg-bolepix-documento-diagnostico.md`. Implementação técnica concluída no desenvolvimento; nenhum POST BTG real, reenvio da emissão #1, alteração de reserva, migration ou deploy.

## Responsabilidades executadas

Payload/emissor e integração de resultado; helper HTTP/cliente com testes de proteção; auditoria administrativa com sanitizador independente. As frentes foram integradas e a especificação/ocorrência/manual/backlog atualizados.

## Checklist técnico

- [x] Especificação aprovada e contrato de diagnóstico definido antes da implementação.
- [x] Gerador compacto PA{id}R{revisão} e limites documental/correlação/endereço, sem truncar IDs ou valores; testes de fronteira e Unicode.
- [x] Cliente lê erro em streaming de até 32 KiB e prazo global de 5s, com cancelamento defensivo/fallback e nenhum retry.
- [x] Sanitização por allowlist/templates, sem valores inválidos, corpo integral, segredos ou dados pessoais; mensagem <=500 e cópias reconhecidas/imutáveis do diagnóstico.
- [x] Gerador integrado mantendo externalId/chave/origem/valor/datas/conta; canônica #1 incerta sem Collection ID não é alterada nem reenviada na fixture.
- [x] Resultado opcional, item/resumo de remessa e auditoria administrativa preservam somente diagnóstico seguro; tela existente renderiza mensagem como texto.
- [x] Regressões de formato oficial, adversariais, ausência de retry, prazo global/falha de stream, reserva e auditoria: 188 testes aprovados em 7 arquivos.
- [x] Suíte serial completa: 1343 testes aprovados, 1 externo opt-in ignorado, 92 arquivos aprovados/1 ignorado; TypeScript/build e diff final aprovados. Desenvolvimento /login-admin HTTP200.
- [x] Ocorrência, manual, especificação e backlog atualizados; arquivos completos e preparados para checkpoint pelo fluxo GitHub, sem deploy.

## Limites externos

Emissão real #1 permanece incerta e protegida. A situação bancária, eventual recuperação, atualização da VPS e nova tentativa financeira exigem etapas separadas. A melhoria não recupera retroativamente o corpo descartado. Testes usaram respostas HTTP/bancos simulados; nenhuma conta/pagador/título real foi criado ou modificado.
