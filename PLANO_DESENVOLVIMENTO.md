# 📋 Plano de Desenvolvimento Estratégico
## Sistema de Gestão de Cobranças Condominiais

**Data:** 11 de Fevereiro de 2026  
**Objetivo:** Preparar o sistema para comercialização com funcionalidades robustas e experiência de usuário excepcional

---

## 🎯 Visão Geral do Contexto

### Perfil da Operação
- **Equipe:** 6-20 usuários simultâneos (equipe média)
- **Escala:** 15 condomínios, 20-30 devedores por condomínio (300-450 devedores totais)
- **Volume:** 10-20 cobranças novas/mês
- **Modelo:** Híbrido (remoto + presencial)
- **Objetivo:** Sistema SaaS pronto para venda de assinaturas

### Hierarquia de Acessos Definida

**1. Administrador**
- Acesso total ao sistema
- Gerencia condomínios, usuários, configurações
- Visualiza todos os relatórios e indicadores
- Define taxas, descontos e parâmetros globais

**2. Síndico**
- Acesso restrito ao seu condomínio
- Visualiza devedores, cobranças e acordos do seu condomínio
- Aprova acordos e decisões judiciais
- Acessa relatórios do seu condomínio

**3. Colaborador (Cobrador)**
- Acesso a devedores de todos os condomínios
- Registra tentativas de contato
- Cria e gerencia acordos
- **Sem acesso** a configurações gerenciais (taxas, preços, etc.)

---

## 🚀 Roadmap de Desenvolvimento

### FASE 1: Fundação e Controle de Acesso (Prioridade CRÍTICA)
**Prazo estimado:** Imediato  
**Status:** 🔴 Não iniciado

#### 1.1 Sistema de Permissões por Papel
- [ ] Implementar middleware de autorização por papel
- [ ] Criar filtros de dados por papel (síndico vê apenas seu condomínio)
- [ ] Adicionar validações no backend para proteger rotas sensíveis
- [ ] Implementar UI condicional baseada em papel do usuário
- [ ] Ocultar botões/menus de configuração para colaboradores

#### 1.2 Gestão de Usuários
- [ ] Página de cadastro de usuários com seleção de papel
- [ ] Vincular síndico ao condomínio específico
- [ ] Permitir admin ativar/desativar usuários
- [ ] Log de ações por usuário para auditoria

**Impacto:** 🔥 CRÍTICO - Sem isso, não é possível comercializar o sistema com segurança

---

### FASE 2: Operações Financeiras (Prioridade ALTA)
**Prazo estimado:** Após Fase 1  
**Status:** 🟡 Parcialmente implementado

#### 2.1 Dar Baixa em Parcelas
- [ ] Botão "Registrar Pagamento" em cada parcela do acordo
- [ ] Modal para confirmar valor pago e data de pagamento
- [ ] Atualizar status da parcela para "paga"
- [ ] Recalcular saldo devedor automaticamente
- [ ] Registrar histórico de pagamentos
- [ ] Notificar quando acordo for quitado completamente

#### 2.2 Controle de Pagamentos
- [ ] Dashboard de parcelas vencendo hoje/semana
- [ ] Filtro de acordos inadimplentes (parcela vencida não paga)
- [ ] Alerta visual quando acordo atrasa
- [ ] Relatório de taxa de cumprimento de acordos

**Impacto:** 🔥 ALTO - Essencial para acompanhar recuperação de crédito

---

### FASE 3: Gestão de Vencimentos e Alertas (Prioridade ALTA)
**Prazo estimado:** Após Fase 2  
**Status:** 🔴 Não iniciado

#### 3.1 Aba de Vencimentos Próximos
- [ ] Nova página "Vencimentos" no menu principal
- [ ] Filtros: próximos 7 dias, próximos 15 dias, próximos 30 dias
- [ ] Lista de parcelas de acordos vencendo
- [ ] Lista de cobranças sem acordo vencendo
- [ ] Botão "Copiar mensagem" para facilitar envio manual via WhatsApp
- [ ] Template de mensagem personalizável

#### 3.2 Sistema de Alertas Internos
- [ ] Badge de notificação no menu quando houver alertas
- [ ] Página de "Alertas" centralizando todas as notificações
- [ ] Alerta: "Promessa de pagamento não cumprida" (quando data prometida passa)
- [ ] Alerta: "Acordo com parcela atrasada há X dias"
- [ ] Alerta: "Devedor sem tentativa de contato há X dias"
- [ ] Permitir marcar alerta como "resolvido"

**Impacto:** 🔥 ALTO - Melhora proatividade da equipe e reduz inadimplência

---

### FASE 4: Relatórios e Exportações (Prioridade MÉDIA)
**Prazo estimado:** Após Fase 3  
**Status:** 🔴 Não iniciado

#### 4.1 Exportação para Excel
- [ ] Botão "Exportar para Excel" na lista de devedores
- [ ] Exportar tentativas de cobrança com filtros
- [ ] Exportar cobranças ativas/pagas por período
- [ ] Exportar acordos ativos/quitados
- [ ] Incluir colunas: devedor, valor, status, última tentativa, responsável

#### 4.2 Relatórios Gerenciais
- [ ] Relatório de produtividade por colaborador (já existe, melhorar)
- [ ] Relatório de inadimplência por condomínio
- [ ] Relatório de efetividade de acordos (% cumpridos vs. quebrados)
- [ ] Gráfico de evolução de recuperação ao longo do tempo

**Impacto:** 🟡 MÉDIO - Importante para síndicos e gestão, mas não bloqueia operação

---

