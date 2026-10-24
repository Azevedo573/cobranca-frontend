import { describe, expect, it } from "vitest";
import {
  resolveCondominioEfetivoComVinculos,
  validarVinculoMultiCondominio,
  type TenantActor,
} from "./tenant-guard";

const actorLocal: TenantActor = {
  id: 10,
  role: "sindico",
  condominioId: 1,
};

const actorAdmin: TenantActor = {
  id: 1,
  role: "admin",
  condominioId: null,
};

describe("tenant-guard — escopo multi-condomínio", () => {
  it("aceita o condomínio principal quando nenhum filtro é informado", () => {
    expect(resolveCondominioEfetivoComVinculos(actorLocal, [1, 2])).toBe(1);
  });

  it("aceita condomínio adicional quando há vínculo ativo", () => {
    expect(resolveCondominioEfetivoComVinculos(actorLocal, [1, 2], 2)).toBe(2);
  });

  it("recusa condomínio não vinculado", () => {
    expect(() => resolveCondominioEfetivoComVinculos(actorLocal, [1, 2], 3))
      .toThrow(/vínculo ativo/i);
  });

  it("recusa usuário local sem vínculos ativos", () => {
    expect(() => resolveCondominioEfetivoComVinculos(actorLocal, []))
      .toThrow(/vínculo ativo/i);
  });

  it("mantém a visão global de admin sem filtro e aceita filtro específico", () => {
    expect(resolveCondominioEfetivoComVinculos(actorAdmin, [])).toBeUndefined();
    expect(resolveCondominioEfetivoComVinculos(actorAdmin, [], 3)).toBe(3);
  });

  it("valida vínculo ativo e separa vínculo inativo", () => {
    expect(validarVinculoMultiCondominio(2, [
      { condominioId: 1, isActive: 1 },
      { condominioId: 2, isActive: 1 },
      { condominioId: 3, isActive: 0 },
    ])).toBe(true);
    expect(validarVinculoMultiCondominio(3, [
      { condominioId: 1, isActive: 1 },
      { condominioId: 3, isActive: 0 },
    ])).toBe(false);
  });
});
