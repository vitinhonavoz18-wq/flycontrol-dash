import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { JanelaConversa } from "./JanelaConversa";
import { ListaConversas } from "./ListaConversas";
import { GravadorDeAudio } from "./GravadorDeAudio";
import type { ConversaCrm, MensagemCrm } from "@/lib/crm/crm.functions";

/**
 * A conversa do jeito que o atendente usa: ver a mensagem que não saiu e
 * mandar de novo, ouvir o áudio antes de mandar, achar a conversa certa.
 */

beforeEach(() => {
  // jsdom não tem rolagem de verdade.
  Element.prototype.scrollIntoView = vi.fn();
});

const conversa: ConversaCrm = {
  id: "c1",
  customer_id: "k1",
  status: "open",
  assigned_to: null,
  last_message_at: "2026-10-22T10:00:00Z",
  last_message_preview: "oi",
  unread_count: 0,
  contato: {
    id: "k1",
    name: "Maria Teste",
    phone_e164: "5571999990000",
    avatar_url: null,
    orders_count: 3,
    total_spent_cents: 12345,
    last_order_at: null,
    marketing_opt_in: false,
    tags: [],
    notes: null,
  },
};

function mensagem(extra: Partial<MensagemCrm>): MensagemCrm {
  return {
    id: "m1",
    direction: "out",
    sent_by: "eu",
    origin: "painel",
    body: "Seu pedido saiu",
    media_url: null,
    media_type: null,
    status: "sent",
    error_message: null,
    created_at: "2026-10-22T10:00:00Z",
    ...extra,
  };
}

function janela(props: Partial<Parameters<typeof JanelaConversa>[0]> = {}) {
  return render(
    <JanelaConversa
      conversa={conversa}
      mensagens={[]}
      carregando={false}
      enviando={false}
      meuUserId="eu"
      onEnviar={vi.fn(async () => undefined)}
      onMudarStatus={vi.fn()}
      onCorrigirNome={vi.fn()}
      pedido={null}
      onCancelarPedido={vi.fn(async () => undefined)}
      {...props}
    />,
  );
}

describe("estados de envio", () => {
  it("mensagem aceita pelo WhatsApp mostra ✓ 'enviada' — não promete 'entregue'", () => {
    janela({ mensagens: [mensagem({ status: "sent" })] });
    expect(screen.getByLabelText("enviada")).toBeInTheDocument();
    expect(screen.queryByLabelText("entregue")).not.toBeInTheDocument();
  });

  it("na fila e enviando têm marcas diferentes", () => {
    janela({
      mensagens: [
        mensagem({ id: "a", status: "queued" }),
        mensagem({ id: "b", status: "sending", created_at: "2026-10-22T10:01:00Z" }),
      ],
    });
    expect(screen.getByLabelText("na fila")).toBeInTheDocument();
    expect(screen.getByLabelText("enviando")).toBeInTheDocument();
  });

  it("mensagem que falhou mostra o motivo e 'tentar de novo'", async () => {
    const onReenviar = vi.fn(async () => undefined);
    janela({
      mensagens: [mensagem({ status: "failed", error_message: "numero invalido" })],
      onReenviar,
    });
    expect(screen.getByText("numero invalido")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Tentar de novo/ }));
    await waitFor(() => expect(onReenviar).toHaveBeenCalledWith("m1"));
  });

  it("mensagem do cliente nunca ganha 'tentar de novo'", () => {
    janela({
      mensagens: [mensagem({ direction: "in", sent_by: null, status: "failed" })],
      onReenviar: vi.fn(async () => undefined),
    });
    expect(screen.queryByRole("button", { name: /Tentar de novo/ })).not.toBeInTheDocument();
  });
});

describe("histórico", () => {
  it("oferece carregar as mensagens anteriores quando existem", async () => {
    const onCarregarAntigas = vi.fn(async () => undefined);
    janela({ mensagens: [mensagem({})], temMaisAntigas: true, onCarregarAntigas });
    fireEvent.click(screen.getByRole("button", { name: "Carregar mensagens anteriores" }));
    await waitFor(() => expect(onCarregarAntigas).toHaveBeenCalled());
  });

  it("áudio do cliente aparece como áudio (não como balão vazio)", () => {
    janela({
      mensagens: [
        mensagem({
          direction: "in",
          sent_by: null,
          body: null,
          media_type: "audio",
          media_pendente: true,
        }),
      ],
      obterMidia: vi.fn(),
    });
    expect(screen.getByRole("button", { name: "Tocar áudio" })).toBeInTheDocument();
  });
});

describe("ficha do cliente", () => {
  it("o botão da ficha abre a ficha", () => {
    const onAbrirFicha = vi.fn();
    janela({ onAbrirFicha });
    fireEvent.click(screen.getByRole("button", { name: "Ficha do cliente" }));
    expect(onAbrirFicha).toHaveBeenCalled();
  });
});