### FASE 5: Importação e Integração (Prioridade MÉDIA)
**Prazo estimado:** Após Fase 4  
**Status:** 🟡 Parcialmente implementado (importação existe)

#### 5.1 Melhorar Importação de Planilhas
- [ ] Validação de dados antes de importar
- [ ] Preview dos dados antes de confirmar importação
- [ ] Relatório de erros de importação
- [ ] Suporte para atualização de devedores existentes
- [ ] Template de planilha para download

#### 5.2 Preparação para Integrações Futuras
- [ ] Documentar API do sistema para futuras integrações
- [ ] Criar webhooks para eventos importantes (novo acordo, pagamento)
- [ ] Estrutura para integração bancária (placeholder para futuro)

**Impacto:** 🟡 MÉDIO - Facilita onboarding de novos clientes

---

### FASE 6: Polimento e UX (Prioridade BAIXA)
**Prazo estimado:** Contínuo  
**Status:** 🟢 Em andamento

#### 6.1 Melhorias de Usabilidade
- [ ] Adicionar tooltips em campos complexos
- [ ] Melhorar mensagens de erro (mais claras e acionáveis)
- [ ] Adicionar confirmações antes de ações destrutivas (excluir devedor)
- [ ] Implementar atalhos de teclado para ações comuns
- [ ] Tour guiado para novos usuários

#### 6.2 Performance e Otimização
- [ ] Paginação em listas grandes (devedores, cobranças)
- [ ] Cache de queries frequentes
- [ ] Lazy loading de componentes pesados
- [ ] Otimizar queries do banco de dados

**Impacto:** 🟢 BAIXO - Melhora experiência, mas não é bloqueador

---

## 📊 Priorização de Implementação

### Sprint 1 (CRÍTICO - Semana 1-2)
1. ✅ Sistema de permissões por papel (Admin, Síndico, Colaborador)
2. ✅ Filtros de dados por papel
3. ✅ Gestão de usuários com papéis

### Sprint 2 (ALTO - Semana 3-4)
1. ✅ Dar baixa em parcelas de acordos
2. ✅ Controle de pagamentos e saldo devedor
3. ✅ Dashboard de acordos inadimplentes

### Sprint 3 (ALTO - Semana 5-6)
1. ✅ Aba de vencimentos próximos
2. ✅ Sistema de alertas internos
3. ✅ Templates de mensagem para WhatsApp

### Sprint 4 (MÉDIO - Semana 7-8)
1. ✅ Exportação para Excel (devedores, tentativas, cobranças)
2. ✅ Melhorar relatórios gerenciais existentes
3. ✅ Validação e preview de importação

### Sprint 5 (POLIMENTO - Semana 9+)
1. ✅ Melhorias de UX e tooltips
2. ✅ Performance e otimizações
3. ✅ Documentação para clientes

---

## 🎯 Critérios de Sucesso para Comercialização

### Funcionalidades Mínimas Viáveis (MVP)
- [x] Gestão de condomínios, devedores e cobranças
- [x] Dashboard unificado do devedor
- [x] Simulador de acordos (simples e consolidado)
- [x] Registro de tentativas de contato
- [x] Cálculo automático de juros, multa, honorários, custas e correção monetária
- [ ] **Sistema de permissões funcionando** ⚠️ BLOQUEADOR
- [ ] **Dar baixa em parcelas** ⚠️ BLOQUEADOR
- [ ] **Vencimentos próximos** ⚠️ BLOQUEADOR
- [ ] **Exportação para Excel** ⚠️ BLOQUEADOR

### Indicadores de Qualidade
- [ ] Zero erros críticos em testes de usuário
- [ ] Tempo de resposta < 2s em 95% das operações
- [ ] Interface responsiva (mobile + desktop)
- [ ] Documentação básica de uso
- [ ] Onboarding simples para novos clientes

---

## 🔄 Integrações Futuras (Pós-Lançamento)

### Fase Futura 1: Automação de Comunicação
- Integração com WhatsApp Business API
- Envio automático de lembretes de vencimento
- Confirmação automática de acordos
- Notificações por email

### Fase Futura 2: Integração Bancária
- Importação automática de extratos bancários
- Conciliação automática de pagamentos
- Geração de boletos integrada

### Fase Futura 3: Sistema de Gestão Condominial
- Módulo de gestão financeira do condomínio
- Controle de despesas e receitas
- Integração completa com módulo de cobranças

---

## 📝 Próximos Passos Imediatos

1. **Implementar controle de permissões** (Fase 1) - CRÍTICO
2. **Testar sistema como colaborador** - Validar fluxo completo
3. **Implementar dar baixa em parcelas** (Fase 2) - BLOQUEADOR
4. **Criar aba de vencimentos** (Fase 3) - BLOQUEADOR
5. **Adicionar exportação Excel** (Fase 4) - BLOQUEADOR

---

## 💡 Recomendações Estratégicas

### Para Comercialização
1. **Preço sugerido:** Modelo SaaS por condomínio gerenciado (R$ 50-150/mês por condomínio)
2. **Período de teste:** 30 dias gratuitos para novos clientes
3. **Onboarding:** Oferecer importação assistida de dados na primeira vez
4. **Suporte:** Canal de WhatsApp para dúvidas (primeiros 6 meses)

### Para Diferenciação
1. **Dashboard 360° do devedor** - Já implementado ✅
2. **Acordos consolidados** - Já implementado ✅
3. **Cálculos automáticos complexos** - Já implementado ✅
4. **Interface moderna e intuitiva** - Já implementado ✅

---

**Conclusão:** O sistema já tem uma base sólida e diferenciada. Com a implementação das Fases 1-4 (estimativa: 6-8 semanas), estará pronto para comercialização com confiança.
