import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import { CampoSelect } from "./CampoSelect";
import { POLLING_TRABALHO } from "./trabalho";
import { useTrabalhoCache } from "./useTrabalhoCache";

export function EquipeConfigDialog({ onClose }: { onClose: () => void }) {
  const { user } = useAuth();
  const admin = user?.role === "admin";
  const utils = trpc.useUtils();
  const invalidar = useTrabalhoCache();
  const [equipeId, setEquipeId] = useState("");
  const [nome, setNome] = useState("");
  const [membros, setMembros] = useState<
    Array<{ userId: number; gestor: boolean }>
  >([]);
  const [busca, setBusca] = useState("");
  const [demandaId, setDemandaId] = useState("");
  const [vinculoEquipeId, setVinculoEquipeId] = useState("");
  const equipes = trpc.juridicoEquipes.listar.useQuery(undefined, {
    ...POLLING_TRABALHO,
    enabled: admin,
  });
  const usuarios = trpc.juridicoEquipes.usuariosElegiveis.useQuery(undefined, {
    ...POLLING_TRABALHO,
    enabled: admin,
  });
  const demandas = trpc.juridicoDemandas.listar.useQuery(undefined, {
    ...POLLING_TRABALHO,
    enabled: admin,
  });
  const salvar = trpc.juridicoEquipes.salvar.useMutation({
    onSuccess: async result => {
      toast.success("Equipe salva sem alteração de perfil global");
      setEquipeId(String(result.id));
      await utils.juridicoEquipes.invalidate();
      await invalidar();
    },
    onError: e => toast.error(e.message),
  });
  const vincular = trpc.juridicoEquipes.vincularDemanda.useMutation({
    onSuccess: async () => {
      toast.success("Equipe vinculada explicitamente à demanda");
      await utils.juridicoEquipes.invalidate();
      await invalidar();
    },
    onError: e => toast.error(e.message),
  });
  const selecionar = (id: string) => {
    setEquipeId(id);
    const equipe = equipes.data?.find(e => e.id === Number(id));
    setNome(equipe?.nome ?? "");
    setMembros(
      equipe?.membros.map(m => ({ userId: m.userId, gestor: !!m.gestor })) ?? []
    );
  };
  const selecionada = demandas.data?.find(d => d.id === Number(demandaId));
  const erro = equipes.error || usuarios.error || demandas.error;
  const busy = salvar.isPending || vincular.isPending;
  return (
    <Dialog
      open
      onOpenChange={open => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Configurar equipe jurídica</DialogTitle>
          <DialogDescription>
            Somente o administrador cadastra equipes e gestores. Gestão não
            promove ninguém a administrador; as ações RBAC e carteiras continuam
            obrigatórias.
          </DialogDescription>
        </DialogHeader>
        {!admin ? (
          <p role="alert" className="text-sm text-rose-700">
            Configuração exclusiva do administrador.
          </p>
        ) : (
          <Tabs defaultValue="equipe">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="equipe">Equipe e gestores</TabsTrigger>
              <TabsTrigger value="vinculo">Vincular demanda</TabsTrigger>
            </TabsList>
            {erro && (
              <p
                role="alert"
                className="mt-3 rounded-lg bg-rose-50 p-3 text-sm text-rose-700"
              >
                {erro.message}
              </p>
            )}
            <TabsContent value="equipe" className="space-y-4">
              <CampoSelect
                label="Equipe cadastrada"
                value={equipeId}
                onChange={selecionar}
                disabled={equipes.isLoading || equipes.isError || busy}
              >
                <option value="">Criar nova equipe</option>
                {(equipes.isError ? [] : (equipes.data ?? []))
                  .filter(e => e.isActive)
                  .map(e => (
                    <option key={e.id} value={e.id}>
                      {e.nome}
                    </option>
                  ))}
              </CampoSelect>
              <label className="block space-y-1 text-xs font-medium text-slate-600">
                Nome da equipe *
                <Input
                  maxLength={120}
                  value={nome}
                  onChange={e => setNome(e.target.value)}
                  disabled={busy}
                  placeholder="Ex.: Contencioso condominial"
                />
              </label>
              <label className="block space-y-1 text-xs font-medium text-slate-600">
                Buscar profissional elegível
                <Input
                  value={busca}
                  onChange={e => setBusca(e.target.value)}
                  placeholder="Nome ou e-mail"
                />
              </label>
              <div className="max-h-64 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-2">
                {usuarios.isLoading && (
                  <p className="p-2 text-xs text-slate-500">
                    Carregando membros elegíveis…
                  </p>
                )}
                {!usuarios.isError &&
                  (usuarios.data ?? [])
                    .filter(p =>
                      `${p.name} ${p.email}`
                        .toLocaleLowerCase("pt-BR")
                        .includes(busca.toLocaleLowerCase("pt-BR"))
                    )
                    .map(p => {
                      const membro = membros.find(m => m.userId === p.id);
                      return (
                        <div
                          key={p.id}
                          className="flex flex-wrap items-center justify-between gap-2 rounded-md p-2 hover:bg-slate-50"
                        >
                          <label className="flex items-start gap-2 text-sm">
                            <input
                              type="checkbox"
                              checked={!!membro}
                              disabled={busy}
                              onChange={e =>
                                setMembros(prev =>
                                  e.target.checked
                                    ? [...prev, { userId: p.id, gestor: false }]
                                    : prev.filter(m => m.userId !== p.id)
                                )
                              }
                              className="mt-1 accent-indigo-600"
                            />
                            <span className="text-slate-800">
                              {p.name || p.email}
                              <span className="block text-xs text-slate-500">
                                {p.email} ·{" "}
                                {p.role === "colaborador"
                                  ? "Colaborador jurídico"
                                  : p.role}
                              </span>
                            </span>
                          </label>
                          <label className="flex items-center gap-2 text-xs text-slate-600">
                            <input
                              type="checkbox"
                              checked={membro?.gestor ?? false}
                              disabled={!membro || busy}
                              onChange={e =>
                                setMembros(prev =>
                                  prev.map(m =>
                                    m.userId === p.id
                                      ? { ...m, gestor: e.target.checked }
                                      : m
                                  )
                                )
                              }
                              className="accent-indigo-600"
                            />
                            Gestor explícito
                          </label>
                        </div>
                      );
                    })}
              </div>
              {membros.some(
                m => !(usuarios.data ?? []).some(p => p.id === m.userId)
              ) && (
                <p className="rounded-md bg-amber-50 p-2 text-xs text-amber-800">
                  Há membros atualmente inelegíveis. Remova-os explicitamente
                  antes de salvar:{" "}
                  {membros
                    .filter(
                      m => !(usuarios.data ?? []).some(p => p.id === m.userId)
                    )
                    .map(m => (
                      <Button
                        key={m.userId}
                        size="sm"
                        variant="outline"
                        className="ml-1"
                        onClick={() =>
                          setMembros(prev =>
                            prev.filter(x => x.userId !== m.userId)
                          )
                        }
                      >
                        Remover #{m.userId}
                      </Button>
                    ))}
                </p>
              )}
              <p className="text-xs text-slate-500">
                Configure primeiro o perfil jurídico de gestão: módulo Gestão de
                equipe jurídica, ação visualizar, e as ações de
                criar/editar/aprovar necessárias. Membros precisam do perfil
                jurídico de execução e das carteiras autorizadas. Depois
                selecione ao menos um gestor explícito nesta equipe. Nenhum
                perfil ou permissão é concedido por este diálogo.
              </p>
              <div className="flex justify-end gap-2">
                <Button variant="outline" disabled={busy} onClick={onClose}>
                  Fechar
                </Button>
                <Button
                  disabled={
                    busy ||
                    nome.trim().length < 2 ||
                    !membros.some(m => m.gestor) ||
                    usuarios.isError ||
                    equipes.isError ||
                    usuarios.isLoading ||
                    equipes.isLoading
                  }
                  onClick={() =>
                    salvar.mutate({
                      id: equipeId ? Number(equipeId) : undefined,
                      nome: nome.trim(),
                      membros,
                    })
                  }
                >
                  {salvar.isPending ? "Salvando…" : "Salvar equipe"}
                </Button>
              </div>
            </TabsContent>
            <TabsContent value="vinculo" className="space-y-4">
              <p className="rounded-md bg-amber-50 p-3 text-xs text-amber-800">
                Vincular a demanda define sua equipe de trabalho. Não altera
                carteiras, perfis globais ou responsáveis existentes. Confira o
                contexto antes de confirmar.
              </p>
              <CampoSelect
                label="Demanda existente *"
                value={demandaId}
                onChange={setDemandaId}
                disabled={demandas.isLoading || demandas.isError || busy}
              >
                <option value="">Selecione a demanda</option>
                {(demandas.isError ? [] : (demandas.data ?? [])).map(d => (
                  <option key={d.id} value={d.id}>
                    {d.numero} · {d.assunto}
                  </option>
                ))}
              </CampoSelect>
              {selecionada && (
                <p className="text-xs text-slate-600">
                  Equipe atual:{" "}
                  {equipes.data?.find(
                    e =>
                      e.id === (selecionada as { equipeId?: number }).equipeId
                  )?.nome || "Sem equipe"}
                </p>
              )}
              <CampoSelect
                label="Equipe de destino *"
                value={vinculoEquipeId}
                onChange={setVinculoEquipeId}
                disabled={equipes.isError || equipes.isLoading || busy}
              >
                <option value="">Selecione a equipe</option>
                {(equipes.isError ? [] : (equipes.data ?? []))
                  .filter(e => e.isActive)
                  .map(e => (
                    <option key={e.id} value={e.id}>
                      {e.nome}
                    </option>
                  ))}
              </CampoSelect>
              <div className="flex justify-end gap-2">
                <Button variant="outline" disabled={busy} onClick={onClose}>
                  Fechar
                </Button>
                <Button
                  disabled={
                    busy ||
                    !demandaId ||
                    !vinculoEquipeId ||
                    demandas.isError ||
                    equipes.isError
                  }
                  onClick={() =>
                    vincular.mutate({
                      demandaId: Number(demandaId),
                      equipeId: Number(vinculoEquipeId),
                    })
                  }
                >
                  {vincular.isPending ? "Vinculando…" : "Confirmar vínculo"}
                </Button>
              </div>
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}
