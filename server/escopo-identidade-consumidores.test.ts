import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { SignJWT } from "jose";
import { z } from "zod";

const clientFixture = vi.hoisted(() => ({
  currentUser: null as any, list: [] as any[], updatedAt: 0, permissions: null as any,
  slots: [] as any[], cursor: 0, effects: [] as (() => void)[], storage: new Map<string, string>(),
  invalidations: { auth: vi.fn(), list: vi.fn(), permissions: vi.fn() },
  queryOptions: {} as any, mutationListener: undefined as any,
}));
vi.mock("react", () => ({
  useState: (initial: any) => {
    const index = clientFixture.cursor++;
    if (!(index in clientFixture.slots)) clientFixture.slots[index] = typeof initial === "function" ? initial() : initial;
    return [clientFixture.slots[index], (value: any) => { clientFixture.slots[index] = typeof value === "function" ? value(clientFixture.slots[index]) : value; }];
  },
  useRef: (initial: any) => {
    const index = clientFixture.cursor++;
    return clientFixture.slots[index] ?? (clientFixture.slots[index] = { current: initial });
  },
  useCallback: (callback: any) => callback,
  useMemo: (callback: any) => callback(),
  useEffect: (callback: any, deps: any[]) => {
    const index = clientFixture.cursor++;
    const previous = clientFixture.slots[index];
    if (!previous || deps.some((value, index) => value !== previous[index])) clientFixture.effects.push(callback);
    clientFixture.slots[index] = deps;
  },
}));
vi.mock("@/_core/hooks/useAuth", () => ({ useAuth: () => ({ user: clientFixture.currentUser }) }));
vi.mock("@tanstack/react-query", () => ({ useQueryClient: () => ({ getMutationCache: () => ({ subscribe: (callback: any) => { clientFixture.mutationListener = callback; return () => {}; } }) }) }));
vi.mock("@/const", () => ({ getLoginUrl: () => "/login" }));
vi.mock("@/lib/trpc", () => {
  const utils = {
    auth: { me: { invalidate: clientFixture.invalidations.auth, setData: vi.fn() } },
    condominios: { list: { invalidate: clientFixture.invalidations.list } },
    profiles: { getMyPermissions: { invalidate: clientFixture.invalidations.permissions } },
  };
  const refetch = vi.fn(async () => { clientFixture.updatedAt = Date.now() + 1000; });
  return { trpc: {
    useUtils: () => utils,
    auth: {
      me: { useQuery: (_input: any, options: any) => { clientFixture.queryOptions = options; return { data: clientFixture.currentUser, isLoading: false, error: null, refetch }; } },
      logout: { useMutation: () => ({ isPending: false, error: null, mutateAsync: vi.fn() }) },
    },
    condominios: { list: { useQuery: () => ({ data: clientFixture.list, dataUpdatedAt: clientFixture.updatedAt, isLoading: false, isFetching: false, refetch }) } },
    profiles: { getMyPermissions: { useQuery: () => ({ data: clientFixture.permissions, dataUpdatedAt: clientFixture.updatedAt, isLoading: false, refetch }) } },
  } };
});

