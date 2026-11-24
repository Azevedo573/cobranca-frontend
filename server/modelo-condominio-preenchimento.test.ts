import { describe, expect, it } from "vitest";
import {
  CHAVES_CADASTRO_CONDOMINIO,
  VARIAVEIS_CONDOMINIO,
  comporEnderecoCondominio,
  detectarVariaveisModelo,
  ehVariavelCondominio,
  escaparTextoDocumento,
  mapearVariaveisCondominio,
  normalizarChaveModelo,
  substituirVariaveisTexto,
  type CadastroCondominioDocumento,
} from "../shared/modelo-condominio";

// Dados inteiramente fictícios. Somente helpers puros: sem router, navegador ou DB.
const cadastroCompleto: CadastroCondominioDocumento = {
  name: "  Condomínio Exemplo  ",
  cnpj: "  00.000.000/0000-00  ",
  address: "  Rua de Teste  ",
  addressNumber: "  120  ",
  addressComplement: "  Bloco B  ",
  neighborhood: "  Bairro Exemplo  ",
  city: "  Cidade Fictícia  ",
  state: "  SP  ",
  zipCode: "  00000-000  ",
  phone: "  (00) 0000-0000  ",
  email: "  condominio@example.invalid  ",
  managerName: "  Gestor Fictício  ",
  managerEmail: "  gestor@example.invalid  ",
  juridicoAdvogadoResponsavel: "  Advogado Fictício  ",
  juridicoAdvogadoOAB: "  OAB/TESTE 0000  ",
  juridicoVaraCompetente: "  Vara de Teste  ",
  juridicoForoComarca: "  Comarca Fictícia  ",
};

// Expectativa independente do catálogo: ampliar o DTO acidentalmente deve falhar.
const valoresEsperados = {
  condominio: "Condomínio Exemplo",
  nomeCondominio: "Condomínio Exemplo",
  cnpjCondominio: "00.000.000/0000-00",
  enderecoCondominio:
    "Rua de Teste, 120 — Bloco B — Bairro Exemplo — Cidade Fictícia / SP — CEP 00000-000",
  logradouroCondominio: "Rua de Teste",
  numeroCondominio: "120",
  complementoCondominio: "Bloco B",
  bairroCondominio: "Bairro Exemplo",
  cidadeCondominio: "Cidade Fictícia",
  ufCondominio: "SP",
  cepCondominio: "00000-000",
  telefoneCondominio: "(00) 0000-0000",
  emailCondominio: "condominio@example.invalid",
  nomeGestorCondominio: "Gestor Fictício",
  emailGestorCondominio: "gestor@example.invalid",
  advogadoResponsavel: "Advogado Fictício",
  oabAdvogado: "OAB/TESTE 0000",
  varaCompetente: "Vara de Teste",
  foroComarca: "Comarca Fictícia",
};

const chavesManuaisOuSensiveis = [
  "representanteLegal",
  "assinatura",
  "nomeResponsavel",
  "cpf",
  "cpfSindico",
  "nomeDevedor",
  "numeroProcesso",
  "tipoAcao",
  "valorDivida",
  "username",
  "password",
  "bankAccount",
  "agencia",
  "chavePix",
  "taxaJuros",
  "urlPrivada",
  "observacoes",
];

