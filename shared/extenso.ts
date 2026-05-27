/**
 * Converte um valor monetário (em reais) para extenso em português brasileiro.
 * Ex: 1493.20 => "um mil quatrocentos e noventa e três reais e vinte centavos"
 */

const unidades = [
  "", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove",
  "dez", "onze", "doze", "treze", "quatorze", "quinze", "dezesseis", "dezessete", "dezoito", "dezenove",
];

const dezenas = [
  "", "", "vinte", "trinta", "quarenta", "cinquenta",
  "sessenta", "setenta", "oitenta", "noventa",
];

const centenas = [
  "", "cem", "duzentos", "trezentos", "quatrocentos", "quinhentos",
  "seiscentos", "setecentos", "oitocentos", "novecentos",
];

function grupo(n: number): string {
  // Converte um número de 0 a 999 para extenso
  if (n === 0) return "";
  const partes: string[] = [];

  if (n >= 100) {
    const c = Math.floor(n / 100);
    const resto = n % 100;
    if (c === 1 && resto > 0) {
      partes.push("cento");
    } else {
      partes.push(centenas[c]);
    }
    n = resto;
  }

  if (n >= 20) {
    const d = Math.floor(n / 10);
    const u = n % 10;
    if (u > 0) {
      partes.push(dezenas[d] + " e " + unidades[u]);
    } else {
      partes.push(dezenas[d]);
    }
  } else if (n > 0) {
    partes.push(unidades[n]);
  }

  return partes.join(" e ");
}

function inteiroParaExtenso(n: number): string {
  if (n === 0) return "zero";

  const partes: string[] = [];

  if (n >= 1_000_000_000) {
    const bi = Math.floor(n / 1_000_000_000);
    const ext = grupo(bi);
    partes.push(ext + (bi === 1 ? " bilhão" : " bilhões"));
    n %= 1_000_000_000;
  }

  if (n >= 1_000_000) {
    const mi = Math.floor(n / 1_000_000);
    const ext = grupo(mi);
    partes.push(ext + (mi === 1 ? " milhão" : " milhões"));
    n %= 1_000_000;
  }

  if (n >= 1_000) {
    const mi = Math.floor(n / 1_000);
    if (mi === 1) {
      partes.push("um mil");
    } else {
      partes.push(grupo(mi) + " mil");
    }
    n %= 1_000;
  }

  if (n > 0) {
    partes.push(grupo(n));
  }

  if (partes.length === 1) return partes[0];

  // Usa "e" antes da última parte se ela for < 100 (sem centenas próprias)
  // ou se a última parte for centenas redondas
  const ultimo = partes[partes.length - 1];
  const anterior = partes.slice(0, -1).join(", ");
  return anterior + " e " + ultimo;
}

/**
 * Normaliza uma string de valor monetário para um número float.
 * Aceita: "R$ 1.493,20", "1.493,20", "1493.20", 1493.20
 */
function normalizarValor(valor: string | number): number {
  if (typeof valor === "number") return valor;

  let str = valor
    .replace(/R\$\s*/g, "")
    .trim();

  // Detectar formato brasileiro (vírgula como decimal): "1.493,20"
  // vs formato americano (ponto como decimal): "1493.20"
  const temVirgula = str.includes(",");
  const temPonto = str.includes(".");

  if (temVirgula) {
    // Formato brasileiro: remover pontos de milhar, trocar vírgula por ponto
    str = str.replace(/\./g, "").replace(",", ".");
  } else if (temPonto) {
    // Pode ser americano (1493.20) ou milhar sem decimal (1.493)
    const partesPonto = str.split(".");
    if (partesPonto.length === 2 && partesPonto[1].length <= 2) {
      // Decimal americano: "1493.20" ou "1.20"
      // Não fazer nada
    } else {
      // Milhar sem decimal: "1.493" → remover pontos
      str = str.replace(/\./g, "");
    }
  }

  return parseFloat(str);
}

/**
 * Converte um valor monetário para extenso em português.
 * Aceita string formatada ("R$ 1.493,20"), número (1493.20) ou string numérica.
 */
export function valorPorExtenso(valor: string | number): string {
  const num = normalizarValor(valor);
  if (isNaN(num) || num < 0) return "";

  const reais = Math.floor(num);
  const centavos = Math.round((num - reais) * 100);

  const partes: string[] = [];

  if (reais > 0) {
    const ext = inteiroParaExtenso(reais);
    // Valores exatos de milhão/bilhão usam "de reais" por norma culta
    const usaDe = reais >= 1_000_000 && reais % 1_000_000 === 0;
    partes.push(ext + (reais === 1 ? " real" : (usaDe ? " de reais" : " reais")));
  }

  if (centavos > 0) {
    const ext = inteiroParaExtenso(centavos);
    partes.push(ext + (centavos === 1 ? " centavo" : " centavos"));
  }

  if (partes.length === 0) return "zero reais";
  return partes.join(" e ");
}

/**
 * Converte a data atual (ou uma data fornecida) para extenso em português.
 * Ex: new Date("2026-05-26") => "vinte e seis de maio de dois mil e vinte e seis"
 */
export function dataPorExtenso(data?: Date): string {
  const d = data ?? new Date();
  const dia = d.getDate();
  const ano = d.getFullYear();
  const meses = [
    "janeiro", "fevereiro", "março", "abril", "maio", "junho",
    "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
  ];
  const mes = meses[d.getMonth()];
  return `${inteiroParaExtenso(dia)} de ${mes} de ${inteiroParaExtenso(ano)}`;
}
