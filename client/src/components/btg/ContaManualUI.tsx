import * as React from "react";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Checkbox } from "../ui/checkbox";
import { Alert, AlertDescription, AlertTitle } from "../ui/alert";
import { Info, Loader2, LockKeyhole } from "lucide-react";
import {
  CONFIRMACAO_CONTA_PRODUCAO,
  CONFIRMACAO_CONTA_SANDBOX,
  formatarDataBtg,
  mascararRevisaoConta,
  podeConfirmarContaManual,
  rotuloOrigemConta,
  rotulosEstadoBtg,
  validarFormContaManual,
  type AmbienteBtg,
  type FormContaManual,
  type OrigemContaBtg,
} from "./contaManual";

export function EstadoEmissaoBtg({
  ambiente,
  emissaoHabilitada,
}: {
  ambiente?: string;
  emissaoHabilitada: boolean;
}) {
  const rotulos = rotulosEstadoBtg(ambiente, emissaoHabilitada);
  return (
    <>
      <Badge
        variant="outline"
        className={
          ambiente === "sandbox"
            ? "border-amber-500 bg-amber-50 text-amber-700"
            : "border-slate-400"
        }
      >
        {rotulos.ambiente}
      </Badge>
      <Badge variant={emissaoHabilitada ? "default" : "secondary"}>
        {rotulos.emissao}
      </Badge>
    </>
  );
}

export function AlertaProducaoBtg({
  ambiente,
  emissaoHabilitada,
}: {
  ambiente?: string;
  emissaoHabilitada: boolean;
}) {
  if (ambiente !== "producao") return null;
  return (
    <Alert variant={emissaoHabilitada ? "default" : "destructive"}>
      {emissaoHabilitada ? (
        <Info className="h-4 w-4" />
      ) : (
        <LockKeyhole className="h-4 w-4" />
      )}
      <AlertTitle>
        {emissaoHabilitada
          ? "Emissão real em Produção habilitada"
          : "Emissão em Produção bloqueada"}
      </AlertTitle>
      <AlertDescription>
        {emissaoHabilitada
          ? "A liberação de emissão está ativa. Revise o beneficiário e os dados da cobrança antes de qualquer envio real; o BTG poderá recusar uma conta manual."
          : "O cadastro de conta não libera cobranças. OAuth, conta elegível vinculada, webhook e homologação operacional continuam obrigatórios; a liberação exige a confirmação separada LIBERAR PRODUCAO."}
      </AlertDescription>
    </Alert>
  );
}

export function ModoConsultaContasBtg({ habilitada }: { habilitada: boolean }) {
  return (
    <Alert>
      <Info className="h-4 w-4" />
      <AlertTitle>
        {habilitada
          ? "Consulta Accounts habilitada"
          : "Modo sem consulta Accounts"}
      </AlertTitle>
      <AlertDescription className="text-xs">
        {habilitada
          ? "A consulta oficial exige acesso ao produto Accounts no aplicativo BTG."
          : "A consulta de contas está desativada pela configuração do servidor (BTG_ACCOUNTS_ENABLED=false). Use o cadastro manual após conectar a integração. Esta informação é somente leitura; alterar o modo não modifica silenciosamente o consentimento existente."}{" "}
        Accounts é opcional para o cadastro manual; não substitui a autorização
        Collections nem o webhook necessários à emissão. Alterações de escopos
        valem para um próximo consentimento iniciado pelo administrador.
      </AlertDescription>
    </Alert>
  );
}

export function OrigemContaBtg({
  origemCadastro,
  confirmadoPorId,
  confirmadoEm,
}: {
  origemCadastro: OrigemContaBtg;
  confirmadoPorId?: number | null;
  confirmadoEm?: Date | string | null;
}) {
  const producao = origemCadastro === "manual_producao";
  const data = formatarDataBtg(confirmadoEm);
  const ator =
    Number.isInteger(confirmadoPorId) && (confirmadoPorId ?? 0) > 0
      ? confirmadoPorId
      : null;
  return (
    <div className="space-y-1">
      <Badge variant={origemCadastro === "api" ? "secondary" : "outline"}>
        {rotuloOrigemConta(origemCadastro)}
      </Badge>
      {producao && (
        <>
          <p className="text-xs text-muted-foreground">
            Confirmada pelo administrador · não validada pela API BTG
          </p>
          {(ator || data !== "—") && (
            <p className="text-xs text-muted-foreground">
              {ator ? `Administrador ID ${ator}` : "Confirmador não disponível"}
              {data !== "—" ? ` · ${data}` : ""}
            </p>
          )}
        </>
      )}
    </div>
  );
}

export type ContaManualFormProps = {
  ambiente: AmbienteBtg;
  form: FormContaManual;
  onFormChange: (form: FormContaManual) => void;
  confirmacao: string;
  onConfirmacaoChange: (texto: string) => void;
  dadosConferidos: boolean;
  onDadosConferidosChange: (conferidos: boolean) => void;
  enviando: boolean;
  erro?: string | null;
};

