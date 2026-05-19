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

  const { data: condominios } = trpc.condominios.list.useQuery();

  // Listar todos os usuários ou filtrar por condomínio
  const { data: allUsers, isLoading } = trpc.users.list.useQuery();
  const { data: usersByCondominio, isLoading: loadingByCondominio } = trpc.users.listByCondominio.useQuery(
    { condominioId: filtroCondominioId! },
    { enabled: filtroCondominioId !== null }
  );

  const users = filtroCondominioId !== null ? usersByCondominio : allUsers;
  const loading = filtroCondominioId !== null ? loadingByCondominio : isLoading;

  const deleteMutation = trpc.users.delete.useMutation({
    onSuccess: () => {
      toast.success("Usuário excluído com sucesso!");
      utils.users.list.invalidate();
      if (filtroCondominioId) utils.users.listByCondominio.invalidate({ condominioId: filtroCondominioId });
    },
    onError: (error) => {
      toast.error(error.message || "Erro ao excluir usuário");
    },
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

        {/* Filtro por Condomínio */}
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-base flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              Filtrar por Condomínio
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3 flex-wrap">
              <Select
                value={filtroCondominioId !== null ? String(filtroCondominioId) : "todos"}
                onValueChange={(v) => setFiltroCondominioId(v === "todos" ? null : Number(v))}
              >
                <SelectTrigger className="w-72">
                  <SelectValue placeholder="Todos os condomínios" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos os condomínios</SelectItem>
                  {condominios?.map(c => (
                    <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {filtroCondominioId !== null && (
                <Button variant="ghost" size="sm" onClick={() => setFiltroCondominioId(null)}>
                  Limpar filtro
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
                          <Badge variant={u.isActive ? "default" : "outline"} className={u.isActive ? "bg-green-100 text-green-700 border-green-200" : ""}>
                            {u.isActive ? "Ativo" : "Inativo"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1 flex-wrap">
                            {/* Botão Definir como Admin Principal */}
                            {u.condominioId && u.isPrimaryAdmin !== 1 && (
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
                            {/* Editar */}
                            <Link href={`/admin/usuarios/${u.id}`}>
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <Pencil className="h-4 w-4" />
                              </Button>
                            </Link>
                            {/* Excluir */}
                            {u.id !== user?.id && (
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 text-destructive hover:text-destructive"
                                    disabled={u.isPrimaryAdmin === 1}
                                    title={u.isPrimaryAdmin === 1 ? "Defina outro admin principal antes de excluir" : "Excluir usuário"}
                                  >
                                    {u.isPrimaryAdmin === 1 ? <UserX className="h-4 w-4 opacity-40" /> : <Trash2 className="h-4 w-4" />}
                                    <span className="sr-only">Excluir</span>
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      Tem certeza que deseja excluir o usuário <strong>"{u.name}"</strong>?
                                      Esta ação não pode ser desfeita.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                    <AlertDialogAction
                                      onClick={() => deleteMutation.mutate({ id: u.id })}
                                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                    >
                                      Excluir
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
