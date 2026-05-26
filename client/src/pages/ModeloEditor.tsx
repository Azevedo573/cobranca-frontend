import { useState, useCallback, useRef, useEffect } from "react";
import { useRoute, useLocation } from "wouter";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import TextAlign from "@tiptap/extension-text-align";
import Underline from "@tiptap/extension-underline";
import { Table } from "@tiptap/extension-table";
import { TableRow } from "@tiptap/extension-table-row";
import { TableCell } from "@tiptap/extension-table-cell";
import { TableHeader } from "@tiptap/extension-table-header";
import Image from "@tiptap/extension-image";
import { TextStyle } from "@tiptap/extension-text-style";
import Placeholder from "@tiptap/extension-placeholder";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import {
  Bold, Italic, Underline as UnderlineIcon, AlignLeft, AlignCenter, AlignRight, AlignJustify,
  List, ListOrdered, Table as TableIcon, Undo, Redo, Save, ArrowLeft,
  Upload, Trash2, Eye, ChevronDown, ChevronRight, Variable, Image as ImageIcon,
  Heading1, Heading2, Heading3,
} from "lucide-react";

const TIPOS_DOCUMENTO = [
  { value: "proposta_acordo", label: "Proposta de Acordo" },
  { value: "termo_acordo", label: "Termo de Acordo" },
  { value: "notificacao_debito", label: "Notificação de Débito" },
  { value: "carta_cobranca", label: "Carta de Cobrança" },
  { value: "recibo_pagamento", label: "Recibo de Pagamento" },
  { value: "contrato_parcelamento", label: "Contrato de Parcelamento" },
  { value: "outro", label: "Outro" },
] as const;

const CATEGORIAS_VARIAVEIS: Record<string, { chave: string; descricao: string }[]> = {
  Devedor: [
    { chave: "nomeDevedor", descricao: "Nome completo" },
    { chave: "cpfCnpjDevedor", descricao: "CPF / CNPJ" },
    { chave: "unidadeDevedor", descricao: "Unidade" },
    { chave: "blocoDevedor", descricao: "Bloco" },
    { chave: "enderecoDevedor", descricao: "Endereço completo" },
  ],
  Condomínio: [
    { chave: "nomeCondominio", descricao: "Nome do condomínio" },
    { chave: "cnpjCondominio", descricao: "CNPJ" },
    { chave: "enderecoCondominio", descricao: "Endereço" },
  ],
  Acordo: [
    { chave: "valorOriginal", descricao: "Valor original da dívida" },
    { chave: "valorAcordo", descricao: "Valor total do acordo" },
    { chave: "valorEntrada", descricao: "Valor da entrada" },
    { chave: "numeroParcelas", descricao: "Número de parcelas" },
    { chave: "valorParcela", descricao: "Valor de cada parcela" },
    { chave: "dataVencimentoPrimeiraParcela", descricao: "Vencimento da 1ª parcela" },
    { chave: "tabelaParcelas", descricao: "Tabela completa de parcelas" },
  ],
  Encargos: [
    { chave: "honorarios", descricao: "Total de honorários" },
    { chave: "juros", descricao: "Total de juros" },
    { chave: "multa", descricao: "Total de multa" },
    { chave: "correcao", descricao: "Total de correção monetária" },
    { chave: "saldoVencido", descricao: "Saldo vencido" },
    { chave: "saldoAVencer", descricao: "Saldo a vencer" },
    { chave: "saldoTotal", descricao: "Saldo total (vencido + a vencer)" },
    { chave: "percentualHonorarios", descricao: "Percentual de honorários (ex: 10%)" },
    { chave: "percentualJuros", descricao: "Taxa de juros (ex: 1% a.m.)" },
    { chave: "percentualMulta", descricao: "Percentual de multa (ex: 2%)" },
  ],
  Data: [
    { chave: "dataAtual", descricao: "Data atual (dd/mm/aaaa)" },
    { chave: "dataAtualExtenso", descricao: "Data por extenso" },
  ],
  Responsável: [
    { chave: "nomeResponsavel", descricao: "Nome do responsável" },
  ],
};

