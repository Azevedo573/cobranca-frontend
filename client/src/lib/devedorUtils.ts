/**
 * Utilitários para formatação de dados de devedores
 */

export interface DevedorIdentificador {
  name?: string | null;
  bloco?: string | null;
  unitNumber: string;
}

/**
 * Retorna o identificador do devedor: Nome se disponível, senão "Bloco X - Apto Y"
 * 
 * @param devedor - Objeto com name, bloco e unitNumber
 * @returns String formatada para identificar o devedor
 * 
 * @example
 * getDevedorIdentificador({ name: "João Silva", unitNumber: "101" })
 * // "João Silva"
 * 
 * getDevedorIdentificador({ name: null, bloco: "A", unitNumber: "101" })
 * // "Bloco A - Apto 101"
 * 
 * getDevedorIdentificador({ name: null, bloco: null, unitNumber: "101" })
 * // "Apto 101"
 */
export function getDevedorIdentificador(devedor: DevedorIdentificador): string {
  // Se tem nome, retorna o nome
  if (devedor.name?.trim()) {
    return devedor.name.trim();
  }

  // Se tem bloco e unidade, retorna "Bloco X - Apto Y"
  if (devedor.bloco?.trim()) {
    return `Bloco ${devedor.bloco.trim()} - Apto ${devedor.unitNumber}`;
  }

  // Se só tem unidade, retorna "Apto Y"
  return `Apto ${devedor.unitNumber}`;
}

/**
 * Retorna descrição curta do devedor para uso em labels e títulos
 * 
 * @param devedor - Objeto com name, bloco e unitNumber
 * @returns String formatada curta
 * 
 * @example
 * getDevedorLabel({ name: "João Silva", unitNumber: "101" })
 * // "João Silva (Apto 101)"
 * 
 * getDevedorLabel({ name: null, bloco: "A", unitNumber: "101" })
 * // "Bloco A - Apto 101"
 */
export function getDevedorLabel(devedor: DevedorIdentificador): string {
  const identificador = getDevedorIdentificador(devedor);
  
  // Se usou o nome, adiciona a unidade entre parênteses
  if (devedor.name?.trim()) {
    const unidade = devedor.bloco?.trim() 
      ? `Bloco ${devedor.bloco.trim()} - Apto ${devedor.unitNumber}`
      : `Apto ${devedor.unitNumber}`;
    return `${identificador} (${unidade})`;
  }

  // Se não tem nome, o identificador já é a unidade
  return identificador;
}
