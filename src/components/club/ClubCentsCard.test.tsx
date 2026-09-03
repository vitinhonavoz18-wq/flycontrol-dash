import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import type { ProgressoNaTela } from "@/lib/billing/cents.functions";

/**
 * Guardas da faixa do CENTS na tela de Pedidos.
 *
 * O DEFEITO QUE ISSO EVITA DE VOLTAR
 *
 * Esta faixa ficou meses mostrando o modelo ANTIGO: uma meta única de 500
 * pedidos para "desbloquear o Benefício Ouro" de R$ 0,40. O preço já não
 * funcionava assim — ele cai em degraus, e cada degrau vale dali para frente.
 *
 * Pior que a frase errada era a origem dos números: eles vinham de outro
 * caderno (a tabela do clube), enquanto a fatura era calculada em outro
 * lugar. Dois cadernos para a mesma pergunta é o caderno de reservas do salão
 * discordando do caderno do telefone — um dia divergem, e o cliente descobre
 * pela fatura.
 *
 * Estes testes travam as duas coisas: o texto do modelo velho não pode
 * voltar, e os números têm de vir da função que fecha a fatura.
 */

const buscar = vi.fn();

vi.mock("@tanstack/react-start", () => ({
  useServerFn: () => buscar,
}));

// A função de servidor de verdade arrasta o middleware de autenticação, que
// não roda fora do servidor. Aqui só precisamos da referência.
vi.mock("@/lib/billing/cents.functions", () => ({
  progressoDoCents: () => undefined,
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    channel: () => ({ on: () => ({ subscribe: () => ({}) }) }),
    removeChannel: () => {},
  },
}));

const { ClubCentsCard } = await import("./ClubCentsCard");

/** Uma loja no meio da segunda faixa: 187 pedidos, faltam 63 para a terceira. */
function progresso(sobrescreve: Partial<ProgressoNaTela> = {}): ProgressoNaTela {
  return {
    comFaixas: true,
    politica: "cents_v2",
    pedidos: 187,
    nivel: 2,
    rotuloDoNivel: "Fase 2",
    precoDoProximoPedidoCents: 60,
    proxima: { meta: 250, faltam: 63, precoCents: 50 },
    percentDaFase: 58,
    posicaoNaTrilha: 52,
    marcos: [],
    faixas: [],
    totalCents: 12220,
    noMaximo: false,
    cicloInicio: new Date().toISOString(),
    cicloFim: new Date(Date.now() + 19 * 86_400_000).toISOString(),
    recorde: null,
    ...sobrescreve,
  };
}

beforeEach(() => buscar.mockReset());

describe("faixa do CENTS na tela de Pedidos", () => {
  it("os números saem da função que fecha a fatura, e não de outro caderno", async () => {
    buscar.mockResolvedValue(progresso());
    render(<ClubCentsCard tenantId="loja-1" />);
    expect(await screen.findByText("187")).toBeTruthy();
    expect(buscar).toHaveBeenCalled();
  });

  it("pergunta pela loja que está na tela, e não pela do próprio usuário", async () => {
    // O administrador troca de loja no painel. Sem mandar qual é, a faixa
    // mostraria a progressão da loja ERRADA — ou sumiria, que foi o que
    // aconteceu. Quem confere se ele pode ver essa loja é o servidor.
    buscar.mockResolvedValue(progresso());
    render(<ClubCentsCard tenantId="loja-7" />);
    await screen.findByText("187");
    expect(buscar).toHaveBeenCalledWith({ data: { tenantId: "loja-7" } });
  });

  it("mostra o preço da faixa em que a loja está agora", async () => {
    buscar.mockResolvedValue(progresso());
    render(<ClubCentsCard tenantId="loja-1" />);
    expect(await screen.findByText("R$ 0,60")).toBeTruthy();
    expect(screen.getByText("Fase 2")).toBeTruthy();
  });

  it("diz quantos pedidos faltam para o preço cair de novo", async () => {
    buscar.mockResolvedValue(progresso());
    render(<ClubCentsCard tenantId="loja-1" />);
    const texto = (await screen.findByText(/Faltam/)).parentElement?.textContent ?? "";
    expect(texto).toContain("63");
    expect(texto).toContain("R$ 0,50");
  });

  it("o texto do modelo antigo não pode voltar", async () => {
    buscar.mockResolvedValue(progresso());
    const { container } = render(<ClubCentsCard tenantId="loja-1" />);
    await screen.findByText("187");
    const tudo = container.textContent ?? "";
    // A meta única e o "Benefício Ouro" eram a promessa do modelo velho.
    expect(tudo).not.toMatch(/Benef[íi]cio Ouro/);
    expect(tudo).not.toMatch(/\/\s*500 pedidos/);
  });

  it("no último degrau, para de prometer desconto que não existe mais", async () => {
    buscar.mockResolvedValue(
      progresso({ pedidos: 640, nivel: 4, rotuloDoNivel: "CENTS MAX", precoDoProximoPedidoCents: 40, proxima: null, noMaximo: true }),
    );
    const { container } = render(<ClubCentsCard tenantId="loja-1" />);
    await screen.findByText("640");
    expect(container.textContent).toContain("melhor preço");
    expect(container.textContent).not.toMatch(/Faltam/);
  });

  it("loja num ciclo da regra antiga não vê trilha de degraus", async () => {
    buscar.mockResolvedValue(progresso({ comFaixas: false, politica: "cents_v1" }));
    const { container } = render(<ClubCentsCard tenantId="loja-1" />);
    // Prometer degraus a quem é cobrado por preço único seria anunciar um
    // desconto que a fatura não vai dar.
    await new Promise((r) => setTimeout(r, 30));
    expect(container.textContent).toBe("");
  });

  it("resposta sem os números some — nunca escreve 'zero pedidos'", async () => {
    // Este é o jeito como a falha REALMENTE chega neste projeto: a busca não
    // estoura, ela devolve um pacote sem os números dentro. Foi exatamente
    // isso que derrubou a tela de Marketing. É o entregador chegando com a
    // sacola vazia — o certo é conferir na porta.
    buscar.mockResolvedValue({ erro: "não autorizado" });
    const { container } = render(<ClubCentsCard tenantId="loja-1" />);
    await new Promise((r) => setTimeout(r, 30));
    // Escrever "0 pedidos" para quem vendeu o dia inteiro é pior que sumir:
    // o dono acha que não vendeu nada.
    expect(container.textContent).toBe("");
  });
});
