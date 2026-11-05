import { createFileRoute } from "@tanstack/react-router";
import { entregarMidia } from "@/lib/midia/entregarMidia";

/**
 * A "geladeira" das fotos e vídeos do cardápio. O trabalho todo está em
 * `src/lib/midia/entregarMidia.ts`; normalmente quem responde é a porta de
 * entrada do servidor (`src/server.ts`), que chama a mesma função sem passar
 * pelo resto do sistema. Esta rota continua existindo como reserva — se o
 * atalho um dia não pegar, a foto chega do mesmo jeito.
 */
export const entregar = entregarMidia;

export const Route = createFileRoute("/api/public/midia/$")({
  server: {
    handlers: {
      GET: async ({ request }) => entregar(request),
    },
  },
});
