import { describe, expect, it } from "vitest";
import {
  describeBadValue,
  normalizeSupabaseKey,
  normalizeSupabaseUrl,
  resolveSupabaseEnv,
} from "./env";

const OK = "https://knhenchgntttraaeewlj.supabase.co";

/**
 * Cada caso aqui é uma forma real de o valor chegar sujo. Todos derrubavam a
 * aplicação inteira com "Invalid supabaseUrl" — erro caro para causa boba.
 */
describe("limpeza do endereço", () => {
  it("aceita o valor já correto", () => {
    expect(normalizeSupabaseUrl(OK)).toBe(OK);
  });

  it("tira aspas copiadas junto de um arquivo .env", () => {
    // `VITE_SUPABASE_URL="https://..."` — copiar a linha inteira leva as aspas.
    expect(normalizeSupabaseUrl(`"${OK}"`)).toBe(OK);
    expect(normalizeSupabaseUrl(`'${OK}'`)).toBe(OK);
  });

  it("tira espaços e quebras de linha", () => {
    // Colar em campo de painel web costuma trazer o \n junto.
    expect(normalizeSupabaseUrl(`  ${OK}  `)).toBe(OK);
    expect(normalizeSupabaseUrl(`${OK}\n`)).toBe(OK);
  });

  it("completa o https:// quando só veio o domínio", () => {
    expect(normalizeSupabaseUrl("knhenchgntttraaeewlj.supabase.co")).toBe(OK);
  });

  it("conserta a barra faltando depois de https:", () => {
    // Caso real de produção: o valor tinha 39 caracteres em vez de 40, com
    // "https:/" no lugar de "https://". Derrubou o painel inteiro — é
    // verdadeiro, parece endereço, e não é.
    const comUmaBarra = "https:/knhenchgntttraaeewlj.supabase.co";
    expect(comUmaBarra).toHaveLength(39);
    expect(OK).toHaveLength(40);
    expect(normalizeSupabaseUrl(comUmaBarra)).toBe(OK);
  });

  it("conserta barras a mais também", () => {
    expect(normalizeSupabaseUrl("https:///knhenchgntttraaeewlj.supabase.co")).toBe(OK);
    expect(normalizeSupabaseUrl("https:knhenchgntttraaeewlj.supabase.co")).toBe(OK);
  });

  it("tira a barra final", () => {
    // Barra sobrando quebra a montagem de algumas rotas do supabase-js.
    expect(normalizeSupabaseUrl(`${OK}/`)).toBe(OK);
    expect(normalizeSupabaseUrl(`${OK}///`)).toBe(OK);
  });

  it("aguenta a combinação de todas as sujeiras", () => {
    expect(normalizeSupabaseUrl(' "knhenchgntttraaeewlj.supabase.co/" \n')).toBe(OK);
  });

  it("recusa o que não dá para aproveitar", () => {
    for (const bad of ["", "   ", '""', "https://", "cole-o-valor-aqui", null, undefined]) {
      expect(normalizeSupabaseUrl(bad)).toBeNull();
    }
  });
});

describe("limpeza da chave", () => {
  it("tira aspas e espaços", () => {
    expect(normalizeSupabaseKey('  "abc.def.ghi"  ')).toBe("abc.def.ghi");
  });

  it("recusa vazio", () => {
    expect(normalizeSupabaseKey("   ")).toBeNull();
    expect(normalizeSupabaseKey(undefined)).toBeNull();
  });
});

describe("mensagem de erro", () => {
  it("diz qual variável está errada", () => {
    // A mensagem antiga dizia só "Invalid supabaseUrl", sem apontar onde
    // mexer — foi o que transformou um erro de digitação em uma investigação.
    const result = resolveSupabaseEnv("cole-aqui", "chave-ok", {
      url: "VITE_SUPABASE_URL",
      key: "VITE_SUPABASE_PUBLISHABLE_KEY",
    });

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.message).toContain("VITE_SUPABASE_URL");
    expect(result.ok === false && result.message).not.toContain("VITE_SUPABASE_PUBLISHABLE_KEY");
  });

  it("não imprime a chave inteira", () => {
    // A mensagem aparece na tela e nos logs; a chave não pode vazar por ali.
    const secret = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.secreto-de-verdade";
    expect(describeBadValue(secret)).not.toContain("secreto-de-verdade");
    expect(describeBadValue(secret)).toContain("caracteres");
  });

  it("devolve os valores limpos quando dá certo", () => {
    const result = resolveSupabaseEnv(`"${OK}/"`, " chave ", {
      url: "SUPABASE_URL",
      key: "SUPABASE_PUBLISHABLE_KEY",
    });

    expect(result.ok).toBe(true);
    expect(result.ok === true && result.url).toBe(OK);
    expect(result.ok === true && result.key).toBe("chave");
  });
});
