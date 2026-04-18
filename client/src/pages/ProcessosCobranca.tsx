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
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { FileText, Plus, Eye, ArrowLeft, Search, Pencil, Trash2, ListChecks } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { ExportExcelButton } from "@/components/ExportExcelButton";
import { Pagination, paginateItems } from "@/components/Pagination";
import { Link, useLocation } from "wouter";
import { useState, useMemo } from "react";
import { format } from "date-fns";
import { calcularValorDevido, formatarMoeda, type TaxasCondominio } from "../../../shared/calculos";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";

const PAGE_SIZE_DEFAULT = 25;

export default function ProcessosCobranca() {
  const { user, logout } = useAuth();
  const [, setLocation] = useLocation();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCondominioId, setSelectedCondominioId] = useState<number | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [cobrancaToDelete, setCobrancaToDelete] = useState<number | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE_DEFAULT);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [statusLoteDialogOpen, setStatusLoteDialogOpen] = useState(false);
  const [novoStatusLote, setNovoStatusLote] = useState<string>("");
  
  // Para admin, usar condomínio selecionado; para síndico/cobrador, usar o próprio
  const condominioId = user?.role === "admin" ? selectedCondominioId : user?.condominioId;
  
  const { data: condominios } = trpc.condominios.list.useQuery(undefined, {
    enabled: user?.role === "admin",
  });
  
  const { data: cobrancas, isLoading } = trpc.cobrancas.list.useQuery(
    { condominioId: condominioId ?? 0 },
    { enabled: condominioId !== null && condominioId !== undefined }
  );

  const { data: devedores } = trpc.devedores.list.useQuery(
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

  const utils = trpc.useUtils();
  
  const alterarStatusLoteMutation = trpc.importacoes.alterarStatusEmLote.useMutation({
    onSuccess: (data) => {
      toast.success(`Status alterado em ${data.alterados} cobranças`);
      utils.cobrancas.list.invalidate();
      setSelectedIds([]);
      setStatusLoteDialogOpen(false);
      setNovoStatusLote("");
    },
    onError: (err) => toast.error("Erro ao alterar status: " + err.message),
  });

  const deleteMutation = trpc.cobrancas.delete.useMutation({
    onSuccess: () => {
      toast.success("Processo excluído com sucesso!");
      utils.cobrancas.list.invalidate();
      setDeleteDialogOpen(false);
      setCobrancaToDelete(null);
    },
    onError: (error) => {
      toast.error("Erro ao excluir processo: " + error.message);
    },
  });

  const getDevedorName = (devedorId: number) => {
    const dev = devedores?.find(d => d.id === devedorId);
    return dev?.name || "Desconhecido";
  };
  
  const handleDeleteClick = (id: number) => {
    setCobrancaToDelete(id);
    setDeleteDialogOpen(true);
  };
  
  const handleDeleteConfirm = () => {
    if (cobrancaToDelete) {
      deleteMutation.mutate({ id: cobrancaToDelete });
    }
  };

  const handleSearchChange = (value: string) => {
    setSearchTerm(value);
    setCurrentPage(1);
  };

  const filteredCobrancas = cobrancas?.filter(cob => {
    const devedorName = getDevedorName(cob.devedorId);
    return (
      devedorName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      cob.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      cob.monthReference?.toLowerCase().includes(searchTerm.toLowerCase())
    );
  });

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { variant: "default" | "secondary" | "outline" | "destructive"; label: string }> = {
      pendente: { variant: "destructive", label: "Pendente" },
      em_cobranca: { variant: "default", label: "Em Cobrança" },
      pago: { variant: "outline", label: "Pago" },
      acordo: { variant: "secondary", label: "Acordo" },
    };
    const config = variants[status] || { variant: "outline" as const, label: status };
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const getDashboardUrl = () => {
    if (user?.role === "admin") return "/admin/dashboard";
    if (user?.role === "sindico") return "/sindico/dashboard";
    return "/cobrador/dashboard";
  };

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
                <h1 className="text-2xl font-bold text-primary">Processos de Cobrança</h1>
                <p className="text-sm text-muted-foreground">Gestão de processos judiciais e extrajudiciais</p>
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
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Lista de Processos
                </CardTitle>
                <CardDescription>
                  Total: {filteredCobrancas?.length || 0} processo(s)
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                {selectedIds.length > 0 && (user?.role === "admin" || user?.role === "sindico") && (
                  <Button
                    variant="outline"
                    onClick={() => setStatusLoteDialogOpen(true)}
                    className="border-primary text-primary hover:bg-primary/10"
                  >
                    <ListChecks className="mr-2 h-4 w-4" />
                    Alterar Status ({selectedIds.length})
                  </Button>
                )}
                <ExportExcelButton
                  onClick={async () => {
                    const result = await utils.client.exportacao.cobrancas.mutate({
                      condominioId: condominioId || undefined,
                    });
                    return result;
                  }}
                  label="Exportar Excel"
                />
                {(user?.role === "admin" || user?.role === "sindico") && (
                  <Link href="/processos/novo">
                    <Button className="bg-accent hover:bg-accent/90 text-accent-foreground">
                      <Plus className="mr-2 h-4 w-4" />
                      Novo Processo
                    </Button>
                  </Link>
                )}
              </div>
            </div>
            <div className="mt-4 space-y-4">
              {user?.role === "admin" && (
                <div>
                  <label className="text-sm font-medium mb-2 block">Selecione o Condomínio</label>
                  <select
                    className="w-full md:w-64 px-3 py-2 border rounded-md"
                    value={selectedCondominioId || ""}
                    onChange={(e) => setSelectedCondominioId(e.target.value ? Number(e.target.value) : null)}
                  >
                    <option value="">Selecione um condomínio</option>
                    {condominios?.map((cond) => (
                      <option key={cond.id} value={cond.id}>
                        {cond.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por devedor, descrição ou mês..."
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
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
                <p className="mt-4 text-muted-foreground">Carregando...</p>
              </div>
            ) : filteredCobrancas && filteredCobrancas.length > 0 ? (
              <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      {(user?.role === "admin" || user?.role === "sindico") && (
                        <Checkbox
                          checked={selectedIds.length > 0 && paginateItems(filteredCobrancas, currentPage, pageSize).every(c => selectedIds.includes(c.id))}
                          onCheckedChange={(checked) => {
                            const paginated = paginateItems(filteredCobrancas, currentPage, pageSize);
            if (checked) {
              const newIds = paginated.map(c => c.id);
              setSelectedIds(prev => Array.from(new Set([...prev, ...newIds])));
            } else {
              const pageIds = paginated.map(c => c.id);
              setSelectedIds(prev => prev.filter(id => !pageIds.includes(id)));
            }
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
                    const breakdown = taxas && cob.status !== "pago" && cob.dueDate ? calcularValorDevido(
                      cob.amount / 100,
                      new Date(cob.dueDate),
                      taxas
                    ) : null;
                    return (
                      <TableRow key={cob.id} className={selectedIds.includes(cob.id) ? "bg-primary/5" : ""}>
                        <TableCell>
                          {(user?.role === "admin" || user?.role === "sindico") && (
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
                        <TableCell>
                          {cob.dueDate ? format(new Date(cob.dueDate), "dd/MM/yyyy") : "-"}
                        </TableCell>
                        <TableCell className="font-semibold">
                          R$ {(cob.amount / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </TableCell>
                        <TableCell className="font-bold text-primary">
                          {breakdown ? formatarMoeda(breakdown.valorTotal) : "R$ " + (cob.amount / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </TableCell>
                        <TableCell>{getStatusBadge(cob.status)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Link href={`/processos/${cob.id}`}>
                            <Button variant="ghost" size="icon" title="Ver detalhes">
                              <Eye className="h-4 w-4" />
                            </Button>
                          </Link>
                          {(user?.role === "admin" || user?.role === "sindico") && (
                            <>
                              <Button
                                variant="ghost"
                                size="icon"
                                title="Editar"
                                onClick={() => setLocation(`/processos/${cob.id}/editar`)}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                title="Excluir"
                                onClick={() => handleDeleteClick(cob.id)}
                                className="text-destructive hover:text-destructive"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </>
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
                onPageSizeChange={(size) => { setPageSize(size); setCurrentPage(1); }}
              />
              </>
            ) : (
              <div className="text-center py-12">
                <FileText className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">
                  {searchTerm ? "Nenhum processo encontrado" : "Nenhum processo cadastrado"}
                </h3>
                <p className="text-muted-foreground mb-4">
                  {searchTerm
                    ? "Tente buscar com outros termos"
                    : "Comece cadastrando os processos dos devedores"}
                </p>
                {!searchTerm && (user?.role === "admin" || user?.role === "sindico") && (
                  <Link href="/processos/novo">
                    <Button className="bg-accent hover:bg-accent/90 text-accent-foreground">
                      <Plus className="mr-2 h-4 w-4" />
                      Cadastrar Primeiro Processo
                    </Button>
                  </Link>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </main>
      
      {/* Diálogo de Alteração de Status em Lote */}
      <Dialog open={statusLoteDialogOpen} onOpenChange={setStatusLoteDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ListChecks className="h-5 w-5" />
              Alterar Status em Lote
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {selectedIds.length} cobrança(s) selecionada(s) serão atualizadas.
            </p>
            <div className="space-y-2">
              <label className="text-sm font-medium">Novo Status</label>
              <Select value={novoStatusLote} onValueChange={setNovoStatusLote}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o novo status..." />
                </SelectTrigger>
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
            <Button variant="outline" onClick={() => setStatusLoteDialogOpen(false)}>Cancelar</Button>
            <Button
              onClick={() => {
                if (!novoStatusLote || !condominioId) return;
                alterarStatusLoteMutation.mutate({
                  condominioId,
                  cobrancaIds: selectedIds,
                  novoStatus: novoStatusLote as any,
                });
              }}
              disabled={!novoStatusLote || alterarStatusLoteMutation.isPending}
            >
              {alterarStatusLoteMutation.isPending ? "Atualizando..." : "Confirmar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Diálogo de Confirmação de Exclusão */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir este processo? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setCobrancaToDelete(null)}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
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
