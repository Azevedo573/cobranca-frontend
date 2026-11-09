# Plano — correção do telefone BTG

Aprovado em 09/11/2026, somente desenvolvimento/testes.

- [x] Diagnosticar retorno e registrar regras em docs/specs/SPEC-btg-telefone-pagador.md.
- [x] Criar regressões unitárias antes da implementação; observar falha inicial (158 casos).
- [x] Implementar normalização/validação pura e integrar ao payload BolePix.
- [x] Preservar mensagem estática de domínio antes do cliente, sem vazar números.
- [x] Testar fluxo acordo/remessa com mocks: normalização, ausência, inválidos sem POST e canônica incerta preservada (111 testes na suíte de canais API).
- [x] Executar testes específicos, suíte serial completa (2.072 aprovados / 1 externo opt-in ignorado), TypeScript, build e diff check.
- [x] Finalizar ocorrência/backlog e preparar o estado validado para checkpoint de entrega, sem deploy.

Responsabilidades: agente principal edita helper/adaptador/erro de domínio e documentação; frente paralela edita somente testes de integração em server/btg-canais-api.test.ts.

Etapas externas, não autorizadas nesta implementação:
- [ ] Implantar na VPS com novo backup e compilação isolada após aprovação.
- [ ] Homologar com conta/dados reais e autorização financeira própria; sem retry automático de tentativa histórica.
