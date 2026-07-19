import { Link, useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Building2,
  Users,
  UserCircle,
  FileText,
  AlertCircle,
  BarChart3,
  Phone,
  HandshakeIcon,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Upload,
  Calendar,
  Zap,
  History as HistoryIcon,
  Landmark,
  ClipboardList,
  Settings,
  Briefcase,
  Bot,
  FolderOpen,
  PhoneCall,
  PhoneIncoming,
  Download,
  Sun,
  Moon,
  LogOut,
  Shield,
  TrendingUp,
  ScrollText,
  Scale,
  MessageSquare,
  Plus,
  Kanban,
  BarChart2,
  UserCog,
  KeyRound,
  Mail,
  MessageCircle,
  Headphones,
  GitBranch,
  Timer,
  Search,
  Bell,
  Settings2,
  Newspaper,
  AlertTriangle,
  Activity,
  ListTodo,
} from "lucide-react";
import { Button } from "./ui/button";
import { useSidebarContext } from "./Layout";
import { useTheme } from "@/contexts/ThemeContext";
import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { usePermissions, type Modulo } from "@/hooks/usePermissions";

interface MenuItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  roles: string[];
  /** Submódulo RBAC: se definido, o item só aparece para colaborador/advogado se tiver permissão */
  rbacModulo?: string;
}

interface SubGroup {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  roles: string[];
  items: MenuItem[];
  rbacModulo?: string;
}

interface MenuGroup {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  roles: string[];
  items: MenuItem[];
  modulo?: string; // se definido, só aparece quando esse módulo está ativo no condomínio
  subGroups?: SubGroup[]; // sub-grupos aninhados (nível 3)
}

