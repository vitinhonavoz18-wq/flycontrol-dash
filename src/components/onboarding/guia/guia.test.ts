import { existsSync, readFileSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ETAPAS_DO_GUIA, type EmocaoDoGuia } from "@/lib/onboarding/guia/etapas";
import { POSES, PROPORCAO_DO_PERSONAGEM } from "./personagem";

/**
 * As travas do guia que não dá para conferir só olhando a tela.
 */
function soCodigo(caminho: string): string {
  return (
    readFileSync(caminho, "utf8")
      // O comentário de bloco sai PRIMEIRO. Fazer o contrário — começar pelo
      // `{/* ... */}` do JSX — é o que quebrava: esse padrão termina em
      // `*/}`, e quando o `*/` encontrado não é seguido de `}`, a busca
      // continua até um `*/` mais adiante e leva o CÓDIGO do meio junto.
      // Medido: um arquivo de 2.464 letras virava 334, e os testes passavam a
      // conferir o vazio — o detector de fumaça com a bateria tirada.
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "")
  );
}

const guia = soCodigo("src/components/onboarding/guia/GuiaDeConfiguracao.tsx");
const holofote = soCodigo("src/components/onboarding/guia/Holofote.tsx");
const servidor = soCodigo("src/lib/onboarding/guia/guia.functions.ts");
const painel = soCodigo("src/routes/_app.tsx");

describe("o personagem", () => {
  it("toda emoção tem uma pose, e todo arquivo existe", () => {
    const emocoes: EmocaoDoGuia[] = [
      "boas-vindas",
      "orientando",
      "trabalhando",
      "sucesso",
      "atencao",
      "comemorando",
      "neutro",
    ];
    for (const e of emocoes) {
      expect(POSES[e], `falta a pose "${e}"`).toBeTruthy();
      expect(POSES[e].descricao.length, `pose "${e}" sem descrição`).toBeGreaterThan(10);
      const arquivo = `src/assets/personagem/${e}.png`;
      expect(existsSync(arquivo), `${arquivo} não existe`).toBe(true);
    }
  });

  it("toda emoção usada por uma etapa existe no mapa de poses", () => {
    // Uma etapa pedindo uma emoção sem pose cairia no personagem neutro em
    // silêncio — e ninguém descobriria até alguém estranhar a cara dele.
    for (const etapa of ETAPAS_DO_GUIA) {
      expect(POSES[etapa.emocao], `etapa "${etapa.id}" pede pose inexistente`).toBeTruthy();
    }
  });

  it("as imagens cabem no celular de um lojista", () => {
    // As enviadas tinham ~1,4 MB cada, quase 10 MB no total. Num celular com
    // internet de loja, isso é o guia travando antes de começar.
    for (const e of Object.keys(POSES) as EmocaoDoGuia[]) {
      const kb = statSync(`src/assets/personagem/${e}.png`).size / 1024;
      expect(kb, `pose "${e}" com ${Math.round(kb)} KB`).toBeLessThan(320);
    }
  });

  it("a proporção original do desenho é preservada", () => {
    // 1145 × 1374. Esticar o personagem seria alterá-lo.
    expect(PROPORCAO_DO_PERSONAGEM).toBeCloseTo(1145 / 1374, 5);
  });

  it("os originais intocados continuam guardados", () => {
    // Para poder reexportar em outro tamanho sem pedir os arquivos de novo.
    for (const e of Object.keys(POSES) as EmocaoDoGuia[]) {
      expect(existsSync(`docs/personagem-originais/${e}.png`), `original de "${e}"`).toBe(true);
    }
  });
});

describe("o buraco do holofote é um buraco de verdade", () => {
  it("o escuro é feito de quatro painéis em volta, não de um recorte desenhado", () => {
    // Uma tela escura inteira com um recorte desenhado por cima parece igual
    // e não é: o recorte continua sendo vidro. O dedo bate nele, o clique
    // morre ali, e o lojista fica tocando o campo aceso sem nada acontecer —
    // a vitrine iluminada com a porta trancada.
    expect(holofote).not.toContain("clip-path");
    expect(holofote).not.toContain("mask-image");
    expect(holofote.match(/\$\{escuro\}/g)?.length).toBe(5);
  });

  it("a moldura brilhante não rouba o toque", () => {
    expect(holofote).toMatch(/pointer-events-none fixed z-\[var\(--z-guia-holofote\)\]/);
  });

  it("o escuro fica ABAIXO dos diálogos", () => {
    // Todo diálogo, seletor e menu do projeto é `z-50`. O formulário que o
    // guia mandou abrir precisa abrir por cima dele — senão o guia tranca a
    // porta que ele mesmo mandou usar.
    const css = readFileSync("src/styles.css", "utf8");
    const holofoteZ = Number(css.match(/--z-guia-holofote:\s*(\d+)/)?.[1]);
    const balaoZ = Number(css.match(/--z-guia-balao:\s*(\d+)/)?.[1]);
    expect(holofoteZ).toBeLessThan(50);
    expect(balaoZ).toBeLessThan(50);
    expect(balaoZ).toBeGreaterThan(holofoteZ);
  });

  it("o alvo é remedido sem parar", () => {
    // A tela se mexe: a pessoa rola, o teclado sobe, uma imagem carrega. Medir
    // uma vez só deixaria o holofote apontado para onde o campo ESTAVA.
    const hook = soCodigo("src/components/onboarding/guia/useRecorteDoAlvo.ts");
    expect(hook).toContain("requestAnimationFrame(medir)");
    expect(hook).toContain("cancelAnimationFrame");
  });
});

