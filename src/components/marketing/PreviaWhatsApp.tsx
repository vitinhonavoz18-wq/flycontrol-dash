/**
 * A prévia: como a mensagem vai chegar no celular do cliente.
 *
 * POR QUE ISTO IMPORTA MAIS DO QUE PARECE
 *
 * Quem escreve a mensagem está olhando para um campo de texto largo, no
 * computador. Quem recebe está olhando para um balão estreito, no celular,
 * no meio de uma conversa. Uma promoção que parecia curta vira um paredão de
 * texto. Ver o resultado antes de mandar para mil pessoas é a diferença
 * entre corrigir e se arrepender.
 *
 * Por isso a largura aqui é a de um celular de verdade, e não a da tela.
 */

export function PreviaWhatsApp({
  nomeRestaurante,
  mensagem,
  urlImagem,
}: {
  nomeRestaurante: string;
  mensagem: string;
  urlImagem?: string | null;
}) {
  const linhas = mensagem.split("\n");
  const agora = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

  return (
    <div className="mx-auto w-full max-w-[320px]">
      <div
        className="overflow-hidden rounded-2xl border shadow-sm"
        style={{ background: "#0b141a", borderColor: "rgba(255,255,255,0.08)" }}
      >
        {/* Barra de conversa, para situar que aquilo é o WhatsApp. */}
        <div
          className="flex items-center gap-2.5 px-3 py-2.5"
          style={{ background: "#1f2c33" }}
          aria-hidden="true"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-600 text-xs font-bold text-white">
            {(nomeRestaurante || "?").slice(0, 2).toUpperCase()}
          </span>
          <div className="min-w-0">
            <p className="truncate text-[13px] font-semibold text-white">
              {nomeRestaurante || "Seu restaurante"}
            </p>
            <p className="text-[10px] text-white/50">online</p>
          </div>
        </div>

        {/* Fundo da conversa. */}
        <div className="min-h-[180px] space-y-2 px-3 py-4" style={{ background: "#0b141a" }}>
          <div
            className="ml-auto max-w-[85%] rounded-lg rounded-tr-sm px-2.5 py-2 shadow-sm"
            style={{ background: "#005c4b" }}
          >
            {urlImagem && (
              <img
                src={urlImagem}
                alt=""
                className="mb-2 max-h-40 w-full rounded object-cover"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.display = "none";
                }}
              />
            )}

            {mensagem.trim() === "" ? (
              <p className="text-[13px] italic text-white/40">
                Sua mensagem aparece aqui conforme você escreve.
              </p>
            ) : (
              <p className="whitespace-pre-wrap break-words text-[13px] leading-snug text-white">
                {linhas.map((l, i) => (
                  <span key={i}>
                    {l}
                    {i < linhas.length - 1 && <br />}
                  </span>
                ))}
              </p>
            )}

            <p className="mt-1 text-right text-[10px] text-white/45">{agora} ✓✓</p>
          </div>
        </div>
      </div>

      <p className="mt-2 text-center text-xs text-muted-foreground">
        É assim que vai chegar no celular do seu cliente.
      </p>
    </div>
  );
}
