import { useRef, useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Upload, Trash2, Loader2, Image as ImageIcon, Sparkles, ShieldCheck } from "lucide-react";
import { FLYSTATUS_META, type FlyStatusKind, pickArt } from "./FlyStatusModal";

type Pz = {
  id: string;
  slug?: string;
  status_art_preparando_url?: string | null;
  status_art_saiu_url?: string | null;
  status_art_entregue_url?: string | null;
  status_text_preparando?: string | null;
  status_text_saiu?: string | null;
  status_text_entregue?: string | null;
};

const FIELDS: Record<FlyStatusKind, { urlCol: keyof Pz; textCol: keyof Pz }> = {
  preparando: { urlCol: "status_art_preparando_url", textCol: "status_text_preparando" },
  saiu: { urlCol: "status_art_saiu_url", textCol: "status_text_saiu" },
  entregue: { urlCol: "status_art_entregue_url", textCol: "status_text_entregue" },
};

export function FlyStatusSettings({ pizzeria, onUpdated }: { pizzeria: Pz; onUpdated: (patch: Partial<Pz>) => void }) {
  const isGlobalAdmin = pizzeria.slug === 'conectfly-pizza';

  return (
    <div className="mt-6 border-t border-border pt-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">
            {isGlobalAdmin ? "Artes Padrão Globais (ConnectFly)" : "Artes de Status (FlyStatus)"}
          </h3>
          {isGlobalAdmin && (
            <div className="flex items-center gap-1 bg-primary/10 px-2 py-0.5 rounded text-[10px] font-bold text-primary uppercase tracking-tighter">
              <ShieldCheck className="h-3 w-3" /> Admin Mode
            </div>
          )}
        </div>
      </div>
      <p className="mb-4 text-[11px] text-muted-foreground">
        {isGlobalAdmin 
          ? "Você está editando as artes que serão herdadas por TODAS as outras pizzarias como padrão."
          : "Personalize a arte e a mensagem enviada ao cliente. Se deixar vazio, usará o padrão ConnectFly."}
        {" "}Use <code className="rounded bg-muted px-1">{"{NUMERO}"}</code> para o número do pedido.
      </p>
      <div className="grid gap-4 md:grid-cols-3">
        {(Object.keys(FLYSTATUS_META) as FlyStatusKind[]).map((k) => (
          <StatusArtCard key={k} kind={k} pizzeria={pizzeria} onUpdated={onUpdated} />
        ))}
      </div>
    </div>
  );
}

function StatusArtCard({ kind, pizzeria, onUpdated }: { kind: FlyStatusKind; pizzeria: Pz; onUpdated: (patch: Partial<Pz>) => void }) {
  const meta = FLYSTATUS_META[kind];
  const { urlCol, textCol } = FIELDS[kind];
  
  // Logical fallback
  const { url: effectiveUrl, text: effectiveText } = pickArt(pizzeria, kind);
  const isUsingGlobal = !pizzeria[urlCol] && !pizzeria[textCol];
  const isGlobalAdmin = pizzeria.slug === 'conectfly-pizza';

  const url = (pizzeria[urlCol] as string | null) || "";
  const text = (pizzeria[textCol] as string | null) || "";
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    if (!file.type.startsWith("image/")) { toast.error("Selecione um arquivo de imagem"); return; }
    if (file.size > 5 * 1024 * 1024) { toast.error("Imagem deve ter no máximo 5MB"); return; }
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() || "png";
      const path = `${pizzeria.id}/${kind}-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("status-arts").upload(path, file, { upsert: true, contentType: file.type });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from("status-arts").getPublicUrl(path);
      const publicUrl = pub.publicUrl;
      const { error: dbErr } = await supabase.from("pizzerias").update({ [urlCol]: publicUrl } as any).eq("id", pizzeria.id);
      if (dbErr) throw dbErr;
      onUpdated({ [urlCol]: publicUrl } as Partial<Pz>);
      toast.success("Arte atualizada");
    } catch (e: any) {
      toast.error("Falha ao enviar: " + (e?.message ?? e));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function removeArt() {
    const { error } = await supabase.from("pizzerias").update({ [urlCol]: null } as any).eq("id", pizzeria.id);
    if (error) { toast.error(error.message); return; }
    onUpdated({ [urlCol]: null } as Partial<Pz>);
    toast.success("Arte removida");
  }

  async function saveText(value: string) {
    const { error } = await supabase.from("pizzerias").update({ [textCol]: value } as any).eq("id", pizzeria.id);
    if (error) { toast.error(error.message); return; }
    onUpdated({ [textCol]: value } as Partial<Pz>);
  }

  return (
    <div className={`rounded-lg border p-3 flex flex-col gap-3 transition-all duration-300 ${
      isUsingGlobal && !isGlobalAdmin ? 'border-primary/20 bg-primary/5' : 'border-border bg-background'
    }`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-lg">{meta.emoji}</span>
          <Label className="text-xs font-bold uppercase tracking-wider">{meta.title}</Label>
        </div>
        {isUsingGlobal && !isGlobalAdmin && (
          <span className="text-[9px] font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded uppercase tracking-tighter">
            Padrão Global
          </span>
        )}
      </div>

      <div className="relative aspect-square overflow-hidden rounded-md border border-border bg-muted/30">
        {effectiveUrl ? (
          <img src={effectiveUrl} alt={meta.title} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted-foreground">
            <ImageIcon className="h-8 w-8 opacity-40" />
          </div>
        )}
      </div>

      <div className="flex gap-2">
        <Button type="button" size="sm" variant="outline" className="flex-1" disabled={uploading} onClick={() => fileRef.current?.click()}>
          {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
          {url ? "Trocar" : "Enviar"}
        </Button>
        {url && (
          <Button type="button" size="sm" variant="outline" className="text-destructive border-destructive/30 hover:bg-destructive/10" onClick={removeArt}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
        />
      </div>

      <textarea
        className={`min-h-[110px] w-full rounded-md border border-input px-2 py-1.5 text-xs leading-relaxed transition-all ${
          isUsingGlobal && !isGlobalAdmin ? 'bg-primary/5' : 'bg-background'
        }`}
        defaultValue={text || (isGlobalAdmin ? "" : effectiveText)}
        placeholder={isGlobalAdmin ? `Defina a mensagem padrão global para "${meta.title}"` : `Personalize a mensagem para "${meta.title}"`}
        onBlur={(e) => { if (e.target.value !== text) saveText(e.target.value); }}
      />
    </div>
  );
}