const fixture = vi.hoisted(() => ({
  user: { id: 701, openId: "mock-owner", name: "Pessoa Fictícia", role: "advogado", condominioId: 90, escopoCondominios: "todos", profileId: 11, isActive: 1, isDeleted: 0 } as Record<string, any>,
  condominios: [{ id: 90, statusCadastro: "inativo" }, { id: 91, statusCadastro: "ativo" }, { id: 92, statusCadastro: "ativo" }],
  links: [{ userId: 701, condominioId: 91, isActive: 1 }],
  permissions: [{ profileId: 11, modulo: "cobrancas", acao: "visualizar", permitido: 1 }, { profileId: 12, modulo: "cobrancas", acao: "visualizar", permitido: 0 }],
  updates: [] as Record<string, any>[],
  post: vi.fn(), upsert: vi.fn(), refresh: vi.fn(),
}));
vi.mock("./_core/env", () => ({ ENV: { cookieSecret: "mock-only-secret-at-least-32-bytes", appId: "mock-app", ownerOpenId: "mock-owner", oAuthServerUrl: "https://oauth.invalid" } }));
vi.mock("axios", () => ({ default: { create: () => ({ post: fixture.post }) } }));
vi.mock("../drizzle/schema", () => {
  const table = (name: string, fields: string[]) => Object.fromEntries([["table", name], ...fields.map(field => [field, `${name}.${field}`])]);
  return {
    users: table("users", ["id", "openId", "role", "condominioId", "isActive", "isDeleted", "escopoCondominios", "profileId"]),
    condominios: table("condominios", ["id", "statusCadastro"]),
    userCondominios: table("userCondominios", ["userId", "condominioId", "isActive"]),
    profilePermissions: table("profilePermissions", ["profileId"]),
    devedores: {}, cobrancas: {}, acordos: {},
  };
});
vi.mock("drizzle-orm", () => ({
  eq: (field: string, value: unknown) => ({ field, value }),
  and: (...conditions: unknown[]) => ({ conditions }),
  inArray: (field: string, values: unknown[]) => ({ field, values }),
}));
vi.mock("./db", () => {
  function matches(row: any, filter: any): boolean {
    if (!filter) return true;
    if (filter.conditions) return filter.conditions.every((entry: any) => matches(row, entry));
    const value = row[filter.field];
    return filter.values ? filter.values.includes(value) : value === filter.value;
  }
  function qualified(table: string, row: any) { return Object.fromEntries(Object.entries(row).map(([key, value]) => [`${table}.${key}`, value])); }
  const adapter = {
    select: (projection?: Record<string, string>) => {
      let table = ""; let filter: any; let joined = false;
      const evaluate = () => {
        const input = table === "users" ? [fixture.user] : table === "condominios" ? fixture.condominios : table === "profilePermissions" ? fixture.permissions : fixture.links;
        return input.map(row => {
          let qualifiedRow = qualified(table, row);
          if (joined) {
            const condominium = fixture.condominios.find(item => item.id === (row as any).condominioId);
            qualifiedRow = { ...qualifiedRow, ...qualified("condominios", condominium ?? {}) };
          }
          return { row, qualifiedRow };
        }).filter(item => matches(item.qualifiedRow, filter)).map(({ row, qualifiedRow }) => projection ? Object.fromEntries(Object.entries(projection).map(([key, field]) => [key, qualifiedRow[field]])) : { ...row });
      };
      const query = {
        from: (value: any) => { table = value.table; return query; },
        where: (value: any) => { filter = value; return query; },
        innerJoin: () => { joined = true; return query; },
        limit: async (count: number) => evaluate().slice(0, count),
        then: (resolve: any, reject: any) => Promise.resolve(evaluate()).then(resolve, reject),
      };
      return query;
    },
    update: () => ({ set: (value: any) => ({ where: async (filter: any) => { fixture.updates.push({ value, filter }); } }) }),
  };
  return {
    getDb: vi.fn(async () => adapter),
    getUserByOpenId: vi.fn(async (openId: string) => openId === fixture.user.openId ? { ...fixture.user } : undefined),
    upsertUser: fixture.upsert,
    refreshUserLastSignedIn: fixture.refresh,
  };
});

import { verifyCustomToken } from "./_core/auth-helper";
import { sdk } from "./_core/sdk";
import { createContext } from "./_core/context";
import { COOKIE_NAME } from "@shared/const";
import { hasPermission, invalidatePermCache, requirePermission } from "./rbac";
import { adminProcedure, condominioAccessProcedure } from "./middleware";
import { router } from "./_core/trpc";
import { assertCondominioAccess } from "./tenant-guard";
import { useAdminCondominio } from "../client/src/hooks/useAdminCondominio";
import { usePermissions } from "../client/src/hooks/usePermissions";

let useActualAuth: typeof import("../client/src/_core/hooks/useAuth").useAuth;
beforeAll(async () => {
  useActualAuth = (await vi.importActual<typeof import("../client/src/_core/hooks/useAuth")>("../client/src/_core/hooks/useAuth")).useAuth;
});

async function token(payload: Record<string, unknown>) {
  return new SignJWT(payload).setProtectedHeader({ alg: "HS256" }).setExpirationTime("1h")
    .sign(new TextEncoder().encode("mock-only-secret-at-least-32-bytes"));
}
function ctx(overrides: Record<string, any> = {}) {
  return { user: { ...fixture.user, ...overrides }, req: { headers: {} }, res: {} } as any;
}
const consumer = router({
  admin: adminProcedure.query(({ ctx }) => ctx.user.role),
  tenant: condominioAccessProcedure.input(z.object({ condominioId: z.number().optional() }).optional()).query(({ ctx }) => ({ role: ctx.user.role, id: ctx.user.condominioId })),
  action: requirePermission("cobrancas", "visualizar").query(({ ctx }) => ({ role: ctx.user.role, scope: ctx.user.escopoCondominios })),
});

