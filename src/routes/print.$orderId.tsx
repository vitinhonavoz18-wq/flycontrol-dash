import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ComandaImpressa } from "@/components/impressao/ComandaImpressa";
import { usePerfisDeImpressao } from "@/components/impressao/usePerfisDeImpressao";
import { PAPEIS, type Papel } from "@/lib/impressao/papel";
import { trocarPapel } from "@/lib/impressao/perfil";
import { dadosDoPedido, montarComanda } from "@/lib/impressao/comanda";
import { validarDados, validarLinhas } from "@/lib/impressao/validar";
import { imprimirPeloNavegador } from "@/lib/impressao/transporte";

export const Route = createFileRoute("/print/$orderId")({ component: Print });

/**
 * A comanda do pedido.
 *
 * O PROBLEMA QUE ISTO RESOLVE
 *
 * A comanda era uma página "de site" (caixas, colunas, letras de vários
 * tamanhos). Isso só sai certo quando o driver da impressora desenha a página
 * como imagem. Muitas térmicas, porém, estão instaladas no Windows como
 * "Genérica / Somente texto": esse driver lê só o texto da página e tenta
 * adivinhar onde cada linha termina. Com letras de tamanhos diferentes e
 * preço "flutuando" à direita, ele junta pedaços de linhas diferentes — e a
 * comanda sai toda emendada. Além disso, as quebras de linha que o cliente
 * digitava na observação ("sem cebola" ⏎ "bem passada") eram engolidas pela
 * página e saíam numa linha só.
 *
 * Agora a comanda é uma grade de letras de mesma largura, uma linha por vez,
 * do tamanho exato do papel (ver `lib/impressao`). O driver que desenha
 * imagem imprime igual à tela; o driver "Somente texto" recebe linhas que já
 * cabem e não tem o que adivinhar.
 */
