import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { TEXTOS_DO_CARDAPIO, CHAVE_NO_SITE_SETTINGS } from "./menuTexts";

/**
 * A regra dos textos existe em dois lugares por necessidade.
 *
 * Na TELA, porque quem está digitando precisa ver o contador andar e o aviso
 * aparecer na hora. No BANCO, porque a tela é o lado de fora: quem souber
 * montar a chamada por conta própria fala direto com o banco e passa por cima
 * dela.
 *
 * Duas cópias que discordam é pior que uma só: a tela deixaria escrever 80
 * caracteres e o banco cortaria em 50, sem ninguém avisar, e o lojista veria
 * a frase dele truncada no cardápio sem entender por quê.
 *
 * Este arquivo lê o SQL de verdade e compara com o catálogo, para a
 * divergência quebrar a suíte em vez de aparecer no cardápio de alguém.
 */
const CAMINHO = "DATABASE/supabase/migrations/20260830120000_textos_do_cardapio.sql";
const sql = readFileSync(CAMINHO, "utf8");

describe("a regra da tela e a do banco são a mesma", () => {
  it("os limites de cada campo batem", () => {
    const linha = sql.match(/v_limites CONSTANT jsonb := '(\{[^']*\})'/);
    expect(linha, "lista de limites não encontrada na migration").not.toBeNull();

    const doBanco = JSON.parse(linha![1]) as Record<string, number>;
    const daTela = Object.fromEntries(TEXTOS_DO_CARDAPIO.map((d) => [d.chave, d.maximo]));

    expect(doBanco).toEqual(daTela);
  });

  it("o banco conhece exatamente os mesmos campos", () => {
    const linha = sql.match(/v_limites CONSTANT jsonb := '(\{[^']*\})'/)![1];
    const doBanco = Object.keys(JSON.parse(linha)).sort();
    const daTela = TEXTOS_DO_CARDAPIO.map((d) => d.chave).sort();
    expect(doBanco).toEqual(daTela);
  });

  it("os dois lados guardam no mesmo lugar da ficha da loja", () => {
    expect(CHAVE_NO_SITE_SETTINGS).toBe("menu_texts");
    expect(sql).toContain("'menu_texts'");
  });
});

describe("garantias do gatilho", () => {
  it("dispara ao gravar as configurações da loja", () => {
    expect(sql).toMatch(/BEFORE INSERT OR UPDATE OF site_settings ON public\.pizzerias/);
  });

  it("tira qualquer coisa entre < e >", () => {
    expect(sql).toContain("'<[^>]*>'");
  });

  it("corrige em vez de recusar a gravação", () => {
    // Derrubar o salvamento inteiro por um espaço a mais faria o lojista
    // perder o resto do que estava editando.
    const fn = sql.match(
      /CREATE OR REPLACE FUNCTION public\.sanear_textos_do_cardapio[\s\S]*?\$\$;/,
    )![0];
    expect(fn).not.toMatch(/RAISE EXCEPTION/);
    expect(fn).toContain("RETURN NEW");
  });

  it("não mexe em loja que nunca personalizou", () => {
    const fn = sql.match(
      /CREATE OR REPLACE FUNCTION public\.sanear_textos_do_cardapio[\s\S]*?\$\$;/,
    )![0];
    // Sem pacote de textos, sai cedo e devolve a ficha intacta.
    expect(fn).toMatch(/IF v_textos IS NULL THEN\s*\n\s*RETURN NEW;/);
  });

  it("preserva o resto das configurações da loja", () => {
    // O `||` junta com o que já existe. Um `:=` puro apagaria cor, layout e
    // tudo mais que mora na mesma ficha.
    const fn = sql.match(
      /CREATE OR REPLACE FUNCTION public\.sanear_textos_do_cardapio[\s\S]*?\$\$;/,
    )![0];
    expect(fn).toMatch(/NEW\.site_settings := NEW\.site_settings \|\| jsonb_build_object/);
  });

  it("descarta campo inventado por fora", () => {
    const fn = sql.match(
      /CREATE OR REPLACE FUNCTION public\.sanear_textos_do_cardapio[\s\S]*?\$\$;/,
    )![0];
    // Monta o pacote do zero a partir das chaves conhecidas, em vez de editar
    // o que veio.
    expect(fn).toMatch(/v_limpo jsonb := '\{\}'::jsonb/);
    expect(fn).toMatch(/FOR v_chave IN SELECT jsonb_object_keys\(v_limites\)/);
  });
});
