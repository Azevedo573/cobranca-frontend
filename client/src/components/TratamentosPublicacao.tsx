import { useState } from "react";
import { Calendar, ChevronDown, History, ListTodo, Loader2, Mic, PlusCircle, Timer } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { contextoPublicacaoTratamento, tituloTratamentoPublicacao } from "@/lib/tratamentosPublicacao";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

type TipoTratamento = "prazo" | "audiencia" | "evento" | "historico";

export function TratamentosPublicacao({ pub, onAdicionarTarefa }: { pub: any; onAdicionarTarefa: () => void }) {
  const numeroProcesso = pub.numeroProcessoMascara || pub.numeroProcesso;
  const { data: processos = [] } = trpc.processos.listar.useQuery({ busca: numeroProcesso || "" }, { enabled: !!numeroProcesso });
  const processo = processos.find((p: any) => p.numeroCNJ?.replace(/\D/g, "") === numeroProcesso?.replace(/\D/g, "")) ?? null;
  const utils = trpc.useUtils();
  const [tipo, setTipo] = useState<TipoTratamento | null>(null);
  const [data, setData] = useState(pub.dataDisponibilizacao ? new Date(pub.dataDisponibilizacao).toISOString().slice(0, 10) : "");
  const [hora, setHora] = useState("09:00");
  const [descricao, setDescricao] = useState("");
  const criarPrazo = trpc.prazos.create.useMutation();
  const criarAudiencia = trpc.juridicoDemandas.createAssembleia.useMutation();
  const criarMovimentacao = trpc.processos.addMovimentacao.useMutation();

  const contexto = {
    numeroProcesso,
    tipo: pub.tipoComunicacao,
    tribunal: pub.siglaTribunal,
    orgao: pub.nomeOrgao,
    data: pub.dataDisponibilizacao,
    texto: pub.texto,
  };

  const abrir = (novoTipo: TipoTratamento) => {
    setTipo(novoTipo);
    setDescricao(contextoPublicacaoTratamento(contexto));
  };

  const salvar = async () => {
    if (!tipo || !data) return toast.error("Informe a data do tratamento");
    const titulo = tituloTratamentoPublicacao(tipo, contexto);
    try {
      if (tipo === "prazo") {
        await criarPrazo.mutateAsync({
          titulo,
          tipo: "processual",
          processoId: processo?.id,
          condominioId: processo?.condominioId ?? undefined,
          condominioNome: processo?.condominioNome ?? undefined,
          dataLimite: new Date(`${data}T12:00:00`),
          alertas: JSON.stringify([15, 7, 1]),
          observacoes: descricao,
        });
        await utils.prazos.listar.invalidate();
      } else if (tipo === "audiencia") {
        await criarAudiencia.mutateAsync({
          condominioId: processo?.condominioId ?? undefined,
          tipo: "outro",
          data,
          hora,
          endereco: pub.nomeOrgao || undefined,
          advogadoNome: pub.nomePesquisado || undefined,
          pauta: `${titulo}\n\n${descricao}`,
        });
        if (processo) {
          await criarMovimentacao.mutateAsync({ processoId: processo.id, data: new Date(`${data}T${hora}:00`), descricao: `${titulo}\n\n${descricao}`, tipo: "audiencia" });
        }
      } else {
        if (!processo) return toast.error("Cadastre ou vincule o processo antes de registrar este tratamento");
        await criarMovimentacao.mutateAsync({ processoId: processo.id, data: new Date(`${data}T${hora}:00`), descricao: `${titulo}\n\n${descricao}`, tipo: "outro" });
      }
      await utils.processos.getById.invalidate();
      toast.success(tipo === "prazo" ? "Prazo adicionado" : tipo === "audiencia" ? "Audiência adicionada" : tipo === "evento" ? "Evento registrado" : "Histórico registrado");
      setTipo(null);
    } catch (erro: any) {
      toast.error("Não foi possível registrar o tratamento", { description: erro?.message });
    }
  };

  const pendente = criarPrazo.isPending || criarAudiencia.isPending || criarMovimentacao.isPending;
  const tituloModal = tipo === "prazo" ? "Adicionar prazo" : tipo === "audiencia" ? "Adicionar audiência" : tipo === "evento" ? "Adicionar evento" : "Adicionar histórico manual";

  return <>
    <DropdownMenu>
      <DropdownMenuTrigger asChild><Button variant="outline" size="sm" className="gap-1.5"><PlusCircle className="h-4 w-4" />Tratamentos<ChevronDown className="h-3.5 w-3.5 opacity-60" /></Button></DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuItem onClick={() => abrir("prazo")}><Timer className="h-4 w-4 mr-2 text-muted-foreground" />Adicionar prazo</DropdownMenuItem>
        <DropdownMenuItem onClick={() => abrir("audiencia")}><Mic className="h-4 w-4 mr-2 text-muted-foreground" />Adicionar audiência</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onAdicionarTarefa}><ListTodo className="h-4 w-4 mr-2 text-muted-foreground" />Adicionar tarefa</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => abrir("evento")}><Calendar className="h-4 w-4 mr-2 text-muted-foreground" />Adicionar evento</DropdownMenuItem>
        <DropdownMenuItem onClick={() => abrir("historico")}><History className="h-4 w-4 mr-2 text-muted-foreground" />Adicionar histórico manual</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
    <Dialog open={!!tipo} onOpenChange={(aberto) => !aberto && setTipo(null)}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{tituloModal}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3"><div className="space-y-1.5"><Label>Data *</Label><Input type="date" value={data} onChange={(e) => setData(e.target.value)} /></div>{tipo !== "prazo" && <div className="space-y-1.5"><Label>Hora</Label><Input type="time" value={hora} onChange={(e) => setHora(e.target.value)} /></div>}</div>
          {!processo && <p className="text-xs rounded border border-amber-500/30 bg-amber-500/10 p-2 text-amber-700 dark:text-amber-300">Não há processo vinculado. Prazo e audiência podem ser salvos sem vínculo; para evento e histórico, primeiro cadastre o processo.</p>}
          <div className="space-y-1.5"><Label>Contexto e observações</Label><Textarea rows={9} value={descricao} onChange={(e) => setDescricao(e.target.value)} className="text-xs" /></div>
        </div>
        <DialogFooter><Button variant="ghost" onClick={() => setTipo(null)}>Cancelar</Button><Button onClick={salvar} disabled={pendente}>{pendente && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}Salvar tratamento</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}
