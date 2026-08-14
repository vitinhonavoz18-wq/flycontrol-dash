import { useEffect } from "react";

/**
 * Registra o service worker (`public/sw.js`) assim que o app carrega no
 * navegador. `useEffect` só roda no cliente — nunca durante a renderização
 * no servidor, então não precisa checar `typeof window`.
 *
 * Sem componente visual: é só o gatilho do registro.
 */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch((err) => {
      // Falha em registrar não é fatal — o app funciona normalmente sem
      // cache offline, só não ganha o benefício.
      console.warn("[PWA] falha ao registrar o service worker:", err);
    });
  }, []);

  return null;
}
