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
      "CPF/CNPJ (opcional)": "123.456.789-00",
      "Email": "joao@example.com",
      "Telefone": "(11) 98765-4321",
      "Unidade": "101",
      "Bloco": "A",
      "Status da Unidade": "Padrão",
      "Tipo de Cobrança": "Cota Condominial",
      "Descrição da Cobrança": "Condomínio Janeiro/2026",
      "Mês de Referência": "01/2026",
      "Data de Vencimento": "10/01/2026",
      "Valor Original (R$)": "1500.00",
    },
    {
      "Nome Completo (opcional)": "Maria Santos",
      "CPF/CNPJ (opcional)": "987.654.321-00",
      "Email": "maria@example.com",
      "Telefone": "(11) 91234-5678",
      "Unidade": "202",
      "Bloco": "B",
      "Status da Unidade": "Ajuizado",
      "Tipo de Cobrança": "Fundo de Reserva",
      "Descrição da Cobrança": "Fundo Reserva Janeiro/2026",
      "Mês de Referência": "01/2026",
      "Data de Vencimento": "10/01/2026",
      "Valor Original (R$)": "800.00",
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
    { wch: 18 }, // Status da Unidade
    { wch: 25 }, // Tipo de Cobrança
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
    { "Instruções de Preenchimento": "2. CPF/CNPJ é opcional (use quando disponível para evitar duplicatas)" },
    { "Instruções de Preenchimento": "3. Status da Unidade: Padrão | Ajuizado (deixe em branco para Padrão; Ajuizado cria automaticamente uma demanda de cobrança judicial no módulo Jurídico)" },
    { "Instruções de Preenchimento": "4. Tipo de Cobrança: Cota Condominial | Fundo de Reserva | Taxa Extra | Multa | Acordo | Judicial | Outros" },
    { "Instruções de Preenchimento": "5. Data de Vencimento no formato: DD/MM/AAAA" },
    { "Instruções de Preenchimento": "6. Mês de Referência no formato: MM/AAAA" },
    { "Instruções de Preenchimento": "7. Valor Original deve ser numérico (use ponto para decimais)" },
    { "Instruções de Preenchimento": "8. Telefone no formato: (11) 98765-4321" },
    { "Instruções de Preenchimento": "9. Não altere os nomes das colunas" },
    { "Instruções de Preenchimento": "10. Remova as linhas de exemplo antes de importar" },
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
  cpfCnpj?: string;
  email?: string;
  telefone?: string;
  unidade: string;
  bloco?: string;
  statusUnidade?: "padrao" | "ajuizado";
  tipoCobranca?: string;
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
  tipo?: "erro" | "aviso"; // erro = bloqueia importação, aviso = campo opcional ausente
}

/**
 * Processa arquivo Excel e retorna dados validados
 */
