import { useEffect, useState } from "react";
import { MapPin, Store } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Prova social: os cardápios que já estão no ar.
 *
 * O mosaico vem da página antiga, mas ali ele era enfeite — ficava borrado
 * no fundo, atrás do texto. Aqui ele é o argumento: são restaurantes reais,
 * puxados do banco, com o nome, o logo e o bairro deles, e cada cartão abre
 * o cardápio de verdade. É a diferença entre dizer "temos vários clientes" e
 * mostrar a lista para a pessoa conferir um por um.
 *
 * Se o banco não devolver nenhum restaurante, a seção não aparece. Nunca
 * inventamos restaurante de mentira para encher a fita — prova social falsa
 * é a pior propaganda que existe: basta um visitante clicar para descobrir.
 */

type Cardapio = {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  neighborhood: string | null;
  address: string | null;
  public_url: string | null;
  primary_color: string | null;
};

/** Cartões por fita antes de repetir a lista: menos que isso deixa buraco. */
const MINIMO_POR_FITA = 9;

export function MosaicoCardapios() {
  const [cardapios, setCardapios] = useState<Cardapio[]>([]);

  useEffect(() => {
    let cancelado = false;

    async function carregar() {
      // Só restaurantes publicados e ativos — o mesmo filtro da página antiga.
      const { data, error } = await supabase
        .from("pizzerias")
        .select("id, name, slug, logo_url, neighborhood, address, public_url, primary_color")
        .eq("is_active", true)
        .not("slug", "is", null)
        .neq("status", "deleted")
        .neq("status", "inactive")
        .order("created_at", { ascending: false })
        .limit(60);

      if (cancelado || error || !data) return;
      setCardapios(data as Cardapio[]);
    }

    void carregar();
    return () => {
      cancelado = true;
    };
  }, []);

  // Sem restaurante no ar, não há o que provar. A seção some inteira.
  if (cardapios.length === 0) return null;

  const meio = Math.ceil(cardapios.length / 2);
  const fitas = [
    preencher(cardapios.slice(0, meio)),
    preencher(cardapios.slice(meio).length > 0 ? cardapios.slice(meio) : cardapios.slice(0, meio)),
  ];

  return (
    <section className="border-t border-white/5 py-20 md:py-28">
      <div className="safe-x mx-auto max-w-6xl px-5">
        <h2 className="font-display text-[clamp(1.7rem,3.6vw,2.5rem)]">Já estão no ar</h2>
        <p className="mt-4 max-w-md text-white/50">
          Cada cartão é um restaurante de verdade usando o FlyControl agora. Clique em qualquer um e
          o cardápio dele abre.
        </p>
      </div>

      <div className="mosaico-palco mt-12 space-y-3 overflow-hidden">
        {fitas.map((fita, indice) => (
          <div
            key={indice}
            className="mosaico-fita flex gap-3"
            data-sentido={indice % 2 === 0 ? "esquerda" : "direita"}
            style={{ "--mosaico-tempo": indice % 2 === 0 ? "64s" : "78s" } as React.CSSProperties}
          >
            {fita.map((c, i) => (
              <Cartao key={`a-${c.id}-${i}`} cardapio={c} />
            ))}
            {/* Segunda cópia: é ela que faz a fita emendar sem salto. Não é
                conteúdo novo, então some para o leitor de tela e não recebe
                foco do teclado — senão a pessoa passaria pela mesma lista
                duas vezes. */}
            {fita.map((c, i) => (
              <Cartao key={`b-${c.id}-${i}`} cardapio={c} decorativo />
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}

/** Repete a lista até dar corpo à fita, mantendo a ordem. */
function preencher(lista: Cardapio[]): Cardapio[] {
  if (lista.length === 0) return lista;
  const cheia = [...lista];
  while (cheia.length < MINIMO_POR_FITA) cheia.push(...lista);
  return cheia;
}

function Cartao({ cardapio, decorativo = false }: { cardapio: Cardapio; decorativo?: boolean }) {
  const cor = cardapio.primary_color || "#FF5A00";
  const lugar = cardapio.neighborhood || cardapio.address?.split(",")[1]?.trim() || null;
  const endereco = cardapio.public_url || `https://conectfly.com/${cardapio.slug}`;

  const conteudo = (
    <>
      <div className="flex items-center gap-2.5">
        {cardapio.logo_url ? (
          <img
            src={cardapio.logo_url}
            alt=""
            loading="lazy"
            className="h-9 w-9 flex-shrink-0 rounded-lg object-cover"
          />
        ) : (
          <span
            aria-hidden="true"
            className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg"
            style={{ background: `${cor}26` }}
          >
            <Store className="h-4 w-4" style={{ color: cor }} />
          </span>
        )}
        <span className="min-w-0">
          <span className="block truncate text-[13px] font-bold leading-tight text-white/90">
            {cardapio.name}
          </span>
          {lugar && (
            <span className="mt-0.5 flex items-center gap-1 truncate text-[11px] text-white/40">
              <MapPin className="h-2.5 w-2.5 flex-shrink-0" aria-hidden="true" />
              {lugar}
            </span>
          )}
        </span>
      </div>

      {/* Fio na cor da marca do restaurante — o mosaico fica colorido pelos
          clientes, não por nós. */}
      <span
        aria-hidden="true"
        className="mt-3 block h-[3px] w-10 rounded-full"
        style={{ background: cor }}
      />
    </>
  );

  const visual =
    "w-[216px] flex-shrink-0 rounded-xl border border-white/8 p-3.5 transition-colors duration-300";
  const fundo = { background: "#171310" };

  if (decorativo) {
    return (
      <div aria-hidden="true" className={visual} style={fundo}>
        {conteudo}
      </div>
    );
  }

  return (
    <a
      href={endereco}
      target="_blank"
      rel="noopener noreferrer"
      title={`Abrir o cardápio de ${cardapio.name}`}
      className={`${visual} hover:border-white/25 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FF5A00]`}
      style={fundo}
    >
      {conteudo}
    </a>
  );
}