// ─── Barra de ferramentas ─────────────────────────────────────────────────────
function ToolbarButton({ onClick, active, title, children }: {
  onClick: () => void; active?: boolean; title: string; children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`p-1.5 rounded text-sm transition-colors ${
        active
          ? "bg-primary text-primary-foreground"
          : "hover:bg-muted text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function EditorToolbar({ editor }: { editor: ReturnType<typeof useEditor> }) {
  if (!editor) return null;
  return (
    <div className="flex flex-wrap items-center gap-0.5 p-1.5 sm:p-2 border-b bg-muted/30 overflow-x-auto scrollbar-none">
      {/* Desfazer / Refazer */}
      <ToolbarButton onClick={() => editor.chain().focus().undo().run()} title="Desfazer">
        <Undo className="h-3.5 w-3.5" />
      </ToolbarButton>
      <ToolbarButton onClick={() => editor.chain().focus().redo().run()} title="Refazer">
        <Redo className="h-3.5 w-3.5" />
      </ToolbarButton>
      <div className="w-px h-5 bg-border mx-1" />

      {/* Headings */}
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
        active={editor.isActive("heading", { level: 1 })}
        title="Título 1"
      >
        <Heading1 className="h-3.5 w-3.5" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        active={editor.isActive("heading", { level: 2 })}
        title="Título 2"
      >
        <Heading2 className="h-3.5 w-3.5" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        active={editor.isActive("heading", { level: 3 })}
        title="Título 3"
      >
        <Heading3 className="h-3.5 w-3.5" />
      </ToolbarButton>
      <div className="w-px h-5 bg-border mx-1" />

      {/* Formatação */}
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBold().run()}
        active={editor.isActive("bold")}
        title="Negrito"
      >
        <Bold className="h-3.5 w-3.5" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleItalic().run()}
        active={editor.isActive("italic")}
        title="Itálico"
      >
        <Italic className="h-3.5 w-3.5" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleUnderline().run()}
        active={editor.isActive("underline")}
        title="Sublinhado"
      >
        <UnderlineIcon className="h-3.5 w-3.5" />
      </ToolbarButton>
      <div className="w-px h-5 bg-border mx-1" />

      {/* Alinhamento */}
      <ToolbarButton
        onClick={() => editor.chain().focus().setTextAlign("left").run()}
        active={editor.isActive({ textAlign: "left" })}
        title="Alinhar à esquerda"
      >
        <AlignLeft className="h-3.5 w-3.5" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().setTextAlign("center").run()}
        active={editor.isActive({ textAlign: "center" })}
        title="Centralizar"
      >
        <AlignCenter className="h-3.5 w-3.5" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().setTextAlign("right").run()}
        active={editor.isActive({ textAlign: "right" })}
        title="Alinhar à direita"
      >
        <AlignRight className="h-3.5 w-3.5" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().setTextAlign("justify").run()}
        active={editor.isActive({ textAlign: "justify" })}
        title="Justificar"
      >
        <AlignJustify className="h-3.5 w-3.5" />
      </ToolbarButton>
      <div className="w-px h-5 bg-border mx-1" />

      {/* Listas */}
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        active={editor.isActive("bulletList")}
        title="Lista com marcadores"
      >
        <List className="h-3.5 w-3.5" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        active={editor.isActive("orderedList")}
        title="Lista numerada"
      >
        <ListOrdered className="h-3.5 w-3.5" />
      </ToolbarButton>
      <div className="w-px h-5 bg-border mx-1" />

      {/* Tabela */}
      <ToolbarButton
        onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
        title="Inserir tabela"
      >
        <TableIcon className="h-3.5 w-3.5" />
      </ToolbarButton>
    </div>
  );
}

// ─── Upload de imagem ─────────────────────────────────────────────────────────
function ImageUploadField({
  label,
  value,
  tipo,
  onUpload,
  onRemove,
}: {
  label: string;
  value: string | null | undefined;
  tipo: "logo" | "marca_dagua";
  onUpload: (url: string) => void;
  onRemove: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const uploadMutation = trpc.modelosDocumento.uploadImagem.useMutation({
    onSuccess: (data) => {
      onUpload(data.url);
      toast.success(`${label} enviada com sucesso`);
    },
    onError: (err) => toast.error(`Erro ao enviar ${label}: ` + err.message),
  });

  const handleFile = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const base64 = (e.target?.result as string).split(",")[1];
      uploadMutation.mutate({
        nomeArquivo: file.name,
        mimeType: file.type,
        base64,
        tipo,
      });
    };
    reader.readAsDataURL(file);
  }, [tipo, uploadMutation]);

  return (
    <div className="space-y-2">
      <Label className="text-sm font-medium">{label}</Label>
      {value ? (
        <div className="flex items-center gap-3 p-3 border rounded-lg bg-muted/30">
          <img src={value} alt={label} className="h-12 w-auto object-contain rounded border bg-white" />
          <div className="flex-1 min-w-0">
            <p className="text-xs text-muted-foreground truncate">{value.split("/").pop()}</p>
          </div>
          <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={onRemove}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ) : (
        <div
          className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 transition-colors"
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const file = e.dataTransfer.files[0];
            if (file) handleFile(file);
          }}
        >
          <Upload className="h-6 w-6 mx-auto text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">
            {uploadMutation.isPending ? "Enviando..." : "Clique ou arraste a imagem aqui"}
          </p>
          <p className="text-xs text-muted-foreground mt-1">PNG, JPG, SVG — máx. 5MB</p>
        </div>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
        }}
      />
    </div>
  );
}

// ─── Painel de variáveis ──────────────────────────────────────────────────────
function PainelVariaveis({ onInserir }: { onInserir: (chave: string) => void }) {
  const [expandido, setExpandido] = useState<string | null>("Acordo");

  return (
    <div className="space-y-1">
      {Object.entries(CATEGORIAS_VARIAVEIS).map(([categoria, variaveis]) => (
        <div key={categoria} className="border rounded-lg overflow-hidden">
          <button
            type="button"
            className="w-full flex items-center justify-between px-3 py-2 text-sm font-medium bg-muted/40 hover:bg-muted/60 transition-colors"
            onClick={() => setExpandido(expandido === categoria ? null : categoria)}
          >
            <span>{categoria}</span>
            {expandido === categoria ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          </button>
          {expandido === categoria && (
            <div className="p-2 space-y-1">
              {variaveis.map((v) => (
                <button
                  key={v.chave}
                  type="button"
                  className="w-full text-left px-2 py-1.5 rounded text-xs hover:bg-primary/10 transition-colors group flex items-center justify-between gap-2"
                  onClick={() => onInserir(v.chave)}
                >
                  <span className="text-muted-foreground">{v.descricao}</span>
                  <Badge variant="secondary" className="text-[10px] font-mono shrink-0 group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                    {`{{${v.chave}}}`}
                  </Badge>
                </button>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Painel de Anexos ──────────────────────────────────────────────────────────────────
function AnexosPanel({ modeloId, isEdicao }: { modeloId: number | null; isEdicao: boolean }) {
  const utils = trpc.useUtils();
  const inputRef = useRef<HTMLInputElement>(null);
  const [editandoIdx, setEditandoIdx] = useState<number | null>(null);
  const [legendaEdit, setLegendaEdit] = useState("");

  const { data: anexos = [] } = trpc.modelosDocumento.listAnexos.useQuery(
    { modeloId: modeloId! },
    { enabled: isEdicao }
  );

  const uploadMutation = trpc.modelosDocumento.uploadImagem.useMutation({
    onSuccess: (data, vars) => {
      if (!modeloId) return;
      addAnexoMutation.mutate({
        modeloId,
        nomeArquivo: vars.nomeArquivo,
        mimeType: vars.mimeType,
        base64: vars.base64,
        alinhamento: "centro",
      });
    },
    onError: (err) => toast.error("Erro ao enviar imagem: " + err.message),
  });

  const addAnexoMutation = trpc.modelosDocumento.addAnexo.useMutation({
    onSuccess: () => { utils.modelosDocumento.listAnexos.invalidate(); toast.success("Anexo adicionado"); },
    onError: (err) => toast.error("Erro ao adicionar anexo: " + err.message),
  });

  const updateAnexoMutation = trpc.modelosDocumento.updateAnexo.useMutation({
    onSuccess: () => { utils.modelosDocumento.listAnexos.invalidate(); setEditandoIdx(null); },
  });

  const removeAnexoMutation = trpc.modelosDocumento.deleteAnexo.useMutation({
    onSuccess: () => { utils.modelosDocumento.listAnexos.invalidate(); toast.success("Anexo removido"); },
  });

  const handleFile = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const base64 = (e.target?.result as string).split(",")[1];
      uploadMutation.mutate({ nomeArquivo: file.name, mimeType: file.type, base64, tipo: "logo" });
    };
    reader.readAsDataURL(file);
  }, [uploadMutation]);

  if (!isEdicao) {
    return (
      <div className="flex flex-col items-center justify-center h-32 text-center">
        <p className="text-xs text-muted-foreground">Salve o modelo primeiro para adicionar anexos.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Adicione imagens ou fotos que serão incluídas ao final do documento PDF gerado.
      </p>

      {/* Botão de upload */}
      <div
        className="border-2 border-dashed rounded-lg p-4 text-center cursor-pointer hover:border-primary/50 transition-colors"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
      >
        <Upload className="h-5 w-5 mx-auto text-muted-foreground mb-1" />
        <p className="text-xs text-muted-foreground">
          {uploadMutation.isPending || addAnexoMutation.isPending ? "Enviando..." : "Clique ou arraste a imagem"}
        </p>
        <p className="text-[10px] text-muted-foreground mt-0.5">PNG, JPG, SVG — máx. 5MB</p>
      </div>
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />

      {/* Lista de anexos */}
      {anexos.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-4">Nenhum anexo adicionado.</p>
      ) : (
        <div className="space-y-2">
          {anexos.map((anexo, idx) => (
            <div key={anexo.id} className="border rounded-lg p-2 space-y-2">
              <div className="flex items-center gap-2">
                <img src={anexo.url} alt={anexo.nomeOriginal ?? ""} className="h-10 w-14 object-cover rounded border bg-white shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs truncate font-medium">{anexo.nomeOriginal ?? "Imagem"}</p>
                  {editandoIdx === idx ? (
                    <div className="flex gap-1 mt-1">
                      <input
                        className="flex-1 text-xs border rounded px-1.5 py-0.5 bg-background"
                        placeholder="Legenda..."
                        value={legendaEdit}
                        onChange={(e) => setLegendaEdit(e.target.value)}
                        autoFocus
                      />
                      <button type="button" className="text-xs text-primary font-medium" onClick={() => { updateAnexoMutation.mutate({ id: anexo.id, legenda: legendaEdit }); }}>OK</button>
                      <button type="button" className="text-xs text-muted-foreground" onClick={() => setEditandoIdx(null)}>X</button>
                    </div>
                  ) : (
                    <p className="text-[10px] text-muted-foreground truncate cursor-pointer hover:text-foreground" onClick={() => { setEditandoIdx(idx); setLegendaEdit(anexo.legenda ?? ""); }}>
                      {anexo.legenda ? anexo.legenda : <span className="italic">Adicionar legenda...</span>}
                    </p>
                  )}
                </div>
                <button type="button" className="text-destructive hover:text-destructive/80 shrink-0" onClick={() => removeAnexoMutation.mutate({ id: anexo.id })}>
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
              {/* Alinhamento */}
              <Select value={anexo.alinhamento ?? "centro"} onValueChange={(v) => updateAnexoMutation.mutate({ id: anexo.id, alinhamento: v as any })}>
                <SelectTrigger className="h-7 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="esquerda">Esquerda</SelectItem>
                  <SelectItem value="centro">Centro</SelectItem>
                  <SelectItem value="direita">Direita</SelectItem>
                </SelectContent>
              </Select>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Página principal ──────────────────────────────────────────────────────────────────
export default function ModeloEditor() { const [, params] = useRoute("/modelos-documento/:id/editar");
  const [, paramsNovo] = useRoute("/modelos-documento/novo");
  const [, navigate] = useLocation();

  const rawId = params?.id && params.id !== "novo" ? parseInt(params.id, 10) : null;
  const modeloId = rawId !== null && !isNaN(rawId) && rawId > 0 ? rawId : null;
  const isEdicao = modeloId !== null;

  // Estado do formulário
  const [nome, setNome] = useState("");
  const [tipo, setTipo] = useState<string>("outro");
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [marcaDaguaUrl, setMarcaDaguaUrl] = useState<string | null>(null);
  const [logoAlinhamento, setLogoAlinhamento] = useState<"esquerda" | "centro" | "direita">("esquerda");
  const [logoPosicaoVertical, setLogoPosicaoVertical] = useState<"topo" | "rodape">("topo");
  const [logoLargura, setLogoLargura] = useState<number>(120);
  const [marcaDaguaOpacidade, setMarcaDaguaOpacidade] = useState<number>(8);
  const [marcaDaguaPosicao, setMarcaDaguaPosicao] = useState<"diagonal" | "centro" | "topo" | "rodape">("diagonal");
  const [salvando, setSalvando] = useState(false);
  const [gerandoPDF, setGerandoPDF] = useState(false);

  // Carregar modelo existente
  const { data: modeloExistente } = trpc.modelosDocumento.getById.useQuery(
    { id: modeloId! },
    { enabled: isEdicao }
  );

  // Editor TipTap
  const editor = useEditor({
    extensions: [
      StarterKit,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Underline,
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      Image,
      TextStyle,
      Placeholder.configure({ placeholder: "Comece a escrever o documento aqui... Use o painel de variáveis à direita para inserir campos dinâmicos como {{nomeDevedor}}, {{valorAcordo}}, etc." }),
    ],
    content: "<p></p>",
    editorProps: {
      attributes: {
        class: "prose prose-sm max-w-none focus:outline-none min-h-[500px] p-6",
      },
    },
  });

  // Preencher formulário ao carregar modelo existente
  useEffect(() => {
    if (modeloExistente && editor) {
      setNome(modeloExistente.nome);
      setTipo(modeloExistente.tipo);
      setLogoUrl(modeloExistente.logoUrl ?? null);
      setMarcaDaguaUrl(modeloExistente.marcaDaguaUrl ?? null);
      setLogoAlinhamento((modeloExistente.logoAlinhamento as any) ?? "esquerda");
      setLogoPosicaoVertical((modeloExistente.logoPosicaoVertical as any) ?? "topo");
      setLogoLargura(modeloExistente.logoLargura ?? 120);
      setMarcaDaguaOpacidade(modeloExistente.marcaDaguaOpacidade ?? 8);
      setMarcaDaguaPosicao((modeloExistente.marcaDaguaPosicao as any) ?? "diagonal");
      editor.commands.setContent(modeloExistente.conteudoHtml || "<p></p>");
    }
  }, [modeloExistente, editor]);

  // Mutations
  const createMutation = trpc.modelosDocumento.create.useMutation();
  const updateMutation = trpc.modelosDocumento.update.useMutation();
  const gerarPDFMutation = trpc.modelosDocumento.gerarPDF.useMutation();

  const inserirVariavel = useCallback((chave: string) => {
    if (!editor) return;
    editor.chain().focus().insertContent(`{{${chave}}}`).run();
  }, [editor]);

  const handleSalvar = async () => {
    if (!nome.trim()) {
      toast.error("Informe o nome do modelo");
      return;
    }
    if (!editor) return;

    if (isEdicao && (!modeloId || isNaN(modeloId))) {
      toast.error("ID do modelo inválido. Tente recarregar a página.");
      return;
    }

    setSalvando(true);
    try {
      const conteudoHtml = editor.getHTML();
      if (isEdicao) {
        await updateMutation.mutateAsync({
          id: modeloId,
          nome,
          tipo: tipo as any,
          conteudoHtml,
          logoUrl,
          marcaDaguaUrl,
          logoAlinhamento,
          logoPosicaoVertical,
          logoLargura,
          marcaDaguaOpacidade,
          marcaDaguaPosicao,
        });
        toast.success("Modelo atualizado com sucesso");
      } else {
        const result = await createMutation.mutateAsync({
          nome,
          tipo: tipo as any,
          conteudoHtml,
          logoUrl,
          marcaDaguaUrl,
          logoAlinhamento,
          logoPosicaoVertical,
          logoLargura,
          marcaDaguaOpacidade,
          marcaDaguaPosicao,
        });
        const newId = Number(result.id);
        if (!newId || isNaN(newId)) throw new Error("ID do modelo inválido");
        toast.success("Modelo criado com sucesso");
        navigate(`/modelos-documento/${newId}/editar`);
      }
    } catch (err: any) {
      toast.error("Erro ao salvar modelo: " + err.message);
    } finally {
      setSalvando(false);
    }
  };

  const handleGerarPDF = async () => {
    if (!isEdicao) {
      toast.error("Salve o modelo primeiro para gerar um PDF de exemplo");
      return;
    }
    setGerandoPDF(true);
    try {
      const { url } = await gerarPDFMutation.mutateAsync({
        modeloId: modeloId,
          variaveis: {
            nomeDevedor: "João da Silva",
            cpfCnpjDevedor: "123.456.789-00",
            unidadeDevedor: "101",
            blocoDevedor: "A",
            nomeCondominio: "Condomínio Exemplo",
            valorOriginal: "R$ 1.493,20",
            valorAcordo: "R$ 1.493,20",
            valorEntrada: "R$ 0,00",
            numeroParcelas: "6",
            valorParcela: "R$ 248,87",
            dataVencimentoPrimeiraParcela: "15/06/2026",
            dataAtual: new Date().toLocaleDateString("pt-BR"),
            nomeResponsavel: "Maria Oliveira",
            // Encargos
            honorarios: "R$ 156,00",
            juros: "R$ 30,00",
            multa: "R$ 30,00",
            correcao: "R$ 19,80",
            saldoVencido: "R$ 1.493,20",
            saldoAVencer: "R$ 0,00",
            saldoTotal: "R$ 1.493,20",
            percentualHonorarios: "10%",
            percentualJuros: "1% a.m.",
            percentualMulta: "2%",
          },
        // Parcelas de exemplo para preencher {{tabelaParcelas}}
        parcelas: [
          { descricao: "Cond. Janeiro/2026", vencimento: "15/01/2026", valorOriginal: "R$ 500,00", juros: "R$ 15,00", multa: "R$ 10,00", honorarios: "R$ 52,50", correcao: "R$ 8,60", valorAtualizado: "R$ 586,10" },
          { descricao: "Cond. Fevereiro/2026", vencimento: "15/02/2026", valorOriginal: "R$ 500,00", juros: "R$ 10,00", multa: "R$ 10,00", honorarios: "R$ 52,00", correcao: "R$ 6,90", valorAtualizado: "R$ 578,90" },
          { descricao: "Cond. Março/2026", vencimento: "15/03/2026", valorOriginal: "R$ 500,00", juros: "R$ 5,00", multa: "R$ 10,00", honorarios: "R$ 51,50", correcao: "R$ 4,30", valorAtualizado: "R$ 570,80" },
        ],
      });
      window.open(url, "_blank");
    } catch (err: any) {
      toast.error("Erro ao gerar PDF: " + err.message);
    } finally {
      setGerandoPDF(false);
    }
  };

  return (
    <div className="flex flex-col" style={{ height: "100dvh", overflow: "hidden" }}>
        {/* Cabeçalho */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between px-3 sm:px-6 py-3 border-b bg-background shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <Button variant="ghost" size="sm" onClick={() => navigate("/modelos-documento")} className="gap-1.5 shrink-0 px-2 sm:px-3">
              <ArrowLeft className="h-4 w-4" />
              <span className="hidden sm:inline">Voltar</span>
            </Button>
            <Separator orientation="vertical" className="h-5 shrink-0" />
            <h1 className="text-base sm:text-lg font-semibold truncate">
              {isEdicao ? "Editar Modelo" : "Novo Modelo"}
            </h1>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button variant="outline" size="sm" onClick={handleGerarPDF} disabled={gerandoPDF || !isEdicao} className="gap-1.5 text-xs sm:text-sm">
              <Eye className="h-4 w-4 shrink-0" />
              <span className="hidden xs:inline">{gerandoPDF ? "Gerando..." : "Pré-visualizar"}</span>
              <span className="xs:hidden">{gerandoPDF ? "..." : "PDF"}</span>
            </Button>
            <Button size="sm" onClick={handleSalvar} disabled={salvando} className="gap-1.5 text-xs sm:text-sm">
              <Save className="h-4 w-4 shrink-0" />
              {salvando ? "Salvando..." : "Salvar"}
            </Button>
          </div>
        </div>

        {/* Corpo */}
        <div className="flex flex-1 overflow-hidden flex-col lg:flex-row">
          {/* Editor principal */}
          <div className="flex-1 flex flex-col overflow-hidden min-h-0">
            {/* Metadados do modelo */}
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center px-3 sm:px-6 py-2.5 border-b bg-muted/20 shrink-0">
              <div className="flex-1 min-w-0">
                <Input
                  placeholder="Nome do modelo"
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  className="font-medium text-sm"
                />
              </div>
              <div className="w-full sm:w-52 shrink-0">
                <Select value={tipo} onValueChange={setTipo}>
                  <SelectTrigger className="text-sm">
                    <SelectValue placeholder="Tipo de documento" />
                  </SelectTrigger>
                  <SelectContent>
                    {TIPOS_DOCUMENTO.map((t) => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Barra de ferramentas */}
            <EditorToolbar editor={editor} />

            {/* Área de edição */}
            <div className="flex-1 overflow-y-auto bg-white">
              <div className="max-w-[794px] mx-auto my-4 sm:my-6 shadow-sm border rounded-sm bg-white">
                <EditorContent editor={editor} />
              </div>
            </div>
          </div>

          {/* Painel lateral */}
          <div className="w-full lg:w-72 border-t lg:border-t-0 lg:border-l bg-background flex flex-col overflow-hidden shrink-0 max-h-[40vh] lg:max-h-none">
            <Tabs defaultValue="variaveis" className="flex flex-col h-full">
              <TabsList className="mx-3 mt-3 shrink-0 grid grid-cols-3">
                <TabsTrigger value="variaveis" className="gap-1 text-xs">
                  <Variable className="h-3.5 w-3.5" />
                  Variáveis
                </TabsTrigger>
                <TabsTrigger value="aparencia" className="gap-1 text-xs">
                  <ImageIcon className="h-3.5 w-3.5" />
                  Aparência
                </TabsTrigger>
                <TabsTrigger value="anexos" className="gap-1 text-xs">
                  <Upload className="h-3.5 w-3.5" />
                  Anexos
                </TabsTrigger>
              </TabsList>

              <TabsContent value="variaveis" className="flex-1 overflow-y-auto px-3 pb-3 mt-3">
                <p className="text-xs text-muted-foreground mb-3">
                  Clique em uma variável para inserir no cursor. O sistema substituirá automaticamente pelo valor real ao gerar o PDF.
                </p>
                <PainelVariaveis onInserir={inserirVariavel} />
              </TabsContent>

              <TabsContent value="aparencia" className="flex-1 overflow-y-auto px-3 pb-3 mt-3 space-y-5">
                {/* Logo */}
                <div className="space-y-3">
                  <p className="text-xs font-semibold text-foreground uppercase tracking-wide">Logomarca</p>
                  <ImageUploadField
                    label="Logo do Escritório"
                    value={logoUrl}
                    tipo="logo"
                    onUpload={setLogoUrl}
                    onRemove={() => setLogoUrl(null)}
                  />
                  {logoUrl && (
                    <div className="space-y-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs">Posição vertical</Label>
                        <Select value={logoPosicaoVertical} onValueChange={(v) => setLogoPosicaoVertical(v as any)}>
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="topo">Topo do documento</SelectItem>
                            <SelectItem value="rodape">Rodapé (todas as páginas)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Alinhamento horizontal</Label>
                        <Select value={logoAlinhamento} onValueChange={(v) => setLogoAlinhamento(v as any)}>
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="esquerda">Esquerda</SelectItem>
                            <SelectItem value="centro">Centro</SelectItem>
                            <SelectItem value="direita">Direita</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Largura (px) — atual: {logoLargura}px</Label>
                        <input
                          type="range" min={60} max={300} step={10}
                          value={logoLargura}
                          onChange={(e) => setLogoLargura(Number(e.target.value))}
                          className="w-full accent-primary"
                        />
                        <div className="flex justify-between text-[10px] text-muted-foreground">
                          <span>60px</span><span>300px</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <Separator />

                {/* Marca d'água */}
                <div className="space-y-3">
                  <p className="text-xs font-semibold text-foreground uppercase tracking-wide">Marca d'Água</p>
                  <ImageUploadField
                    label="Imagem da marca d'água"
                    value={marcaDaguaUrl}
                    tipo="marca_dagua"
                    onUpload={setMarcaDaguaUrl}
                    onRemove={() => setMarcaDaguaUrl(null)}
                  />
                  {marcaDaguaUrl && (
                    <div className="space-y-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs">Posição</Label>
                        <Select value={marcaDaguaPosicao} onValueChange={(v) => setMarcaDaguaPosicao(v as any)}>
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="diagonal">Diagonal (centro)</SelectItem>
                            <SelectItem value="centro">Centro (horizontal)</SelectItem>
                            <SelectItem value="topo">Topo</SelectItem>
                            <SelectItem value="rodape">Rodapé</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Opacidade — atual: {marcaDaguaOpacidade}%</Label>
                        <input
                          type="range" min={3} max={40} step={1}
                          value={marcaDaguaOpacidade}
                          onChange={(e) => setMarcaDaguaOpacidade(Number(e.target.value))}
                          className="w-full accent-primary"
                        />
                        <div className="flex justify-between text-[10px] text-muted-foreground">
                          <span>3% (sutil)</span><span>40% (forte)</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <Separator />

                <Card className="bg-muted/30">
                  <CardHeader className="pb-2 pt-3 px-3">
                    <CardTitle className="text-xs font-medium">Dica de Assinatura</CardTitle>
                  </CardHeader>
                  <CardContent className="px-3 pb-3">
                    <p className="text-xs text-muted-foreground">
                      Para adicionar campos de assinatura, escreva no editor:
                    </p>
                    <pre className="text-xs bg-background rounded p-2 mt-2 border">
{`_________________________
Nome do Devedor
CPF: {{cpfCnpjDevedor}}

_________________________
Responsável
{{nomeResponsavel}}`}
                    </pre>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Aba Anexos */}
              <TabsContent value="anexos" className="flex-1 overflow-y-auto px-3 pb-3 mt-3">
                <AnexosPanel modeloId={modeloId} isEdicao={isEdicao} />
              </TabsContent>
            </Tabs>
          </div>
        </div>
    </div>
  );
}
