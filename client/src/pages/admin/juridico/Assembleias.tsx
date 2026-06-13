import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  Plus, Calendar, Clock, MapPin, User, Building2, FileText, CheckCircle2,
  XCircle, Edit2, Trash2, ChevronRight
} from "lucide-react";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const TIPO_ASSEMBLEIA: Record<string, { label: string; color: string }> = {
  ordinaria:        { label: "Ordinária",        color: "bg-blue-100 text-blue-700 border-blue-200" },
  extraordinaria:   { label: "Extraordinária",   color: "bg-purple-100 text-purple-700 border-purple-200" },
  prestacao_contas: { label: "Prestação de Contas", color: "bg-amber-100 text-amber-700 border-amber-200" },
  eleicao:          { label: "Eleição",           color: "bg-green-100 text-green-700 border-green-200" },
  outro:            { label: "Outro",             color: "bg-slate-100 text-slate-700 border-slate-200" },
};

const STATUS_ASSEMBLEIA: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  agendada:   { label: "Agendada",   icon: <Clock className="h-3.5 w-3.5" />,         color: "bg-blue-100 text-blue-700" },
  realizada:  { label: "Realizada",  icon: <CheckCircle2 className="h-3.5 w-3.5" />,  color: "bg-green-100 text-green-700" },
  cancelada:  { label: "Cancelada",  icon: <XCircle className="h-3.5 w-3.5" />,       color: "bg-red-100 text-red-700" },
};

function formatDate(d: string | Date | null | undefined) {
  if (!d) return "";
  return new Date(d).toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });
}

