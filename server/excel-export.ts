import ExcelJS from "exceljs";
import { calcularValorDevido } from "../shared/calculos";
import { calcularValorDevidoAsync } from "./calculos-bcb";

/**
 * Helper para criar workbook Excel com formatação padrão
 */
export function createWorkbook() {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Gomes & Silva Advocacia";
  workbook.created = new Date();
  return workbook;
}

/**
 * Formatar cabeçalho de planilha com estilo profissional
 */
export function formatHeader(worksheet: ExcelJS.Worksheet, headers: string[]) {
  const headerRow = worksheet.addRow(headers);
  
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF1e3a8a" }, // Azul navy
    };
    cell.alignment = { vertical: "middle", horizontal: "center" };
    cell.border = {
      top: { style: "thin" },
      left: { style: "thin" },
      bottom: { style: "thin" },
      right: { style: "thin" },
    };
  });

  // Auto-ajustar largura das colunas
  worksheet.columns.forEach((column) => {
    if (column) {
      column.width = 20;
    }
  });
}

/**
 * Adicionar linha de total ao final da planilha
 */
export function addTotalRow(
  worksheet: ExcelJS.Worksheet,
  label: string,
  value: number,
  columnIndex: number
) {
  const totalRow = worksheet.addRow([]);
  totalRow.getCell(1).value = label;
  totalRow.getCell(1).font = { bold: true };
  totalRow.getCell(columnIndex).value = value;
  totalRow.getCell(columnIndex).numFmt = "R$ #,##0.00";
  totalRow.getCell(columnIndex).font = { bold: true };
  totalRow.getCell(columnIndex).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFE0E0E0" },
  };
}

/**
 * Exportar lista de devedores para Excel
 */
export async function exportDevedores(
  devedores: any[],
  condominios: any[]
): Promise<Buffer> {
  const workbook = createWorkbook();
  const worksheet = workbook.addWorksheet("Devedores");

  // Cabeçalhos
  formatHeader(worksheet, [
    "ID",
    "Nome",
    "CPF/CNPJ",
    "Unidade",
    "Bloco",
    "Condomínio",
    "Telefone",
    "Email",
    "Valor Devido (R$)",
    "Status",
  ]);

  // Dados
  let totalDevido = 0;
  devedores.forEach((devedor) => {
    const condominio = condominios.find((c) => c.id === devedor.condominioId);
    const valorDevido = devedor.valorDevido || 0;
    totalDevido += valorDevido;

    const row = worksheet.addRow([
      devedor.id,
      devedor.nome,
      devedor.cpfCnpj || "",
      devedor.unidade,
      devedor.bloco || "",
      condominio?.nome || "",
      devedor.telefone || "",
      devedor.email || "",
      valorDevido,
      devedor.status || "Ativo",
    ]);

    // Formatar valor
    row.getCell(9).numFmt = "R$ #,##0.00";
  });

  // Total
  addTotalRow(worksheet, "TOTAL GERAL", totalDevido, 9);

  return Buffer.from(await workbook.xlsx.writeBuffer());
}

/**
 * Exportar cobranças ativas para Excel
 */
