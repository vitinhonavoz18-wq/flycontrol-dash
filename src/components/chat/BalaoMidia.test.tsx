import { describe, expect, it, vi, beforeEach } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { BalaoMidia, type MidiaDoBalao } from "./BalaoMidia";
import { PlayerDeAudio } from "./PlayerDeAudio";
import type { ResultadoMidia } from "@/lib/crm/filaDeMidia";

/**
 * O balão do arquivo, do jeito que o atendente usa: clicar, ouvir, ampliar,
 * fechar. Cada teste aqui é um "e se" que já aconteceu ou que aconteceria no
 * primeiro sábado de movimento.
 */

beforeEach(() => {
  // O jsdom não toca som. Fingimos o toca/pausa e avisamos a tela como o
  // navegador de verdade avisaria.
  vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(function (
    this: HTMLMediaElement,
  ) {
    this.dispatchEvent(new Event("play"));
    return Promise.resolve();
  });
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(function (
    this: HTMLMediaElement,
  ) {
    this.dispatchEvent(new Event("pause"));
  });
});

const ok = (url: string, nome: string): ResultadoMidia => ({
  ok: true,
  url,
  caminho: `loja/conv/${nome}`,
  nome,
});

function msg(extra: Partial<MidiaDoBalao>): MidiaDoBalao {
  return { id: "m1", media_url: null, media_type: "image", media_pendente: true, ...extra };
}

