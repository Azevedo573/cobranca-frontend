import { useEffect, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, SearchCheck } from "lucide-react";
import {
  ERRO_ANALISE_BTG,
  ERRO_CONFIRMACAO_BTG,
  alvoRecuperacaoDoItem,
  analiseCorrespondeAoAlvo,
  analiseRecuperacaoExpirada,
  copiarAnaliseRecuperacao,
  criarGuardaRecuperacao,
  inputAnaliseRecuperacao,
  literalRecuperacao,
  podeConfirmarRecuperacaoUI,
  type BtgRecuperacaoAlvo,
  type BtgRecuperacaoAnalise,
  type BtgRecuperacaoResultado,
} from "./btgRecuperacaoUI";

export function AcaoRevisarFalhaBtg({
  item,
  remessaId,
  habilitada,
  disabled = false,
  onAbrir,
}: {
  item: Parameters<typeof alvoRecuperacaoDoItem>[0];
  remessaId: number;
  habilitada: boolean;
  disabled?: boolean;
  onAbrir: (alvo: BtgRecuperacaoAlvo) => void;
}) {
  const alvo = alvoRecuperacaoDoItem(item, remessaId);
  if (!habilitada || !alvo) return null;
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={disabled}
      onClick={() => {
        if (!disabled) onAbrir(alvo);
      }}
    >
      <SearchCheck className="mr-2 h-4 w-4" />
      Revisar falha / Consultar BTG
    </Button>
  );
}

const moeda = (centavos: number) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(centavos / 100);
const data = (valor: Date, incluirHora = false) => {
  const date = new Date(valor);
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat("pt-BR", {
        dateStyle: "short",
        ...(incluirHora ? { timeStyle: "short" as const } : {}),
      }).format(date)
    : "—";
};

