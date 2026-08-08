import { useCallback, useRef, useState } from "react";
import { Upload, X, Loader2, ImageIcon, Film } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const BUCKET = "menu-images";
const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB
const MAX_VIDEO_BYTES = 25 * 1024 * 1024; // 25 MB
const COMPRESS_THRESHOLD = 800 * 1024; // 800 KB
const MAX_DIMENSION = 1920;
const SIGNED_URL_TTL = 60 * 60 * 24 * 365 * 50; // ~50 anos

const ACCEPTED_IMAGE = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
const ACCEPTED_VIDEO = ["video/mp4", "video/webm", "video/quicktime"];

export type MediaKind = "image" | "video";

interface MediaUploadProps {
  kind: MediaKind;
  value?: string | null;
  onChange: (url: string | null) => void;
  folder?: string;
  disabled?: boolean;
  className?: string;
}

async function compressIfNeeded(file: File): Promise<Blob> {
  if (file.size <= COMPRESS_THRESHOLD && file.type === "image/webp") return file;
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;
  ctx.drawImage(bitmap, 0, 0, w, h);
  return await new Promise<Blob>((resolve) => {
    canvas.toBlob((blob) => resolve(blob ?? file), "image/webp", 0.85);
  });
}

export function MediaUpload({
  kind,
  value,
  onChange,
  folder = "misc",
  disabled,
  className,
}: MediaUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const isVideo = kind === "video";
  const accepted = isVideo ? ACCEPTED_VIDEO : ACCEPTED_IMAGE;

  const handleFile = useCallback(
    async (file: File) => {
      if (!accepted.includes(file.type)) {
        toast.error(
          isVideo ? "Formato inválido. Use MP4, WEBM ou MOV." : "Formato inválido. Use JPG, PNG ou WEBP."
        );
        return;
      }
      const maxBytes = isVideo ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
      if (file.size > maxBytes) {
        toast.error(
          isVideo
            ? "Vídeo maior que 25MB. Comprima antes de enviar."
            : "Imagem maior que 10MB."
        );
        return;
      }

      setUploading(true);
      setProgress(10);
      try {
        const blob: Blob = isVideo ? file : await compressIfNeeded(file);
        setProgress(40);
        const fallbackExt = file.name.split(".").pop() || (isVideo ? "mp4" : "jpg");
        const ext = !isVideo && blob.type === "image/webp" ? "webp" : fallbackExt;
        const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

        const { error: upErr } = await supabase.storage
          .from(BUCKET)
          .upload(path, blob, { contentType: blob.type || file.type, upsert: false });
        if (upErr) throw upErr;
        setProgress(80);

        const { data: signed, error: signErr } = await supabase.storage
          .from(BUCKET)
          .createSignedUrl(path, SIGNED_URL_TTL);
        if (signErr || !signed?.signedUrl) throw signErr ?? new Error("no signed url");

        setProgress(100);
        onChange(signed.signedUrl);
        toast.success(isVideo ? "Vídeo enviado." : "Imagem enviada.");
      } catch (e: any) {
        console.error("[MediaUpload]", e);
        toast.error("Falha ao enviar arquivo: " + (e?.message || "erro desconhecido"));
      } finally {
        setUploading(false);
        setTimeout(() => setProgress(0), 500);
      }
    },
    [accepted, folder, isVideo, onChange]
  );

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  return (
    <div className={cn("space-y-2", className)}>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={() => !disabled && !uploading && inputRef.current?.click()}
        className={cn(
          "relative flex min-h-32 cursor-pointer flex-col items-center justify-center rounded-md border-2 border-dashed p-4 transition-colors",
          dragOver ? "border-primary bg-primary/5" : "border-muted-foreground/30 hover:border-primary/50",
          disabled && "cursor-not-allowed opacity-50"
        )}
      >
        {value ? (
          <div className="relative w-full">
            {isVideo ? (
              <video
                src={value}
                className="mx-auto max-h-48 rounded object-contain"
                muted
                loop
                playsInline
                autoPlay
              />
            ) : (
              <img src={value} alt="Prévia da capa" className="mx-auto max-h-48 rounded object-contain" />
            )}
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
            <span className="text-sm">Enviando... {progress}%</span>
            <div className="h-1.5 w-40 overflow-hidden rounded bg-muted">
              <div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} />
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 text-muted-foreground">
            {isVideo ? <Film className="h-8 w-8" /> : <ImageIcon className="h-8 w-8" />}
            <span className="text-sm font-medium">
              {isVideo ? "Arraste um vídeo ou clique para enviar" : "Arraste uma imagem ou clique para enviar"}
            </span>
            <span className="text-xs">
              {isVideo ? "MP4, WEBM ou MOV • até 25MB" : "JPG, PNG ou WEBP • até 10MB"}
            </span>
          </div>
        )}
        <input
          ref={inputRef}
          type="file"
          accept={accepted.join(",")}
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
          <Upload className="mr-2 h-4 w-4" />
          {isVideo ? "Substituir vídeo" : "Substituir imagem"}
        </Button>
      )}
    </div>
  );
}