beforeEach(() => {
  Object.assign(fixture.user, { role: "advogado", condominioId: 90, escopoCondominios: "todos", profileId: 11, isActive: 1, isDeleted: 0 });
  fixture.links = [{ userId: 701, condominioId: 91, isActive: 1 }];
  fixture.updates.length = 0;
  fixture.post.mockReset().mockRejectedValue(new Error("Network forbidden in test"));
  fixture.upsert.mockReset(); fixture.refresh.mockReset();
  invalidatePermCache(701);
  clientFixture.currentUser = { ...fixture.user };
  clientFixture.list = [{ id: 91 }, { id: 92 }]; clientFixture.updatedAt = Date.now() + 1000;
  clientFixture.permissions = { profileId: 11, profileNome: "Perfil Fictício", permissoes: { cobrancas: { visualizar: true } } };
  clientFixture.slots = []; clientFixture.cursor = 0; clientFixture.effects = []; clientFixture.storage.clear();
  Object.values(clientFixture.invalidations).forEach(mock => mock.mockReset());
  const localStorage = {
    getItem: (key: string) => clientFixture.storage.get(key) ?? null,
    setItem: (key: string, value: string) => clientFixture.storage.set(key, value),
    removeItem: (key: string) => clientFixture.storage.delete(key),
  };
  vi.stubGlobal("localStorage", localStorage);
  vi.stubGlobal("window", { localStorage, location: { pathname: "/mock", href: "" } });
});