const menuGroups: MenuGroup[] = [
  // ── Visão Geral (item único por role, sem grupo colapsável) ──
  // tratado separadamente abaixo

  // ── Configurações ──
  {
    label: "Configurações",
    icon: Settings,
    roles: ["admin"],
    items: [
      { label: "Condomínios", href: "/admin/condominios", icon: Building2, roles: ["admin"] },
      { label: "Usuários", href: "/admin/usuarios", icon: Users, roles: ["admin"] },
      { label: "Modelos de Documentos", href: "/modelos-documento", icon: ScrollText, roles: ["admin", "cobrador", "colaborador", "advogado"], rbacModulo: "modelos_documento" },
      { label: "Configuração de E-mail", href: "/admin/email-config", icon: Mail, roles: ["admin"] },
      { label: "Grupos WhatsApp", href: "/whatsapp/grupos", icon: Users, roles: ["admin"] },
      { label: "Auditoria do Sistema", href: "/admin/auditoria", icon: Shield, roles: ["admin"] },
    ],
  },

  // ── Cobrança ──
  {
    label: "Cobrança",
    icon: Briefcase,
    roles: ["admin", "sindico", "cobrador", "colaborador", "advogado"],
    // modulo removido: controle granular agora é feito por item via rbacModulo
    items: [
      { label: "Operações", href: "/operacoes", icon: PhoneCall, roles: ["admin", "cobrador", "colaborador", "advogado"], rbacModulo: "cobrancas" },
      { label: "Devedores", href: "/devedores", icon: UserCircle, roles: ["admin", "sindico", "cobrador", "colaborador", "advogado"], rbacModulo: "devedores" },
      { label: "Acordos", href: "/acordos", icon: HandshakeIcon, roles: ["admin", "sindico", "cobrador", "colaborador", "advogado"], rbacModulo: "acordos" },
      { label: "Vencimentos Próximos", href: "/vencimentos", icon: Calendar, roles: ["admin", "sindico", "cobrador", "colaborador", "advogado"], rbacModulo: "cobrancas" },
      { label: "Alertas de Inadimplência", href: "/alertas-inadimplencia", icon: AlertTriangle, roles: ["admin", "cobrador", "colaborador", "advogado"], rbacModulo: "cobrancas" },
      { label: "Histórico de Contatos", href: "/tentativas", icon: Phone, roles: ["admin", "sindico", "cobrador", "colaborador", "advogado"], rbacModulo: "tentativas" },
    ],
  },

  // ── Jurídico ──
  {
    label: "Jurídico",
    icon: Scale,
    roles: ["admin", "colaborador", "advogado"],
    modulo: "juridico",
    items: [], // items vazios — navegação via subGroups
    subGroups: [
      {
        label: "Visão Geral",
        icon: LayoutDashboard,
        roles: ["admin"],
        items: [
          { label: "Dashboard Jurídico", href: "/admin/juridico/dashboard", icon: BarChart2, roles: ["admin"] },
          { label: "Condomínios Jurídicos", href: "/admin/juridico/condominios", icon: Building2, roles: ["admin"] },
          { label: "Busca por Advogado", href: "/admin/juridico/busca-advogado", icon: Search, roles: ["admin"] },
        ],
      },
      {
        label: "Demandas",
        icon: FolderOpen,
        roles: ["admin", "colaborador", "advogado"],
        rbacModulo: "juridico_demandas",
        items: [
          { label: "Central de Demandas", href: "/admin/juridico", icon: FileText, roles: ["admin", "colaborador", "advogado"], rbacModulo: "juridico_demandas" },
          { label: "Kanban de Demandas", href: "/admin/juridico/kanban", icon: Kanban, roles: ["admin", "colaborador", "advogado"], rbacModulo: "juridico_demandas" },
          { label: "Minhas Tarefas", href: "/minhas-tarefas", icon: ListTodo, roles: ["admin", "colaborador", "advogado", "sindico", "cobrador"] },
          { label: "Assembleias", href: "/admin/juridico/assembleias", icon: Calendar, roles: ["admin", "colaborador", "advogado"], rbacModulo: "juridico_assembleias" },
        ],
      },
      {
        label: "Processos & Prazos",
        icon: Scale,
        roles: ["admin", "colaborador", "advogado"],
        rbacModulo: "juridico_processos",
        items: [
          { label: "Processos Judiciais", href: "/admin/juridico/processos", icon: Scale, roles: ["admin", "advogado", "colaborador"], rbacModulo: "juridico_processos" },
          { label: "Prazos Jurídicos", href: "/admin/juridico/prazos", icon: Timer, roles: ["admin", "advogado", "colaborador"], rbacModulo: "juridico_prazos" },
        ],
      },
      {
        label: "Intimações & Publicações",
        icon: Bell,
        roles: ["admin", "colaborador", "advogado"],
        rbacModulo: "juridico_intimacoes",
        items: [
          { label: "Central de Intimações", href: "/admin/juridico/intimacoes", icon: Bell, roles: ["admin", "colaborador", "advogado"], rbacModulo: "juridico_intimacoes" },
          { label: "Publicações Jurídicas", href: "/admin/juridico/publicacoes", icon: Newspaper, roles: ["admin", "colaborador", "advogado"], rbacModulo: "juridico_publicacoes" },
          { label: "Monitoramento DOERJ", href: "/doerj", icon: Newspaper, roles: ["admin", "advogado"] },
          { label: "Configurações MNI", href: "/admin/juridico/mni-config", icon: Settings2, roles: ["admin", "colaborador", "advogado"], rbacModulo: "juridico_config" },
        ],
      },
    ],
  },

  // ── Automação ──
  {
    label: "Automação",
    icon: Bot,
    roles: ["admin", "colaborador"],
    items: [
      { label: "Régua de Cobrança", href: "/admin/regua-cobranca", icon: Zap, roles: ["admin", "colaborador"], rbacModulo: "automacao" },
      { label: "Histórico de Disparos", href: "/admin/historico-disparos", icon: HistoryIcon, roles: ["admin", "colaborador"], rbacModulo: "automacao" },
    ],
  },

  // ── Banco ──
  {
    label: "Banco",
    icon: Landmark,
    roles: ["admin", "colaborador"],
    items: [
      { label: "Configuração de Boleto", href: "/admin/configuracao-boleto", icon: Settings, roles: ["admin"] },
      { label: "Remessa CNAB 240", href: "/admin/cnab240", icon: FolderOpen, roles: ["admin", "colaborador"], rbacModulo: "banco" },
      { label: "Retorno CNAB 240", href: "/admin/retorno-cnab", icon: Download, roles: ["admin", "colaborador"], rbacModulo: "banco" },
      { label: "BTG — Configuração", href: "/configuracoes/btg", icon: Settings, roles: ["admin"] },
      { label: "BTG — Conciliação", href: "/admin/btg-conciliacao", icon: Landmark, roles: ["admin", "colaborador"], rbacModulo: "banco" },
    ],
  },

  // ── Importações ──
  {
    label: "Importações",
    icon: Download,
    roles: ["admin", "colaborador"],
    items: [
      { label: "Importar Devedores", href: "/admin/importar-devedores", icon: Upload, roles: ["admin", "colaborador"], rbacModulo: "importacoes" },
      { label: "Importar Condomínios", href: "/admin/importar-condominios", icon: Building2, roles: ["admin"] },
      { label: "Histórico de Importações", href: "/admin/historico-importacoes", icon: ClipboardList, roles: ["admin", "colaborador"], rbacModulo: "importacoes" },
    ],
  },

  // ── Perfis e Permissões ──
  {
    label: "Perfis e Permissões",
    icon: KeyRound,
    roles: ["admin"],
    items: [
      { label: "Perfis de Acesso", href: "/admin/perfis", icon: Shield, roles: ["admin"] },
      { label: "Atribuir Perfis", href: "/admin/usuarios-perfis", icon: UserCog, roles: ["admin"] },
    ],
  },

  // ── WhatsApp ──
  {
    label: "WhatsApp",
    icon: MessageCircle,
    roles: ["admin", "cobrador", "colaborador"],
    items: [
      { label: "Central de Atendimento", href: "/atendimento", icon: Headphones, roles: ["admin", "cobrador", "colaborador"], rbacModulo: "whatsapp" },
      { label: "Configurar Instâncias", href: "/configuracoes/whatsapp", icon: Settings, roles: ["admin"] },
      { label: "Fila de Envio", href: "/configuracoes/whatsapp-fila", icon: Activity, roles: ["admin"] },
      { label: "Config. Atendimento", href: "/configuracoes/atendimento", icon: Settings, roles: ["admin"] },
      { label: "Fluxos de Atendimento", href: "/configuracoes/fluxos", icon: GitBranch, roles: ["admin"] },
    ],
  },

  // ── Relatórios ──
  {
    label: "Relatórios",
    icon: BarChart3,
    roles: ["admin", "colaborador"],
    items: [], // navegação via subGroups
    subGroups: [
      {
        label: "Relatórios de Cobrança",
        icon: FileText,
        roles: ["admin", "colaborador"],
        items: [
          { label: "Painel de Relatórios", href: "/relatorios", icon: BarChart3, roles: ["admin", "colaborador"], rbacModulo: "relatorios" },
        ],
      },
      {
        label: "Relatórios de Produtividade",
        icon: BarChart3,
        roles: ["admin"],
        items: [
          { label: "Produtividade", href: "/admin/relatorios/produtividade", icon: Users, roles: ["admin"] },
        ],
      },
      {
        label: "Centro de Inteligência",
        icon: TrendingUp,
        roles: ["admin"],
        items: [
          { label: "Dashboard Executivo", href: "/admin/executivo", icon: TrendingUp, roles: ["admin"] },
        ],
      },
    ],
  },
];

