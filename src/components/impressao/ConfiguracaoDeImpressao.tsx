/**
 * A aba "Impressão": escolher a impressora, ver a prévia exata, imprimir os
 * testes e copiar o diagnóstico para o suporte.
 *
 * As escolhas ficam neste computador (ver `lib/impressao/perfil.ts`) — cada
 * computador da loja tem a sua impressora.
 */

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Copy, Plus, Printer, Ruler, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ComandaImpressa } from "./ComandaImpressa";
import { usePerfisDeImpressao } from "./usePerfisDeImpressao";
import { PAPEIS, type Papel } from "@/lib/impressao/papel";
import {
  COLUNAS_SUGERIDAS,
  LIMITES,
  MARCAS,
  MAXIMO_DE_PERFIS,
  METODOS,
  type Marca,
  perfilPadrao,
  trocarPapel,
} from "@/lib/impressao/perfil";
import { comandaDeExemplo, testeDeAlinhamento } from "@/lib/impressao/exemplos";
import { validarLinhas } from "@/lib/impressao/validar";
import { diagnosticoEmTexto, montarDiagnostico } from "@/lib/impressao/diagnostico";
import { imprimirDocumento } from "@/lib/impressao/transporte";
import { paraHtml } from "@/lib/impressao/renderizar";

/**
 * Campo de número que só grava ao sair do campo (ou com Enter).
 *
 * Gravando a cada tecla, quem digitava "48" passava por "4" — abaixo do
 * mínimo — e o campo pulava sozinho para 24 antes do "8" chegar.
 */
function CampoNumerico({
  id,
  valor,
  min,
  max,
  passo,
  aoMudar,
}: {
  id: string;
  valor: number;
  min: number;
  max: number;
  passo?: number;
  aoMudar: (n: number) => void;
}) {
  const [rascunho, setRascunho] = useState(String(valor));
  useEffect(() => setRascunho(String(valor)), [valor]);
  const confirmar = () => {
    const n = Number(rascunho.replace(",", "."));
    if (Number.isFinite(n) && rascunho.trim() !== "") {
      const dentro = Math.min(max, Math.max(min, n));
      aoMudar(dentro);
      setRascunho(String(dentro));
    } else {
      setRascunho(String(valor));
    }
  };
  return (
    <Input
      id={id}
      type="number"
      inputMode="decimal"
      min={min}
      max={max}
      step={passo}
      value={rascunho}
      onChange={(ev) => setRascunho(ev.target.value)}
      onBlur={confirmar}
      onKeyDown={(ev) => {
        if (ev.key === "Enter") confirmar();
      }}
    />
  );
}

const ESPACAMENTOS = [
  { valor: 1, rotulo: "Compacto" },
  { valor: 1.15, rotulo: "Normal" },
  { valor: 1.3, rotulo: "Folgado" },
  { valor: 1.5, rotulo: "Bem folgado" },
];

