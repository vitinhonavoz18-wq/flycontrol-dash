import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Globe, Loader2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  avisoDoEndereco,
  ENDERECO_BASE,
  ENDERECO_MAX,
  enderecoAtualDoLink,
  normalizarEndereco,
  podeSalvar,
  problemaDeFormato,
  situacaoConhecida,
  type SituacaoDoEndereco,
} from "@/lib/site/enderecoDaLoja";

/** Espera o dono parar de digitar antes de perguntar ao servidor. */
const ESPERA_MS = 500;

type Props = {
  pizzeriaId: string;
  /** Link gravado hoje (`pizzerias.public_url`), para mostrar o endereço atual. */
  publicUrl: string | null;
  slug: string | null;
  onSaved: (novoLink: string) => void;
};

async function chamar(pizzeriaId: string, action: "check" | "set", address: string) {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("sessao_expirada");
  const resp = await fetch(`/api/pizzerias/${pizzeriaId}/address`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ action, address }),
  });
  const json = (await resp.json().catch(() => null)) as Record<string, unknown> | null;
  return { httpStatus: resp.status, json };
}

/**
 * Campo "Endereço da loja": o dono escolhe como fica o link do cardápio
 * (conectfly.com.br/<nome>) e vê na hora se o nome está livre.
 *
 * A resposta "Disponível" é do SiteCreatorFly, que tem a lista de todas as
 * lojas. Mesmo assim, entre a resposta e o clique em salvar outra loja pode
 * pegar o nome — por isso o salvamento confere de novo, e quem decide no fim
 * é o banco de lá.
 */
