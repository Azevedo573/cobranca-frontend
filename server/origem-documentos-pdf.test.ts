import { describe, expect, it } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import { gerarBoletoPDF, calcularCodigoBarras, calcularLinhaDigitavel, type DadosBoleto } from "./boleto-pdf";
import { montarContextoBoletoAcordo } from "./boleto-acordo";
import { gerarPlanoCompletoAcordoPDF } from "./plano-acordo-pdf";
import { montarOrigemDividaAcordo } from "./origem-divida-acordo";

const temPoppler = !spawnSync("pdftotext", ["-v"]).error;
const textoPdf = (buffer: Buffer) => execFileSync("pdftotext", ["-layout", "-", "-"], { input: buffer, encoding: "utf8", maxBuffer: 10 * 1024 * 1024 });
const paginasPdf = (buffer: Buffer) => (buffer.toString("latin1").match(/\/Type \/Page\b/g) ?? []).length;

const normalizarTexto = (texto: string) => texto.replace(/\s+/g, " ").trim();
function validarOrigensIntegrais(texto: string, quantidade: number) {
  // Poppler pode separar um título entre linhas; não exigir a linha física do PDF.
  const ids = [...texto.matchAll(/Dívida\s+sintética\s+(\d+)\b/g)].map(match => Number(match[1]));
  expect(ids).toEqual(Array.from({ length: quantidade }, (_, i) => i + 1));
  expect(texto).not.toContain("composição consolidada");
}
function validarFichaNaUltimaPagina(pdf: Buffer) {
  const paginas = textoPdf(pdf).split("\f").filter(p => p.trim()).map(normalizarTexto);
  expect(paginas).toHaveLength(paginasPdf(pdf));
  for (const pagina of paginas.slice(0, -1)) {
    expect(pagina).not.toContain("Ficha de Compensação");
    expect(pagina).not.toContain("PIX COPIA E COLA");
    expect(pagina).not.toContain("Corte na linha pontilhada");
  }
  expect(paginas.at(-1)).toContain("Ficha de Compensação");
  expect(paginas.at(-1)).toContain("PIX COPIA E COLA");
  const bbox = execFileSync("pdftotext", ["-bbox", "-", "-"], { input: pdf, encoding: "utf8", maxBuffer: 10 * 1024 * 1024 });
  const paginasBbox = [...bbox.matchAll(/<page\b[^>]*height="([\d.]+)"[^>]*>([\s\S]*?)<\/page>/g)];
  expect(paginasBbox).toHaveLength(paginas.length);
  for (const [index, pagina] of paginasBbox.entries()) {
    const palavras = [...pagina[2].matchAll(/<word\b[^>]*yMin="([\d.]+)"[^>]*yMax="([\d.]+)"[^>]*>(.*?)<\/word>/g)];
    expect(palavras.length, `Página ${index + 1} não pode estar vazia`).toBeGreaterThan(0);
    for (const palavra of palavras) {
      expect(Number(palavra[1])).toBeGreaterThanOrEqual(0);
      expect(Number(palavra[2])).toBeLessThanOrEqual(Number(pagina[1]));
    }
    if (index === paginasBbox.length - 1) {
      const corte = palavras.findIndex(palavra => palavra[3] === "Corte");
      expect(corte, "Localizar o início da ficha na última página").toBeGreaterThanOrEqual(0);
      // Medir as palavras precedentes, não o bbox de um bloco que agrega tabela e ficha.
      for (const palavra of palavras.slice(0, corte)) {
        expect(Number(palavra[2]), palavra[3]).toBeLessThanOrEqual(Number(palavras[corte][1]) + 0.5);
      }
      expect(palavras.slice(corte).some(palavra => /^#\d+$|^Dívida$|^FIM-TITULO-/.test(palavra[3]))).toBe(false);
    }
  }
  return paginas;
}

function fixture(quantidade = 80, descricaoLonga = false) {
  const vencimento = new Date("2026-11-28T12:00:00Z");
  const parcelas = Array.from({ length: 65 }, (_, index) => ({
    id: index + 1, installmentNumber: index, amount: 5000, dueDate: vencimento,
    status: "pendente" as const, paymentDate: null,
  }));
  const origemDivida = montarOrigemDividaAcordo(Array.from({ length: quantidade }, (_, index) => ({
    cobrancaId: index + 1, valorOriginal: 10000,
    titulo: descricaoLonga ? `${"Descrição extensa da cobrança ".repeat(150)} FIM-TITULO-${index + 1}` : `Dívida sintética ${index + 1}`,
    vencimento,
  })), []);
  const contextoAcordo = montarContextoBoletoAcordo({ acordoId: 1500001, parcelaAtualId: 1, totalNegociado: 325000, parcelas });
  const dados: DadosBoleto = {
    nomeBeneficiario: "Escritório de Teste", cnpjBeneficiario: "00000000000000", enderecoBeneficiario: "Rua de Teste, 1",
    banco: "208", nomeBanco: "BTG", agencia: "0050", digitoAgencia: "0", conta: "432260", digitoConta: "0", carteira: "1", convenio: "11051861158",
    nossoNumero: "1000000024", dataVencimento: vencimento, dataEmissao: vencimento, valor: 5000, especieDocumento: "DD", aceite: "N",
    nomeSacado: "Pagador Sintético", cpfCnpjSacado: "00000000000", enderecoSacado: "Rua de Teste, 2", cidadeSacado: "Rio de Janeiro", ufSacado: "RJ", cepSacado: "20000-000",
    localPagamento: "Pagável em qualquer banco", instrucoes: ["Não receber após o vencimento"], seuNumero: "1000000024",
    pixCopiaCola: "00020101021126360014BR.GOV.BCB.PIX011400000000000000520400005303986540550.005802BR5914PAGADOR TESTE 6009SAO PAULO62100506TESTE163040000",
    contextoAcordo, origemDivida,
  };
  const inputPlano = {
    acordo: { id: 1500001, totalAmount: 325000, agreedAmount: 325000, installments: 64, paymentFrequency: "mensal", status: "ativo", valorPago: 0, notes: null, createdAt: vencimento },
    devedor: { name: "Pagador Sintético", unitNumber: "101", bloco: "A", cpfCnpj: null },
    condominio: { name: "Condomínio Sintético", cnpj: null }, parcelas, origemDivida, geradoEm: vencimento,
  };
  return { dados, inputPlano, origemDivida };
}

describe("PDF de acordo com origem completa paginada", () => {
  it("pagina 80 dívidas e 65 etapas sem resumir a origem nem mudar o título", async () => {
    const { dados } = fixture();
    const antes = structuredClone(dados);
    const codigo = calcularCodigoBarras(dados);
    const linha = calcularLinhaDigitavel(codigo);
    const pdf = await gerarBoletoPDF(dados);
    expect(paginasPdf(pdf)).toBeGreaterThan(2);
    if (temPoppler) {
      validarOrigensIntegrais(textoPdf(pdf), 80);
      validarFichaNaUltimaPagina(pdf);
    }
    expect(calcularCodigoBarras(dados)).toBe(codigo);
    expect(calcularLinhaDigitavel(calcularCodigoBarras(dados))).toBe(linha);
    expect(dados).toEqual(antes);
  });
  it("preserva uma descrição maior que a página em vários trechos, com total e avisos íntegros", async () => {
    const { dados } = fixture(1, true);
    dados.origemDivida!.itens[0].titulo = `${"Descrição extensa da cobrança ".repeat(900)} FIM-TITULO-1`;
    const antes = structuredClone(dados);
    const codigo = calcularCodigoBarras(dados);
    const pdf = await gerarBoletoPDF(dados);
    expect(paginasPdf(pdf)).toBeGreaterThan(2);
    if (temPoppler) {
      const texto = normalizarTexto(textoPdf(pdf));
      for (const palavra of ["Descrição", "extensa", "cobrança"]) {
        // O quadro financeiro também imprime "1 cobrança(s)"; não é descrição.
        expect(texto.match(new RegExp(`\\b${palavra}\\b(?!\\(s\\))`, "g")) ?? [], palavra).toHaveLength(900);
      }
      expect(texto).toContain("FIM-TITULO-1");
      expect(texto).not.toContain("composição consolidada");
      expect(texto).toContain("1 cobrança(s) incluída(s)");
      expect(texto).toContain("Principal preservado: R$ 100,00");
      for (const aviso of dados.origemDivida!.avisos) expect(texto).toContain(normalizarTexto(aviso));
      const paginas = validarFichaNaUltimaPagina(pdf);
      expect(paginas.filter(p => p.includes("Descrição extensa")).length).toBeGreaterThan(1);
    }
    expect(calcularCodigoBarras(dados)).toBe(codigo);
    expect(dados).toEqual(antes);
  });
  // Inspeção textual adicional com Poppler, quando disponível; a paginação acima
  // não depende de binários externos nem de biblioteca adicional de PDF.
  it.skipIf(!temPoppler)("imprime todas as dívidas em ordem com cabeçalhos repetidos e sem inventar histórico", async () => {
    const { dados } = fixture();
    const pdf = await gerarBoletoPDF(dados);
    const texto = normalizarTexto(textoPdf(pdf));
    validarOrigensIntegrais(texto, 80);
    expect(texto).toContain("80 cobrança(s)");
    expect(texto).toContain("Não disponível");
    expect(texto).toContain("50,00");
    expect(texto).toContain("PIX COPIA E COLA");
    for (const aviso of dados.origemDivida!.avisos) expect(texto).toContain(normalizarTexto(aviso));
    const paginas = validarFichaNaUltimaPagina(pdf);
    expect(paginas[0]).toContain("Dívida sintética 1");
    for (const pagina of paginas.filter(p => /Dívida sintética \d+/.test(p))) {
      for (const cabecalho of ["Cobrança de origem", "Vencimento", "Principal preservado"]) expect(pagina).toContain(cabecalho);
    }
  });
  it.skipIf(!temPoppler)("mantém todas as dívidas da tabela curta com a ficha sem truncar descrições", async () => {
    const { dados } = fixture(2);
    const pdf = await gerarBoletoPDF(dados);
    const texto = textoPdf(pdf);
    expect(paginasPdf(pdf)).toBeLessThanOrEqual(2);
    validarOrigensIntegrais(texto, 2);
    expect(texto).toContain("Ficha de Compensação");
    validarFichaNaUltimaPagina(pdf);
  });
  it.skipIf(!temPoppler).each([
    ["parcela única sem entrada", "unica"],
    ["entrada de acordo", "entrada"],
    ["acordo com 65 etapas", "longo"],
  ])("retira somente o quadro do plano do boleto: %s", async (_nome, cenario) => {
    const { dados } = fixture(cenario === "longo" ? 80 : 2);
    if (cenario !== "longo") {
      const parcelas = cenario === "entrada"
        ? [{ id: 1, installmentNumber: 0, amount: 20266, dueDate: dados.dataVencimento, status: "pendente" as const },
          { id: 2, installmentNumber: 1, amount: 20266, dueDate: dados.dataVencimento, status: "pendente" as const }]
        : [{ id: 1, installmentNumber: 1, amount: 20266, dueDate: dados.dataVencimento, status: "pendente" as const }];
      dados.valor = 20266;
      dados.contextoAcordo = montarContextoBoletoAcordo({ acordoId: 1500001, parcelaAtualId: 1,
        totalNegociado: parcelas.reduce((s, p) => s + p.amount, 0), parcelas });
    }
    const antes = structuredClone(dados);
    const codigo = calcularCodigoBarras(dados);
    const linha = calcularLinhaDigitavel(codigo);
    const pdf = await gerarBoletoPDF(dados);
    const texto = textoPdf(pdf);
    for (const trecho of ["Plano de pagamento do acordo", "Sem entrada registrada.",
      "parcela(s) regular(es)", "Etapas:", "Quitadas:", "Em aberto:",
      "Este resumo não altera o valor exigível deste boleto."]) {
      expect(texto).not.toContain(trecho);
    }
    expect(texto).toContain("Resumo do acordo");
    expect(texto).toContain("Total negociado no acordo");
    expect(texto).toContain("Saldo após este pagamento");
    expect(normalizarTexto(texto)).toContain("Origem da dívida na formalização do acordo");
    validarOrigensIntegrais(texto, cenario === "longo" ? 80 : 2);
    validarFichaNaUltimaPagina(pdf);
    expect(texto).toContain("Demonstrativo completo do acordo");
    expect(texto).toContain("PIX COPIA E COLA");
    expect(texto).toContain("Ficha de Compensação");
    expect(texto).toContain(cenario === "longo" ? "50,00" : "202,66");
    if (cenario === "longo") expect(paginasPdf(pdf)).toBeGreaterThan(2);
    else expect(paginasPdf(pdf)).toBeLessThanOrEqual(2);
    expect(calcularCodigoBarras(dados)).toBe(codigo);
    expect(calcularLinhaDigitavel(codigo)).toBe(linha);
    expect(dados).toEqual(antes);
  });
  it.skipIf(!temPoppler)("inclui todas as dívidas e parcelas no demonstrativo, sem Pix ou ficha bancária", async () => {
    const { inputPlano } = fixture();
    const pdf = await gerarPlanoCompletoAcordoPDF(inputPlano);
    const texto = textoPdf(pdf);
    for (let i = 1; i <= 80; i++) expect(texto).toContain(`Dívida sintética ${i}`);
    expect(texto).toContain("Parcela 64/64");
    expect(texto).toContain("Entrada");
    expect(texto).toContain("não é boleto");
    expect(texto).not.toContain("PIX COPIA E COLA");
    expect(texto).not.toContain("Ficha de Compensação");
    expect(paginasPdf(pdf)).toBeLessThan(15);
    const paginas = texto.split("\f").filter(p => p.trim());
    expect(paginas.length).toBe(paginasPdf(pdf));
  });
  it.skipIf(!temPoppler)("conserva o final de cada descrição extensa no documento completo", async () => {
    const { inputPlano } = fixture(2, true);
    const texto = textoPdf(await gerarPlanoCompletoAcordoPDF(inputPlano));
    expect(texto).toContain("FIM-TITULO-1");
    expect(texto).toContain("FIM-TITULO-2");
    expect(texto).toContain("Parcela 64/64");
  });
});
