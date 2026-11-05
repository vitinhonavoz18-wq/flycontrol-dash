import { medidasFinais } from "./medidas";

/** O maior lado de uma foto de produto (ver `image-upload.tsx`). */
export const LIMITE_PRODUTO = 900;

/**
 * Encolhe e regrava a foto em WebP, no próprio navegador do lojista.
 *
 * A decisão é pelo TAMANHO DA FOTO, não pelo peso do arquivo. Um WebP
 * comprime tão bem que uma foto enorme cabe em poucos KB no disco, mas ao ser
 * aberta na tela do cliente ela volta a ocupar o tamanho original na memória.
 * É a barraca de camping: dobrada cabe na mochila, montada ocupa a sala.
 *
 * `forcar`: regrava mesmo quando a foto já é WebP e já está dentro do limite.
 * Serve para as fotos ANTIGAS do cardápio, que podem ser WebP de qualidade
 * máxima com 2 MB — o tamanho está certo, o peso não.
 *
 * Nunca devolve algo pior: se não der para abrir a foto ou se a versão nova
 * não ficar mais leve, devolve o arquivo original.
 */
export async function comprimirParaWebp(
  arquivo: Blob,
  limite: number,
  opcoes: { forcar?: boolean } = {},
): Promise<Blob> {
  const bitmap = await createImageBitmap(arquivo);
  const maiorLado = Math.max(bitmap.width, bitmap.height);
  if (!opcoes.forcar && arquivo.type === "image/webp" && maiorLado <= limite) {
    bitmap.close();
    return arquivo;
  }
  const { largura: w, altura: h } = medidasFinais(bitmap.width, bitmap.height, limite);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    return arquivo;
  }
  // Encolher com a suavização no máximo evita o serrilhado nas bordas das
  // letras da logo e nos contornos da foto.
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, w, h);
  // Libera a foto aberta na memória; num envio em lote isso evita a aba
  // engasgar depois da décima imagem.
  bitmap.close();
  const nova = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(
      resolve,
      "image/webp",
      // Imagem grande (capa, logo) aparece em destaque: um pouco mais de
      // qualidade custa pouco peso e evita manchas no degradê do céu da foto.
      limite > LIMITE_PRODUTO ? 0.9 : 0.85,
    ),
  );
  if (!nova) return arquivo;
  // Na otimização de fotos antigas, só troca se a nova for de fato WebP e
  // mais leve. (Navegador sem WebP devolve PNG, que costuma pesar mais.)
  if (opcoes.forcar && (nova.type !== "image/webp" || nova.size >= arquivo.size)) {
    return arquivo;
  }
  return nova;
}
