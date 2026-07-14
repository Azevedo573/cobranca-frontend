import { gerarRelatorioAcordosPDF } from "./server/relatorio-acordos-pdf.ts";
import fs from "fs";

const testData = {
  nomeCondominio: "W028A Cond. do Ed. Pedroso Lima (79)",
  periodoLabel: "01/01/2000 a 30/06/2026",
  acordos: [
    {
      acordoId: 34323,
      nomeDevedor: "João Silva",
      unidade: "COB.02",
      bloco: null,
      nomeCondominio: "W028A Cond. do Ed. Pedroso Lima (79)",
      createdAt: new Date("2026-02-03"),
      agreedAmount: 299773,
      installments: 1,
      cobrancasOriginais: [
        { cobrancaId: 633402, dataVencimento: new Date("2025-10-10"), monthReference: "10/2025", descricao: "Água", tipoCobranca: null, valorOriginalAcordo: 19500 },
        { cobrancaId: 633402, dataVencimento: new Date("2025-10-10"), monthReference: "10/2025", descricao: "13º Salário", tipoCobranca: null, valorOriginalAcordo: 1775 },
        { cobrancaId: 633402, dataVencimento: new Date("2025-10-10"), monthReference: "10/2025", descricao: "Condomínio", tipoCobranca: null, valorOriginalAcordo: 87516 },
        { cobrancaId: 633402, dataVencimento: new Date("2025-10-10"), monthReference: "10/2025", descricao: "Fundo de Reserva", tipoCobranca: null, valorOriginalAcordo: 4376 },
        { cobrancaId: 633402, dataVencimento: new Date("2025-10-10"), monthReference: "10/2025", descricao: "Garagem", tipoCobranca: null, valorOriginalAcordo: 10900 },
        { cobrancaId: 633402, dataVencimento: new Date("2025-10-10"), monthReference: "10/2025", descricao: "Rateio Extra", tipoCobranca: null, valorOriginalAcordo: 5630 },
        { cobrancaId: 643898, dataVencimento: new Date("2025-11-10"), monthReference: "11/2025", descricao: "Água", tipoCobranca: null, valorOriginalAcordo: 19400 },
        { cobrancaId: 643898, dataVencimento: new Date("2025-11-10"), monthReference: "11/2025", descricao: "13º Salário", tipoCobranca: null, valorOriginalAcordo: 1775 },
        { cobrancaId: 643898, dataVencimento: new Date("2025-11-10"), monthReference: "11/2025", descricao: "Condomínio", tipoCobranca: null, valorOriginalAcordo: 87516 },
        { cobrancaId: 643898, dataVencimento: new Date("2025-11-10"), monthReference: "11/2025", descricao: "Fundo de Reserva", tipoCobranca: null, valorOriginalAcordo: 4376 },
        { cobrancaId: 643898, dataVencimento: new Date("2025-11-10"), monthReference: "11/2025", descricao: "Garagem", tipoCobranca: null, valorOriginalAcordo: 10900 },
        { cobrancaId: 643898, dataVencimento: new Date("2025-11-10"), monthReference: "11/2025", descricao: "Rateio Extra", tipoCobranca: null, valorOriginalAcordo: 5630 },
      ],
      parcelas: [
        { parcelaId: 672008, installmentNumber: 1, nossoNumero: "672008", dueDate: new Date("2026-02-10"), paymentDate: new Date("2026-02-09"), amount: 299773, status: "pago", snapshotDescricao: "Parcela única" },
      ],
      somaOriginal: 259294,
      acrescimos: 40479,
      valorPagoEfetivo: 299773,
    },
    {
      acordoId: 35012,
      nomeDevedor: "Maria Oliveira",
      unidade: "COB.02",
      bloco: null,
      nomeCondominio: "W028A Cond. do Ed. Pedroso Lima (79)",
      createdAt: new Date("2026-03-24"),
      agreedAmount: 150414,
      installments: 1,
      cobrancasOriginais: [
        { cobrancaId: 662183, dataVencimento: new Date("2026-01-10"), monthReference: "01/2026", descricao: "Água", tipoCobranca: null, valorOriginalAcordo: 19600 },
        { cobrancaId: 662183, dataVencimento: new Date("2026-01-10"), monthReference: "01/2026", descricao: "13º Salário", tipoCobranca: null, valorOriginalAcordo: 1775 },
        { cobrancaId: 662183, dataVencimento: new Date("2026-01-10"), monthReference: "01/2026", descricao: "Condomínio", tipoCobranca: null, valorOriginalAcordo: 87516 },
        { cobrancaId: 662183, dataVencimento: new Date("2026-01-10"), monthReference: "01/2026", descricao: "Fundo de Reserva", tipoCobranca: null, valorOriginalAcordo: 4376 },
        { cobrancaId: 662183, dataVencimento: new Date("2026-01-10"), monthReference: "01/2026", descricao: "Garagem", tipoCobranca: null, valorOriginalAcordo: 10900 },
        { cobrancaId: 662183, dataVencimento: new Date("2026-01-10"), monthReference: "01/2026", descricao: "Seguro Predial", tipoCobranca: null, valorOriginalAcordo: 6814 },
      ],
      parcelas: [
        { parcelaId: 688381, installmentNumber: 1, nossoNumero: "688381", dueDate: new Date("2026-03-25"), paymentDate: new Date("2026-03-24"), amount: 150414, status: "pago", snapshotDescricao: "Parcela única" },
      ],
      somaOriginal: 130981,
      acrescimos: 19433,
      valorPagoEfetivo: 150414,
    },
  ],
};

try {
  const buf = await gerarRelatorioAcordosPDF(testData);
  console.log("✅ PDF gerado com sucesso! Tamanho:", buf.length, "bytes");
  fs.writeFileSync("/tmp/test-acordos.pdf", buf);
  console.log("📄 Salvo em /tmp/test-acordos.pdf");
} catch (err) {
  console.error("❌ ERRO:", err.message);
  console.error(err.stack);
}
