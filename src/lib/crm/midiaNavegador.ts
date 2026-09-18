/**
 * MANDAR FOTO E ÁUDIO PELO PAINEL — a parte que roda no navegador.
 *
 * Antes o lojista só podia escrever. Se o cliente mandava uma foto do
 * comprovante e perguntava "chegou?", ele tinha de pegar o celular, abrir o
 * WhatsApp e responder por lá — e aí a resposta não aparecia no painel. Meia
 * conversa em cada lugar.
 */

/** Tamanho amigável: 1536 vira "1,5 MB". */
export function tamanhoLegivel(bytes: number): string {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
}

/** 75 segundos vira "1:15" — do jeito que o WhatsApp mostra. */
export function duracaoLegivel(segundos: number): string {
  const s = Math.max(0, Math.floor(Number(segundos) || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * O formato em que o áudio é gravado.
 *
 * CADA NAVEGADOR GRAVA NUM FORMATO. O Chrome grava em webm; o Safari do
 * iPhone só sabe mp4. Gravar no formato errado é o mesmo que gravar a fita
 * numa fita que o aparelho do outro não toca: o arquivo existe e ninguém
 * escuta. Por isso a lista é tentada em ordem, e vale o primeiro que o
 * aparelho aceitar.
 */
export const FORMATOS_DE_GRAVACAO = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/ogg;codecs=opus",
  "audio/ogg",
];

export function escolherFormato(aceita: (mime: string) => boolean): string | null {
  for (const f of FORMATOS_DE_GRAVACAO) {
    try {
      if (aceita(f)) return f;
    } catch {
      /* navegador antigo que nem sabe responder: tenta o próximo. */
    }
  }
  return null;
}

/** O tipo limpo, sem o ";codecs=opus" pendurado. */
export function mimeLimpo(mime: string): string {
  return String(mime ?? "")
    .split(";")[0]
    .trim()
    .toLowerCase();
}

export type ArquivoParaEnviar = { nome: string; mime: string; base64: string; tamanho: number };

/**
 * Transforma o arquivo em texto para atravessar a chamada até o servidor.
 *
 * É como ditar a foto por telefone: do outro lado ela é remontada igualzinha.
 * Fica maior no caminho (uns 30%), e é por isso que o limite de tamanho é
 * conferido nos dois lados.
 */
export function lerArquivoComoBase64(arquivo: File): Promise<ArquivoParaEnviar> {
  return new Promise((resolve, reject) => {
    const leitor = new FileReader();
    leitor.onerror = () => reject(new Error("Não consegui ler o arquivo."));
    leitor.onload = () => {
      const r = String(leitor.result ?? "");
      const base64 = r.includes(",") ? r.slice(r.indexOf(",") + 1) : r;
      if (!base64) {
        reject(new Error("Arquivo vazio."));
        return;
      }
      resolve({
        nome: arquivo.name || "arquivo",
        mime: mimeLimpo(arquivo.type) || "application/octet-stream",
        base64,
        tamanho: arquivo.size,
      });
    };
    leitor.readAsDataURL(arquivo);
  });
}