export async function exportCobrancas(
  cobrancas: any[],
  devedores: any[],
  condominios: any[]
): Promise<Buffer> {
  const workbook = createWorkbook();
  const worksheet = workbook.addWorksheet("Cobranças Ativas");

  // Cabeçalhos
  formatHeader(worksheet, [
    "ID",
    "Devedor",
    "Condomínio",
    "Tipo",
    "Valor Original (R$)",
    "Data Vencimento",
    "Dias Atraso",
    "Juros (R$)",
    "Multa (R$)",
    "Honorários (R$)",
    "Custas (R$)",
    "Correção (R$)",
    "Valor Total (R$)",
    "Status",
  ]);

  // Dados
  let totalOriginal = 0;
  let totalDevido = 0;

  for (const cobranca of cobrancas) {
    const devedor = devedores.find((d) => d.id === cobranca.devedorId);
    const condominio = condominios.find((c) => c.id === devedor?.condominioId);

    // Calcular valores
    const taxas = {
      taxaJurosMensal: condominio?.taxaJurosMensal || 0,
      taxaMulta: condominio?.taxaMulta || 0,
      taxaHonorarios: condominio?.taxaHonorarios || 0,
      correcaoMonetaria: condominio?.correcaoMonetaria || 0,
      indiceCorrecao: condominio?.indiceCorrecao || "NENHUM",
      aplicarCorrecaoAuto: Boolean(condominio?.aplicarCorrecaoAuto),
    };

    // Usar correção monetária via BCB se configurado
    const breakdown = (taxas.aplicarCorrecaoAuto && taxas.indiceCorrecao !== "NENHUM")
      ? await calcularValorDevidoAsync(
          cobranca.valorOriginal,
          cobranca.dataVencimento,
          taxas,
          cobranca.custasJudiciais || 0
        )
      : calcularValorDevido(
          cobranca.valorOriginal,
          cobranca.dataVencimento,
          taxas,
          cobranca.custasJudiciais || 0
        );

    totalOriginal += cobranca.valorOriginal;
    totalDevido += breakdown.valorTotal;

    const diasAtraso = Math.max(
      0,
      Math.floor(
        (new Date().getTime() - new Date(cobranca.dataVencimento).getTime()) /
          (1000 * 60 * 60 * 24)
      )
    );

    const row = worksheet.addRow([
      cobranca.id,
      devedor?.nome || "",
      condominio?.nome || "",
      cobranca.tipo || "condomínio",
      cobranca.valorOriginal,
      new Date(cobranca.dataVencimento).toLocaleDateString("pt-BR"),
      diasAtraso,
      breakdown.juros,
      breakdown.multa,
      breakdown.honorarios,
      breakdown.custasJudiciais,
      breakdown.correcaoMonetaria,
      breakdown.valorTotal,
      cobranca.status || "Ativa",
    ]);

    // Formatar valores monetários
    [5, 8, 9, 10, 11, 12, 13].forEach((colIndex) => {
      row.getCell(colIndex).numFmt = "R$ #,##0.00";
    });
  }

  // Totais
  const totalRow = worksheet.addRow([
    "",
    "",
    "",
    "TOTAL GERAL",
    totalOriginal,
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    totalDevido,
    "",
  ]);
  totalRow.getCell(4).font = { bold: true };
  totalRow.getCell(5).numFmt = "R$ #,##0.00";
  totalRow.getCell(5).font = { bold: true };
  totalRow.getCell(13).numFmt = "R$ #,##0.00";
  totalRow.getCell(13).font = { bold: true };
  totalRow.getCell(13).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFE0E0E0" },
  };

  return Buffer.from(await workbook.xlsx.writeBuffer());
}

/**
 * Exportar acordos para Excel
 */
export async function exportAcordos(
  acordos: any[],
  devedores: any[],
  condominios: any[]
): Promise<Buffer> {
  const workbook = createWorkbook();
  const worksheet = workbook.addWorksheet("Acordos");

  // Cabeçalhos
  formatHeader(worksheet, [
    "ID",
    "Devedor",
    "Condomínio",
    "Data Acordo",
    "Valor Total (R$)",
    "Valor Entrada (R$)",
    "Nº Parcelas",
    "Valor Parcela (R$)",
    "Saldo Devedor (R$)",
    "Status",
  ]);

  // Dados
  let totalAcordos = 0;
  let totalSaldo = 0;

  acordos.forEach((acordo) => {
    const devedor = devedores.find((d) => d.id === acordo.devedorId);
    const condominio = condominios.find((c) => c.id === devedor?.condominioId);

    totalAcordos += acordo.valorTotal;
    totalSaldo += acordo.saldoDevedor;

    const row = worksheet.addRow([
      acordo.id,
      devedor?.nome || "",
      condominio?.nome || "",
      new Date(acordo.dataAcordo).toLocaleDateString("pt-BR"),
      acordo.valorTotal,
      acordo.valorEntrada,
      acordo.numeroParcelas,
      acordo.valorParcela,
      acordo.saldoDevedor,
      acordo.status,
    ]);

    // Formatar valores monetários
    [5, 6, 8, 9].forEach((colIndex) => {
      row.getCell(colIndex).numFmt = "R$ #,##0.00";
    });
  });

  // Totais
  const totalRow = worksheet.addRow([
    "",
    "",
    "TOTAL GERAL",
    "",
    totalAcordos,
    "",
    "",
    "",
    totalSaldo,
    "",
  ]);
  totalRow.getCell(3).font = { bold: true };
  [5, 9].forEach((colIndex) => {
    totalRow.getCell(colIndex).numFmt = "R$ #,##0.00";
    totalRow.getCell(colIndex).font = { bold: true };
    totalRow.getCell(colIndex).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFE0E0E0" },
    };
  });

  return Buffer.from(await workbook.xlsx.writeBuffer());
}