function formatDateShort(d: string | Date | null | undefined) {
  if (!d) return "";
  return new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

// ─── Modal de Criação/Edição ──────────────────────────────────────────────────

function ModalAssembleia({ open, onClose, assembleia }: {
  open: boolean;
  onClose: () => void;
  assembleia?: any;
}) {
  const utils = trpc.useUtils();
  const { data: condominios = [] } = trpc.condominios.list.useQuery();
  const { data: advogados = [] } = trpc.juridicoDemandas.getAdvogados.useQuery();
  const isEditing = !!assembleia;

  const [form, setForm] = useState({
    tipo: assembleia?.tipo ?? "ordinaria",
    data: assembleia?.data ? new Date(assembleia.data).toISOString().substring(0, 10) : "",
    hora: assembleia?.hora ?? "19:00",
    endereco: assembleia?.endereco ?? "",
    advogadoNome: assembleia?.advogadoNome ?? "",
    pauta: assembleia?.pauta ?? "",
    condominioId: assembleia?.condominioId ? String(assembleia.condominioId) : "",
  });

  const createMutation = trpc.juridicoDemandas.createAssembleia.useMutation({
    onSuccess: () => {
      toast.success("Assembleia agendada!");
      utils.juridicoDemandas.listarAssembleias.invalidate();
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });

  const updateMutation = trpc.juridicoDemandas.updateAssembleia.useMutation({
    onSuccess: () => {
      toast.success("Assembleia atualizada!");
      utils.juridicoDemandas.listarAssembleias.invalidate();
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });

  const handleSubmit = () => {
    if (!form.data) return toast.error("Informe a data da assembleia");
    if (!form.hora) return toast.error("Informe o horário");
    const payload = {
      tipo: form.tipo as any,
      data: form.data,
      hora: form.hora,
      endereco: form.endereco || undefined,
      advogadoNome: form.advogadoNome || undefined,
      pauta: form.pauta || undefined,
      condominioId: form.condominioId ? Number(form.condominioId) : null,
    };
    if (isEditing) {
      updateMutation.mutate({ id: assembleia.id, ...payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-primary" />
            {isEditing ? "Editar Assembleia" : "Agendar Nova Assembleia"}
          </DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-4 py-2">
          <div className="col-span-2">
            <Label>Condomínio</Label>
            <Select value={form.condominioId} onValueChange={v => setForm(f => ({ ...f, condominioId: v }))}>
              <SelectTrigger><SelectValue placeholder="Selecione o condomínio" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sem condomínio específico</SelectItem>
                {(condominios as any[]).map((c: any) => (
                  <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Tipo *</Label>
            <Select value={form.tipo} onValueChange={v => setForm(f => ({ ...f, tipo: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(TIPO_ASSEMBLEIA).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Data *</Label>
            <Input type="date" value={form.data} onChange={e => setForm(f => ({ ...f, data: e.target.value }))} />
          </div>
          <div>
            <Label>Horário *</Label>
            <Input type="time" value={form.hora} onChange={e => setForm(f => ({ ...f, hora: e.target.value }))} />
          </div>
          <div>
            <Label>Advogado Responsável</Label>
            <Select value={form.advogadoNome} onValueChange={v => setForm(f => ({ ...f, advogadoNome: v }))}>
              <SelectTrigger><SelectValue placeholder="Selecione um advogado..." /></SelectTrigger>
              <SelectContent>
                <SelectItem value="">Nenhum</SelectItem>
                {advogados.map(adv => (
                  <SelectItem key={adv.id} value={adv.name ?? ""}>{adv.name ?? "(sem nome)"}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {advogados.length === 0 && (
              <p className="text-xs text-muted-foreground mt-1">Nenhum advogado cadastrado.</p>
            )}
          </div>
          <div className="col-span-2">
            <Label>Local / Endereço</Label>
            <Input placeholder="Salão de festas, endereço..." value={form.endereco} onChange={e => setForm(f => ({ ...f, endereco: e.target.value }))} />
          </div>
          <div className="col-span-2">
            <Label>Pauta</Label>
            <Textarea
              placeholder="Itens da pauta da assembleia..."
              rows={4}
              value={form.pauta}
              onChange={e => setForm(f => ({ ...f, pauta: e.target.value }))}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={isPending}>
            {isPending ? "Salvando..." : isEditing ? "Salvar" : "Agendar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Modal de Registro de Ata ─────────────────────────────────────────────────

function ModalAta({ open, onClose, assembleia }: { open: boolean; onClose: () => void; assembleia: any }) {
  const utils = trpc.useUtils();
  const [ata, setAta] = useState(assembleia?.ata ?? "");
  const [horasGastas, setHorasGastas] = useState(assembleia?.horasGastas ?? "");
  const [observacoes, setObservacoes] = useState(assembleia?.observacoes ?? "");

  const updateMutation = trpc.juridicoDemandas.updateAssembleia.useMutation({
    onSuccess: () => {
      toast.success("Ata registrada!");
      utils.juridicoDemandas.listarAssembleias.invalidate();
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            Registrar Ata — {assembleia?.condominioNome ?? "Assembleia"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <Label>Horas Gastas</Label>
            <Input placeholder="Ex: 2h30min" value={horasGastas} onChange={e => setHorasGastas(e.target.value)} />
          </div>
          <div>
            <Label>Ata da Assembleia</Label>
            <Textarea
              placeholder="Registre aqui o conteúdo da ata..."
              rows={8}
              value={ata}
              onChange={e => setAta(e.target.value)}
            />
          </div>
          <div>
            <Label>Observações</Label>
            <Textarea
              placeholder="Observações adicionais..."
              rows={3}
              value={observacoes}
              onChange={e => setObservacoes(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button
            onClick={() => updateMutation.mutate({
              id: assembleia.id,
              status: "realizada",
              ata: ata || undefined,
              horasGastas: horasGastas || undefined,
              observacoes: observacoes || undefined,
            })}
            disabled={updateMutation.isPending}
          >
            {updateMutation.isPending ? "Salvando..." : "Salvar Ata"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Card de Assembleia ───────────────────────────────────────────────────────

function CardAssembleia({ a, onEdit, onAta, onDelete }: {
  a: any;
  onEdit: () => void;
  onAta: () => void;
  onDelete: () => void;
}) {
  const tipo = TIPO_ASSEMBLEIA[a.tipo];
  const status = STATUS_ASSEMBLEIA[a.status ?? "agendada"];

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <Badge variant="outline" className={`text-xs ${tipo?.color}`}>{tipo?.label}</Badge>
              <Badge variant="secondary" className={`text-xs flex items-center gap-1 ${status?.color}`}>
                {status?.icon}{status?.label}
              </Badge>
            </div>
            {a.condominioNome && (
              <div className="flex items-center gap-1.5 text-sm font-medium mb-1">
                <Building2 className="h-4 w-4 text-muted-foreground" />
                {a.condominioNome}
              </div>
            )}
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground mb-1">
              <Calendar className="h-4 w-4" />
              {formatDate(a.data)} às {a.hora}
            </div>
            {a.endereco && (
              <div className="flex items-center gap-1.5 text-sm text-muted-foreground mb-1">
                <MapPin className="h-4 w-4" />
                {a.endereco}
              </div>
            )}
            {a.advogadoNome && (
              <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <User className="h-4 w-4" />
                {a.advogadoNome}
              </div>
            )}
            {a.pauta && (
              <div className="mt-2 text-xs text-muted-foreground bg-muted/50 rounded p-2 line-clamp-2">
                <strong>Pauta:</strong> {a.pauta}
              </div>
            )}
            {a.ata && (
              <div className="mt-2 flex items-center gap-1 text-xs text-green-600">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Ata registrada
                {a.horasGastas && ` · ${a.horasGastas}`}
              </div>
            )}
          </div>
          <div className="flex flex-col gap-1">
            {a.status !== "realizada" && a.status !== "cancelada" && (
              <Button size="sm" variant="outline" className="text-xs h-7" onClick={onAta}>
                <FileText className="h-3 w-3 mr-1" />Ata
              </Button>
            )}
            <Button size="sm" variant="ghost" className="h-7" onClick={onEdit}>
              <Edit2 className="h-3.5 w-3.5" />
            </Button>
            <Button size="sm" variant="ghost" className="h-7 text-red-500 hover:text-red-600" onClick={onDelete}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Página Principal ─────────────────────────────────────────────────────────

export default function Assembleias() {
  const [modalAberto, setModalAberto] = useState(false);
  const [modalAta, setModalAta] = useState<any>(null);
  const [editando, setEditando] = useState<any>(null);
  const utils = trpc.useUtils();

  const { data: assembleias = [], isLoading } = trpc.juridicoDemandas.listarAssembleias.useQuery();

  const deleteMutation = trpc.juridicoDemandas.deleteAssembleia.useMutation({
    onSuccess: () => {
      toast.success("Assembleia excluída");
      utils.juridicoDemandas.listarAssembleias.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const updateStatusMutation = trpc.juridicoDemandas.updateAssembleia.useMutation({
    onSuccess: () => {
      toast.success("Status atualizado");
      utils.juridicoDemandas.listarAssembleias.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const agendadas = (assembleias as any[]).filter((a: any) => a.status === "agendada" || !a.status);
  const realizadas = (assembleias as any[]).filter((a: any) => a.status === "realizada");
  const canceladas = (assembleias as any[]).filter((a: any) => a.status === "cancelada");

  const renderLista = (lista: any[]) => {
    if (lista.length === 0) {
      return (
        <div className="text-center py-12 text-muted-foreground">
          <Calendar className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p>Nenhuma assembleia nesta categoria</p>
        </div>
      );
    }
    return (
      <div className="space-y-3">
        {lista.map((a: any) => (
          <CardAssembleia
            key={a.id}
            a={a}
            onEdit={() => setEditando(a)}
            onAta={() => setModalAta(a)}
            onDelete={() => {
              if (confirm("Excluir esta assembleia?")) deleteMutation.mutate({ id: a.id });
            }}
          />
        ))}
      </div>
    );
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Assembleias</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {agendadas.length} agendada{agendadas.length !== 1 ? "s" : ""} · {realizadas.length} realizada{realizadas.length !== 1 ? "s" : ""}
          </p>
        </div>
        <Button onClick={() => setModalAberto(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Agendar Assembleia
        </Button>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="agendadas">
        <TabsList>
          <TabsTrigger value="agendadas">
            Agendadas <Badge variant="secondary" className="ml-1.5">{agendadas.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="realizadas">
            Realizadas <Badge variant="secondary" className="ml-1.5">{realizadas.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="canceladas">
            Canceladas <Badge variant="secondary" className="ml-1.5">{canceladas.length}</Badge>
          </TabsTrigger>
        </TabsList>
        <TabsContent value="agendadas" className="mt-4">
          {isLoading ? <div className="text-center py-8 text-muted-foreground">Carregando...</div> : renderLista(agendadas)}
        </TabsContent>
        <TabsContent value="realizadas" className="mt-4">
          {renderLista(realizadas)}
        </TabsContent>
        <TabsContent value="canceladas" className="mt-4">
          {renderLista(canceladas)}
        </TabsContent>
      </Tabs>

      {/* Modais */}
      <ModalAssembleia open={modalAberto} onClose={() => setModalAberto(false)} />
      {editando && (
        <ModalAssembleia open={!!editando} onClose={() => setEditando(null)} assembleia={editando} />
      )}
      {modalAta && (
        <ModalAta open={!!modalAta} onClose={() => setModalAta(null)} assembleia={modalAta} />
      )}
    </div>
  );
}
