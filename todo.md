# TODO - Sistema de Gestão de Cobranças Condominiais

## Banco de Dados e Modelos
- [x] Criar tabela de condominios
- [x] Estender tabela de users com role e condominio_id
- [x] Criar tabela de devedores
- [x] Criar tabela de cobrancas
- [x] Criar tabela de tentativas_cobranca
- [x] Criar tabela de acordos
- [x] Criar tabela de parcelas_acordo

## Backend (tRPC Routers)
- [x] Criar router de autenticação customizada
- [x] Criar router de condominios (CRUD admin)
- [ ] Criar router de usuários (CRUD admin)
- [x] Criar router de devedores (CRUD)
- [x] Criar router de cobranças (CRUD)
- [x] Criar router de tentativas de cobrança
- [x] Criar router de acordos
- [ ] Criar router de relatórios e estatísticas

## Identidade Visual
- [x] Configurar tema com cores Gomes & Silva (verde neon + azul navy)
- [x] Adicionar fontes elegantes via Google Fonts
- [x] Customizar componentes shadcn/ui com identidade visual

## Frontend - Páginas e Componentes
- [x] Página de login customizada
- [x] Dashboard do Administrador
- [x] Dashboard do Síndico
- [x] Dashboard do Cobrador
- [ ] Página de gestão de condominios (admin)
- [ ] Página de gestão de usuários (admin)
- [ ] Página de listagem de devedores
- [ ] Página de detalhes do devedor
- [ ] Página de cobranças
- [ ] Página de registro de tentativas de cobrança
- [ ] Página de acordos
- [ ] Página de relatórios com gráficos

## Funcionalidades
- [ ] Isolamento de dados por condomínio
- [ ] Validação de permissões por role
- [ ] Sistema de filtros e busca
- [ ] Exportação de relatórios
- [ ] Notificações de ações importantes

## Testes
- [ ] Testes de autenticação
- [ ] Testes de isolamento de dados
- [ ] Testes de CRUD de entidades
- [ ] Testes de cálculos de relatórios

## Nova Solicitação - Páginas CRUD Completas
- [x] Página de listagem de condominios (admin)
- [x] Página de formulário de condominio (criar/editar)
- [x] Página de listagem de usuários (admin)
- [x] Página de formulário de usuário (criar/editar)
- [x] Página de listagem de devedores
- [x] Página de formulário de devedor (criar/editar)
- [ ] Página de detalhes do devedor com histórico
- [x] Página de listagem de cobranças
- [x] Página de formulário de cobrança (criar/editar)
- [x] Integrar todas as rotas no App.tsx

## Correção - Vincular Devedor ao Condomínio
- [x] Adicionar campo de seleção de condomínio no formulário de devedor
- [x] Permitir que admin selecione qualquer condomínio
- [x] Pré-selecionar condomínio do usuário logado para síndicos/cobradores

## Módulo de Tentativas de Cobrança
- [x] Criar página de detalhes do devedor com informações completas
- [x] Adicionar listagem de tentativas de cobrança no detalhes do devedor
- [x] Criar formulário de registro de tentativa de cobrança
- [x] Adicionar campos: tipo de contato, data, resultado, observações
- [x] Integrar rotas no App.tsx
- [x] Testar fluxo completo de registro de tentativas

## Bug - Devedor não aparece na lista após cadastro
- [x] Investigar problema no backend ao criar devedor
- [x] Verificar invalidação de cache do tRPC
- [x] Corrigir e testar fluxo completo

## Bug Crítico - Devedor não está sendo salvo no banco
- [x] Verificar logs do servidor para erros
- [x] Verificar procedure devedores.create no backend
- [x] Verificar função createDevedor no db-devedores.ts
- [x] Testar cadastro e validar salvamento no banco
- [x] Adicionar seletor de condomínio para admin visualizar devedores

## Bug - Nova Cobrança não mostra devedores
- [x] Adicionar filtro de condomínio na página de Nova Cobrança
- [x] Carregar devedores baseado no condomínio selecionado
- [x] Admin seleciona condomínio primeiro, depois devedor
- [x] Síndico/cobrador vê devedores do próprio condomínio automaticamente

## Bug - Erro de validação no formulário de cobrança
- [x] Corrigir query de devedores para não executar quando condominioId é null
- [x] Adicionar validação correta no enabled da query

## Bug - Erro ao criar cobrança (condominioId null)
- [x] Adicionar condominioId ao payload da mutation de criar cobrança
- [x] Validar que condominioId está sendo enviado corretamente

## Nova Funcionalidade - Credenciais de Condomínio
- [x] Adicionar campos username e password na tabela condominios
- [x] Atualizar formulário de condomínio com campos de usuário e senha
- [x] Atualizar backend para salvar credenciais do condomínio
- [x] Testar cadastro e edição de condomínio com credenciais

## Nova Funcionalidade - Login Customizado para Condomínios
- [x] Instalar bcrypt para hash de senhas
- [x] Implementar hash de senha ao criar/atualizar condomínio
- [x] Criar endpoint de login customizado (username/password)
- [x] Gerar token JWT após autenticação bem-sucedida
- [x] Criar tela de login customizada no frontend
- [x] Integrar login customizado com gerenciamento de sessão
- [x] Redirecionar para dashboard correto após login
- [x] Testar fluxo completo de login customizado

## Bug - Cobranças não aparecem na listagem
- [x] Adicionar filtro de condomínio na página de listagem de cobranças
- [x] Admin seleciona condomínio para visualizar cobranças
- [x] Síndico/cobrador vê cobranças do próprio condomínio automaticamente
