import React, {
  useState,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
} from "react";
import { useRoute, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { TRPCClientError } from "@trpc/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import {
  ArrowLeft,
  FileText,
  Printer,
  Download,
  Loader2,
  Scale,
  ClipboardPen,
  Gavel,
  Bell,
  Building2,
} from "lucide-react";
import {
  VARIAVEIS_CONDOMINIO,
  detectarVariaveisModelo,
  type DadosPreenchimentoCondominio,
  type ListaCondominiosPreenchimento,
} from "@shared/modelo-condominio";
import {
  criarFormularioModelo,
  editarCampoModelo,
  selecionarCondominioModelo,
  aplicarDadosCondominioModelo,
  falharDadosCondominioModelo,
  precisaConfirmarTroca,
  camposPendentesModelo,
  criarHtmlDocumentoModelo,
  type FormularioModelo,
} from "@/lib/modelo-condominio-form";

const TIPO_INFO: Record<
  string,
  { label: string; icon: ReactNode; color: string }
> = {
  procuracao: {
    label: "Procuração",
    icon: <Scale className="h-4 w-4" />,
    color: "text-teal-400",
  },
  carta_preposto: {
    label: "Carta de Preposto",
    icon: <ClipboardPen className="h-4 w-4" />,
    color: "text-cyan-400",
  },
  ata_audiencia: {
    label: "Ata de Audiência",
    icon: <Gavel className="h-4 w-4" />,
    color: "text-amber-400",
  },
  notificacao_juridica: {
    label: "Notificação Jurídica",
    icon: <Bell className="h-4 w-4" />,
    color: "text-rose-400",
  },
};
const LABELS: Record<string, string> = {
  ...Object.fromEntries(VARIAVEIS_CONDOMINIO.map(v => [v.chave, v.label])),
  representanteLegal: "Representante Legal",
  tipoAcao: "Tipo de Ação Judicial",
  numeroProcesso: "Número do Processo",
  dataDocumento: "Data do Documento",
  assinatura: "Assinatura (nome para assinar)",
  nomePreposto: "Nome do Preposto",
  dataHoraAudiencia: "Data e Hora da Audiência",
  dataAtual: "Data atual",
  dataAtualExtenso: "Data atual por extenso",
};
type ModeloTela = {
  id: number;
  nome: string;
  tipo: string;
  conteudoHtml: string;
};

function EstadoTela({
  mensagem,
  carregando = false,
}: {
  mensagem: string;
  carregando?: boolean;
}) {
  const [, navigate] = useLocation();
  return (
    <div className="p-6 space-y-4" role="status">
      <Button
        variant="outline"
        className="gap-2"
        onClick={() => navigate("/modelos-documento")}
      >
        <ArrowLeft className="h-4 w-4" />
        Voltar aos modelos
      </Button>
      <p className="flex gap-2 items-center text-muted-foreground">
        {carregando && <Loader2 className="h-5 w-5 animate-spin" />}
        {mensagem}
      </p>
    </div>
  );
}

/** Uma nova identidade desmonta todo o estado privado; não usar armazenamento persistente. */
export default function PreencherModeloJuridico() {
  const [, params] = useRoute("/modelos-documento/:id/preencher");
  const { user, loading, error } = useAuth();
  const modeloId = Number(params?.id);
  if (loading)
    return <EstadoTela mensagem="Verificando acesso..." carregando />;
  if (error || !user)
    return (
      <EstadoTela mensagem="Não foi possível confirmar seu acesso. Entre novamente no sistema." />
    );
  if (!Number.isInteger(modeloId) || modeloId <= 0)
    return <EstadoTela mensagem="Modelo inválido." />;
  const identidade = JSON.stringify([
    user.id,
    user.role,
    user.profileId,
    user.condominioId,
    user.escopoCondominios,
    user.isActive,
    user.isDeleted,
  ]);
  return (
    <ModeloAutorizado
      key={`${identidade}:${modeloId}`}
      modeloId={modeloId}
      identidade={identidade}
    />
  );
}

