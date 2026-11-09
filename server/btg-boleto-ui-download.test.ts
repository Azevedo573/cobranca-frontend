import { afterEach, describe, expect, it, vi } from "vitest";
import { baixarPdfBase64, criarBlobPdfBase64, nomeSeguroPdf } from "../client/src/lib/downloadBase64";

const arquivo = { base64: btoa("%PDF-1.7\nfixture sintética\n%%EOF"), nomeArquivo: "boleto.pdf", mimeType: "application/pdf" as const };

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.useRealTimers(); });

describe("download documental BTG", () => {
  it("preserva bytes e MIME em Blob privado", async () => {
    const blob = criarBlobPdfBase64(arquivo);
    expect(blob.type).toBe("application/pdf");
    expect(new Uint8Array(await blob.arrayBuffer())).toEqual(Uint8Array.from(atob(arquivo.base64), char => char.charCodeAt(0)));
  });
  it("recusa base64 inválido, vazio, data URL e conteúdo não PDF", () => {
    for (const base64 of ["", "???", `data:application/pdf;base64,${arquivo.base64}`, btoa("<html>erro</html>")]) {
      expect(() => criarBlobPdfBase64({ ...arquivo, base64 })).toThrow();
    }
  });
  it("limpa caminhos e nomes perigosos", () => {
    expect(nomeSeguroPdf("../../titulo.pdf")).toBe("titulo.pdf");
    expect(nomeSeguroPdf("C:\\dados\\titulo.pdf")).toBe("titulo.pdf");
    expect(nomeSeguroPdf("\u0000boleto.pdf")).toBe("boleto.pdf");
    expect(nomeSeguroPdf("titulo.html")).toBe("boleto-btg.pdf");
  });
  it("baixa via link temporário, remove e revoga URL mesmo com falha de clique", () => {
    vi.useFakeTimers();
    const click = vi.fn();
    const remove = vi.fn();
    const link = { href: "", download: "", rel: "", click, remove };
    const appendChild = vi.fn();
    vi.stubGlobal("document", { createElement: vi.fn(() => link), body: { appendChild } });
    const create = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:privado");
    const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    baixarPdfBase64(arquivo);
    expect(create).toHaveBeenCalledTimes(1);
    expect(link.href).toBe("blob:privado");
    expect(link.download).toBe("boleto.pdf");
    expect(click).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledTimes(1);
    vi.runAllTimers();
    expect(revoke).toHaveBeenCalledWith("blob:privado");
    click.mockImplementationOnce(() => { throw new Error("clique bloqueado"); });
    expect(() => baixarPdfBase64(arquivo)).toThrow("clique bloqueado");
    vi.runAllTimers();
    expect(remove).toHaveBeenCalledTimes(2);
    expect(revoke).toHaveBeenCalledTimes(2);
  });
});