export function ContaManualForm({
  ambiente,
  form,
  onFormChange,
  confirmacao,
  onConfirmacaoChange,
  dadosConferidos,
  onDadosConferidosChange,
  enviando,
  erro,
}: ContaManualFormProps) {
  const producao = ambiente === "producao";
  const literal = producao
    ? CONFIRMACAO_CONTA_PRODUCAO
    : CONFIRMACAO_CONTA_SANDBOX;
  const validar = validarFormContaManual(form, ambiente);
  const update = (campo: keyof FormContaManual, valor: string) =>
    onFormChange({ ...form, [campo]: valor });
  return (
    <div className="grid gap-3 py-2">
      <fieldset disabled={enviando} className="grid gap-3 min-w-0">
        <legend className="sr-only">
          Dados da conta manual {producao ? "de Produção" : "Sandbox"}
        </legend>
        <div className="space-y-1">
          <Label htmlFor="conta-manual-rotulo">Rótulo da conta</Label>
          <Input
            id="conta-manual-rotulo"
            required
            maxLength={255}
            value={form.rotulo}
            onChange={event => update("rotulo", event.target.value)}
            placeholder={
              producao
                ? "Conta recebedora do escritório"
                : "Conta de homologação do escritório"
            }
          />
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor="conta-manual-agencia">Agência</Label>
            <Input
              id="conta-manual-agencia"
              type="text"
              required
              inputMode="numeric"
              maxLength={30}
              value={form.agencia}
              onChange={event => update("agencia", event.target.value)}
              aria-describedby="conta-manual-digitos"
              placeholder="Conforme o banco"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="conta-manual-numero">Número da conta</Label>
            <Input
              id="conta-manual-numero"
              type="text"
              required
              inputMode="numeric"
              maxLength={50}
              value={form.numero}
              onChange={event => update("numero", event.target.value)}
              aria-describedby="conta-manual-digitos"
              placeholder="Sem hífen"
            />
          </div>
        </div>
        <p id="conta-manual-digitos" className="text-xs text-muted-foreground">
          Somente dígitos. Preserve os zeros à esquerda e copie agência/conta
          conforme a fonte bancária; não acrescente dígitos por suposição.
        </p>
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor="conta-manual-documento">
              {producao
                ? "CNPJ do titular (obrigatório)"
                : "Documento do beneficiário (opcional)"}
            </Label>
            <Input
              id="conta-manual-documento"
              type="text"
              required={producao}
              inputMode="numeric"
              maxLength={20}
              value={form.documentoBeneficiario}
              onChange={event =>
                update("documentoBeneficiario", event.target.value)
              }
              aria-describedby={producao ? "conta-manual-cnpj" : undefined}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="conta-manual-beneficiario">
              {producao
                ? "Nome do titular (obrigatório)"
                : "Titular (opcional)"}
            </Label>
            <Input
              id="conta-manual-beneficiario"
              required={producao}
              maxLength={255}
              value={form.nomeBeneficiario}
              onChange={event => update("nomeBeneficiario", event.target.value)}
            />
          </div>
        </div>
        {producao && (
          <>
            <p id="conta-manual-cnpj" className="text-xs text-muted-foreground">
              O CNPJ da conta deve ser o do escritório titular da integração. O
              servidor verifica essa correspondência; cadastro local não
              comprova titularidade nem garante aceitação bancária.
            </p>
            <div
              className="rounded-lg border bg-muted/20 p-3 space-y-1 text-xs"
              aria-label="Revisão mascarada da conta"
            >
              <p className="font-medium">
                Revisão antes da confirmação — Produção
              </p>
              <p>Titular: {form.nomeBeneficiario.trim() || "—"}</p>
              <p>
                Agência: {mascararRevisaoConta(form.agencia, 2)} · Conta:{" "}
                {mascararRevisaoConta(form.numero)}
              </p>
              <p>
                CNPJ:{" "}
                {mascararRevisaoConta(
                  form.documentoBeneficiario.replace(/\D/g, "")
                )}
              </p>
              <p>
                OAuth/webhook/liberação de emissão continuam obrigatórios.
                Nenhuma cobrança é enviada ou habilitada ao cadastrar.
              </p>
            </div>
            <div className="flex items-start gap-2">
              <Checkbox
                id="conta-manual-conferidos"
                required
                checked={dadosConferidos}
                onCheckedChange={valor =>
                  onDadosConferidosChange(valor === true)
                }
                disabled={enviando}
              />
              <Label
                htmlFor="conta-manual-conferidos"
                className="text-xs leading-relaxed"
              >
                Declaro que conferi agência, conta, nome e CNPJ em uma fonte
                bancária do escritório e assumo a responsabilidade pelo cadastro
                manual de Produção.
              </Label>
            </div>
          </>
        )}
        <div className="space-y-1">
          <Label htmlFor="conta-manual-confirmacao">
            Digite <strong>{literal}</strong> para confirmar
          </Label>
          <Input
            id="conta-manual-confirmacao"
            required
            value={confirmacao}
            onChange={event => onConfirmacaoChange(event.target.value)}
            autoComplete="off"
            placeholder={literal}
          />
        </div>
      </fieldset>
      {validar && Object.values(form).some(valor => valor.length > 0) && (
        <p className="text-xs text-muted-foreground">{validar}</p>
      )}
      {erro && (
        <Alert variant="destructive" role="alert">
          <AlertTitle>Cadastro não concluído</AlertTitle>
          <AlertDescription>{erro}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}

export function ConfirmarContaManualButton({
  onConfirmar,
  ...input
}: Parameters<typeof podeConfirmarContaManual>[0] & {
  onConfirmar: () => void;
}) {
  return (
    <Button
      type="button"
      disabled={!podeConfirmarContaManual(input)}
      onClick={() => {
        if (podeConfirmarContaManual(input)) onConfirmar();
      }}
    >
      {input.enviando && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
      {input.enviando ? "Cadastrando…" : "Confirmar cadastro"}
    </Button>
  );
}
