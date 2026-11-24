import { TRPCError } from "@trpc/server";
import { and, asc, eq, inArray } from "drizzle-orm";
import {
  condominios,
  modelosDocumento,
  type ModeloDocumento,
} from "../drizzle/schema";
import {
  detectarVariaveisModelo,
  ehVariavelCondominio,
  mapearVariaveisCondominio,
  type CadastroCondominioDocumento,
  type ChaveCondominioDocumento,
  type DadosPreenchimentoCondominio,
  type ListaCondominiosPreenchimento,
} from "../shared/modelo-condominio";
import { getDb } from "./db";
import { hasPermission } from "./rbac";
import {
  getCarteiraCondominialAtual,
  type CarteiraCondominial,
  type TenantActor,
} from "./tenant-guard";

// Apenas estes erros locais podem atravessar a fronteira do serviço. Erros das
// dependências nunca transportam mensagem, payload, stack original ou cause.
class ErroPreenchimento extends TRPCError {
  constructor(code: "FORBIDDEN" | "BAD_REQUEST" | "INTERNAL_SERVER_ERROR") {
    const mensagens = {
      FORBIDDEN: "Acesso ao preenchimento não autorizado.",
      BAD_REQUEST: "Selecione um condomínio para preencher este modelo.",
      INTERNAL_SERVER_ERROR:
        "Não foi possível verificar o preenchimento do modelo.",
    };
    super({ code, message: mensagens[code] });
  }
}

async function proteger<T>(operacao: () => Promise<T>): Promise<T> {
  try {
    return await operacao();
  } catch (erro) {
    if (erro instanceof ErroPreenchimento) throw erro;
    throw new ErroPreenchimento("INTERNAL_SERVER_ERROR");
  }
}

function validarId(id: number): void {
  if (!Number.isSafeInteger(id) || id <= 0)
    throw new ErroPreenchimento("FORBIDDEN");
}

type Db = NonNullable<Awaited<ReturnType<typeof getDb>>>;
type Contexto = { db: Db; carteira: CarteiraCondominial };
type ModeloPreenchimento = Pick<
  ModeloDocumento,
  "id" | "condominioId" | "ativo" | "conteudoHtml"
>;

async function autorizar(
  actor: TenantActor,
  modeloId: number
): Promise<Contexto> {
  validarId(actor.id);
  validarId(modeloId);
  let carteira: CarteiraCondominial;
  try {
    carteira = await getCarteiraCondominialAtual(actor);
  } catch (erro) {
    // Tenant-guard já distingue identidade revogada de falha de infraestrutura.
    // Recriar o erro evita propagar detalhes de qualquer dependência.
    throw new ErroPreenchimento(
      erro instanceof TRPCError && erro.code === "FORBIDDEN"
        ? "FORBIDDEN"
        : "INTERNAL_SERVER_ERROR"
    );
  }
  const identidade = carteira.actor;
  if (
    !["admin", "cobrador", "colaborador", "advogado"].includes(identidade.role)
  ) {
    throw new ErroPreenchimento("FORBIDDEN");
  }
  if (
    !(await hasPermission(
      identidade.id,
      identidade.role,
      "modelos_documento",
      "visualizar"
    ))
  ) {
    throw new ErroPreenchimento("FORBIDDEN");
  }
  if (identidade.role !== "admin" && carteira.ids.length === 0) {
    throw new ErroPreenchimento("FORBIDDEN");
  }
  const db = await getDb();
  if (!db) throw new ErroPreenchimento("INTERNAL_SERVER_ERROR");
  return { db, carteira };
}

function carregarModelo(
  contexto: Contexto,
  modeloId: number,
  completo: true
): Promise<ModeloDocumento>;
function carregarModelo(
  contexto: Contexto,
  modeloId: number,
  completo?: false
): Promise<ModeloPreenchimento>;
async function carregarModelo(
  contexto: Contexto,
  modeloId: number,
  completo = false
): Promise<ModeloPreenchimento> {
  const { db, carteira } = contexto;
  const consulta = completo
    ? db.select()
    : db.select({
        id: modelosDocumento.id,
        condominioId: modelosDocumento.condominioId,
        ativo: modelosDocumento.ativo,
        conteudoHtml: modelosDocumento.conteudoHtml,
      });
  const [modelo] = await consulta
    .from(modelosDocumento)
    .where(
      and(eq(modelosDocumento.id, modeloId), eq(modelosDocumento.ativo, 1))
    )
    .limit(1);
  if (!modelo || modelo.id !== modeloId || modelo.ativo !== 1) {
    throw new ErroPreenchimento("FORBIDDEN");
  }
  // Somente NULL é compartilhado. Autoria e condomínio principal legado não
  // substituem vínculo, nem permitem que admin ignore o vínculo do modelo.
  if (modelo.condominioId !== null) {
    validarId(modelo.condominioId);
    if (
      carteira.actor.role !== "admin" &&
      !carteira.ids.includes(modelo.condominioId)
    ) {
      throw new ErroPreenchimento("FORBIDDEN");
    }
  }
  return modelo;
}

function filtroCadastro(
  contexto: Contexto,
  modelo: ModeloPreenchimento,
  condominioId?: number
) {
  const filtros = [eq(condominios.statusCadastro, "ativo")];
  if (contexto.carteira.actor.role !== "admin") {
    filtros.push(inArray(condominios.id, contexto.carteira.ids));
  }
  if (modelo.condominioId !== null)
    filtros.push(eq(condominios.id, modelo.condominioId));
  if (condominioId !== undefined) {
    if (
      (modelo.condominioId !== null && modelo.condominioId !== condominioId) ||
      (contexto.carteira.actor.role !== "admin" &&
        !contexto.carteira.ids.includes(condominioId))
    ) {
      throw new ErroPreenchimento("FORBIDDEN");
    }
    filtros.push(eq(condominios.id, condominioId));
  }
  return and(...filtros);
}

