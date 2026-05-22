import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  Shield,
  Plus,
  Pencil,
  Trash2,
  Users,
  Lock,
  Sparkles,
  ChevronRight,
  Settings2,
} from "lucide-react";

const COR_OPCOES = [
  "#ef4444", "#f97316", "#f59e0b", "#84cc16",
  "#10b981", "#06b6d4", "#3b82f6", "#6366f1",
  "#8b5cf6", "#ec4899", "#64748b", "#1e293b",
];

export default function Profiles() {
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();

  const { data: profiles = [], isLoading } = trpc.profiles.list.useQuery();
  const { data: modulosAcoes } = trpc.profiles.getModulosAcoes.useQuery();

  const seedMutation = trpc.profiles.seedDefaultProfiles.useMutation({
    onSuccess: (data) => {
      toast.success(`Perfis padrão criados: ${data.resultados.join(", ")}`);
      utils.profiles.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteMutation = trpc.profiles.delete.useMutation({
    onSuccess: () => {
      toast.success("Perfil excluído com sucesso");
      utils.profiles.list.invalidate();
      setDeleteId(null);
    },
    onError: (e) => toast.error(e.message),
  });

  const createMutation = trpc.profiles.create.useMutation({
    onSuccess: (data) => {
      toast.success("Perfil criado com sucesso");
      utils.profiles.list.invalidate();
      setCreateOpen(false);
      // Navegar direto para o editor de permissões
      navigate(`/admin/perfis/${data.id}`);
    },
    onError: (e) => toast.error(e.message),
  });

  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ nome: "", descricao: "", cor: "#6366f1" });

  const totalModulos = modulosAcoes?.modulos.length ?? 0;
  const totalAcoes = modulosAcoes?.acoes.length ?? 0;

  return (
    <div className="p-6 space-y-6">
      {/* Cabeçalho */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Shield className="h-6 w-6 text-primary" />
            Perfis e Permissões
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Gerencie os perfis de acesso e defina permissões granulares por módulo para cada colaborador.
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          {profiles.length === 0 && (
            <Button
              variant="outline"
              onClick={() => seedMutation.mutate()}
              disabled={seedMutation.isPending}
            >
              <Sparkles className="h-4 w-4 mr-2" />
              Criar Perfis Padrão
            </Button>
          )}
          <Button onClick={() => { setForm({ nome: "", descricao: "", cor: "#6366f1" }); setCreateOpen(true); }}>
            <Plus className="h-4 w-4 mr-2" />
            Novo Perfil
          </Button>
        </div>
      </div>

      {/* Cards de resumo */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-5 flex items-center gap-4">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <Shield className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold">{profiles.length}</p>
              <p className="text-xs text-muted-foreground">Perfis cadastrados</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 flex items-center gap-4">
            <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0">
              <Settings2 className="h-5 w-5 text-blue-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">{totalModulos}</p>
              <p className="text-xs text-muted-foreground">Módulos controláveis</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 flex items-center gap-4">
            <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center shrink-0">
              <Lock className="h-5 w-5 text-emerald-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">{totalAcoes}</p>
              <p className="text-xs text-muted-foreground">Tipos de ação</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Lista de perfis */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-40 bg-muted animate-pulse rounded-xl" />
          ))}
        </div>
      ) : profiles.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16 gap-4 text-center">
            <Shield className="h-12 w-12 text-muted-foreground/40" />
            <div>
              <p className="font-semibold text-muted-foreground">Nenhum perfil cadastrado</p>
              <p className="text-sm text-muted-foreground/70 mt-1">
                Crie perfis personalizados ou use os perfis padrão do sistema.
              </p>
            </div>
            <Button variant="outline" onClick={() => seedMutation.mutate()} disabled={seedMutation.isPending}>
              <Sparkles className="h-4 w-4 mr-2" />
              Criar Perfis Padrão
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {profiles.map((profile) => (
            <Card
              key={profile.id}
              className="group hover:shadow-md transition-shadow cursor-pointer relative overflow-hidden"
              onClick={() => navigate(`/admin/perfis/${profile.id}`)}
            >
              {/* Faixa colorida lateral */}
              <div
                className="absolute left-0 top-0 bottom-0 w-1 rounded-l-xl"
                style={{ backgroundColor: profile.cor ?? "#6366f1" }}
              />
              <CardHeader className="pb-2 pl-5">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                      style={{ backgroundColor: `${profile.cor ?? "#6366f1"}20` }}
                    >
                      <Shield className="h-4 w-4" style={{ color: profile.cor ?? "#6366f1" }} />
                    </div>
                    <div>
                      <CardTitle className="text-base leading-tight">{profile.nome}</CardTitle>
                      {profile.isSystem === 1 && (
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0 mt-0.5">Sistema</Badge>
                      )}
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors shrink-0 mt-1" />
                </div>
              </CardHeader>
              <CardContent className="pl-5 space-y-3">
                {profile.descricao && (
                  <p className="text-xs text-muted-foreground line-clamp-2">{profile.descricao}</p>
                )}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-sm">
                    <Users className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="font-medium">{(profile as any).totalUsuarios ?? 0}</span>
                    <span className="text-muted-foreground text-xs">
                      {(profile as any).totalUsuarios === 1 ? "usuário" : "usuários"}
                    </span>
                  </div>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      onClick={(e) => { e.stopPropagation(); navigate(`/admin/perfis/${profile.id}`); }}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    {profile.isSystem !== 1 && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={(e) => { e.stopPropagation(); setDeleteId(profile.id); }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Dialog: criar perfil */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Novo Perfil de Acesso</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Nome do perfil *</Label>
              <Input
                placeholder="Ex: Supervisor, Financeiro..."
                value={form.nome}
                onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Descrição</Label>
              <Textarea
                placeholder="Descreva as responsabilidades deste perfil..."
                rows={3}
                value={form.descricao}
                onChange={(e) => setForm((f) => ({ ...f, descricao: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Cor de identificação</Label>
              <div className="flex flex-wrap gap-2">
                {COR_OPCOES.map((cor) => (
                  <button
                    key={cor}
                    type="button"
                    className={`w-7 h-7 rounded-full border-2 transition-all ${form.cor === cor ? "scale-125 border-foreground" : "border-transparent"}`}
                    style={{ backgroundColor: cor }}
                    onClick={() => setForm((f) => ({ ...f, cor }))}
                  />
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancelar</Button>
            <Button
              disabled={!form.nome.trim() || createMutation.isPending}
              onClick={() => createMutation.mutate({ nome: form.nome.trim(), descricao: form.descricao || undefined, cor: form.cor })}
            >
              Criar e Configurar Permissões
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* AlertDialog: confirmar exclusão */}
      <AlertDialog open={deleteId !== null} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir perfil?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação removerá o perfil e desvinculará todos os usuários associados a ele. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteId !== null && deleteMutation.mutate({ id: deleteId })}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
