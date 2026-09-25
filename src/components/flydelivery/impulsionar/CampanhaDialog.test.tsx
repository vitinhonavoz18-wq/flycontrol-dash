import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

// O banco é trocado por uma dublê: os pacotes vêm daqui e a contratação só é
// registrada, para conferir O QUE a tela manda (e o que ela NÃO manda).
const rpcMock = vi.fn();
const PACOTES = [
  { id: "p1", duration_days: 1, label: "1 dia", price_cents: 1000, description: null },
  { id: "p3", duration_days: 3, label: "3 dias", price_cents: 2500, description: null },
  { id: "p7", duration_days: 7, label: "7 dias", price_cents: 6000, description: null },
  { id: "p15", duration_days: 15, label: "15 dias", price_cents: 10500, description: null },
  { id: "p30", duration_days: 30, label: "30 dias", price_cents: 24500, description: null },
];

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          order: () => Promise.resolve({ data: PACOTES, error: null }),
        }),
      }),
    }),
    rpc: (...args: unknown[]) => rpcMock(...args),
  },
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { CampanhaDialog } from "./CampanhaDialog";

const produto = {
  id: "prod-1",
  name: "Açaí 500ml",
  image_url: "https://x/acai.jpg",
  price: 25,
  flydelivery_promo_price: 21.9,
  category_name: "Açaí",
};

function abrir(onContratado = vi.fn()) {
  render(
    <CampanhaDialog
      produto={produto}
      storeName="Paixão Açaí"
      resumo={null}
      onClose={vi.fn()}
      onContratado={onContratado}
    />,
  );
  return onContratado;
}

beforeEach(() => {
  rpcMock.mockReset();
  rpcMock.mockResolvedValue({
    data: {
      campaign_id: "c1",
      product_name: "Açaí 500ml",
      package_label: "7 dias",
      amount_cents: 6000,
      start_at: new Date().toISOString(),
      end_at: new Date(Date.now() + 7 * 86_400_000).toISOString(),
      charge_status: "pending_invoice",
      duplicate: false,
    },
    error: null,
  });
});

describe("janela de impulsionar (pós-pago)", () => {
  it("mostra produto, pergunta, pacotes com preço e os avisos de cobrança", async () => {
    abrir();
    expect(await screen.findByText("R$ 60,00", { selector: "span" })).toBeInTheDocument();
    expect(
      screen.getByText("Por quanto tempo você quer impulsionar este produto?"),
    ).toBeInTheDocument();
    for (const preco of ["R$ 10,00", "R$ 25,00", "R$ 105,00", "R$ 245,00"]) {
      // "R$ 25,00" aparece duas vezes: preço do açaí e pacote de 3 dias.
      expect(screen.getAllByText(preco).length).toBeGreaterThan(0);
    }
    expect(screen.getAllByText("Açaí 500ml").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Paixão Açaí").length).toBeGreaterThan(0);
    expect(
      screen.getByText("Anuncie agora. Pague junto com sua próxima fatura."),
    ).toBeInTheDocument();
    expect(screen.getByText("Sem pagamento agora.")).toBeInTheDocument();
    expect(
      screen.getByText("Este valor será adicionado à sua próxima fatura do FlyControl."),
    ).toBeInTheDocument();
    expect(screen.getByText("Você não precisa pagar agora.")).toBeInTheDocument();
    // Nada de pagamento na hora.
    expect(screen.queryByText(/pix|cartão|checkout/i)).not.toBeInTheDocument();
  });

  it("o botão só libera depois do 'estou ciente'", async () => {
    abrir();
    const botao = await screen.findByRole("button", { name: /Confirmar impulsionamento/ });
    await screen.findByText("R$ 60,00", { selector: "span" });
    expect(botao).toBeDisabled();
    await userEvent.click(screen.getByRole("checkbox"));
    expect(botao).toBeEnabled();
  });

  it("manda só produto, pacote e chave — o preço fica com o banco", async () => {
    const onContratado = abrir();
    await screen.findByText("R$ 60,00", { selector: "span" });
    await userEvent.click(screen.getByRole("radio", { name: /15 dias/ }));
    await userEvent.click(screen.getByRole("checkbox"));
    await userEvent.click(screen.getByRole("button", { name: /Confirmar impulsionamento/ }));

    await waitFor(() => expect(onContratado).toHaveBeenCalled());
    expect(rpcMock).toHaveBeenCalledTimes(1);
    const [funcao, args] = rpcMock.mock.calls[0];
    expect(funcao).toBe("flydelivery_contract_boost");
    expect(args).toMatchObject({
      p_product_id: "prod-1",
      p_plan_id: "p15",
      p_terms_accepted: true,
      p_start_at: null,
    });
    expect(typeof args.p_idempotency_key).toBe("string");
    expect(Object.keys(args).some((k) => /price|amount|valor|cents/i.test(k))).toBe(false);
  });

  it("repetir o envio usa a MESMA chave (não cria outro contrato)", async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: { message: "falha de rede" } });
    abrir();
    await screen.findByText("R$ 60,00", { selector: "span" });
    await userEvent.click(screen.getByRole("checkbox"));
    const botao = screen.getByRole("button", { name: /Confirmar impulsionamento/ });
    await userEvent.click(botao);
    await waitFor(() => expect(rpcMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(botao).toBeEnabled());
    await userEvent.click(botao);
    await waitFor(() => expect(rpcMock).toHaveBeenCalledTimes(2));
    expect(rpcMock.mock.calls[0][1].p_idempotency_key).toBe(
      rpcMock.mock.calls[1][1].p_idempotency_key,
    );
  });

  it("o resumo mostra o valor do pacote escolhido", async () => {
    abrir();
    await screen.findByText("R$ 60,00", { selector: "span" });
    await userEvent.click(screen.getByRole("radio", { name: /30 dias/ }));
    const resumo = screen.getByText("Resumo").parentElement as HTMLElement;
    expect(resumo).toHaveTextContent("30 dias");
    expect(resumo).toHaveTextContent("R$ 245,00");
    expect(resumo).toHaveTextContent("Término");
  });
});
