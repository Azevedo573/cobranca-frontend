import * as XLSX from "xlsx";

/**
 * Gera template Excel padronizado para importação de devedores
 */
export function gerarTemplateExcel(): Buffer {
  // Criar workbook
  const wb = XLSX.utils.book_new();
  
  // Dados de exemplo para o template
  const dados = [
    {
      "Nome Completo (opcional)": "João da Silva",
      "CPF/CNPJ": "123.456.789-00",
      "Email": "joao@example.com",
      "Telefone": "(11) 98765-4321",
      "Unidade": "101",
      "Bloco": "A",
      "Descrição da Cobrança": "Condomínio Janeiro/2026",
      "Mês de Referência": "01/2026",
      "Data de Vencimento": "10/01/2026",
      "Valor Original (R$)": "1500.00",
    },
    {
      "Nome Completo (opcional)": "Maria Santos",
      "CPF/CNPJ": "987.654.321-00",
      "Email": "maria@example.com",
      "Telefone": "(11) 91234-5678",
      "Unidade": "202",
      "Bloco": "B",
      "Descrição da Cobrança": "Condomínio Janeiro/2026",
      "Mês de Referência": "01/2026",
      "Data de Vencimento": "10/01/2026",
      "Valor Original (R$)": "1500.00",
    },
  ];
  
  // Criar worksheet
  const ws = XLSX.utils.json_to_sheet(dados);
  
  // Definir largura das colunas
  ws["!cols"] = [
    { wch: 30 }, // Nome Completo
    { wch: 18 }, // CPF/CNPJ
    { wch: 30 }, // Email
    { wch: 18 }, // Telefone
    { wch: 10 }, // Unidade
    { wch: 10 }, // Bloco
    { wch: 35 }, // Descrição da Cobrança
    { wch: 18 }, // Mês de Referência
    { wch: 18 }, // Data de Vencimento
    { wch: 18 }, // Valor Original
  ];
  
  // Adicionar worksheet ao workbook
  XLSX.utils.book_append_sheet(wb, ws, "Devedores");
  
  // Adicionar aba de instruções
  const instrucoes = [
    { "Instruções de Preenchimento": "1. Nome Completo é opcional se Bloco + Unidade estiverem preenchidos" },
    { "Instruções de Preenchimento": "2. CPF/CNPJ deve estar no formato: 123.456.789-00 ou 12.345.678/0001-00" },
    { "Instruções de Preenchimento": "3. Data de Vencimento no formato: DD/MM/AAAA" },
    { "Instruções de Preenchimento": "4. Mês de Referência no formato: MM/AAAA" },
    { "Instruções de Preenchimento": "5. Valor Original deve ser numérico (use ponto para decimais)" },
    { "Instruções de Preenchimento": "6. Telefone no formato: (11) 98765-4321" },
    { "Instruções de Preenchimento": "7. Não altere os nomes das colunas" },
    { "Instruções de Preenchimento": "8. Remova as linhas de exemplo antes de importar" },
  ];
  const wsInstrucoes = XLSX.utils.json_to_sheet(instrucoes);
  wsInstrucoes["!cols"] = [{ wch: 80 }];
  XLSX.utils.book_append_sheet(wb, wsInstrucoes, "Instruções");
  
  // Converter para buffer
  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  return buffer;
}

/**
 * Interface para dados importados da planilha
 */
export interface DadosImportacao {
  nomeCompleto?: string;
  cpfCnpj: string;
  email?: string;
  telefone?: string;
  unidade: string;
  bloco?: string;
  descricaoCobranca?: string;
  mesReferencia?: string;
  dataVencimento: string;
  valorOriginal: number;
}

/**
 * Interface para erros de validação
 */
export interface ErroValidacao {
  linha: number;
  campo: string;
  mensagem: string;
}

/**
 * Processa arquivo Excel e retorna dados validados
 */