function ModeloAutorizado({
  modeloId,
  identidade,
}: {
  modeloId: number;
  identidade: string;
}) {
  const options = {
    retry: false,
    staleTime: 0,
    gcTime: 0,
    refetchOnWindowFocus: "always" as const,
    trpc: { abortOnUnmount: true },
  };
  const modeloQuery = trpc.modelosDocumento.getById.useQuery(
    { id: modeloId },
    options
  );
  const listaQuery =
    trpc.modelosDocumento.listarCondominiosPreenchimento.useQuery(
      { modeloId },
      options
    );
  if (modeloQuery.isError || listaQuery.isError)
    return (
      <EstadoTela mensagem="Não foi possível acessar o modelo e seus condomínios autorizados. Reabra a tela para tentar novamente." />
    );
  if (!modeloQuery.isFetchedAfterMount || !listaQuery.isFetchedAfterMount)
    return (
      <EstadoTela
        mensagem="Carregando modelo e condomínios autorizados..."
        carregando
      />
    );
  const modelo = modeloQuery.data;
  const lista = listaQuery.data;
  if (!modelo || !lista || lista.modeloId !== modeloId)
    return <EstadoTela mensagem="Modelo indisponível para preenchimento." />;
  return (
    <FormularioModeloDocumento
      key={`${modelo.id}:${modelo.conteudoHtml}:${lista.condominioVinculadoId}`}
      identidade={identidade}
      modelo={modelo}
      lista={lista}
      acessoPendente={modeloQuery.isFetching || listaQuery.isFetching}
    />
  );
}

/** Observador separado por revisão: A→B→A nunca associa uma resposta ao pedido antigo. */
function ConsultaDadosCondominio({
  estado,
  onDados,
  onErro,
  children,
}: {
  estado: FormularioModelo;
  onDados: (
    dados: DadosPreenchimentoCondominio,
    revisao: number,
    identidade: string
  ) => void;
  onErro: (revisao: number) => void;
  children: (pendente: boolean, erro: boolean) => ReactNode;
}) {
  const query = trpc.modelosDocumento.obterDadosPreenchimento.useQuery(
    { modeloId: estado.modeloId, condominioId: estado.condominioId! },
    {
      retry: false,
      staleTime: 0,
      gcTime: 0,
      refetchOnWindowFocus: "always",
      trpc: { abortOnUnmount: true },
    }
  );
  const { revisao, identidade } = estado;
  useEffect(() => {
    if (query.isError) onErro(revisao);
    else if (query.isFetchedAfterMount && !query.isFetching && query.data)
      onDados(query.data, revisao, identidade);
  }, [
    query.data,
    query.dataUpdatedAt,
    query.isFetching,
    query.isError,
    query.isFetchedAfterMount,
    onDados,
    onErro,
    revisao,
    identidade,
  ]);
  return (
    <>
      {children(query.isFetching || !query.isFetchedAfterMount, query.isError)}
    </>
  );
}

