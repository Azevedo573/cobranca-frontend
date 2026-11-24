import { describe, expect, it } from "vitest";
import {
  criarFormularioModelo,
  editarCampoModelo,
  selecionarCondominioModelo,
  aplicarDadosCondominioModelo,
  falharDadosCondominioModelo,
  precisaConfirmarTroca,
  camposPendentesModelo,
  criarHtmlDocumentoModelo,
} from "../client/src/lib/modelo-condominio-form";
import type { DadosPreenchimentoCondominio } from "../shared/modelo-condominio";

const chaves = [
  "nomeCondominio",
  "cnpjCondominio",
  "oabAdvogado",
  "representanteLegal",
  "dataDocumento",
];
const inicial = () =>
  criarFormularioModelo(
    "usuario-1",
    10,
    chaves,
    new Date("2026-11-23T12:00:00Z")
  );
const dados = (
  id = 1,
  values: Record<string, string> = {
    nomeCondominio: "Condomínio Alfa",
    cnpjCondominio: "CNPJ fictício",
    oabAdvogado: "OAB fictícia",
  }
): DadosPreenchimentoCondominio => ({
  modeloId: 10,
  condominioId: id,
  nomeCondominio: `Fonte ${id}`,
  valores: values,
  camposAusentes: Object.keys(values).filter(key => !values[key]),
});
const preenchido = () =>
  aplicarDadosCondominioModelo(
    selecionarCondominioModelo(inicial(), 1),
    dados(),
    1,
    "usuario-1"
  );

