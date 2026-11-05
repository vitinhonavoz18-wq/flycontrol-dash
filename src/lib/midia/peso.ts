/** Vídeo de capa acima disso ganha um aviso (não dá para encolher no navegador). */
export const PESO_DE_VIDEO_RECOMENDADO = 5 * 1024 * 1024;

/** "245 KB", "17,6 MB" — do jeito que o lojista lê. */
export function formatarPeso(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
  return `${Math.round(bytes / 1024)} KB`;
}