describe("catálogo e reconhecimento de variáveis do condomínio", () => {
  it("expõe exatamente as chaves cadastrais e jurídicas aprovadas, sem duplicatas", () => {
    const esperadas = Object.keys(valoresEsperados).sort();
    expect([...CHAVES_CADASTRO_CONDOMINIO].sort()).toEqual(esperadas);
    expect(VARIAVEIS_CONDOMINIO.map(item => item.chave).sort()).toEqual(
      esperadas
    );
    expect(new Set(CHAVES_CADASTRO_CONDOMINIO).size).toBe(esperadas.length);
    expect(
      VARIAVEIS_CONDOMINIO.every(item => item.label.trim().length > 0)
    ).toBe(true);
  });

  it("normaliza casing das chaves conhecidas sem confundir as duas aliases do nome", () => {
    expect(normalizarChaveModelo("NOMECONDOMINIO")).toBe("nomeCondominio");
    expect(normalizarChaveModelo("CoNdOmInIo")).toBe("condominio");
    expect(normalizarChaveModelo("OABADVOGADO")).toBe("oabAdvogado");
    expect(ehVariavelCondominio("EMAILGESTORCONDOMINIO")).toBe(true);
  });

  it("preserva nomes desconhecidos e não infere mapeamento por rótulo ou aproximação", () => {
    for (const chave of [
      ...chavesManuaisOuSensiveis,
      "Nome do Condomínio",
      "nome_condominio",
      "condominioNome",
    ]) {
      expect(normalizarChaveModelo(chave)).toBe(chave);
      expect(ehVariavelCondominio(chave)).toBe(false);
    }
  });

  it("detecta placeholders com espaços, tabulações e quebras, normalizando só as chaves conhecidas", () => {
    const html =
      "<p>{{ \n NOMECondominio\t }} / {{ CNPJCONDOMINIO }} / {{ Campo_Manual }}</p>";
    expect(detectarVariaveisModelo(html)).toEqual([
      "nomeCondominio",
      "cnpjCondominio",
      "Campo_Manual",
    ]);
  });

  it("deduplica variáveis em ordem de ocorrência e mantém aliases distintas", () => {
    expect(
      detectarVariaveisModelo(
        "{{cnpjCondominio}} {{condominio}} {{CNPJCONDOMINIO}} {{nomeCondominio}} {{ condominio }} {{campoManual}} {{campoManual}}"
      )
    ).toEqual([
      "cnpjCondominio",
      "condominio",
      "nomeCondominio",
      "campoManual",
    ]);
  });

  it("não interpreta rótulos livres, expressões ou delimitadores incompletos como variáveis", () => {
    expect(
      detectarVariaveisModelo(
        "Nome do Condomínio {{ Nome do Condomínio }} {{nome-condominio}} {{cadastro.name}} {{}} {{123}} {{nomeCondominio}"
      )
    ).toEqual([]);
  });
});

describe("composição do endereço do condomínio", () => {
  it("compõe todos os componentes com separadores consistentes e sem espaços periféricos", () => {
    expect(comporEnderecoCondominio(cadastroCompleto)).toBe(
      valoresEsperados.enderecoCondominio
    );
  });

  const casosParciais: [string, CadastroCondominioDocumento, string][] = [
    ["somente logradouro", { address: " Rua de Teste " }, "Rua de Teste"],
    [
      "somente número sem inventar logradouro",
      { addressNumber: " 120 " },
      "120",
    ],
    [
      "cidade sem UF",
      { address: "Rua de Teste", city: " Cidade Fictícia " },
      "Rua de Teste — Cidade Fictícia",
    ],
    ["UF sem cidade", { state: " SP " }, "SP"],
    ["somente CEP", { zipCode: " 00000-000 " }, "CEP 00000-000"],
    [
      "complemento e bairro sem rua",
      { addressComplement: " Bloco B ", neighborhood: " Bairro Exemplo " },
      "Bloco B — Bairro Exemplo",
    ],
    [
      "número zero cadastrado como texto",
      { address: "Rua de Teste", addressNumber: "0" },
      "Rua de Teste, 0",
    ],
    [
      "componentes ausentes",
      {
        address: null,
        addressNumber: undefined,
        city: " \t ",
        state: null,
        zipCode: "",
      },
      "",
    ],
  ];

  it.each(casosParciais)(
    "compõe endereço parcial: %s",
    (_descricao, cadastro, esperado) => {
      expect(comporEnderecoCondominio(cadastro)).toBe(esperado);
    }
  );
});