describe("quem manda é o servidor", () => {
  it("a decisão não vem do navegador", () => {
    // Bastaria limpar (ou mexer) no navegador para pular a configuração.
    expect(guia).not.toMatch(/localStorage/);
    expect(guia).not.toMatch(/sessionStorage/);
  });

  it("nenhuma etapa avança por clique", () => {
    // Não existe "próximo": a etapa fecha quando o dado existe no banco.
    // Procura CHAMADA de função, não a palavra: "Vamos para a próxima" é
    // texto que o personagem fala, e barrar a palavra proibiria a frase.
    expect(guia).not.toMatch(/\b(nextStep|avancar[A-Z]\w*|proximaEtapa)\s*\(/);
    expect(guia).not.toMatch(/concluirEtapa\s*\(/);
    // Quem descobre que a etapa fechou é a releitura do banco, não um clique.
    expect(guia).toContain("INTERVALO_MS");
    expect(guia).toContain("setInterval(conferir, INTERVALO_MS)");
  });

  it("a loja vem sempre da conta logada, nunca de um número mandado pela tela", () => {
    expect(servidor).toContain('.eq("owner_id", userId)');
    expect(servidor).toContain("lojaDoUsuario(context.userId)");
  });

  it("sem caderno não há guia", () => {
    // Loja antiga, loja criada pelo Painel Admin e loja restaurada não podem
    // ser paradas no meio do expediente. Essa regra já foi o contrário uma
    // vez e o questionário voltava a cada login.
    expect(servidor).toMatch(
      /if \(!data \|\| data\.guide_status === "completed"\) return GUIA_DESLIGADO/,
    );
  });

  it("produto só conta com preço acima de zero", () => {
    expect(servidor).toContain('.gt("price", 0)');
  });

  it("horário vazio não conta como preenchido", () => {
    // O campo nasce como `[]` em quase toda loja. Conferir só a existência
    // daria a etapa por feita com o campo vazio.
    expect(servidor).toContain("temConteudo(p?.opening_hours)");
  });
});

describe("o guia bloqueia sem trancar", () => {
  it("existe sempre a saída 'Terminar depois'", () => {
    // Porta que só abre de um jeito acaba prendendo alguém, e aí a única
    // saída vira ligar para o suporte.
    expect(guia).toContain("Terminar depois");
    expect(servidor).toContain("export const sairDoGuia");
  });

  it("falha de rede desliga o guia em vez de prender", () => {
    expect(guia).toMatch(/catch \{[\s\S]*?setEstado\(null\)/);
  });

  it("administrador da plataforma nunca vê o guia", () => {
    expect(painel).toContain("<GuiaDeConfiguracao habilitado={!isSuperAdmin} />");
  });

  it("o guia vive fora do <main>, para alcançar o menu e a barra de baixo", () => {
    // Dentro do <main> o lojista escaparia do guia pelo próprio menu lateral.
    const i = painel.indexOf("<GuiaDeConfiguracao");
    const j = painel.indexOf("</main>");
    expect(i).toBeGreaterThan(j);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// FASES 4, 5 E 6 — o que o servidor vai olhar
// ═══════════════════════════════════════════════════════════════════════════

describe("as fases novas leem o dado REAL do FlyControl", () => {
  it("pagamento vem de `payment_methods`, a mesma lista da tela", () => {
    // A tela Minha Loja grava uma lista de textos ("Pix", "Dinheiro"...).
    // Inventar uma tabela nova de pagamentos deixaria a loja com duas
    // verdades sobre como o cliente paga.
    expect(servidor).toContain("payment_methods");
    expect(servidor).toContain("formasDePagamento: formas.length");
  });

  it("complemento desligado não conta como 'a loja tem adicionais'", () => {
    // Um complemento desativado não aparece para o cliente. Contá-lo fecharia
    // a etapa com a loja oferecendo nada.
    expect(servidor).toContain('.from("menu_extras")');
    expect(servidor).toContain('.or("active.is.null,active.eq.true")');
  });

  it("o canal de pedidos usa o MESMO validador de telefone do cadastro", () => {
    // Duas regras de telefone no mesmo sistema é como ter duas balanças no
    // açougue: uma hora discordam e ninguém sabe qual está certa.
    expect(servidor).toContain("validateBrazilianPhone");
    expect(servidor).toContain("numeroDePedidosValido(p?.phone)");
  });

  it("a decisão que vem da tela é conferida ANTES de gravar", () => {
    // Sem isso bastaria uma requisição inventada para gravar
    // "pagamentos: dispensado" e pular uma etapa que exige dado de verdade.
    expect(servidor).toMatch(/if \(!decisaoValida\(data\.chave, data\.valor\)\)/);
    // E o que já está no banco passa pelo mesmo crivo: lixo de uma versão
    // antiga não pode virar etapa concluída em silêncio.
    expect(servidor).toContain("decisaoValida(chave, valor)");
  });

  it("decisão em loja sem caderno, ou com guia encerrado, é recusada", () => {
    expect(servidor).toMatch(
      /if \(!atual \|\| atual\.guide_status === "completed"\) return \{ ok: false \}/,
    );
  });
});

describe("o toque repetido no botão", () => {
  it("a trava é síncrona, não um estado de tela", () => {
    // `useState` só reflete no render seguinte, e dois toques rápidos
    // acontecem antes disso — é a campainha tocada três vezes antes de
    // alguém chegar na porta.
    expect(guia).toContain("gravando = useRef(false)");
    expect(guia).toMatch(/if \(gravando\.current\) return;/);
  });

  it("depois de escolher, o guia relê o servidor em vez de se marcar sozinho", () => {
    expect(guia).toContain("setEstado(await perguntar({ data: undefined }))");
  });
});

describe("o resumo de prontidão", () => {
  const checklist = soCodigo("src/components/onboarding/guia/ChecklistDeProntidao.tsx");

  it("mostra as etapas que ainda faltam, não só as feitas", () => {
    // Dizer "tudo pronto" com Plano Cents e Pedido teste faltando seria o
    // boletim que dá nota para matéria que ninguém deu.
    expect(checklist).toContain("ETAPAS_DO_GUIA");
    expect(checklist).toContain("em breve");
  });

  it("o estado de cada linha também vai em texto", () => {
    // Quem usa leitor de tela não vê ícone; quem não distingue verde não vê
    // a cor.
    expect(checklist).toContain("sr-only");
  });
});

describe("as duas respostas da etapa de adicionais", () => {
  it("têm o mesmo peso visual", () => {
    // Fazer a segunda parecer um link escondido é empurrar o lojista para a
    // resposta que o sistema prefere, e não para a verdade do negócio dele.
    const personagem = soCodigo("src/components/onboarding/guia/PersonagemDoGuia.tsx");
    expect(personagem).toContain("alternativa");
    expect(personagem).toMatch(/alternativa[\s\S]*?min-h-11 flex-1/);
  });

  it("a pergunta fica amarrada aos botões para o leitor de tela", () => {
    const personagem = soCodigo("src/components/onboarding/guia/PersonagemDoGuia.tsx");
    expect(personagem).toContain('aria-labelledby={pergunta ? "pergunta-do-guia" : undefined}');
  });

  it("todo botão do balão mostra onde está o foco do teclado", () => {
    const personagem = soCodigo("src/components/onboarding/guia/PersonagemDoGuia.tsx");
    expect(personagem.match(/focus-visible:ring-2/g)?.length).toBeGreaterThanOrEqual(3);
  });
});

describe("trocar de aba não apaga a loja escolhida", () => {
  it("as telas com abas preservam o resto do endereço", () => {
    // Quem tem mais de uma loja chega com `?pizzeriaId=...`. Escrever só
    // `?aba=` apagaria esse pedaço, e no primeiro F5 a tela voltaria para
    // outra loja — o dono editando o endereço da loja errada sem perceber.
    const loja = soCodigo("src/routes/_app/my-store.tsx");
    const cardapio = soCodigo("src/components/menu/MenuManager.tsx");
    expect(loja).toContain("search: (antes) => ({ ...antes, aba: nova })");
    expect(cardapio).toContain("search: (antes) => ({ ...antes, aba: nova })");
  });

  it("o guia também preserva", () => {
    expect(guia).toContain("enderecoDaEtapa(destino,");
  });
});

describe("ninguém que já está trabalhando é preso", () => {
  it("loja que já recebeu pedido encerra o guia sozinha", () => {
    // Segunda trava, independente de "sem caderno não há guia". Se um caderno
    // em aberto sobrar por engano numa loja que já vende — um script, uma
    // restauração, um cadastro refeito — o guia se encerra em vez de
    // escurecer o painel de quem tem pedido chegando.
    expect(servidor).toContain("async function jaEstaVendendo");
    expect(servidor).toMatch(/if \(await jaEstaVendendo\(loja\.id\)\) \{/);
    expect(servidor).toContain('.from("orders")');
  });

  it("há um só jeito de encerrar o guia no código", () => {
    // Duas versões do mesmo encerramento é como ter duas chaves da mesma
    // porta com segredos diferentes: uma hora uma delas deixa de fechar.
    expect(servidor).toContain("async function encerrarGuia");
    expect(servidor.match(/guide_status: "completed"/g)?.length).toBe(1);
  });
});
