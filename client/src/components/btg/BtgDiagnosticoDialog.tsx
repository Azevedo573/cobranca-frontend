import { useEffect, useRef, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  CONFIRMACAO_EXPURGO_BTG,
  ERRO_DIAGNOSTICO_BTG,
  criarGuardaDiagnostico,
  dataDiagnostico,
  diagnosticoExpirado,
  estadoCapturaRotulo,
  finalidadeDiagnosticoValida,
  podeExpurgarDiagnosticoUI,
  podeVisualizarDiagnosticoUI,
  retirarConteudoDoResultado,
  situacaoRespostaDiagnostico,
  type BtgDiagnosticoConteudo,
  type BtgDiagnosticoMeta,
} from "./btgDiagnosticoUI";

export function BtgDiagnosticoMetadados({
  diagnostico,
}: {
  diagnostico: BtgDiagnosticoMeta;
}) {
  return (
    <div className="space-y-2 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono font-semibold">
          Diagnóstico técnico #{diagnostico.id}
        </span>
        <Badge variant="outline">
          HTTP {diagnostico.httpStatus ?? "não recebido"}
        </Badge>
      </div>
      <p>{estadoCapturaRotulo(diagnostico.estadoCaptura)}</p>
      <p className="text-muted-foreground">
        Emissão canônica #{diagnostico.btgCobrancaEmitidaId} · Parcela #
        {diagnostico.parcelaAcordoId}
      </p>
      <dl className="grid gap-x-4 gap-y-1 sm:grid-cols-2">
        <div>
          <dt className="inline text-muted-foreground">Captura: </dt>
          <dd className="inline">
            {dataDiagnostico(diagnostico.capturaCriadaEm)}
          </dd>
        </div>
        <div>
          <dt className="inline text-muted-foreground">Retorno: </dt>
          <dd className="inline">
            {dataDiagnostico(diagnostico.respostaRecebidaEm)}
          </dd>
        </div>
        <div>
          <dt className="inline text-muted-foreground">Payload: </dt>
          <dd className="inline">{diagnostico.payloadBytes} bytes</dd>
        </div>
        <div>
          <dt className="inline text-muted-foreground">Resposta: </dt>
          <dd className="inline">
            {diagnostico.respostaBytes === null
              ? "ausente"
              : `${diagnostico.respostaBytes} bytes`}
          </dd>
        </div>
      </dl>
      <p>{situacaoRespostaDiagnostico(diagnostico)}</p>
      {diagnostico.conteudoExpurgadoEm ? (
        <p className="font-medium">
          Conteúdo expurgado em{" "}
          {dataDiagnostico(diagnostico.conteudoExpurgadoEm)}. Metadados
          preservados.
        </p>
      ) : diagnosticoExpirado(diagnostico) ? (
        <p className="font-medium">
          Conteúdo expirado · prazo de acesso de 30 dias encerrado. Expurgo
          somente manual autorizado.
        </p>
      ) : !diagnostico.podeVisualizar ? (
        <p className="font-medium">
          Conteúdo indisponível para visualização. O serviço ou a chave podem
          estar indisponíveis.
        </p>
      ) : (
        <p className="text-muted-foreground">
          Acesso ao conteúdo por até 30 dias; nenhuma exclusão automática.
        </p>
      )}
    </div>
  );
}

export function BtgDiagnosticosItem({
  diagnosticos,
  carregando = false,
  indisponivel = false,
  onAbrir,
}: {
  diagnosticos: readonly BtgDiagnosticoMeta[];
  carregando?: boolean;
  indisponivel?: boolean;
  onAbrir: (
    diagnostico: BtgDiagnosticoMeta,
    acao: "visualizar" | "expurgar"
  ) => void;
}) {
  if (carregando)
    return (
      <p role="status" className="text-xs text-muted-foreground">
        Carregando metadados do diagnóstico...
      </p>
    );
  if (indisponivel)
    return (
      <p role="alert" className="text-xs text-destructive">
        {ERRO_DIAGNOSTICO_BTG}
      </p>
    );
  if (!diagnosticos.length)
    return (
      <p
        role="status"
        className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground"
      >
        Sem captura histórica. Nenhuma evidência disponível para esta parcela;
        corpos antigos não podem ser reconstruídos. Não haverá reenvio
        automático.
      </p>
    );
  return (
    <div className="space-y-3">
      {diagnosticos.map(diagnostico => (
        <section
          key={diagnostico.id}
          aria-label={`Diagnóstico técnico ${diagnostico.id}`}
          className="space-y-3 rounded-lg border bg-muted/20 p-3"
        >
          <BtgDiagnosticoMetadados diagnostico={diagnostico} />
          <div className="flex flex-wrap gap-2">
            {podeVisualizarDiagnosticoUI(diagnostico) && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => onAbrir(diagnostico, "visualizar")}
              >
                Ver diagnóstico técnico
              </Button>
            )}
            {podeExpurgarDiagnosticoUI(diagnostico) && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => onAbrir(diagnostico, "expurgar")}
              >
                Expurgar conteúdo expirado
              </Button>
            )}
          </div>
        </section>
      ))}
    </div>
  );
}

