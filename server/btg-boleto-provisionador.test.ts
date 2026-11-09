import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
const require = createRequire(import.meta.url);
const {
  TABELAS,
  CONFIRMACAO,
  comandos,
  planejar,
} = require("../scripts/provisionar-btg-boletos-cancelamentos.cjs");
const sql = readFileSync(resolve("drizzle/0103_modern_luke_cage.sql"), "utf8");
const nomes = Object.keys(TABELAS);
function estrutura(nome: string) {
  const s = TABELAS[nome];
  return {
    colunas: s.colunas.map(
      ([COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE]: string[]) => ({
        COLUMN_NAME,
        COLUMN_TYPE,
        IS_NULLABLE,
        COLUMN_DEFAULT: null,
        EXTRA: COLUMN_NAME === "id" ? "auto_increment" : "",
      })
    ),
    indices: Object.entries(s.indices).flatMap(([INDEX_NAME, v]) => {
      const i = v as { unique: boolean; cols: string[] };
      return i.cols.map((COLUMN_NAME, index) => ({
        INDEX_NAME,
        COLUMN_NAME,
        NON_UNIQUE: i.unique ? 0 : 1,
        SEQ_IN_INDEX: index + 1,
        SUB_PART: null,
        INDEX_TYPE: "BTREE",
      }));
    }),
  };
}
describe("provisionador0103 restrito e repetível", () => {
  it("aceita somente o SQL exato revisado e quatro comandosCREATE", () => {
    const ddl = comandos(sql);
    expect(ddl).toHaveLength(4);
    expect(ddl.every((s: string) => s.startsWith("CREATE "))).toBe(true);
    expect(
      ddl.some((s: string) => /\b(DROP|ALTER|INSERT|UPDATE|DELETE)\b/.test(s))
    ).toBe(false);
  });
  it.each([
    "\n",
    "; DROP TABLE `parcelasAcordo`;",
    "--> statement-breakpoint\nDELETE FROM `btgCobrancasEmitidas`;",
  ])("recusa SQL modificado sem executar:%s", extra => {
    expect(() => comandos(sql + extra)).toThrow();
  });
  it("não conecta ao banco se faltar confirmação textual", () => {
    const r = spawnSync(
      process.execPath,
      ["scripts/provisionar-btg-boletos-cancelamentos.cjs", "--apply"],
      { cwd: process.cwd(), encoding: "utf8" }
    );
    expect(r.status).toBe(1);
    expect(r.stderr).toContain(CONFIRMACAO);
    expect(r.stderr).not.toContain("mysql");
  });
  it("recusa tabela não aprovada", () =>
    expect(() => planejar("parcelasAcordo", [], [])).toThrow());
  describe.each(nomes)("%s", nome => {
    it("planeja apenas tabela e seu índice quando ausente", () => {
      const p = planejar(nome, [], []);
      expect(p).toEqual(nome === "btgBoletoSnapshots" ? [0, 2] : [1, 3]);
    });
    it("já completa não produz comandos", () => {
      const e = estrutura(nome);
      expect(planejar(nome, e.colunas, e.indices)).toEqual([]);
    });
    it("índice externo faltante pode ser retomado sem recriar tabela", () => {
      const e = estrutura(nome);
      const final =
        nome === "btgBoletoSnapshots"
          ? "btgBoletoSnapshots_parcela_idx"
          : "btgCancelamentos_emissao_idx";
      expect(
        planejar(
          nome,
          e.colunas,
          e.indices.filter(
            (i: { INDEX_NAME: string }) => i.INDEX_NAME !== final
          )
        )
      ).toEqual([nome === "btgBoletoSnapshots" ? 2 : 3]);
    });
    it("constraint ausente ou tabela parcial não é reparada silenciosamente", () => {
      const e = estrutura(nome);
      expect(() => planejar(nome, e.colunas.slice(1), e.indices)).toThrow();
      expect(() =>
        planejar(
          nome,
          e.colunas,
          e.indices.filter(
            (i: { INDEX_NAME: string }) => !i.INDEX_NAME.includes("unique")
          )
        )
      ).toThrow();
      expect(() => planejar(nome, [], e.indices)).toThrow();
    });
    it("índice com prefixo/campo errado/unique incorreto é rejeitado", () => {
      const e = estrutura(nome);
      for (const patch of [
        { SUB_PART: 10 },
        { COLUMN_NAME: "outro" },
        { NON_UNIQUE: 1 },
        { INDEX_TYPE: "HASH" },
      ]) {
        expect(() =>
          planejar(nome, e.colunas, [
            { ...e.indices[0], ...patch },
            ...e.indices.slice(1),
          ])
        ).toThrow();
      }
    });
    it("índice desconhecido não é apagado", () => {
      const e = estrutura(nome);
      expect(() =>
        planejar(nome, e.colunas, [
          ...e.indices,
          { ...e.indices[0], INDEX_NAME: "indice_inesperado" },
        ])
      ).toThrow();
    });
    it.each(TABELAS[nome].colunas.map((c: string[]) => c[0]))(
      "coluna%s com tipo/nulabilidade/default alterado bloqueia",
      coluna => {
        const e = estrutura(nome);
        for (const patch of [
          { COLUMN_TYPE: "varchar(10)" },
          { IS_NULLABLE: "OUTRO" },
          { COLUMN_DEFAULT: "0" },
          { EXTRA: "on update CURRENT_TIMESTAMP" },
        ]) {
          expect(() =>
            planejar(
              nome,
              e.colunas.map((c: { COLUMN_NAME: string }) =>
                c.COLUMN_NAME === coluna ? { ...c, ...patch } : c
              ),
              e.indices
            )
          ).toThrow();
        }
      }
    );
  });
});
