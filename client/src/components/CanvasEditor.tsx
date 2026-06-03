import { useState, useRef, useCallback, useEffect, KeyboardEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Type, Square, Minus, Circle, Trash2, Copy, Download,
  AlignLeft, AlignCenter, AlignRight, Bold, Italic, Underline,
  ChevronUp, ChevronDown, Variable,
} from "lucide-react";
import { toast } from "sonner";

// ─── Tipos ────────────────────────────────────────────────────────────────────
export type ElementType = "text" | "rect" | "line" | "circle";

export interface CanvasElement {
  id: string;
  type: ElementType;
  x: number;
  y: number;
  width: number;
  height: number;
  // Texto
  text?: string;
  fontSize?: number;
  fontWeight?: "normal" | "bold";
  fontStyle?: "normal" | "italic";
  textDecoration?: "none" | "underline";
  textAlign?: "left" | "center" | "right";
  color?: string;
  // Formas
  backgroundColor?: string;
  borderColor?: string;
  borderWidth?: number;
  borderRadius?: number;
  opacity?: number;
  // Ordem Z
  zIndex?: number;
}

interface CanvasEditorProps {
  elements: CanvasElement[];
  onChange: (elements: CanvasElement[]) => void;
  variaveisDisponiveis?: { chave: string; descricao: string }[];
}

const PAGE_W = 794; // A4 em 96dpi
const PAGE_H = 1123;

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function defaultElement(type: ElementType, x: number, y: number): CanvasElement {
  const base = { id: uid(), type, x, y, zIndex: 0 };
  switch (type) {
    case "text":
      return { ...base, width: 200, height: 40, text: "Texto", fontSize: 14, fontWeight: "normal", fontStyle: "normal", textDecoration: "none", textAlign: "left", color: "#1e293b", backgroundColor: "transparent", borderColor: "transparent", borderWidth: 0, opacity: 1 };
    case "rect":
      return { ...base, width: 200, height: 80, backgroundColor: "#e2e8f0", borderColor: "#94a3b8", borderWidth: 1, borderRadius: 0, opacity: 1, color: "transparent" };
    case "line":
      return { ...base, width: 200, height: 2, backgroundColor: "#1e293b", borderColor: "#1e293b", borderWidth: 2, opacity: 1, color: "transparent" };
    case "circle":
      return { ...base, width: 80, height: 80, backgroundColor: "#bfdbfe", borderColor: "#3b82f6", borderWidth: 2, borderRadius: 50, opacity: 1, color: "transparent" };
  }
}

