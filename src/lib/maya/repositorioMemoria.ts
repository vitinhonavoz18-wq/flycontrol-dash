import type { Canal } from "./prompt";
import type {
  ConversaMaya,
  EventoDeConversa,
  MensagemMaya,
  RepositorioMaya,
  TurnoMaya,
} from "./orquestrador";

/**
 * O banco "de mentira" da MAYA, guardado na memória.
 *
 * Usado nos testes e no simulador local. Segue as MESMAS regras de unicidade
 * do banco de verdade (um contato por canal, um external_id por conversa, um
 * turno por última mensagem, fechar turno só se aberto) — senão o teste
 * passaria aqui e falharia em produção.
 */
export function criarRepositorioEmMemoria(relogio: () => Date = () => new Date()) {
  let seq = 0;
  const novoId = (p: string) => `${p}-${++seq}`;
  const conversas: ConversaMaya[] = [];
  const mensagens: (MensagemMaya & { externalId: string | null })[] = [];
  const turnos: (TurnoMaya & Record<string, unknown>)[] = [];
  const eventos: {
    conversaId: string;
    tipo: EventoDeConversa;
    detalhe: Record<string, unknown>;
  }[] = [];

  const repo: RepositorioMaya = {
    async obterOuCriarConversa(canal: Canal, contato, nome) {
      const achada = conversas.find((c) => c.canal === canal && c.contato === contato);
      if (achada) return { ...achada, ficha: { ...achada.ficha } };
      const nova: ConversaMaya = {
        id: novoId("conv"),
        canal,
        contato,
        nome,
        humanoAte: null,
        optOutEm: null,
        apresentouEm: null,
        ficha: {},
      };
      conversas.push(nova);
      return { ...nova, ficha: {} };
    },
    async buscarConversa(id) {
      const c = conversas.find((x) => x.id === id);
      return c ? { ...c, ficha: { ...c.ficha } } : null;
    },
    async atualizarConversa(id, patch) {
      const c = conversas.find((x) => x.id === id);
      if (c) Object.assign(c, patch);
    },
    async registrarMensagem(m) {
      if (
        m.externalId &&
        mensagens.some((x) => x.conversaId === m.conversaId && x.externalId === m.externalId)
      ) {
        return { id: "", duplicada: true };
      }
      const id = novoId("msg");
      mensagens.push({
        id,
        conversaId: m.conversaId,
        autor: m.autor,
        texto: m.texto,
        externalId: m.externalId,
        turnoId: m.turnoId ?? null,
        criadaEm: relogio(),
      });
      return { id, duplicada: false };
    },
    async buscarMensagem(id) {
      return mensagens.find((m) => m.id === id) ?? null;
    },
    async historico(conversaId, limite) {
      return mensagens.filter((m) => m.conversaId === conversaId).slice(-limite);
    },
    async saidasDaMayaDesde(conversaId, desde) {
      return mensagens.filter(
        (m) => m.conversaId === conversaId && m.autor === "maya" && m.criadaEm >= desde,
      );
    },
    async abrirTurno(t) {
      const existente = turnos.find((x) => x.ultimaMensagemId === t.ultimaMensagemId);
      if (existente) return { turno: existente, jaExistia: true };
      const turno = {
        id: novoId("turno"),
        conversaId: t.conversaId,
        ultimaMensagemId: t.ultimaMensagemId,
        status: "aberto" as const,
        volumes: t.volumes,
        modo: t.modo,
        criadoEm: relogio(),
        versaoPrompt: t.versaoPrompt,
        versaoComercial: t.versaoComercial,
      };
      turnos.push(turno);
      return { turno, jaExistia: false };
    },
    async buscarTurno(id) {
      const t = turnos.find((x) => x.id === id);
      return t ? { ...t } : null;
    },
    async fecharTurno(id, resultado) {
      const t = turnos.find((x) => x.id === id);
      if (!t || t.status !== "aberto") return false;
      Object.assign(t, resultado, { status: "respondido" });
      return true;
    },
    async registrarEvento(conversaId, tipo, detalhe) {
      eventos.push({ conversaId, tipo, detalhe });
    },
  };

  return { repo, conversas, mensagens, turnos, eventos };
}
