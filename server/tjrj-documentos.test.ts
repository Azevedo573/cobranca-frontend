import { describe, expect, it } from "vitest";
import { criarUrlGedTJRJ, normalizarReferenciasDocumentaisTJRJ } from "../client/src/lib/tjrjDocumentos";

describe("referências documentais oficiais do TJRJ", () => {
  it("cria link GED somente para identificadores válidos", () => {
    expect(criarUrlGedTJRJ("0004CF7175AD7D0095C22442986F9FF320DBC51A57164502")).toContain("www3.tjrj.jus.br/gedcacheweb");
    expect(criarUrlGedTJRJ("javascript:alert(1)")).toBeNull();
  });

  it("deduplica documento repetido e rejeita links externos não oficiais", () => {
    const referencias = normalizarReferenciasDocumentaisTJRJ({
      pseudoDocEletronico: "0004CF7175AD7D0095C22442986F9FF320DBC51A57164502",
      movimentosExibicao: [{
        codDocAtoAssinadoDig: "0004CF7175AD7D0095C22442986F9FF320DBC51A57164502",
        docEletronico: [{ url: "https://example.com/arquivo.pdf" }],
      }],
    });
    expect(referencias).toHaveLength(1);
    expect(referencias[0].rotulo).toBe("Documento eletrônico");
  });
});
