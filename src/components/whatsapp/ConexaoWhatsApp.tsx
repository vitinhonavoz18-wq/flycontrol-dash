import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Loader2,
  Smartphone,
  QrCode,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Power,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatPhoneForDisplay } from "@/lib/marketing/phone";
import {
  estadoConexaoWhatsApp,
  iniciarConexaoWhatsApp,
  desconectarWhatsApp,
  type EstadoConexao,
} from "@/lib/whatsapp/conexao.functions";

/**
 * A tela onde o lojista liga o WhatsApp dele sozinho.
 *
 * POR QUE ELA EXISTE
 *
 * O WhatsApp derruba a conexão de tempos em tempos — troca de celular, dias
 * sem internet, ou simplesmente porque sim. Antes, quando caía, o restaurante
 * ficava mudo até alguém do suporte ler um QR Code por ele. Num sábado à
 * noite isso é cliente esperando resposta que não vem.
 *
 * Aqui é igual ao WhatsApp Web que ele já conhece: aponta a câmera e volta.
 *
 * DOIS CAMINHOS, DE PROPÓSITO
 *
 * Nem todo mundo consegue apontar a câmera do celular para a tela do próprio
 * computador — e quem usa o painel PELO celular não consegue de jeito nenhum,
 * porque o aparelho é o mesmo. Para esses, existe o código de 8 letras.
 *
 * O QR CODE VIVE POUCO E SE RENOVA SOZINHO. Sem a renovação automática, o
 * lojista aponta a câmera para uma figurinha vencida, o WhatsApp diz "código
 * inválido", e ele conclui que o sistema está quebrado.
 */

const RENOVAR_QR_MS = 30_000;
const CONFERIR_STATUS_MS = 4_000;

const TEXTOS: Record<EstadoConexao["status"], { titulo: string; explicacao: string; cor: string }> =
  {
    connected: {
      titulo: "WhatsApp conectado",
      explicacao: "As mensagens dos seus clientes chegam aqui e as respostas saem normalmente.",
      cor: "text-emerald-600 dark:text-emerald-400",
    },
    connecting: {
      titulo: "Quase lá…",
      explicacao: "Leia o código abaixo com o celular que tem o WhatsApp da loja.",
      cor: "text-amber-600 dark:text-amber-400",
    },
    disconnected: {
      titulo: "WhatsApp desconectado",
      explicacao:
        "Nada se perde: o que você escrever fica guardado e sai assim que a conexão voltar.",
      cor: "text-muted-foreground",
    },
    error: {
      titulo: "Problema na conexão",
      explicacao: "O WhatsApp recusou a ligação. Leia o código de novo para reconectar.",
      cor: "text-destructive",
    },
  };

