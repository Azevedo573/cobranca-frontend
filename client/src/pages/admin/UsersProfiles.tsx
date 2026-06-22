import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { toast } from "sonner";
import {
  Users,
  Shield,
  Search,
  ChevronRight,
  UserCheck,
  UserX,
  CheckCircle2,
  XCircle,
} from "lucide-react";

function getInitials(name: string | null) {
  if (!name) return "?";
  return name.split(" ").slice(0, 2).map((n) => n[0]).join("").toUpperCase();
}

const ROLE_LABELS: Record<string, string> = {
  admin: "Administrador",
  sindico: "Síndico",
  cobrador: "Cobrador",
  colaborador: "Colaborador Interno",
  advogado: "Advogado",
};

const ROLE_COLORS: Record<string, string> = {
  admin: "bg-red-500/10 text-red-600 dark:text-red-400",
  sindico: "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400",
  cobrador: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  colaborador: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
  advogado: "bg-purple-500/10 text-purple-600 dark:text-purple-400",
};

export default function UsersProfiles() {
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();

  const { data: usersWithProfiles = [], isLoading } = trpc.profiles.listUsersWithProfiles.useQuery();
  const { data: profiles = [] } = trpc.profiles.list.useQuery();

  const assignMutation = trpc.profiles.assignToUser.useMutation({
    onSuccess: () => {
      toast.success("Perfil atribuído com sucesso");
      utils.profiles.listUsersWithProfiles.invalidate();
      utils.profiles.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const [search, setSearch] = useState("");
  const [filterProfile, setFilterProfile] = useState<string>("all");
  const [filterRole, setFilterRole] = useState<string>("all");

  const filtered = useMemo(() => {
    return usersWithProfiles.filter((u) => {
      const matchSearch =
        !search ||
        u.userName?.toLowerCase().includes(search.toLowerCase()) ||
        u.userEmail?.toLowerCase().includes(search.toLowerCase());
      const matchProfile =
        filterProfile === "all" ||
        (filterProfile === "none" ? !u.profileId : String(u.profileId) === filterProfile);
      const matchRole = filterRole === "all" || u.userRole === filterRole;
      return matchSearch && matchProfile && matchRole;
    });
  }, [usersWithProfiles, search, filterProfile, filterRole]);

  const semPerfil = usersWithProfiles.filter((u) => !u.profileId).length;
  const comPerfil = usersWithProfiles.filter((u) => u.profileId).length;

  return (
    <div className="p-6 space-y-6">
      {/* Cabeçalho */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <UserCheck className="h-6 w-6 text-primary" />
            Atribuição de Perfis
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Atribua perfis de acesso aos usuários do sistema para controlar o que cada um pode visualizar e executar.
          </p>
        </div>
        <Button variant="outline" onClick={() => navigate("/admin/perfis")}>
          <Shield className="h-4 w-4 mr-2" />
          Gerenciar Perfis
        </Button>
      </div>

      {/* Cards de resumo */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-5 flex items-center gap-4">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <Users className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold">{usersWithProfiles.length}</p>
              <p className="text-xs text-muted-foreground">Total de usuários</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 flex items-center gap-4">
            <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center shrink-0">
              <CheckCircle2 className="h-5 w-5 text-emerald-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">{comPerfil}</p>
              <p className="text-xs text-muted-foreground">Com perfil atribuído</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 flex items-center gap-4">
            <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center shrink-0">
              <XCircle className="h-5 w-5 text-amber-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">{semPerfil}</p>
              <p className="text-xs text-muted-foreground">Sem perfil definido</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome ou e-mail..."
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={filterProfile} onValueChange={setFilterProfile}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Filtrar por perfil" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os perfis</SelectItem>
            <SelectItem value="none">Sem perfil</SelectItem>
            {profiles.map((p) => (
              <SelectItem key={p.id} value={String(p.id)}>
                {p.nome}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterRole} onValueChange={setFilterRole}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Filtrar por cargo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os cargos</SelectItem>
            <SelectItem value="admin">Administrador</SelectItem>
            <SelectItem value="sindico">Síndico</SelectItem>
            <SelectItem value="cobrador">Cobrador</SelectItem>
            <SelectItem value="colaborador">Colaborador Interno</SelectItem>
            <SelectItem value="advogado">Advogado</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Tabela */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-3 p-4">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-12 bg-muted animate-pulse rounded-lg" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-2 text-center">
              <UserX className="h-10 w-10 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">Nenhum usuário encontrado com os filtros aplicados.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Usuário</TableHead>
                  <TableHead>Cargo</TableHead>
                  <TableHead>Condomínio</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Perfil Atual</TableHead>
                  <TableHead className="w-[220px]">Atribuir Perfil</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((u) => (
                  <TableRow key={u.userId}>
                    {/* Usuário */}
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar className="h-8 w-8">
                          <AvatarFallback className="text-xs bg-primary/10 text-primary">
                            {getInitials(u.userName)}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="text-sm font-medium leading-tight">{u.userName ?? "—"}</p>
                          <p className="text-xs text-muted-foreground">{u.userEmail ?? "—"}</p>
                        </div>
                      </div>
                    </TableCell>

                    {/* Cargo */}
                    <TableCell>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ROLE_COLORS[u.userRole] ?? ""}`}>
                        {ROLE_LABELS[u.userRole] ?? u.userRole}
                      </span>
                    </TableCell>

                    {/* Condomínio */}
                    <TableCell>
                      <span className="text-xs text-muted-foreground">
                        {u.condominioId ? `#${u.condominioId}` : "—"}
                      </span>
                    </TableCell>

                    {/* Status */}
                    <TableCell>
                      {u.isActive ? (
                        <Badge variant="outline" className="text-emerald-600 border-emerald-500/30 text-[10px]">
                          Ativo
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-muted-foreground text-[10px]">
                          Inativo
                        </Badge>
                      )}
                    </TableCell>

                    {/* Perfil atual */}
                    <TableCell>
                      {u.profileId ? (
                        <div className="flex items-center gap-2">
                          <div
                            className="w-2 h-2 rounded-full shrink-0"
                            style={{ backgroundColor: u.profileCor ?? "#6366f1" }}
                          />
                          <button
                            className="text-sm font-medium hover:underline flex items-center gap-1"
                            onClick={() => navigate(`/admin/perfis/${u.profileId}`)}
                          >
                            {u.profileNome}
                            <ChevronRight className="h-3 w-3 text-muted-foreground" />
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground italic">Sem perfil</span>
                      )}
                    </TableCell>

                    {/* Select de atribuição */}
                    <TableCell>
                      <Select
                        value={u.profileId ? String(u.profileId) : "none"}
                        onValueChange={(val) => {
                          const newProfileId = val === "none" ? null : Number(val);
                          assignMutation.mutate({ userId: u.userId, profileId: newProfileId });
                        }}
                      >
                        <SelectTrigger className="h-8 text-xs w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">
                            <span className="text-muted-foreground">Sem perfil</span>
                          </SelectItem>
                          {profiles.map((p) => (
                            <SelectItem key={p.id} value={String(p.id)}>
                              <div className="flex items-center gap-2">
                                <div
                                  className="w-2 h-2 rounded-full shrink-0"
                                  style={{ backgroundColor: p.cor ?? "#6366f1" }}
                                />
                                {p.nome}
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