const SELECT =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function ConfiguracaoDeImpressao({
  lojaId,
  logoUrl,
  nomeDaLoja,
}: {
  lojaId: string;
  logoUrl?: string | null;
  nomeDaLoja?: string;
}) {
  const { dados, perfil, gravar, alterarPerfil } = usePerfisDeImpressao(lojaId);
  const [modo, setModo] = useState<"exemplo" | "alinhamento">("exemplo");

  const linhas = useMemo(() => {
    if (!perfil) return [];
    return modo === "alinhamento" ? testeDeAlinhamento(perfil) : comandaDeExemplo(perfil);
  }, [perfil, modo]);

  const avisos = useMemo(() => (perfil ? validarLinhas(linhas, perfil) : []), [linhas, perfil]);
  const diagnostico = useMemo(
    () =>
      perfil
        ? montarDiagnostico({
            perfil,
            linhas,
            avisos,
            navegador: typeof navigator !== "undefined" ? navigator.userAgent : "",
          })
        : null,
    [perfil, linhas, avisos],
  );

  if (!dados || !perfil || !diagnostico) {
    return <div className="p-6 text-sm text-muted-foreground">Carregando impressão…</div>;
  }

  async function imprimir(qual: "exemplo" | "alinhamento") {
    if (!perfil) return;
    setModo(qual);
    // A página impressa é montada das MESMAS linhas e do MESMO estilo da
    // prévia — num quadro separado, para os menus e margens desta tela não
    // empurrarem a comanda para fora do papel.
    const linhasDoTeste =
      qual === "alinhamento" ? testeDeAlinhamento(perfil) : comandaDeExemplo(perfil);
    const r = await imprimirDocumento(
      paraHtml(linhasDoTeste, perfil, {
        titulo: qual === "alinhamento" ? "Teste de alinhamento" : "Comanda de exemplo",
        logoUrl: qual === "exemplo" ? logoUrl : null,
      }),
    );
    if (!r.ok) toast.error(r.mensagem);
  }

  function novoPerfil() {
    if (!dados) return;
    if (dados.perfis.length >= MAXIMO_DE_PERFIS) {
      toast.error(`No máximo ${MAXIMO_DE_PERFIS} impressoras por loja neste computador.`);
      return;
    }
    const p = perfilPadrao("80", `Impressora ${dados.perfis.length + 1}`);
    gravar({ ativoId: p.id, perfis: [...dados.perfis, p] });
  }

  function excluirPerfil() {
    if (!dados || !perfil || dados.perfis.length <= 1) return;
    const resto = dados.perfis.filter((p) => p.id !== perfil.id);
    gravar({ ativoId: resto[0].id, perfis: resto });
  }

  async function copiarDiagnostico() {
    if (!diagnostico) return;
    try {
      await navigator.clipboard.writeText(diagnosticoEmTexto(diagnostico));
      toast.success("Diagnóstico copiado. Cole na conversa com o suporte.");
    } catch {
      toast.error("Não foi possível copiar. Selecione o texto e copie à mão.");
    }
  }

  const sugeridas = COLUNAS_SUGERIDAS[perfil.papel].opcoes;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_auto]">
      <div className="space-y-6 min-w-0">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Printer className="h-4 w-4 text-primary" /> Impressora deste computador
            </CardTitle>
            <CardDescription>
              As escolhas valem para este computador e esta loja. Cada computador pode ter uma
              impressora diferente.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2 items-end">
              <div className="space-y-2">
                <Label htmlFor="perfil-ativo">Impressora</Label>
                <select
                  id="perfil-ativo"
                  className={SELECT}
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
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={novoPerfil}>
                  <Plus className="h-4 w-4" /> Nova
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={excluirPerfil}
                  disabled={dados.perfis.length <= 1}
                  aria-label="Excluir esta impressora"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="perfil-nome">Nome (para você reconhecer)</Label>
                <Input
                  id="perfil-nome"
                  value={perfil.nome}
                  maxLength={40}
                  onChange={(ev) => alterarPerfil({ nome: ev.target.value })}
                  placeholder="Ex.: Caixa, Cozinha"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="perfil-marca">Marca da impressora</Label>
                <select
                  id="perfil-marca"
                  className={SELECT}
                  value={perfil.marca}
                  onChange={(ev) => alterarPerfil({ marca: ev.target.value as Marca })}
                >
                  {MARCAS.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.rotulo}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground">
                  Só para o diagnóstico e o suporte. O navegador não informa o modelo ligado, então
                  o sistema não muda nada sozinho pela marca.
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Papel</Label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {PAPEIS.map((p) => (
                  <Button
                    key={p.id}
                    type="button"
                    variant={perfil.papel === p.id ? "default" : "outline"}
                    aria-pressed={perfil.papel === p.id}
                    onClick={() =>
                      gravar({
                        ...dados,
                        perfis: dados.perfis.map((x) =>
                          x.id === perfil.id ? trocarPapel(x, p.id as Papel) : x,
                        ),
                      })
                    }
                  >
                    {p.rotulo}
                  </Button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                {PAPEIS.find((p) => p.id === perfil.papel)?.ajuda}
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="perfil-colunas">Letras por linha</Label>
                <CampoNumerico
                  id="perfil-colunas"
                  min={LIMITES.colunas.min}
                  max={LIMITES.colunas.max}
                  valor={perfil.colunas}
                  aoMudar={(n) => alterarPerfil({ colunas: n })}
                />
                <div className="flex flex-wrap gap-1">
                  {sugeridas.map((n) => (
                    <Button
                      key={n}
                      type="button"
                      size="sm"
                      variant={perfil.colunas === n ? "default" : "outline"}
                      onClick={() => alterarPerfil({ colunas: n })}
                    >
                      {n}
                    </Button>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  Comum: 32 na bobina de 58 mm e 48 na de 80 mm. Confirme com o teste de
                  alinhamento.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="perfil-margem">Margem lateral (mm)</Label>
                <CampoNumerico
                  id="perfil-margem"
                  passo={0.5}
                  min={LIMITES.margemMm.min}
                  max={LIMITES.margemMm.max}
                  valor={perfil.margemMm}
                  aoMudar={(n) => alterarPerfil({ margemMm: n })}
                />
                <Label htmlFor="perfil-espacamento" className="pt-2 block">
                  Espaço entre linhas
                </Label>
                <select
                  id="perfil-espacamento"
                  className={SELECT}
                  value={String(perfil.espacamento)}
                  onChange={(ev) => alterarPerfil({ espacamento: Number(ev.target.value) })}
                >
                  {ESPACAMENTOS.map((e) => (
                    <option key={e.valor} value={String(e.valor)}>
                      {e.rotulo}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="perfil-final">Linhas em branco no fim</Label>
                <CampoNumerico
                  id="perfil-final"
                  min={LIMITES.linhasNoFinal.min}
                  max={LIMITES.linhasNoFinal.max}
                  valor={perfil.linhasNoFinal}
                  aoMudar={(n) => alterarPerfil({ linhasNoFinal: n })}
                />
                <p className="text-xs text-muted-foreground">
                  Se o corte do papel pega as últimas linhas, aumente.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="perfil-metodo">Como imprime</Label>
                <select
                  id="perfil-metodo"
                  className={SELECT}
                  value={perfil.metodo}
                  onChange={() => undefined}
                >
                  {METODOS.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.rotulo}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground">
                  {METODOS.find((m) => m.id === perfil.metodo)?.ajuda}
                </p>
              </div>
            </div>

            <div className="space-y-3 rounded-md border p-3">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <Label htmlFor="perfil-acentos">Tirar os acentos</Label>
                  <p className="text-xs text-muted-foreground">
                    Ligue se a comanda sai com símbolos estranhos no lugar de “ç”, “ã”, “é”. Isso
                    acontece com impressora instalada como “Somente texto” no Windows.
                  </p>
                </div>
                <Switch
                  id="perfil-acentos"
                  checked={!perfil.acentos}
                  onCheckedChange={(v) => alterarPerfil({ acentos: !v })}
                />
              </div>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <Label htmlFor="perfil-logo">Logo da loja no topo</Label>
                  <p className="text-xs text-muted-foreground">
                    Impressora “Somente texto” não imprime imagem — desligue se sobrar um espaço em
                    branco no topo.
                  </p>
                </div>
                <Switch
                  id="perfil-logo"
                  checked={perfil.mostrarLogo}
                  onCheckedChange={(v) => alterarPerfil({ mostrarLogo: v })}
                />
              </div>
            </div>

            <p className="text-xs text-muted-foreground">
              Corte automático do papel e abertura da gaveta dependem de envio direto para a
              impressora, que ainda não existe neste sistema. Pelo navegador, quem corta é o driver:
              no Windows, abra “Preferências de impressão” da impressora e ligue o corte ao fim do
              documento.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Testes e diagnóstico</CardTitle>
            <CardDescription>
              Imprima o teste de alinhamento primeiro: ele mostra no papel se as letras por linha
              estão certas.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={() => imprimir("alinhamento")}>
                <Ruler className="h-4 w-4" /> Imprimir teste de alinhamento
              </Button>
              <Button type="button" variant="outline" onClick={() => imprimir("exemplo")}>
                <Printer className="h-4 w-4" /> Imprimir comanda de exemplo
              </Button>
            </div>

            <div className="rounded-md bg-muted/50 p-3 text-sm space-y-1">
              <div>
                <span className="font-semibold">Status:</span> {diagnostico.integracao}
              </div>
              <div>
                <span className="font-semibold">Letra:</span>{" "}
                {String(diagnostico.letraMm).replace(".", ",")} mm · {diagnostico.colunas} letras em{" "}
                {String(diagnostico.larguraUtilMm).replace(".", ",")} mm
                {perfil.papel === "auto" ? " (no automático, ajusta à folha na hora)" : ""}
              </div>
              {avisos.length === 0 ? (
                <div className="text-emerald-700 dark:text-emerald-400">
                  Nenhum problema encontrado.
                </div>
              ) : (
                <ul className="list-disc pl-5">
                  {avisos.map((a) => (
                    <li key={a.codigo} className={a.nivel === "erro" ? "text-destructive" : ""}>
                      {a.mensagem}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <Button type="button" variant="outline" size="sm" onClick={copiarDiagnostico}>
              <Copy className="h-4 w-4" /> Copiar diagnóstico para o suporte
            </Button>
            <p className="text-xs text-muted-foreground">
              O diagnóstico não leva nome, telefone nem endereço de cliente — só como a impressão
              está configurada.
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-2 lg:sticky lg:top-4 self-start">
        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            variant={modo === "exemplo" ? "default" : "outline"}
            onClick={() => setModo("exemplo")}
          >
            Comanda
          </Button>
          <Button
            type="button"
            size="sm"
            variant={modo === "alinhamento" ? "default" : "outline"}
            onClick={() => setModo("alinhamento")}
          >
            Alinhamento
          </Button>
        </div>
        <div className="overflow-x-auto rounded-md bg-muted p-3">
          <ComandaImpressa
            imprimivel={false}
            linhas={linhas}
            perfil={perfil}
            logoUrl={modo === "exemplo" ? logoUrl : null}
            nomeDaLoja={nomeDaLoja}
          />
        </div>
        <p className="text-xs text-muted-foreground max-w-[80mm]">
          Prévia em tamanho real: é este mesmo bloco que vai para a impressora.
        </p>
      </div>
    </div>
  );
}
