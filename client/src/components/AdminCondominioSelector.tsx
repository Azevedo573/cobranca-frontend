/**
 * Componente de seleção de condomínio para o administrador.
 * Exibido apenas quando o usuário tem role "admin".
 * Outros roles não veem este componente.
 */

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Building2 } from "lucide-react";

interface Condominio {
  id: number;
  name: string;
}

interface AdminCondominioSelectorProps {
  condominios: Condominio[] | undefined;
  selectedId: number | null;
  onSelect: (id: number) => void;
  className?: string;
  label?: string;
}

export function AdminCondominioSelector({
  condominios,
  selectedId,
  onSelect,
  className = "",
  label = "Condomínio:",
}: AdminCondominioSelectorProps) {
  if (!condominios || condominios.length === 0) return null;

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <Building2 className="w-4 h-4 text-muted-foreground flex-shrink-0" />
      <span className="text-sm text-muted-foreground whitespace-nowrap">{label}</span>
      <Select
        value={selectedId ? String(selectedId) : ""}
        onValueChange={(v) => onSelect(parseInt(v, 10))}
      >
        <SelectTrigger className="w-56 h-8 text-sm">
          <SelectValue placeholder="Selecionar condomínio..." />
        </SelectTrigger>
        <SelectContent>
          {condominios.map((c) => (
            <SelectItem key={c.id} value={String(c.id)}>
              {c.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
