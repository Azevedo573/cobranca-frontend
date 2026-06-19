import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, Trash2, Gavel, AlertCircle } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

const TIPO_LABELS: Record<string, string> = {
  distribuicao: "Distribuição",
  citacao: "Citação",
  pericia: "Perícia",
  honorarios_periciais: "Honorários Periciais",
  diligencia: "Diligência",
  outros: "Outros",
};

const TIPO_COLORS: Record<string, string> = {
  distribuicao: "bg-blue-100 text-blue-700",
  citacao: "bg-purple-100 text-purple-700",
  pericia: "bg-orange-100 text-orange-700",
  honorarios_periciais: "bg-red-100 text-red-700",
  diligencia: "bg-yellow-100 text-yellow-700",
  outros: "bg-gray-100 text-gray-700",
};

function formatarMoeda(centavos: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(centavos / 100);
}

interface Props {
  devedorId: number;
  condominioId: number;
}

export function CustasJudiciais({ devedorId, condominioId }: Props) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    descricao: "",
    valor: "",
    data: new Date().toISOString().split("T")[0],
    tipo: "outros" as string,
    observacoes: "",
  });

  const utils = trpc.useUtils();

  const { data: custas = [], isLoading } = trpc.custas.getByDevedor.useQuery({ devedorId });

  const createMutation = trpc.custas.create.useMutation({
    onSuccess: () => {
      toast.success("Custa judicial lançada com sucesso!");
      utils.custas.getByDevedor.invalidate({ devedorId });
      utils.custas.getTotal.invalidate({ devedorId });
      utils.custas.getLivresByDevedor.invalidate({ devedorId });
      utils.custas.getTotalLivres.invalidate({ devedorId });
      setShowForm(false);
      setForm({ descricao: "", valor: "", data: new Date().toISOString().split("T")[0], tipo: "outros", observacoes: "" });
    },
    onError: (err) => toast.error("Erro ao lançar custa: " + err.message),
  });

  const deleteMutation = trpc.custas.delete.useMutation({
    onSuccess: () => {
      toast.success("Custa removida.");
      utils.custas.getByDevedor.invalidate({ devedorId });
      utils.custas.getTotal.invalidate({ devedorId });
      utils.custas.getLivresByDevedor.invalidate({ devedorId });
      utils.custas.getTotalLivres.invalidate({ devedorId });
    },
    onError: (err) => toast.error("Erro ao remover custa: " + err.message),
  });

  const totalCustas = custas.reduce((sum, c) => sum + c.valor, 0);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const valorNum = parseFloat(form.valor.replace(",", "."));
    if (!form.descricao.trim()) return toast.error("Informe a descrição.");
    if (isNaN(valorNum) || valorNum <= 0) return toast.error("Informe um valor válido.");
    if (!form.data) return toast.error("Informe a data.");

    createMutation.mutate({
      devedorId,
      condominioId,
      descricao: form.descricao.trim(),
      valor: valorNum,
      data: form.data,
      tipo: form.tipo as any,
      observacoes: form.observacoes.trim() || undefined,
    });
  }

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Gavel className="h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-base font-semibold">Custas Judiciais</CardTitle>
            {totalCustas > 0 && (
              <Badge variant="secondary" className="bg-red-100 text-red-700 font-semibold">
                {formatarMoeda(totalCustas)}
              </Badge>
            )}
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowForm(!showForm)}
            className="gap-1.5"
          >
            <Plus className="h-4 w-4" />
            Lançar Custa
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Formulário de lançamento */}
        {showForm && (
          <form onSubmit={handleSubmit} className="border rounded-lg p-4 bg-muted/30 space-y-3">
            <p className="text-sm font-medium text-foreground">Novo Lançamento de Custa Judicial</p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2 space-y-1">
                <Label htmlFor="custa-descricao" className="text-xs">Descrição *</Label>
                <Input
                  id="custa-descricao"
                  placeholder="Ex: Distribuição da ação de cobrança"
                  value={form.descricao}
                  onChange={(e) => setForm({ ...form, descricao: e.target.value })}
                  required
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="custa-tipo" className="text-xs">Tipo *</Label>
                <Select value={form.tipo} onValueChange={(v) => setForm({ ...form, tipo: v })}>
                  <SelectTrigger id="custa-tipo">
                    <SelectValue placeholder="Selecione o tipo" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(TIPO_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label htmlFor="custa-valor" className="text-xs">Valor (R$) *</Label>
                <Input
                  id="custa-valor"
                  placeholder="0,00"
                  value={form.valor}
                  onChange={(e) => setForm({ ...form, valor: e.target.value })}
                  required
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="custa-data" className="text-xs">Data *</Label>
                <Input
                  id="custa-data"
                  type="date"
                  value={form.data}
                  onChange={(e) => setForm({ ...form, data: e.target.value })}
                  required
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="custa-obs" className="text-xs">Observações</Label>
                <Textarea
                  id="custa-obs"
                  placeholder="Informações adicionais (opcional)"
                  value={form.observacoes}
                  onChange={(e) => setForm({ ...form, observacoes: e.target.value })}
                  rows={2}
                  className="resize-none"
                />
              </div>
            </div>

            <div className="flex gap-2 pt-1">
              <Button type="submit" size="sm" disabled={createMutation.isPending}>
                {createMutation.isPending ? "Salvando..." : "Salvar Lançamento"}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setShowForm(false)}
              >
                Cancelar
              </Button>
            </div>
          </form>
        )}

        {/* Lista de custas */}
        {isLoading ? (
          <div className="text-sm text-muted-foreground py-2">Carregando...</div>
        ) : custas.length === 0 ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-3 px-2 rounded-lg bg-muted/20">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>Nenhuma custa judicial lançada para este devedor.</span>
          </div>
        ) : (
          <div className="space-y-2">
            {custas.map((custa: typeof custas[number]) => (
              <div
                key={custa.id}
                className="flex items-start justify-between gap-3 p-3 rounded-lg border bg-background hover:bg-muted/20 transition-colors"
              >
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium truncate">{custa.descricao}</span>
                    <span className={`text-[11px] px-1.5 py-0.5 rounded-full font-medium ${TIPO_COLORS[custa.tipo] ?? TIPO_COLORS.outros}`}>
                      {TIPO_LABELS[custa.tipo] ?? custa.tipo}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span>{format(new Date(custa.data), "dd/MM/yyyy", { locale: ptBR })}</span>
                    {custa.observacoes && (
                      <span className="truncate max-w-[200px]">{custa.observacoes}</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-sm font-semibold text-red-600">{formatarMoeda(custa.valor)}</span>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-muted-foreground hover:text-red-600"
                    onClick={() => {
                      if (confirm("Remover esta custa judicial?")) {
                        deleteMutation.mutate({ id: custa.id });
                      }
                    }}
                    disabled={deleteMutation.isPending}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}

            {/* Total */}
            <div className="flex justify-between items-center pt-2 border-t text-sm font-semibold">
              <span className="text-muted-foreground">Total de Custas Judiciais</span>
              <span className="text-red-600">{formatarMoeda(totalCustas)}</span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
