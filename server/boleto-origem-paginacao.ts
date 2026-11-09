import type { OrigemDividaDocumento } from "./origem-divida-acordo";
import { quebrarTextoOrigemEmLinhas } from "./plano-acordo-pdf";

type ItemOrigem = OrigemDividaDocumento["itens"][number];

export interface TrechoOrigemBoleto {
  item: ItemOrigem;
  indiceItem: number;
  linhas: string[];
  continuacao: boolean;
  altura: number;
}

export interface PaginaOrigemBoleto {
  novaPagina: boolean;
  trechos: TrechoOrigemBoleto[];
}

/**
 * Origem integral em fluxo: primeira página tem o espaço restante do recibo;
 * seguintes usam a área completa após o cabeçalho repetido. A ficha não participa
 * da decisão: será colocada inteira somente depois de todas as linhas/avisos.
 * Mantém a ordem da fonte documental, sem recalcular, resumir ou mutar os itens.
 */
export function paginarOrigemBoleto(
  itens: ItemOrigem[],
  medirTexto: (texto: string) => number,
  opcoes: {
    larguraDescricao: number;
    alturaPrimeiraPagina: number;
    alturaPaginasSeguintes: number;
    alturaLinha?: number;
    padding?: number;
    alturaMinima?: number;
  },
): PaginaOrigemBoleto[] {
  const { larguraDescricao, alturaPrimeiraPagina, alturaPaginasSeguintes,
    alturaLinha = 10, padding = 5, alturaMinima = 22 } = opcoes;
  if (!Number.isFinite(alturaLinha) || alturaLinha <= 0 || !Number.isFinite(padding) || padding < 0
    || !Number.isFinite(alturaMinima) || alturaMinima < 0 || !Number.isFinite(alturaPrimeiraPagina)
    || !Number.isFinite(alturaPaginasSeguintes)
    || alturaPaginasSeguintes < Math.max(alturaMinima, padding * 2 + alturaLinha * 2)) {
    throw new Error("A página da origem deve comportar identificação e uma linha de descrição.");
  }

  const paginas: PaginaOrigemBoleto[] = [];
  let pagina: PaginaOrigemBoleto = { novaPagina: false, trechos: [] };
  let restante = alturaPrimeiraPagina;
  const avancar = () => {
    if (pagina.trechos.length) paginas.push(pagina);
    pagina = { novaPagina: true, trechos: [] };
    restante = alturaPaginasSeguintes;
  };
  const altura = (quantidadeLinhas: number) => Math.max(alturaMinima, padding * 2 + quantidadeLinhas * alturaLinha);

  itens.forEach((item, indiceItem) => {
    const linhas = quebrarTextoOrigemEmLinhas(`#${item.cobrancaId} — ${item.titulo}`, larguraDescricao, medirTexto);
    const alturaIntegral = altura(linhas.length);
    // Uma linha que cabe inteira numa página não é cortada para preencher um resto.
    if (alturaIntegral <= alturaPaginasSeguintes && alturaIntegral > restante) avancar();
    let inicio = 0;
    while (inicio < linhas.length) {
      const continuacao = inicio > 0;
      const identificacao = continuacao ? [`#${item.cobrancaId} — (continuação)`] : [];
      let capacidade = restante < alturaMinima ? 0 : Math.floor((restante - padding * 2) / alturaLinha) - identificacao.length;
      if (capacidade < 1) {
        avancar();
        capacidade = Math.floor((restante - padding * 2) / alturaLinha) - identificacao.length;
      }
      const conteudo = linhas.slice(inicio, inicio + capacidade);
      const linhasTrecho = [...identificacao, ...conteudo];
      const alturaTrecho = altura(linhasTrecho.length);
      pagina.trechos.push({ item, indiceItem, linhas: linhasTrecho, continuacao, altura: alturaTrecho });
      restante -= alturaTrecho;
      inicio += conteudo.length;
    }
  });
  if (pagina.trechos.length) paginas.push(pagina);
  return paginas;
}
