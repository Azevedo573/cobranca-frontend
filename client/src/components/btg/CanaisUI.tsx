import * as React from "react";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Checkbox } from "../ui/checkbox";
import { Alert, AlertDescription } from "../ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { Loader2, ShieldCheck } from "lucide-react";
import {
  CONFIRMACAO_RESERVA_LOCAL,
  podeConfirmarReservaLocalUI,
  podeRevisarReservaLocal,
  rotuloCanalParcela,
  type ParcelaCanalUI,
} from "../../lib/btgCanaisUI";

export function SituacaoCanalParcela({ parcela }: { parcela: ParcelaCanalUI }) {
  return (
    <div className="mt-2 space-y-1">
      <Badge variant="outline" className="text-xs font-normal">
        {rotuloCanalParcela(parcela)}
      </Badge>
      {parcela.nossoNumero && (
        <p className="font-mono text-xs text-muted-foreground">
          Nosso número: {parcela.nossoNumero}
        </p>
      )}
      {parcela.motivoBloqueio && (
        <p className="text-xs text-destructive">{parcela.motivoBloqueio}</p>
      )}
    </div>
  );
}

export function AcaoRevisarReserva({
  parcela,
  role,
  onClick,
  disabled,
}: {
  parcela: ParcelaCanalUI;
  role?: string | null;
  onClick: () => void;
  disabled?: boolean;
}) {
  if (!podeRevisarReservaLocal(parcela, role)) return null;
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      className="mt-3"
      onClick={onClick}
      disabled={disabled}
    >
      <ShieldCheck className="mr-2 h-4 w-4" />
      Confirmar reserva local
    </Button>
  );
}

export function FormConfirmacaoReserva({
  parcela,
  role,
  confirmacao,
  declaracaoNaoEncaminhada,
  pendente,
  erro,
  onConfirmacao,
  onDeclaracao,
  onSubmit,
  onCancel,
}: {
  parcela: ParcelaCanalUI;
  role?: string | null;
  confirmacao: string;
  declaracaoNaoEncaminhada: boolean;
  pendente?: boolean;
  erro?: string | null;
  onConfirmacao: (value: string) => void;
  onDeclaracao: (value: boolean) => void;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  const podeConfirmar = podeConfirmarReservaLocalUI({
    parcela,
    role,
    confirmacao,
    declaracaoNaoEncaminhada,
    pendente,
  });
  return (
    <div className="space-y-4">
      <Alert>
        <ShieldCheck className="h-4 w-4" />
        <AlertDescription>
          Esta ação só confirma a origem local do número{" "}
          <strong>{parcela.nossoNumero}</strong>. Não envia cobrança, não
          cancela título no banco e não altera o valor ou o vencimento. Confira
          os registros do banco e a distribuição externa antes de declarar.
        </AlertDescription>
      </Alert>
      <div className="flex items-start gap-3">
        <Checkbox
          id="reserva-nao-encaminhada"
          checked={declaracaoNaoEncaminhada}
          onCheckedChange={value => onDeclaracao(value === true)}
          disabled={pendente}
        />
        <Label
          htmlFor="reserva-nao-encaminhada"
          className="text-sm leading-relaxed"
        >
          Declaro que esta parcela não foi enviada, registrada ou distribuída
          por API, CNAB ou outro canal e que o número foi somente reservado pelo
          sistema.
        </Label>
      </div>
      <div className="space-y-2">
        <Label htmlFor="reserva-confirmacao">
          Digite {CONFIRMACAO_RESERVA_LOCAL}
        </Label>
        <Input
          id="reserva-confirmacao"
          autoComplete="off"
          value={confirmacao}
          onChange={event => onConfirmacao(event.target.value)}
          disabled={pendente}
        />
      </div>
      {erro && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{erro}</AlertDescription>
        </Alert>
      )}
      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={pendente}
        >
          Voltar à revisão
        </Button>
        <Button type="button" onClick={onSubmit} disabled={!podeConfirmar}>
          {pendente && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Confirmar somente a reserva
        </Button>
      </DialogFooter>
    </div>
  );
}

export function ConfirmarReservaLocalDialog(
  props: React.ComponentProps<typeof FormConfirmacaoReserva> & { open: boolean }
) {
  return (
    <Dialog
      open={props.open}
      onOpenChange={open => {
        if (!open && !props.pendente) props.onCancel();
      }}
    >
      <DialogContent
        onEscapeKeyDown={event => {
          if (props.pendente) event.preventDefault();
        }}
        onInteractOutside={event => {
          if (props.pendente) event.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>
            Confirmar reserva local · parcela #
            {props.parcela.id ?? props.parcela.parcelaId}
          </DialogTitle>
          <DialogDescription>
            Confirmação administrativa individual. O servidor revalida os
            vínculos atuais e registra a decisão em auditoria.
          </DialogDescription>
        </DialogHeader>
        <FormConfirmacaoReserva {...props} />
      </DialogContent>
    </Dialog>
  );
}