/**
 * Exportar tentativas de cobrança para Excel
 */
export async function exportTentativas(
  tentativas: any[],
  devedores: any[],
  usuarios: any[]
): Promise<Buffer> {
  const workbook = createWorkbook();
  const worksheet = workbook.addWorksheet("Tentativas de Cobrança");

  // Cabeçalhos
  formatHeader(worksheet, [
    "ID",
    "Data",
    "Devedor",
    "Tipo Contato",
    "Resultado",
    "Colaborador",
    "Observações",
  ]);

  // Dados
  tentativas.forEach((tentativa) => {
    const devedor = devedores.find((d) => d.id === tentativa.devedorId);
    const usuario = usuarios.find((u) => u.id === tentativa.userId);

    worksheet.addRow([
      tentativa.id,
      new Date(tentativa.dataTentativa).toLocaleDateString("pt-BR"),
      devedor?.nome || "",
      tentativa.tipoContato,
      tentativa.resultado,
      usuario?.name || "",
      tentativa.observacoes || "",
    ]);
  });

  return Buffer.from(await workbook.xlsx.writeBuffer());
}

/**
 * Exportar vencimentos próximos para Excel
 */
export async function exportVencimentos(
  parcelas: any[],
  dias: number
): Promise<Buffer> {
  const workbook = createWorkbook();
  const worksheet = workbook.addWorksheet(`Vencimentos ${dias} dias`);

  // Cabeçalhos
  formatHeader(worksheet, [
    "Devedor",
    "Condomínio",
    "Acordo ID",
    "Parcela",
    "Valor (R$)",
    "Data Vencimento",
    "Dias Restantes",
    "Telefone",
    "Status",
  ]);

  // Dados
  let totalParcelas = 0;

  parcelas.forEach((parcela) => {
    const diasRestantes = Math.ceil(
      (new Date(parcela.dataVencimento).getTime() - new Date().getTime()) /
        (1000 * 60 * 60 * 24)
    );

    totalParcelas += parcela.valorParcela / 100; // Converter de centavos

    const row = worksheet.addRow([
      parcela.devedorNome || "",
      parcela.condominioNome || "",
      parcela.acordoId,
      parcela.numeroParcela,
      parcela.valorParcela / 100, // Converter de centavos
      new Date(parcela.dataVencimento).toLocaleDateString("pt-BR"),
      diasRestantes,
      parcela.devedorTelefone || "",
      parcela.status,
    ]);

    // Formatar valor
    row.getCell(5).numFmt = "R$ #,##0.00";

    // Destacar urgência
    if (diasRestantes <= 3) {
      row.getCell(7).fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFFF0000" }, // Vermelho
      };
      row.getCell(7).font = { color: { argb: "FFFFFFFF" }, bold: true };
    } else if (diasRestantes <= 7) {
      row.getCell(7).fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFFFA500" }, // Laranja
      };
    }
  });

  // Total
  addTotalRow(worksheet, "TOTAL A RECEBER", totalParcelas, 5);

  return Buffer.from(await workbook.xlsx.writeBuffer());
}
