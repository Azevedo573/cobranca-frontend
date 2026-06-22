import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { trpc } from "@/lib/trpc";
import { Building2, Plus, Pencil, Archive, ArrowLeft, Briefcase, Filter } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";
import { toast } from "sonner";
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type StatusCadastro = "ativo" | "inativo" | "arquivado";
type SituacaoJuridica = "sem_processos" | "processos_ativos" | "processos_encerrados";

interface ArquivarForm {
  statusCadastro: StatusCadastro;
  dataRescisao: string;
  motivoSaida: string;
  situacaoJuridica: SituacaoJuridica | "";
  observacoesSaida: string;
}

const STATUS_LABELS: Record<StatusCadastro, string> = {
  ativo: "Ativo",
  inativo: "Inativo",
  arquivado: "Arquivado",
};

const STATUS_BADGE_CLASSES: Record<StatusCadastro, string> = {
  ativo: "border-green-300 text-green-700 bg-green-50 dark:bg-green-950/30",
  inativo: "border-yellow-300 text-yellow-700 bg-yellow-50 dark:bg-yellow-950/30",
  arquivado: "border-gray-300 text-gray-600 bg-gray-50 dark:bg-gray-950/30",
};

const SITUACAO_LABELS: Record<SituacaoJuridica, string> = {
  sem_processos: "Sem processos",
  processos_ativos: "Processos ativos",
  processos_encerrados: "Processos encerrados",
};

