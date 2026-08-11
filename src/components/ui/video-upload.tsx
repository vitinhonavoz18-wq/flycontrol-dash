import { useCallback, useRef, useState } from "react";
import { Upload, X, Loader2, Video as VideoIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const BUCKET = "menu-images";
// Mesmo limite que o SiteCreatorFly já usa para o vídeo de capa — um vídeo
// maior deixaria o cardápio lento para abrir no celular do cliente.
const MAX_BYTES = 25 * 1024 * 1024; // 25 MB
const SIGNED_URL_TTL = 60 * 60 * 24 * 365 * 50; // ~50 anos
const ACCEPTED = ["video/mp4", "video/webm", "video/quicktime"];

interface VideoUploadProps {
  value?: string | null;
  onChange: (url: string | null) => void;
  folder?: string;
  disabled?: boolean;
  className?: string;
}

export function VideoUpload({
  value,
  onChange,
  folder = "misc",
  disabled,
  className,
}: VideoUploadProps) {
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(
    async (file: File) => {
      if (!ACCEPTED.includes(file.type)) {
        toast.error("Formato inválido. Use MP4, WEBM ou MOV.");
        return;
      }
      if (file.size > MAX_BYTES) {
        toast.error("Vídeo maior que 25MB. Comprima antes de enviar.");
        return;
      }
      setUploading(true);
      try {
        const ext = file.name.split(".").pop() || "mp4";
        const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from(BUCKET)
          .upload(path, file, { contentType: file.type, upsert: false });
        if (upErr) throw upErr;
        const { data: signed, error: signErr } = await supabase.storage
          .from(BUCKET)
          .createSignedUrl(path, SIGNED_URL_TTL);
        if (signErr || !signed?.signedUrl) throw signErr ?? new Error("no signed url");
        onChange(signed.signedUrl);
        toast.success("Vídeo enviado.");
      } catch (e: any) {
        console.error("[VideoUpload]", e);
        toast.error("Falha ao enviar vídeo: " + (e?.message || "erro desconhecido"));
      } finally {
        setUploading(false);
      }
    },
    [folder, onChange],
  );

  return (
    <div className={cn("space-y-2", className)}>
      <div
        onClick={() => !disabled && !uploading && inputRef.current?.click()}
        className={cn(
          "relative flex min-h-32 cursor-pointer flex-col items-center justify-center rounded-md border-2 border-dashed p-4 transition-colors",
          "border-muted-foreground/30 hover:border-primary/50",
          disabled && "opacity-50 cursor-not-allowed",
        )}
      >
        {value ? (
          <div className="relative w-full">
            <video
              src={value}
              muted
              autoPlay
              loop
              playsInline
              className="mx-auto max-h-40 rounded object-contain"
            />
            <Button
              type="button"
              size="icon"
              variant="destructive"
              className="absolute -right-2 -top-2 h-7 w-7"
              onClick={(e) => {
                e.stopPropagation();
                onChange(null);
              }}
              disabled={disabled || uploading}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        ) : uploading ? (
          <div className="flex flex-col items-center gap-2 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin" />
            <span className="text-sm">Enviando...</span>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 text-muted-foreground">
            <VideoIcon className="h-8 w-8" />
            <span className="text-sm font-medium">Clique para enviar um vídeo</span>
            <span className="text-xs">MP4, WEBM ou MOV • até 25MB</span>
          </div>
        )}
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED.join(",")}
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
            e.target.value = "";
          }}
        />
      </div>
      {value && !uploading && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => inputRef.current?.click()}
          disabled={disabled}
        >
          <Upload className="mr-2 h-4 w-4" /> Substituir vídeo
        </Button>
      )}
    </div>
  );
}