describe("foto", () => {
  it("foto que ainda não foi trazida é buscada sozinha e aparece", async () => {
    const obter = vi.fn(async () => ok("https://supa.test/foto.jpg", "foto.jpg"));
    render(<BalaoMidia mensagem={msg({})} claro={false} obterMidia={obter} />);
    expect(screen.getByRole("status", { name: "Carregando foto" })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByAltText("Foto da conversa")).toBeInTheDocument());
    expect(obter).toHaveBeenCalledWith("m1", false);
  });

  it("amplia ao clicar e fecha no X, voltando à conversa", async () => {
    render(
      <BalaoMidia
        mensagem={msg({
          media_url: "https://supa.test/f.jpg",
          media_pendente: false,
          media_nome: "f.jpg",
        })}
        claro={false}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Ampliar foto" }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Baixar imagem" })).toHaveAttribute(
      "href",
      "https://supa.test/f.jpg?download=f.jpg",
    );
    fireEvent.click(screen.getByRole("button", { name: "Fechar" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("fecha com a tecla Esc", async () => {
    render(
      <BalaoMidia
        mensagem={msg({ media_url: "https://supa.test/f.jpg", media_pendente: false })}
        claro={false}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Ampliar foto" }));
    const dialogo = await screen.findByRole("dialog");
    fireEvent.keyDown(dialogo, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("o WhatsApp não tem mais o arquivo: explica e não oferece tentar de novo", async () => {
    const obter = vi.fn(async (): Promise<ResultadoMidia> => ({
      ok: false,
      motivo: "O WhatsApp não tem mais este arquivo.",
      definitivo: true,
    }));
    render(<BalaoMidia mensagem={msg({})} claro={false} obterMidia={obter} />);
    expect(await screen.findByText("O WhatsApp não tem mais este arquivo.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Tentar de novo" })).not.toBeInTheDocument();
  });

  it("falha passageira oferece tentar de novo, e tentar de novo funciona", async () => {
    const obter = vi
      .fn<(id: string, forcar?: boolean) => Promise<ResultadoMidia>>()
      .mockResolvedValueOnce({ ok: false, motivo: "Sem conexão.", definitivo: false })
      .mockResolvedValueOnce(ok("https://supa.test/f.jpg", "f.jpg"));
    render(<BalaoMidia mensagem={msg({})} claro={false} obterMidia={obter} />);
    fireEvent.click(await screen.findByRole("button", { name: "Tentar de novo" }));
    await waitFor(() => expect(screen.getByAltText("Foto da conversa")).toBeInTheDocument());
    expect(obter).toHaveBeenLastCalledWith("m1", true);
  });

  it("endereço vencido: pede um novo UMA vez antes de desistir", async () => {
    const obter = vi.fn(async () => ok("https://supa.test/novo.jpg", "f.jpg"));
    render(
      <BalaoMidia
        mensagem={msg({ media_url: "https://supa.test/vencido.jpg", media_pendente: false })}
        claro={false}
        obterMidia={obter}
      />,
    );
    fireEvent.error(screen.getByAltText("Foto da conversa"));
    await waitFor(() =>
      expect(screen.getByAltText("Foto da conversa")).toHaveAttribute(
        "src",
        "https://supa.test/novo.jpg",
      ),
    );
    expect(obter).toHaveBeenCalledTimes(1);
  });

  it("arquivo que nunca existiu diz 'indisponível', sem balão em branco", () => {
    render(<BalaoMidia mensagem={msg({ media_pendente: false })} claro={false} />);
    expect(screen.getByText(/Foto indisponível/)).toBeInTheDocument();
  });
});

describe("áudio", () => {
  it("áudio pendente: um clique busca e já abre o tocador", async () => {
    const obter = vi.fn(async () => ok("https://supa.test/a.mp3", "audio.mp3"));
    render(<BalaoMidia mensagem={msg({ media_type: "audio" })} claro={false} obterMidia={obter} />);
    // Áudio NÃO é buscado sozinho: ninguém pediu para ouvir ainda.
    expect(obter).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Tocar áudio" }));
    expect(await screen.findByTestId("player-audio")).toBeInTheDocument();
    expect(obter).toHaveBeenCalledTimes(1);
  });
});

describe("PDF", () => {
  it("mostra o nome, abre por cima da conversa e fecha", async () => {
    render(
      <BalaoMidia
        mensagem={msg({
          media_type: "document",
          media_url: "https://supa.test/c.pdf",
          media_nome: "cardapio.pdf",
          media_pendente: false,
        })}
        claro={false}
      />,
    );
    expect(screen.getByText("cardapio.pdf")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Abrir" }));
    expect(await screen.findByTitle("PDF: cardapio.pdf")).toHaveAttribute(
      "src",
      "https://supa.test/c.pdf",
    );
    expect(screen.getByRole("link", { name: "Baixar PDF" })).toHaveAttribute(
      "href",
      "https://supa.test/c.pdf?download=cardapio.pdf",
    );
    fireEvent.click(screen.getByRole("button", { name: "Fechar" }));
    await waitFor(() => expect(screen.queryByTitle("PDF: cardapio.pdf")).not.toBeInTheDocument());
  });

  it("PDF pendente é buscado ao clicar em Abrir", async () => {
    const obter = vi.fn(async () => ok("https://supa.test/d.pdf", "documento-m1.pdf"));
    render(
      <BalaoMidia mensagem={msg({ media_type: "document" })} claro={false} obterMidia={obter} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Abrir" }));
    expect(await screen.findByTitle("PDF: documento-m1.pdf")).toBeInTheDocument();
  });

  it("PDF corrompido é identificado", async () => {
    const obter = vi.fn(async (): Promise<ResultadoMidia> => ({
      ok: false,
      motivo: "O PDF está corrompido ou não é um PDF.",
      definitivo: true,
    }));
    render(
      <BalaoMidia mensagem={msg({ media_type: "document" })} claro={false} obterMidia={obter} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Abrir" }));
    expect(await screen.findByText("O PDF está corrompido ou não é um PDF.")).toBeInTheDocument();
  });
});

describe("o tocador de áudio", () => {
  it("toca, pausa e mostra 'ouvir de novo' no fim", async () => {
    const { container } = render(<PlayerDeAudio src="https://supa.test/a.mp3" />);
    const audio = container.querySelector("audio") as HTMLAudioElement;

    fireEvent.click(screen.getByRole("button", { name: "Tocar áudio" }));
    expect(await screen.findByRole("button", { name: "Pausar áudio" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Pausar áudio" }));
    expect(await screen.findByRole("button", { name: "Tocar áudio" })).toBeInTheDocument();

    act(() => {
      audio.dispatchEvent(new Event("ended"));
    });
    expect(screen.getByRole("button", { name: "Ouvir de novo" })).toBeInTheDocument();
  });

  it("mostra duração e progresso, e troca a velocidade", () => {
    const { container } = render(<PlayerDeAudio src="https://supa.test/a.mp3" />);
    const audio = container.querySelector("audio") as HTMLAudioElement;
    Object.defineProperty(audio, "duration", { value: 65, configurable: true });
    Object.defineProperty(audio, "currentTime", { value: 12, configurable: true, writable: true });
    act(() => {
      audio.dispatchEvent(new Event("loadedmetadata"));
      audio.dispatchEvent(new Event("timeupdate"));
    });
    expect(screen.getByText("0:12 / 1:05")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Velocidade 1x/ }));
    expect(screen.getByRole("button", { name: /Velocidade 1.5x/ })).toBeInTheDocument();
    expect(audio.playbackRate).toBe(1.5);
  });

  it("arquivo que não abre avisa quem está usando", () => {
    const onErro = vi.fn();
    const { container } = render(<PlayerDeAudio src="https://supa.test/x.mp3" onErro={onErro} />);
    fireEvent.error(container.querySelector("audio") as HTMLAudioElement);
    expect(onErro).toHaveBeenCalled();
  });
});
