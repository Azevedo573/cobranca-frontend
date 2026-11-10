export type UserRole = "admin" | "sindico" | "cobrador" | "colaborador" | "advogado";
export type EscopoCondominios = "todos" | "selecionados";
export type UserFormData = {
  name: string;
  email: string;
  password: string;
  role: UserRole;
  escopoCondominios: EscopoCondominios | null;
  condominioId: string;
  condominioIds: string[];
  isActive: 0 | 1;
};
export type UserFormSession = {
  userId: number | null;
  data: UserFormData;
  baseline: UserFormData | null;
  dirty: Partial<Record<keyof UserFormData, boolean>>;
  hydrated: boolean;
  globalAcknowledged: boolean;
  accessConfirmed: boolean;
};
export type UserFormSource = {
  id: number;
  name: string | null;
  email: string | null;
  role: UserRole;
  escopoCondominios?: EscopoCondominios | null;
  condominioId: number | null;
  isActive: number;
};
export type VinculoSource = { condominioId: number; isActive: number };
export type AccessPayload = {
  role?: UserRole;
  escopoCondominios?: EscopoCondominios;
  condominioId?: number | null;
  condominioIds?: number[];
};
export type UpdateUserPayload = AccessPayload & {
  name?: string;
  email?: string;
  password?: string;
  isActive?: 0 | 1;
};
export type CreateUserPayload = AccessPayload & {
  name: string;
  email: string;
  password: string;
  role: UserRole;
  isActive: 0 | 1;
};
export const isScopeEligible = (role: string) => role === "advogado" || role === "colaborador";
export const isGlobalScope = (data: UserFormData) => isScopeEligible(data.role) && data.escopoCondominios === "todos";
const accessKeys = ["role", "escopoCondominios", "condominioId", "condominioIds"] as const;
const sameIds = (a: string[], b: string[]) => {
  const sortedB = [...b].sort();
  return a.length === b.length && [...a].sort().every((id, index) => id === sortedB[index]);
};
const sameField = (a: UserFormData, b: UserFormData, key: keyof UserFormData) =>
  key === "condominioIds" ? sameIds(a.condominioIds, b.condominioIds) : a[key] === b[key];

export function createUserFormSession(userId: number | null): UserFormSession {
  return {
    userId,
    data: { name: "", email: "", password: "", role: "cobrador", escopoCondominios: null, condominioId: "", condominioIds: [], isActive: 1 },
    baseline: null,
    dirty: {},
    hydrated: userId === null,
    globalAcknowledged: false,
    accessConfirmed: false,
  };
}

// Wait for both queries; a refresh or late response must never overwrite edits.
export function hydrateUserForm(session: UserFormSession, user: UserFormSource | null | undefined, vinculos: VinculoSource[] | undefined): UserFormSession {
  if (session.hydrated || !user || user.id !== session.userId || vinculos === undefined) return session;
  const baseline: UserFormData = {
    name: user.name ?? "", email: user.email ?? "", password: "", role: user.role,
    escopoCondominios: user.escopoCondominios ?? null,
    condominioId: user.condominioId ? String(user.condominioId) : "",
    condominioIds: vinculos.filter(v => v.isActive === 1).map(v => String(v.condominioId)),
    isActive: user.isActive === 1 ? 1 : 0,
  };
  const data = { ...baseline, ...Object.fromEntries(Object.entries(session.data).filter(([key]) => session.dirty[key as keyof UserFormData])) };
  return { ...session, baseline, data, hydrated: true };
}

export function changeUserForm(session: UserFormSession, patch: Partial<UserFormData>): UserFormSession {
  const keys = Object.keys(patch) as (keyof UserFormData)[];
  const accessTouched = keys.some(key => accessKeys.some(accessKey => accessKey === key));
  return {
    ...session,
    data: { ...session.data, ...patch },
    dirty: { ...session.dirty, ...Object.fromEntries(keys.map(key => [key, true])) },
    ...(accessTouched ? { globalAcknowledged: false, accessConfirmed: false } : {}),
  };
}

export function changeUserRole(session: UserFormSession, role: UserRole): UserFormSession {
  if (role === session.data.role) return session;
  const eligible = isScopeEligible(role);
  const scope = eligible
    ? (isScopeEligible(session.data.role) ? session.data.escopoCondominios : session.userId === null ? "todos" : "selecionados")
    : null;
  return changeUserForm(session, {
    role, escopoCondominios: scope,
    ...(scope === "todos" || isGlobalScope(session.data) ? { condominioIds: [], condominioId: "" } : {}),
  });
}

export function changeUserScope(session: UserFormSession, scope: EscopoCondominios): UserFormSession {
  if (!isScopeEligible(session.data.role) || scope === session.data.escopoCondominios) return session;
  return changeUserForm(session, { escopoCondominios: scope, ...(scope === "todos" ? { condominioIds: [], condominioId: "" } : {}) });
}

export function changeUserPrincipal(session: UserFormSession, id: string): UserFormSession {
  if (id === session.data.condominioId) return session;
  return changeUserForm(session, {
    condominioId: id,
    ...(isScopeEligible(session.data.role) && session.data.escopoCondominios === null ? { escopoCondominios: "selecionados" } : {}),
    ...(!isGlobalScope(session.data) && id && !session.data.condominioIds.includes(id)
      ? { condominioIds: [...session.data.condominioIds, id] } : {}),
  });
}

