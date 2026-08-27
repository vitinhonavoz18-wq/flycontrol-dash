/**
 * Conversão e validação de cores da marca.
 *
 * POR QUE ISTO EXISTE
 *
 * O site público desenha tudo a partir de "receitas de cor" no formato
 * `matiz saturação% luminosidade%` — por exemplo `38 92% 50%`. É esse texto
 * que vai para dentro do CSS do cardápio. Já a pessoa que escolhe a cor
 * pensa em `#D7AC32`, o código que ela copiou do logo.
 *
 * É como a receita da cozinha: o cliente pede "molho da casa", mas a ficha
 * técnica precisa dizer 200g disso, 50ml daquilo. Este arquivo é o tradutor
 * entre os dois — e ele é o ÚNICO lugar do painel que sabe fazer essa
 * tradução, para não existirem duas contas diferentes espalhadas pela tela.
 *
 * O QUE JÁ ESTAVA ERRADO E ISTO CONSERTA
 *
 * A coluna `primary_color` do banco nasce com `#FF7A00` de fábrica, mas o
 * site espera a receita `27 100% 55%`. Resultado: o navegador recebia uma
 * instrução que não entende e simplesmente ignorava a cor — como uma comanda
 * escrita em outro idioma, que a cozinha deixa de lado. Por isso as lojas
 * pareciam nunca ter cor própria. Aqui tudo entra e sai normalizado.
 */

export type Hsl = { h: number; s: number; l: number };
export type Rgb = { r: number; g: number; b: number };

/**
 * O valor que a tabela `pizzerias` coloca sozinha em `primary_color` quando
 * uma loja é criada. Ninguém escolheu essa cor, e ela nunca chegou a
 * aparecer no site — então tratamos como "sem cor escolhida", e não como
 * decisão do lojista.
 */
export const COR_DE_FABRICA = "#FF7A00";

/** Formatos que o campo de código aceita. */
export type FormatoCor = "hex" | "rgb" | "hsl";

const limitar = (valor: number, minimo: number, maximo: number) =>
  Math.min(maximo, Math.max(minimo, valor));

/** Arredonda mantendo até 2 casas, sem deixar "50.00%" na tela. */
function enxugar(valor: number): number {
  return Math.round(valor * 100) / 100;
}

// ---------------------------------------------------------------------------
// Conversões
// ---------------------------------------------------------------------------

export function rgbParaHsl({ r, g, b }: Rgb): Hsl {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const maior = Math.max(rn, gn, bn);
  const menor = Math.min(rn, gn, bn);
  const delta = maior - menor;

  let h = 0;
  if (delta !== 0) {
    if (maior === rn) h = ((gn - bn) / delta) % 6;
    else if (maior === gn) h = (bn - rn) / delta + 2;
    else h = (rn - gn) / delta + 4;
    h *= 60;
    if (h < 0) h += 360;
  }

  const l = (maior + menor) / 2;
  const s = delta === 0 ? 0 : delta / (1 - Math.abs(2 * l - 1));

  return { h: enxugar(h), s: enxugar(s * 100), l: enxugar(l * 100) };
}

export function hslParaRgb({ h, s, l }: Hsl): Rgb {
  const hn = ((h % 360) + 360) % 360;
  const sn = limitar(s, 0, 100) / 100;
  const ln = limitar(l, 0, 100) / 100;

  const c = (1 - Math.abs(2 * ln - 1)) * sn;
  const x = c * (1 - Math.abs(((hn / 60) % 2) - 1));
  const m = ln - c / 2;

  let rgb: [number, number, number];
  if (hn < 60) rgb = [c, x, 0];
  else if (hn < 120) rgb = [x, c, 0];
  else if (hn < 180) rgb = [0, c, x];
  else if (hn < 240) rgb = [0, x, c];
  else if (hn < 300) rgb = [x, 0, c];
  else rgb = [c, 0, x];

  return {
    r: Math.round((rgb[0] + m) * 255),
    g: Math.round((rgb[1] + m) * 255),
    b: Math.round((rgb[2] + m) * 255),
  };
}

// ---------------------------------------------------------------------------
// Leitura: aceita hex, rgb() e hsl() — e também a receita solta "38 92% 50%"
// ---------------------------------------------------------------------------

