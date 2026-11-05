import { supabase } from "@/integrations/supabase/client";

const GAVETA = "menu-images";
const VALIDADE_DO_LINK = 60 * 60 * 24 * 365 * 50; // ~50 anos
// Cada foto ganha um nome único, então o arquivo de um endereço nunca muda:
// o celular do cliente pode guardá-la por um ano.
const CACHE_UM_ANO = String(60 * 60 * 24 * 365);

/**
 * Guarda a foto na gaveta do cardápio e devolve o endereço para usar no
 * site. Lança erro se o envio falhar — quem chama decide o que fazer.
 */
export async function enviarFotoDoCardapio(foto: Blob, pasta: string): Promise<string> {
  const ext = foto.type === "image/webp" ? "webp" : foto.type === "image/png" ? "png" : "jpg";
  const caminho = `${pasta}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error: erroEnvio } = await supabase.storage.from(GAVETA).upload(caminho, foto, {
    contentType: foto.type,
    upsert: false,
    cacheControl: CACHE_UM_ANO,
  });
  if (erroEnvio) throw erroEnvio;
  const { data, error: erroLink } = await supabase.storage
    .from(GAVETA)
    .createSignedUrl(caminho, VALIDADE_DO_LINK);
  if (erroLink || !data?.signedUrl) throw erroLink ?? new Error("sem link da foto");
  return data.signedUrl;
}
