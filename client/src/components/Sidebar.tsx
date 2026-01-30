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
} from "lucide-react";
import { Button } from "./ui/button";
import { useSidebarContext } from "./Layout";

interface MenuItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  roles: string[]; // Roles que podem ver este item
}

const menuItems: MenuItem[] = [
  // Admin
  {
    label: "Dashboard Admin",
    href: "/admin/dashboard",
    icon: LayoutDashboard,
    roles: ["admin"],
  },
  {
    label: "Condomínios",
    href: "/admin/condominios",
    icon: Building2,
    roles: ["admin"],
  },
  {
    label: "Usuários",
    href: "/admin/usuarios",
    icon: Users,
    roles: ["admin"],
  },
  {
    label: "Relatório de Produtividade",
    href: "/admin/relatorios/produtividade",
    icon: BarChart3,
    roles: ["admin"],
  },
  
  // Síndico
  {
    label: "Dashboard Síndico",
    href: "/sindico/dashboard",
    icon: LayoutDashboard,
    roles: ["sindico"],
  },
  
  // Cobrador
  {
    label: "Dashboard Cobrador",
    href: "/cobrador/dashboard",
    icon: LayoutDashboard,
    roles: ["cobrador"],
  },
  
  // Compartilhado
  {
    label: "Casos Prioritários",
    href: "/casos-prioritarios",
    icon: AlertCircle,
    roles: ["admin", "sindico", "cobrador"],
  },
  {
    label: "Devedores",
    href: "/devedores",
    icon: UserCircle,
    roles: ["admin", "sindico", "cobrador"],
  },
  {
    label: "Cobranças",
    href: "/cobrancas",
    icon: FileText,
    roles: ["admin", "sindico", "cobrador"],
  },
  {
    label: "Tentativa Rápida",
    href: "/tentativas/nova",
    icon: Phone,
    roles: ["sindico", "cobrador"],
  },
  {
    label: "Acordos",
    href: "/acordos",
    icon: HandshakeIcon,
    roles: ["admin", "sindico", "cobrador"],
  },
];

export default function Sidebar() {
  const { user } = useAuth();
  const [location] = useLocation();
  const { collapsed, setCollapsed } = useSidebarContext();

  if (!user) return null;

  // Filtrar itens baseado no role do usuário
  const visibleItems = menuItems.filter((item) =>
    item.roles.includes(user.role)
  );

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
            <span className="font-semibold text-lg">Gomes & Silva</span>
          </div>
        )}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setCollapsed(!collapsed)}
          className="ml-auto"
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
        <ul className="space-y-1 px-2">
          {visibleItems.map((item) => {
            const Icon = item.icon;
            const isActive = location === item.href || location.startsWith(item.href + "/");

            return (
              <li key={item.href}>
                <Link href={item.href}>
                  <a
                    className={cn(
                      "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors",
                      "hover:bg-accent hover:text-accent-foreground",
                      isActive && "bg-primary text-primary-foreground hover:bg-primary/90",
                      collapsed && "justify-center"
                    )}
                    title={collapsed ? item.label : undefined}
                  >
                    <Icon className={cn("h-5 w-5 flex-shrink-0")} />
                    {!collapsed && (
                      <span className="text-sm font-medium">{item.label}</span>
                    )}
                  </a>
                </Link>
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
              <p className="text-xs text-muted-foreground capitalize">{user.role}</p>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