function lerHex(texto: string): Hsl | null {
  const limpo = texto.trim().replace(/^#/, "");
  if (!/^[0-9a-fA-F]+$/.test(limpo)) return null;

  let hex = limpo;
  // #abc é atalho para #aabbcc, como no CSS.
  if (hex.length === 3 || hex.length === 4) {
    hex = hex
      .slice(0, 3)
      .split("")
      .map((c) => c + c)
      .join("");
  }
  // 8 dígitos trazem transparência no fim; a marca é opaca, então o descarte
  // é proposital.
  if (hex.length === 8) hex = hex.slice(0, 6);
  if (hex.length !== 6) return null;

  return rgbParaHsl({
    r: parseInt(hex.slice(0, 2), 16),
    g: parseInt(hex.slice(2, 4), 16),
    b: parseInt(hex.slice(4, 6), 16),
  });
}

function numeros(texto: string): number[] {
  return (texto.match(/-?\d*\.?\d+/g) ?? []).map(Number);
}

/**
 * Interpreta qualquer código de cor que a pessoa possa digitar ou colar.
 *
 * Devolve `null` quando não dá para entender — e é isso que a tela usa para
 * dizer "esse código não existe" em vez de gravar lixo no banco. É o porteiro
 * conferindo a lista: quem não está nela não entra.
 */
export function lerCor(entrada: unknown): Hsl | null {
  if (typeof entrada !== "string") return null;
  const texto = entrada.trim();
  if (!texto) return null;

  if (texto.startsWith("#")) return lerHex(texto);

  const minusculo = texto.toLowerCase();

  if (minusculo.startsWith("rgb")) {
    const [r, g, b] = numeros(texto);
    if ([r, g, b].some((n) => n === undefined || Number.isNaN(n))) return null;
    if ([r, g, b].some((n) => n < 0 || n > 255)) return null;
    return rgbParaHsl({ r, g, b });
  }

  if (minusculo.startsWith("hsl")) {
    const [h, s, l] = numeros(texto);
    if ([h, s, l].some((n) => n === undefined || Number.isNaN(n))) return null;
    return normalizar({ h, s, l });
  }

  // A receita usada pelo site, solta: "38 92% 50%" (com ou sem vírgulas).
  if (texto.includes("%")) {
    const [h, s, l] = numeros(texto);
    if ([h, s, l].some((n) => n === undefined || Number.isNaN(n))) return null;
    return normalizar({ h, s, l });
  }

  // Hex sem cerquilha, que é como muita gente copia do editor de imagem.
  return lerHex(texto);
}

/** Prende matiz, saturação e luminosidade dentro dos limites válidos. */
export function normalizar({ h, s, l }: Hsl): Hsl {
  return {
    h: enxugar(((h % 360) + 360) % 360),
    s: enxugar(limitar(s, 0, 100)),
    l: enxugar(limitar(l, 0, 100)),
  };
}

// ---------------------------------------------------------------------------
// Escrita
// ---------------------------------------------------------------------------

export function paraHex(cor: Hsl): string {
  const { r, g, b } = hslParaRgb(cor);
  const parte = (n: number) => n.toString(16).padStart(2, "0");
  return `#${parte(r)}${parte(g)}${parte(b)}`.toUpperCase();
}

export function paraRgbTexto(cor: Hsl): string {
  const { r, g, b } = hslParaRgb(cor);
  return `rgb(${r}, ${g}, ${b})`;
}

export function paraHslTexto(cor: Hsl): string {
  const { h, s, l } = normalizar(cor);
  return `hsl(${h}, ${s}%, ${l}%)`;
}

/**
 * A receita que vai para o banco e para o site: `38 92% 50%`.
 *
 * Este é o formato de armazenamento e ele NÃO muda — o cardápio inteiro é
 * pintado a partir dele. Mexer aqui despinta todas as lojas de uma vez.
 */
export function paraTripletoHsl(cor: Hsl): string {
  const { h, s, l } = normalizar(cor);
  return `${h} ${s}% ${l}%`;
}

export function formatar(cor: Hsl, formato: FormatoCor): string {
  if (formato === "rgb") return paraRgbTexto(cor);
  if (formato === "hsl") return paraHslTexto(cor);
  return paraHex(cor);
}

// ---------------------------------------------------------------------------
// Variações e contraste
// ---------------------------------------------------------------------------

export function clarear(cor: Hsl, passos: number): Hsl {
  return normalizar({ ...cor, l: cor.l + (100 - cor.l) * passos });
}

export function escurecer(cor: Hsl, passos: number): Hsl {
  return normalizar({ ...cor, l: cor.l * (1 - passos) });
}

/**
 * Cinco tons a partir da cor escolhida, do mais claro ao mais escuro.
 *
 * Serve para o lojista ver, sem precisar de olho treinado, que a cor do logo
 * também funciona como fundo suave de destaque e como sombra de botão.
 */
export function variacoes(cor: Hsl): { rotulo: string; cor: Hsl }[] {
  return [
    { rotulo: "Bem clara", cor: clarear(cor, 0.72) },
    { rotulo: "Clara", cor: clarear(cor, 0.36) },
    { rotulo: "Escolhida", cor: normalizar(cor) },
    { rotulo: "Escura", cor: escurecer(cor, 0.22) },
    { rotulo: "Bem escura", cor: escurecer(cor, 0.45) },
  ];
}

/** Luminância relativa (WCAG), usada para decidir texto preto ou branco. */
function luminancia(cor: Hsl): number {
  const { r, g, b } = hslParaRgb(cor);
  const canal = (v: number) => {
    const n = v / 255;
    return n <= 0.03928 ? n / 12.92 : Math.pow((n + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b);
}

/**
 * A cor de texto que se lê por cima desta: preto ou branco.
 *
 * É o que evita o botão amarelo com letra branca, que ninguém consegue ler
 * na tela do celular no meio da rua.
 */
export function textoLegivelSobre(cor: Hsl): Hsl {
  return luminancia(cor) > 0.45 ? { h: 0, s: 0, l: 0 } : { h: 0, s: 0, l: 100 };
}

/** A cor é escura o bastante para pedir texto claro por cima? */
export function ehEscuro(cor: Hsl): boolean {
  return luminancia(cor) <= 0.45;
}

/**
 * Quanto uma cor se destaca da outra, na régua da acessibilidade (WCAG).
 *
 * 1 é invisível, 21 é preto no branco. O mínimo recomendado para texto
 * corrido é 4,5 — abaixo disso, alguém com a vista cansada ou o celular no
 * sol simplesmente não lê.
 */
export function razaoDeContraste(a: Hsl, b: Hsl): number {
  const la = luminancia(a);
  const lb = luminancia(b);
  const claro = Math.max(la, lb);
  const escuro = Math.min(la, lb);
  return Math.round(((claro + 0.05) / (escuro + 0.05)) * 100) / 100;
}

// ---------------------------------------------------------------------------
// Peças derivadas do fundo escolhido
// ---------------------------------------------------------------------------
//
// Quando a loja escolhe a cor de fundo, as outras peças da tela precisam
// acompanhar — senão um fundo preto ficaria com card branco e texto preto
// por cima, e o cardápio viraria um borrão. Estas contas resolvem isso sem
// pedir mais nenhuma escolha ao lojista.
//
// A regra é sempre a mesma: fundo escuro, as peças por cima clareiam; fundo
// claro, elas escurecem. É o mesmo raciocínio do prato branco com o molho
// escuro — o que está em cima precisa contrastar com a louça.

/** Move a luminosidade na direção que "levanta" a peça sobre o fundo. */
function elevar(fundo: Hsl, passo: number): Hsl {
  const paraCima = ehEscuro(fundo) || fundo.l < 96;
  return normalizar({ ...fundo, l: paraCima ? fundo.l + passo : fundo.l - passo });
}

/** O card do produto: um degrau acima do fundo, nunca a mesma cor. */
export function superficieSobre(fundo: Hsl): Hsl {
  return elevar(fundo, 5);
}

/** Áreas discretas (caixa de total, moldura de foto). */
export function apagadoSobre(fundo: Hsl): Hsl {
  return elevar(fundo, 8);
}

/** O fio que separa um card do outro. Precisa de mais salto para aparecer. */
export function bordaSobre(fundo: Hsl): Hsl {
  return normalizar({ ...fundo, l: ehEscuro(fundo) ? fundo.l + 16 : fundo.l - 14 });
}

/** O texto principal. Não é preto/branco puro: cansa menos a vista. */
export function textoPrincipalSobre(fundo: Hsl): Hsl {
  return ehEscuro(fundo) ? { h: 0, s: 0, l: 98 } : { h: 222, s: 47, l: 11 };
}

/** O texto de apoio (descrição do prato), mais apagado mas ainda legível. */
export function textoApagadoSobre(fundo: Hsl): Hsl {
  return normalizar({
    h: fundo.h,
    s: Math.min(fundo.s, 20),
    l: ehEscuro(fundo) ? 68 : 38,
  });
}

// ---------------------------------------------------------------------------
// Ponte com o que já está gravado no banco
// ---------------------------------------------------------------------------

/**
 * A cor que a loja realmente escolheu, ou `null` quando não escolheu nenhuma.
 *
 * Campo vazio é "não escolheu". `#FF7A00` também é: esse valor não foi
 * decisão de ninguém, é o que a tabela preenche sozinha quando a loja nasce —
 * e, como o site nunca conseguiu entendê-lo, também nunca chegou a aparecer.
 * Tratá-lo como escolha faria toda loja que nunca abriu esta tela mudar de
 * cara sozinha, do nada.
 */
export function corEscolhida(bruto: unknown): Hsl | null {
  if (typeof bruto !== "string") return null;
  const texto = bruto.trim();
  if (!texto) return null;
  if (texto.toUpperCase() === COR_DE_FABRICA) return null;
  return lerCor(texto);
}