describe("mapeamento mínimo dos dados cadastrais", () => {
  it("mapeia cada fonte para a variável exata, preservando aliases, contatos e preenchimento jurídico", () => {
    expect(mapearVariaveisCondominio(cadastroCompleto)).toEqual(
      valoresEsperados
    );
  });

  it("preenche um modelo que contém somente nomeCondominio sem exigir a alias legada", () => {
    const chaves = detectarVariaveisModelo("<p>{{ NOMECondominio }}</p>");
    expect(mapearVariaveisCondominio(cadastroCompleto, chaves)).toEqual({
      nomeCondominio: "Condomínio Exemplo",
    });
  });

  it("preserva o modelo legado que usa somente condominio", () => {
    expect(mapearVariaveisCondominio(cadastroCompleto, ["condominio"])).toEqual(
      {
        condominio: "Condomínio Exemplo",
      }
    );
  });

  it("devolve somente as variáveis presentes, sem carregar campos manuais nem o restante do cadastro", () => {
    const chaves = detectarVariaveisModelo(
      "{{NOMECONDOMINIO}} {{cnpjCondominio}} {{nomeDevedor}} {{representanteLegal}} {{enderecoCondominio}}"
    );
    expect(mapearVariaveisCondominio(cadastroCompleto, chaves)).toEqual({
      nomeCondominio: "Condomínio Exemplo",
      cnpjCondominio: "00.000.000/0000-00",
      enderecoCondominio: valoresEsperados.enderecoCondominio,
    });
    expect(mapearVariaveisCondominio(cadastroCompleto, [])).toEqual({});
  });

  it("normaliza pedidos repetidos com casing diferente sem criar chaves extras", () => {
    expect(
      mapearVariaveisCondominio(cadastroCompleto, [
        "NOMECONDOMINIO",
        "nomeCondominio",
        "NomeCondominio",
      ])
    ).toEqual({
      nomeCondominio: "Condomínio Exemplo",
    });
  });

  it("ignora dados financeiros, credenciais, URLs privadas e PII não autorizados mesmo se pedidos", () => {
    const cadastroComDadosExtras = {
      ...cadastroCompleto,
      username: "usuario-secreto-ficticio",
      password: "senha-secreta-ficticia",
      bankAccount: "conta-ficticia",
      agencia: "agencia-ficticia",
      chavePix: "pix@example.invalid",
      taxaJuros: "9.99",
      valorDivida: "999.99",
      cpf: "000.000.000-00",
      cpfSindico: "000.000.000-00",
      nomeDevedor: "Devedor Fictício",
      numeroProcesso: "processo-ficticio",
      tipoAcao: "acao-ficticia",
      urlPrivada: "https://example.invalid/privado",
      observacoes: "observacao-sigilosa-ficticia",
    };
    expect(mapearVariaveisCondominio(cadastroComDadosExtras)).toEqual(
      valoresEsperados
    );
    expect(
      mapearVariaveisCondominio(
        cadastroComDadosExtras,
        chavesManuaisOuSensiveis
      )
    ).toEqual({});
  });

  it("não lê sequer propriedades sensíveis alheias ao contrato", () => {
    const cadastroComCredencial = Object.defineProperty(
      { name: "Condomínio Exemplo" },
      "password",
      {
        enumerable: true,
        get: () => {
          throw new Error("Credencial fora do contrato não deve ser lida");
        },
      }
    );
    expect(
      mapearVariaveisCondominio(cadastroComCredencial, [
        "nomeCondominio",
        "password",
      ])
    ).toEqual({
      nomeCondominio: "Condomínio Exemplo",
    });
  });

  it.each(["sindico", "administradora"])(
    "não transforma gestor do tipo %s em representante legal ou assinatura",
    tipo => {
      const cadastro = {
        ...cadastroCompleto,
        type: tipo,
        representanteLegal: "Representante manual fictício",
        assinatura: "Assinatura manual fictícia",
        nomeResponsavel: "Responsável manual fictício",
      };
      expect(
        mapearVariaveisCondominio(cadastro, [
          "nomeGestorCondominio",
          "emailGestorCondominio",
          "representanteLegal",
          "assinatura",
          "nomeResponsavel",
        ])
      ).toEqual({
        nomeGestorCondominio: "Gestor Fictício",
        emailGestorCondominio: "gestor@example.invalid",
      });
    }
  );

  it("mantém campos ausentes vazios, sem inventar nome, CNPJ, endereço, OAB ou contato", () => {
    const resultado = mapearVariaveisCondominio({
      name: null,
      cnpj: undefined,
      address: "  ",
      managerName: "\n\t",
      juridicoAdvogadoOAB: null,
    });
    expect(resultado).toEqual(
      Object.fromEntries(
        Object.keys(valoresEsperados).map(chave => [chave, ""])
      )
    );
    expect(
      Object.values(resultado).every(valor => typeof valor === "string")
    ).toBe(true);
  });

  it("novo cadastro sem CNPJ e OAB produz valores vazios em vez de reutilizar o mapeamento anterior", () => {
    const chaves = ["condominio", "cnpjCondominio", "oabAdvogado"];
    const anterior = mapearVariaveisCondominio(cadastroCompleto, chaves);
    expect(
      mapearVariaveisCondominio({ name: "Condomínio B Fictício" }, chaves)
    ).toEqual({
      condominio: "Condomínio B Fictício",
      cnpjCondominio: "",
      oabAdvogado: "",
    });
    expect(anterior).toEqual({
      condominio: "Condomínio Exemplo",
      cnpjCondominio: "00.000.000/0000-00",
      oabAdvogado: "OAB/TESTE 0000",
    });
  });

  it("não converte tipos inválidos recebidos em runtime em texto fictício, HTML ou [object Object]", () => {
    // Simula um contrato inválido na fronteira, sem afrouxar os tipos de produção.
    const cadastroInvalido = {
      name: false,
      cnpj: 123,
      address: { html: "<script>teste</script>" },
      addressNumber: 0,
      phone: ["telefone-ficticio"],
      managerName: null,
    } as unknown as CadastroCondominioDocumento;
    expect(
      mapearVariaveisCondominio(cadastroInvalido, [
        "nomeCondominio",
        "cnpjCondominio",
        "enderecoCondominio",
        "numeroCondominio",
        "telefoneCondominio",
        "nomeGestorCondominio",
      ])
    ).toEqual({
      nomeCondominio: "",
      cnpjCondominio: "",
      enderecoCondominio: "",
      numeroCondominio: "",
      telefoneCondominio: "",
      nomeGestorCondominio: "",
    });
  });

  it("não altera o cadastro e preserva o CNPJ cadastrado sem validar, corrigir ou inventar número", () => {
    const cadastro = Object.freeze({
      name: " Condomínio Fictício ",
      cnpj: " CNPJ não validado ",
    });
    expect(
      mapearVariaveisCondominio(cadastro, ["nomeCondominio", "cnpjCondominio"])
    ).toEqual({
      nomeCondominio: "Condomínio Fictício",
      cnpjCondominio: "CNPJ não validado",
    });
    expect(cadastro).toEqual({
      name: " Condomínio Fictício ",
      cnpj: " CNPJ não validado ",
    });
  });
});

