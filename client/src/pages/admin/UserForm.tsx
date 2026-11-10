import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import {
  buildCreateUserPayload, buildUpdateUserPayload, canSubmitUserForm, changeUserForm,
  changeUserPrincipal, changeUserRole, changeUserScope, changeUserVinculo,
  createUserFormSession, hasAccessChanges, hydrateUserForm, isGlobalScope,
  isScopeEligible, requiresGlobalAcknowledgement, userFormInvalidationTargets,
  validateUserForm, type UserRole,
} from "@/lib/user-form-escopo";
import { ArrowLeft, Eye, EyeOff, Save } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useLocation, useRoute } from "wouter";
import { toast } from "sonner";

export default function UserForm() {
  const [, params] = useRoute("/admin/usuarios/:id");
  const userId = params?.id && params.id !== "novo" ? Number(params.id) : null;
  // A different route owns a new session; late responses cannot hydrate another user.
  return <UserFormEditor key={userId ?? "novo"} userId={userId} />;
}

function UserFormEditor({ userId }: { userId: number | null }) {
  const { user, logout, loading: authLoading, error: authError } = useAuth();
  const [, setLocation] = useLocation();
  const isEdit = userId !== null;
  const [showPassword, setShowPassword] = useState(false);
  const [session, setSession] = useState(() => createUserFormSession(userId));
  const submitLock = useRef(false);
  const formData = session.data;
  const actorIsAdmin = user?.role === "admin" && user.isActive === 1;
  const userQuery = trpc.users.getById.useQuery({ id: userId! }, { enabled: isEdit && actorIsAdmin });
  const vinculosQuery = trpc.users.getVinculosCondominios.useQuery({ userId: userId! }, { enabled: isEdit && actorIsAdmin });
  const condominiosQuery = trpc.condominios.list.useQuery(undefined, { enabled: actorIsAdmin });
  const { data: condominios } = condominiosQuery;
  const ativos = condominios?.filter(condominio => condominio.isActive === 1) ?? [];

  useEffect(() => {
    setSession(current => hydrateUserForm(current, userQuery.data, vinculosQuery.data));
  }, [userQuery.data, vinculosQuery.data]);

  const utils = trpc.useUtils();
  const invalidateAfterSave = async (accessChanged: boolean, statusChanged: boolean) => {
    await Promise.all(userFormInvalidationTargets(accessChanged, statusChanged).map(target => {
      switch (target) {
        case "users.list": return utils.users.list.invalidate();
        case "users.listByCondominio": return utils.users.listByCondominio.invalidate();
        case "users.getById": return utils.users.getById.invalidate();
        case "users.getVinculosCondominios": return utils.users.getVinculosCondominios.invalidate();
        case "auth.me": return utils.auth.me.invalidate();
        case "condominios.list": return utils.condominios.list.invalidate();
      }
    }));
  };
  const createMutation = trpc.users.create.useMutation({
    onSuccess: async () => {
      await invalidateAfterSave(true, true);
      toast.success("Usuário cadastrado com sucesso!");
      setLocation("/admin/usuarios");
    },
    onError: error => toast.error("Erro ao cadastrar: " + error.message),
  });
  const updateMutation = trpc.users.update.useMutation({
    onSuccess: async () => {
      await invalidateAfterSave(hasAccessChanges(session), session.data.isActive !== session.baseline?.isActive);
      toast.success("Usuário atualizado com sucesso!");
      setLocation("/admin/usuarios");
    },
    onError: error => toast.error("Erro ao atualizar: " + error.message),
  });

  const salvando = createMutation.isPending || updateMutation.isPending;
  const loading = authLoading || condominiosQuery.isFetching || (isEdit && (userQuery.isFetching || vinculosQuery.isFetching || !session.hydrated));
  const queryError = !!authError || condominiosQuery.isError || (isEdit && (userQuery.isError || vinculosQuery.isError || (userQuery.isSuccess && !userQuery.data)));
  const canSubmit = canSubmitUserForm(session, { pending: salvando, loading, error: queryError, actorIsAdmin });
  const global = isGlobalScope(formData);
  const accessChanged = hasAccessChanges(session);
  const needsGlobalAcknowledgement = requiresGlobalAcknowledgement(session);
  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit || submitLock.current) return;
    const error = validateUserForm(session, ativos.map(condominio => condominio.id));
    if (error) return toast.error(error);
    submitLock.current = true;
    try {
      if (userId !== null) {
        await updateMutation.mutateAsync({ id: userId, ...buildUpdateUserPayload(session) });
      } else {
        await createMutation.mutateAsync(buildCreateUserPayload(session));
      }
    } catch {
      // Mutation callbacks display the server error; keep the draft for correction.
    } finally {
      submitLock.current = false;
    }
  };
  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = event.target;
    if (name === "name" || name === "email" || name === "password") {
      setSession(current => changeUserForm(current, { [name]: value }));
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-accent/5">
      <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="icon" onClick={() => setLocation("/admin/usuarios")} aria-label="Voltar para usuários"><ArrowLeft className="h-5 w-5" /></Button>
              <div>
                <h1 className="text-2xl font-bold text-primary">{isEdit ? "Editar Usuário" : "Novo Usuário"}</h1>
                <p className="text-sm text-muted-foreground">Dados pessoais, perfil e condomínios autorizados</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right"><p className="text-sm font-medium">{user?.name}</p><p className="text-xs text-muted-foreground">{user?.role}</p></div>
              <Button variant="outline" onClick={() => logout()}>Sair</Button>
            </div>
          </div>
        </div>
      </header>
      <main className="container mx-auto max-w-4xl px-4 py-8">
        <form onSubmit={handleSubmit}>
          <Card>
            <CardHeader>
              <CardTitle>Dados do Usuário</CardTitle>
              <CardDescription>{isEdit ? "Atualize os dados. Deixe a senha em branco para mantê-la." : "Crie um acesso individual e defina os condomínios autorizados."}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {queryError ? <p role="alert" className="text-sm text-destructive">Não foi possível carregar o usuário, vínculos ou condomínios. Recarregue a página antes de salvar.</p>
                : loading ? <p role="status" className="text-sm text-muted-foreground">Carregando dados e vínculos...</p> : null}
              {!authLoading && !actorIsAdmin && <p role="alert" className="text-sm text-destructive">Somente um administrador ativo pode salvar este cadastro.</p>}
              <fieldset disabled={!canSubmit} className="space-y-6 disabled:opacity-70">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="space-y-2"><Label htmlFor="name">Nome completo *</Label><Input id="name" name="name" value={formData.name} onChange={handleChange} placeholder="Nome do usuário" required /></div>
                  <div className="space-y-2"><Label htmlFor="email">E-mail * (usado para login)</Label><Input id="email" name="email" type="email" value={formData.email} onChange={handleChange} placeholder="usuario@email.com" required /><p className="text-xs text-muted-foreground">Este e-mail identifica o acesso individual e a auditoria.</p></div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">{isEdit ? "Nova senha (deixe em branco para não alterar)" : "Senha *"}</Label>
                  <div className="relative">
                    <Input id="password" name="password" type={showPassword ? "text" : "password"} value={formData.password} onChange={handleChange} placeholder={isEdit ? "Digite apenas se quiser alterar" : "Mínimo 10 caracteres, maiúscula, minúscula e número"} required={!isEdit} />
                    <Button type="button" variant="ghost" size="icon" className="absolute right-0 top-0 h-full" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}>{showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</Button>
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="role">Perfil de acesso *</Label>
                    <Select value={formData.role} onValueChange={value => setSession(current => changeUserRole(current, value as UserRole))} disabled={!canSubmit}>
                      <SelectTrigger id="role"><SelectValue placeholder="Selecione o perfil" /></SelectTrigger>
                      <SelectContent><SelectItem value="admin">Administrador</SelectItem><SelectItem value="sindico">Síndico</SelectItem><SelectItem value="cobrador">Cobrador</SelectItem><SelectItem value="colaborador">Colaborador interno</SelectItem><SelectItem value="advogado">Advogado</SelectItem></SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">O perfil determina as ações permitidas. O escopo abaixo determina quais condomínios podem ser acessados.</p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="condominioId">Condomínio principal (opcional)</Label>
                    <Select value={formData.condominioId || "none"} onValueChange={value => setSession(current => changeUserPrincipal(current, value === "none" ? "" : value))} disabled={!canSubmit}>
                      <SelectTrigger id="condominioId"><SelectValue placeholder="Selecione o condomínio" /></SelectTrigger>
                      <SelectContent><SelectItem value="none">Sem preferência</SelectItem>{ativos.map(condominio => <SelectItem key={condominio.id} value={String(condominio.id)}>{condominio.name}</SelectItem>)}</SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">{global ? "Preferência de contexto inicial; não limita nem concede acesso. Pode ficar vazio." : "Contexto inicial após o login; deve estar na carteira autorizada. Sem preferência, será usado um condomínio autorizado."} Administradores mantêm visão global administrativa.</p>
                  </div>
                </div>

                {isEdit && session.baseline?.escopoCondominios === null && <div role="note" className="rounded-lg border border-amber-300 bg-amber-50/50 p-4 text-sm dark:bg-amber-950/20"><strong>Acesso legado preservado.</strong> Alterar apenas nome, e-mail, senha ou status não muda o alcance nem os vínculos atuais. Uma nova escolha de escopo exige confirmação administrativa.</div>}
                {isScopeEligible(formData.role) && <div className="space-y-3 rounded-lg border border-border bg-muted/20 p-4">
                  <Label htmlFor="escopoCondominios">Acesso aos condomínios *</Label>
                  <Select value={formData.escopoCondominios ?? ""} onValueChange={value => { if (value === "todos" || value === "selecionados") setSession(current => changeUserScope(current, value)); }} disabled={!canSubmit}>
                    <SelectTrigger id="escopoCondominios"><SelectValue placeholder="Legado preservado — escolha apenas para alterar" /></SelectTrigger>
                    <SelectContent><SelectItem value="todos">Todos os condomínios ativos (recomendado para novos acessos)</SelectItem><SelectItem value="selecionados">Somente os condomínios selecionados</SelectItem></SelectContent>
                  </Select>
                  {!isEdit && <p className="text-xs text-muted-foreground">Recomendado: todos os condomínios ativos. A escolha só será concedida ao salvar por um administrador ativo.</p>}
                  <p className="text-xs text-muted-foreground">Acesso global inclui os condomínios ativos atuais e os que forem ativados no futuro. Não torna o usuário administrador, não amplia ações do perfil nem dá acesso a equipes ou tarefas alheias.</p>
                </div>}

                {global ? <div role="note" className="space-y-3 rounded-lg border border-primary/30 bg-primary/5 p-4 text-sm">
                  <p><strong>Todos os condomínios ativos, atuais e futuros.</strong> Não é necessário selecionar vínculos nem condomínio principal. O perfil permanece {formData.role === "advogado" ? "Advogado" : "Colaborador interno"}, sem permissões administrativas adicionais.</p>
                  {needsGlobalAcknowledgement && <label className="flex items-start gap-2"><Checkbox id="globalAcknowledged" checked={session.globalAcknowledged} disabled={!canSubmit} onCheckedChange={checked => setSession(current => ({ ...current, globalAcknowledged: checked === true }))} /><span>Estou ciente da concessão de acesso a todos os condomínios ativos atuais e futuros.</span></label>}
                </div> : <div className="space-y-3 rounded-lg border border-border bg-muted/20 p-4">
                  <div><Label>Condomínios autorizados {formData.role !== "admin" && "*"}</Label><p className="mt-1 text-xs text-muted-foreground">{session.baseline?.escopoCondominios === null && !accessChanged ? "Carteira atual. Os vínculos serão preservados se não forem alterados." : "Acesso somente aos condomínios ativos marcados; selecione ao menos um para perfis não administrativos."}</p></div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {ativos.map(condominio => { const id = String(condominio.id); return <label key={condominio.id} className="flex cursor-pointer items-center gap-2 rounded-md border bg-background px-3 py-2 text-sm hover:bg-muted/50"><Checkbox checked={formData.condominioIds.includes(id)} disabled={!canSubmit} onCheckedChange={checked => setSession(current => changeUserVinculo(current, id, checked === true))} aria-label={`Autorizar acesso a ${condominio.name}`} /><span>{condominio.name}</span></label>; })}
                  </div>
                  {!ativos.length && <p className="text-sm text-muted-foreground">Nenhum condomínio ativo disponível.</p>}
                </div>}
                {accessChanged && <div role="alert" className="space-y-3 rounded-lg border border-amber-300 bg-amber-50/50 p-4 text-sm dark:bg-amber-950/20">
                  <p><strong>Confirmação administrativa de alteração de acesso.</strong> O perfil, alcance, principal ou carteira será alterado ao salvar. Trocar para selecionados restringe o acesso aos vínculos marcados e exclui futuros condomínios não selecionados.</p>
                  <p className="text-xs">Perfil: {session.baseline?.role} → {formData.role}. Escopo: {session.baseline?.escopoCondominios ?? "legado"} → {formData.escopoCondominios ?? (formData.role === "admin" ? "administrativo" : "carteira do perfil")}. Carteira: {session.baseline?.condominioIds.length ?? 0} → {formData.condominioIds.length} vínculo(s).</p>
                  <label className="flex items-start gap-2"><Checkbox id="accessConfirmed" checked={session.accessConfirmed} disabled={!canSubmit} onCheckedChange={checked => setSession(current => ({ ...current, accessConfirmed: checked === true }))} /><span>Como administrador, confirmo a alteração de acesso e eventual restrição desta carteira.</span></label>
                </div>}
                <div className="space-y-2">
                  <Label htmlFor="isActive">Status</Label>
                  <Select value={formData.isActive.toString()} onValueChange={value => setSession(current => changeUserForm(current, { isActive: value === "1" ? 1 : 0 }))} disabled={!canSubmit}><SelectTrigger id="isActive"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="1">Ativo</SelectItem><SelectItem value="0">Inativo</SelectItem></SelectContent></Select>
                  <p className="text-xs text-muted-foreground">Usuários inativos não conseguem fazer login.</p>
                </div>
              </fieldset>
              <div className="flex gap-4 pt-4">
                <Button type="button" variant="outline" onClick={() => setLocation("/admin/usuarios")} className="flex-1" disabled={salvando}>Cancelar</Button>
                <Button type="submit" className="flex-1 bg-accent text-accent-foreground hover:bg-accent/90" disabled={!canSubmit || (needsGlobalAcknowledgement && !session.globalAcknowledged) || (accessChanged && !session.accessConfirmed)}><Save className="mr-2 h-4 w-4" />{salvando ? "Salvando..." : "Salvar"}</Button>
              </div>
            </CardContent>
          </Card>
        </form>
      </main>
    </div>
  );
}
