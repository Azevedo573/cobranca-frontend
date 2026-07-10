import { useState } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface CheckboxConclusaoProps {
  /** Se o item já está concluído */
  concluido?: boolean;
  /** Callback ao clicar — recebe o novo estado */
  onToggle: (concluido: boolean) => void;
  /** Tamanho do círculo em pixels (padrão: 18) */
  size?: number;
  /** Desabilita interação (ex: durante mutation pendente) */
  disabled?: boolean;
  /** Classe extra para o container */
  className?: string;
}

/**
 * Checkbox circular (bolinha) para conclusão rápida de tarefas no Kanban.
 *
 * - Estado padrão: círculo vazio com borda cinza
 * - Hover: borda verde com fundo verde claro
 * - Concluído: círculo verde sólido com ícone de check branco
 * - Animação: escala + fade ao concluir
 */
export function CheckboxConclusao({
  concluido = false,
  onToggle,
  size = 18,
  disabled = false,
  className,
}: CheckboxConclusaoProps) {
  const [hovered, setHovered] = useState(false);
  const [animating, setAnimating] = useState(false);

  function handleClick(e: React.MouseEvent) {
    e.stopPropagation(); // Não propagar para o card (evita navegação e drag)
    e.preventDefault();
    if (disabled) return;

    if (!concluido) {
      // Animar antes de chamar o callback
      setAnimating(true);
      setTimeout(() => {
        setAnimating(false);
        onToggle(true);
      }, 200);
    } else {
      onToggle(false);
    }
  }

  return (
    <button
      type="button"
      aria-label={concluido ? "Marcar como pendente" : "Concluir tarefa"}
      aria-checked={concluido}
      role="checkbox"
      disabled={disabled}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={handleClick}
      onPointerDown={(e) => e.stopPropagation()} // Evita ativar drag do dnd-kit
      className={cn(
        "flex-shrink-0 rounded-full border-2 flex items-center justify-center transition-all duration-200 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-1",
        // Estados
        concluido
          ? "bg-emerald-500 border-emerald-500 shadow-sm shadow-emerald-200 dark:shadow-emerald-900/40"
          : hovered
          ? "border-emerald-400 bg-emerald-50 dark:bg-emerald-950/40"
          : "border-muted-foreground/30 bg-transparent hover:border-emerald-400",
        // Animação de conclusão
        animating && "scale-125",
        disabled && "opacity-50 cursor-not-allowed",
        className
      )}
      style={{ width: size, height: size, minWidth: size, minHeight: size }}
    >
      {(concluido || animating) && (
        <Check
          className={cn(
            "text-white transition-all duration-150",
            animating && !concluido ? "scale-150 opacity-0" : "scale-100 opacity-100"
          )}
          style={{ width: size * 0.6, height: size * 0.6 }}
          strokeWidth={3}
        />
      )}
      {!concluido && hovered && !animating && (
        <Check
          className="text-emerald-400 opacity-60 transition-opacity duration-150"
          style={{ width: size * 0.6, height: size * 0.6 }}
          strokeWidth={3}
        />
      )}
    </button>
  );
}