export function processarPlanilha(buffer: Buffer): {
  dados: DadosImportacao[];
  erros: ErroValidacao[];
} {
  const wb = XLSX.read(buffer, { type: "buffer" });
  const wsName = wb.SheetNames[0];
  const ws = wb.Sheets[wsName];
  
  // Converter para JSON
  const rows = XLSX.utils.sheet_to_json(ws) as any[];
  
  const dados: DadosImportacao[] = [];
  const erros: ErroValidacao[] = [];
  
  rows.forEach((row, index) => {
    const linha = index + 2; // +2 porque linha 1 é cabeçalho e index começa em 0
    
    // Validar campos obrigatórios
    // Nome é opcional se Bloco + Unidade estiverem preenchidos
    const temNome = row["Nome Completo (opcional)"] || row["Nome Completo"];
    const temBlocoUnidade = row["Bloco"] && row["Unidade"];
    
    if (!temNome && !temBlocoUnidade) {
      erros.push({ linha, campo: "Nome/Bloco+Unidade", mensagem: "Preencha Nome OU (Bloco + Unidade)" });
    }
    if (!row["CPF/CNPJ"]) {
      erros.push({ linha, campo: "CPF/CNPJ", mensagem: "Campo obrigatório" });
    }
    if (!row["Unidade"]) {
      erros.push({ linha, campo: "Unidade", mensagem: "Campo obrigatório" });
    }
    if (!row["Data de Vencimento"]) {
      erros.push({ linha, campo: "Data de Vencimento", mensagem: "Campo obrigatório" });
    }
    if (!row["Valor Original (R$)"]) {
      erros.push({ linha, campo: "Valor Original", mensagem: "Campo obrigatório" });
    }
    
    // Validar formato de CPF/CNPJ
    if (row["CPF/CNPJ"]) {
      const cpfCnpj = String(row["CPF/CNPJ"]).replace(/[^\d]/g, "");
      if (cpfCnpj.length !== 11 && cpfCnpj.length !== 14) {
        erros.push({ linha, campo: "CPF/CNPJ", mensagem: "Formato inválido" });
      }
    }
    
    // Validar formato de data
    if (row["Data de Vencimento"]) {
      const dataStr = String(row["Data de Vencimento"]);
      const dataRegex = /^\d{2}\/\d{2}\/\d{4}$/;
      if (!dataRegex.test(dataStr)) {
        erros.push({ linha, campo: "Data de Vencimento", mensagem: "Formato deve ser DD/MM/AAAA" });
      }
    }
    
    // Validar valor numérico
    if (row["Valor Original (R$)"]) {
      const valor = Number(String(row["Valor Original (R$)"]).replace(",", "."));
      if (isNaN(valor) || valor <= 0) {
        erros.push({ linha, campo: "Valor Original", mensagem: "Deve ser um número positivo" });
      }
    }
    
    // Se não houver erros críticos, adicionar aos dados
    if (row["CPF/CNPJ"] && row["Unidade"]) {
      const nomeCompleto = row["Nome Completo (opcional)"] || row["Nome Completo"];
      dados.push({
        nomeCompleto: nomeCompleto ? String(nomeCompleto) : undefined,
        cpfCnpj: String(row["CPF/CNPJ"]).replace(/[^\d]/g, ""),
        email: row["Email"] ? String(row["Email"]) : undefined,
        telefone: row["Telefone"] ? String(row["Telefone"]) : undefined,
        unidade: String(row["Unidade"]),
        bloco: row["Bloco"] ? String(row["Bloco"]) : undefined,
        descricaoCobranca: row["Descrição da Cobrança"] ? String(row["Descrição da Cobrança"]) : undefined,
        mesReferencia: row["Mês de Referência"] ? String(row["Mês de Referência"]) : undefined,
        dataVencimento: String(row["Data de Vencimento"]),
        valorOriginal: Number(String(row["Valor Original (R$)"]).replace(",", ".")),
      });
    }
  });
  
  return { dados, erros };
}

/**
 * Converte data DD/MM/AAAA para objeto Date
 */
export function converterData(dataStr: string): Date {
  const [dia, mes, ano] = dataStr.split("/").map(Number);
  return new Date(ano, mes - 1, dia);
}