// Allowlist explícita: nenhuma coluna financeira, URL, credencial ou observação
// jurídica pode entrar na projeção, nem mesmo por variável desconhecida.
const colunasCadastro = {
  name: condominios.name,
  cnpj: condominios.cnpj,
  address: condominios.address,
  addressNumber: condominios.addressNumber,
  addressComplement: condominios.addressComplement,
  neighborhood: condominios.neighborhood,
  city: condominios.city,
  state: condominios.state,
  zipCode: condominios.zipCode,
  phone: condominios.phone,
  email: condominios.email,
  managerName: condominios.managerName,
  managerEmail: condominios.managerEmail,
  juridicoAdvogadoResponsavel: condominios.juridicoAdvogadoResponsavel,
  juridicoAdvogadoOAB: condominios.juridicoAdvogadoOAB,
  juridicoVaraCompetente: condominios.juridicoVaraCompetente,
  juridicoForoComarca: condominios.juridicoForoComarca,
} satisfies Record<keyof CadastroCondominioDocumento, unknown>;

const dependencias = {
  condominio: ["name"],
  nomeCondominio: ["name"],
  cnpjCondominio: ["cnpj"],
  enderecoCondominio: [
    "address",
    "addressNumber",
    "addressComplement",
    "neighborhood",
    "city",
    "state",
    "zipCode",
  ],
  logradouroCondominio: ["address"],
  numeroCondominio: ["addressNumber"],
  complementoCondominio: ["addressComplement"],
  bairroCondominio: ["neighborhood"],
  cidadeCondominio: ["city"],
  ufCondominio: ["state"],
  cepCondominio: ["zipCode"],
  telefoneCondominio: ["phone"],
  emailCondominio: ["email"],
  nomeGestorCondominio: ["managerName"],
  emailGestorCondominio: ["managerEmail"],
  advogadoResponsavel: ["juridicoAdvogadoResponsavel"],
  oabAdvogado: ["juridicoAdvogadoOAB"],
  varaCompetente: ["juridicoVaraCompetente"],
  foroComarca: ["juridicoForoComarca"],
} satisfies Record<
  ChaveCondominioDocumento,
  readonly (keyof CadastroCondominioDocumento)[]
>;

function variaveisCadastro(
  modelo: ModeloPreenchimento
): ChaveCondominioDocumento[] {
  return detectarVariaveisModelo(modelo.conteudoHtml).filter(
    (chave): chave is ChaveCondominioDocumento => ehVariavelCondominio(chave)
  );
}

export async function listarCondominiosPreenchimento(
  actor: TenantActor,
  modeloId: number
): Promise<ListaCondominiosPreenchimento> {
  return proteger(async () => {
    const contexto = await autorizar(actor, modeloId);
    const modelo = await carregarModelo(contexto, modeloId);
    const lista = await contexto.db
      .select({ id: condominios.id, name: condominios.name })
      .from(condominios)
      .where(filtroCadastro(contexto, modelo))
      .orderBy(asc(condominios.name));
    if (modelo.condominioId !== null && lista.length === 0)
      throw new ErroPreenchimento("FORBIDDEN");
    return {
      modeloId,
      condominioVinculadoId: modelo.condominioId,
      condominios: lista,
    };
  });
}

export async function obterDadosPreenchimento(
  actor: TenantActor,
  modeloId: number,
  condominioId: number
): Promise<DadosPreenchimentoCondominio> {
  return proteger(async () => {
    validarId(condominioId);
    const contexto = await autorizar(actor, modeloId);
    const modelo = await carregarModelo(contexto, modeloId);
    const filtro = filtroCadastro(contexto, modelo, condominioId);
    const chaves = variaveisCadastro(modelo);
    const campos = new Set<keyof CadastroCondominioDocumento>(
      chaves.flatMap(chave => dependencias[chave])
    );
    const projecao = {
      id: condominios.id,
      name: condominios.name,
      ...Object.fromEntries(
        Array.from(campos, campo => [campo, colunasCadastro[campo]])
      ),
    };
    const [cadastro] = await contexto.db
      .select(projecao)
      .from(condominios)
      .where(filtro)
      .limit(1);
    if (!cadastro || cadastro.id !== condominioId)
      throw new ErroPreenchimento("FORBIDDEN");
    const valores = mapearVariaveisCondominio(cadastro, chaves);
    return {
      modeloId,
      condominioId,
      nomeCondominio: cadastro.name,
      valores,
      camposAusentes: chaves.filter(chave => valores[chave] === ""),
    };
  });
}

/** Autoriza o PDF sem obter cadastro nem sobrescrever os valores revisados. */
export async function validarContextoPreenchimento(
  actor: TenantActor,
  modeloId: number,
  condominioId: number | null
): Promise<ModeloDocumento> {
  return proteger(async () => {
    if (condominioId !== null) validarId(condominioId);
    const contexto = await autorizar(actor, modeloId);
    const modelo = await carregarModelo(contexto, modeloId, true);
    if (condominioId === null) {
      if (
        modelo.condominioId !== null ||
        variaveisCadastro(modelo).length !== 0
      ) {
        throw new ErroPreenchimento("BAD_REQUEST");
      }
      return modelo;
    }
    const [cadastro] = await contexto.db
      .select({ id: condominios.id })
      .from(condominios)
      .where(filtroCadastro(contexto, modelo, condominioId))
      .limit(1);
    if (!cadastro || cadastro.id !== condominioId)
      throw new ErroPreenchimento("FORBIDDEN");
    return modelo;
  });
}
