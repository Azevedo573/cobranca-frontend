import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
const require = createRequire(import.meta.url);
const { argumentosValidos, planoEstrutural, DDL, CONFIRMACAO } = require("../scripts/provisionar-btg-conta-manual-producao.cjs") as {
  argumentosValidos: (args: string[]) => boolean;
  planoEstrutural: (columns: Array<Record<string, unknown>>) => Array<{ campo: string; sql: string }>;
  DDL: Record<string, string>;
  CONFIRMACAO: string;
};
const base = () => [
  { name: "origemCadastro", type: "enum('api','manual_sandbox')", dataType: "enum", nullable: "NO", defaultValue: "api", extra: "" },
  ...["id", "btgIntegracaoId", "accountId", "agencia", "numero", "documentoBeneficiario"].map(name => ({ name })),
];
const complete = () => [
  ...base().map(c => c.name === "origemCadastro" ? { ...c, type: "enum('api','manual_sandbox','manual_producao')" } : c),
  { name: "confirmadoPorId", type: "int", dataType: "int", nullable: "YES", defaultValue: null, extra: "" },
  { name: "confirmadoEm", type: "timestamp", dataType: "timestamp", nullable: "YES", defaultValue: null, extra: "" },
];

describe("BTG — provisionador estrutural exclusivo de conta manual Produção", () => {
  it("check é leitura e apply exige confirmação antes de conexão", () => {
    expect(argumentosValidos(["--check"])).toBe(false);
    expect(argumentosValidos(["--apply", `--confirmar=${CONFIRMACAO}`])).toBe(true);
    expect(() => argumentosValidos(["--apply"])).toThrow("Confirmação");
  });
  it.each([[], ["--check", "--apply"], ["--check", "--check"], ["--check", "--force"], ["--check", `--confirmar=${CONFIRMACAO}`], ["--apply", "--confirmar=OUTRA"]])("recusa argumentos inválidos %j", args => {
    expect(() => argumentosValidos(args)).toThrow();
  });
  it("gera apenas três ampliações específicas sem DML ou DDL jurídico", () => {
    const plano = planoEstrutural(base());
    expect(plano.map(p => p.campo)).toEqual(["origemCadastro", "confirmadoPorId", "confirmadoEm"]);
    for (const etapa of plano) {
      expect(etapa.sql).toMatch(/^ALTER TABLE `btgContasRecebedoras` /);
      expect(etapa.sql).not.toMatch(/\b(INSERT|UPDATE|DELETE|DROP|TRUNCATE|CREATE)\b|juridico|tarefas|demandas/i);
    }
    expect(Object.keys(DDL)).toHaveLength(3);
  });
  it("preserva enum api/manual_sandbox, valores anteriores e contas existentes", () => {
    expect(DDL.origemCadastro).toContain("enum('api','manual_sandbox','manual_producao') NOT NULL DEFAULT 'api'");
    expect(DDL.confirmadoPorId).toContain("int NULL");
    expect(DDL.confirmadoEm).toContain("timestamp NULL DEFAULT NULL");
  });
  it("estrutura completa é idempotente e parcial gera somente colunas ausentes", () => {
    expect(planoEstrutural(complete())).toEqual([]);
    expect(planoEstrutural(complete().filter(c => c.name !== "confirmadoEm")).map(p => p.campo)).toEqual(["confirmadoEm"]);
  });
  it("não repara automaticamente enum ou coluna incompatível", () => {
    expect(() => planoEstrutural(base().map(c => c.name === "origemCadastro" ? { ...c, type: "enum('api','manual_sandbox','outra')" } : c))).toThrow("recusada");
    expect(() => planoEstrutural(complete().map(c => c.name === "confirmadoPorId" ? { ...c, dataType: "varchar" } : c))).toThrow("incompatível");
    expect(() => planoEstrutural(complete().map(c => c.name === "confirmadoEm" ? { ...c, extra: "on update CURRENT_TIMESTAMP" } : c))).toThrow("incompatível");
  });
  it("recusa tabela ausente e contexto estrutural incompleto", () => {
    expect(() => planoEstrutural([])).toThrow("ausente");
    expect(() => planoEstrutural(base().filter(c => c.name !== "accountId"))).toThrow("incompleta");
  });
});
