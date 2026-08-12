import { useState } from "react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import {
  Users as UsersIcon,
  Plus,
  Pencil,
  Trash2,
  ArrowLeft,
  Crown,
  ShieldCheck,
  Building2,
  Loader2,
  UserX,
} from "lucide-react";
import { Link } from "wouter";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Search, X } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export default function Users() {
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const [filtroCondominioId, setFiltroCondominioId] = useState<number | null>(null);
  const [filtroBusca, setFiltroBusca] = useState("");
  const [filtroRole, setFiltroRole] = useState("todos");
  const [filtroStatus, setFiltroStatus] = useState("todos");

  const { data: condominios } = trpc.condominios.list.useQuery();

  // Listar todos os usuários ou filtrar por condomínio
  const incluirExcluidos = filtroStatus === "excluido";
  const { data: allUsers, isLoading } = trpc.users.list.useQuery({ includeDeleted: incluirExcluidos });
  const { data: usersByCondominio, isLoading: loadingByCondominio } = trpc.users.listByCondominio.useQuery(
    { condominioId: filtroCondominioId!, includeDeleted: incluirExcluidos },
    { enabled: filtroCondominioId !== null }
  );

  const usersBase = filtroCondominioId !== null ? usersByCondominio : allUsers;
  const loading = filtroCondominioId !== null ? loadingByCondominio : isLoading;

  const users = usersBase?.filter(u => {
    const buscaOk = !filtroBusca ||
      u.name?.toLowerCase().includes(filtroBusca.toLowerCase()) ||
      u.email?.toLowerCase().includes(filtroBusca.toLowerCase());
    const roleOk = filtroRole === "todos" || u.role === filtroRole;
    if (u.isDeleted === 1) return filtroStatus === "excluido";
    const statusOk = filtroStatus === "todos" ||
      (filtroStatus === "ativo" && u.isActive === 1) ||
      (filtroStatus === "inativo" && u.isActive !== 1);
    return buscaOk && roleOk && statusOk;
  });

  const deleteMutation = trpc.users.delete.useMutation({
    onSuccess: () => {
      toast.success("Usuário desativado e preservado para auditoria.");
      utils.users.list.invalidate();
      if (filtroCondominioId) utils.users.listByCondominio.invalidate({ condominioId: filtroCondominioId });
    },
    onError: (error) => {
      toast.error(error.message || "Erro ao desativar usuário");
    },
  });

  const restoreMutation = trpc.users.restore.useMutation({
    onSuccess: () => {
      toast.success("Usuário restaurado como inativo. Revise os dados e ative-o quando apropriado.");
      utils.users.list.invalidate();
      if (filtroCondominioId) utils.users.listByCondominio.invalidate({ condominioId: filtroCondominioId, includeDeleted: true });
    },
    onError: (error) => toast.error(error.message || "Erro ao restaurar usuário"),
  });

  const definirAdminMutation = trpc.users.definirAdminPrincipal.useMutation({
    onSuccess: () => {
      toast.success("Administrador principal atualizado!");
      utils.users.list.invalidate();
      if (filtroCondominioId) utils.users.listByCondominio.invalidate({ condominioId: filtroCondominioId });
    },
    onError: (error) => {
      toast.error(error.message || "Erro ao definir administrador principal");
    },
  });

  const getRoleBadge = (role: string) => {
    const variants: Record<string, { variant: "default" | "secondary" | "outline"; label: string; className?: string }> = {
      admin: { variant: "default", label: "Administrador Master", className: "bg-purple-600 hover:bg-purple-700" },
      sindico: { variant: "secondary", label: "Síndico", className: "bg-blue-100 text-blue-700 border-blue-200" },
      cobrador: { variant: "outline", label: "Cobrador" },
      colaborador: { variant: "outline", label: "Colaborador", className: "bg-green-50 text-green-700 border-green-200" },
      advogado: { variant: "outline", label: "Advogado", className: "bg-amber-50 text-amber-700 border-amber-200" },
    };
    const config = variants[role] || { variant: "outline" as const, label: role };
    return (
      <Badge variant={config.variant} className={config.className}>
        {config.label}
      </Badge>
    );
  };

  const getCondominioName = (condominioId: number | null) => {
    if (!condominioId) return <span className="text-muted-foreground italic">Sem condomínio</span>;
    const cond = condominios?.find(c => c.id === condominioId);
    return cond ? (
      <span className="flex items-center gap-1">
        <Building2 className="h-3 w-3 text-muted-foreground" />
        {cond.name}
      </span>
    ) : "-";
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
                <h1 className="text-2xl font-bold text-primary flex items-center gap-2">
                  <UsersIcon className="h-6 w-6" />
                  Gerenciar Usuários
                </h1>
                <p className="text-sm text-muted-foreground">Controle de acesso e administradores dos condomínios</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right">
                <p className="text-sm font-medium">{user?.name}</p>
                <p className="text-xs text-muted-foreground">{user?.role}</p>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8 space-y-6">

        {/* Filtros */}
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-base flex items-center gap-2">
              <Search className="h-4 w-4" />
              Filtros
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-3">
              {/* Busca por nome/email */}
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por nome ou e-mail..."
                  value={filtroBusca}
                  onChange={e => setFiltroBusca(e.target.value)}
                  className="pl-9 pr-9"
                />
                {filtroBusca && (
                  <button
                    onClick={() => setFiltroBusca("")}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>

              {/* Filtro por condomínio */}
              <Select
                value={filtroCondominioId !== null ? String(filtroCondominioId) : "todos"}
                onValueChange={(v) => setFiltroCondominioId(v === "todos" ? null : Number(v))}
              >
                <SelectTrigger className="w-56">
                  <Building2 className="h-4 w-4 mr-2 text-muted-foreground" />
                  <SelectValue placeholder="Todos os condomínios" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos os condomínios</SelectItem>
                  {condominios?.map(c => (
                    <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Filtro por role */}
              <Select value={filtroRole} onValueChange={setFiltroRole}>
                <SelectTrigger className="w-44">
                  <SelectValue placeholder="Todos os perfis" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos os perfis</SelectItem>
                  <SelectItem value="admin">Administrador</SelectItem>
                  <SelectItem value="sindico">Síndico</SelectItem>
                  <SelectItem value="cobrador">Cobrador</SelectItem>
                  <SelectItem value="colaborador">Colaborador</SelectItem>
                  <SelectItem value="advogado">Advogado</SelectItem>
                </SelectContent>
              </Select>

              {/* Filtro por status */}
              <Select value={filtroStatus} onValueChange={setFiltroStatus}>
                <SelectTrigger className="w-36">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  <SelectItem value="ativo">Ativos</SelectItem>
                  <SelectItem value="inativo">Inativos</SelectItem>
                  <SelectItem value="excluido">Excluídos logicamente</SelectItem>
                </SelectContent>
              </Select>

              {/* Limpar filtros */}
              {(filtroCondominioId !== null || filtroBusca || filtroRole !== "todos" || filtroStatus !== "todos") && (
                <Button variant="ghost" size="sm" onClick={() => {
                  setFiltroCondominioId(null);
                  setFiltroBusca("");
                  setFiltroRole("todos");
                  setFiltroStatus("todos");
                }}>
                  <X className="h-4 w-4 mr-1" />
                  Limpar filtros
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Tabela de Usuários */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <UsersIcon className="h-5 w-5" />
                  {filtroCondominioId
                    ? `Usuários — ${condominios?.find(c => c.id === filtroCondominioId)?.name ?? "Condomínio"}`
                    : "Todos os Usuários"}
                </CardTitle>
                <CardDescription>
                  Total: {users?.length || 0} usuário(s)
                </CardDescription>
              </div>
              <Link href="/admin/usuarios/novo">
                <Button className="bg-accent hover:bg-accent/90 text-accent-foreground">
                  <Plus className="mr-2 h-4 w-4" />
                  Novo Usuário
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-8">
                <Loader2 className="animate-spin h-10 w-10 text-primary mx-auto" />
                <p className="mt-3 text-muted-foreground text-sm">Carregando usuários...</p>
              </div>
            ) : users && users.length > 0 ? (
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nome</TableHead>
                      <TableHead>E-mail / Login</TableHead>
                      <TableHead>Perfil</TableHead>
                      <TableHead>Condomínio</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {users.map((u) => (
                      <TableRow key={u.id} className={u.isPrimaryAdmin ? "bg-amber-50/50 dark:bg-amber-950/10" : ""}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {u.isPrimaryAdmin === 1 && (
                              <Crown className="h-4 w-4 text-amber-500 shrink-0" aria-label="Administrador Principal" />
                            )}
                            <span className="font-medium">{u.name || "-"}</span>
                          </div>
                          {u.isPrimaryAdmin === 1 && (
                            <Badge variant="outline" className="mt-1 text-xs border-amber-300 text-amber-700 bg-amber-50 dark:bg-amber-950/30 gap-1">
                              <ShieldCheck className="h-3 w-3" />
                              Admin Principal
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="font-mono text-sm">{u.email || "-"}</TableCell>
                        <TableCell>{getRoleBadge(u.role)}</TableCell>
                        <TableCell>{getCondominioName(u.condominioId)}</TableCell>
                        <TableCell>
                          <Badge variant={u.isDeleted === 1 ? "destructive" : u.isActive ? "default" : "outline"} className={u.isActive && u.isDeleted !== 1 ? "bg-green-100 text-green-700 border-green-200" : ""}>
                            {u.isDeleted === 1 ? "Excluído logicamente" : u.isActive ? "Ativo" : "Inativo"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1 flex-wrap">
                            {/* Botão Definir como Admin Principal */}
                            {u.isDeleted !== 1 && u.condominioId && u.isPrimaryAdmin !== 1 && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-amber-600 hover:text-amber-700 hover:bg-amber-50 text-xs h-8 px-2"
                                onClick={() => definirAdminMutation.mutate({ userId: u.id, condominioId: u.condominioId! })}
                                disabled={definirAdminMutation.isPending}
                                title="Definir como administrador principal"
                              >
                                {definirAdminMutation.isPending ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <Crown className="h-3 w-3" />
                                )}
                                <span className="ml-1 hidden sm:inline">Admin Principal</span>
                              </Button>
                            )}
                            {u.isDeleted === 1 ? (
                              <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => restoreMutation.mutate({ id: u.id })} disabled={restoreMutation.isPending}>
                                Restaurar
                              </Button>
                            ) : (
                              <Link href={`/admin/usuarios/${u.id}`}>
                                <Button variant="ghost" size="icon" className="h-8 w-8">
                                  <Pencil className="h-4 w-4" />
                                </Button>
                              </Link>
                            )}
                            {u.isDeleted !== 1 && u.id !== user?.id && (
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 text-destructive hover:text-destructive"
                                    disabled={u.isPrimaryAdmin === 1}
                                    title={u.isPrimaryAdmin === 1 ? "Defina outro admin principal antes de desativar" : "Desativar usuário"}
                                  >
                                    {u.isPrimaryAdmin === 1 ? <UserX className="h-4 w-4 opacity-40" /> : <Trash2 className="h-4 w-4" />}
                                    <span className="sr-only">Desativar</span>
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Confirmar desativação</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      Tem certeza que deseja desativar o usuário <strong>"{u.name}"</strong>? O acesso será bloqueado, mas o registro e o histórico serão preservados para auditoria.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                    <AlertDialogAction
                                      onClick={() => deleteMutation.mutate({ id: u.id })}
                                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                    >
                                      Desativar
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="text-center py-12">
                <UsersIcon className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">Nenhum usuário encontrado</h3>
                <p className="text-muted-foreground mb-4">
                  {filtroCondominioId
                    ? "Este condomínio ainda não possui usuários cadastrados."
                    : "Comece cadastrando usuários para acessar o sistema."}
                </p>
                <Link href="/admin/usuarios/novo">
                  <Button className="bg-accent hover:bg-accent/90 text-accent-foreground">
                    <Plus className="mr-2 h-4 w-4" />
                    Cadastrar Primeiro Usuário
                  </Button>
                </Link>
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
