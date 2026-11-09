import { createHash } from "node:crypto";
import type { EmissaoTituloBtg } from "./titulo-contexto";
import {
  cifrarDiagnosticoBtg,
  decifrarDiagnosticoBtg,
} from "./diagnosticos-crypto";

export interface SnapshotBoletoBtg {
  versao: 1;
  fonte: "pedido_registrado";
  emissaoId: number;
  revisao: number;
  valorCentavos: number;
  vencimento: string;
  externalId: string;
  documentNumber: string;
  correlationId: string;
  beneficiario: {
    nome: string;
    documento: string;
    agencia: string;
    conta: string;
  };
  pagador: {
    nome: string;
    documento: string;
    endereco: {
      rua: string;
      numero: string;
      complemento?: string;
      bairro: string;
      cidade: string;
      uf: string;
      cep: string;
    };
  };
  contextoAcordo?: {
    acordoId: number;
    totalNegociado: number;
    credorTitulo: string;
    parcelas: {
      id: number;
      installmentNumber: number;
      amount: number;
      dueDate: string;
      status: "pendente" | "atrasado" | "pago" | "cancelado";
    }[];
  };
}
const objeto = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const erro = () =>
  new Error(
    "Dados documentais históricos ausentes ou incompatíveis com esta emissão."
  );
const texto = (v: unknown, max: number) => {
  if (
    typeof v !== "string" ||
    !v.trim() ||
    v.length > max ||
    /[\u0000-\u001f\u007f]/.test(v)
  )
    throw erro();
  return v;
};
export const hashBoletoBtg = (v: Uint8Array | string) =>
  createHash("sha256").update(v).digest("hex");
export const aadSnapshotBoletoBtg = (
  e: Pick<
    EmissaoTituloBtg,
    "id" | "revisao" | "btgIntegracaoId" | "condominioId"
  >
) =>
  JSON.stringify([
    "btg-boleto-snapshot-v1",
    e.id,
    e.revisao,
    e.btgIntegracaoId,
    e.condominioId,
  ]);

/** Aceita exclusivamente o corpo registrado da emissão; nunca o cadastro atual. */
export function snapshotDoPedidoBtg(
  body: string,
  e: EmissaoTituloBtg
): SnapshotBoletoBtg {
  let p: unknown;
  try {
    p = JSON.parse(body);
  } catch {
    throw erro();
  }
  if (
    !objeto(p) ||
    !objeto(p.detail) ||
    !objeto(p.account) ||
    !objeto(p.payer) ||
    !objeto(p.payer.address)
  )
    throw erro();
  if (
    p.type !== "BANKSLIP_QRCODE" ||
    p.amount !== e.amount / 100 ||
    p.dueDate !== e.dueDate.toISOString().slice(0, 10) ||
    p.detail.externalId !== e.externalId ||
    p.detail.correlationId !== `btgv2-${e.id}` ||
    p.detail.documentNumber !== `PA${e.origemId}R${e.revisao}` ||
    p.account.branch !== e.agenciaRecebedora ||
    p.account.number !== e.contaRecebedora
  )
    throw erro();
  const documento = texto(p.payer.taxId, 20);
  if (!/^(?:\d{11}|\d{14})$/.test(documento)) throw erro();
  const endereco = p.payer.address;
  const uf = texto(endereco.state, 2),
    cep = texto(endereco.zipCode, 8);
  if (!/^[A-Z]{2}$/.test(uf) || !/^\d{8}$/.test(cep)) throw erro();
  return {
    versao: 1,
    fonte: "pedido_registrado",
    emissaoId: e.id,
    revisao: e.revisao,
    valorCentavos: e.amount,
    vencimento: String(p.dueDate),
    externalId: e.externalId,
    documentNumber: String(p.detail.documentNumber),
    correlationId: String(p.detail.correlationId),
    beneficiario: {
      nome: texto(e.nomeBeneficiario, 255),
      documento: texto(e.documentoBeneficiario, 20),
      agencia: e.agenciaRecebedora,
      conta: e.contaRecebedora,
    },
    pagador: {
      nome: texto(p.payer.name, 255),
      documento,
      endereco: {
        rua: texto(endereco.street, 40),
        numero: texto(endereco.number, 10),
        ...(endereco.complement
          ? { complemento: texto(endereco.complement, 100) }
          : {}),
        bairro: texto(endereco.neighborhood, 20),
        cidade: texto(endereco.city, 50),
        uf,
        cep,
      },
    },
  };
}
export function cifrarSnapshotBoletoBtg(
  snapshot: SnapshotBoletoBtg,
  e: EmissaoTituloBtg
) {
  return cifrarDiagnosticoBtg(
    Buffer.from(JSON.stringify(snapshot)),
    aadSnapshotBoletoBtg(e)
  );
}
export function decifrarSnapshotBoletoBtg(
  envelope: string,
  hash: string,
  e: EmissaoTituloBtg
): SnapshotBoletoBtg {
  const bytes = decifrarDiagnosticoBtg(envelope, aadSnapshotBoletoBtg(e));
  if (hashBoletoBtg(bytes) !== hash) throw erro();
  const s = JSON.parse(bytes.toString("utf8")) as SnapshotBoletoBtg;
  if (
    s.versao !== 1 ||
    s.fonte !== "pedido_registrado" ||
    s.emissaoId !== e.id ||
    s.revisao !== e.revisao ||
    s.valorCentavos !== e.amount ||
    s.vencimento !== e.dueDate.toISOString().slice(0, 10) ||
    s.externalId !== e.externalId ||
    s.beneficiario.agencia !== e.agenciaRecebedora ||
    s.beneficiario.conta !== e.contaRecebedora ||
    s.beneficiario.documento !== e.documentoBeneficiario
  )
    throw erro();
  return s;
}