export function StoreAddressField({ pizzeriaId, publicUrl, slug, onSaved }: Props) {
  const atual = enderecoAtualDoLink(publicUrl) ?? (slug ? slug.toLowerCase() : null);
  const [texto, setTexto] = useState("");
  const [situacao, setSituacao] = useState<SituacaoDoEndereco | null>(null);
  const [sugestoes, setSugestoes] = useState<string[]>([]);
  const [conferindo, setConferindo] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [falha, setFalha] = useState<string | null>(null);
  // Resposta que chega atrasada (de algo digitado antes) é ignorada.
  const rodada = useRef(0);

  const endereco = normalizarEndereco(texto);

  useEffect(() => {
    setFalha(null);
    setSugestoes([]);
    if (!texto.trim()) {
      setSituacao(null);
      setConferindo(false);
      return;
    }
    const local = problemaDeFormato(endereco);
    if (local) {
      setSituacao(local);
      setConferindo(false);
      return;
    }
    if (atual && endereco === atual) {
      setSituacao("current");
      setConferindo(false);
      return;
    }

    const minha = ++rodada.current;
    setSituacao(null);
    setConferindo(true);
    const t = setTimeout(async () => {
      try {
        const { httpStatus, json } = await chamar(pizzeriaId, "check", endereco);
        if (minha !== rodada.current) return;
        const s = situacaoConhecida(json?.status);
        if (json?.success && s) {
          // "Já é o seu" lá no site, mas o painel ainda mostra outro link (ex.:
          // o endereço de teste): deixa salvar, para o painel passar a mostrar
          // o endereço certo.
          setSituacao(s === "current" && endereco !== atual ? "yours" : s);
          setSugestoes(Array.isArray(json.suggestions) ? (json.suggestions as string[]) : []);
        } else if (httpStatus === 404 || json?.error === "store_not_online") {
          setFalha("O cardápio online desta loja ainda não está no ar.");
        } else if (httpStatus === 403 || httpStatus === 401) {
          setFalha("Você não tem permissão para mudar o endereço desta loja.");
        } else {
          setFalha("Não consegui conferir agora. Tente de novo em instantes.");
        }
      } catch {
        if (minha === rodada.current) {
          setFalha("Não consegui conferir agora. Tente de novo em instantes.");
        }
      } finally {
        if (minha === rodada.current) setConferindo(false);
      }
    }, ESPERA_MS);
    return () => clearTimeout(t);
  }, [texto, endereco, atual, pizzeriaId]);

  async function salvar() {
    if (!podeSalvar(situacao) || salvando) return;
    setSalvando(true);
    try {
      const { json } = await chamar(pizzeriaId, "set", endereco);
      if (json?.success && typeof json.public_url === "string") {
        toast.success(`Pronto! Seu cardápio agora está em ${ENDERECO_BASE}/${json.address}`);
        onSaved(json.public_url);
        setTexto("");
        setSituacao(null);
        return;
      }
      const s = situacaoConhecida(json?.status);
      if (s) {
        // Outra loja salvou o mesmo nome no meio do caminho.
        setSituacao(s);
        setSugestoes(Array.isArray(json?.suggestions) ? (json!.suggestions as string[]) : []);
        toast.error(avisoDoEndereco(s).texto);
      } else {
        toast.error("Não consegui salvar o endereço agora. Nada foi alterado.");
      }
    } catch {
      toast.error("Não consegui salvar o endereço agora. Nada foi alterado.");
    } finally {
      setSalvando(false);
    }
  }

  const aviso = situacao ? avisoDoEndereco(situacao) : null;

  return (
    <div className="space-y-3 rounded-lg border p-4">
      <div className="flex items-center gap-2">
        <Globe className="h-4 w-4 text-primary" />
        <Label htmlFor="store-address" className="font-semibold">
          Endereço da loja
        </Label>
      </div>
      <p className="text-xs text-muted-foreground">
        O link que seus clientes usam para pedir. Endereço atual:{" "}
        <strong className="font-mono">
          {atual ? `${ENDERECO_BASE}/${atual}` : "ainda não definido"}
        </strong>
      </p>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="flex flex-1 items-center rounded-md border bg-background focus-within:ring-2 focus-within:ring-ring">
          <span className="select-none pl-3 text-sm text-muted-foreground">{ENDERECO_BASE}/</span>
          <Input
            id="store-address"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="nome-da-sua-loja"
            maxLength={ENDERECO_MAX + 20}
            autoComplete="off"
            spellCheck={false}
            className="border-0 pl-0.5 shadow-none focus-visible:ring-0"
          />
        </div>
        <Button
          type="button"
          onClick={salvar}
          disabled={!podeSalvar(situacao) || conferindo || salvando}
        >
          {salvando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Usar este endereço
        </Button>
      </div>

      {texto.trim() && endereco && endereco !== texto.trim() ? (
        <p className="text-xs text-muted-foreground">
          Vai ficar assim: <span className="font-mono">{`${ENDERECO_BASE}/${endereco}`}</span>
        </p>
      ) : null}

      <div className="min-h-5 text-sm" aria-live="polite">
        {conferindo ? (
          <span className="flex items-center gap-1 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Conferindo…
          </span>
        ) : falha ? (
          <span className="text-destructive">{falha}</span>
        ) : aviso ? (
          <span
            className={`flex items-center gap-1 ${
              aviso.tom === "ok"
                ? "text-green-600"
                : aviso.tom === "erro"
                  ? "text-destructive"
                  : "text-muted-foreground"
            }`}
          >
            {aviso.tom === "ok" ? (
              <CheckCircle2 className="h-4 w-4" />
            ) : aviso.tom === "erro" ? (
              <XCircle className="h-4 w-4" />
            ) : null}
            {aviso.texto}
          </span>
        ) : null}
      </div>

      {sugestoes.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-muted-foreground">Livres:</span>
          {sugestoes.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setTexto(s)}
              className="rounded-full border px-2 py-0.5 font-mono hover:bg-muted"
            >
              {s}
            </button>
          ))}
        </div>
      ) : null}

      <p className="text-[11px] text-muted-foreground">
        Use letras, números e traço. Quem cadastrar um nome primeiro fica com ele. Ao trocar, o link
        antigo e os QR Codes já impressos continuam levando à sua loja.
      </p>
    </div>
  );
}