describe("estado puro do preenchimento documental", () => {
  it("inicializa apenas variáveis presentes, com data atual e fonte manual independente", () => {
    expect(inicial().valores).toEqual({
      nomeCondominio: "",
      cnpjCondominio: "",
      oabAdvogado: "",
      representanteLegal: "",
      dataDocumento: "23/11/2026",
    });
    expect(inicial().condominioId).toBeNull();
    expect(criarFormularioModelo("outro", 20, []).valores).toEqual({});
  });
  it("modelo que contém apenas nomeCondominio tem campo vinculado sem condominio legado", () => {
    expect(
      criarFormularioModelo("id", 2, ["NOMECONDOMINIO"]).vinculados
    ).toEqual(["nomeCondominio"]);
  });
  it("preenche cadastro e identifica origens, sem inferir representante legal", () => {
    const state = preenchido();
    expect(state.status).toBe("pronto");
    expect(state.origens.nomeCondominio).toBe("cadastro");
    expect(state.valores.representanteLegal).toBe("");
    expect(state.valores.nomeCondominio).toBe("Condomínio Alfa");
  });
  it("preserva edição manual na resposta repetida/refetch da mesma seleção", () => {
    const edited = editarCampoModelo(
      preenchido(),
      "nomeCondominio",
      "Nome revisado ** _ <manual>"
    );
    const result = aplicarDadosCondominioModelo(
      edited,
      dados(),
      1,
      "usuario-1"
    );
    expect(result.valores.nomeCondominio).toBe("Nome revisado ** _ <manual>");
    expect(result.origens.nomeCondominio).toBe("manual");
    expect(result.editados).toContain("nomeCondominio");
  });
  it("troca cancelada não produz transição e exige confirmação para vinculados editados", () => {
    const edited = editarCampoModelo(
      preenchido(),
      "oabAdvogado",
      "OAB editada"
    );
    const snapshot = structuredClone(edited);
    expect(precisaConfirmarTroca(edited, 2)).toBe(true);
    expect(precisaConfirmarTroca(edited, 1)).toBe(false);
    expect(edited).toEqual(snapshot);
  });
  it("edição independente não exige confirmação de troca", () => {
    expect(
      precisaConfirmarTroca(
        editarCampoModelo(preenchido(), "representanteLegal", "Pessoa manual"),
        2
      )
    ).toBe(false);
  });
  it("troca confirmada limpa vinculados imediatamente, conserva independentes e limpa campos ausentes", () => {
    const first = editarCampoModelo(
      editarCampoModelo(
        preenchido(),
        "representanteLegal",
        "Representante manual"
      ),
      "oabAdvogado",
      "Editado"
    );
    const loading = selecionarCondominioModelo(first, 2);
    expect(loading.status).toBe("carregando");
    expect(loading.valores.oabAdvogado).toBe("");
    expect(loading.valores.nomeCondominio).toBe("");
    expect(loading.valores.representanteLegal).toBe("Representante manual");
    expect(loading.nomeFonte).toBe("");
    const ready = aplicarDadosCondominioModelo(
      loading,
      dados(2, {
        nomeCondominio: "Condomínio Beta",
        cnpjCondominio: "",
        oabAdvogado: "",
      }),
      2,
      "usuario-1"
    );
    expect(ready.valores.cnpjCondominio).toBe("");
    expect(ready.origens.oabAdvogado).toBe("ausente");
    expect(ready.editados).not.toContain("oabAdvogado");
    expect(first.valores.oabAdvogado).toBe("Editado");
  });
  it.each(["modelo", "condominio", "revisao", "identidade"])(
    "descarta resposta tardia por %s",
    reason => {
      const state = selecionarCondominioModelo(preenchido(), 2);
      const response = dados(2);
      if (reason === "modelo") response.modeloId = 11;
      if (reason === "condominio") response.condominioId = 1;
      expect(
        aplicarDadosCondominioModelo(
          state,
          response,
          reason === "revisao" ? 1 : 2,
          reason === "identidade" ? "outro" : "usuario-1"
        )
      ).toBe(state);
    }
  );
  it("A→B→A não aceita resposta antiga de A com revisão anterior", () => {
    const state = selecionarCondominioModelo(
      selecionarCondominioModelo(preenchido(), 2),
      1
    );
    expect(aplicarDadosCondominioModelo(state, dados(), 1, "usuario-1")).toBe(
      state
    );
    expect(
      aplicarDadosCondominioModelo(state, dados(), 3, "usuario-1").status
    ).toBe("pronto");
  });
  it("erro invalida fonte, remove valores vinculados e impede ressuscitar resposta da mesma revisão", () => {
    const failed = falharDadosCondominioModelo(preenchido(), 1);
    expect(failed.status).toBe("erro");
    expect(failed.valores.nomeCondominio).toBe("");
    expect(aplicarDadosCondominioModelo(failed, dados(), 1, "usuario-1")).toBe(
      failed
    );
    expect(falharDadosCondominioModelo(preenchido(), 0).status).toBe("pronto");
  });
  it("repetir seleção não limpa revisões, edição nem fonte atual", () => {
    const edited = editarCampoModelo(
      preenchido(),
      "nomeCondominio",
      "revisado"
    );
    expect(selecionarCondominioModelo(edited, 1)).toBe(edited);
  });
  it("trocar modelo/identidade recria o formulário sem dados privados anteriores", () => {
    const next = criarFormularioModelo("usuario-2", 11, chaves);
    expect(next.condominioId).toBeNull();
    expect(next.nomeFonte).toBe("");
    expect(next.valores.nomeCondominio).toBe("");
    expect(next.editados).toEqual([]);
  });
  it("não aceita alteração em variável fora do modelo nem propriedades herdadas", () => {
    const initial = inicial();
    expect(editarCampoModelo(initial, "password", "não inserir")).toBe(initial);
    const response = dados();
    response.valores = Object.create({ nomeCondominio: "herdado" });
    expect(
      aplicarDadosCondominioModelo(
        selecionarCondominioModelo(initial, 1),
        response,
        1,
        "usuario-1"
      ).valores.nomeCondominio
    ).toBe("");
  });
  it("aponta apenas campos vazios para revisão sem inventar obrigatoriedade legal", () => {
    expect(camposPendentesModelo(preenchido())).toEqual(["representanteLegal"]);
    expect(
      camposPendentesModelo(
        editarCampoModelo(preenchido(), "representanteLegal", "  ")
      )
    ).toEqual(["representanteLegal"]);
  });
});

describe("documento HTML compartilhado entre prévia e impressão", () => {
  it("uma passagem conserva texto revisado e escapa título, aspas, tags e entidades", () => {
    const html = criarHtmlDocumentoModelo(
      "<Título & Teste>",
      "<p><strong>{{nomeCondominio}}</strong></p>",
      {
        nomeCondominio: `D'Água &amp; <script>teste</script> **_ $& {{cnpjCondominio}}`,
      }
    );
    expect(html).toContain("<title>&lt;Título &amp; Teste&gt;</title>");
    expect(html).toContain(
      "<strong>D&#39;Água &amp;amp; &lt;script&gt;teste&lt;/script&gt; **_ $&amp; {{cnpjCondominio}}</strong>"
    );
    expect(html).toContain("Content-Security-Policy");
    expect(html).toContain("default-src 'none'");
  });
});