export function processarPlanilha(buffer: Buffer): {
  dados: DadosImportacao[];
  erros: ErroValidacao[];
  avisos: ErroValidacao[];
} {
  const wb = XLSX.read(buffer, { type: "buffer" });
  const wsName = wb.SheetNames[0];
  const ws = wb.Sheets[wsName];
  
  // Converter para JSON (raw: true garante que datas sejam lidas como número serial)
  const rows = XLSX.utils.sheet_to_json(ws, { raw: true }) as any[];
  
  const dados: DadosImportacao[] = [];
  const erros: ErroValidacao[] = [];
  const avisos: ErroValidacao[] = [];
  
  rows.forEach((row, index) => {
    const linha = index + 2; // +2 porque linha 1 é cabeçalho e index começa em 0
    
    // Validar campos obrigatórios (erros críticos — bloqueiam importação)
    const temNome = row["Nome Completo (opcional)"] || row["Nome Completo"];
    const temBlocoUnidade = row["Bloco"] && row["Unidade"];
    
    if (!temNome && !temBlocoUnidade) {
      erros.push({ linha, campo: "Nome/Bloco+Unidade", mensagem: "Preencha Nome OU (Bloco + Unidade)", tipo: "erro" });
    }
    if (!row["Unidade"]) {
      erros.push({ linha, campo: "Unidade", mensagem: "Campo obrigatório", tipo: "erro" });
    }
    if (!row["Data de Vencimento"]) {
      erros.push({ linha, campo: "Data de Vencimento", mensagem: "Campo obrigatório", tipo: "erro" });
    }
    if (!row["Valor Original (R$)"]) {
      erros.push({ linha, campo: "Valor Original", mensagem: "Campo obrigatório", tipo: "erro" });
    }

    // Avisos — campos opcionais ausentes (não bloqueiam, mas operador deve confirmar ciência)
    if (!temNome && row["Unidade"]) {
      avisos.push({ linha, campo: "Nome Completo", mensagem: "Não informado — devedor será identificado apenas por Bloco/Unidade", tipo: "aviso" });
    }
    if (!row["CPF/CNPJ (opcional)"] && !row["CPF/CNPJ"]) {
      avisos.push({ linha, campo: "CPF/CNPJ", mensagem: "Não informado — pode dificultar identificação de duplicatas", tipo: "aviso" });
    }
    if (!row["Email"]) {
      avisos.push({ linha, campo: "Email", mensagem: "Não informado — notificações por e-mail não serão enviadas", tipo: "aviso" });
    }
    if (!row["Telefone"]) {
      avisos.push({ linha, campo: "Telefone", mensagem: "Não informado — contato por WhatsApp/SMS não disponível", tipo: "aviso" });
    }
    
    // Validar formato de CPF/CNPJ (se fornecido)
    const cpfCnpjValue = row["CPF/CNPJ (opcional)"] || row["CPF/CNPJ"];
    if (cpfCnpjValue) {
      const cpfCnpj = String(cpfCnpjValue).replace(/[^\d]/g, "");
      if (cpfCnpj.length !== 11 && cpfCnpj.length !== 14) {
        erros.push({ linha, campo: "CPF/CNPJ", mensagem: "Formato inválido" });
      }
    }
    
    // Validar formato de data (aceita texto DD/MM/AAAA ou número serial do Excel)
    if (row["Data de Vencimento"]) {
      const dataStr = String(row["Data de Vencimento"]);
      const dataRegex = /^\d{2}\/\d{2}\/\d{4}$/;
      const isSerial = /^\d+(\.\d+)?$/.test(dataStr);
      if (!dataRegex.test(dataStr) && !isSerial) {
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
    if (row["Unidade"]) {
      const nomeCompleto = row["Nome Completo (opcional)"] || row["Nome Completo"];
      const cpfCnpjRaw = row["CPF/CNPJ (opcional)"] || row["CPF/CNPJ"];
      const cpfCnpj = cpfCnpjRaw ? String(cpfCnpjRaw).replace(/[^\d]/g, "") : undefined;
      // Normalizar status da unidade
      const statusUnidadeRaw = row["Status da Unidade"] ? String(row["Status da Unidade"]).toLowerCase().trim() : "";
      const statusUnidade: "padrao" | "ajuizado" = statusUnidadeRaw === "ajuizado" ? "ajuizado" : "padrao";

      dados.push({
        nomeCompleto: nomeCompleto ? String(nomeCompleto) : undefined,
        cpfCnpj: cpfCnpj,
        email: row["Email"] ? String(row["Email"]) : undefined,
        telefone: row["Telefone"] ? String(row["Telefone"]) : undefined,
        unidade: String(row["Unidade"]),
        bloco: row["Bloco"] ? String(row["Bloco"]) : undefined,
        statusUnidade,
        tipoCobranca: row["Tipo de Cobrança"] ? String(row["Tipo de Cobrança"]) : undefined,
        descricaoCobranca: row["Descrição da Cobrança"] ? String(row["Descrição da Cobrança"]) : undefined,
        mesReferencia: row["Mês de Referência"] ? String(row["Mês de Referência"]) : undefined,
        dataVencimento: normalizarData(row["Data de Vencimento"]),
        valorOriginal: Number(String(row["Valor Original (R$)"]).replace(",", ".")),
      });
    }
  });
  
  return { dados, erros, avisos };
}

/**
 * Normaliza valor de data do Excel para string DD/MM/AAAA
 * Aceita: string "DD/MM/AAAA" ou número serial do Excel (ex: 46063)
 */
function normalizarData(valor: unknown): string {
  if (valor === null || valor === undefined) return "";
  const str = String(valor).trim();
  // Já está no formato correto
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(str)) return str;
  // É número serial do Excel
  const serial = Number(str);
  if (!isNaN(serial) && serial > 1000) {
    // Excel usa epoch 1/1/1900 (com bug do ano 1900 onde 1900 era tratado como bissexto)
    // Subtrair 25569 converte de serial Excel para dias desde Unix epoch (01/01/1970)
    // O bug do ano 1900 é compensado subtraindo 1 para seriais > 60
    const excelEpoch = serial > 60 ? serial - 1 : serial;
    const msFromEpoch = (excelEpoch - 25569) * 86400 * 1000;
    const date = new Date(msFromEpoch);
    const dia = String(date.getUTCDate()).padStart(2, "0");
    const mes = String(date.getUTCMonth() + 1).padStart(2, "0");
    const ano = String(date.getUTCFullYear());
    return `${dia}/${mes}/${ano}`;
  }
  return str;
}

/**
 * Converte data DD/MM/AAAA para objeto Date
 */
export function converterData(dataStr: string): Date {
  const [dia, mes, ano] = dataStr.split("/").map(Number);
  return new Date(ano, mes - 1, dia);
}