describe("lista de conversas", () => {
  it("os filtros pedem a lista certa", () => {
    const onFiltro = vi.fn();
    render(
      <ListaConversas
        conversas={[conversa]}
        carregando={false}
        selecionada={null}
        busca=""
        onBusca={vi.fn()}
        onSelecionar={vi.fn()}
        onNova={vi.fn()}
        filtro="todas"
        onFiltro={onFiltro}
      />,
    );
    fireEvent.click(screen.getByRole("tab", { name: "Não lidas" }));
    expect(onFiltro).toHaveBeenCalledWith("nao_lidas");
  });

  it("'carregar mais' aparece quando há mais conversas", () => {
    const onCarregarMais = vi.fn();
    render(
      <ListaConversas
        conversas={[conversa]}
        carregando={false}
        selecionada={null}
        busca=""
        onBusca={vi.fn()}
        onSelecionar={vi.fn()}
        onNova={vi.fn()}
        temMais
        onCarregarMais={onCarregarMais}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Carregar mais conversas" }));
    expect(onCarregarMais).toHaveBeenCalled();
  });

  it("busca sem resultado diz 'nada encontrado', não 'nenhuma conversa ainda'", () => {
    render(
      <ListaConversas
        conversas={[]}
        carregando={false}
        selecionada={null}
        busca="joão"
        onBusca={vi.fn()}
        onSelecionar={vi.fn()}
        onNova={vi.fn()}
      />,
    );
    expect(screen.getByText("Nada encontrado")).toBeInTheDocument();
  });
});

describe("gravar áudio", () => {
  const original = {
    MediaRecorder: (globalThis as Record<string, unknown>).MediaRecorder,
    mediaDevices: navigator.mediaDevices,
  };
  let paradas = 0;

  class GravadorFalso {
    static isTypeSupported = (m: string) => m === "audio/mp4;codecs=mp4a.40.2";
    ondataavailable: ((e: { data: Blob }) => void) | null = null;
    onstop: (() => void) | null = null;
    start() {}
    stop() {
      this.ondataavailable?.({ data: new Blob(["som"], { type: "audio/mp4" }) });
      this.onstop?.();
    }
  }

  beforeEach(() => {
    paradas = 0;
    (globalThis as Record<string, unknown>).MediaRecorder = GravadorFalso;
  });

  afterEach(() => {
    (globalThis as Record<string, unknown>).MediaRecorder = original.MediaRecorder;
    Object.defineProperty(navigator, "mediaDevices", {
      value: original.mediaDevices,
      configurable: true,
    });
  });

  function microfone(permitido: boolean) {
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: vi.fn(async () => {
          if (!permitido) throw new Error("NotAllowedError");
          return { getTracks: () => [{ stop: () => paradas++ }] };
        }),
      },
    });
  }

  it("sem permissão do microfone, explica o que fazer", async () => {
    microfone(false);
    const onErro = vi.fn();
    render(<GravadorDeAudio desabilitado={false} onPronto={vi.fn()} onErro={onErro} />);
    fireEvent.click(screen.getByRole("button", { name: "Gravar um áudio" }));
    await waitFor(() =>
      expect(onErro).toHaveBeenCalledWith(
        "Não consegui usar o microfone. Verifique a permissão do navegador.",
      ),
    );
  });

  it("grava, mostra o tempo, termina e entrega o áudio em formato que o WhatsApp aceita", async () => {
    microfone(true);
    const onPronto = vi.fn();
    render(<GravadorDeAudio desabilitado={false} onPronto={onPronto} onErro={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Gravar um áudio" }));
    expect(await screen.findByText("0:00")).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Terminar a gravação" }));
    });
    await waitFor(() => expect(onPronto).toHaveBeenCalled());
    const arquivo = onPronto.mock.calls[0][0];
    expect(arquivo.mime).toBe("audio/mp4");
    expect(arquivo.nome).toMatch(/\.m4a$/);
    // O microfone é desligado no fim — a luz do navegador apaga.
    expect(paradas).toBe(1);
  });

  it("jogar fora não entrega nada e desliga o microfone", async () => {
    microfone(true);
    const onPronto = vi.fn();
    render(<GravadorDeAudio desabilitado={false} onPronto={onPronto} onErro={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Gravar um áudio" }));
    await screen.findByText("0:00");
    fireEvent.click(screen.getByRole("button", { name: "Jogar a gravação fora" }));
    expect(onPronto).not.toHaveBeenCalled();
    expect(paradas).toBe(1);
  });

  it("o áudio gravado aparece com prévia para ouvir antes de mandar, e só sai no enviar", async () => {
    microfone(true);
    const onEnviar = vi.fn(async () => undefined);
    janela({ onEnviar });
    fireEvent.click(screen.getByRole("button", { name: "Gravar um áudio" }));
    await screen.findByText("0:00");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Terminar a gravação" }));
    });
    expect(await screen.findByText("Áudio gravado")).toBeInTheDocument();
    expect(screen.getByTestId("player-audio")).toBeInTheDocument();
    expect(onEnviar).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Enviar mensagem" }));
    await waitFor(() => expect(onEnviar).toHaveBeenCalled());
    const [, arquivo] = onEnviar.mock.calls[0] as unknown as [string, { mime: string }];
    expect(arquivo.mime).toBe("audio/mp4");
  });
});
