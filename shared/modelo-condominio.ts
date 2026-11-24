export const VARIAVEIS_CONDOMINIO = [
  { chave: "condominio", label: "Nome do Condomínio", categoria: "Jurídico" },
  {
    chave: "nomeCondominio",
    label: "Nome do Condomínio",
    categoria: "Condomínio",
  },
  {
    chave: "cnpjCondominio",
    label: "CNPJ do Condomínio",
    categoria: "Condomínio",
  },
  {
    chave: "enderecoCondominio",
    label: "Endereço completo do Condomínio",
    categoria: "Condomínio",
  },
  {
    chave: "logradouroCondominio",
    label: "Logradouro do Condomínio",
    categoria: "Condomínio",
  },
  {
    chave: "numeroCondominio",
    label: "Número do endereço",
    categoria: "Condomínio",
  },
  {
    chave: "complementoCondominio",
    label: "Complemento",
    categoria: "Condomínio",
  },
  { chave: "bairroCondominio", label: "Bairro", categoria: "Condomínio" },
  { chave: "cidadeCondominio", label: "Cidade", categoria: "Condomínio" },
  { chave: "ufCondominio", label: "UF", categoria: "Condomínio" },
  { chave: "cepCondominio", label: "CEP", categoria: "Condomínio" },
  {
    chave: "telefoneCondominio",
    label: "Telefone do Condomínio",
    categoria: "Condomínio",
  },
  {
    chave: "emailCondominio",
    label: "E-mail do Condomínio",
    categoria: "Condomínio",
  },
  {
    chave: "nomeGestorCondominio",
    label: "Síndico/Gestor ou Responsável cadastrado",
    categoria: "Condomínio",
  },
  {
    chave: "emailGestorCondominio",
    label: "E-mail do Síndico/Gestor ou Responsável",
    categoria: "Condomínio",
  },
  {
    chave: "advogadoResponsavel",
    label: "Advogado Responsável",
    categoria: "Jurídico",
  },
  { chave: "oabAdvogado", label: "OAB do Advogado", categoria: "Jurídico" },
  { chave: "varaCompetente", label: "Vara Competente", categoria: "Jurídico" },
  { chave: "foroComarca", label: "Foro / Comarca", categoria: "Jurídico" },
] as const;

export type ChaveCondominioDocumento =
  (typeof VARIAVEIS_CONDOMINIO)[number]["chave"];
export const CHAVES_CADASTRO_CONDOMINIO: readonly string[] =
  VARIAVEIS_CONDOMINIO.map(v => v.chave);
const chavesCanonicas = new Map(
  VARIAVEIS_CONDOMINIO.map(v => [v.chave.toLowerCase(), v.chave])
);

export interface CadastroCondominioDocumento {
  name?: string | null;
  cnpj?: string | null;
  address?: string | null;
  addressNumber?: string | null;
  addressComplement?: string | null;
  neighborhood?: string | null;
  city?: string | null;
  state?: string | null;
  zipCode?: string | null;
  phone?: string | null;
  email?: string | null;
  managerName?: string | null;
  managerEmail?: string | null;
  juridicoAdvogadoResponsavel?: string | null;
  juridicoAdvogadoOAB?: string | null;
  juridicoVaraCompetente?: string | null;
  juridicoForoComarca?: string | null;
}

export function normalizarChaveModelo(chave: string): string {
  return chavesCanonicas.get(chave.toLowerCase()) ?? chave;
}

export function detectarVariaveisModelo(html: string): string[] {
  const chaves: string[] = [];
  for (const match of Array.from(
    html.matchAll(/\{\{\s*([a-zA-Z_]\w*)\s*\}\}/g)
  )) {
    const chave = normalizarChaveModelo(match[1]);
    if (!chaves.includes(chave)) chaves.push(chave);
  }
  return chaves;
}

export function ehVariavelCondominio(chave: string): boolean {
  return chavesCanonicas.has(chave.toLowerCase());
}

const texto = (valor: string | null | undefined): string =>
  typeof valor === "string" ? valor.trim() : "";

export function comporEnderecoCondominio(
  cadastro: CadastroCondominioDocumento
): string {
  const logradouro = [texto(cadastro.address), texto(cadastro.addressNumber)]
    .filter(Boolean)
    .join(", ");
  const localidade = [texto(cadastro.city), texto(cadastro.state)]
    .filter(Boolean)
    .join(" / ");
  const cep = texto(cadastro.zipCode);
  return [
    logradouro,
    texto(cadastro.addressComplement),
    texto(cadastro.neighborhood),
    localidade,
    cep ? `CEP ${cep}` : "",
  ]
    .filter(Boolean)
    .join(" — ");
}

export function mapearVariaveisCondominio(
  cadastro: CadastroCondominioDocumento,
  chaves: readonly string[] = CHAVES_CADASTRO_CONDOMINIO
): Record<string, string> {
  const mapa: Record<ChaveCondominioDocumento, string> = {
    condominio: texto(cadastro.name),
    nomeCondominio: texto(cadastro.name),
    cnpjCondominio: texto(cadastro.cnpj),
    enderecoCondominio: comporEnderecoCondominio(cadastro),
    logradouroCondominio: texto(cadastro.address),
    numeroCondominio: texto(cadastro.addressNumber),
    complementoCondominio: texto(cadastro.addressComplement),
    bairroCondominio: texto(cadastro.neighborhood),
    cidadeCondominio: texto(cadastro.city),
    ufCondominio: texto(cadastro.state),
    cepCondominio: texto(cadastro.zipCode),
    telefoneCondominio: texto(cadastro.phone),
    emailCondominio: texto(cadastro.email),
    nomeGestorCondominio: texto(cadastro.managerName),
    emailGestorCondominio: texto(cadastro.managerEmail),
    advogadoResponsavel: texto(cadastro.juridicoAdvogadoResponsavel),
    oabAdvogado: texto(cadastro.juridicoAdvogadoOAB),
    varaCompetente: texto(cadastro.juridicoVaraCompetente),
    foroComarca: texto(cadastro.juridicoForoComarca),
  };
  const resultado: Record<string, string> = {};
  for (const original of chaves) {
    const chave = normalizarChaveModelo(original);
    if (ehVariavelCondominio(chave))
      resultado[chave] = mapa[chave as ChaveCondominioDocumento];
  }
  return resultado;
}

export function escaparTextoDocumento(valor: string): string {
  return valor
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Uma única passagem: valores não viram novas variáveis nem markup. */
export function substituirVariaveisTexto(
  html: string,
  valores: Record<string, string>
): string {
  return html.replace(
    /\{\{\s*([a-zA-Z_]\w*)\s*\}\}/g,
    (token: string, original: string) => {
      const chave = normalizarChaveModelo(original);
      return Object.prototype.hasOwnProperty.call(valores, chave)
        ? escaparTextoDocumento(valores[chave])
        : token;
    }
  );
}

export interface DadosPreenchimentoCondominio {
  modeloId: number;
  condominioId: number;
  nomeCondominio: string;
  valores: Record<string, string>;
  camposAusentes: string[];
}

export interface ListaCondominiosPreenchimento {
  modeloId: number;
  condominioVinculadoId: number | null;
  condominios: { id: number; name: string }[];
}
