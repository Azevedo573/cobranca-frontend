import { useState, useEffect, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useLocation, useRoute } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  ArrowLeft,
  Shield,
  Save,
  CheckSquare,
  Square,
  Minus,
  Info,
  Lock,
  Eye,
  Plus,
  Pencil,
  Trash2,
  Download,
  ThumbsUp,
} from "lucide-react";

const COR_OPCOES = [
  "#ef4444", "#f97316", "#f59e0b", "#84cc16",
  "#10b981", "#06b6d4", "#3b82f6", "#6366f1",
  "#8b5cf6", "#ec4899", "#64748b", "#1e293b",
];

const ACAO_ICONS: { [key: string]: React.ReactNode } = {
  visualizar: <Eye className="h-3 w-3" />,
  criar:      <Plus className="h-3 w-3" />,
  editar:     <Pencil className="h-3 w-3" />,
  excluir:    <Trash2 className="h-3 w-3" />,
  exportar:   <Download className="h-3 w-3" />,
  aprovar:    <ThumbsUp className="h-3 w-3" />,
};

type PermMap = { [modulo: string]: { [acao: string]: boolean } };

export default function ProfileEditor() {
  const [, navigate] = useLocation();
  const [, params] = useRoute("/admin/perfis/:id");
  const rawId = params?.id;
  const profileId = rawId ? Number(rawId) : NaN;
  const validProfileId = !isNaN(profileId) && profileId > 0;
  const utils = trpc.useUtils();

  const { data: profileData, isLoading } = trpc.profiles.getById.useQuery(
    { id: profileId },
    { enabled: validProfileId }
  );
  const { data: modulosAcoes } = trpc.profiles.getModulosAcoes.useQuery();

  // Estado local do formulário
  const [nome, setNome] = useState("");
  const [descricao, setDescricao] = useState("");
  const [cor, setCor] = useState("#6366f1");
  const [permMap, setPermMap] = useState<PermMap>({});
  const [dirty, setDirty] = useState(false);

  // Inicializar estado quando os dados chegam
  useEffect(() => {
    if (!profileData) return;
    setNome(profileData.nome);
    setDescricao(profileData.descricao ?? "");
    setCor(profileData.cor ?? "#6366f1");

    const map: PermMap = {};
    for (const p of profileData.permissions) {
      if (!map[p.modulo]) map[p.modulo] = {};
      map[p.modulo][p.acao] = p.permitido === 1;
    }
    setPermMap(map);
    setDirty(false);
  }, [profileData]);

  const updateMutation = trpc.profiles.update.useMutation({
    onSuccess: () => {
      toast.success("Dados do perfil atualizados");
      utils.profiles.list.invalidate();
      setDirty(false);
    },
    onError: (e) => toast.error(e.message),
  });

  const setPermsMutation = trpc.profiles.setPermissions.useMutation({
    onSuccess: () => {
      toast.success("Permissões salvas com sucesso");
      utils.profiles.getById.invalidate({ id: profileId });
      utils.profiles.list.invalidate();
      setDirty(false);
    },
    onError: (e) => toast.error(e.message),
  });

  const isSystem = profileData?.isSystem === 1;

  // Agrupar módulos por grupo
  const grupos = useMemo(() => {
    if (!modulosAcoes) return [];
    const map = new Map<string, typeof modulosAcoes.modulos[number][]>();
    for (const m of modulosAcoes.modulos) {
      if (!map.has(m.grupo)) map.set(m.grupo, []);
      map.get(m.grupo)!.push(m);
    }
    return Array.from(map.entries()).map(([grupo, modulos]) => ({ grupo, modulos }));
  }, [modulosAcoes]);

  const acoes = modulosAcoes?.acoes ?? [];

  // Helpers de toggle
  const toggle = (modulo: string, acao: string) => {
    if (isSystem) return;
    setPermMap((prev) => {
      const next = { ...prev, [modulo]: { ...(prev[modulo] ?? {}) } };
      next[modulo][acao] = !next[modulo][acao];
      return next;
    });
    setDirty(true);
  };

  const toggleModulo = (moduloId: string, value: boolean) => {
    if (isSystem) return;
    setPermMap((prev) => {
      const next: PermMap = { ...prev, [moduloId]: {} };
      for (const a of acoes) (next[moduloId] as { [k: string]: boolean })[a.id] = value;
      return next;
    });
    setDirty(true);
  };

  const toggleAcaoGlobal = (acaoId: string, value: boolean) => {
    if (isSystem) return;
    setPermMap((prev) => {
      const next = { ...prev };
      for (const grupo of grupos) {
        for (const m of grupo.modulos) {
          next[m.id] = { ...(next[m.id] ?? {}) };
          next[m.id][acaoId] = value;
        }
      }
      return next;
    });
    setDirty(true);
  };

  const isModuloFull = (moduloId: string) =>
    acoes.every((a) => permMap[moduloId]?.[a.id] === true);
  const isModuloPartial = (moduloId: string) =>
    acoes.some((a) => permMap[moduloId]?.[a.id] === true) && !isModuloFull(moduloId);

  const totalPermitidas = useMemo(() => {
    let count = 0;
    for (const m of Object.values(permMap)) {
      for (const v of Object.values(m)) if (v) count++;
    }
    return count;
  }, [permMap]);

  const totalPossivel = (modulosAcoes?.modulos.length ?? 0) * (modulosAcoes?.acoes.length ?? 0);

  const handleSave = () => {
    if (!validProfileId) {
      toast.error("ID de perfil inválido. Retorne à listagem e tente novamente.");
      return;
    }
    // Salvar dados do perfil
    if (!isSystem) {
      updateMutation.mutate({ id: profileId, nome: nome.trim(), descricao: descricao || undefined, cor });
    }
    // Salvar permissões
    const permissions: Array<{ modulo: string; acao: string; permitido: number }> = [];
    for (const [modulo, acaoMap] of Object.entries(permMap)) {
      for (const [acao, permitido] of Object.entries(acaoMap)) {
        permissions.push({ modulo, acao, permitido: permitido ? 1 : 0 });
      }
    }
    setPermsMutation.mutate({ profileId, permissions });
  };

  // Redirecionar se o ID for inválido
  if (!validProfileId) {
    return (
      <div className="p-6 text-center text-muted-foreground">
        <p className="font-medium">ID de perfil inválido.</p>
        <button
          className="mt-2 text-sm text-primary underline"
          onClick={() => navigate("/admin/perfis")}
        >
          Voltar para a listagem de perfis
        </button>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <div className="h-8 w-48 bg-muted animate-pulse rounded" />
        <div className="h-64 bg-muted animate-pulse rounded-xl" />
      </div>
    );
  }

  if (!profileData) {
    return (
      <div className="p-6 text-center text-muted-foreground">
        Perfil não encontrado.
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/admin/perfis")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div
            className="w-9 h-9 rounded-lg flex items-center justify-center"
            style={{ backgroundColor: `${cor}20` }}
          >
            <Shield className="h-5 w-5" style={{ color: cor }} />
          </div>
          <div>
            <h1 className="text-xl font-bold leading-tight">{profileData.nome}</h1>
            <div className="flex items-center gap-2 mt-0.5">
              {isSystem && <Badge variant="secondary" className="text-[10px]">Sistema</Badge>}
              <span className="text-xs text-muted-foreground">
                {totalPermitidas} de {totalPossivel} permissões ativas
              </span>
            </div>
          </div>
        </div>
        <Button
          onClick={handleSave}
          disabled={updateMutation.isPending || setPermsMutation.isPending || !dirty}
        >
          <Save className="h-4 w-4 mr-2" />
          Salvar Alterações
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Coluna esquerda: dados do perfil */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Dados do Perfil</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label>Nome *</Label>
                <Input
                  value={nome}
                  onChange={(e) => { setNome(e.target.value); setDirty(true); }}
                  disabled={isSystem}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Descrição</Label>
                <Textarea
                  rows={3}
                  value={descricao}
                  onChange={(e) => { setDescricao(e.target.value); setDirty(true); }}
                  disabled={isSystem}
                  placeholder="Descreva as responsabilidades..."
                />
              </div>
              <div className="space-y-2">
                <Label>Cor de identificação</Label>
                <div className="flex flex-wrap gap-2">
                  {COR_OPCOES.map((c) => (
                    <button
                      key={c}
                      type="button"
                      disabled={isSystem}
                      className={`w-6 h-6 rounded-full border-2 transition-all ${cor === c ? "scale-125 border-foreground" : "border-transparent"} disabled:opacity-50`}
                      style={{ backgroundColor: c }}
                      onClick={() => { setCor(c); setDirty(true); }}
                    />
                  ))}
                </div>
              </div>
              {isSystem && (
                <div className="flex items-start gap-2 bg-amber-500/10 border border-amber-500/20 rounded-lg p-3 text-xs text-amber-700 dark:text-amber-400">
                  <Lock className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <span>Este é um perfil do sistema e não pode ser editado.</span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Resumo de permissões */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Resumo de Acesso</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {grupos.map(({ grupo, modulos }) => {
                const count = modulos.filter((m) => isModuloFull(m.id)).length;
                const partial = modulos.filter((m) => isModuloPartial(m.id)).length;
                return (
                  <div key={grupo} className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">{grupo}</span>
                    <div className="flex items-center gap-1">
                      {count > 0 && (
                        <Badge variant="default" className="text-[10px] px-1.5 py-0 h-4">
                          {count} total
                        </Badge>
                      )}
                      {partial > 0 && (
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">
                          {partial} parcial
                        </Badge>
                      )}
                      {count === 0 && partial === 0 && (
                        <span className="text-muted-foreground/50">Sem acesso</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </div>

        {/* Coluna direita: matriz de permissões */}
        <div className="lg:col-span-2 space-y-4">
          {/* Controles globais */}
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Info className="h-4 w-4" />
                  <span>Clique nos switches para ativar/desativar permissões por módulo e ação.</span>
                </div>
                {!isSystem && (
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        if (!modulosAcoes) return;
                        const next: PermMap = {};
                        for (const m of modulosAcoes.modulos) {
                          next[m.id] = {};
                          for (const a of modulosAcoes.acoes) next[m.id][a.id] = true;
                        }
                        setPermMap(next);
                        setDirty(true);
                      }}
                    >
                      <CheckSquare className="h-3.5 w-3.5 mr-1.5" />
                      Marcar Tudo
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        if (!modulosAcoes) return;
                        const next: PermMap = {};
                        for (const m of modulosAcoes.modulos) {
                          next[m.id] = {};
                          for (const a of modulosAcoes.acoes) next[m.id][a.id] = false;
                        }
                        setPermMap(next);
                        setDirty(true);
                      }}
                    >
                      <Square className="h-3.5 w-3.5 mr-1.5" />
                      Desmarcar Tudo
                    </Button>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Matriz por grupo */}
          {grupos.map(({ grupo, modulos }) => (
            <Card key={grupo}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground uppercase tracking-wide">
                  {grupo}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {/* Cabeçalho das ações */}
                <div className="grid border-b" style={{ gridTemplateColumns: `1fr repeat(${acoes.length}, minmax(0,1fr)) auto` }}>
                  <div className="px-4 py-2 text-xs font-medium text-muted-foreground">Módulo</div>
                  {acoes.map((a) => (
                    <div key={a.id} className="px-2 py-2 text-center">
                      <button
                        className="flex flex-col items-center gap-1 w-full group disabled:opacity-50"
                        disabled={isSystem}
                        onClick={() => {
                          const allOn = modulos.every((m) => permMap[m.id]?.[a.id] === true);
                          toggleAcaoGlobal(a.id, !allOn);
                        }}
                        title={`Alternar "${a.label}" em todos os módulos deste grupo`}
                      >
                        <span className="text-muted-foreground group-hover:text-foreground transition-colors">
                          {ACAO_ICONS[a.id]}
                        </span>
                        <span className="text-[10px] text-muted-foreground group-hover:text-foreground transition-colors leading-none">
                          {a.label}
                        </span>
                      </button>
                    </div>
                  ))}
                  <div className="px-3 py-2 text-xs text-muted-foreground text-center">Todos</div>
                </div>

                {/* Linhas de módulos */}
                {modulos.map((m, idx) => (
                  <div
                    key={m.id}
                    className={`grid items-center ${idx < modulos.length - 1 ? "border-b" : ""}`}
                    style={{ gridTemplateColumns: `1fr repeat(${acoes.length}, minmax(0,1fr)) auto` }}
                  >
                    {/* Nome do módulo + indicador */}
                    <div className="px-4 py-3 flex items-center gap-2">
                      <div
                        className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                          isModuloFull(m.id)
                            ? "bg-emerald-500"
                            : isModuloPartial(m.id)
                            ? "bg-amber-500"
                            : "bg-muted-foreground/30"
                        }`}
                      />
                      <span className="text-sm">{m.label}</span>
                    </div>

                    {/* Switches por ação */}
                    {acoes.map((a) => (
                      <div key={a.id} className="flex justify-center px-2 py-3">
                        <Switch
                          checked={permMap[m.id]?.[a.id] === true}
                          onCheckedChange={() => toggle(m.id, a.id)}
                          disabled={isSystem}
                          className="scale-90"
                        />
                      </div>
                    ))}

                    {/* Toggle linha inteira */}
                    <div className="flex justify-center px-3 py-3">
                      <button
                        disabled={isSystem}
                        className="text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
                        onClick={() => toggleModulo(m.id, !isModuloFull(m.id))}
                        title={isModuloFull(m.id) ? "Remover todos" : "Conceder todos"}
                      >
                        {isModuloFull(m.id) ? (
                          <CheckSquare className="h-4 w-4 text-emerald-500" />
                        ) : isModuloPartial(m.id) ? (
                          <Minus className="h-4 w-4 text-amber-500" />
                        ) : (
                          <Square className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}

          {/* Botão salvar flutuante */}
          {dirty && (
            <div className="sticky bottom-4 flex justify-end">
              <Button
                size="lg"
                onClick={handleSave}
                disabled={updateMutation.isPending || setPermsMutation.isPending}
                className="shadow-lg"
              >
                <Save className="h-4 w-4 mr-2" />
                Salvar Alterações
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