describe("JWT assinado: identidade fresca, nunca concessão de role/carteira", () => {
  it.each(["advogado", "colaborador"])("%s explícito autentica apesar da preferência antiga inativa", async role => {
    fixture.user.role = role;
    const signed = await token({ authType: "custom", userId: 701, condominioId: 90, role: "admin", escopoCondominios: "todos" });
    const user = await verifyCustomToken(signed);
    expect(user).toMatchObject({ id: 701, role, condominioId: 90 });
    expect(fixture.updates).toHaveLength(1);
    await expect(assertCondominioAccess(user!, 90)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(fixture.post).not.toHaveBeenCalled();
  });
  it("selecionado pode autenticar por identidade, mas token não amplia carteira", async () => {
    fixture.user.escopoCondominios = "selecionados";
    const user = await verifyCustomToken(await token({ authType: "custom", userId: 701, condominioId: 92, escopoCondominios: "todos" }));
    expect(user).toMatchObject({ escopoCondominios: "selecionados" });
    await expect(assertCondominioAccess(user!, 91)).resolves.toBeUndefined();
    await expect(assertCondominioAccess(user!, 92)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("carteira explícita vazia não transforma autenticação em autorização", async () => {
    fixture.user.escopoCondominios = "selecionados"; fixture.links = [];
    const user = await verifyCustomToken(await token({ authType: "custom", userId: 701, condominioId: 90 }));
    expect(user).not.toBeNull();
    await expect(assertCondominioAccess(user!, 91)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("NULL legado mantém rejeição da preferência inativa mesmo com claim global", async () => {
    fixture.user.escopoCondominios = null;
    expect(await verifyCustomToken(await token({ authType: "custom", userId: 701, condominioId: 90, escopoCondominios: "todos" }))).toBeNull();
    expect(fixture.updates).toHaveLength(0);
  });
  it("NULL legado mantém vínculo ativo e nega outro ativo", async () => {
    fixture.user.escopoCondominios = null;
    expect(await verifyCustomToken(await token({ authType: "custom", userId: 701, condominioId: 91 }))).not.toBeNull();
    expect(await verifyCustomToken(await token({ authType: "custom", userId: 701, condominioId: 92 }))).toBeNull();
  });
  it.each(["sindico", "cobrador"])("%s não recebe exceção explícita de identidade", async role => {
    fixture.user.role = role;
    expect(await verifyCustomToken(await token({ authType: "custom", userId: 701, condominioId: 90 }))).toBeNull();
  });
  it.each([{ isActive: 0 }, { isDeleted: 1 }])("custom nega usuário revogado %j", async change => {
    Object.assign(fixture.user, change);
    expect(await verifyCustomToken(await token({ authType: "custom", userId: 701, condominioId: 91 }))).toBeNull();
  });
  it("token administrativo antigo não autentica admin rebaixado", async () => {
    expect(await verifyCustomToken(await token({ authType: "admin", userId: 701, role: "admin" }))).toBeNull();
  });
});

describe("OAuth e contexto", () => {
  it("refresh do owner existente não usa upsert nem restaura role", async () => {
    const signed = await sdk.createSessionToken("mock-owner", { name: "Pessoa Fictícia" });
    const user = await sdk.authenticateRequest({ headers: { cookie: `${COOKIE_NAME}=${signed}` } } as any);
    expect(user.role).toBe("advogado");
    expect(fixture.refresh).toHaveBeenCalledWith(701, expect.any(Date));
    expect(fixture.upsert).not.toHaveBeenCalled(); expect(fixture.post).not.toHaveBeenCalled();
  });
  it.each([{ isActive: 0 }, { isDeleted: 1 }])("OAuth e contexto negam usuário %j", async change => {
    Object.assign(fixture.user, change);
    const signed = await sdk.createSessionToken("mock-owner", { name: "Pessoa Fictícia" });
    const req = { headers: { cookie: `${COOKIE_NAME}=${signed}` } } as any;
    await expect(sdk.authenticateRequest(req)).rejects.toThrow("inactive or deleted");
    expect((await createContext({ req, res: {} as any })).user).toBeNull();
    expect(fixture.refresh).not.toHaveBeenCalled(); expect(fixture.upsert).not.toHaveBeenCalled();
  });
});

describe("prefixos e cache RBAC", () => {
  it("global mantém role profissional e não concede ação sem perfil", async () => {
    fixture.user.profileId = null;
    await expect(consumer.createCaller(ctx()).action()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(consumer.createCaller(ctx()).admin()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("revogação e troca de perfil são observadas antes do cache positivo", async () => {
    expect(await hasPermission(701, "advogado", "cobrancas", "visualizar")).toBe(true);
    fixture.user.profileId = 12;
    expect(await hasPermission(701, "advogado", "cobrancas", "visualizar")).toBe(false);
    fixture.user.profileId = 11;
    expect(await hasPermission(701, "advogado", "cobrancas", "visualizar")).toBe(true);
    fixture.user.profileId = null;
    expect(await hasPermission(701, "advogado", "cobrancas", "visualizar")).toBe(false);
  });
  it("prefixo RBAC usa perfil atual mesmo quando ctx mantém perfil antigo", async () => {
    const stale = ctx();
    await expect(consumer.createCaller(stale).action()).resolves.toEqual({ role: "advogado", scope: "todos" });
    fixture.user.profileId = null;
    await expect(consumer.createCaller(stale).action()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("ctx admin rebaixado não conserva bypass em nenhum prefixo", async () => {
    const stale = ctx({ role: "admin" });
    for (const name of ["admin", "action", "tenant"] as const) {
      await expect(consumer.createCaller(stale)[name]()).rejects.toMatchObject({ code: "FORBIDDEN" });
    }
  });
  it("admin ativo preserva modelo administrativo e nenhum global profissional o fabrica", async () => {
    fixture.user.role = "admin"; fixture.user.escopoCondominios = null;
    await expect(consumer.createCaller(ctx()).admin()).resolves.toBe("admin");
    await expect(consumer.createCaller(ctx()).tenant()).resolves.toEqual({ role: "admin", id: 90 });
  });
  it("global com preferência inativa recebe contexto único ativo sem sentinela admin", async () => {
    await expect(consumer.createCaller(ctx()).tenant()).resolves.toEqual({ role: "advogado", id: 91 });
  });
  it("NULL conserva rejeição do principal inativo no prefixo legado", async () => {
    fixture.user.escopoCondominios = null;
    await expect(consumer.createCaller(ctx()).tenant()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it.each([{ isActive: 0 }, { isDeleted: 1 }])("prefixos negam contexto revogado %j", async change => {
    const stale = ctx(); Object.assign(fixture.user, change);
    for (const name of ["admin", "action", "tenant"] as const) {
      await expect(consumer.createCaller(stale)[name]()).rejects.toMatchObject({ code: "FORBIDDEN" });
    }
  });
});

function renderHook<T>(hook: () => T): T {
  clientFixture.cursor = 0; clientFixture.effects = [];
  const result = hook();
  for (const effect of clientFixture.effects) effect();
  return result;
}

describe("hooks de identidade e carteira sem armazenamento de autorização", () => {
  it("useAuth remove projeção antiga, não persiste usuário e reconsulta no foco", () => {
    clientFixture.storage.set("manus-runtime-user-info", JSON.stringify({ role: "admin", escopoCondominios: "todos" }));
    expect(renderHook(useActualAuth).user).toMatchObject({ role: "advogado" });
    expect(clientFixture.storage.has("manus-runtime-user-info")).toBe(false);
    expect(clientFixture.storage.size).toBe(0);
    expect(clientFixture.queryOptions.refetchOnWindowFocus).toBe("always");
  });
  it("mutation de usuários/perfis invalida auth, carteira e permissões", () => {
    renderHook(useActualAuth);
    Object.values(clientFixture.invalidations).forEach(mock => mock.mockReset());
    clientFixture.mutationListener({ type: "updated", action: { type: "success" }, mutation: { options: { mutationKey: [["users", "update"]] } } });
    Object.values(clientFixture.invalidations).forEach(mock => expect(mock).toHaveBeenCalledOnce());
  });
  it("troca de identidade/perfil invalida as listas dependentes", () => {
    renderHook(useActualAuth);
    Object.values(clientFixture.invalidations).forEach(mock => mock.mockReset());
    clientFixture.currentUser = { ...clientFixture.currentUser, profileId: null };
    renderHook(useActualAuth);
    expect(clientFixture.invalidations.list).toHaveBeenCalledOnce();
    expect(clientFixture.invalidations.permissions).toHaveBeenCalledOnce();
  });
  it("seleção antiga não autorizada é substituída; setter recusa outro ID", () => {
    clientFixture.storage.set("selected_condominio_id_701", "90");
    renderHook(useAdminCondominio);
    let state = renderHook(useAdminCondominio);
    expect(state.condominioId).toBe(91); expect(state.isAdmin).toBe(false);
    state.setSelectedCondominioId(999);
    state = renderHook(useAdminCondominio);
    expect(state.condominioId).toBeNull();
    expect(clientFixture.storage.get("selected_condominio_id_701")).not.toBe("999");
  });
  it("carteira vazia limpa seleção e preferência persistida", () => {
    renderHook(useAdminCondominio); renderHook(useAdminCondominio);
    clientFixture.list = [];
    expect(renderHook(useAdminCondominio).condominioId).toBeNull();
    expect(clientFixture.storage.has("selected_condominio_id_701")).toBe(false);
  });
  it("troca de identidade não reaproveita lista/seleção da conta anterior", () => {
    renderHook(useAdminCondominio); expect(renderHook(useAdminCondominio).condominioId).toBe(91);
    clientFixture.currentUser = { ...clientFixture.currentUser, id: 702, condominioId: 92 };
    clientFixture.updatedAt = Date.now() - 1000;
    const changed = renderHook(useAdminCondominio);
    expect(changed.condominioId).toBeNull(); expect(changed.condominios).toBeUndefined();
    clientFixture.list = [{ id: 93 }]; clientFixture.updatedAt = Date.now() + 1000;
    renderHook(useAdminCondominio);
    expect(renderHook(useAdminCondominio).condominioId).toBe(93);
  });
  it("global não fabrica flags administrativas nem matriz de outro perfil", () => {
    let permissions = renderHook(usePermissions);
    expect(permissions.isAdmin).toBe(false); expect(permissions.canManageUsers).toBe(false);
    expect(permissions.can("cobrancas", "visualizar")).toBe(true);
    clientFixture.currentUser = { ...clientFixture.currentUser, profileId: 12 };
    permissions = renderHook(usePermissions);
    expect(permissions.can("cobrancas", "visualizar")).toBe(false);
    clientFixture.currentUser = { ...clientFixture.currentUser, profileId: null };
    expect(renderHook(usePermissions).can("cobrancas", "visualizar")).toBe(false);
  });
  it("matriz antiga não é usada por outra identidade nem para papel não elegível", () => {
    expect(renderHook(usePermissions).can("cobrancas", "visualizar")).toBe(true);
    clientFixture.currentUser = { ...clientFixture.currentUser, id: 702 };
    clientFixture.updatedAt = Date.now() - 1000;
    expect(renderHook(usePermissions).can("cobrancas", "visualizar")).toBe(false);
    clientFixture.currentUser = { ...clientFixture.currentUser, role: "user" };
    expect(renderHook(usePermissions).can("cobrancas", "visualizar")).toBe(false);
  });
});
