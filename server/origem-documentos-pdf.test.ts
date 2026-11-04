import { describe, expect, it } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import { gerarBoletoPDF, calcularCodigoBarras, calcularLinhaDigitavel, type DadosBoleto } from "./boleto-pdf";
import { montarContextoBoletoAcordo } from "./boleto-acordo";
import { gerarPlanoCompletoAcordoPDF } from "./plano-acordo-pdf";
import { montarOrigemDividaAcordo } from "./origem-divida-acordo";

const temPoppler = !spawnSync("pdftotext", ["-v"]).error;
const textoPdf = (buffer: Buffer) => execFileSync("pdftotext", ["-layout", "-", "-"], { input: buffer, encoding: "utf8", maxBuffer: 10 * 1024 * 1024 });
const paginasPdf = (buffer: Buffer) => (buffer.toString("latin1").match(/\/Type \/Page\b/g) ?? []).length;

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

describe("PDF de acordo com origem adaptativa", () => {
  it("limita a duas páginas mesmo com muitas dívidas e 65 etapas, sem mudar o título", async () => {
    const { dados } = fixture();
    const antes = structuredClone(dados);
    const codigo = calcularCodigoBarras(dados);
    const linha = calcularLinhaDigitavel(codigo);
    const pdf = await gerarBoletoPDF(dados);
    expect(paginasPdf(pdf)).toBeLessThanOrEqual(2);
    expect(calcularCodigoBarras(dados)).toBe(codigo);
    expect(calcularLinhaDigitavel(calcularCodigoBarras(dados))).toBe(linha);
    expect(dados).toEqual(antes);
  });
  it("usa resumo mesmo com uma única descrição que não cabe na ficha", async () => {
    const { dados } = fixture(1, true);
    expect(paginasPdf(await gerarBoletoPDF(dados))).toBeLessThanOrEqual(2);
  });
  // Inspeção textual adicional com Poppler, quando disponível; a paginação acima
  // não depende de binários externos nem de biblioteca adicional de PDF.
  it.skipIf(!temPoppler)("não repete dívidas no boleto extenso nem apresenta zeros como histórico ausente", async () => {
    const { dados } = fixture();
    const texto = textoPdf(await gerarBoletoPDF(dados));
    expect(texto).toContain("composição consolidada");
    expect(texto).toContain("80 cobrança(s)");
    expect(texto).not.toContain("Dívida sintética 1");
    expect(texto).toContain("Não disponível");
    expect(texto).toContain("50,00");
    expect(texto).toContain("PIX COPIA E COLA");
  });
  it.skipIf(!temPoppler)("mantém todas as dívidas da tabela curta com a ficha sem truncar descrições", async () => {
    const { dados } = fixture(2);
    const texto = textoPdf(await gerarBoletoPDF(dados));
    expect(texto).toContain("Dívida sintética 1");
    expect(texto).toContain("Dívida sintética 2");
    expect(texto).toContain("Ficha de Compensação");
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
    expect(texto).toContain(cenario === "longo"
      ? "Resumo da origem do acordo — composição consolidada"
      : "Origem da dívida na formalização do acordo");
    expect(texto).toContain("Demonstrativo completo do acordo");
    expect(texto).toContain("PIX COPIA E COLA");
    expect(texto).toContain("Ficha de Compensação");
    expect(texto).toContain(cenario === "longo" ? "50,00" : "202,66");
    expect(paginasPdf(pdf)).toBeLessThanOrEqual(2);
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
