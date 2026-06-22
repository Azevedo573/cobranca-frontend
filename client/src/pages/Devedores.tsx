import { useAuth } from "@/_core/hooks/useAuth";
import { getDevedorIdentificador } from '@/lib/devedorUtils';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { trpc } from "@/lib/trpc";
import { Users, FileText, Plus, Eye, ArrowLeft, Search, Pencil, Trash2, ListChecks } from "lucide-react";
import { ExportExcelButton } from "@/components/ExportExcelButton";
import { Pagination, paginateItems } from "@/components/Pagination";
import { BadgePrioridade } from "@/components/BadgePrioridade";
import { Link, useLocation } from "wouter";
import { useState, useMemo } from "react";
import { format } from "date-fns";
import { calcularValorDevido, formatarMoeda, type TaxasCondominio } from "../../../shared/calculos";
import { toast } from "sonner";
import { usePermissions } from "@/hooks/usePermissions";

const PAGE_SIZE_DEFAULT = 25;

type Visao = "devedores" | "cobrancas";

export default function Devedores() {
  const { user, logout } = useAuth();
  const { can } = usePermissions();
  const [, setLocation] = useLocation();

  // ── Visão ──────────────────────────────────────────────────────────────────
  const [visao, setVisao] = useState<Visao>("devedores");

  // ── Filtros compartilhados ─────────────────────────────────────────────────
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCondominioId, setSelectedCondominioId] = useState<number | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE_DEFAULT);

  const rolesComSeletorCondominio = ["admin", "advogado"];
  const condominioId = rolesComSeletorCondominio.includes(user?.role ?? "") ? selectedCondominioId : user?.condominioId;

  const { data: condominios } = trpc.condominios.list.useQuery(undefined, { enabled: rolesComSeletorCondominio.includes(user?.role ?? "") });

  // ── Dados: Devedores ───────────────────────────────────────────────────────
  const { data: devedores, isLoading: loadingDevedores } = trpc.devedores.list.useQuery(
    { condominioId: condominioId! },
    { enabled: !!condominioId }
  );

  const [deleteDevedorOpen, setDeleteDevedorOpen] = useState(false);
  const [devedorToDelete, setDevedorToDelete] = useState<number | null>(null);

  const utils = trpc.useUtils();

  const deleteDevedorMutation = trpc.devedores.delete.useMutation({
    onSuccess: () => {
      toast.success("Devedor excluído com sucesso!");
      utils.devedores.list.invalidate();
      setDeleteDevedorOpen(false);
      setDevedorToDelete(null);
    },
    onError: (e) => toast.error("Erro ao excluir devedor: " + e.message),
  });

  const normalizarDoc = (doc: string) => doc.replace(/[.\-\/]/g, '');

  const filteredDevedores = devedores?.filter(dev => {
    const t = searchTerm.toLowerCase();
    const tn = normalizarDoc(searchTerm);
    return (
      (dev.name?.toLowerCase() || '').includes(t) ||
      dev.unitNumber.toLowerCase().includes(t) ||
      (dev.bloco?.toLowerCase() || '').includes(t) ||
      (dev.cpfCnpj && (dev.cpfCnpj.toLowerCase().includes(t) || normalizarDoc(dev.cpfCnpj).includes(tn)))
    );
  });

  const getStatusDevedorBadge = (status: string) => {
    const v: Record<string, { variant: "default" | "secondary" | "outline"; label: string }> = {
      ativo: { variant: "default", label: "Ativo" },
      acordo: { variant: "secondary", label: "Acordo" },
      pago: { variant: "outline", label: "Pago" },
    };
    const c = v[status] || { variant: "outline" as const, label: status };
    return <Badge variant={c.variant}>{c.label}</Badge>;
  };

  // ── Dados: Cobranças ───────────────────────────────────────────────────────
  const { data: cobrancas, isLoading: loadingCobrancas } = trpc.cobrancas.list.useQuery(
    { condominioId: condominioId ?? 0 },
    { enabled: condominioId !== null && condominioId !== undefined }
  );

  const { data: condominio } = trpc.condominios.getById.useQuery(
    { id: condominioId! },
    { enabled: condominioId !== null && condominioId !== undefined }
  );

  const taxas: TaxasCondominio | null = useMemo(() => {
    if (!condominio) return null;
    return {
      taxaJurosMensal: Number(condominio.taxaJurosMensal || "1.00"),
      taxaMulta: Number(condominio.taxaMulta || "2.00"),
      taxaHonorarios: Number(condominio.taxaHonorarios || "10.00"),
      correcaoMonetaria: Number(condominio.correcaoMonetaria || "0.00"),
    };
  }, [condominio]);

  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [statusLoteOpen, setStatusLoteOpen] = useState(false);
  const [novoStatusLote, setNovoStatusLote] = useState("");
  const [deleteCobrancaOpen, setDeleteCobrancaOpen] = useState(false);
  const [cobrancaToDelete, setCobrancaToDelete] = useState<number | null>(null);

  const alterarStatusLoteMutation = trpc.importacoes.alterarStatusEmLote.useMutation({
    onSuccess: (data) => {
      toast.success(`Status alterado em ${data.alterados} cobranças`);
      utils.cobrancas.list.invalidate();
      setSelectedIds([]);
      setStatusLoteOpen(false);
      setNovoStatusLote("");
    },
    onError: (e) => toast.error("Erro ao alterar status: " + e.message),
  });

  const deleteCobrancaMutation = trpc.cobrancas.delete.useMutation({
    onSuccess: () => {
      toast.success("Dívida excluída com sucesso!");
      utils.cobrancas.list.invalidate();
      setDeleteCobrancaOpen(false);
      setCobrancaToDelete(null);
    },
    onError: (e) => toast.error("Erro ao excluir dívida: " + e.message),
  });

  const getDevedorName = (devedorId: number) =>
    devedores?.find(d => d.id === devedorId)?.name || "Desconhecido";

  const filteredCobrancas = cobrancas?.filter(cob => {
    const t = searchTerm.toLowerCase();
    return (
      getDevedorName(cob.devedorId).toLowerCase().includes(t) ||
      cob.description?.toLowerCase().includes(t) ||
      cob.monthReference?.toLowerCase().includes(t)
    );
  });

  const getStatusCobrancaBadge = (status: string) => {
    const v: Record<string, { variant: "default" | "secondary" | "outline" | "destructive"; label: string }> = {
      pendente: { variant: "destructive", label: "Pendente" },
      em_cobranca: { variant: "default", label: "Em Cobrança" },
      pago: { variant: "outline", label: "Pago" },
      acordo: { variant: "secondary", label: "Acordo" },
    };
    const c = v[status] || { variant: "outline" as const, label: status };
    return <Badge variant={c.variant}>{c.label}</Badge>;
  };

  // ── Helpers ────────────────────────────────────────────────────────────────
  const getDashboardUrl = () => {
    if (user?.role === "admin") return "/admin/dashboard";
    if (user?.role === "sindico") return "/sindico/dashboard";
    return "/cobrador/dashboard";
  };

  const handleSearchChange = (value: string) => {
    setSearchTerm(value);
    setCurrentPage(1);
  };

  const handleVisaoChange = (v: Visao) => {
    setVisao(v);
    setSearchTerm("");
    setCurrentPage(1);
    setSelectedIds([]);
  };

  const isLoading = visao === "devedores" ? loadingDevedores : loadingCobrancas;

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-accent/5">
      {/* Header */}
      <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href={getDashboardUrl()}>
                <Button variant="ghost" size="icon">
                  <ArrowLeft className="h-5 w-5" />
                </Button>
              </Link>
              <div>
                <h1 className="text-2xl font-bold text-primary">
                  {visao === "devedores" ? "Devedores" : "Cobranças"}
                </h1>
                <p className="text-sm text-muted-foreground">
                  {visao === "devedores" ? "Gestão de inadimplentes" : "Gestão de dívidas em aberto"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right">
                <p className="text-sm font-medium">{user?.name}</p>
                <p className="text-xs text-muted-foreground">{user?.role}</p>
              </div>
              <Button variant="outline" onClick={() => logout()}>Sair</Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        <Card>
          <CardHeader>
            {/* Toggle de visão */}
            <div className="flex items-center gap-1 p-1 bg-muted rounded-lg w-fit mb-4">
              <button
                onClick={() => handleVisaoChange("devedores")}
                className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${
                  visao === "devedores"
                    ? "bg-background shadow text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Users className="h-4 w-4" />
                Devedores
                {filteredDevedores && (
                  <span className={`text-xs px-1.5 py-0.5 rounded-full ${visao === "devedores" ? "bg-primary/10 text-primary" : "bg-muted-foreground/20"}`}>
                    {filteredDevedores.length}
                  </span>
                )}
              </button>
              <button
                onClick={() => handleVisaoChange("cobrancas")}
                className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${
                  visao === "cobrancas"
                    ? "bg-background shadow text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <FileText className="h-4 w-4" />
                Cobranças
                {filteredCobrancas && (
                  <span className={`text-xs px-1.5 py-0.5 rounded-full ${visao === "cobrancas" ? "bg-primary/10 text-primary" : "bg-muted-foreground/20"}`}>
                    {filteredCobrancas.length}
                  </span>
                )}
              </button>
            </div>

            <div className="flex items-center justify-between">
              <CardDescription>
                {visao === "devedores"
                  ? `Total: ${filteredDevedores?.length || 0} devedor(es)`
                  : `Total: ${filteredCobrancas?.length || 0} dívida(s)`}
              </CardDescription>
              <div className="flex items-center gap-2">
                {/* Ações de cobranças em lote */}
                {visao === "cobrancas" && selectedIds.length > 0 && can("cobrancas", "editar") && (
                  <Button variant="outline" onClick={() => setStatusLoteOpen(true)} className="border-primary text-primary hover:bg-primary/10">
                    <ListChecks className="mr-2 h-4 w-4" />
                    Alterar Status ({selectedIds.length})
                  </Button>
                )}
                {/* Exportar */}
                {visao === "devedores" && can("devedores", "exportar") && (
                  <ExportExcelButton
                    onClick={async () => utils.client.exportacao.devedores.mutate({ condominioId: condominioId || undefined })}
                    label="Exportar Excel"
                  />
                )}
                {visao === "cobrancas" && can("cobrancas", "exportar") && (
                  <ExportExcelButton
                    onClick={async () => utils.client.exportacao.cobrancas.mutate({ condominioId: condominioId || undefined })}
                    label="Exportar Excel"
                  />
                )}
                {/* Novo */}
                {visao === "devedores" && can("devedores", "criar") && (
                  <Link href="/devedores/novo">
                    <Button className="bg-accent hover:bg-accent/90 text-accent-foreground">
                      <Plus className="mr-2 h-4 w-4" />Novo Devedor
                    </Button>
                  </Link>
                )}
                {visao === "cobrancas" && can("cobrancas", "criar") && (
                  <Link href="/processos/novo">
                    <Button className="bg-accent hover:bg-accent/90 text-accent-foreground">
                      <Plus className="mr-2 h-4 w-4" />Nova Dívida
                    </Button>
                  </Link>
                )}
              </div>
            </div>

            {/* Filtros */}
            <div className="mt-4 space-y-4">
              {rolesComSeletorCondominio.includes(user?.role ?? "") && (
                <Select
                  value={selectedCondominioId?.toString() || ""}
                  onValueChange={(v) => setSelectedCondominioId(Number(v))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione um condomínio" />
                  </SelectTrigger>
                  <SelectContent>
                    {condominios?.map((c) => (
                      <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder={visao === "devedores"
                    ? "Buscar por nome, unidade, bloco ou CPF/CNPJ..."
                    : "Buscar por devedor, descrição ou mês..."}
                  value={searchTerm}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
          </CardHeader>

          <CardContent>
            {isLoading ? (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto" />
                <p className="mt-4 text-muted-foreground">Carregando...</p>
              </div>
            ) : visao === "devedores" ? (
              /* ── Tabela Devedores ── */
              filteredDevedores && filteredDevedores.length > 0 ? (
                <>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Nome</TableHead>
                        <TableHead>Unidade</TableHead>
                        <TableHead>Bloco</TableHead>
                        <TableHead>Contato</TableHead>
                        <TableHead>Valor Devido</TableHead>
                        <TableHead>Prioridade</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paginateItems(filteredDevedores, currentPage, pageSize).map((dev) => (
                        <TableRow key={dev.id}>
                          <TableCell className="font-medium">{getDevedorIdentificador(dev)}</TableCell>
                          <TableCell>{dev.unitNumber}</TableCell>
                          <TableCell>{dev.bloco || "-"}</TableCell>
                          <TableCell>
                            <div className="text-sm">
                              {dev.phone && <div>{dev.phone}</div>}
                              {dev.email && <div className="text-muted-foreground text-xs">{dev.email}</div>}
                            </div>
                          </TableCell>
                          <TableCell className="font-semibold text-destructive">
                            R$ {(dev.totalDue / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          </TableCell>
                          <TableCell>
                            {dev.prioridade && <BadgePrioridade prioridade={dev.prioridade} />}
                          </TableCell>
                          <TableCell>{getStatusDevedorBadge(dev.status)}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-2">
                              <Link href={`/devedores/${dev.id}/detalhes`}>
                                <Button variant="ghost" size="icon" title="Ver detalhes">
                                  <Eye className="h-4 w-4" />
                                </Button>
                              </Link>
                              {can("devedores", "excluir") && (
                                <Button
                                  variant="ghost" size="icon" title="Excluir"
                                  onClick={() => { setDevedorToDelete(dev.id); setDeleteDevedorOpen(true); }}
                                  className="text-destructive hover:text-destructive"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  <Pagination
                    currentPage={currentPage}
                    totalItems={filteredDevedores.length}
                    pageSize={pageSize}
                    onPageChange={setCurrentPage}
                    onPageSizeChange={(s) => { setPageSize(s); setCurrentPage(1); }}
                  />
                </>
              ) : (
                <div className="text-center py-12">
                  <Users className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-semibold mb-2">
                    {searchTerm ? "Nenhum devedor encontrado" : "Nenhum devedor cadastrado"}
                  </h3>
                  <p className="text-muted-foreground mb-4">
                    {searchTerm ? "Tente buscar com outros termos" : "Comece cadastrando os devedores do condomínio"}
                  </p>
                  {!searchTerm && (user?.role === "admin" || user?.role === "sindico") && (
                    <Link href="/devedores/novo">
                      <Button className="bg-accent hover:bg-accent/90 text-accent-foreground">
                        <Plus className="mr-2 h-4 w-4" />Cadastrar Primeiro Devedor
                      </Button>
                    </Link>
                  )}
                </div>
              )
            ) : (
              /* ── Tabela Cobranças ── */
              filteredCobrancas && filteredCobrancas.length > 0 ? (
                <>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-10">
                          {can("cobrancas", "editar") && (
                            <Checkbox
                              checked={selectedIds.length > 0 && paginateItems(filteredCobrancas, currentPage, pageSize).every(c => selectedIds.includes(c.id))}
                              onCheckedChange={(checked) => {
                                const paginated = paginateItems(filteredCobrancas, currentPage, pageSize);
                                if (checked) setSelectedIds(prev => Array.from(new Set([...prev, ...paginated.map(c => c.id)])));
                                else setSelectedIds(prev => prev.filter(id => !paginated.map(c => c.id).includes(id)));
                              }}
                            />
                          )}
                        </TableHead>
                        <TableHead>Devedor</TableHead>
                        <TableHead>Descrição</TableHead>
                        <TableHead>Mês Ref.</TableHead>
                        <TableHead>Vencimento</TableHead>
                        <TableHead>Valor Original</TableHead>
                        <TableHead>Valor Atualizado</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paginateItems(filteredCobrancas, currentPage, pageSize).map((cob) => {
                        const breakdown = taxas && cob.status !== "pago" && cob.dueDate
                          ? calcularValorDevido(cob.amount / 100, new Date(cob.dueDate), taxas)
                          : null;
                        return (
                          <TableRow key={cob.id} className={selectedIds.includes(cob.id) ? "bg-primary/5" : ""}>
                            <TableCell>
                              {can("cobrancas", "editar") && (
                                <Checkbox
                                  checked={selectedIds.includes(cob.id)}
                                  onCheckedChange={(checked) => {
                                    if (checked) setSelectedIds(prev => [...prev, cob.id]);
                                    else setSelectedIds(prev => prev.filter(id => id !== cob.id));
                                  }}
                                />
                              )}
                            </TableCell>
                            <TableCell className="font-medium">{getDevedorName(cob.devedorId)}</TableCell>
                            <TableCell>{cob.description || "-"}</TableCell>
                            <TableCell>{cob.monthReference || "-"}</TableCell>
                            <TableCell>{cob.dueDate ? format(new Date(cob.dueDate), "dd/MM/yyyy") : "-"}</TableCell>
                            <TableCell className="font-semibold">
                              R$ {(cob.amount / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                            </TableCell>
                            <TableCell className="font-bold text-primary">
                              {breakdown ? formatarMoeda(breakdown.valorTotal) : "R$ " + (cob.amount / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                            </TableCell>
                            <TableCell>{getStatusCobrancaBadge(cob.status)}</TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-2">
                                <Link href={`/processos/${cob.id}`}>
                                  <Button variant="ghost" size="icon" title="Ver detalhes">
                                    <Eye className="h-4 w-4" />
                                  </Button>
                                </Link>
                                {can("cobrancas", "editar") && (
                                  <Button variant="ghost" size="icon" title="Editar"
                                    onClick={() => setLocation(`/processos/${cob.id}/editar`)}>
                                    <Pencil className="h-4 w-4" />
                                  </Button>
                                )}
                                {can("cobrancas", "excluir") && (
                                  <Button variant="ghost" size="icon" title="Excluir"
                                    onClick={() => { setCobrancaToDelete(cob.id); setDeleteCobrancaOpen(true); }}
                                    className="text-destructive hover:text-destructive">
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                  <Pagination
                    currentPage={currentPage}
                    totalItems={filteredCobrancas.length}
                    pageSize={pageSize}
                    onPageChange={setCurrentPage}
                    onPageSizeChange={(s) => { setPageSize(s); setCurrentPage(1); }}
                  />
                </>
              ) : (
                <div className="text-center py-12">
                  <FileText className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-semibold mb-2">
                    {searchTerm ? "Nenhuma dívida encontrada" : "Nenhuma dívida cadastrada"}
                  </h3>
                  <p className="text-muted-foreground mb-4">
                    {searchTerm ? "Tente buscar com outros termos" : "As dívidas cadastradas aparecerão aqui"}
                  </p>
                  {!searchTerm && (user?.role === "admin" || user?.role === "sindico") && (
                    <Link href="/processos/novo">
                      <Button className="bg-accent hover:bg-accent/90 text-accent-foreground">
                        <Plus className="mr-2 h-4 w-4" />Cadastrar Primeira Dívida
                      </Button>
                    </Link>
                  )}
                </div>
              )
            )}
          </CardContent>
        </Card>
      </main>

      {/* ── Diálogo Alterar Status em Lote ── */}
      <Dialog open={statusLoteOpen} onOpenChange={setStatusLoteOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ListChecks className="h-5 w-5" />Alterar Status em Lote
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">{selectedIds.length} cobrança(s) selecionada(s) serão atualizadas.</p>
            <div className="space-y-2">
              <label className="text-sm font-medium">Novo Status</label>
              <Select value={novoStatusLote} onValueChange={setNovoStatusLote}>
                <SelectTrigger><SelectValue placeholder="Selecione o novo status..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pendente">Pendente</SelectItem>
                  <SelectItem value="em_cobranca">Em Cobrança</SelectItem>
                  <SelectItem value="em_negociacao">Em Negociação</SelectItem>
                  <SelectItem value="acordo">Acordo</SelectItem>
                  <SelectItem value="em_acordo">Em Acordo</SelectItem>
                  <SelectItem value="acordo_atrasado">Acordo Atrasado</SelectItem>
                  <SelectItem value="suspenso">Suspenso</SelectItem>
                  <SelectItem value="judicial">Judicial</SelectItem>
                  <SelectItem value="pago">Pago</SelectItem>
                  <SelectItem value="cancelado">Cancelado</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStatusLoteOpen(false)}>Cancelar</Button>
            <Button
              onClick={() => {
                if (!novoStatusLote || !condominioId) return;
                alterarStatusLoteMutation.mutate({ condominioId, cobrancaIds: selectedIds, novoStatus: novoStatusLote as any });
              }}
              disabled={!novoStatusLote || alterarStatusLoteMutation.isPending}
            >
              {alterarStatusLoteMutation.isPending ? "Atualizando..." : "Confirmar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Diálogo Excluir Devedor ── */}
      <AlertDialog open={deleteDevedorOpen} onOpenChange={setDeleteDevedorOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir este devedor? Esta ação não pode ser desfeita e todos os dados relacionados (cobranças, tentativas, acordos) também serão removidos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDevedorToDelete(null)}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => devedorToDelete && deleteDevedorMutation.mutate({ id: devedorToDelete })}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Diálogo Excluir Cobrança ── */}
      <AlertDialog open={deleteCobrancaOpen} onOpenChange={setDeleteCobrancaOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir esta dívida? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setCobrancaToDelete(null)}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => cobrancaToDelete && deleteCobrancaMutation.mutate({ id: cobrancaToDelete })}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
