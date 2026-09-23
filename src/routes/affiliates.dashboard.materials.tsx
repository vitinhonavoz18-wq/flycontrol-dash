import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Download, FileText, Image as ImageIcon, Link2, Megaphone, Video } from "lucide-react";
import { BotaoCopiar, CartaoDoLink } from "@/components/afiliados/portal/CartaoDoLink";
import {
  Carregando,
  Erro,
  Painel,
  TituloDaPagina,
  Vazio,
} from "@/components/afiliados/portal/Pecas";
import { usePerfil } from "@/components/afiliados/portal/perfilContexto";
import { useMateriais, type Material } from "@/lib/afiliados/portal";
import { linkDoAfiliado, mensagemDeErro, preencherTexto } from "@/lib/afiliados/validacao";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/affiliates/dashboard/materials")({ component: Materiais });

const CATEGORIAS: { valor: Material["kind"] | "todos"; rotulo: string }[] = [
  { valor: "todos", rotulo: "Todos" },
  { valor: "banner", rotulo: "Banners" },
  { valor: "story", rotulo: "Stories" },
  { valor: "post", rotulo: "Posts" },
  { valor: "logo", rotulo: "Logos" },
  { valor: "video", rotulo: "Vídeos" },
  { valor: "copy", rotulo: "Textos" },
  { valor: "link", rotulo: "Links" },
];

/**
 * A prateleira de materiais. Mostra só o que a equipe publicou de verdade;
 * enquanto não houver nada, diz isso claramente em vez de inventar arquivo.
 */
function Materiais() {
  const perfil = usePerfil();
  const materiais = useMateriais();
  const [categoria, setCategoria] = useState<(typeof CATEGORIAS)[number]["valor"]>("todos");

  const lista = (materiais.data ?? []).filter((m) => categoria === "todos" || m.kind === categoria);

  return (
    <div className="space-y-6">
      <TituloDaPagina
        titulo="Materiais"
        texto="Artes, textos e links prontos para divulgar o FlyControl."
      />

      <CartaoDoLink codigo={perfil.codigo} />

      <div
        role="tablist"
        aria-label="Tipo de material"
        className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0"
      >
        {CATEGORIAS.map((c) => (
          <button
            key={c.valor}
            type="button"
            role="tab"
            aria-selected={categoria === c.valor}
            onClick={() => setCategoria(c.valor)}
            className={cn(
              "h-10 shrink-0 rounded-full border px-4 text-sm transition-colors",
              categoria === c.valor
                ? "border-white bg-white text-black"
                : "border-white/10 text-white/65 hover:text-white",
            )}
          >
            {c.rotulo}
          </button>
        ))}
      </div>

      {materiais.isLoading ? (
        <Carregando linhas={3} altura="h-40" />
      ) : materiais.isError ? (
        <Erro mensagem={mensagemDeErro(materiais.error)} tentarDeNovo={() => materiais.refetch()} />
      ) : lista.length === 0 ? (
        <Vazio
          titulo={materiais.data?.length ? "Nada nesta categoria ainda" : "Materiais em preparação"}
          texto="A equipe FlyControl vai publicar aqui banners, stories, posts, logos, vídeos e textos prontos. Enquanto isso, use o seu link acima."
        />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {lista.map((m) => (
            <CartaoDoMaterial key={m.id} m={m} codigo={perfil.codigo} />
          ))}
        </ul>
      )}
    </div>
  );
}

function IconeDoTipo({ tipo }: { tipo: Material["kind"] }) {
  const Icone =
    tipo === "video"
      ? Video
      : tipo === "copy"
        ? FileText
        : tipo === "link"
          ? Link2
          : tipo === "logo"
            ? Megaphone
            : ImageIcon;
  return <Icone className="size-4" />;
}

function CartaoDoMaterial({ m, codigo }: { m: Material; codigo: string }) {
  const ehImagem = m.file_url && /\.(png|jpe?g|webp|gif|svg)(\?|$)/i.test(m.file_url);
  const link = m.kind === "link" ? linkDoAfiliado(codigo, m.target_path ?? "/") : null;
  const texto = m.body_text ? preencherTexto(m.body_text, codigo) : null;

  return (
    <li>
      <Painel className="flex h-full flex-col gap-3">
        {ehImagem ? (
          <img
            src={m.file_url ?? undefined}
            alt={m.title}
            loading="lazy"
            className="aspect-video w-full rounded-[12px] border border-white/[0.06] bg-black object-contain"
          />
        ) : null}
        <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.14em] text-white/45">
          <IconeDoTipo tipo={m.kind} />
          {CATEGORIAS.find((c) => c.valor === m.kind)?.rotulo}
        </div>
        <h3 className="font-medium text-white">{m.title}</h3>
        {m.description ? <p className="text-sm text-white/55">{m.description}</p> : null}
        {texto ? (
          <p className="max-h-40 overflow-y-auto whitespace-pre-wrap rounded-[10px] bg-white/[0.03] p-3 text-sm text-white/75">
            {texto}
          </p>
        ) : null}
        {link ? <p className="break-all font-mono text-xs text-white/60">{link}</p> : null}
        <div className="mt-auto flex flex-wrap gap-2 pt-1">
          {m.file_url ? (
            <a
              href={m.file_url}
              target="_blank"
              rel="noreferrer"
              download
              className="inline-flex h-11 items-center gap-2 rounded-full border border-white/15 px-4 text-sm text-white hover:bg-white/5"
            >
              <Download className="size-4" /> Baixar
            </a>
          ) : null}
          {texto ? (
            <BotaoCopiar
              texto={texto}
              rotulo="Copiar texto"
              copiadoRotulo="Texto copiado!"
              variante="discreto"
              className="h-11"
            />
          ) : null}
          {link ? (
            <BotaoCopiar
              texto={link}
              rotulo="Copiar link"
              copiadoRotulo="Link copiado!"
              variante="discreto"
              className="h-11"
            />
          ) : null}
        </div>
      </Painel>
    </li>
  );
}
