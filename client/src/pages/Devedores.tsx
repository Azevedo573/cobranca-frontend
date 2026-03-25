import { useAuth } from "@/_core/hooks/useAuth";
import { getDevedorIdentificador } from '@/lib/devedorUtils';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { Users, Plus, Eye, ArrowLeft, Search, Pencil, Trash2 } from "lucide-react";
import { ExportExcelButton } from "@/components/ExportExcelButton";
import { Pagination, paginateItems } from "@/components/Pagination";
import { Link, useLocation } from "wouter";
import { useState } from "react";
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
import { BadgePrioridade } from "@/components/BadgePrioridade";

const PAGE_SIZE_DEFAULT = 25;

export default function Devedores() {
  const { user, logout } = useAuth();
  const [, setLocation] = useLocation();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCondominioId, setSelectedCondominioId] = useState<number | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [devedorToDelete, setDevedorToDelete] = useState<number | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE_DEFAULT);
  
  // Admin precisa selecionar um condomínio, síndicos/cobradores usam o próprio
  const condominioId = user?.role === "admin" ? selectedCondominioId : user?.condominioId;
  
  const { data: condominios } = trpc.condominios.list.useQuery(undefined, {
    enabled: user?.role === "admin"
  });
  
  const { data: devedores, isLoading } = trpc.devedores.list.useQuery(
    { condominioId: condominioId! },
    { enabled: !!condominioId }
  );

  const utils = trpc.useUtils();
  
  const deleteMutation = trpc.devedores.delete.useMutation({
    onSuccess: () => {
      toast.success("Devedor excluído com sucesso!");
      utils.devedores.list.invalidate();
      setDeleteDialogOpen(false);
      setDevedorToDelete(null);
    },
    onError: (error) => {
      toast.error("Erro ao excluir devedor: " + error.message);
    },
  });

  // Normaliza CPF/CNPJ removendo pontos, traços e barras para comparação
  const normalizarDocumento = (doc: string) => doc.replace(/[.\-\/]/g, '');

  const handleSearchChange = (value: string) => {
    setSearchTerm(value);
    setCurrentPage(1); // Resetar para página 1 ao buscar
  };

  const filteredDevedores = devedores?.filter(dev => {
    const termo = searchTerm.toLowerCase();
    const termoNormalizado = normalizarDocumento(searchTerm);
    return (
      (dev.name?.toLowerCase() || '').includes(termo) ||
      dev.unitNumber.toLowerCase().includes(termo) ||
      (dev.bloco?.toLowerCase() || '').includes(termo) ||
      // Busca por CPF/CNPJ: aceita com ou sem formatação
      (dev.cpfCnpj && (
        dev.cpfCnpj.toLowerCase().includes(termo) ||
        normalizarDocumento(dev.cpfCnpj).includes(termoNormalizado)
      ))
    );
  });
  
  const handleDeleteClick = (id: number) => {
    setDevedorToDelete(id);
    setDeleteDialogOpen(true);
  };
  
  const handleDeleteConfirm = () => {
    if (devedorToDelete) {
      deleteMutation.mutate({ id: devedorToDelete });
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { variant: "default" | "secondary" | "outline"; label: string }> = {
      ativo: { variant: "default", label: "Ativo" },
      acordo: { variant: "secondary", label: "Acordo" },
      pago: { variant: "outline", label: "Pago" },
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
                <h1 className="text-2xl font-bold text-primary">Devedores</h1>
                <p className="text-sm text-muted-foreground">Gestão de inadimplentes</p>
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
                  <Users className="h-5 w-5" />
                  Lista de Devedores
                </CardTitle>
                <CardDescription>
                  Total: {filteredDevedores?.length || 0} devedor(es)
                </CardDescription>
              </div>
              <div className="flex gap-2">
                <ExportExcelButton
                  onClick={async () => {
                    const result = await utils.client.exportacao.devedores.mutate({
                      condominioId: condominioId || undefined,
                    });
                    return result;
                  }}
                  label="Exportar Excel"
                />
                {(user?.role === "admin" || user?.role === "sindico") && (
                  <Link href="/devedores/novo">
                    <Button className="bg-accent hover:bg-accent/90 text-accent-foreground">
                      <Plus className="mr-2 h-4 w-4" />
                      Novo Devedor
                    </Button>
                  </Link>
                )}
              </div>
            </div>
            <div className="mt-4 space-y-4">
              {user?.role === "admin" && (
                <Select
                  value={selectedCondominioId?.toString() || ""}
                  onValueChange={(value) => setSelectedCondominioId(Number(value))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione um condomínio para visualizar devedores" />
                  </SelectTrigger>
                  <SelectContent>
                    {condominios?.map((cond) => (
                      <SelectItem key={cond.id} value={cond.id.toString()}>
                        {cond.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por nome, unidade, bloco ou CPF/CNPJ..."
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
            ) : filteredDevedores && filteredDevedores.length > 0 ? (
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
                      <TableCell>{getStatusBadge(dev.status)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Link href={`/devedores/${dev.id}/detalhes`}>
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
                                onClick={() => setLocation(`/devedores/${dev.id}/editar`)}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                title="Excluir"
                                onClick={() => handleDeleteClick(dev.id)}
                                className="text-destructive hover:text-destructive"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </>
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
                onPageSizeChange={(size) => { setPageSize(size); setCurrentPage(1); }}
              />
              </>
            ) : (
              <div className="text-center py-12">
                <Users className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">
                  {searchTerm ? "Nenhum devedor encontrado" : "Nenhum devedor cadastrado"}
                </h3>
                <p className="text-muted-foreground mb-4">
                  {searchTerm
                    ? "Tente buscar com outros termos"
                    : "Comece cadastrando os devedores do condomínio"}
                </p>
                {!searchTerm && (user?.role === "admin" || user?.role === "sindico") && (
                  <Link href="/devedores/novo">
                    <Button className="bg-accent hover:bg-accent/90 text-accent-foreground">
                      <Plus className="mr-2 h-4 w-4" />
                      Cadastrar Primeiro Devedor
                    </Button>
                  </Link>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </main>
      
      {/* Diálogo de Confirmação de Exclusão */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
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
