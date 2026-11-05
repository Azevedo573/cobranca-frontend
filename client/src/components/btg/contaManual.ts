export type AmbienteBtg = "sandbox" | "producao";
export type OrigemContaBtg = "api" | "manual_sandbox" | "manual_producao";
export type FormContaManual = {
  rotulo: string;
  agencia: string;
  numero: string;
  documentoBeneficiario: string;
  nomeBeneficiario: string;
};

export const CONFIRMACAO_CONTA_PRODUCAO = "CADASTRAR CONTA PRODUCAO" as const;
export const CONFIRMACAO_CONTA_SANDBOX = "CADASTRAR" as const;

export function novaContaManual(): FormContaManual {
  return {
    rotulo: "",
    agencia: "",
    numero: "",
    documentoBeneficiario: "",
    nomeBeneficiario: "",
  };
}

export function formatarDataBtg(
  data: Date | string | null | undefined
): string {
  if (!data) return "—";
  const date = new Date(data);
  if (!Number.isFinite(date.getTime())) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

export function cnpjValidoContaManual(valor: string): boolean {
  if (!/^[\d./\-\s]+$/.test(valor)) return false;
  const cnpj = valor.replace(/\D/g, "");
  if (cnpj.length !== 14 || /^(\d)\1{13}$/.test(cnpj)) return false;
  const digito = (base: string) => {
    let peso = base.length - 7;
    const soma = base.split("").reduce((total, n) => {
      const parcial = total + Number(n) * peso;
      peso = peso === 2 ? 9 : peso - 1;
      return parcial;
    }, 0);
    const resto = soma % 11;
    return resto < 2 ? "0" : String(11 - resto);
  };
  const base = cnpj.slice(0, 12);
  const primeiro = digito(base);
  return cnpj === base + primeiro + digito(base + primeiro);
}

// Strings bancárias são apenas aparadas, nunca convertidas para número ou completadas.
export function validarFormContaManual(
  form: FormContaManual,
  ambiente: AmbienteBtg
): string | null {
  if (form.rotulo.trim().length < 3 || form.rotulo.trim().length > 255)
    return "Informe um rótulo entre 3 e 255 caracteres.";
  if (!/^\d+$/.test(form.agencia.trim()) || form.agencia.trim().length > 30)
    return "Informe a agência somente com dígitos, conforme a fonte bancária.";
  if (!/^\d+$/.test(form.numero.trim()) || form.numero.trim().length > 50)
    return "Informe o número da conta somente com dígitos, sem hífen.";
  if (form.nomeBeneficiario.trim().length > 255)
    return "O nome do titular deve ter até 255 caracteres.";
  if (ambiente === "producao") {
    if (!form.nomeBeneficiario.trim())
      return "Informe o nome do titular da conta.";
    if (!cnpjValidoContaManual(form.documentoBeneficiario))
      return "Informe um CNPJ válido do escritório titular da integração.";
  } else {
    const documento = form.documentoBeneficiario.replace(/\D/g, "");
    if (
      form.documentoBeneficiario.length > 20 ||
      (documento && ![11, 14].includes(documento.length))
    )
      return "O documento do beneficiário deve conter 11 ou 14 dígitos.";
  }
  return null;
}

export function podeCadastrarContaManual(input: {
  ambiente?: string;
  conectado: boolean;
  configuracaoCompleta: boolean;
}): boolean {
  return (
    input.conectado &&
    (input.ambiente === "sandbox" ||
      (input.ambiente === "producao" && input.configuracaoCompleta))
  );
}

export function podeConfirmarContaManual(input: {
  form: FormContaManual;
  ambiente: AmbienteBtg;
  confirmacao: string;
  dadosConferidos: boolean;
  cadastroPermitido: boolean;
  enviando: boolean;
}): boolean {
  return (
    input.cadastroPermitido &&
    !input.enviando &&
    !validarFormContaManual(input.form, input.ambiente) &&
    input.confirmacao ===
      (input.ambiente === "sandbox"
        ? CONFIRMACAO_CONTA_SANDBOX
        : CONFIRMACAO_CONTA_PRODUCAO) &&
    (input.ambiente === "sandbox" || input.dadosConferidos)
  );
}

export function dadosCadastroManualProducao(form: FormContaManual) {
  return {
    rotulo: form.rotulo.trim(),
    agencia: form.agencia.trim(),
    numero: form.numero.trim(),
    documentoBeneficiario: form.documentoBeneficiario.replace(/\D/g, ""),
    nomeBeneficiario: form.nomeBeneficiario.trim(),
    dadosConferidos: true as const,
    confirmacao: CONFIRMACAO_CONTA_PRODUCAO,
  };
}

export function mascararRevisaoConta(valor: string, visiveis = 4): string {
  const texto = valor.trim();
  if (!texto) return "—";
  // Mesmo contas curtas têm pelo menos um caractere oculto na revisão.
  const exibir = Math.min(visiveis, Math.max(0, texto.length - 1));
  return (
    "•".repeat(texto.length - exibir) + (exibir ? texto.slice(-exibir) : "")
  );
}

export function rotuloOrigemConta(origem: OrigemContaBtg): string {
  if (origem === "manual_producao") return "Manual — Produção";
  if (origem === "manual_sandbox") return "Manual — Sandbox";
  return "API BTG";
}

export function rotulosEstadoBtg(
  ambiente: string | undefined,
  emissaoHabilitada: boolean
) {
  return {
    ambiente:
      ambiente === "sandbox"
        ? "SANDBOX"
        : ambiente === "producao"
          ? "PRODUÇÃO"
          : "AMBIENTE NÃO DISPONÍVEL",
    emissao: !emissaoHabilitada
      ? "Emissão bloqueada"
      : ambiente === "sandbox"
        ? "BolePix de homologação ativo"
        : ambiente === "producao"
          ? "BolePix de Produção ativo"
          : "Estado de emissão indisponível",
  };
}