function Print() {
  const { orderId } = Route.useParams();
  const [o, setO] = useState<Record<string, unknown> | null>(null);
  const [pz, setPz] = useState<Record<string, unknown> | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [pronto, setPronto] = useState(false);
  const [mensagem, setMensagem] = useState<string | null>(null);
  const areaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    (async () => {
      // A leitura respeita as regras de acesso do banco: só abre o pedido de
      // quem é da loja dele.
      const { data, error } = await supabase
        .from("orders")
        .select("*")
        .eq("id", orderId)
        .maybeSingle();
      if (error || !data) {
        setErro("Pedido não encontrado, ou você não tem acesso a ele.");
        return;
      }
      setO(data as Record<string, unknown>);
      const { data: p } = await supabase
        .from("pizzerias")
        .select("name, phone, address, logo_url")
        .eq("id", data.tenant_id)
        .maybeSingle();
      setPz((p as Record<string, unknown>) ?? null);
      setPronto(true);
    })();
  }, [orderId]);

  const lojaId = typeof o?.tenant_id === "string" ? o.tenant_id : null;
  const { dados, perfil, gravar } = usePerfisDeImpressao(lojaId);

  const dadosDaComanda = useMemo(() => (o ? dadosDoPedido(o, pz) : null), [o, pz]);
  const linhas = useMemo(
    () =>
      dadosDaComanda && perfil
        ? montarComanda(dadosDaComanda, {
            colunas: perfil.colunas,
            acentos: perfil.acentos,
            linhasNoFinal: perfil.linhasNoFinal,
          })
        : [],
    [dadosDaComanda, perfil],
  );
  const avisos = useMemo(
    () =>
      dadosDaComanda && perfil
        ? [...validarLinhas(linhas, perfil), ...validarDados(dadosDaComanda)]
        : [],
    [linhas, dadosDaComanda, perfil],
  );

  // Abre a impressão uma vez, sozinha, quando a comanda está desenhada — com
  // a logo e as letras carregadas. Trocar o papel depois NÃO reimprime: o
  // lojista aperta o botão quando quiser.
  const jaAbriu = useRef(false);
  const desenhada = pronto && !!perfil;
  useEffect(() => {
    if (!desenhada || jaAbriu.current) return;
    let cancelado = false;
    const espera = setTimeout(async () => {
      if (cancelado) return;
      jaAbriu.current = true;
      const r = await imprimirPeloNavegador(areaRef.current);
      if (!r.ok) setMensagem(r.mensagem);
    }, 150);
    return () => {
      cancelado = true;
      clearTimeout(espera);
    };
  }, [desenhada]);

  async function imprimirDeNovo() {
    setMensagem(null);
    const r = await imprimirPeloNavegador(areaRef.current);
    if (!r.ok) setMensagem(r.mensagem);
  }

  function escolherPapel(papel: Papel) {
    if (!dados || !perfil) return;
    gravar({
      ...dados,
      perfis: dados.perfis.map((p) => (p.id === perfil.id ? trocarPapel(p, papel) : p)),
    });
  }

  if (erro) return <div className="p-6 text-center text-sm">{erro}</div>;
  if (!o || !perfil || !dados) {
    return <div className="p-6 text-center text-sm">Carregando pedido...</div>;
  }

  const logo = typeof pz?.logo_url === "string" ? pz.logo_url : null;
  const nomeDaLoja = typeof pz?.name === "string" ? pz.name : undefined;
  const avisosVisiveis = avisos.filter((a) => a.nivel !== "info");

  return (
    <div className="pagina-da-comanda">
      <ComandaImpressa
        ref={areaRef}
        linhas={linhas}
        perfil={perfil}
        logoUrl={logo}
        nomeDaLoja={nomeDaLoja}
      />

      <div className="no-print controles-da-comanda">
        {dados.perfis.length > 1 && (
          <div className="space-y-1">
            <label htmlFor="perfil-da-comanda" className="text-sm font-bold">
              Impressora
            </label>
            <select
              id="perfil-da-comanda"
              className="w-full rounded-md border border-gray-300 bg-white px-2 py-2 text-sm"
              value={perfil.id}
              onChange={(ev) => gravar({ ...dados, ativoId: ev.target.value })}
            >
              {dados.perfis.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="space-y-2">
          <div className="text-sm font-bold">Papel da impressora</div>
          <div className="grid grid-cols-2 gap-2">
            {PAPEIS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => escolherPapel(p.id)}
                aria-pressed={perfil.papel === p.id}
                className={`rounded-md border px-2 py-2 text-xs font-semibold ${
                  perfil.papel === p.id
                    ? "border-black bg-black text-white"
                    : "border-gray-300 bg-white text-gray-800"
                }`}
              >
                {p.rotulo}
              </button>
            ))}
          </div>
          <p className="text-xs text-gray-600">
            {PAPEIS.find((p) => p.id === perfil.papel)?.ajuda}
          </p>
          <p className="text-xs text-gray-500">
            Saiu cortada, emendada ou com símbolos estranhos? Ajuste a impressora em{" "}
            <Link to="/my-store" search={{ aba: "impressao" }} className="underline">
              Minha Loja › Impressão
            </Link>{" "}
            e imprima o teste de alinhamento. Este computador lembra a escolha.
          </p>
        </div>

        {avisosVisiveis.length > 0 && (
          <ul className="list-disc space-y-1 rounded-md border border-amber-300 bg-amber-50 py-2 pl-6 pr-2 text-xs text-amber-900">
            {avisosVisiveis.map((a) => (
              <li key={a.codigo}>{a.mensagem}</li>
            ))}
          </ul>
        )}
        {mensagem && (
          <p className="rounded-md border border-red-300 bg-red-50 p-2 text-xs text-red-800">
            {mensagem}
          </p>
        )}

        <button
          onClick={imprimirDeNovo}
          className="w-full rounded-md bg-black py-3 font-bold text-white transition-opacity hover:opacity-90"
        >
          IMPRIMIR COMANDA
        </button>
        <button
          onClick={() => window.history.back()}
          className="w-full rounded-md border border-gray-300 py-2 text-sm text-gray-600"
        >
          Voltar para o Painel
        </button>
      </div>

      <style>{`
        /* Na tela: a prévia da comanda no meio, do tamanho do papel escolhido. */
        body {
          margin: 0;
          padding: 0;
          background-color: #f3f4f6;
        }

        .pagina-da-comanda {
          display: flex;
          flex-direction: column;
          align-items: center;
          min-height: 100vh;
          padding: 20px 12px;
          box-sizing: border-box;
        }

        .controles-da-comanda {
          width: 80mm;
          max-width: 100%;
          margin-top: 24px;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        @media print {
          .pagina-da-comanda {
            display: block !important;
            min-height: 0 !important;
            padding: 0 !important;
          }

          .comanda-logo {
            max-height: 24mm !important;
            max-width: 80% !important;
            margin: 0 auto 2mm auto !important;
          }

          .no-print {
            display: none !important;
          }
        }
      `}</style>
    </div>
  );
}
