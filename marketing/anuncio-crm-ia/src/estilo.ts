import { Easing, interpolate } from "remotion";

/** Cores reais do FlyControl (src/styles.css do painel). */
export const COR = {
  laranja: "#FF5A00",
  laranjaClaro: "#FF8A3D",
  brilho: "#FFC15A",
  preto: "#0E0E10",
  texto: "#111827",
  cinza: "#6B7280",
  cinzaClaro: "#F3F4F6",
  borda: "#E5E7EB",
  fundo: "#FFFFFF",
  whats: "#25D366",
  whatsEscuro: "#1DA851",
  ia: "#0284C7", // azul da "Atendente IA" no chat real (sky-600)
  verdeOk: "#059669",
  ambar: "#F59E0B",
};

export const FONTE = {
  titulo: "'Bricolage Grotesque', 'Inter', sans-serif",
  ui: "'Inter', 'Instrument Sans', sans-serif",
  corpo: "'Instrument Sans', 'Inter', sans-serif",
  comanda: "'Courier Prime', monospace",
};

export const suave = Easing.bezier(0.22, 1, 0.36, 1);
export const entraSai = Easing.bezier(0.65, 0, 0.35, 1);

/** interpolate com clamp e easing padrão. */
export function iv(
  f: number,
  de: [number, number],
  para: [number, number],
  easing: (t: number) => number = suave,
) {
  return interpolate(f, de, para, {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing,
  });
}

/** Opacidade de entrada/saída de uma cena. */
export function fadeCena(f: number, ini: number, fim: number, entra = 10, sai = 10) {
  return Math.min(iv(f, [ini, ini + entra], [0, 1]), iv(f, [fim - sai, fim], [1, 0]));
}

/** Pequeno "pop" elástico (0→1, passando de 1). */
export function pop(f: number, ini: number, dur = 14) {
  const t = Math.max(0, Math.min(1, (f - ini) / dur));
  if (t <= 0) return 0;
  const c4 = (2 * Math.PI) / 3.2;
  return t === 1 ? 1 : Math.pow(2, -9 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
}

/** Ruído suave determinístico para flutuações orgânicas. */
export function onda(f: number, semente: number, vel = 0.02) {
  return Math.sin(f * vel + semente * 12.9898) * 0.6 + Math.sin(f * vel * 0.53 + semente * 4.1) * 0.4;
}
