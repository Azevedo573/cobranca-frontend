# Plano — recebimento BTG e quitação de acordo

Aprovação11/11/2026 às17:30, desenvolvimento apenas. Spec: docs/specs/SPEC-recebimento-btg-acordos-2026-11-11.md. Sem schema/migration/dependências, VPS, API/DB real ou reentrega do acordo12.

- [x] Confirmar a aprovação completa, explicitar limites e registrar spec antes de código.
- [x] Criar testes RED monetários, serviço e integrações; logs de comparação antes do código preservados.
- [x] Implementar conversão BTG reais→centavos exata/prova explícita/data e diagnóstico de payload protegido.
- [x] Implementar contexto bloqueado/recebimento transacional/valorPago/conclusão e origens sem apagar descrição/valor.
- [x] Alinhar saldo/devedor para outras dívidas/acordos e sem duplicar origem/plano; leituras em lote.
- [x] Integrar webhook/client/conciliação e manual com o serviço, idempotência/RBAC/estados/auditoria estrita.
- [x] Adaptar fixtures em centavos externos para reais sem retirar casos/assertivas; 470 testes focados aprovados/11arquivos, 81 testes autorização/manual/2arquivos. TypeScript/build/diff aprovados.
- [x] Suíte final serial: 3.263 testes/140 arquivos aprovados, um arquivo/teste externo opt-in ignorado, sem erros não tratados. Fixture de vencimentos/identidade/datas corrigida sem afrouxar guards. TypeScript/build/diff definitivos aprovados, DATABASE_URL vazio e opt-in BTG desligado.
- [x] Registrar resultado, limites de homologação/reversão e preparar documentação/evidências para checkpoint validado.
- [ ] Autorizar separadamente deploy, conferir envelope/URL/resposta real e planejar reentrega/baixa controlada sem nova cobrança.

Responsáveis por arquivos distintos: núcleo recebimento/serviço; saldo e adaptador manual; regressões/fixtures BTG; parent integra moeda/webhook/consulta/conciliação e validação final. Nenhum agente pode operar pessoas/valores reais, alterar estrutura ou arquivos de outro responsável.
