/**
 * Service worker do FlyControl.
 *
 * O que ele guarda: só a "casca" do app — o JavaScript, o CSS e os ícones.
 * Isso é o que faz o app abrir na hora numa próxima visita, mesmo com
 * internet ruim, em vez de baixar tudo de novo toda vez.
 *
 * O que ele NUNCA guarda: pedidos, mesas, cardápio, qualquer coisa que vem
 * do banco de dados (Supabase) ou das rotas /api/. Um pedido antigo
 * aparecendo na tela como se fosse novo durante o rush é um problema muito
 * maior do que a tela demorar um pouco mais pra carregar — por isso essas
 * chamadas sempre vão direto pra internet, nunca pro cache.
 *
 * Versão do cache: subir CACHE_VERSION na próxima mudança relevante invalida
 * o cache antigo automaticamente na ativação — não precisa apagar nada à
 * mão em produção.
 */

const CACHE_VERSION = "flycontrol-v1";
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const OFFLINE_URL = "/offline.html";

/** Nunca entra em cache, mesmo sendo do mesmo site: dado que muda a cada segundo. */
function isNeverCache(pathname) {
  return pathname.startsWith("/api/") || pathname.startsWith("/_serverFn") || pathname === "/sw.js";
}

/** Arquivos com nome versionado pelo build (hash no nome) — seguro cachear "para sempre". */
function isStaticAsset(pathname) {
  return (
    pathname.startsWith("/assets/") ||
    pathname.startsWith("/icons/") ||
    pathname.startsWith("/hero-media/") ||
    pathname === "/manifest.webmanifest"
  );
}

self.addEventListener("install", () => {
  // Não espera as abas antigas fecharem para assumir — a próxima navegação
  // já usa a versão nova.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key.startsWith("flycontrol-") && key !== STATIC_CACHE)
          .map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Só GET: escrita (POST/PUT/DELETE) nunca passa pelo cache, nem por engano.
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Fora do próprio site (Supabase, InfinityPay etc.): não intercepta.
  if (url.origin !== self.location.origin) return;

  if (isNeverCache(url.pathname)) return;

  // Navegação entre páginas: tenta a rede primeiro (dado mais fresco
  // possível); só usa o que está guardado se a rede falhar de verdade.
  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(request);
          const cache = await caches.open(STATIC_CACHE);
          cache.put(request, fresh.clone());
          return fresh;
        } catch {
          const cache = await caches.open(STATIC_CACHE);
          const cached = await cache.match(request);
          if (cached) return cached;
          const offline = await cache.match(OFFLINE_URL);
          return offline ?? Response.error();
        }
      })(),
    );
    return;
  }

  // JS/CSS/ícones com nome versionado: usa o que já está guardado sem nem
  // perguntar pra rede — e guarda pra próxima vez se ainda não tiver.
  if (isStaticAsset(url.pathname)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(STATIC_CACHE);
        const cached = await cache.match(request);
        if (cached) return cached;
        const fresh = await fetch(request);
        if (fresh.ok) cache.put(request, fresh.clone());
        return fresh;
      })(),
    );
  }

  // Qualquer outra coisa (dados, chamadas ao servidor): não intercepta —
  // segue direto pra rede, do jeito que já era sem o service worker.
});