// Componente puro: pode ser inspecionado com SSR sem providers, banco ou chamadas BTG.
export function BtgRecuperacaoPainel({
  alvo,
  analise,
  confirmacao,
  ciente,
  pendente,
  erro,
  resultado,
  agora = Date.now(),
  onAnalisar,
  onConfirmar,
  onConfirmacao,
  onCiente,
  onClose,
}: {
  alvo: BtgRecuperacaoAlvo;
  analise: BtgRecuperacaoAnalise | null;
  confirmacao: string;
  ciente: boolean;
  pendente: "analise" | "confirmacao" | null;
  erro: string | null;
  resultado: BtgRecuperacaoResultado | null;
  agora?: number;
  onAnalisar: () => void;
  onConfirmar: () => void;
  onConfirmacao: (valor: string) => void;
  onCiente: (valor: boolean) => void;
  onClose: () => void;
}) {
  const previa =
    analise && analiseCorrespondeAoAlvo(analise, alvo) ? analise : null;
  const literal = previa ? literalRecuperacao(previa.acao) : null;
  const expirada = previa ? analiseRecuperacaoExpirada(previa, agora) : false;
  const permitida = podeConfirmarRecuperacaoUI({
    analise: previa,
    alvo,
    confirmacao,
    ciente,
    pendente: Boolean(pendente || resultado),
    agora,
  });
  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Remessa #{alvo.remessaId} · Parcela #{alvo.parcelaId} ·{" "}
        {alvo.emissaoId
          ? `Emissão original vinculada #${alvo.emissaoId}`
          : "Item histórico sem vínculo de emissão; a canônica será resolvida pelo backend."}
      </p>
      <Alert>
        <AlertDescription>
          A análise consulta o BTG em modo somente leitura, com auditoria. Não
          emite nem altera títulos. Falha local não comprova ausência de
          cobrança no banco. Histórico sem prova, retorno antigo descartado ou
          lista vazia isolada mantêm o estado incerto e não autorizam novo
          envio.
        </AlertDescription>
      </Alert>
      {erro && (
        <Alert variant="destructive">
          <AlertDescription>{erro}</AlertDescription>
        </Alert>
      )}
      {pendente && (
        <p
          role="status"
          aria-live="polite"
          className="flex items-center gap-2 text-sm"
        >
          <Loader2 className="h-4 w-4 animate-spin" />
          {pendente === "analise"
            ? "Consultando o BTG e analisando as provas, sem emitir..."
            : "Confirmando a ação individual; não repita a operação..."}
        </p>
      )}
      {previa && (
        <section
          aria-label="Resumo controlado da análise"
          className="space-y-3 rounded-lg border bg-muted/20 p-4"
        >
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold">Decisão da análise</h3>
            <Badge variant="outline">
              {previa.acao === "bloqueada"
                ? "Bloqueada · verificar no banco"
                : previa.acao === "reenviar"
                  ? "Nova tentativa elegível"
                  : "Recuperar vínculo existente"}
            </Badge>
            <Badge variant="outline">
              {previa.resumo.ambiente === "producao" ? "PRODUÇÃO" : "SANDBOX"}
            </Badge>
          </div>
          <p className="text-sm">{previa.mensagem}</p>
          <p className="text-xs text-muted-foreground">
            Código de decisão: {previa.codigo}
          </p>
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">Acordo / parcela</dt>
              <dd>
                Acordo #{previa.resumo.acordoId} ·{" "}
                {previa.resumo.installmentNumber === 0
                  ? "Entrada"
                  : `Parcela ${previa.resumo.installmentNumber}`}{" "}
                (#{previa.resumo.parcelaId})
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Valor</dt>
              <dd>{moeda(previa.resumo.valorCentavos)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Vencimento</dt>
              <dd>{data(previa.resumo.vencimento)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">
                Conta recebedora mascarada
              </dt>
              <dd>{previa.resumo.contaMascara}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">
                Emissão canônica / revisão atual
              </dt>
              <dd>
                #{previa.emissaoId} · revisão {previa.revisaoAtual}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Nova revisão</dt>
              <dd>
                {previa.novaRevisao ?? "Sem nova revisão; nenhum novo POST"}
              </dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-muted-foreground">Prévia válida até</dt>
              <dd>{data(previa.expiraEm, true)}</dd>
            </div>
          </dl>
          {previa.acao === "bloqueada" && (
            <p role="alert" className="text-sm font-medium text-destructive">
              Reenvio bloqueado. Verifique a situação no banco e obtenha
              comprovação adicional; consulta vazia não libera uma cobrança
              nova. Não há confirmação de envio disponível.
            </p>
          )}
          {expirada && (
            <p role="alert" className="text-sm font-medium text-destructive">
              Prévia expirada. Faça uma nova análise antes de confirmar.
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            O servidor revalida expiração, revisão, dados e provas ao confirmar.
            Mudanças exigem nova análise. As tentativas e o histórico original
            são preservados.
          </p>
        </section>
      )}
      {previa && literal && !resultado && (
        <form
          className="space-y-4"
          onSubmit={event => {
            event.preventDefault();
            if (permitida) onConfirmar();
          }}
        >
          <Alert
            variant={
              previa.acao === "reenviar" &&
              previa.resumo.ambiente === "producao"
                ? "destructive"
                : "default"
            }
          >
            <AlertDescription>
              {previa.acao === "recuperar_vinculo"
                ? "Recuperação de vínculo: vincula localmente um título já confirmado no BTG. Não cria outro título nem executa novo POST de emissão."
                : previa.resumo.ambiente === "producao"
                  ? "ATENÇÃO — PRODUÇÃO: confirmar pode criar um título real no BTG e uma nova cobrança. Esta autorização é individual, não para o lote inteiro."
                  : "SANDBOX: confirmar cria uma nova tentativa no ambiente de homologação, somente para esta parcela."}
            </AlertDescription>
          </Alert>
          <div className="space-y-2">
            <Label htmlFor="btg-recuperacao-literal">
              Digite exatamente {literal}
            </Label>
            <Input
              id="btg-recuperacao-literal"
              value={confirmacao}
              autoComplete="off"
              disabled={Boolean(pendente) || expirada}
              onChange={event => onConfirmacao(event.target.value)}
            />
          </div>
          <div className="flex items-start gap-2">
            <Checkbox
              id="btg-recuperacao-ciente"
              checked={ciente}
              disabled={Boolean(pendente) || expirada}
              onCheckedChange={valor => onCiente(valor === true)}
            />
            <Label htmlFor="btg-recuperacao-ciente" className="leading-relaxed">
              {previa.acao === "recuperar_vinculo"
                ? "Estou ciente da recuperação auditada do vínculo existente, sem novo envio ao BTG."
                : "Revisei parcela, valor, vencimento, conta e ambiente; estou ciente da nova tentativa e de que em Produção ela pode criar um título real."}
            </Label>
          </div>
          <div className="flex justify-end">
            <Button
              type="submit"
              disabled={!permitida}
              variant={
                previa.acao === "reenviar" &&
                previa.resumo.ambiente === "producao"
                  ? "destructive"
                  : "default"
              }
            >
              {previa.acao === "reenviar"
                ? "Confirmar reenvio individual"
                : "Confirmar recuperação do vínculo"}
            </Button>
          </div>
        </form>
      )}
      {resultado && (
        <Alert
          variant={
            ["reservada", "falha", "incerta", "pendente"].includes(
              resultado.status
            )
              ? "destructive"
              : "default"
          }
        >
          <AlertDescription>
            <div role="status" aria-live="polite" className="space-y-1">
              <p className="font-semibold">Resultado da operação individual</p>
              <p>{resultado.mensagem}</p>
              <p className="text-xs">
                Emissão #{resultado.emissaoId} · Estado: {resultado.status}
              </p>
              {["reservada", "falha", "incerta", "pendente"].includes(
                resultado.status
              ) && (
                <p className="text-sm font-medium">
                  Sem confirmação de emissão pelo banco. Consulte o BTG antes de
                  qualquer nova tentativa.
                </p>
              )}
              {resultado.acao === "recuperar_vinculo" && (
                <p className="text-xs">
                  Vínculo recuperado sem novo POST. Mesmo que o banco informe
                  título pago, esta ação não aplica baixa; o pagamento exige
                  conciliação própria.
                </p>
              )}
              <p className="text-xs">
                Nenhuma repetição automática. Estado incerto exige nova
                consulta, não outro envio.
              </p>
            </div>
          </AlertDescription>
        </Alert>
      )}
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="outline" onClick={onClose}>
          {pendente ? "Fechar (não cancela a operação)" : "Fechar"}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={Boolean(pendente)}
          onClick={() => {
            if (!pendente) onAnalisar();
          }}
        >
          {previa || resultado
            ? "Analisar / Consultar novamente"
            : "Analisar falha / Consultar BTG"}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Sem retry automático, sem fallback CNAB e sem reenvio do lote. Não são
        exibidos payload, resposta bancária livre ou dados do pagador.
      </p>
    </div>
  );
}

type DialogProps = {
  alvo: BtgRecuperacaoAlvo;
  contexto: string;
  onClose: () => void;
};

export default function BtgRecuperacaoDialog(props: DialogProps) {
  // Mudança de contexto remonta todo o estado; literal e análise não atravessam itens/sessões.
  const { alvo, contexto } = props;
  return (
    <BtgRecuperacaoDialogConteudo
      key={`${contexto}:${alvo.remessaId}:${alvo.itemId}:${alvo.parcelaId}:${alvo.emissaoId}`}
      {...props}
    />
  );
}

export function BtgRecuperacaoDialogConteudo({ alvo, onClose }: DialogProps) {
  const utils = trpc.useUtils();
  const [analise, setAnalise] = useState<BtgRecuperacaoAnalise | null>(null);
  const [confirmacao, setConfirmacao] = useState("");
  const [ciente, setCiente] = useState(false);
  const [pendente, setPendente] = useState<"analise" | "confirmacao" | null>(
    null
  );
  const [erro, setErro] = useState<string | null>(null);
  const [resultado, setResultado] = useState<BtgRecuperacaoResultado | null>(
    null
  );
  const [agora, setAgora] = useState(Date.now);
  const [guarda] = useState(criarGuardaRecuperacao);
  const analisar = trpc.btgRecuperacao.analisar.useMutation({
    retry: false,
    gcTime: 0,
  });
  const confirmar = trpc.btgRecuperacao.confirmar.useMutation({
    retry: false,
    gcTime: 0,
  });
  const resetRef = useRef(() => {});
  resetRef.current = () => {
    analisar.reset();
    confirmar.reset();
  };
  useEffect(() => {
    guarda.ativar();
    return () => {
      guarda.encerrar();
      resetRef.current();
    };
  }, [guarda]);
  useEffect(() => {
    if (!analise) return;
    // Timer somente visual: não consulta, confirma ou reenvia em background.
    const timer = setInterval(() => setAgora(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [analise]);
  const limparPrevia = () => {
    setAnalise(null);
    setConfirmacao("");
    setCiente(false);
    setResultado(null);
    setErro(null);
  };
  const fechar = () => {
    guarda.encerrar();
    limparPrevia();
    setPendente(null);
    resetRef.current();
    onClose();
  };
  const invalidar = async () => {
    // Abrange painel, filas, remessas/detalhes, capturas e acordo. Falha de cache
    // não transforma uma operação financeira em erro e nunca dispara outro POST.
    await Promise.allSettled([
      utils.btgV2.invalidate(),
      utils.btgDiagnosticos.invalidate(),
      utils.acordos.invalidate(),
      utils.btgCanais.invalidate(),
    ]);
  };
  const solicitarAnalise = async () => {
    if (pendente || analisar.isPending || confirmar.isPending) return;
    const pedido = guarda.iniciar();
    if (pedido === null) return;
    limparPrevia();
    setPendente("analise");
    try {
      const resposta = copiarAnaliseRecuperacao(
        await analisar.mutateAsync(inputAnaliseRecuperacao(alvo))
      );
      if (!guarda.aceita(pedido)) return;
      if (!analiseCorrespondeAoAlvo(resposta, alvo)) {
        setErro(ERRO_ANALISE_BTG);
        return;
      }
      setAgora(Date.now());
      setAnalise(resposta);
    } catch {
      if (guarda.aceita(pedido)) setErro(ERRO_ANALISE_BTG);
    } finally {
      if (guarda.aceita(pedido)) {
        setPendente(null);
        resetRef.current();
      }
      guarda.finalizar(pedido);
    }
  };
  const solicitarConfirmacao = async () => {
    if (
      !podeConfirmarRecuperacaoUI({
        analise,
        alvo,
        confirmacao,
        ciente,
        pendente: Boolean(
          pendente || resultado || analisar.isPending || confirmar.isPending
        ),
      }) ||
      !analise
    )
      return;
    const literal = literalRecuperacao(analise.acao);
    if (!literal) return;
    const pedido = guarda.iniciar();
    if (pedido === null) return;
    const analiseId = analise.analiseId;
    setErro(null);
    setPendente("confirmacao");
    setConfirmacao("");
    setCiente(false);
    // Consumir a prévia antes de enviar. Falha/timeout exige consulta nova, não clique repetido.
    setAnalise(null);
    try {
      const resposta = await confirmar.mutateAsync({
        analiseId,
        confirmacao: literal,
        ciente: true,
      });
      if (guarda.aceita(pedido)) {
        setResultado({
          acao: resposta.acao,
          emissaoId: resposta.emissaoId,
          mensagem: resposta.mensagem,
          status: resposta.status,
        });
      }
    } catch {
      if (guarda.aceita(pedido)) setErro(ERRO_CONFIRMACAO_BTG);
    } finally {
      // Mesmo depois de fechar/trocar sessão, o resultado financeiro invalida os caches.
      await invalidar();
      if (guarda.aceita(pedido)) {
        setPendente(null);
        resetRef.current();
      }
      guarda.finalizar(pedido);
    }
  };
  return (
    <Dialog
      open
      onOpenChange={aberto => {
        if (!aberto) fechar();
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Revisar falha / Consultar BTG</DialogTitle>
          <DialogDescription>
            Análise administrativa individual e auditada. Apenas a confirmação
            explícita de uma decisão elegível pode alterar o vínculo ou iniciar
            uma nova tentativa.
          </DialogDescription>
        </DialogHeader>
        <BtgRecuperacaoPainel
          alvo={alvo}
          analise={analise}
          confirmacao={confirmacao}
          ciente={ciente}
          pendente={pendente}
          erro={erro}
          resultado={resultado}
          agora={agora}
          onAnalisar={() => {
            void solicitarAnalise();
          }}
          onConfirmar={() => {
            void solicitarConfirmacao();
          }}
          onConfirmacao={setConfirmacao}
          onCiente={setCiente}
          onClose={fechar}
        />
      </DialogContent>
    </Dialog>
  );
}
