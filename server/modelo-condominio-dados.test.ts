import { beforeEach, describe, expect, it, vi } from "vitest";
import { TRPCError } from "@trpc/server";
import { getTableName, type SQL } from "drizzle-orm";
import { MySqlDialect } from "drizzle-orm/mysql-core";
import {
  condominios,
  modelosDocumento,
  userCondominios,
  users,
} from "../drizzle/schema";
import { CHAVES_CADASTRO_CONDOMINIO } from "../shared/modelo-condominio";
import type { TenantActor } from "./tenant-guard";

type Row = Record<string, unknown>;
type QueryLog = {
  table: string;
  fields: string[] | null;
  sql: string;
  params: unknown[];
};
const state = vi.hoisted(() => ({
  current: {} as Row,
  condos: [] as Row[],
  models: [] as Row[],
  links: [] as Row[],
  queries: [] as QueryLog[],
  permission: true,
  unavailable: false,
  failure: false,
  permissionFailure: false,
  failureTable: null as string | null,
  dbFailure: false,
}));
const mocks = vi.hoisted(() => ({ getDb: vi.fn(), hasPermission: vi.fn() }));
vi.mock("./db", () => ({ getDb: mocks.getDb }));
vi.mock("./rbac", () => ({ hasPermission: mocks.hasPermission }));

import {
  listarCondominiosPreenchimento,
  obterDadosPreenchimento,
  validarContextoPreenchimento,
} from "./modelo-condominio-dados";

const actor = (role = "advogado"): TenantActor => ({
  id: 90,
  role,
  condominioId: 99,
  escopoCondominios: "todos",
});
const dialect = new MySqlDialect();
const secret = "SEGREDO-FICTICIO-NUNCA-RETORNAR";

/** Executa as condições parametrizadas reais do Drizzle antes de projetar a fixture. */
function matches(
  sql: string,
  params: unknown[],
  rows: Record<string, Row>
): boolean {
  let offset = 0;
  for (const match of sql.matchAll(
    /`([^`]+)`\.`([^`]+)`\s*(=\s*\?|in\s*\(([^)]*)\))/gi
  )) {
    const count = match[3].startsWith("=")
      ? 1
      : (match[4].match(/\?/g) ?? []).length;
    const values = params.slice(offset, offset + count);
    offset += count;
    if (!values.includes(rows[match[1]]?.[match[2]])) return false;
  }
  return true;
}