// Itens de dashboard (um por role, aparecem sem grupo)
const dashboardItems: MenuItem[] = [
  { label: "Dashboard Admin", href: "/admin/dashboard", icon: LayoutDashboard, roles: ["admin"] },
  { label: "Dashboard Síndico", href: "/sindico/dashboard", icon: LayoutDashboard, roles: ["sindico"] },
  { label: "Dashboard Cobrador", href: "/cobrador/dashboard", icon: LayoutDashboard, roles: ["cobrador"] },
  { label: "Meu Painel", href: "/colaborador/dashboard", icon: LayoutDashboard, roles: ["colaborador"] },
  { label: "Painel Jurídico", href: "/advogado/dashboard", icon: LayoutDashboard, roles: ["advogado"] },
];

export default function Sidebar() {
  const { user, logout } = useAuth();
  const [location] = useLocation();
  const { collapsed, setCollapsed } = useSidebarContext();
  const { theme, toggleTheme } = useTheme();

  // Buscar módulos ativos do condomínio do usuário
  const { data: modulosAtivos } = trpc.condominios.getModulosAtivos.useQuery(
    { condominioId: user?.condominioId ?? undefined },
    { enabled: !!user, staleTime: 5 * 60 * 1000 }
  );
  // Admin sempre vê todos os módulos (independente de ter ou não condominioId)
  // Advogado sempre vê o módulo jurídico independentemente do condomínio
  const modulosEfetivos = user?.role === "admin"
    ? ["cobranca", "juridico", "automacao", "banco", "relatorios"]
    : user?.role === "advogado"
    ? ["juridico", ...(modulosAtivos ?? [])]
    : (modulosAtivos ?? ["cobranca"]);

  // Permissões RBAC do colaborador logado
  const { can, profileLabel } = usePermissions();

  // Verifica se o colaborador/advogado tem permissão de visualizar um módulo
  const colaboradorPodeVer = (modulo: string) => {
    // Para roles com bypass total, sempre permitir
    if (user?.role === "admin" || user?.role === "sindico" || user?.role === "cobrador") return true;
    return can(modulo as Modulo, "visualizar");
  };

  // Estado de abertura de cada grupo — persiste no localStorage
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem("sidebar-open-groups");
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  // Estado de abertura de sub-grupos aninhados
  const [openSubGroups, setOpenSubGroups] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem("sidebar-open-subgroups");
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  const toggleSubGroup = (key: string) => {
    setOpenSubGroups((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      localStorage.setItem("sidebar-open-subgroups", JSON.stringify(next));
      return next;
    });
  };

  // Abrir automaticamente o grupo/sub-grupo que contém a rota ativa
  useEffect(() => {
    if (!user) return;
    const autoOpen: Record<string, boolean> = {};
    const autoOpenSub: Record<string, boolean> = {};
    menuGroups.forEach((group) => {
      const hasActive = group.items.some(
        (item) => location === item.href || location.startsWith(item.href + "/")
      );
      // Verificar sub-grupos
      if (group.subGroups) {
        group.subGroups.forEach((sg) => {
          const sgActive = sg.items.some(
            (item) => location === item.href || location.startsWith(item.href + "/")
          );
          if (sgActive) {
            autoOpen[group.label] = true;
            autoOpenSub[`${group.label}::${sg.label}`] = true;
          }
        });
      }
      if (hasActive) autoOpen[group.label] = true;
    });
    if (Object.keys(autoOpen).length > 0) {
      setOpenGroups((prev) => {
        const next = { ...prev, ...autoOpen };
        localStorage.setItem("sidebar-open-groups", JSON.stringify(next));
        return next;
      });
    }
    if (Object.keys(autoOpenSub).length > 0) {
      setOpenSubGroups((prev) => {
        const next = { ...prev, ...autoOpenSub };
        localStorage.setItem("sidebar-open-subgroups", JSON.stringify(next));
        return next;
      });
    }
  }, [location, user]);

  if (!user) return null;

  const toggleGroup = (label: string) => {
    setOpenGroups((prev) => {
      const next = { ...prev, [label]: !prev[label] };
      localStorage.setItem("sidebar-open-groups", JSON.stringify(next));
      return next;
    });
  };

  const isItemActive = (href: string) =>
    location === href || location.startsWith(href + "/");

  const isGroupActive = (group: MenuGroup) =>
    group.items.some((item) => isItemActive(item.href));

  // Dashboard item para o role atual
  const dashboardItem = dashboardItems.find((d) => d.roles.includes(user.role));

  return (
    <aside
      className={cn(
        "fixed left-0 top-0 h-screen bg-card border-r border-border transition-all duration-300 z-40 flex flex-col",
        collapsed ? "w-16" : "w-64"
      )}
    >
      {/* Header */}
      <div className="h-16 flex items-center justify-between px-4 border-b border-border">
        {!collapsed && (
          <div className="flex items-center gap-2">
            <Building2 className="h-6 w-6 text-primary" />
            <span className="font-semibold text-lg truncate">Gomes & Silva</span>
          </div>
        )}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setCollapsed(!collapsed)}
          className="ml-auto flex-shrink-0"
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <ChevronLeft className="h-4 w-4" />
          )}
        </Button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4">
        <ul className="space-y-0.5 px-2">

          {/* Dashboard — item direto sem grupo */}
          {dashboardItem && (() => {
            const Icon = dashboardItem.icon;
            const active = isItemActive(dashboardItem.href);
            return (
              <li key={dashboardItem.href} className="mb-2">
                <Link
                  href={dashboardItem.href}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors",
                    "hover:bg-accent hover:text-accent-foreground",
                    active && "bg-primary text-primary-foreground hover:bg-primary/90",
                    collapsed && "justify-center"
                  )}
                  title={collapsed ? dashboardItem.label : undefined}
                >
                  <Icon className="h-5 w-5 flex-shrink-0" />
                  {!collapsed && (
                    <span className="text-sm font-medium">{dashboardItem.label}</span>
                  )}
                </Link>
              </li>
            );
          })()}

          {/* Grupos colapsáveis */}
          {menuGroups
            .filter((group) => group.roles.includes(user.role))
            .filter((group) => !group.modulo || modulosEfetivos.includes(group.modulo))
            // Para colaborador: filtrar grupos pelo módulo RBAC
            .filter((group) => !group.modulo || colaboradorPodeVer(group.modulo))
            .map((group) => {
              const GroupIcon = group.icon;
              const isOpen = openGroups[group.label] ?? false;
              const groupActive = isGroupActive(group);

              // Filtrar itens do grupo pelo role e pelo submódulo RBAC
              const visibleItems = group.items.filter((item) => {
                if (!item.roles.includes(user.role)) return false;
                // Para colaborador e advogado: verificar permissão RBAC por item
                if ((user.role === "colaborador" || user.role === "advogado") && item.rbacModulo) {
                  return colaboradorPodeVer(item.rbacModulo);
                }
                return true;
              });
              // Verificar se o grupo tem sub-grupos com itens visíveis
              const hasVisibleSubGroups = group.subGroups && group.subGroups.some((sg) =>
                sg.roles.includes(user.role) &&
                sg.items.some((item) => {
                  if (!item.roles.includes(user.role)) return false;
                  if ((user.role === "colaborador" || user.role === "advogado") && item.rbacModulo) {
                    return colaboradorPodeVer(item.rbacModulo);
                  }
                  return true;
                })
              );
              if (visibleItems.length === 0 && !hasVisibleSubGroups) return null;

              return (
                <li key={group.label} className="mb-0.5">
                  {/* Cabeçalho do grupo */}
                  <button
                    onClick={() => !collapsed && toggleGroup(group.label)}
                    className={cn(
                      "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors text-left",
                      "hover:bg-accent hover:text-accent-foreground",
                      groupActive && !isOpen && "text-primary font-semibold",
                      collapsed && "justify-center"
                    )}
                    title={collapsed ? group.label : undefined}
                  >
                    <GroupIcon className={cn(
                      "h-5 w-5 flex-shrink-0",
                      groupActive && "text-primary"
                    )} />
                    {!collapsed && (
                      <>
                        <span className="text-sm font-medium flex-1">{group.label}</span>
                        <ChevronDown
                          className={cn(
                            "h-4 w-4 flex-shrink-0 transition-transform duration-200 text-muted-foreground",
                            isOpen && "rotate-180"
                          )}
                        />
                      </>
                    )}
                  </button>

                  {/* Submenus ou Sub-grupos aninhados */}
                  {!collapsed && isOpen && (
                    <ul className="mt-0.5 ml-3 pl-3 border-l border-border space-y-0.5">
                      {/* Sub-grupos aninhados (nível 3) */}
                      {group.subGroups && group.subGroups
                        .filter((sg) => sg.roles.includes(user.role))
                        .filter((sg) => {
                          if ((user.role === "colaborador" || user.role === "advogado") && sg.rbacModulo) {
                            return colaboradorPodeVer(sg.rbacModulo);
                          }
                          return true;
                        })
                        .map((sg) => {
                          const SgIcon = sg.icon;
                          const sgKey = `${group.label}::${sg.label}`;
                          const sgOpen = openSubGroups[sgKey] ?? false;
                          const sgVisibleItems = sg.items.filter((item) => {
                            if (!item.roles.includes(user.role)) return false;
                            if ((user.role === "colaborador" || user.role === "advogado") && item.rbacModulo) {
                              return colaboradorPodeVer(item.rbacModulo);
                            }
                            return true;
                          });
                          if (sgVisibleItems.length === 0) return null;
                          const sgActive = sgVisibleItems.some((item) => isItemActive(item.href));
                          return (
                            <li key={sgKey} className="mb-0.5">
                              <button
                                onClick={() => toggleSubGroup(sgKey)}
                                className={cn(
                                  "w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg transition-colors text-left",
                                  "hover:bg-accent hover:text-accent-foreground",
                                  sgActive && !sgOpen && "text-primary font-semibold"
                                )}
                              >
                                <SgIcon className={cn("h-4 w-4 flex-shrink-0", sgActive && "text-primary")} />
                                <span className="text-sm font-medium flex-1">{sg.label}</span>
                                <ChevronDown
                                  className={cn(
                                    "h-3.5 w-3.5 flex-shrink-0 transition-transform duration-200 text-muted-foreground",
                                    sgOpen && "rotate-180"
                                  )}
                                />
                              </button>
                              {sgOpen && (
                                <ul className="mt-0.5 ml-3 pl-3 border-l border-border space-y-0.5">
                                  {sgVisibleItems.map((item) => {
                                    const ItemIcon = item.icon;
                                    const active = isItemActive(item.href);
                                    return (
                                      <li key={item.href}>
                                        <Link
                                          href={item.href}
                                          className={cn(
                                            "flex items-center gap-2 px-2 py-1.5 rounded-lg transition-colors",
                                            "hover:bg-accent hover:text-accent-foreground",
                                            active && "bg-primary/10 text-primary font-medium"
                                          )}
                                        >
                                          <ItemIcon className="h-3.5 w-3.5 flex-shrink-0" />
                                          <span className="text-xs">{item.label}</span>
                                        </Link>
                                      </li>
                                    );
                                  })}
                                </ul>
                              )}
                            </li>
                          );
                        })
                      }
                      {/* Itens diretos do grupo (sem sub-grupos) */}
                      {visibleItems.map((item) => {
                        const ItemIcon = item.icon;
                        const active = isItemActive(item.href);
                        return (
                          <li key={item.href}>
                            <Link
                              href={item.href}
                              className={cn(
                                "flex items-center gap-2.5 px-2.5 py-2 rounded-lg transition-colors",
                                "hover:bg-accent hover:text-accent-foreground",
                                active && "bg-primary/10 text-primary font-medium"
                              )}
                            >
                              <ItemIcon className="h-4 w-4 flex-shrink-0" />
                              <span className="text-sm">{item.label}</span>
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  )}

                  {/* No modo colapsado: tooltip com submenus ao hover (via title no botão) */}
                </li>
              );
            })}
        </ul>
      </nav>

      {/* User Info + Theme Toggle + Logout */}
      <div className="border-t border-border p-3 space-y-2">
        {/* Botão de tema */}
        <button
          onClick={toggleTheme}
          title={theme === "dark" ? "Mudar para Light Mode" : "Mudar para Dark Mode"}
          className={cn(
            "w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors text-sm",
            "hover:bg-accent hover:text-accent-foreground text-muted-foreground",
            collapsed && "justify-center"
          )}
        >
          {theme === "dark" ? (
            <Sun className="h-4 w-4 flex-shrink-0 text-amber-400" />
          ) : (
            <Moon className="h-4 w-4 flex-shrink-0 text-slate-500" />
          )}
          {!collapsed && (
            <span className="font-medium">
              {theme === "dark" ? "Light Mode" : "Dark Mode"}
            </span>
          )}
        </button>

        {/* Usuário + Logout */}
        <div className={cn("flex items-center gap-2", collapsed && "justify-center")}>
          <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
            <span className="text-sm font-medium text-primary">
              {user.name?.charAt(0).toUpperCase() || "U"}
            </span>
          </div>
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{user.name}</p>
              <span
                className={cn(
                  "text-xs px-2 py-0.5 rounded-full font-medium",
                  user.role === "admin" && "bg-red-500/10 text-red-500",
                  user.role === "sindico" && "bg-blue-500/10 text-blue-500",
                  user.role === "cobrador" && "bg-green-500/10 text-green-500",
                  user.role === "colaborador" && "bg-violet-500/10 text-violet-500"
                )}
              >
                {user.role === "admin" && "Administrador"}
                {user.role === "sindico" && "Síndico"}
                {user.role === "cobrador" && "Cobrador"}
                {user.role === "colaborador" && (profileLabel())}
              </span>
            </div>
          )}
          {!collapsed && (
            <button
              onClick={logout}
              title="Sair"
              className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-destructive/10 hover:text-destructive transition-colors flex-shrink-0"
            >
              <LogOut className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Logout no modo colapsado */}
        {collapsed && (
          <button
            onClick={logout}
            title="Sair"
            className="w-full flex items-center justify-center px-3 py-2 rounded-lg hover:bg-destructive/10 hover:text-destructive transition-colors text-muted-foreground"
          >
            <LogOut className="h-4 w-4" />
          </button>
        )}
      </div>
    </aside>
  );
}
