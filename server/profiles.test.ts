/**
 * profiles.test.ts
 * Testes unitários para o módulo de Perfis e Permissões (RBAC).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock do banco de dados ───────────────────────────────────────────────────
const mockDb = {
  select: vi.fn().mockReturnThis(),
  from: vi.fn().mockReturnThis(),
  where: vi.fn().mockReturnThis(),
  orderBy: vi.fn().mockReturnThis(),
  limit: vi.fn().mockReturnThis(),
  insert: vi.fn().mockReturnThis(),
  values: vi.fn().mockReturnThis(),
  update: vi.fn().mockReturnThis(),
  set: vi.fn().mockReturnThis(),
  delete: vi.fn().mockReturnThis(),
  leftJoin: vi.fn().mockReturnThis(),
};

vi.mock("./db", () => ({
  getDb: vi.fn().mockResolvedValue(mockDb),
}));

vi.mock("../drizzle/schema", () => ({
  profiles: { id: "id", nome: "nome", descricao: "descricao", cor: "cor", isSystem: "isSystem" },
  profilePermissions: { id: "id", profileId: "profileId", modulo: "modulo", acao: "acao", permitido: "permitido" },
  userProfileHistory: { id: "id", userId: "userId", profileId: "profileId", atribuidoPorId: "atribuidoPorId" },
  users: { id: "id", name: "name", email: "email", role: "role", profileId: "profileId", isActive: "isActive", condominioId: "condominioId" },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((a, b) => ({ eq: [a, b] })),
  and: vi.fn((...args) => ({ and: args })),
  isNull: vi.fn((a) => ({ isNull: a })),
  inArray: vi.fn((a, b) => ({ inArray: [a, b] })),
}));

// ─── Testes ───────────────────────────────────────────────────────────────────

describe("MODULOS e ACOES", () => {
  it("deve exportar 15 módulos", async () => {
    const { MODULOS } = await import("./db-profiles");
    expect(MODULOS).toHaveLength(15);
  });

  it("deve exportar 6 ações", async () => {
    const { ACOES } = await import("./db-profiles");
    expect(ACOES).toHaveLength(6);
  });

  it("todos os módulos devem ter id, label e grupo", async () => {
    const { MODULOS } = await import("./db-profiles");
    for (const m of MODULOS) {
      expect(m).toHaveProperty("id");
      expect(m).toHaveProperty("label");
      expect(m).toHaveProperty("grupo");
      expect(m.id.length).toBeGreaterThan(0);
    }
  });

  it("todas as ações devem ter id e label", async () => {
    const { ACOES } = await import("./db-profiles");
    for (const a of ACOES) {
      expect(a).toHaveProperty("id");
      expect(a).toHaveProperty("label");
    }
  });
});

describe("PERFIS_PADRAO", () => {
  it("deve ter 6 perfis padrão", async () => {
    const { PERFIS_PADRAO } = await import("./db-profiles");
    expect(PERFIS_PADRAO).toHaveLength(6);
  });

  it("Administrador Master deve ter permissoes = 'all'", async () => {
    const { PERFIS_PADRAO } = await import("./db-profiles");
    const master = PERFIS_PADRAO.find((p) => p.nome === "Administrador Master");
    expect(master).toBeDefined();
    expect(master?.permissoes).toBe("all");
  });

  it("todos os perfis devem ter nome, descricao e cor", async () => {
    const { PERFIS_PADRAO } = await import("./db-profiles");
    for (const p of PERFIS_PADRAO) {
      expect(p.nome.length).toBeGreaterThan(0);
      expect(p.descricao.length).toBeGreaterThan(0);
      expect(p.cor).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
});

describe("getAllProfiles", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.select.mockReturnThis();
    mockDb.from.mockReturnThis();
    mockDb.orderBy.mockResolvedValue([
      { id: 1, nome: "Supervisor", cor: "#f59e0b", isSystem: 0 },
      { id: 2, nome: "Operador", cor: "#3b82f6", isSystem: 0 },
    ]);
  });

  it("deve retornar lista de perfis", async () => {
    const { getAllProfiles } = await import("./db-profiles");
    const result = await getAllProfiles();
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(2);
    expect(result[0].nome).toBe("Supervisor");
  });
});

describe("getProfileById", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.select.mockReturnThis();
    mockDb.from.mockReturnThis();
    mockDb.where.mockReturnThis();
    mockDb.limit.mockResolvedValue([{ id: 1, nome: "Supervisor", cor: "#f59e0b", isSystem: 0 }]);
  });

  it("deve retornar perfil existente", async () => {
    const { getProfileById } = await import("./db-profiles");
    const result = await getProfileById(1);
    expect(result).not.toBeNull();
    expect(result?.nome).toBe("Supervisor");
  });
});

describe("getPermissionsByProfile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.select.mockReturnThis();
    mockDb.from.mockReturnThis();
    mockDb.where.mockResolvedValue([
      { id: 1, profileId: 1, modulo: "dashboard", acao: "visualizar", permitido: 1 },
      { id: 2, profileId: 1, modulo: "cobrancas", acao: "criar", permitido: 1 },
    ]);
  });

  it("deve retornar permissões do perfil", async () => {
    const { getPermissionsByProfile } = await import("./db-profiles");
    const result = await getPermissionsByProfile(1);
    expect(result).toHaveLength(2);
    expect(result[0].modulo).toBe("dashboard");
    expect(result[0].acao).toBe("visualizar");
  });
});

describe("setPermissions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.delete.mockReturnThis();
    mockDb.where.mockResolvedValue(undefined);
    mockDb.insert.mockReturnThis();
    mockDb.values.mockResolvedValue({ insertId: 10 });
  });

  it("deve salvar permissões e retornar success", async () => {
    const { setPermissions } = await import("./db-profiles");
    const result = await setPermissions(1, [
      { modulo: "dashboard", acao: "visualizar", permitido: 1 },
      { modulo: "cobrancas", acao: "criar", permitido: 1 },
    ]);
    expect(result).toEqual({ success: true });
  });

  it("deve funcionar com lista vazia de permissões", async () => {
    const { setPermissions } = await import("./db-profiles");
    const result = await setPermissions(1, []);
    expect(result).toEqual({ success: true });
  });
});
