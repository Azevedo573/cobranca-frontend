export interface EnderecoSacadoInput {
  address?: string | null;
  addressNumber?: string | null;
  addressComplement?: string | null;
  neighborhood?: string | null;
  city?: string | null;
  state?: string | null;
  zipCode?: string | null;
}

export interface EnderecoSacadoFormatado {
  endereco: string;
  cidade: string;
  uf: string;
  cep: string;
}

function limpar(valor: string | null | undefined): string {
  return valor?.trim() ?? "";
}

/**
 * Compõe o endereço do pagador sem usar endereço do condomínio como fallback.
 * Para CNAB, o banco exige que endereço, cidade, UF e CEP sejam informações do sacado.
 */
export function formatarEnderecoSacado(input: EnderecoSacadoInput): EnderecoSacadoFormatado {
  const logradouro = limpar(input.address);
  const numero = limpar(input.addressNumber);
  const complemento = limpar(input.addressComplement);
  const bairro = limpar(input.neighborhood);
  const endereco = [logradouro, numero, complemento, bairro].filter(Boolean).join(", ");

  return {
    endereco,
    cidade: limpar(input.city),
    uf: limpar(input.state).toUpperCase().slice(0, 2),
    cep: limpar(input.zipCode).replace(/\D/g, ""),
  };
}

export function validarEnderecoSacadoParaCNAB(endereco: EnderecoSacadoFormatado): void {
  if (!endereco.endereco || !endereco.cidade || endereco.uf.length !== 2 || endereco.cep.length !== 8) {
    throw new Error("O devedor deve possuir endereço, cidade, UF e CEP válidos antes da geração da remessa CNAB.");
  }
}