export function ConexaoWhatsApp({ tenantId }: { tenantId: string }) {
  const buscarEstado = useServerFn(estadoConexaoWhatsApp);
  const iniciar = useServerFn(iniciarConexaoWhatsApp);
  const desconectar = useServerFn(desconectarWhatsApp);

  const [estado, setEstado] = useState<EstadoConexao | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [qrcode, setQrcode] = useState<string | null>(null);
  const [paircode, setPaircode] = useState<string | null>(null);
  const [pedindo, setPedindo] = useState(false);
  const [modoCodigo, setModoCodigo] = useState(false);
  const [telefone, setTelefone] = useState("");
  const [avisoSemFluxo, setAvisoSemFluxo] = useState(false);
  const [desconectando, setDesconectando] = useState(false);

  // Enquanto o QR estiver na tela, conferimos o status de poucos em poucos
  // segundos. É assim que a tela troca sozinha para "conectado" no instante em
  // que ele aponta a câmera, sem ele precisar clicar em nada.
  const esperandoLeitura = useRef(false);
  esperandoLeitura.current = Boolean(qrcode || paircode);

  const conferir = useCallback(
    async (silencioso = false) => {
      if (!silencioso) setCarregando(true);
      try {
        const r = await buscarEstado({ data: { tenantId } });
        setEstado(r);
        if (r.status === "connected") {
          // Conectou: a figurinha não serve mais para nada e some da tela.
          setQrcode(null);
          setPaircode(null);
        }
        return r;
      } catch (e: unknown) {
        if (!silencioso) {
          toast.error(e instanceof Error ? e.message : "Não consegui ler o estado da conexão.");
        }
        return null;
      } finally {
        if (!silencioso) setCarregando(false);
      }
    },
    [buscarEstado, tenantId],
  );

  useEffect(() => {
    void conferir();
  }, [conferir]);

  // Conferência periódica enquanto o código está exposto.
  useEffect(() => {
    if (!qrcode && !paircode) return;
    const t = setInterval(() => void conferir(true), CONFERIR_STATUS_MS);
    return () => clearInterval(t);
  }, [qrcode, paircode, conferir]);

  const pedirCodigo = useCallback(
    async (comTelefone?: string) => {
      setPedindo(true);
      try {
        const r = await iniciar({ data: { tenantId, telefone: comTelefone } });
        setAvisoSemFluxo(r.avisoSemFluxo);
        if (r.jaConectado) {
          toast.success("O WhatsApp já está conectado.");
          await conferir(true);
          return;
        }
        setQrcode(r.qrcode);
        setPaircode(r.paircode);
        if (!r.qrcode && !r.paircode) {
          toast.error("O WhatsApp não devolveu o código. Tente de novo em alguns segundos.");
        }
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : "Não consegui pedir o código.");
      } finally {
        setPedindo(false);
      }
    },
    [iniciar, tenantId, conferir],
  );

  // A renovação automática do QR Code.
  useEffect(() => {
    if (!qrcode) return;
    const t = setTimeout(() => {
      if (esperandoLeitura.current) void pedirCodigo();
    }, RENOVAR_QR_MS);
    return () => clearTimeout(t);
  }, [qrcode, pedirCodigo]);

  async function aoDesconectar() {
    setDesconectando(true);
    try {
      await desconectar({ data: { tenantId } });
      toast.success("WhatsApp desconectado. Suas conversas continuam guardadas.");
      setQrcode(null);
      setPaircode(null);
      await conferir(true);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Não consegui desconectar.");
    } finally {
      setDesconectando(false);
    }
  }

  if (carregando && !estado) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const status = estado?.status ?? "disconnected";
  const t = TEXTOS[status];
  const conectado = status === "connected";

  return (
    <div className="space-y-4">
      {estado && !estado.configurado && (
        <Card className="border-amber-500/40 bg-amber-500/5">
          <CardContent className="flex items-start gap-3 p-4 text-sm">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
            <p>
              A ligação com o WhatsApp ainda não foi configurada neste sistema. Fale com o suporte —
              não é nada que você consiga resolver desta tela.
            </p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="space-y-4 p-5 md:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              {conectado ? (
                <CheckCircle2 className={`mt-0.5 h-6 w-6 ${t.cor}`} aria-hidden="true" />
              ) : (
                <Smartphone className={`mt-0.5 h-6 w-6 ${t.cor}`} aria-hidden="true" />
              )}
              <div>
                <h3 className={`font-semibold ${t.cor}`}>{t.titulo}</h3>
                <p className="mt-1 max-w-md text-sm text-muted-foreground">{t.explicacao}</p>
                {conectado && estado?.telefone && (
                  <p className="mt-1 text-sm font-medium">
                    {formatPhoneForDisplay(estado.telefone)}
                    {estado.nomePerfil ? ` — ${estado.nomePerfil}` : ""}
                  </p>
                )}
              </div>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => void conferir()}
              disabled={carregando}
            >
              <RefreshCw className={`mr-1 h-3.5 w-3.5 ${carregando ? "animate-spin" : ""}`} />
              Atualizar
            </Button>
          </div>

          {estado?.mensagem && (
            <p className="rounded-md border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
              {estado.mensagem}
            </p>
          )}

          {estado?.avisoWebhook && (
            <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-900 dark:text-amber-200">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <p>
                O aparelho está conectado, mas as mensagens ainda não estão sendo repassadas para o
                Chat. Avise o suporte: falta um ajuste do lado de cá, não do seu.
              </p>
            </div>
          )}

          {/* ── O código, quando está esperando leitura ─────────────────── */}
          {(qrcode || paircode) && !conectado && (
            <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border p-5">
              {qrcode && (
                <>
                  <img
                    src={qrcode.startsWith("data:") ? qrcode : `data:image/png;base64,${qrcode}`}
                    alt="QR Code para conectar o WhatsApp"
                    className="h-56 w-56 rounded-md bg-white p-2"
                  />
                  <ol className="max-w-sm list-decimal space-y-1 pl-5 text-xs text-muted-foreground">
                    <li>Abra o WhatsApp no celular da loja</li>
                    <li>
                      Toque em <strong>Configurações</strong> →{" "}
                      <strong>Aparelhos conectados</strong>
                    </li>
                    <li>
                      Toque em <strong>Conectar um aparelho</strong> e aponte a câmera para o código
                      acima
                    </li>
                  </ol>
                </>
              )}

              {paircode && (
                <div className="text-center">
                  <p className="text-xs text-muted-foreground">Digite este código no celular:</p>
                  <p className="mt-1 font-mono text-2xl font-bold tracking-widest">{paircode}</p>
                </div>
              )}

              <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                Esperando você ler o código. Ele se renova sozinho a cada 30 segundos.
              </p>
            </div>
          )}

          {/* ── Os botões ───────────────────────────────────────────────── */}
          <div className="flex flex-wrap gap-2 border-t pt-4">
            {!conectado && (
              <>
                <Button
                  onClick={() => void pedirCodigo()}
                  disabled={pedindo || !estado?.configurado}
                >
                  {pedindo ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <QrCode className="mr-2 h-4 w-4" />
                  )}
                  {qrcode ? "Gerar outro código" : "Conectar WhatsApp"}
                </Button>

                <Button
                  variant="ghost"
                  onClick={() => setModoCodigo((v) => !v)}
                  disabled={!estado?.configurado}
                >
                  Não consigo ler o QR Code
                </Button>
              </>
            )}

            {conectado && (
              <Button
                variant="outline"
                onClick={() => void aoDesconectar()}
                disabled={desconectando}
              >
                {desconectando ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Power className="mr-2 h-4 w-4" />
                )}
                Desconectar
              </Button>
            )}
          </div>

          {/* O caminho para quem usa o painel pelo próprio celular: não dá para
              apontar a câmera do aparelho para a tela dele mesmo. */}
          {modoCodigo && !conectado && (
            <div className="space-y-2 rounded-md border border-border p-4">
              <Label htmlFor="tel-pareamento" className="text-sm">
                Número do WhatsApp da loja, com DDD
              </Label>
              <div className="flex flex-wrap gap-2">
                <Input
                  id="tel-pareamento"
                  value={telefone}
                  onChange={(e) => setTelefone(e.target.value)}
                  placeholder="(71) 99999-9999"
                  inputMode="tel"
                  className="max-w-xs"
                />
                <Button
                  variant="secondary"
                  onClick={() => void pedirCodigo(telefone)}
                  disabled={pedindo || telefone.replace(/\D/g, "").length < 10}
                >
                  Receber código de 8 letras
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Você digita esse código no próprio WhatsApp, em Aparelhos conectados → Conectar com
                número de telefone. Serve para quando a câmera não é uma opção.
              </p>
            </div>
          )}

          {avisoSemFluxo && (
            <p className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-900 dark:text-amber-200">
              Atenção: a conexão vai funcionar, mas as mensagens ainda não chegam ao Chat porque o
              fluxo desta loja não foi cadastrado. Avise o suporte.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
