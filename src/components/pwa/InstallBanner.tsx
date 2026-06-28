import { useEffect, useState } from "react";
import { Download, X, Share } from "lucide-react";

type BIPEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

let deferredPrompt: BIPEvent | null = null;

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e as BIPEvent;
    try {
      sessionStorage.setItem("pwa_install_available", "true");
    } catch {}
    window.dispatchEvent(new Event("pwa-installable"));
    console.log("[PWA] beforeinstallprompt captured");
  });
  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    try {
      sessionStorage.removeItem("pwa_install_available");
      localStorage.setItem("pwa_installed", "1");
    } catch {}
    console.log("[PWA] appinstalled");
  });
}

function detect() {
  if (typeof window === "undefined") {
    return { isStandalone: false, isMobile: false, isIOS: false };
  }
  const isStandalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    // @ts-expect-error iOS Safari
    window.navigator.standalone === true;
  const ua = navigator.userAgent || "";
  const isMobile = window.innerWidth < 768 || /Android|iPhone|iPad|iPod|Mobile/i.test(ua);
  const isIOS = /iPad|iPhone|iPod/.test(ua) && !("MSStream" in window);
  return { isStandalone, isMobile, isIOS };
}

export function InstallBanner() {
  const [mounted, setMounted] = useState(false);
  const [hasPrompt, setHasPrompt] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [env, setEnv] = useState({ isStandalone: false, isMobile: false, isIOS: false });

  useEffect(() => {
    setMounted(true);
    setEnv(detect());
    try {
      setDismissed(sessionStorage.getItem("pwa_install_dismissed") === "1");
      setHasPrompt(!!deferredPrompt || sessionStorage.getItem("pwa_install_available") === "true");
    } catch {}

    const onInstallable = () => setHasPrompt(true);
    const onResize = () => setEnv(detect());
    window.addEventListener("pwa-installable", onInstallable);
    window.addEventListener("resize", onResize);

    const { isStandalone, isMobile, isIOS } = detect();
    console.log("[PWA] standalone:", isStandalone, "mobile:", isMobile, "ios:", isIOS, "prompt:", !!deferredPrompt);

    return () => {
      window.removeEventListener("pwa-installable", onInstallable);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  if (!mounted || dismissed) return null;
  const { isStandalone, isMobile, isIOS } = env;
  if (isStandalone || !isMobile) return null;

  const showAndroid = hasPrompt && !isIOS;
  const showIOS = isIOS;
  if (!showAndroid && !showIOS) return null;

  const dismiss = () => {
    setDismissed(true);
    try {
      sessionStorage.setItem("pwa_install_dismissed", "1");
    } catch {}
  };

  const install = async () => {
    if (!deferredPrompt) return;
    try {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice?.outcome === "accepted") {
        deferredPrompt = null;
        try {
          sessionStorage.removeItem("pwa_install_available");
        } catch {}
        setHasPrompt(false);
        setDismissed(true);
      }
    } catch (err) {
      console.warn("[PWA] install error", err);
    }
  };

  return (
    <div
      className="md:hidden fixed left-3 right-3 z-50 rounded-2xl border border-primary/30 bg-card/95 backdrop-blur shadow-2xl p-3 flex items-center gap-3"
      style={{ bottom: "calc(env(safe-area-inset-bottom) + 80px)" }}
      role="dialog"
      aria-label="Instalar FlyControl"
    >
      <div className="h-11 w-11 rounded-xl bg-primary/15 grid place-items-center shrink-0">
        {showIOS ? <Share className="h-5 w-5 text-primary" /> : <Download className="h-5 w-5 text-primary" />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold leading-tight">Instalar FL Mobile App</div>
        <div className="text-xs text-muted-foreground leading-tight mt-0.5">
          {showIOS ? "Toque em Compartilhar → Adicionar à Tela de Início" : "Acesso rápido direto da tela inicial"}
        </div>
      </div>
      {showAndroid && (
        <button
          onClick={install}
          className="px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold active:scale-95"
        >
          Instalar
        </button>
      )}
      <button
        onClick={dismiss}
        aria-label="Fechar"
        className="h-9 w-9 grid place-items-center rounded-lg hover:bg-muted shrink-0"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
