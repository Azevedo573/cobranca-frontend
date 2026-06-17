import { cn } from "@/lib/utils";
import { AlertTriangle, ArrowUp, Minus, ArrowDown } from "lucide-react";

// ─── Configuração central de prioridades ─────────────────────────────────────

export const PRIORIDADE_CONFIG = {
  urgente: {
    label: "Urgente",
    shortLabel: "URG",
    icon: AlertTriangle,
    // Badge pill
    badgeClass: "bg-red-100 text-red-700 border border-red-300 dark:bg-red-900/30 dark:text-red-400 dark:border-red-700",
    // Dot indicator
    dotClass: "bg-red-500",
    // Left border stripe on cards
    borderClass: "border-l-red-500",
    // Faixa colorida no topo do card (strip)
    stripClass: "bg-red-500",
    // Pulsação para urgente
    pulse: true,
  },
  alta: {
    label: "Alta",
    shortLabel: "ALT",
    icon: ArrowUp,
    badgeClass: "bg-orange-100 text-orange-700 border border-orange-300 dark:bg-orange-900/30 dark:text-orange-400 dark:border-orange-700",
    dotClass: "bg-orange-500",
    borderClass: "border-l-orange-500",
    stripClass: "bg-orange-500",
    pulse: false,
  },
  media: {
    label: "Normal",
    shortLabel: "NRM",
    icon: Minus,
    badgeClass: "bg-blue-50 text-blue-600 border border-blue-200 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800",
    dotClass: "bg-blue-400",
    borderClass: "border-l-blue-400",
    stripClass: "bg-blue-400",
    pulse: false,
  },
  baixa: {
    label: "Baixa",
    shortLabel: "BAI",
    icon: ArrowDown,
    badgeClass: "bg-slate-100 text-slate-500 border border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700",
    dotClass: "bg-slate-400",
    borderClass: "border-l-slate-300",
    stripClass: "bg-slate-300",
    pulse: false,
  },
} as const;

export type Prioridade = keyof typeof PRIORIDADE_CONFIG;

// ─── Variantes do badge ───────────────────────────────────────────────────────

interface PrioridadeBadgeProps {
  prioridade: string;
  /**
   * pill    → badge arredondado com ícone + texto (padrão)
   * dot     → bolinha colorida + texto
   * strip   → faixa horizontal fina no topo do card
   * icon    → só o ícone, sem texto
   * compact → badge pequeno sem ícone
   */
  variant?: "pill" | "dot" | "strip" | "icon" | "compact";
  className?: string;
  /** Mostrar animação de pulso para urgente */
  animated?: boolean;
}

export function PrioridadeBadge({
  prioridade,
  variant = "pill",
  className,
  animated = true,
}: PrioridadeBadgeProps) {
  const config = PRIORIDADE_CONFIG[prioridade as Prioridade];
  if (!config) return null;

  const Icon = config.icon;
  const shouldPulse = animated && config.pulse;

  if (variant === "strip") {
    return (
      <div
        className={cn(
          "h-1 w-full rounded-t-lg",
          config.stripClass,
          shouldPulse && "animate-pulse",
          className
        )}
        title={config.label}
      />
    );
  }

  if (variant === "dot") {
    return (
      <span className={cn("flex items-center gap-1.5 text-xs font-medium", className)}>
        <span className={cn("h-2 w-2 rounded-full flex-shrink-0", config.dotClass, shouldPulse && "animate-pulse")} />
        {config.label}
      </span>
    );
  }

  if (variant === "icon") {
    return (
      <span
        className={cn(
          "inline-flex items-center justify-center h-5 w-5 rounded-full",
          config.badgeClass,
          shouldPulse && "animate-pulse",
          className
        )}
        title={config.label}
      >
        <Icon className="h-3 w-3" />
      </span>
    );
  }

  if (variant === "compact") {
    return (
      <span
        className={cn(
          "inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold tracking-wide",
          config.badgeClass,
          shouldPulse && "animate-pulse",
          className
        )}
      >
        {config.shortLabel}
      </span>
    );
  }

  // pill (default)
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium",
        config.badgeClass,
        shouldPulse && "animate-pulse",
        className
      )}
    >
      <Icon className="h-3 w-3 flex-shrink-0" />
      {config.label}
    </span>
  );
}

// ─── Indicador de borda lateral (para cards) ──────────────────────────────────

export function prioridadeBorderClass(prioridade: string): string {
  const config = PRIORIDADE_CONFIG[prioridade as Prioridade];
  return config?.borderClass ?? "border-l-slate-300";
}
