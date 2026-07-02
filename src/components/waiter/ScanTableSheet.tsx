import { useCallback, useEffect, useRef, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, ScanLine, Keyboard, Camera, X } from "lucide-react";
import { toast } from "sonner";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Called with the raw string decoded from the QR/barcode or typed by the waiter. */
  onDetected: (value: string) => void;
};

/**
 * Mobile-first table scanner. Uses the native BarcodeDetector when available
 * (Chrome/Android) and falls back to a manual entry field. No 3rd-party libs
 * so the bundle stays small on the waiter's phone.
 */
export function ScanTableSheet({ open, onOpenChange, onDetected }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const [starting, setStarting] = useState(false);
  const [supported, setSupported] = useState<boolean | null>(null);
  const [manual, setManual] = useState("");

  const stop = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const handleHit = useCallback((raw: string) => {
    stop();
    onOpenChange(false);
    onDetected(raw);
  }, [stop, onOpenChange, onDetected]);

  const start = useCallback(async () => {
    setStarting(true);
    try {
      const AnyWin = window as any;
      const hasDetector = typeof AnyWin.BarcodeDetector === "function";
      setSupported(hasDetector);
      if (!hasDetector) return;
      const detector = new AnyWin.BarcodeDetector({ formats: ["qr_code", "code_128", "ean_13"] });
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } }, audio: false,
      });
      streamRef.current = stream;
      const v = videoRef.current;
      if (!v) return;
      v.srcObject = stream;
      v.setAttribute("playsinline", "true");
      await v.play().catch(() => {});
      const tick = async () => {
        try {
          const results = await detector.detect(v);
          if (results && results[0]?.rawValue) return handleHit(String(results[0].rawValue));
        } catch { /* transient */ }
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    } catch (e: any) {
      toast.error(e?.message || "Não foi possível abrir a câmera");
      setSupported(false);
    } finally {
      setStarting(false);
    }
  }, [handleHit]);

  useEffect(() => {
    if (open) void start(); else stop();
    return stop;
  }, [open, start, stop]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="p-0 h-[92vh] rounded-t-3xl overflow-hidden">
        <SheetHeader className="p-4 border-b flex-row items-center justify-between">
          <SheetTitle className="flex items-center gap-2">
            <ScanLine className="h-5 w-5 text-primary" /> Escanear Mesa
          </SheetTitle>
          <Button size="icon" variant="ghost" onClick={() => onOpenChange(false)} aria-label="Fechar">
            <X className="h-5 w-5" />
          </Button>
        </SheetHeader>

        <div className="relative bg-black h-[55vh]">
          <video ref={videoRef} className="absolute inset-0 w-full h-full object-cover" muted />
          {/* Aim overlay */}
          <div className="absolute inset-0 grid place-items-center pointer-events-none">
            <div className="w-64 h-64 rounded-2xl border-4 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.45)] animate-pulse" />
          </div>
          {starting && (
            <div className="absolute inset-0 grid place-items-center text-white">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          )}
          {supported === false && (
            <div className="absolute inset-0 grid place-items-center bg-background/95 p-6 text-center">
              <div className="space-y-2">
                <Camera className="h-8 w-8 mx-auto text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  Seu navegador não suporta câmera para leitura de QR. Use o campo abaixo.
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="p-4 space-y-3 border-t bg-background">
          <label className="text-xs font-medium text-muted-foreground flex items-center gap-2">
            <Keyboard className="h-3 w-3" /> Ou digite o número/código da mesa
          </label>
          <div className="flex gap-2">
            <Input
              value={manual}
              onChange={(e) => setManual(e.target.value)}
              placeholder="Ex.: 12"
              inputMode="text"
              className="h-12 text-base"
              onKeyDown={(e) => { if (e.key === "Enter" && manual.trim()) handleHit(manual.trim()); }}
            />
            <Button className="h-12 px-6" disabled={!manual.trim()} onClick={() => handleHit(manual.trim())}>
              Ir
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground text-center">
            Aponte o QR da mesa. Se preciso, digite o número manualmente.
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
}
