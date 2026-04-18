/**
 * Hook para formatação automática de telefone brasileiro
 * Formatos suportados:
 *   - (11) 98765-4321  → celular (9 dígitos)
 *   - (11) 3456-7890   → fixo (8 dígitos)
 */
export function formatPhone(value: string): string {
  // Remove tudo que não for dígito
  const digits = value.replace(/\D/g, "").slice(0, 11);

  if (digits.length === 0) return "";
  if (digits.length <= 2) return `(${digits}`;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) {
    // Fixo: (11) 3456-7890
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  // Celular: (11) 98765-4321
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

/**
 * Retorna apenas os dígitos de um telefone formatado
 */
export function unformatPhone(value: string): string {
  return value.replace(/\D/g, "");
}

/**
 * Handler para campo de input que aplica máscara de telefone
 * Uso: <input onChange={handlePhoneChange(setValue)} />
 */
export function handlePhoneChange(
  setter: (value: string) => void
): React.ChangeEventHandler<HTMLInputElement> {
  return (e) => {
    setter(formatPhone(e.target.value));
  };
}
