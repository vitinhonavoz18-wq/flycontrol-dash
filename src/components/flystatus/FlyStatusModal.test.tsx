import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FlyStatusModal } from "./FlyStatusModal";

// O envio real fala com o servidor. Aqui trocamos essa peça por uma dublê,
// para conseguir observar QUANTAS vezes ela é chamada e o que a tela faz com
// cada resposta.
const enviarMock = vi.fn();

vi.mock("@tanstack/react-start", () => ({
  useServerFn: () => enviarMock,
}));

vi.mock("@/lib/flystatus/flystatus.functions", () => ({
  enviarAtualizacaoDeStatus: vi.fn(),
}));

const PADRAO = {
  open: true,
  onOpenChange: vi.fn(),
  kind: "preparando" as const,
  orderId: "aaaaaaaa-0000-0000-0000-000000000001",
  orderNumber: 1042,
  customerName: "Ana Paula",
  customerPhone: "11988887777",
  pizzeria: null,
};

function abrir(props: Partial<typeof PADRAO> = {}) {
  return render(<FlyStatusModal {...PADRAO} {...props} />);
}

beforeEach(() => {
  enviarMock.mockReset();
  PADRAO.onOpenChange.mockReset();
});

describe("popup de atualização do pedido", () => {
  it('não tem mais o botão "Abrir arte"', () => {
    abrir();
    expect(screen.queryByRole("button", { name: /abrir arte/i })).toBeNull();
  });

  it("continua mostrando a prévia da arte", () => {
    // O que foi removido é a AÇÃO de abrir a imagem em outra aba. Ver a arte
    // que vai para o cliente continua sendo o ponto do popup.
    abrir();
    expect(screen.getByAltText("Em Preparo")).toBeTruthy();
  });

  it("mostra a mensagem com o número do pedido no lugar", () => {
    abrir();
    expect(screen.getByText(/Pedido #1042/)).toBeTruthy();
  });

  it("não deixa enviar quando o pedido não tem telefone", () => {
    abrir({ customerPhone: "" });
    const botao = screen.getByRole("button", { name: /enviar ao cliente/i });
    expect(botao.hasAttribute("disabled")).toBe(true);
  });
});

describe("envio", () => {
  it("clique duplo dispara UM envio só", async () => {
    // Sem esta trava o cliente receberia a mesma mensagem duas vezes — o tipo
    // de coisa que faz o número do restaurante ser denunciado.
    let liberar: (v: unknown) => void = () => {};
    enviarMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          liberar = resolve;
        }),
    );

    abrir();
    const botao = screen.getByRole("button", { name: /enviar ao cliente/i });

    await userEvent.click(botao);
    await userEvent.click(botao).catch(() => {});
    await userEvent.click(botao).catch(() => {});

    expect(enviarMock).toHaveBeenCalledTimes(1);

    liberar({ ok: true, enviado: true });
    await waitFor(() => expect(screen.getByText(/Atualização enviada/i)).toBeTruthy());
  });

  it("mostra 'Enviando…' e desabilita o botão durante o envio", async () => {
    enviarMock.mockImplementation(() => new Promise(() => {}));
    abrir();

    await userEvent.click(screen.getByRole("button", { name: /enviar ao cliente/i }));

    const enviando = await screen.findByRole("button", { name: /enviando/i });
    expect(enviando.hasAttribute("disabled")).toBe(true);
  });

  it("manda apenas o pedido e a etapa — nunca o telefone nem a arte", async () => {
    // O navegador não decide para quem a mensagem vai. Se decidisse, bastaria
    // mexer no que ele envia para disparar mensagem para qualquer número
    // usando o WhatsApp do restaurante.
    enviarMock.mockResolvedValue({ ok: true, enviado: true });
    abrir();

    await userEvent.click(screen.getByRole("button", { name: /enviar ao cliente/i }));

    await waitFor(() => expect(enviarMock).toHaveBeenCalled());
    expect(enviarMock).toHaveBeenCalledWith({
      data: { orderId: PADRAO.orderId, kind: "preparando" },
    });
  });

  it("na falha, explica o motivo, não fecha e deixa tentar de novo", async () => {
    enviarMock.mockResolvedValue({ ok: false, motivo: "erro", mensagem: "O WhatsApp recusou." });
    abrir();

    await userEvent.click(screen.getByRole("button", { name: /enviar ao cliente/i }));

    expect(
      await screen.findByText(/Não foi possível enviar a atualização ao cliente/i),
    ).toBeTruthy();
    expect(screen.getByText("O WhatsApp recusou.")).toBeTruthy();
    expect(screen.getByRole("button", { name: /tentar de novo/i })).toBeTruthy();
    // Nada de fechar sozinho: quem tentou precisa LER o motivo.
    expect(PADRAO.onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it("sem WhatsApp conectado, avisa que a arte não vai junto", async () => {
    // O caminho antigo (abrir a conversa com o texto pronto) não consegue
    // anexar imagem. Dizer isso em voz alta é melhor do que mandar o endereço
    // da arte e o cliente receber um link.
    enviarMock.mockResolvedValue({
      ok: false,
      motivo: "whatsapp_nao_configurado",
      texto: "Seu pedido entrou no forno!",
      telefone: "5511988887777",
    });
    abrir();

    await userEvent.click(screen.getByRole("button", { name: /enviar ao cliente/i }));

    expect(await screen.findByText(/a arte não vai junto/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /abrir conversa \(só texto\)/i })).toBeTruthy();
  });
});
