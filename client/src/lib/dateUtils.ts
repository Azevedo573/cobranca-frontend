import { format } from "date-fns";

/**
 * Formata uma data de vencimento (dueDate) para exibição no formato DD/MM/YYYY.
 *
 * PROBLEMA: Datas armazenadas no banco como UTC meia-noite (ex: 2023-10-10T00:00:00Z)
 * são exibidas um dia antes no browser em UTC-3 (ex: 09/10/2023), pois o JavaScript
 * converte automaticamente para o fuso local ao criar um objeto Date.
 *
 * SOLUÇÃO: Compensar o offset do fuso horário antes de formatar, garantindo que
 * a data exibida seja sempre a mesma que foi armazenada.
 *
 * @param date - Data a ser formatada (Date, string ou null/undefined)
 * @param fallback - Valor padrão quando a data é nula (padrão: "-")
 */
export function formatarDataVencimento(
  date: Date | string | null | undefined,
  fallback = "-"
): string {
  if (!date) return fallback;
  const d = new Date(date);
  if (isNaN(d.getTime())) return fallback;
  // Compensar offset do fuso horário local para exibir a data UTC correta
  const compensada = new Date(d.getTime() + d.getTimezoneOffset() * 60000);
  return format(compensada, "dd/MM/yyyy");
}

/**
 * Versão com hora para timestamps completos (ex: createdAt, updatedAt).
 * Não aplica compensação de fuso — usa o horário local diretamente.
 */
export function formatarDataHora(
  date: Date | string | null | undefined,
  fallback = "-"
): string {
  if (!date) return fallback;
  const d = new Date(date);
  if (isNaN(d.getTime())) return fallback;
  return format(d, "dd/MM/yyyy HH:mm");
}
