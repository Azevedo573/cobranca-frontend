import React from "react";
import { Search, X, Filter } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

/**
 * Componente reutilizável de filtros para os Kanbans.
 * Exibe destaque visual (anel colorido + badge de contagem) quando filtros estão ativos.
 */

interface SelectFiltroOption {
  value: string;
  label: string;
}

interface SelectFiltroProps {
  value: string;
  onChange: (v: string) => void;
  options: SelectFiltroOption[];
  placeholder?: string;
  width?: string;
  /** Valor que representa "sem filtro" — padrão: "todos" */
  defaultValue?: string;
}

/** Select com destaque visual quando filtro está ativo */
export function SelectFiltro({
  value,
  onChange,
  options,
  placeholder = "Filtrar",
  width = "w-36",
  defaultValue = "todos",
}: SelectFiltroProps) {
  const isActive = value !== defaultValue;

  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger
        className={cn(
          "h-8 text-xs transition-all duration-200",
          width,
          isActive
            ? "border-primary ring-1 ring-primary/40 bg-primary/5 text-primary font-medium"
            : "border-input"
        )}
      >
        {isActive && (
          <span className="mr-1 h-1.5 w-1.5 rounded-full bg-primary shrink-0 inline-block" />
        )}
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((opt) => (
          <SelectItem key={opt.value} value={opt.value}>
            {opt.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

interface BuscaFiltroProps {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}

/** Input de busca com destaque visual quando ativo */
export function BuscaFiltro({
  value,
  onChange,
  placeholder = "Buscar...",
  className,
}: BuscaFiltroProps) {
  const isActive = value.trim().length > 0;

  return (
    <div className={cn("relative flex-1 min-w-[200px] max-w-xs", className)}>
      <Search
        className={cn(
          "absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 transition-colors duration-200",
          isActive ? "text-primary" : "text-muted-foreground"
        )}
      />
      <input
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          "w-full pl-8 pr-7 h-8 text-sm rounded-md border bg-background focus:outline-none focus:ring-1 transition-all duration-200",
          isActive
            ? "border-primary ring-1 ring-primary/40 bg-primary/5 focus:ring-primary"
            : "border-input focus:ring-primary"
        )}
      />
      {isActive && (
        <button
          onClick={() => onChange("")}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

interface LimparFiltrosProps {
  onLimpar: () => void;
  count: number;
}

/** Botão "Limpar filtros" com badge de contagem de filtros ativos */
export function LimparFiltros({ onLimpar, count }: LimparFiltrosProps) {
  if (count === 0) return null;

  return (
    <button
      onClick={onLimpar}
      className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground px-2.5 h-8 rounded-md border border-dashed border-muted-foreground/40 hover:border-destructive/50 hover:bg-destructive/5 hover:text-destructive transition-all duration-200"
    >
      <Filter className="h-3 w-3" />
      <span>Limpar</span>
      <Badge
        variant="secondary"
        className="h-4 min-w-4 px-1 text-[10px] bg-primary/10 text-primary border-0 font-semibold"
      >
        {count}
      </Badge>
    </button>
  );
}