// ─── Componente principal ─────────────────────────────────────────────────────
export default function CanvasEditor({ elements, onChange, variaveisDisponiveis = [] }: CanvasEditorProps) {
  const [selected, setSelected] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showVarMenu, setShowVarMenu] = useState(false);
  const canvasRef = useRef<HTMLDivElement>(null);
  const dragState = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);
  const resizeState = useRef<{ handle: string; startX: number; startY: number; origEl: CanvasElement } | null>(null);

  const selectedEl = elements.find(e => e.id === selected) ?? null;

  // ── Atualizar um elemento ──
  const updateEl = useCallback((id: string, patch: Partial<CanvasElement>) => {
    onChange(elements.map(e => e.id === id ? { ...e, ...patch } : e));
  }, [elements, onChange]);

  // ── Deletar ──
  const deleteEl = useCallback((id: string) => {
    onChange(elements.filter(e => e.id !== id));
    setSelected(null);
    setEditingId(null);
  }, [elements, onChange]);

  // ── Duplicar ──
  const duplicateEl = useCallback((id: string) => {
    const el = elements.find(e => e.id === id);
    if (!el) return;
    const copy = { ...el, id: uid(), x: el.x + 20, y: el.y + 20 };
    onChange([...elements, copy]);
    setSelected(copy.id);
  }, [elements, onChange]);

  // ── Adicionar elemento ──
  const addElement = useCallback((type: ElementType) => {
    const el = defaultElement(type, 80, 80 + elements.length * 20);
    onChange([...elements, el]);
    setSelected(el.id);
  }, [elements, onChange]);

  // ── Drag: inicio ──
  const onMouseDownEl = useCallback((e: React.MouseEvent, id: string) => {
    if (editingId === id) return;
    e.stopPropagation();
    setSelected(id);
    const el = elements.find(el => el.id === id)!;
    dragState.current = { startX: e.clientX, startY: e.clientY, origX: el.x, origY: el.y };

    const onMove = (ev: MouseEvent) => {
      if (!dragState.current) return;
      const dx = ev.clientX - dragState.current.startX;
      const dy = ev.clientY - dragState.current.startY;
      updateEl(id, {
        x: Math.max(0, Math.min(PAGE_W - 10, dragState.current.origX + dx)),
        y: Math.max(0, Math.min(PAGE_H - 10, dragState.current.origY + dy)),
      });
    };
    const onUp = () => {
      dragState.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [elements, editingId, updateEl]);

  // ── Resize: inicio ──
  const onMouseDownResize = useCallback((e: React.MouseEvent, id: string, handle: string) => {
    e.stopPropagation();
    e.preventDefault();
    const el = elements.find(el => el.id === id)!;
    resizeState.current = { handle, startX: e.clientX, startY: e.clientY, origEl: { ...el } };

    const onMove = (ev: MouseEvent) => {
      if (!resizeState.current) return;
      const { handle, startX, startY, origEl } = resizeState.current;
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      let { x, y, width, height } = origEl;
      if (handle.includes("e")) width = Math.max(20, origEl.width + dx);
      if (handle.includes("s")) height = Math.max(8, origEl.height + dy);
      if (handle.includes("w")) { x = origEl.x + dx; width = Math.max(20, origEl.width - dx); }
      if (handle.includes("n")) { y = origEl.y + dy; height = Math.max(8, origEl.height - dy); }
      updateEl(id, { x, y, width, height });
    };
    const onUp = () => {
      resizeState.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [elements, updateEl]);

  // ── Tecla Delete ──
  useEffect(() => {
    const handler = (e: globalThis.KeyboardEvent) => {
      if ((e.key === "Delete" || e.key === "Backspace") && selected && editingId !== selected) {
        deleteEl(selected);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selected, editingId, deleteEl]);

  // ── Clique no canvas vazio ──
  const onCanvasClick = (e: React.MouseEvent) => {
    if (e.target === canvasRef.current) {
      setSelected(null);
      setEditingId(null);
    }
  };

  // ── Exportar PDF ──
  const exportPDF = async () => {
    const { default: html2canvas } = await import("html2canvas");
    const { jsPDF } = await import("jspdf");
    const canvas = canvasRef.current;
    if (!canvas) return;
    toast.info("Gerando PDF...");
    setSelected(null);
    setEditingId(null);
    setTimeout(async () => {
      const c = await html2canvas(canvas, { scale: 2, useCORS: true, backgroundColor: "#ffffff" });
      const imgData = c.toDataURL("image/png");
      const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
      const pdfW = pdf.internal.pageSize.getWidth();
      const pdfH = pdf.internal.pageSize.getHeight();
      pdf.addImage(imgData, "PNG", 0, 0, pdfW, pdfH);
      pdf.save("modelo.pdf");
      toast.success("PDF gerado com sucesso!");
    }, 100);
  };

  // ── Ordem Z ──
  const bringForward = (id: string) => {
    const el = elements.find(e => e.id === id);
    if (el) updateEl(id, { zIndex: (el.zIndex ?? 0) + 1 });
  };
  const sendBackward = (id: string) => {
    const el = elements.find(e => e.id === id);
    if (el) updateEl(id, { zIndex: Math.max(0, (el.zIndex ?? 0) - 1) });
  };

  // ── Inserir variável no texto ──
  const insertVar = (chave: string) => {
    if (!selected) return;
    const el = elements.find(e => e.id === selected);
    if (!el || el.type !== "text") return;
    updateEl(selected, { text: (el.text ?? "") + `{{${chave}}}` });
    setShowVarMenu(false);
  };

  return (
    <div className="flex gap-4 h-full">
      {/* ── Toolbar esquerda ── */}
      <div className="flex flex-col gap-2 w-12 shrink-0 pt-2">
        <button
          onClick={() => addElement("text")}
          title="Adicionar Texto"
          className="flex flex-col items-center gap-0.5 p-2 rounded hover:bg-muted border border-transparent hover:border-border transition-colors"
        >
          <Type className="h-4 w-4" />
          <span className="text-[9px] text-muted-foreground">Texto</span>
        </button>
        <button
          onClick={() => addElement("rect")}
          title="Adicionar Retângulo"
          className="flex flex-col items-center gap-0.5 p-2 rounded hover:bg-muted border border-transparent hover:border-border transition-colors"
        >
          <Square className="h-4 w-4" />
          <span className="text-[9px] text-muted-foreground">Retâng.</span>
        </button>
        <button
          onClick={() => addElement("line")}
          title="Adicionar Linha"
          className="flex flex-col items-center gap-0.5 p-2 rounded hover:bg-muted border border-transparent hover:border-border transition-colors"
        >
          <Minus className="h-4 w-4" />
          <span className="text-[9px] text-muted-foreground">Linha</span>
        </button>
        <button
          onClick={() => addElement("circle")}
          title="Adicionar Círculo"
          className="flex flex-col items-center gap-0.5 p-2 rounded hover:bg-muted border border-transparent hover:border-border transition-colors"
        >
          <Circle className="h-4 w-4" />
          <span className="text-[9px] text-muted-foreground">Círculo</span>
        </button>
        <Separator />
        <button
          onClick={exportPDF}
          title="Exportar PDF"
          className="flex flex-col items-center gap-0.5 p-2 rounded hover:bg-muted border border-transparent hover:border-border transition-colors"
        >
          <Download className="h-4 w-4" />
          <span className="text-[9px] text-muted-foreground">PDF</span>
        </button>
      </div>

      {/* ── Área de canvas ── */}
      <div className="flex-1 overflow-auto bg-gray-100 rounded-lg p-4 min-h-0">
        <div
          ref={canvasRef}
          onClick={onCanvasClick}
          className="relative bg-white shadow-lg mx-auto"
          style={{ width: PAGE_W, height: PAGE_H, userSelect: "none" }}
        >
          {[...elements].sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0)).map(el => (
            <CanvasElementView
              key={el.id}
              el={el}
              isSelected={selected === el.id}
              isEditing={editingId === el.id}
              onMouseDown={(e) => onMouseDownEl(e, el.id)}
              onDoubleClick={() => { if (el.type === "text") { setEditingId(el.id); setSelected(el.id); } }}
              onResizeHandle={(e, h) => onMouseDownResize(e, el.id, h)}
              onTextChange={(t) => updateEl(el.id, { text: t })}
              onBlur={() => setEditingId(null)}
            />
          ))}
        </div>
      </div>

      {/* ── Painel de propriedades ── */}
      <div className="w-56 shrink-0 overflow-y-auto border-l pl-3 pt-2 space-y-3 text-sm">
        {selectedEl ? (
          <>
            <div className="font-semibold text-xs uppercase text-muted-foreground tracking-wide">
              {selectedEl.type === "text" ? "Texto" : selectedEl.type === "rect" ? "Retângulo" : selectedEl.type === "line" ? "Linha" : "Círculo"}
            </div>

            {/* Posição e tamanho */}
            <div className="grid grid-cols-2 gap-1.5">
              <div>
                <Label className="text-[10px]">X</Label>
                <Input type="number" value={Math.round(selectedEl.x)} className="h-7 text-xs" onChange={e => updateEl(selectedEl.id, { x: Number(e.target.value) })} />
              </div>
              <div>
                <Label className="text-[10px]">Y</Label>
                <Input type="number" value={Math.round(selectedEl.y)} className="h-7 text-xs" onChange={e => updateEl(selectedEl.id, { y: Number(e.target.value) })} />
              </div>
              <div>
                <Label className="text-[10px]">Largura</Label>
                <Input type="number" value={Math.round(selectedEl.width)} className="h-7 text-xs" onChange={e => updateEl(selectedEl.id, { width: Number(e.target.value) })} />
              </div>
              <div>
                <Label className="text-[10px]">Altura</Label>
                <Input type="number" value={Math.round(selectedEl.height)} className="h-7 text-xs" onChange={e => updateEl(selectedEl.id, { height: Number(e.target.value) })} />
              </div>
            </div>

            <Separator />

            {/* Texto */}
            {selectedEl.type === "text" && (
              <>
                <div>
                  <Label className="text-[10px]">Texto</Label>
                  <textarea
                    className="w-full border rounded p-1 text-xs resize-none h-16 mt-0.5"
                    value={selectedEl.text ?? ""}
                    onChange={e => updateEl(selectedEl.id, { text: e.target.value })}
                  />
                </div>
                <div>
                  <Label className="text-[10px]">Tamanho da fonte</Label>
                  <Input type="number" value={selectedEl.fontSize ?? 14} className="h-7 text-xs" onChange={e => updateEl(selectedEl.id, { fontSize: Number(e.target.value) })} />
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={() => updateEl(selectedEl.id, { fontWeight: selectedEl.fontWeight === "bold" ? "normal" : "bold" })}
                    className={`p-1.5 rounded border text-xs ${selectedEl.fontWeight === "bold" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
                    title="Negrito"
                  ><Bold className="h-3 w-3" /></button>
                  <button
                    onClick={() => updateEl(selectedEl.id, { fontStyle: selectedEl.fontStyle === "italic" ? "normal" : "italic" })}
                    className={`p-1.5 rounded border text-xs ${selectedEl.fontStyle === "italic" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
                    title="Itálico"
                  ><Italic className="h-3 w-3" /></button>
                  <button
                    onClick={() => updateEl(selectedEl.id, { textDecoration: selectedEl.textDecoration === "underline" ? "none" : "underline" })}
                    className={`p-1.5 rounded border text-xs ${selectedEl.textDecoration === "underline" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
                    title="Sublinhado"
                  ><Underline className="h-3 w-3" /></button>
                </div>
                <div className="flex gap-1">
                  {(["left", "center", "right"] as const).map(a => (
                    <button
                      key={a}
                      onClick={() => updateEl(selectedEl.id, { textAlign: a })}
                      className={`p-1.5 rounded border text-xs ${selectedEl.textAlign === a ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
                    >
                      {a === "left" ? <AlignLeft className="h-3 w-3" /> : a === "center" ? <AlignCenter className="h-3 w-3" /> : <AlignRight className="h-3 w-3" />}
                    </button>
                  ))}
                </div>
                <div>
                  <Label className="text-[10px]">Cor do texto</Label>
                  <div className="flex gap-1 items-center mt-0.5">
                    <input type="color" value={selectedEl.color ?? "#1e293b"} className="h-7 w-10 rounded cursor-pointer border" onChange={e => updateEl(selectedEl.id, { color: e.target.value })} />
                    <span className="text-xs text-muted-foreground">{selectedEl.color}</span>
                  </div>
                </div>
                {/* Variáveis */}
                {variaveisDisponiveis.length > 0 && (
                  <div className="relative">
                    <Button variant="outline" size="sm" className="w-full h-7 text-xs gap-1" onClick={() => setShowVarMenu(v => !v)}>
                      <Variable className="h-3 w-3" /> Inserir variável
                    </Button>
                    {showVarMenu && (
                      <div className="absolute right-0 top-8 z-50 bg-popover border rounded shadow-lg w-52 max-h-48 overflow-y-auto">
                        {variaveisDisponiveis.map(v => (
                          <button
                            key={v.chave}
                            onClick={() => insertVar(v.chave)}
                            className="w-full text-left px-3 py-1.5 text-xs hover:bg-muted"
                          >
                            <span className="font-mono text-primary">{`{{${v.chave}}}`}</span>
                            <span className="text-muted-foreground ml-1">— {v.descricao}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}

            {/* Fundo e borda */}
            {selectedEl.type !== "line" && (
              <div>
                <Label className="text-[10px]">Cor de fundo</Label>
                <div className="flex gap-1 items-center mt-0.5">
                  <input type="color" value={selectedEl.backgroundColor === "transparent" ? "#ffffff" : (selectedEl.backgroundColor ?? "#ffffff")} className="h-7 w-10 rounded cursor-pointer border" onChange={e => updateEl(selectedEl.id, { backgroundColor: e.target.value })} />
                  <button className="text-xs text-muted-foreground underline" onClick={() => updateEl(selectedEl.id, { backgroundColor: "transparent" })}>Transparente</button>
                </div>
              </div>
            )}

            <div>
              <Label className="text-[10px]">Cor da borda</Label>
              <div className="flex gap-1 items-center mt-0.5">
                <input type="color" value={selectedEl.borderColor === "transparent" ? "#000000" : (selectedEl.borderColor ?? "#000000")} className="h-7 w-10 rounded cursor-pointer border" onChange={e => updateEl(selectedEl.id, { borderColor: e.target.value })} />
                <Input type="number" value={selectedEl.borderWidth ?? 1} className="h-7 text-xs w-14" onChange={e => updateEl(selectedEl.id, { borderWidth: Number(e.target.value) })} />
                <span className="text-[10px] text-muted-foreground">px</span>
              </div>
            </div>

            {(selectedEl.type === "rect") && (
              <div>
                <Label className="text-[10px]">Arredondamento</Label>
                <Input type="number" value={selectedEl.borderRadius ?? 0} className="h-7 text-xs" onChange={e => updateEl(selectedEl.id, { borderRadius: Number(e.target.value) })} />
              </div>
            )}

            <div>
              <Label className="text-[10px]">Opacidade (%)</Label>
              <Input type="number" min={0} max={100} value={Math.round((selectedEl.opacity ?? 1) * 100)} className="h-7 text-xs" onChange={e => updateEl(selectedEl.id, { opacity: Number(e.target.value) / 100 })} />
            </div>

            <Separator />

            {/* Ordem Z */}
            <div>
              <Label className="text-[10px]">Camada</Label>
              <div className="flex gap-1 mt-0.5">
                <Button variant="outline" size="sm" className="h-7 flex-1 text-xs gap-1" onClick={() => bringForward(selectedEl.id)}>
                  <ChevronUp className="h-3 w-3" /> Avançar
                </Button>
                <Button variant="outline" size="sm" className="h-7 flex-1 text-xs gap-1" onClick={() => sendBackward(selectedEl.id)}>
                  <ChevronDown className="h-3 w-3" /> Recuar
                </Button>
              </div>
            </div>

            <Separator />

            {/* Ações */}
            <div className="flex gap-1">
              <Button variant="outline" size="sm" className="h-7 flex-1 text-xs gap-1" onClick={() => duplicateEl(selectedEl.id)}>
                <Copy className="h-3 w-3" /> Duplicar
              </Button>
              <Button variant="destructive" size="sm" className="h-7 flex-1 text-xs gap-1" onClick={() => deleteEl(selectedEl.id)}>
                <Trash2 className="h-3 w-3" /> Deletar
              </Button>
            </div>
          </>
        ) : (
          <div className="text-xs text-muted-foreground pt-4 text-center">
            Clique em um elemento para editar suas propriedades
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Elemento individual no canvas ───────────────────────────────────────────
function CanvasElementView({
  el, isSelected, isEditing,
  onMouseDown, onDoubleClick, onResizeHandle, onTextChange, onBlur,
}: {
  el: CanvasElement;
  isSelected: boolean;
  isEditing: boolean;
  onMouseDown: (e: React.MouseEvent) => void;
  onDoubleClick: () => void;
  onResizeHandle: (e: React.MouseEvent, handle: string) => void;
  onTextChange: (t: string) => void;
  onBlur: () => void;
}) {
  const handles = ["n", "s", "e", "w", "ne", "nw", "se", "sw"];

  const handlePos: Record<string, React.CSSProperties> = {
    n:  { top: -4, left: "50%", transform: "translateX(-50%)", cursor: "n-resize" },
    s:  { bottom: -4, left: "50%", transform: "translateX(-50%)", cursor: "s-resize" },
    e:  { right: -4, top: "50%", transform: "translateY(-50%)", cursor: "e-resize" },
    w:  { left: -4, top: "50%", transform: "translateY(-50%)", cursor: "w-resize" },
    ne: { top: -4, right: -4, cursor: "ne-resize" },
    nw: { top: -4, left: -4, cursor: "nw-resize" },
    se: { bottom: -4, right: -4, cursor: "se-resize" },
    sw: { bottom: -4, left: -4, cursor: "sw-resize" },
  };

  const baseStyle: React.CSSProperties = {
    position: "absolute",
    left: el.x,
    top: el.y,
    width: el.width,
    height: el.height,
    zIndex: el.zIndex ?? 0,
    opacity: el.opacity ?? 1,
    cursor: isEditing ? "text" : "move",
    outline: isSelected ? "2px solid #3b82f6" : "none",
    outlineOffset: 1,
    boxSizing: "border-box",
  };

  const shapeStyle: React.CSSProperties = {
    width: "100%",
    height: "100%",
    backgroundColor: el.backgroundColor ?? "transparent",
    border: `${el.borderWidth ?? 0}px solid ${el.borderColor ?? "transparent"}`,
    borderRadius: el.borderRadius ?? 0,
    boxSizing: "border-box",
  };

  return (
    <div
      style={baseStyle}
      onMouseDown={onMouseDown}
      onDoubleClick={onDoubleClick}
    >
      {el.type === "text" ? (
        isEditing ? (
          <textarea
            autoFocus
            value={el.text ?? ""}
            onChange={e => onTextChange(e.target.value)}
            onBlur={onBlur}
            style={{
              width: "100%",
              height: "100%",
              fontSize: el.fontSize ?? 14,
              fontWeight: el.fontWeight ?? "normal",
              fontStyle: el.fontStyle ?? "normal",
              textDecoration: el.textDecoration ?? "none",
              textAlign: el.textAlign ?? "left",
              color: el.color ?? "#1e293b",
              background: "transparent",
              border: "none",
              outline: "none",
              resize: "none",
              padding: 2,
              lineHeight: 1.4,
              fontFamily: "inherit",
            }}
          />
        ) : (
          <div
            style={{
              width: "100%",
              height: "100%",
              fontSize: el.fontSize ?? 14,
              fontWeight: el.fontWeight ?? "normal",
              fontStyle: el.fontStyle ?? "normal",
              textDecoration: el.textDecoration ?? "none",
              textAlign: el.textAlign ?? "left",
              color: el.color ?? "#1e293b",
              padding: 2,
              lineHeight: 1.4,
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              overflow: "hidden",
            }}
          >
            {el.text}
          </div>
        )
      ) : el.type === "line" ? (
        <div style={{ width: "100%", height: el.borderWidth ?? 2, backgroundColor: el.borderColor ?? "#1e293b", marginTop: Math.max(0, el.height / 2 - (el.borderWidth ?? 2) / 2) }} />
      ) : (
        <div style={shapeStyle} />
      )}

      {/* Handles de resize */}
      {isSelected && !isEditing && handles.map(h => (
        <div
          key={h}
          style={{
            position: "absolute",
            width: 8,
            height: 8,
            background: "#3b82f6",
            border: "1px solid white",
            borderRadius: 2,
            ...handlePos[h],
          }}
          onMouseDown={e => onResizeHandle(e, h)}
        />
      ))}
    </div>
  );
}
