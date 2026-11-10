import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";

const mocks = vi.hoisted(() => ({
  consultas: [] as any[][],
  usuarios: [] as any[], vinculos: [] as any[], permissoes: [] as any[],
  origem: vi.fn(), pdf: vi.fn(), boleto: vi.fn(), config: vi.fn(), storage: vi.fn(), audit: vi.fn(),
  acordo: vi.fn(), parcelas: vi.fn(), devedor: vi.fn(), condominio: vi.fn(),
}));
vi.mock("./db", async (original) => {
  const real = await original<typeof import("./db")>();
  const { users, userCondominios, profilePermissions } = await import("../drizzle/schema");
  const { MySqlDialect } = await import("drizzle-orm/mysql-core");
  const dialect = new MySqlDialect();
  return {
    ...real,
    getDb: async () => ({ select: (projection?: Record<string, any>) => {
      let table: any, condition: any, max: number | undefined, resultado: Promise<any[]> | undefined;
      const executar = () => resultado ??= Promise.resolve().then(() => {
        const rows = table === users ? mocks.usuarios
          : table === userCondominios ? mocks.vinculos
          : table === profilePermissions ? mocks.permissoes : null;
        // Consultas de autorização não consomem a fila dos recursos documentais.
        if (rows === null) return mocks.consultas.shift() ?? [];
        if (!condition) throw new Error("Fixture de autorização exige filtro SQL.");
        const { sql, params } = dialect.sqlToQuery(condition);
        const clauses = sql.replace(/[()]/g, "").split(/\s+and\s+/i);
        const columns = clauses.map(clause => {
          const match = /^`(?:users|userCondominios|condominios|profile_permissions)`\.`([^`]+)` = \?$/.exec(clause);
          if (!match) throw new Error(`Filtro de fixture não suportado: ${clause}`);
          return match[1];
        });
        if (table === users && !columns.includes("id")) {
          throw new Error("Consulta de identidade da fixture exige users.id.");
        }
        const filtrados = rows.filter(row => columns.every((column, index) => row[column] === params[index]));
        return filtrados.slice(0, max).map(row => projection
          ? Object.fromEntries(Object.entries(projection).map(([alias, column]) => [alias, row[column.name]]))
          : { ...row });
      });
      const query: any = {
        from: (source: any) => { table = source; return query; },
        where: (predicate: any) => { condition = predicate; return query; },
        innerJoin: () => query,
        limit: (count: number) => { max = count; return executar(); },
        then: (resolve: any, reject: any) => executar().then(resolve, reject),
      };
      return query;
    } }),
  };
});
vi.mock("./db-acordos", async (original) => ({ ...await original<typeof import("./db-acordos")>(), getAcordoById: mocks.acordo, getParcelasByAcordo: mocks.parcelas }));
vi.mock("./db-devedores", async (original) => ({ ...await original<typeof import("./db-devedores")>(), getDevedorById: mocks.devedor }));
vi.mock("./db-condominios", async (original) => ({ ...await original<typeof import("./db-condominios")>(), getCondominioById: mocks.condominio }));
vi.mock("./origem-divida-acordo", async (original) => ({ ...await original<typeof import("./origem-divida-acordo")>(), carregarOrigemDividaAcordo: mocks.origem }));
vi.mock("./plano-acordo-pdf", async (original) => ({ ...await original<typeof import("./plano-acordo-pdf")>(), gerarPlanoCompletoAcordoPDF: mocks.pdf }));
vi.mock("./boleto-pdf", async (original) => ({ ...await original<typeof import("./boleto-pdf")>(), gerarBoletoPDF: mocks.boleto }));
vi.mock("./db-configuracao-boleto", async (original) => ({ ...await original<typeof import("./db-configuracao-boleto")>(), getConfiguracaoBoleto: mocks.config }));
vi.mock("./storage", () => ({ storagePut: mocks.storage }));
vi.mock("./audit", async (original) => ({ ...await original<typeof import("./audit")>(), logAudit: mocks.audit }));
// Esta suíte isola origem documental/tenancy. A nova guarda bancária com locks
// e evidências é exercitada integralmente em btg-canais-cnab*.test.ts.
vi.mock("./btg-canais-cnab", async (original) => ({
  ...await original<typeof import("./btg-canais-cnab")>(),
  validarReapresentacaoBoletoCnab: vi.fn().mockResolvedValue(undefined),
}));
import { appRouter } from "./routers";
import { montarOrigemDividaAcordo } from "./origem-divida-acordo";

const usuarioFixture = (id: number, role: string, profileId: number | null = null) => ({
  id, role, condominioId: 1, profileId, isActive: 1, isDeleted: 0, escopoCondominios: null,
  openId: `documento-${id}`, name: "Teste", email: "teste@example.com", loginMethod: "custom",
  createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date(),
});
const contexto = (role: string, id = 901): TrpcContext => ({
  user: { id, role, condominioId: 1, openId: `documento-${id}`, name: "Teste", email: "teste@example.com", loginMethod: "custom", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() } as TrpcContext["user"],
  req: { headers: {}, protocol: "https" } as TrpcContext["req"], res: {} as TrpcContext["res"],
});

beforeEach(() => {
  vi.clearAllMocks(); mocks.consultas.length = 0;
  mocks.usuarios = [usuarioFixture(901, "sindico"), usuarioFixture(902, "advogado", 1),
    usuarioFixture(903, "sindico"), usuarioFixture(904, "sindico"), usuarioFixture(905, "sindico")];
  mocks.vinculos = [[901, [1]], [903, [1, 2]], [904, [1]], [905, [2]]]
    .flatMap(([userId, ids]) => (ids as number[]).map(condominioId => ({
      userId, condominioId, isActive: 1, statusCadastro: "ativo",
    })));
  mocks.permissoes = [{ profileId: 1, modulo: "acordos", acao: "exportar", permitido: 0 }];
});

describe("exportação de demonstrativo — RBAC e tenancy reais", () => {
  it("recusa advogado sem permissão de exportar antes de carregar origem ou gerar PDF", async () => {
    await expect(appRouter.createCaller(contexto("advogado", 902)).acordos.gerarPlanoCompletoPDF({ acordoId: 20 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.origem).not.toHaveBeenCalled();
    expect(mocks.pdf).not.toHaveBeenCalled();
    expect(mocks.storage).not.toHaveBeenCalled();
  });
  it("oculta acordo fora dos vínculos mesmo para usuário com acesso condominial próprio", async () => {
    mocks.consultas.push([{ id: 20, devedorId: 4, condominioId: 2 }]);
    await expect(appRouter.createCaller(contexto("sindico")).acordos.gerarPlanoCompletoPDF({ acordoId: 20 })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(mocks.origem).not.toHaveBeenCalled();
    expect(mocks.pdf).not.toHaveBeenCalled();
    expect(mocks.storage).not.toHaveBeenCalled();
  });
  it("permite condomínio adicional vinculado e repassa a mesma origem ao PDF e à auditoria", async () => {
    const data = new Date("2026-11-28T12:00:00Z");
    const origem = montarOrigemDividaAcordo([{ cobrancaId: 1, valorOriginal: 10000, titulo: "Cobrança", vencimento: data }], []);
    mocks.consultas.push([{ id: 20, devedorId: 4, condominioId: 2 }]);
    mocks.acordo.mockResolvedValue({ id: 20, condominioId: 2, devedorId: 4, totalAmount: 5000, agreedAmount: 5000, installments: 1, paymentFrequency: "mensal", status: "ativo", valorPago: 0, notes: null, createdAt: data });
    mocks.parcelas.mockResolvedValue([{ id: 1, installmentNumber: 1, amount: 5000, dueDate: data, status: "pendente", paymentDate: null }]);
    mocks.devedor.mockResolvedValue({ name: "Teste", unitNumber: "101", bloco: "A", cpfCnpj: null });
    mocks.condominio.mockResolvedValue({ name: "Condomínio 2", cnpj: null });
    mocks.origem.mockResolvedValue(origem);
    mocks.pdf.mockResolvedValue(Buffer.from("%PDF-teste"));
    mocks.storage.mockResolvedValue({ url: "https://example.com/documento.pdf" });
    const result = await appRouter.createCaller(contexto("sindico", 903)).acordos.gerarPlanoCompletoPDF({ acordoId: 20 });
    expect(mocks.pdf.mock.calls[0][0].origemDivida).toBe(origem);
    expect(mocks.origem).toHaveBeenCalledWith(20);
    expect(result.quantidadeDividas).toBe(1);
    expect(result.fileName).toContain("demonstrativo-completo-acordo-20");
    expect(mocks.audit.mock.calls[0][1]).toMatchObject({ condominioId: 2, metadata: { documento: "demonstrativo_completo_informativo", quantidadeDividas: 1 } });
  });
  it("bloqueia também boleto individual e lote fora dos condomínios vinculados", async () => {
    mocks.consultas.push([{ parcelasAcordo: { id: 5 }, acordos: { id: 20 } }], [{ id: 20, condominioId: 2 }]);
    const caller = appRouter.createCaller(contexto("sindico", 904));
    await expect(caller.acordos.gerarBoletoPDFParcela({ parcelaId: 5 })).rejects.toMatchObject({ code: "NOT_FOUND" });
    mocks.consultas.push([{ id: 20, condominioId: 2 }]);
    await expect(caller.acordos.gerarBoletosLoteAcordo({ acordoId: 20 })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(mocks.origem).not.toHaveBeenCalled();
    expect(mocks.boleto).not.toHaveBeenCalled();
  });
  it("repasse idêntico da origem no individual e no lote sem modificar valores, Pix ou parcelas", async () => {
    const data = new Date("2026-11-28T12:00:00Z");
    const origem = montarOrigemDividaAcordo([{ cobrancaId: 1, valorOriginal: 10000, titulo: "Cobrança", vencimento: data }], []);
    const acordo = { id: 20, devedorId: 4, condominioId: 2, agreedAmount: 12000 };
    const parcelas = [{ id: 5, acordoId: 20, installmentNumber: 1, amount: 5000, dueDate: data, status: "pendente", nossoNumero: "1000000024", pixCopiaCola: "PIX-DO-BANCO" },
      { id: 6, acordoId: 20, installmentNumber: 2, amount: 7000, dueDate: data, status: "pendente", nossoNumero: "1000000025", pixCopiaCola: "PIX-DO-BANCO-2" }];
    const antes = structuredClone(parcelas);
    mocks.config.mockResolvedValue({ nomeBeneficiario: "Teste", banco: "208", nomeBanco: "BTG", agencia: "0050", digitoAgencia: "0", conta: "432260", digitoConta: "0", carteira: "1", convenio: "11051861158", especieDocumento: "DD", aceite: "N", localPagamento: "Teste" });
    mocks.devedor.mockResolvedValue({ name: "Pagador Teste", unitNumber: "101" });
    mocks.condominio.mockResolvedValue({ name: "Condomínio 2" });
    mocks.origem.mockResolvedValue(origem);
    mocks.boleto.mockResolvedValue(Buffer.from("%PDF-teste"));
    mocks.storage.mockResolvedValue({ url: "https://example.com/boleto.pdf" });
    const caller = appRouter.createCaller(contexto("sindico", 905));
    mocks.consultas.push([{ parcelasAcordo: parcelas[0], acordos: acordo }], [{ id: 20, condominioId: 2 }], parcelas);
    const individual = await caller.acordos.gerarBoletoPDFParcela({ parcelaId: 5 });
    expect(individual).toMatchObject({ valor: 5000, pixCopiaCola: "PIX-DO-BANCO", nossoNumero: "1000000024", vencimento: data.toISOString() });
    expect(mocks.boleto.mock.calls[0][0].origemDivida).toBe(origem);
    mocks.consultas.push([{ id: 20, condominioId: 2 }], [acordo], parcelas);
    const lote = await caller.acordos.gerarBoletosLoteAcordo({ acordoId: 20 });
    expect(mocks.boleto.mock.calls.slice(1).every(([dados]) => dados.origemDivida === origem)).toBe(true);
    expect(mocks.origem).toHaveBeenCalledTimes(2); // uma leitura por geração, não por parcela do lote
    expect(lote.boletos.map(b => b.valor)).toEqual([5000, 7000]);
    expect(parcelas).toEqual(antes);
  });
});
