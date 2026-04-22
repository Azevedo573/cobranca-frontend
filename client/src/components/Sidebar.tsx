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
} from "lucide-react";
import { Button } from "./ui/button";
import { useSidebarContext } from "./Layout";
import { useState, useEffect } from "react";

interface MenuItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  roles: string[];
}

interface MenuGroup {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  roles: string[];
  items: MenuItem[];
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
    ],
  },

  // ── Cobrança ──
  {
    label: "Cobrança",
    icon: Briefcase,
    roles: ["admin", "sindico", "cobrador"],
    items: [
      { label: "Casos Prioritários", href: "/casos-prioritarios", icon: AlertCircle, roles: ["admin", "sindico", "cobrador"] },
      { label: "Devedores", href: "/devedores", icon: UserCircle, roles: ["admin", "sindico", "cobrador"] },
      { label: "Processos de Cobrança", href: "/processos", icon: FileText, roles: ["admin", "sindico", "cobrador"] },
      { label: "Tentativas", href: "/tentativas", icon: Phone, roles: ["admin", "sindico", "cobrador"] },
      { label: "Acordos", href: "/acordos", icon: HandshakeIcon, roles: ["admin", "sindico", "cobrador"] },
      { label: "Acompanhamento de Acordos", href: "/acordos/acompanhamento", icon: HandshakeIcon, roles: ["admin", "sindico", "cobrador"] },
      { label: "Vencimentos Próximos", href: "/vencimentos", icon: Calendar, roles: ["admin", "sindico", "cobrador"] },
    ],
  },

  // ── Automação ──
  {
    label: "Automação",
    icon: Bot,
    roles: ["admin"],
    items: [
      { label: "Régua de Cobrança", href: "/admin/regua-cobranca", icon: Zap, roles: ["admin"] },
      { label: "Histórico de Disparos", href: "/admin/historico-disparos", icon: HistoryIcon, roles: ["admin"] },
    ],
  },

  // ── Arquivos e Banco ──
  {
    label: "Arquivos e Banco",
    icon: FolderOpen,
    roles: ["admin", "sindico"],
    items: [
      { label: "CNAB 240 / BTG", href: "/admin/cnab240", icon: Landmark, roles: ["admin", "sindico"] },
      { label: "Histórico de Importações", href: "/admin/historico-importacoes", icon: ClipboardList, roles: ["admin", "sindico"] },
      { label: "Importar Devedores", href: "/admin/importar-devedores", icon: Upload, roles: ["admin"] },
      { label: "Importar Condomínios", href: "/admin/importar-condominios", icon: Building2, roles: ["admin"] },
    ],
  },

  // ── Relatórios ──
  {
    label: "Relatórios",
    icon: BarChart3,
    roles: ["admin"],
    items: [
      { label: "Produtividade", href: "/admin/relatorios/produtividade", icon: BarChart3, roles: ["admin"] },
    ],
  },
];

// Itens de dashboard (um por role, aparecem sem grupo)
const dashboardItems: MenuItem[] = [
  { label: "Dashboard Admin", href: "/admin/dashboard", icon: LayoutDashboard, roles: ["admin"] },
  { label: "Dashboard Síndico", href: "/sindico/dashboard", icon: LayoutDashboard, roles: ["sindico"] },
  { label: "Dashboard Cobrador", href: "/cobrador/dashboard", icon: LayoutDashboard, roles: ["cobrador"] },
];

export default function Sidebar() {
  const { user } = useAuth();
  const [location] = useLocation();
  const { collapsed, setCollapsed } = useSidebarContext();

  // Estado de abertura de cada grupo — persiste no localStorage
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem("sidebar-open-groups");
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  // Abrir automaticamente o grupo que contém a rota ativa
  useEffect(() => {
    if (!user) return;
    const autoOpen: Record<string, boolean> = {};
    menuGroups.forEach((group) => {
      const hasActive = group.items.some(
        (item) => location === item.href || location.startsWith(item.href + "/")
      );
      if (hasActive) autoOpen[group.label] = true;
    });
    if (Object.keys(autoOpen).length > 0) {
      setOpenGroups((prev) => {
        const next = { ...prev, ...autoOpen };
        localStorage.setItem("sidebar-open-groups", JSON.stringify(next));
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
            .map((group) => {
              const GroupIcon = group.icon;
              const isOpen = openGroups[group.label] ?? false;
              const groupActive = isGroupActive(group);

              // Filtrar itens do grupo pelo role
              const visibleItems = group.items.filter((item) =>
                item.roles.includes(user.role)
              );
              if (visibleItems.length === 0) return null;

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

                  {/* Submenus */}
                  {!collapsed && isOpen && (
                    <ul className="mt-0.5 ml-3 pl-3 border-l border-border space-y-0.5">
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

      {/* User Info */}
      <div className="border-t border-border p-4">
        <div className={cn("flex items-center gap-3", collapsed && "justify-center")}>
          <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
            <span className="text-sm font-medium text-primary">
              {user.name?.charAt(0).toUpperCase() || "U"}
            </span>
          </div>
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{user.name}</p>
              <div className="flex items-center gap-2 mt-1">
                <span
                  className={cn(
                    "text-xs px-2 py-0.5 rounded-full font-medium",
                    user.role === "admin" && "bg-red-500/10 text-red-500",
                    user.role === "sindico" && "bg-blue-500/10 text-blue-500",
                    user.role === "cobrador" && "bg-green-500/10 text-green-500"
                  )}
                >
                  {user.role === "admin" && "Administrador"}
                  {user.role === "sindico" && "Síndico"}
                  {user.role === "cobrador" && "Colaborador"}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