export function changeUserVinculo(session: UserFormSession, id: string, checked: boolean): UserFormSession {
  if (isGlobalScope(session.data)) return session;
  const ids = checked ? Array.from(new Set([...session.data.condominioIds, id])) : session.data.condominioIds.filter(value => value !== id);
  if (sameIds(ids, session.data.condominioIds)) return session;
  return changeUserForm(session, { condominioIds: ids,
    ...(session.data.condominioId === id && !checked ? { condominioId: "" } : {}),
    ...(isScopeEligible(session.data.role) && session.data.escopoCondominios === null ? { escopoCondominios: "selecionados" } : {}),
  });
}

export function hasAccessChanges(session: UserFormSession): boolean {
  return !!session.baseline && accessKeys.some(key => !sameField(session.data, session.baseline!, key));
}
export function requiresGlobalAcknowledgement(session: UserFormSession): boolean {
  return isGlobalScope(session.data) && (session.userId === null || hasAccessChanges(session));
}
export function canSubmitUserForm(session: UserFormSession, options: { pending: boolean; loading: boolean; error: boolean; actorIsAdmin: boolean }): boolean {
  return session.hydrated && !options.pending && !options.loading && !options.error && options.actorIsAdmin;
}

export function validateUserForm(session: UserFormSession, activeIds: number[]): string | null {
  const data = session.data;
  if (!session.hydrated) return "Aguarde o carregamento dos dados e vínculos do usuário.";
  if (!data.name.trim()) return "Nome é obrigatório";
  if (!data.email.trim()) return "E-mail é obrigatório";
  if (session.userId === null && !data.password.trim()) return "Senha é obrigatória para novos usuários";
  if (data.password.trim() && (data.password.length < 10 || data.password.length > 128 || !/[a-z]/.test(data.password) || !/[A-Z]/.test(data.password) || !/\d/.test(data.password))) return "A senha deve ter de 10 a 128 caracteres, letra maiúscula, minúscula e número";
  const changed = hasAccessChanges(session);
  if (session.userId === null || changed) {
    if (!isScopeEligible(data.role) && data.escopoCondominios !== null) return "Este perfil não permite escopo global profissional.";
    if (isScopeEligible(data.role) && data.escopoCondominios === null && session.userId === null) return "Escolha o acesso aos condomínios.";
    if (isGlobalScope(data)) {
      if (data.condominioIds.length) return "O acesso global não deve conter vínculos individuais.";
    } else {
      if (data.role !== "admin" && !data.condominioIds.length) return "Informe ao menos um condomínio autorizado para este usuário";
      if (new Set(data.condominioIds).size !== data.condominioIds.length) return "Não repita condomínios autorizados.";
      if (data.condominioIds.some(id => !activeIds.includes(Number(id)))) return "Selecione somente condomínios ativos e válidos.";
      if (data.condominioId && !data.condominioIds.includes(data.condominioId)) return "O condomínio principal deve constar entre os condomínios autorizados";
    }
    if (data.condominioId && !activeIds.includes(Number(data.condominioId))) return "Escolha um condomínio principal ativo e válido.";
  }
  if (requiresGlobalAcknowledgement(session) && !session.globalAcknowledged) return "Confirme que está ciente do acesso a todos os condomínios ativos atuais e futuros.";
  if (changed && !session.accessConfirmed) return "Confirme administrativamente a alteração de perfil, alcance ou condomínios.";
  return null;
}

function buildAccessPayload(session: UserFormSession): AccessPayload {
  const { data, baseline } = session;
  const payload: AccessPayload = {};
  if (!baseline || data.role !== baseline.role) payload.role = data.role;
  const scopeChanged = !baseline || data.escopoCondominios !== baseline.escopoCondominios;
  if (isScopeEligible(data.role) && data.escopoCondominios !== null && scopeChanged) payload.escopoCondominios = data.escopoCondominios;
  if (!baseline || !sameIds(data.condominioIds, baseline.condominioIds) || (scopeChanged && data.escopoCondominios !== null)) payload.condominioIds = isGlobalScope(data) ? [] : data.condominioIds.map(Number);
  if (!baseline || data.condominioId !== baseline.condominioId) {
    payload.condominioId = data.condominioId ? Number(data.condominioId)
      : !isGlobalScope(data) && data.role !== "admin" && data.condominioIds.length ? Number(data.condominioIds[0]) : null;
  }
  return payload;
}
export function buildCreateUserPayload(session: UserFormSession): CreateUserPayload {
  return { ...buildAccessPayload(session), name: session.data.name, email: session.data.email, password: session.data.password, role: session.data.role, isActive: session.data.isActive };
}
export function buildUpdateUserPayload(session: UserFormSession): UpdateUserPayload {
  if (!session.baseline) throw new Error("Dados do usuário ainda não carregados.");
  const payload: UpdateUserPayload = buildAccessPayload(session);
  if (session.data.name !== session.baseline.name) payload.name = session.data.name;
  if (session.data.email !== session.baseline.email) payload.email = session.data.email;
  if (session.data.isActive !== session.baseline.isActive) payload.isActive = session.data.isActive;
  if (session.data.password.trim()) payload.password = session.data.password;
  return payload;
}

export function userFormInvalidationTargets(accessChanged: boolean, statusChanged: boolean): string[] {
  const targets = ["users.list", "users.listByCondominio", "users.getById", "users.getVinculosCondominios"];
  if (accessChanged || statusChanged) targets.push("auth.me", "condominios.list");
  return targets;
}

export function userScopeLabel(role: string, scope: EscopoCondominios | null | undefined): string {
  if (role === "admin") return "Global administrativo";
  if (isScopeEligible(role) && scope === "todos") return "Todos os ativos (atuais e futuros)";
  if (isScopeEligible(role) && scope === "selecionados") return "Selecionados";
  return "Legado — acesso preservado";
}
