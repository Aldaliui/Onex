import { Archive, ChevronLeft, ChevronRight, CircleHelp, FilePlus2, Pencil, Printer, RotateCcw, Save, Search, Send, Undo2, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { WindowAction, WindowPhase } from "./WindowManager";

const actions: Array<{ id: WindowAction; label: string; shortcut: string; icon: typeof Save }> = [
  { id: "new", label: "جديد", shortcut: "F6", icon: FilePlus2 },
  { id: "edit", label: "تعديل", shortcut: "F2", icon: Pencil },
  { id: "save", label: "حفظ", shortcut: "F10", icon: Save },
  { id: "post", label: "ترحيل", shortcut: "F11", icon: Send },
  { id: "reverse", label: "عكس", shortcut: "F12", icon: Undo2 },
  { id: "undo", label: "تراجع", shortcut: "Ctrl+Z", icon: RotateCcw },
  { id: "delete", label: "حذف", shortcut: "Del", icon: Trash2 },
  { id: "query", label: "استعلام", shortcut: "F7", icon: Search },
  { id: "print", label: "طباعة", shortcut: "Ctrl+P", icon: Printer },
  { id: "cancel", label: "إلغاء", shortcut: "Esc", icon: RotateCcw },
  { id: "help", label: "مساعدة", shortcut: "F1", icon: CircleHelp },
];

export function WindowToolbar({ phase, onAction, onClose, disabled = false }: { phase: WindowPhase; onAction: (action: WindowAction) => void; onClose: () => void; disabled?: boolean }) {
  const busy = disabled || phase === "opening" || phase === "initializing" || phase === "committing" || phase === "closing";
  return <div className="legacy-form-toolbar" role="toolbar" aria-label="أدوات النافذة">
    {actions.map(({ id, label, shortcut, icon: Icon }) => <Button key={id} type="button" variant="ghost" size="icon" title={`${label} (${shortcut})`} aria-label={label} disabled={busy || (id === "save" && phase === "ready") || (id === "edit" && phase === "dirty")} onClick={() => onAction(id)}><Icon size={15} /></Button>)}
    <span className="toolbar-separator" />
    <Button type="button" variant="ghost" size="icon" title="إغلاق (Esc)" aria-label="إغلاق" disabled={busy} onClick={onClose}><X size={15} /></Button>
    <span className="toolbar-phase" data-phase={phase}>{phase === "ready" ? "جاهز" : phase === "dirty" ? "تعديلات غير محفوظة" : phase === "committing" ? "جارٍ الحفظ..." : phase === "committed" ? "تم الحفظ" : phase === "initializing" ? "جارٍ التهيئة..." : phase === "error" ? "خطأ" : phase}</span>
  </div>;
}

export function WindowSideActions({ onAction, disabled = false }: { onAction: (action: WindowAction) => void; disabled?: boolean }) {
  return <aside className="legacy-side-actions" aria-label="تنقل السجلات"><Button type="button" variant="ghost" size="icon" title="السابق" aria-label="السابق" disabled={disabled} onClick={() => onAction("previous")}><ChevronRight size={16} /></Button><Button type="button" variant="ghost" size="icon" title="التالي" aria-label="التالي" disabled={disabled} onClick={() => onAction("next")}><ChevronLeft size={16} /></Button><span className="side-action-separator" /><Button type="button" variant="ghost" size="icon" title="بحث" aria-label="بحث" disabled={disabled} onClick={() => onAction("query")}><Search size={15} /></Button><Button type="button" variant="ghost" size="icon" title="تعديل" aria-label="تعديل" disabled={disabled} onClick={() => onAction("edit")}><Pencil size={15} /></Button><Button type="button" variant="ghost" size="icon" title="حذف" aria-label="حذف" disabled={disabled} onClick={() => onAction("delete")}><Trash2 size={15} /></Button></aside>;
}

export function WindowTitleBar({ label, id, kind, onMinimize, onClose }: { label: string; id: string; kind: string; onMinimize: () => void; onClose: () => void }) {
  return <div className="legacy-titlebar"><div><span className="legacy-app-icon"><Archive size={14} /></span><b>{label}</b><small>{id} · {kind}</small></div><div className="legacy-controls"><button type="button" title="تصغير" onClick={onMinimize}>—</button><button type="button" title="إغلاق" onClick={onClose}><X size={14} /></button></div></div>;
}
