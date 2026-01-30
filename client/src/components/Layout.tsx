import { useAuth } from "@/_core/hooks/useAuth";
import Sidebar from "./Sidebar";
import { cn } from "@/lib/utils";
import { useState, useEffect, createContext, useContext } from "react";

interface LayoutProps {
  children: React.ReactNode;
}

interface SidebarContextType {
  collapsed: boolean;
  setCollapsed: (collapsed: boolean) => void;
}

const SidebarContext = createContext<SidebarContextType>({
  collapsed: false,
  setCollapsed: () => {},
});

export const useSidebarContext = () => useContext(SidebarContext);

export default function Layout({ children }: LayoutProps) {
  const { user } = useAuth();
  const [collapsed, setCollapsed] = useState(() => {
    // Inicializar baseado no tamanho da tela
    if (typeof window !== "undefined") {
      return window.innerWidth < 768;
    }
    return false;
  });

  useEffect(() => {
    const handleResize = () => {
      // Auto-colapsar em telas pequenas
      if (window.innerWidth < 768 && !collapsed) {
        setCollapsed(true);
      }
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [collapsed]);

  // Se não estiver logado, não mostrar sidebar
  if (!user) {
    return <>{children}</>;
  }

  return (
    <SidebarContext.Provider value={{ collapsed, setCollapsed }}>
      <div className="min-h-screen bg-background">
        <Sidebar />
        <main
          className={cn(
            "transition-all duration-300 min-h-screen",
            collapsed ? "ml-16" : "ml-64"
          )}
        >
          {children}
        </main>
      </div>
    </SidebarContext.Provider>
  );
}