function FormularioModeloDocumento({
  identidade,
  modelo,
  lista,
  acessoPendente,
}: {
  identidade: string;
  modelo: ModeloTela;
  lista: ListaCondominiosPreenchimento;
  acessoPendente: boolean;
}) {
  const [estado, setEstado] = useState(() => {
    const inicial = criarFormularioModelo(
      identidade,
      modelo.id,
      detectarVariaveisModelo(modelo.conteudoHtml)
    );
    return lista.condominioVinculadoId
      ? selecionarCondominioModelo(inicial, lista.condominioVinculadoId)
      : inicial;
  });
  const [trocaPendente, setTrocaPendente] = useState<number | null>(null);
  const [revisaoPendente, setRevisaoPendente] = useState<
    "pdf" | "imprimir" | null
  >(null);
  const [dataHoraInput, setDataHoraInput] = useState("");
  const [, navigate] = useLocation();
  const gerarPDF = trpc.modelosDocumento.gerarPDF.useMutation();
  const trpcUtils = trpc.useUtils();
  const [imprimindo, setImprimindo] = useState(false);
  const montado = useRef(true);
  const acessoConfirmado = useRef(!acessoPendente);
  useEffect(() => {
    acessoConfirmado.current = !acessoPendente;
  }, [acessoPendente]);
  useEffect(() => {
    montado.current = true;
    return () => {
      montado.current = false;
    };
  }, []);
  const onDados = useCallback(
    (
      dados: DadosPreenchimentoCondominio,
      revisao: number,
      identidadeResposta: string
    ) =>
      setEstado(prev =>
        aplicarDadosCondominioModelo(prev, dados, revisao, identidadeResposta)
      ),
    []
  );
  const onErro = useCallback(
    (revisao: number) =>
      setEstado(prev => falharDadosCondominioModelo(prev, revisao)),
    []
  );
  const fonteNecessaria =
    estado.vinculados.length > 0 || lista.condominioVinculadoId !== null;
  const fontePermitida =
    estado.condominioId === null ||
    lista.condominios.some(c => c.id === estado.condominioId);
  useEffect(() => {
    if (!fontePermitida) onErro(estado.revisao);
  }, [fontePermitida, estado.revisao, onErro]);
  const htmlDocumento = criarHtmlDocumentoModelo(
    modelo.nome,
    modelo.conteudoHtml,
    estado.valores
  );
  const pendentes = camposPendentesModelo(estado);

  const executar = async (acao: "pdf" | "imprimir") => {
    if (acao === "pdf") {
      const pedido = {
        modeloId: modelo.id,
        variaveis: { ...estado.valores },
        contextoPreenchimento: { condominioId: estado.condominioId },
      };
      try {
        const data = await gerarPDF.mutateAsync(pedido);
        if (!montado.current || !acessoConfirmado.current) return;
        window.open(data.url, "_blank", "noopener,noreferrer");
        toast.success("PDF gerado com os valores revisados.");
      } catch (erro) {
        if (!montado.current) return;
        if (
          erro instanceof TRPCClientError &&
          ["FORBIDDEN", "UNAUTHORIZED", "NOT_FOUND"].includes(erro.data?.code)
        )
          onErro(estado.revisao);
        toast.error(
          "Não foi possível gerar o documento. Confirme seu acesso e tente novamente."
        );
      }
    } else {
      setImprimindo(true);
      try {
        // Impressão também exige contexto fresco, mas não produz/armazenha PDF no servidor.
        await trpcUtils.client.modelosDocumento.validarPreenchimento.query({
          modeloId: modelo.id,
          condominioId: estado.condominioId,
        });
        if (!montado.current || !acessoConfirmado.current) return;
        const janela = window.open("", "_blank");
        if (!janela) {
          toast.error(
            "Permita a abertura da janela de impressão no navegador."
          );
          return;
        }
        janela.opener = null;
        janela.document.write(htmlDocumento);
        janela.document.close();
        janela.focus();
        janela.print();
      } catch {
        onErro(estado.revisao);
        toast.error("Não foi possível confirmar o acesso para impressão.");
      } finally {
        if (montado.current) setImprimindo(false);
      }
    }
  };
  const escolher = (id: number) => {
    setRevisaoPendente(null);
    if (precisaConfirmarTroca(estado, id)) setTrocaPendente(id);
    else setEstado(prev => selecionarCondominioModelo(prev, id));
  };
  const renderizar = (consultaPendente: boolean, erroConsulta: boolean) => {
    const pronta =
      !acessoPendente &&
      fontePermitida &&
      !consultaPendente &&
      !erroConsulta &&
      estado.status !== "erro" &&
      (!fonteNecessaria || estado.status === "pronto");
    const acaoBloqueada =
      !pronta || gerarPDF.isPending || imprimindo || trocaPendente !== null;
    const acionar = (acao: "pdf" | "imprimir") => {
      if (acaoBloqueada) return;
      if (pendentes.length) setRevisaoPendente(acao);
      else void executar(acao);
    };
    return (
      <>
        <FormularioDocumentoView
          modelo={modelo}
          lista={lista}
          estado={estado}
          htmlDocumento={pronta ? htmlDocumento : ""}
          pendente={
            acessoPendente || consultaPendente || estado.status === "carregando"
          }
          erro={erroConsulta || !fontePermitida || estado.status === "erro"}
          bloqueada={acaoBloqueada}
          gerando={gerarPDF.isPending || imprimindo}
          onVoltar={() => navigate("/modelos-documento")}
          onEscolher={escolher}
          onEditar={(chave, valor) => {
            setRevisaoPendente(null);
            setEstado(prev => editarCampoModelo(prev, chave, valor));
          }}
          onPDF={() => acionar("pdf")}
          onImprimir={() => acionar("imprimir")}
          dataHoraInput={dataHoraInput}
          onDataHora={setDataHoraInput}
        />
        <AlertDialog
          open={trocaPendente !== null}
          onOpenChange={open => {
            if (!open) setTrocaPendente(null);
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Trocar condomínio?</AlertDialogTitle>
              <AlertDialogDescription>
                Trocar o condomínio substituirá os campos vinculados ao
                cadastro, incluindo os que você editou. Campos independentes
                serão mantidos.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Manter condomínio atual</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  if (trocaPendente !== null)
                    setEstado(prev =>
                      selecionarCondominioModelo(prev, trocaPendente)
                    );
                  setTrocaPendente(null);
                }}
              >
                Trocar e preencher
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        <AlertDialog
          open={revisaoPendente !== null}
          onOpenChange={open => {
            if (!open) setRevisaoPendente(null);
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                Revisar campos sem preenchimento
              </AlertDialogTitle>
              <AlertDialogDescription>
                Estes campos ficarão vazios no documento:{" "}
                {pendentes.map(chave => LABELS[chave] ?? chave).join(", ")}.
                Confirme se isso é adequado para este documento.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Voltar e revisar</AlertDialogCancel>
              <AlertDialogAction
                disabled={acaoBloqueada}
                onClick={() => {
                  const acao = revisaoPendente;
                  setRevisaoPendente(null);
                  if (acao && !acaoBloqueada) void executar(acao);
                }}
              >
                Continuar com campos vazios
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </>
    );
  };
  return estado.condominioId !== null ? (
    <ConsultaDadosCondominio
      key={`${identidade}:${estado.revisao}`}
      estado={estado}
      onDados={onDados}
      onErro={onErro}
    >
      {renderizar}
    </ConsultaDadosCondominio>
  ) : (
    renderizar(false, false)
  );
}

/** View reutilizada pela inspeção sintética; todas as ações entram pelos callbacks. */
export function FormularioDocumentoView({
  modelo,
  lista,
  estado,
  htmlDocumento,
  pendente,
  erro,
  bloqueada,
  gerando,
  onVoltar,
  onEscolher,
  onEditar,
  onPDF,
  onImprimir,
  dataHoraInput,
  onDataHora,
}: {
  modelo: ModeloTela;
  lista: ListaCondominiosPreenchimento;
  estado: FormularioModelo;
  htmlDocumento: string;
  pendente: boolean;
  erro: boolean;
  bloqueada: boolean;
  gerando: boolean;
  onVoltar: () => void;
  onEscolher: (id: number) => void;
  onEditar: (chave: string, valor: string) => void;
  onPDF: () => void;
  onImprimir: () => void;
  dataHoraInput: string;
  onDataHora: (valor: string) => void;
}) {
  const tipoInfo = TIPO_INFO[modelo.tipo] ?? {
    label: modelo.tipo,
    icon: <FileText className="h-4 w-4" />,
    color: "text-muted-foreground",
  };
  const fonteNecessaria =
    estado.vinculados.length > 0 || lista.condominioVinculadoId !== null;
  const labelOrigem = (chave: string) =>
    estado.origens[chave] === "cadastro"
      ? "Preenchido pelo cadastro"
      : estado.origens[chave] === "ausente"
        ? "Não informado no cadastro"
        : estado.origens[chave] === "padrao"
          ? "Valor padrão — pode editar"
          : "Preenchimento manual";
  return (
    <div className="p-4 sm:p-6 space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Voltar aos modelos"
            onClick={onVoltar}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
              <span className={tipoInfo.color}>{tipoInfo.icon}</span>
              <span className="truncate">Preencher: {modelo.nome}</span>
            </h1>
            <p className="text-muted-foreground text-xs sm:text-sm mt-0.5">
              {tipoInfo.label} — revise os dados antes de gerar o documento.
            </p>
          </div>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button
            variant="outline"
            className="gap-2"
            onClick={onImprimir}
            disabled={bloqueada}
          >
            <Printer className="h-4 w-4" />
            Imprimir
          </Button>
          <Button className="gap-2" onClick={onPDF} disabled={bloqueada}>
            {gerando ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            Gerar PDF
          </Button>
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Campos do Documento</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {fonteNecessaria && (
              <div className="space-y-2 rounded-lg bg-muted/40 p-3">
                <Label
                  htmlFor="fonte_condominio"
                  className="flex gap-2 items-center"
                >
                  <Building2 className="h-4 w-4" />
                  Dados do condomínio
                </Label>
                <Select
                  value={
                    estado.condominioId === null
                      ? undefined
                      : String(estado.condominioId)
                  }
                  onValueChange={valor => onEscolher(Number(valor))}
                  disabled={gerando || lista.condominioVinculadoId !== null}
                >
                  <SelectTrigger id="fonte_condominio" className="w-full">
                    <SelectValue placeholder="Selecione o condomínio..." />
                  </SelectTrigger>
                  <SelectContent>
                    {lista.condominios.map(c => (
                      <SelectItem key={c.id} value={String(c.id)}>
                        {c.name} · #{c.id}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {lista.condominioVinculadoId !== null
                    ? "Este modelo está vinculado ao condomínio indicado."
                    : "Selecione a fonte do cadastro. Os valores do documento continuam editáveis."}
                </p>
                <p className="text-xs text-muted-foreground">
                  O síndico/gestor cadastrado não é presumido representante
                  legal. Representante e assinatura permanecem manuais.
                </p>
                <div role="status" className="text-xs">
                  {erro ? (
                    <span className="text-destructive">
                      Não foi possível confirmar o cadastro. Reabra a tela para
                      tentar novamente.
                    </span>
                  ) : pendente ? (
                    <span className="flex items-center gap-1">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Carregando dados do condomínio...
                    </span>
                  ) : estado.status === "pronto" ? (
                    `Fonte: ${estado.nomeFonte}`
                  ) : (
                    "Selecione um condomínio autorizado para preencher."
                  )}
                </div>
              </div>
            )}
            {!estado.chaves.length && (
              <p className="text-sm text-muted-foreground">
                Nenhuma variável detectada. Este documento usa apenas o conteúdo
                do modelo.
              </p>
            )}
            {estado.chaves.map(chave => {
              const data = chave === "dataDocumento" || chave === "dataAtual";
              const vinculado = estado.vinculados.includes(chave);
              return (
                <div key={chave} className="space-y-1.5">
                  <Label htmlFor={chave} className="text-sm font-medium">
                    {LABELS[chave] ?? chave}
                  </Label>
                  <Input
                    id={chave}
                    type={
                      data
                        ? "date"
                        : chave === "dataHoraAudiencia"
                          ? "datetime-local"
                          : "text"
                    }
                    disabled={
                      gerando ||
                      (vinculado &&
                        (pendente || erro || estado.status !== "pronto"))
                    }
                    value={
                      data
                        ? (estado.valores[chave] ?? "")
                            .split("/")
                            .reverse()
                            .join("-")
                        : chave === "dataHoraAudiencia"
                          ? dataHoraInput
                          : (estado.valores[chave] ?? "")
                    }
                    aria-describedby={`origem_${chave}`}
                    placeholder={`Valor para {{${chave}}}...`}
                    onChange={e => {
                      const raw = e.target.value;
                      if (chave === "dataHoraAudiencia") {
                        onDataHora(raw);
                        onEditar(
                          chave,
                          raw
                            ? new Date(raw).toLocaleString("pt-BR", {
                                day: "2-digit",
                                month: "2-digit",
                                year: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                              })
                            : ""
                        );
                      } else
                        onEditar(
                          chave,
                          data && raw
                            ? new Date(raw + "T12:00:00").toLocaleDateString(
                                "pt-BR"
                              )
                            : raw
                        );
                    }}
                  />
                  <p
                    id={`origem_${chave}`}
                    className="text-xs text-muted-foreground"
                  >
                    {labelOrigem(chave)}
                  </p>
                </div>
              );
            })}
            {camposPendentesModelo(estado).length > 0 && (
              <p className="text-xs text-muted-foreground">
                Há campos sem preenchimento. Eles serão apresentados para
                revisão antes de gerar ou imprimir.
              </p>
            )}
          </CardContent>
        </Card>
        <Card className="flex flex-col">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Pré-visualização</CardTitle>
          </CardHeader>
          <CardContent className="flex-1 p-0">
            {htmlDocumento ? (
              <iframe
                title="Pré-visualização do documento"
                sandbox=""
                srcDoc={htmlDocumento}
                className="w-full min-h-[560px] bg-white rounded-b-lg border-0"
              />
            ) : (
              <div className="min-h-[500px] flex items-center justify-center p-8 text-sm text-muted-foreground">
                A prévia ficará disponível quando a fonte estiver confirmada.
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
