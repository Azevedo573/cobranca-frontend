import { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { invalidarCanaisBtg } from "@/lib/invalidarCanaisBtg";
import {
  CONFIRMACAO_RESERVA_LOCAL,
  podeConfirmarReservaLocalUI,
  podeRevisarReservaLocal,
  type ParcelaCanalUI,
} from "@/lib/btgCanaisUI";

export function useConfirmarReservaLocal() {
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const [parcela, setParcela] = useState<ParcelaCanalUI | null>(null);
  const [confirmacao, setConfirmacao] = useState("");
  const [declaracaoNaoEncaminhada, setDeclaracao] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const mutation = trpc.btgCanais.confirmarReservaLocal.useMutation({
    onSuccess: async () => {
      setParcela(null);
      toast.success(
        "Origem local confirmada. Nenhuma cobrança foi enviada; revise e selecione a parcela para uma operação separada."
      );
      await invalidarCanaisBtg(utils);
    },
    onError: async error => {
      setErro(error.message);
      await invalidarCanaisBtg(utils);
    },
  });
  const abrir = (item: ParcelaCanalUI) => {
    if (!podeRevisarReservaLocal(item, user?.role)) return;
    setParcela(item);
    setConfirmacao("");
    setDeclaracao(false);
    setErro(null);
  };
  const fechar = () => {
    if (!mutation.isPending) setParcela(null);
  };
  const confirmar = () => {
    if (
      !parcela ||
      !podeConfirmarReservaLocalUI({
        parcela,
        role: user?.role,
        confirmacao,
        declaracaoNaoEncaminhada,
        pendente: mutation.isPending,
      })
    )
      return;
    const parcelaId = parcela.id ?? parcela.parcelaId;
    if (!parcelaId || !parcela.nossoNumero) return;
    mutation.mutate({
      parcelaId,
      nossoNumeroEsperado: parcela.nossoNumero,
      confirmacao: CONFIRMACAO_RESERVA_LOCAL,
      declaracaoNaoEncaminhada: true,
    });
  };
  return {
    role: user?.role,
    abrir,
    dialogProps: {
      open: Boolean(parcela),
      parcela: parcela ?? {},
      role: user?.role,
      confirmacao,
      declaracaoNaoEncaminhada,
      pendente: mutation.isPending,
      erro,
      onConfirmacao: setConfirmacao,
      onDeclaracao: setDeclaracao,
      onSubmit: confirmar,
      onCancel: fechar,
    },
  };
}