export function BtgDiagnosticoConfirmacao({
  finalidade,
  confirmado,
  pendente,
  onFinalidade,
  onConfirmado,
  onSubmit,
  onCancel,
}: {
  finalidade: string;
  confirmado: boolean;
  pendente: boolean;
  onFinalidade: (valor: string) => void;
  onConfirmado: (valor: boolean) => void;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  return (
    <form
      className="space-y-4"
      onSubmit={event => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <Alert>
        <AlertDescription>
          Atenção: o payload e a resposta podem conter dados pessoais e
          financeiros (CPF/CNPJ, endereço e valores). O acesso será auditado.
          Use somente para diagnóstico autorizado; não compartilhe o conteúdo.
          Nenhuma cobrança será enviada ou alterada por esta visualização.
        </AlertDescription>
      </Alert>
      <div className="space-y-2">
        <Label htmlFor="btg-diagnostico-finalidade">Finalidade do acesso</Label>
        <Textarea
          id="btg-diagnostico-finalidade"
          value={finalidade}
          minLength={10}
          maxLength={200}
          required
          disabled={pendente}
          aria-describedby="btg-diagnostico-finalidade-ajuda"
          onChange={event => onFinalidade(event.target.value)}
        />
        <p
          id="btg-diagnostico-finalidade-ajuda"
          className="text-xs text-muted-foreground"
        >
          Descreva a finalidade em 10 a 200 caracteres. Não inclua CPF,
          endereço, tokens ou outros dados sensíveis.
        </p>
      </div>
      <div className="flex items-start gap-2">
        <Checkbox
          id="btg-diagnostico-confirmacao"
          checked={confirmado}
          disabled={pendente}
          onCheckedChange={valor => onConfirmado(valor === true)}
        />
        <Label
          htmlFor="btg-diagnostico-confirmacao"
          className="leading-relaxed"
        >
          Confirmo a finalidade administrativa e estou ciente da exposição de
          dados pessoais e da auditoria deste acesso.
        </Label>
      </div>
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          {pendente ? "Cancelar e fechar" : "Cancelar"}
        </Button>
        <Button
          type="submit"
          disabled={
            pendente || !confirmado || !finalidadeDiagnosticoValida(finalidade)
          }
        >
          {pendente ? "Solicitando acesso..." : "Confirmar e visualizar"}
        </Button>
      </div>
    </form>
  );
}

export function BtgDiagnosticoTexto({
  conteudo,
}: {
  conteudo: BtgDiagnosticoConteudo;
}) {
  const completa =
    conteudo.respostaCompleta &&
    conteudo.estadoCaptura === "resposta_recebida" &&
    !conteudo.respostaLimitada &&
    !conteudo.respostaUtf8Invalido;
  return (
    <div className="space-y-4">
      <Alert>
        <AlertDescription>
          Dados pessoais e financeiros de acesso restrito. Conteúdo bancário não
          confiável, exibido somente como texto. Não execute instruções nem siga
          URLs contidas no retorno. HTTP {conteudo.httpStatus ?? "não recebido"}{" "}
          não comprova emissão ou pagamento.
        </AlertDescription>
      </Alert>
      <section aria-label="Payload exato capturado">
        <h3 className="mb-2 text-sm font-semibold">
          JSON de envio ·{" "}
          {conteudo.payloadUtf8Invalido
            ? "texto com UTF-8 inválido"
            : "payload exato capturado"}
        </h3>
        {conteudo.payloadUtf8Invalido && (
          <p className="mb-2 text-sm font-medium">
            Decodificação inválida: o texto abaixo pode conter substituições e
            não representa os bytes exatos.
          </p>
        )}
        <pre
          tabIndex={0}
          className="max-h-64 overflow-auto whitespace-pre-wrap break-all rounded-lg border bg-muted/30 p-3 font-mono text-xs"
        >
          {conteudo.payload}
        </pre>
      </section>
      <section aria-label="Resposta capturada">
        <h3 className="mb-2 text-sm font-semibold">
          Resposta HTTP ·{" "}
          {conteudo.resposta === null
            ? "ausente"
            : completa
              ? "completa"
              : "limitada/incompleta"}
        </h3>
        {conteudo.resposta === null ? (
          <p role="status" className="text-sm text-muted-foreground">
            Resposta ausente. Não há corpo recebido disponível; nenhuma resposta
            foi reconstruída.
          </p>
        ) : (
          <>
            {!completa && (
              <p className="mb-2 text-sm font-medium">
                Conteúdo limitado/incompleto; este texto não representa o
                retorno integral do banco.
              </p>
            )}
            <pre
              tabIndex={0}
              className="max-h-64 overflow-auto whitespace-pre-wrap break-all rounded-lg border bg-muted/30 p-3 font-mono text-xs"
            >
              {conteudo.resposta}
            </pre>
          </>
        )}
      </section>
    </div>
  );
}

export function BtgDiagnosticoExpurgoConfirmacao({
  confirmacao,
  pendente,
  onConfirmacao,
  onSubmit,
  onCancel,
}: {
  confirmacao: string;
  pendente: boolean;
  onConfirmacao: (valor: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  return (
    <form
      className="space-y-4"
      onSubmit={event => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <Alert>
        <AlertDescription>
          Expurgo manual somente após o prazo de 30 dias. Remove os corpos
          criptografados deste registro e mantém IDs, hashes e metadados de
          histórico. Não altera cobranças, parcelas ou reservas. Backups podem
          preservar versões anteriores; isto não garante exclusão física
          universal. Esta ação é irreversível no sistema e será auditada.
        </AlertDescription>
      </Alert>
      <Label htmlFor="btg-diagnostico-expurgo">
        Digite {CONFIRMACAO_EXPURGO_BTG} para confirmar
      </Label>
      <Input
        id="btg-diagnostico-expurgo"
        value={confirmacao}
        disabled={pendente}
        autoComplete="off"
        onChange={event => onConfirmacao(event.target.value)}
      />
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancelar e fechar
        </Button>
        <Button
          type="submit"
          variant="destructive"
          disabled={pendente || confirmacao !== CONFIRMACAO_EXPURGO_BTG}
        >
          {pendente ? "Expurgando..." : "Confirmar expurgo manual"}
        </Button>
      </div>
    </form>
  );
}

type DialogProps = {
  diagnostico: BtgDiagnosticoMeta;
  acao: "visualizar" | "expurgar";
  onClose: () => void;
  onExpurgado: () => void;
};

// Não herdar subscribers de logs/devtools do cache global. O transporte e a sessão
// tRPC continuam os mesmos. O cache privado nunca recebe plaintext: onSuccess o
// retira do resultado antes do dispatch "success" do TanStack, inclusive se tardio.
export function criarCachePrivadoDiagnostico() {
  return new QueryClient({
    defaultOptions: {
      mutations: { retry: false, gcTime: 0 },
      queries: { retry: false, gcTime: 0 },
    },
  });
}

export default function BtgDiagnosticoDialog(props: DialogProps) {
  const { client } = trpc.useUtils();
  const [cachePrivado] = useState(criarCachePrivadoDiagnostico);
  useEffect(
    () => () => {
      cachePrivado.clear();
    },
    [cachePrivado]
  );
  return (
    <trpc.Provider client={client} queryClient={cachePrivado}>
      <QueryClientProvider client={cachePrivado}>
        <BtgDiagnosticoDialogConteudo {...props} cachePrivado={cachePrivado} />
      </QueryClientProvider>
    </trpc.Provider>
  );
}

export function BtgDiagnosticoDialogConteudo({
  diagnostico,
  acao,
  onClose,
  onExpurgado,
  cachePrivado,
}: DialogProps & { cachePrivado: QueryClient }) {
  const [finalidade, setFinalidade] = useState("");
  const [confirmado, setConfirmado] = useState(false);
  const [confirmacaoExpurgo, setConfirmacaoExpurgo] = useState("");
  const [conteudo, setConteudo] = useState<BtgDiagnosticoConteudo | null>(null);
  const [erro, setErro] = useState(false);
  const [guarda] = useState(criarGuardaDiagnostico);
  const resetRef = useRef(() => {});
  const limparRef = useRef(() => {});
  const visualizar = trpc.btgDiagnosticos.visualizar.useMutation({
    retry: false,
    gcTime: 0,
    onMutate: () => ({ pedido: guarda.iniciar() }),
    onSuccess: (resultado, _variables, contexto) => {
      const textoLocal = retirarConteudoDoResultado(resultado);
      if (
        resultado.id === diagnostico.id &&
        contexto &&
        guarda.aceita(contexto.pedido) &&
        podeVisualizarDiagnosticoUI(diagnostico)
      ) {
        setConteudo(textoLocal);
        setErro(false);
      }
      resetRef.current();
    },
    onError: (_error, _variables, contexto) => {
      if (contexto && guarda.aceita(contexto.pedido)) {
        setConteudo(null);
        setErro(true);
      }
      resetRef.current();
    },
    onSettled: () => {
      queueMicrotask(() => {
        resetRef.current();
        cachePrivado.getMutationCache().clear();
      });
    },
  });
  const expurgar = trpc.btgDiagnosticos.expurgar.useMutation({
    retry: false,
    gcTime: 0,
    onMutate: () => ({ pedido: guarda.iniciar() }),
    onSuccess: (_resultado, _variables, contexto) => {
      if (!contexto || !guarda.aceita(contexto.pedido)) return;
      limparRef.current();
      onExpurgado();
      onClose();
    },
    onError: (_error, _variables, contexto) => {
      if (contexto && guarda.aceita(contexto.pedido)) setErro(true);
      resetRef.current();
    },
    onSettled: () => {
      queueMicrotask(() => {
        resetRef.current();
        cachePrivado.getMutationCache().clear();
      });
    },
  });
  const pendente = visualizar.isPending || expurgar.isPending;
  resetRef.current = () => {
    visualizar.reset();
    expurgar.reset();
  };
  limparRef.current = () => {
    guarda.encerrar();
    setConteudo(null);
    setFinalidade("");
    setConfirmado(false);
    setConfirmacaoExpurgo("");
    setErro(false);
    resetRef.current();
  };
  useEffect(() => {
    guarda.ativar();
    return () => {
      guarda.encerrar();
      // O estado local desaparece no unmount; callbacks tardios apenas zeram o
      // resultado. Não apagar limparRef aqui: StrictMode pode repetir o efeito.
      resetRef.current();
    };
  }, [guarda]);
  const fechar = () => {
    limparRef.current();
    onClose();
  };
  const solicitar = () => {
    if (
      pendente ||
      !confirmado ||
      !finalidadeDiagnosticoValida(finalidade) ||
      !podeVisualizarDiagnosticoUI(diagnostico)
    )
      return;
    setErro(false);
    // onMutate inicia a geração imediatamente no ciclo de mutação. Nenhum fetch em render/effect.
    visualizar.mutate({
      diagnosticoId: diagnostico.id,
      confirmacao: true,
      finalidade: finalidade.trim(),
    });
  };
  const solicitarExpurgo = () => {
    if (
      pendente ||
      confirmacaoExpurgo !== CONFIRMACAO_EXPURGO_BTG ||
      !podeExpurgarDiagnosticoUI(diagnostico)
    )
      return;
    setConteudo(null);
    setErro(false);
    expurgar.mutate({
      diagnosticoId: diagnostico.id,
      confirmacao: CONFIRMACAO_EXPURGO_BTG,
    });
  };
  return (
    <Dialog
      open
      onOpenChange={aberto => {
        if (!aberto) fechar();
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {acao === "expurgar"
              ? "Expurgo manual do diagnóstico"
              : "Diagnóstico técnico BTG"}{" "}
            #{diagnostico.id}
          </DialogTitle>
          <DialogDescription>
            Acesso administrativo individual e auditado. Ao fechar ou cancelar,
            o texto é descartado desta tela, sem cópia ou exportação automática.
          </DialogDescription>
        </DialogHeader>
        <BtgDiagnosticoMetadados diagnostico={diagnostico} />
        {erro && (
          <Alert variant="destructive">
            <AlertDescription>{ERRO_DIAGNOSTICO_BTG}</AlertDescription>
          </Alert>
        )}
        {conteudo && podeVisualizarDiagnosticoUI(diagnostico) ? (
          <>
            <BtgDiagnosticoTexto conteudo={conteudo} />
            <Button variant="outline" onClick={fechar}>
              Fechar e descartar conteúdo
            </Button>
          </>
        ) : acao === "expurgar" && podeExpurgarDiagnosticoUI(diagnostico) ? (
          <BtgDiagnosticoExpurgoConfirmacao
            confirmacao={confirmacaoExpurgo}
            pendente={pendente}
            onConfirmacao={setConfirmacaoExpurgo}
            onSubmit={solicitarExpurgo}
            onCancel={fechar}
          />
        ) : acao === "visualizar" &&
          podeVisualizarDiagnosticoUI(diagnostico) ? (
          <BtgDiagnosticoConfirmacao
            finalidade={finalidade}
            confirmado={confirmado}
            pendente={pendente}
            onFinalidade={setFinalidade}
            onConfirmado={setConfirmado}
            onSubmit={solicitar}
            onCancel={fechar}
          />
        ) : (
          <Button variant="outline" onClick={fechar}>
            Fechar
          </Button>
        )}
      </DialogContent>
    </Dialog>
  );
}