function fixtureDb() {
  return {
    select(fields?: Record<string, unknown>) {
      let table = "";
      let condition: SQL | undefined;
      let maximum = Infinity;
      const execute = async () => {
        if (state.failure || state.failureTable === table)
          throw new Error(secret);
        const compiled = condition
          ? dialect.sqlToQuery(condition)
          : { sql: "", params: [] };
        state.queries.push({
          table,
          fields: fields ? Object.keys(fields) : null,
          ...compiled,
        });
        const bags: Record<string, Row>[] =
          table === "users"
            ? Object.keys(state.current).length
              ? [{ users: state.current }]
              : []
            : table === "modelosDocumento"
              ? state.models.map(row => ({ modelosDocumento: row }))
              : table === "condominios"
                ? state.condos.map(row => ({ condominios: row }))
                : state.links.flatMap(link =>
                    state.condos
                      .filter(condo => condo.id === link.condominioId)
                      .map(condo => ({
                        userCondominios: link,
                        condominios: condo,
                      }))
                  );
        return bags
          .filter(bag => matches(compiled.sql, compiled.params, bag))
          .slice(0, maximum)
          .map(bag => {
            if (!fields) return { ...bag[table] };
            return Object.fromEntries(
              Object.entries(fields).map(([key, value]) => {
                const column = value as {
                  name: string;
                  table: typeof condominios;
                };
                return [key, bag[getTableName(column.table)]?.[column.name]];
              })
            );
          });
      };
      const query = {
        from(
          source:
            | typeof condominios
            | typeof modelosDocumento
            | typeof users
            | typeof userCondominios
        ) {
          table = getTableName(source);
          return query;
        },
        innerJoin() {
          return query;
        },
        where(value: SQL) {
          condition = value;
          return query;
        },
        orderBy() {
          return query;
        },
        limit(value: number) {
          maximum = value;
          return execute();
        },
        then(
          resolve: (rows: Row[]) => unknown,
          reject?: (reason: unknown) => unknown
        ) {
          return execute().then(resolve, reject);
        },
      };
      return query;
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  state.current = {
    id: 90,
    role: "advogado",
    condominioId: 99,
    isActive: 1,
    isDeleted: 0,
    escopoCondominios: "selecionados",
  };
  state.condos = [
    {
      id: 1,
      name: "Condomínio Alfa",
      statusCadastro: "ativo",
      cnpj: "00.000.000/0001-00",
      address: "Rua Fictícia",
      addressNumber: "10",
      addressComplement: null,
      neighborhood: "Centro",
      city: "Cidade Teste",
      state: "SP",
      zipCode: "00000-000",
      phone: "1100000000",
      email: "condo@example.test",
      managerName: "Gestor Fictício",
      managerEmail: "gestor@example.test",
      juridicoAdvogadoResponsavel: "Advogada Teste",
      juridicoAdvogadoOAB: "OAB/XX 0",
      juridicoVaraCompetente: "Vara Teste",
      juridicoForoComarca: "Comarca Teste",
      username: secret,
      password: secret,
      taxaJurosMensal: secret,
      juridicoObservacoes: secret,
      juridicoConvencaoUrl: secret,
    },
    {
      id: 2,
      name: "Condomínio Beta",
      statusCadastro: "ativo",
      cnpj: null,
      juridicoAdvogadoOAB: null,
    },
    {
      id: 3,
      name: "Condomínio Inativo",
      statusCadastro: "inativo",
      email: secret,
    },
    { id: 4, name: "Condomínio Fora", statusCadastro: "ativo", email: secret },
  ];
  state.models = [
    {
      id: 10,
      condominioId: null,
      ativo: 1,
      createdBy: 777,
      conteudoHtml:
        "<p>{{nomeCondominio}} {{cnpjCondominio}} {{enderecoCondominio}} {{nomeDevedor}}</p>",
      logoUrl: "fixture-logo",
      margemSuperior: 40,
    },
  ];
  state.links = [
    { userId: 90, condominioId: 1, isActive: 1 },
    { userId: 90, condominioId: 2, isActive: 1 },
    { userId: 90, condominioId: 3, isActive: 1 },
    { userId: 90, condominioId: 4, isActive: 0 },
  ];
  state.queries = [];
  state.permission = true;
  state.unavailable = false;
  state.failure = false;
  state.permissionFailure = false;
  state.failureTable = null;
  state.dbFailure = false;
  mocks.getDb.mockImplementation(async () => {
    if (state.dbFailure) throw new Error(secret);
    return state.unavailable ? null : fixtureDb();
  });
  mocks.hasPermission.mockImplementation(async () => {
    if (state.permissionFailure) throw new Error(secret);
    return state.permission;
  });
});

const condoQueries = () =>
  state.queries.filter(query => query.table === "condominios");
const modelQueries = () =>
  state.queries.filter(query => query.table === "modelosDocumento");
const operations = ["lista", "dados", "contexto"] as const;
function call(
  operation: (typeof operations)[number],
  current = actor(),
  modelId = 10,
  condoId = 1
) {
  if (operation === "lista")
    return listarCondominiosPreenchimento(current, modelId);
  if (operation === "dados")
    return obterDadosPreenchimento(current, modelId, condoId);
  return validarContextoPreenchimento(current, modelId, condoId);
}

describe("preenchimento — identidade, RBAC e carteira frescos", () => {
  it.each(["admin", "cobrador", "colaborador", "advogado"])(
    "admite somente perfil autorizado %s e confere RBAC",
    async role => {
      state.current.role = role;
      state.current.escopoCondominios =
        role === "admin" || role === "cobrador" ? null : "selecionados";
      await obterDadosPreenchimento(actor(role), 10, 1);
      expect(mocks.hasPermission).toHaveBeenCalledWith(
        90,
        role,
        "modelos_documento",
        "visualizar"
      );
      expect(state.queries[0].table).toBe("users");
    }
  );
  it.each(operations)(
    "nega síndico em %s antes de acessar modelo/cadastro",
    async operation => {
      state.current.role = "sindico";
      state.current.escopoCondominios = null;
      await expect(call(operation, actor("sindico"))).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
      expect(modelQueries()).toHaveLength(0);
      expect(mocks.hasPermission).not.toHaveBeenCalled();
    }
  );
  it.each(operations)(
    "nega sessão com role administrativa antiga em %s",
    async operation => {
      await expect(call(operation, actor("admin"))).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
      expect(modelQueries()).toHaveLength(0);
      expect(mocks.hasPermission).not.toHaveBeenCalled();
    }
  );
  it.each(["inativo", "excluido", "ausente", "id diferente"])(
    "falha fechado para identidade %s",
    async reason => {
      if (reason === "inativo") state.current.isActive = 0;
      if (reason === "excluido") state.current.isDeleted = 1;
      if (reason === "ausente") state.current = {};
      if (reason === "id diferente") state.current.id = 91;
      await expect(
        obterDadosPreenchimento(actor(), 10, 1)
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(modelQueries()).toHaveLength(0);
    }
  );
  it.each(operations)(
    "nega RBAC revogado em %s antes de consultar o modelo",
    async operation => {
      state.permission = false;
      await expect(call(operation)).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
      expect(modelQueries()).toHaveLength(0);
    }
  );
  it.each([null, "selecionados"])(
    "escopo %s é restrito aos vínculos, não ao principal nem à sessão antiga",
    async scope => {
      state.current.escopoCondominios = scope;
      expect(
        (await listarCondominiosPreenchimento(actor(), 10)).condominios
      ).toEqual([
        { id: 1, name: "Condomínio Alfa" },
        { id: 2, name: "Condomínio Beta" },
      ]);
      await expect(
        obterDadosPreenchimento(actor(), 10, 4)
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(
        validarContextoPreenchimento(actor(), 10, 99)
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    }
  );
  it.each(["advogado", "colaborador"])(
    "global %s só vê ativos e não vira admin",
    async role => {
      state.current.role = role;
      state.current.escopoCondominios = "todos";
      state.links = [];
      expect(
        (await listarCondominiosPreenchimento(actor(role), 10)).condominios.map(
          row => row.id
        )
      ).toEqual([1, 2, 4]);
      expect(mocks.hasPermission).toHaveBeenCalledWith(
        90,
        role,
        "modelos_documento",
        "visualizar"
      );
      await expect(
        obterDadosPreenchimento(actor(role), 10, 3)
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    }
  );
  it("revalida mudanças de escopo, vínculos e permissão entre chamadas", async () => {
    state.current.escopoCondominios = "todos";
    await obterDadosPreenchimento(actor(), 10, 4);
    state.current.escopoCondominios = "selecionados";
    await expect(
      validarContextoPreenchimento(actor(), 10, 4)
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    state.links = state.links.filter(row => row.condominioId !== 1);
    await expect(obterDadosPreenchimento(actor(), 10, 1)).rejects.toMatchObject(
      { code: "FORBIDDEN" }
    );
    state.permission = false;
    await expect(
      validarContextoPreenchimento(actor(), 10, 2)
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.hasPermission).toHaveBeenCalledTimes(4);
  });
  it.each(operations)(
    "carteira vazia em %s nega conservadoramente antes de acessar o modelo",
    async operation => {
      state.links = [];
      await expect(call(operation)).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
      expect(modelQueries()).toHaveLength(0);
      expect(condoQueries()).toHaveLength(0);
    }
  );
  it("global sem ativos também não acessa o modelo", async () => {
    state.current.escopoCondominios = "todos";
    state.condos = [];
    await expect(
      listarCondominiosPreenchimento(actor(), 10)
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(modelQueries()).toHaveLength(0);
  });
});

describe("preenchimento — modelo e fonte autorizados", () => {
  it("lista de modelo vinculado filtra ativo, carteira e vínculo no SQL", async () => {
    state.models[0].condominioId = 2;
    expect(await listarCondominiosPreenchimento(actor(), 10)).toEqual({
      modeloId: 10,
      condominioVinculadoId: 2,
      condominios: [{ id: 2, name: "Condomínio Beta" }],
    });
    const query = condoQueries()[0];
    expect(query.fields).toEqual(["id", "name"]);
    expect(query.sql).toMatch(/`statusCadastro` = \?/);
    expect(query.sql).toMatch(/`id` in/);
    expect(query.sql).toMatch(/`id` = \?/);
    expect(query.params).toContain("ativo");
    expect(query.params).toContain(2);
  });
  it.each(["dados", "contexto"] as const)(
    "modelo vinculado não permite outro condomínio nem para admin em %s",
    async operation => {
      state.current.role = "admin";
      state.current.escopoCondominios = null;
      state.models[0].condominioId = 2;
      await expect(
        call(operation, actor("admin"), 10, 1)
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(condoQueries()).toHaveLength(0);
    }
  );
  it("modelo de outra carteira não concede acesso ao autor de createdBy", async () => {
    state.models[0].condominioId = 4;
    state.models[0].createdBy = 90;
    await expect(
      listarCondominiosPreenchimento(actor(), 10)
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(condoQueries()).toHaveLength(0);
  });
  it.each(operations)(
    "modelo inativo ou ausente é negado em %s",
    async operation => {
      state.models[0].ativo = 0;
      await expect(call(operation)).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
      state.models = [];
      await expect(call(operation)).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
      expect(condoQueries()).toHaveLength(0);
    }
  );
  it("admin ignora somente a carteira e lista exclusivamente ativos", async () => {
    state.current.role = "admin";
    state.current.escopoCondominios = null;
    state.links = [];
    const result = await listarCondominiosPreenchimento(actor("admin"), 10);
    expect(result.condominios.map(row => row.id)).toEqual([1, 2, 4]);
    expect(condoQueries()[0].fields).toEqual(["id", "name"]);
    expect(condoQueries()[0].params).toEqual(["ativo"]);
  });
  it.each(["dados", "contexto"] as const)(
    "admin não aceita condomínio inativo/inexistente em %s",
    async operation => {
      state.current.role = "admin";
      state.current.escopoCondominios = null;
      await expect(
        call(operation, actor("admin"), 10, 3)
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(
        call(operation, actor("admin"), 10, 987)
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    }
  );
  it("admin também nega modelo vinculado a cadastro inativo na lista", async () => {
    state.current.role = "admin";
    state.current.escopoCondominios = null;
    state.models[0].condominioId = 3;
    await expect(
      listarCondominiosPreenchimento(actor("admin"), 10)
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it.each([0, -1, 1.5, NaN, Infinity])(
    "IDs inválidos %s são negados antes da leitura do modelo",
    async id => {
      await expect(
        obterDadosPreenchimento(actor(), id, 1)
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(
        obterDadosPreenchimento(actor(), 10, id)
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(modelQueries()).toHaveLength(0);
    }
  );
});

describe("preenchimento — DTO, projeções e apenas leitura", () => {
  it("consulta só dependências das variáveis presentes e nunca transporta o cadastro inteiro", async () => {
    const result = await obterDadosPreenchimento(actor(), 10, 1);
    expect(result).toEqual({
      modeloId: 10,
      condominioId: 1,
      nomeCondominio: "Condomínio Alfa",
      valores: {
        nomeCondominio: "Condomínio Alfa",
        cnpjCondominio: "00.000.000/0001-00",
        enderecoCondominio:
          "Rua Fictícia, 10 — Centro — Cidade Teste / SP — CEP 00000-000",
      },
      camposAusentes: [],
    });
    expect(condoQueries()[0].fields?.sort()).toEqual(
      [
        "id",
        "name",
        "cnpj",
        "address",
        "addressNumber",
        "addressComplement",
        "neighborhood",
        "city",
        "state",
        "zipCode",
      ].sort()
    );
    expect(JSON.stringify(result)).not.toContain(secret);
    expect(Object.keys(result.valores)).not.toContain("nomeDevedor");
  });
  it.each([
    ["condominio", "name"],
    ["nomeCondominio", "name"],
    ["cnpjCondominio", "cnpj"],
    ["logradouroCondominio", "address"],
    ["numeroCondominio", "addressNumber"],
    ["complementoCondominio", "addressComplement"],
    ["bairroCondominio", "neighborhood"],
    ["cidadeCondominio", "city"],
    ["ufCondominio", "state"],
    ["cepCondominio", "zipCode"],
    ["telefoneCondominio", "phone"],
    ["emailCondominio", "email"],
    ["nomeGestorCondominio", "managerName"],
    ["emailGestorCondominio", "managerEmail"],
    ["advogadoResponsavel", "juridicoAdvogadoResponsavel"],
    ["oabAdvogado", "juridicoAdvogadoOAB"],
    ["varaCompetente", "juridicoVaraCompetente"],
    ["foroComarca", "juridicoForoComarca"],
  ])("projeta somente a dependência de %s", async (variable, column) => {
    state.models[0].conteudoHtml = `{{${variable}}}`;
    const result = await obterDadosPreenchimento(actor(), 10, 1);
    expect(Object.keys(result.valores)).toEqual([variable]);
    expect(condoQueries()[0].fields?.sort()).toEqual(
      Array.from(new Set(["id", "name", column])).sort()
    );
  });
  it("variáveis inexistentes e representação manual não fazem lookup adicional nem expõem o gestor", async () => {
    state.models[0].conteudoHtml =
      "{{representanteLegal}} {{assinatura}} {{nomeResponsavel}} {{emailDevedor}}";
    expect((await obterDadosPreenchimento(actor(), 10, 1)).valores).toEqual({});
    expect(condoQueries()[0].fields).toEqual(["id", "name"]);
  });
  it("aliases e caixa normalizada só retornam variáveis presentes, deduplicadas", async () => {
    state.models[0].conteudoHtml =
      "{{ CONDOMINIO }} {{nomeCondominio}} {{condominio}}";
    const result = await obterDadosPreenchimento(actor(), 10, 1);
    expect(result.valores).toEqual({
      condominio: "Condomínio Alfa",
      nomeCondominio: "Condomínio Alfa",
    });
    expect(condoQueries()[0].fields).toEqual(["id", "name"]);
  });
  it("campos ausentes ficam vazios no próximo condomínio, sem conservar valor anterior", async () => {
    state.models[0].conteudoHtml = "{{cnpjCondominio}} {{oabAdvogado}}";
    const first = await obterDadosPreenchimento(actor(), 10, 1);
    const second = await obterDadosPreenchimento(actor(), 10, 2);
    expect(first.camposAusentes).toEqual([]);
    expect(second.valores).toEqual({ cnpjCondominio: "", oabAdvogado: "" });
    expect(second.camposAusentes).toEqual(["cnpjCondominio", "oabAdvogado"]);
    expect(first.valores.cnpjCondominio).toBe("00.000.000/0001-00");
  });
  it("validação contextual só consulta id do cadastro e devolve modelo sem reescrever valores humanos", async () => {
    const edited = Object.freeze({
      nomeCondominio: "Texto revisado pelo profissional",
    });
    const snapshot = structuredClone(state.condos);
    const model = await validarContextoPreenchimento(actor(), 10, 1);
    expect(model).toEqual(state.models[0]);
    expect(model.logoUrl).toBe("fixture-logo");
    expect(condoQueries()[0].fields).toEqual(["id"]);
    expect(edited.nomeCondominio).toBe("Texto revisado pelo profissional");
    expect(state.condos).toEqual(snapshot);
  });
  it("filtro da leitura inclui id, ativo e carteira antes da projeção", async () => {
    await obterDadosPreenchimento(actor(), 10, 1);
    const query = condoQueries()[0];
    expect(query.sql).toMatch(/`statusCadastro` = \?/);
    expect(query.sql).toMatch(/`id` = \?/);
    expect(query.sql).toMatch(/`id` in/);
    expect(query.params).toContain("ativo");
  });
  it.each(operations)(
    "erros de banco em %s são estáticos, sem payload nem cause original",
    async operation => {
      state.failure = true;
      const error = await call(operation).catch(reason => reason);
      expect(error).toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
      expect(error.message).not.toContain(secret);
      expect(error.cause).toBeUndefined();
    }
  );
  it("falha de RBAC não expõe conteúdo pessoal do erro original", async () => {
    state.permissionFailure = true;
    const error = await obterDadosPreenchimento(actor(), 10, 1).catch(
      reason => reason
    );
    expect(error.message).not.toContain(secret);
    expect(error.cause).toBeUndefined();
    expect(modelQueries()).toHaveLength(0);
  });
  it("banco indisponível falha fechado sem fallback nem escrita", async () => {
    state.unavailable = true;
    await expect(obterDadosPreenchimento(actor(), 10, 1)).rejects.toMatchObject(
      { code: "INTERNAL_SERVER_ERROR" }
    );
    expect(state.queries).toHaveLength(0);
  });
});

describe("preenchimento — contexto opcional e revalidação para PDF", () => {
  it.each(["admin", "cobrador", "colaborador", "advogado"])(
    "NULL aceita compartilhado sem cadastro para %s sem consultar valores",
    async role => {
      state.current.role = role;
      state.current.escopoCondominios =
        role === "admin" || role === "cobrador" ? null : "selecionados";
      state.models[0].conteudoHtml =
        "<p>{{nomeDevedor}} {{representanteLegal}} {{assinatura}}</p>";
      const result = await validarContextoPreenchimento(actor(role), 10, null);
      expect(result).toEqual(state.models[0]);
      expect(condoQueries()).toHaveLength(0);
      expect(modelQueries()[0].fields).toBeNull();
      expect(mocks.hasPermission).toHaveBeenCalledWith(
        90,
        role,
        "modelos_documento",
        "visualizar"
      );
    }
  );
  it.each(CHAVES_CADASTRO_CONDOMINIO)(
    "NULL exige seleção para variável %s inclusive caixa normalizada",
    async variable => {
      state.models[0].conteudoHtml = `<p>{{ ${variable.toUpperCase()} }}</p>`;
      await expect(
        validarContextoPreenchimento(actor(), 10, null)
      ).rejects.toMatchObject({
        code: "BAD_REQUEST",
        message: "Selecione um condomínio para preencher este modelo.",
        cause: undefined,
      });
      expect(condoQueries()).toHaveLength(0);
    }
  );
  it.each(["admin", "advogado"])(
    "NULL exige seleção para vinculado mesmo sem variáveis para %s",
    async role => {
      state.current.role = role;
      state.current.escopoCondominios =
        role === "admin" ? null : "selecionados";
      state.models[0].condominioId = 1;
      state.models[0].conteudoHtml = "<p>Texto manual</p>";
      await expect(
        validarContextoPreenchimento(actor(role), 10, null)
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
      expect(condoQueries()).toHaveLength(0);
    }
  );
  it("NULL não permite contornar identidade, RBAC, carteira, modelo inativo ou vínculo", async () => {
    state.models[0].conteudoHtml = "Texto manual";
    state.permission = false;
    await expect(
      validarContextoPreenchimento(actor(), 10, null)
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(modelQueries()).toHaveLength(0);
    state.permission = true;
    state.models[0].ativo = 0;
    await expect(
      validarContextoPreenchimento(actor(), 10, null)
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    state.models[0].ativo = 1;
    state.models[0].condominioId = 4;
    await expect(
      validarContextoPreenchimento(actor(), 10, null)
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    state.models[0].condominioId = null;
    state.links = [];
    await expect(
      validarContextoPreenchimento(actor(), 10, null)
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(condoQueries()).toHaveLength(0);
  });
  it("admin sem carteira ainda nega modelo inativo com NULL", async () => {
    state.current.role = "admin";
    state.current.escopoCondominios = null;
    state.links = [];
    state.models[0].conteudoHtml = "Texto manual";
    state.models[0].ativo = 0;
    await expect(
      validarContextoPreenchimento(actor("admin"), 10, null)
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(condoQueries()).toHaveLength(0);
  });
  it("reconsulta vínculo e atividade do modelo entre autofill e PDF", async () => {
    await obterDadosPreenchimento(actor(), 10, 1);
    state.models[0].condominioId = 2;
    await expect(
      validarContextoPreenchimento(actor(), 10, 1)
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(
      (await validarContextoPreenchimento(actor(), 10, 2)).condominioId
    ).toBe(2);
    state.models[0].ativo = 0;
    await expect(
      validarContextoPreenchimento(actor(), 10, 2)
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(modelQueries()).toHaveLength(4);
    for (const query of modelQueries()) {
      expect(query.sql).toMatch(/`id` = \?/);
      expect(query.sql).toMatch(/`ativo` = \?/);
      expect(query.params).toEqual([10, 1]);
    }
  });
  it("PDF revalida atividade do cadastro sem consultar valores", async () => {
    state.current.role = "admin";
    state.current.escopoCondominios = null;
    await obterDadosPreenchimento(actor("admin"), 10, 1);
    state.condos[0].statusCadastro = "inativo";
    await expect(
      validarContextoPreenchimento(actor("admin"), 10, 1)
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(condoQueries().at(-1)?.fields).toEqual(["id"]);
  });
  it.each(operations)(
    "legado não concede acesso pelo principal ou autoria em %s",
    async operation => {
      state.current.escopoCondominios = null;
      state.current.condominioId = 4;
      state.models[0].createdBy = 90;
      state.models[0].condominioId = 4;
      await expect(
        call(operation, { ...actor(), condominioId: 4 }, 10, 4)
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(condoQueries()).toHaveLength(0);
    }
  );
  it.each(operations)(
    "compartilhado aceita fonte da carteira independente da autoria em %s",
    async operation => {
      state.models[0].createdBy = null;
      const result = await call(operation, actor(), 10, 2);
      if (operation === "lista")
        expect(result).toMatchObject({
          condominioVinculadoId: null,
          condominios: [{ id: 1 }, { id: 2 }],
        });
      if (operation === "dados")
        expect(result).toMatchObject({
          condominioId: 2,
          nomeCondominio: "Condomínio Beta",
        });
      if (operation === "contexto") expect(result).toEqual(state.models[0]);
    }
  );
});

describe("preenchimento — fronteira de dados e falhas sanitizadas", () => {
  it("todos os campos jurídicos de cadastro são exatamente os quatro homologados", async () => {
    state.models[0].conteudoHtml =
      "{{advogadoResponsavel}} {{oabAdvogado}} {{varaCompetente}} {{foroComarca}} {{juridicoObservacoes}} {{juridicoTribunalEstado}} {{juridicoConvencaoUrl}} {{juridicoRegimentoUrl}}";
    const result = await obterDadosPreenchimento(actor(), 10, 1);
    expect(result.valores).toEqual({
      advogadoResponsavel: "Advogada Teste",
      oabAdvogado: "OAB/XX 0",
      varaCompetente: "Vara Teste",
      foroComarca: "Comarca Teste",
    });
    expect(condoQueries()[0].fields).toEqual([
      "id",
      "name",
      "juridicoAdvogadoResponsavel",
      "juridicoAdvogadoOAB",
      "juridicoVaraCompetente",
      "juridicoForoComarca",
    ]);
    expect(JSON.stringify(result)).not.toContain(secret);
  });
  it("lista e dados não consultam configuração visual nem autoria do modelo", async () => {
    await listarCondominiosPreenchimento(actor(), 10);
    await obterDadosPreenchimento(actor(), 10, 1);
    expect(modelQueries().map(query => query.fields)).toEqual([
      ["id", "condominioId", "ativo", "conteudoHtml"],
      ["id", "condominioId", "ativo", "conteudoHtml"],
    ]);
  });
  it.each(operations)(
    "IDs inseguros, textuais ou ausentes não consultam o modelo em %s",
    async operation => {
      for (const id of [Number.MAX_SAFE_INTEGER + 1, "10", null, undefined]) {
        const result =
          operation === "lista"
            ? listarCondominiosPreenchimento(actor(), id as number)
            : operation === "dados"
              ? obterDadosPreenchimento(actor(), id as number, 1)
              : validarContextoPreenchimento(actor(), id as number, 1);
        await expect(result).rejects.toMatchObject({ code: "FORBIDDEN" });
      }
      expect(modelQueries()).toHaveLength(0);
    }
  );
  it("dados não aceita NULL e contexto não trata undefined como NULL", async () => {
    await expect(
      obterDadosPreenchimento(actor(), 10, null as unknown as number)
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      validarContextoPreenchimento(actor(), 10, undefined as unknown as null)
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(state.queries).toHaveLength(0);
  });
  it.each(["modelosDocumento", "condominios"])(
    "falhas tardias na tabela %s não vazam nem registram conteúdo original",
    async table => {
      state.current.role = "admin";
      state.current.escopoCondominios = null;
      state.failureTable = table;
      const log = vi.spyOn(console, "log").mockImplementation(() => {});
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
      try {
        for (const operation of operations) {
          const error = await call(operation, actor("admin")).catch(
            reason => reason
          );
          expect(error).toMatchObject({
            code: "INTERNAL_SERVER_ERROR",
            message: "Não foi possível verificar o preenchimento do modelo.",
            cause: undefined,
          });
          expect(String(error.stack)).not.toContain(secret);
        }
        expect(log).not.toHaveBeenCalled();
        expect(warn).not.toHaveBeenCalled();
        expect(errorLog).not.toHaveBeenCalled();
      } finally {
        log.mockRestore();
        warn.mockRestore();
        errorLog.mockRestore();
      }
    }
  );
  it("exceção na aquisição do banco não preserva erro original", async () => {
    state.dbFailure = true;
    const error = await obterDadosPreenchimento(actor(), 10, 1).catch(
      reason => reason
    );
    expect(error).toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
      cause: undefined,
    });
    expect(error.message).not.toContain(secret);
    expect(String(error.stack)).not.toContain(secret);
  });
  it("TRPCError externo de RBAC também não atravessa a fronteira com PII ou cause", async () => {
    mocks.hasPermission.mockRejectedValue(
      new TRPCError({
        code: "FORBIDDEN",
        message: secret,
        cause: new Error(secret),
      })
    );
    const error = await obterDadosPreenchimento(actor(), 10, 1).catch(
      reason => reason
    );
    expect(error).toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
      message: "Não foi possível verificar o preenchimento do modelo.",
      cause: undefined,
    });
    expect(String(error.stack)).not.toContain(secret);
    expect(modelQueries()).toHaveLength(0);
  });
});