export default function Condominios() {
  const { user, logout } = useAuth();
  const utils = trpc.useUtils();
  const { data: condominios, isLoading } = trpc.condominios.list.useQuery();

  const [filtroStatus, setFiltroStatus] = useState<"todos" | StatusCadastro>("todos");
  const [arquivarModal, setArquivarModal] = useState<{ open: boolean; id: number; nome: string } | null>(null);
  const [form, setForm] = useState<ArquivarForm>({
    statusCadastro: "inativo",
    dataRescisao: "",
    motivoSaida: "",
    situacaoJuridica: "",
    observacoesSaida: "",
  });

  const arquivarMutation = trpc.condominios.arquivar.useMutation({
    onSuccess: () => {
      toast.success("Status do cliente atualizado com sucesso!");
      utils.condominios.list.invalidate();
      setArquivarModal(null);
    },
    onError: (error) => {
      toast.error("Erro ao atualizar status: " + error.message);
    },
  });

  const handleAbrirArquivar = (id: number, nome: string, cond: any) => {
    setForm({
      statusCadastro: (cond.statusCadastro as StatusCadastro) || "inativo",
      dataRescisao: cond.dataRescisao || "",
      motivoSaida: cond.motivoSaida || "",
      situacaoJuridica: (cond.situacaoJuridica as SituacaoJuridica) || "",
      observacoesSaida: cond.observacoesSaida || "",
    });
    setArquivarModal({ open: true, id, nome });
  };

  const handleConfirmarArquivar = () => {
    if (!arquivarModal) return;
    arquivarMutation.mutate({
      id: arquivarModal.id,
      statusCadastro: form.statusCadastro,
      dataRescisao: form.dataRescisao || null,
      motivoSaida: form.motivoSaida || null,
      situacaoJuridica: form.situacaoJuridica || null,
      observacoesSaida: form.observacoesSaida || null,
    });
  };

  const condominiosFiltrados = (condominios || []).filter((c) => {
    if (filtroStatus === "todos") return true;
    return ((c as any).statusCadastro || "ativo") === filtroStatus;
  });

  const contadores = {
    todos: (condominios || []).length,
    ativo: (condominios || []).filter((c) => ((c as any).statusCadastro || "ativo") === "ativo").length,
    inativo: (condominios || []).filter((c) => ((c as any).statusCadastro || "ativo") === "inativo").length,
    arquivado: (condominios || []).filter((c) => ((c as any).statusCadastro || "ativo") === "arquivado").length,
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-accent/5">
      {/* Header */}
      <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href="/admin/dashboard">
                <Button variant="ghost" size="icon">
                  <ArrowLeft className="h-5 w-5" />
                </Button>
              </Link>
              <div>
                <h1 className="text-2xl font-bold text-primary">Gerenciar Clientes</h1>
                <p className="text-sm text-muted-foreground">Cadastro e manutenção</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right">
                <p className="text-sm font-medium">{user?.name}</p>
                <p className="text-xs text-muted-foreground">{user?.role}</p>
              </div>
              <Button variant="outline" onClick={() => logout()}>
                Sair
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Building2 className="h-5 w-5" />
                  Clientes Cadastrados
                </CardTitle>
                <CardDescription>
                  Total: {condominiosFiltrados.length} cliente(s)
                  {filtroStatus !== "todos" && ` (${STATUS_LABELS[filtroStatus]})`}
                </CardDescription>
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                {/* Filtro de status */}
                <div className="flex items-center gap-2">
                  <Filter className="h-4 w-4 text-muted-foreground" />
                  <div className="flex gap-1">
                    {(["todos", "ativo", "inativo", "arquivado"] as const).map((s) => (
                      <Button
                        key={s}
                        variant={filtroStatus === s ? "default" : "outline"}
                        size="sm"
                        onClick={() => setFiltroStatus(s)}
                        className="text-xs"
                      >
                        {s === "todos" ? "Todos" : STATUS_LABELS[s]}
                        <span className="ml-1 text-xs opacity-70">
                          ({contadores[s]})
                        </span>
                      </Button>
                    ))}
                  </div>
                </div>
                <Link href="/admin/condominios/novo">
                  <Button className="bg-accent hover:bg-accent/90 text-accent-foreground">
                    <Plus className="mr-2 h-4 w-4" />
                    Novo Cliente
                  </Button>
                </Link>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
                <p className="mt-4 text-muted-foreground">Carregando...</p>
              </div>
            ) : condominiosFiltrados.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Nome</TableHead>
                    <TableHead>CNPJ</TableHead>
                    <TableHead>Cidade/Estado</TableHead>
                    <TableHead>Responsável</TableHead>
                    <TableHead>Contato</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {condominiosFiltrados.map((cond) => {
                    const status: StatusCadastro = ((cond as any).statusCadastro || "ativo") as StatusCadastro;
                    return (
                      <TableRow key={cond.id} className={status === "arquivado" ? "opacity-60" : ""}>
                        <TableCell>
                          {(cond as any).tipo === "empresa" ? (
                            <Badge variant="outline" className="gap-1 text-xs border-violet-300 text-violet-700 bg-violet-50 dark:bg-violet-950/30">
                              <Briefcase className="h-3 w-3" />
                              Empresa
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="gap-1 text-xs border-blue-300 text-blue-700 bg-blue-50 dark:bg-blue-950/30">
                              <Building2 className="h-3 w-3" />
                              Condomínio
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`text-xs ${STATUS_BADGE_CLASSES[status]}`}>
                            {STATUS_LABELS[status]}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-medium">{cond.name}</TableCell>
                        <TableCell>{cond.cnpj || "-"}</TableCell>
                        <TableCell>
                          {cond.city && cond.state ? `${cond.city}/${cond.state}` : "-"}
                        </TableCell>
                        <TableCell>{cond.managerName || "-"}</TableCell>
                        <TableCell>
                          <div className="text-sm">
                            {cond.phone && <div>{cond.phone}</div>}
                            {cond.email && <div className="text-muted-foreground">{cond.email}</div>}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Link href={`/admin/condominios/${cond.id}`}>
                              <Button variant="ghost" size="icon" title="Editar">
                                <Pencil className="h-4 w-4" />
                              </Button>
                            </Link>
                            <Button
                              variant="ghost"
                              size="icon"
                              title="Arquivar / Alterar status"
                              className="text-amber-600 hover:text-amber-700"
                              onClick={() => handleAbrirArquivar(cond.id, cond.name, cond)}
                            >
                              <Archive className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            ) : (
              <div className="text-center py-12">
                <Building2 className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">Nenhum cliente encontrado</h3>
                <p className="text-muted-foreground mb-4">
                  {filtroStatus !== "todos"
                    ? `Não há clientes com status "${STATUS_LABELS[filtroStatus]}".`
                    : "Comece cadastrando o primeiro cliente do sistema."}
                </p>
                {filtroStatus === "todos" && (
                  <Link href="/admin/condominios/novo">
                    <Button className="bg-accent hover:bg-accent/90 text-accent-foreground">
                      <Plus className="mr-2 h-4 w-4" />
                      Cadastrar Primeiro Cliente
                    </Button>
                  </Link>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </main>

      {/* Modal de Arquivamento */}
      <Dialog open={!!arquivarModal?.open} onOpenChange={(open) => !open && setArquivarModal(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Archive className="h-5 w-5 text-amber-600" />
              Alterar Status do Cliente
            </DialogTitle>
            <DialogDescription>
              Atualize o status de <strong>{arquivarModal?.nome}</strong>. O registro não será excluído.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Status do Cadastro *</Label>
              <Select
                value={form.statusCadastro}
                onValueChange={(v) => setForm((f) => ({ ...f, statusCadastro: v as StatusCadastro }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ativo">Ativo</SelectItem>
                  <SelectItem value="inativo">Inativo</SelectItem>
                  <SelectItem value="arquivado">Arquivado</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {form.statusCadastro !== "ativo" && (
              <>
                <div className="space-y-2">
                  <Label>Data de Rescisão</Label>
                  <Input
                    type="date"
                    value={form.dataRescisao}
                    onChange={(e) => setForm((f) => ({ ...f, dataRescisao: e.target.value }))}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Motivo da Saída</Label>
                  <Textarea
                    placeholder="Descreva o motivo da saída ou inativação..."
                    value={form.motivoSaida}
                    onChange={(e) => setForm((f) => ({ ...f, motivoSaida: e.target.value }))}
                    rows={3}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Situação dos Processos Judiciais</Label>
                  <Select
                    value={form.situacaoJuridica || "sem_processos"}
                    onValueChange={(v) => setForm((f) => ({ ...f, situacaoJuridica: v as SituacaoJuridica }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="sem_processos">Sem processos</SelectItem>
                      <SelectItem value="processos_ativos">Processos ativos</SelectItem>
                      <SelectItem value="processos_encerrados">Processos encerrados</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Observações</Label>
                  <Textarea
                    placeholder="Observações adicionais sobre o encerramento..."
                    value={form.observacoesSaida}
                    onChange={(e) => setForm((f) => ({ ...f, observacoesSaida: e.target.value }))}
                    rows={2}
                  />
                </div>
              </>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setArquivarModal(null)}>
              Cancelar
            </Button>
            <Button
              onClick={handleConfirmarArquivar}
              disabled={arquivarMutation.isPending}
              className={
                form.statusCadastro === "ativo"
                  ? "bg-green-600 hover:bg-green-700 text-white"
                  : form.statusCadastro === "arquivado"
                  ? "bg-gray-600 hover:bg-gray-700 text-white"
                  : "bg-amber-600 hover:bg-amber-700 text-white"
              }
            >
              {arquivarMutation.isPending ? "Salvando..." : "Confirmar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