describe("escape e substituição textual segura no documento", () => {
  it("escapa markup, aspas, apóstrofos e entidades como texto, sem decodificar HTML preexistente", () => {
    expect(
      escaparTextoDocumento(
        `<script title="teste">D'Água & Cia</script> &amp; &#39;`
      )
    ).toBe(
      "&lt;script title=&quot;teste&quot;&gt;D&#39;Água &amp; Cia&lt;/script&gt; &amp;amp; &amp;#39;"
    );
  });

  it("mantém texto comum, acentos, quebras de linha e vazio", () => {
    expect(escaparTextoDocumento("Condomínio São João\nRua de Teste")).toBe(
      "Condomínio São João\nRua de Teste"
    );
    expect(escaparTextoDocumento("")).toBe("");
  });

  it("substitui ocorrências repetidas com whitespace/casing e conserva a formatação HTML do modelo", () => {
    const html =
      '<p class="modelo"><strong>{{ NOMECONDOMINIO }}</strong> / {{nomeCondominio}} / {{\ncondominio\t}}</p>';
    const valores = mapearVariaveisCondominio(
      { name: 'Exemplo & "Teste"' },
      detectarVariaveisModelo(html)
    );
    expect(substituirVariaveisTexto(html, valores)).toBe(
      '<p class="modelo"><strong>Exemplo &amp; &quot;Teste&quot;</strong> / Exemplo &amp; &quot;Teste&quot; / Exemplo &amp; &quot;Teste&quot;</p>'
    );
  });

  it("preserva placeholders desconhecidos e manuais, distinguindo falta de valor de string vazia", () => {
    const html =
      "{{ nomeCondominio }}|{{ cnpjCondominio }}|{{ representanteLegal }}|{{ Campo_Manual }}";
    expect(
      substituirVariaveisTexto(html, {
        nomeCondominio: "Condomínio Fictício",
        cnpjCondominio: "",
      })
    ).toBe("Condomínio Fictício||{{ representanteLegal }}|{{ Campo_Manual }}");
  });

  it("permite texto manual explicitamente revisado sem inferi-lo do gestor cadastrado", () => {
    const html = "{{nomeGestorCondominio}} / {{representanteLegal}}";
    const valores = {
      ...mapearVariaveisCondominio(
        cadastroCompleto,
        detectarVariaveisModelo(html)
      ),
      representanteLegal: "Representante revisado <manual>",
    };
    expect(substituirVariaveisTexto(html, valores)).toBe(
      "Gestor Fictício / Representante revisado &lt;manual&gt;"
    );
  });

  it("não executa substituições recursivas quando um valor cadastral contém outra variável", () => {
    const html = "<p>{{nomeCondominio}} / {{cnpjCondominio}}</p>";
    expect(
      substituirVariaveisTexto(html, {
        nomeCondominio: "Literal {{cnpjCondominio}} e {{notrecursive}}",
        cnpjCondominio: "00.000.000/0000-00",
        notrecursive: "NÃO DEVE SER INSERIDO",
      })
    ).toBe(
      "<p>Literal {{cnpjCondominio}} e {{notrecursive}} / 00.000.000/0000-00</p>"
    );
  });

  it("trata $&, $1, $` e $' como valores literais, não como instruções do replace", () => {
    expect(
      substituirVariaveisTexto("<p>{{nomeCondominio}}</p>", {
        nomeCondominio: "$& | $1 | $` | $'",
      })
    ).toBe("<p>$&amp; | $1 | $` | $&#39;</p>");
  });

  it("não usa propriedades herdadas nem nomes de protótipo como valores do documento", () => {
    const valores = Object.create({
      nomeCondominio: "Valor herdado indevido",
    }) as Record<string, string>;
    valores.cnpjCondominio = "CNPJ revisado";
    expect(
      substituirVariaveisTexto(
        "{{nomeCondominio}} / {{cnpjCondominio}} / {{constructor}} / {{toString}} / {{__proto__}}",
        valores
      )
    ).toBe(
      "{{nomeCondominio}} / CNPJ revisado / {{constructor}} / {{toString}} / {{__proto__}}"
    );
  });

  it("mantém modelo sem variáveis intacto e não altera o mapa de valores revisados", () => {
    const valores = Object.freeze({ nomeCondominio: "<Nome revisado>" });
    const html = '<h1 class="titulo">Documento estático &amp; exemplo</h1>';
    expect(substituirVariaveisTexto(html, valores)).toBe(html);
    expect(substituirVariaveisTexto("{{nomeCondominio}}", valores)).toBe(
      "&lt;Nome revisado&gt;"
    );
    expect(valores).toEqual({ nomeCondominio: "<Nome revisado>" });
  });
});
