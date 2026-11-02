/**
 * Ficha técnica da impressão, para o suporte.
 *
 * Quando a comanda sai errada, o lojista copia esta ficha e manda para o
 * suporte. Ela diz COMO a comanda foi montada (papel, letras por linha,
 * tamanho da letra, navegador) — e nunca O QUE tem nela: nada de nome,
 * telefone ou endereço de cliente. É como mandar a foto da impressora, e não
 * a foto do pedido.
 */

import type { Linha } from "./comanda";
import type { PerfilDeImpressao } from "./perfil";
import { MARCAS, METODOS, larguraDaAreaMm, tamanhoDaLetraMm } from "./perfil";
import { PAPEIS } from "./papel";
import type { Aviso } from "./validar";

export type Diagnostico = {
  perfil: string;
  papel: string;
  marca: string;
  metodo: string;
  colunas: number;
  larguraUtilMm: number;
  letraMm: number;
  letraPt: number;
  linhas: number;
  maiorLinha: number;
  acentos: boolean;
  navegador: string;
  integracao: string;
  avisos: Aviso[];
};

export function montarDiagnostico(args: {
  perfil: PerfilDeImpressao;
  linhas: Linha[];
  avisos: Aviso[];
  navegador?: string;
}): Diagnostico {
  const { perfil, linhas } = args;
  const larguraUtilMm = larguraDaAreaMm(perfil.papel) - 2 * perfil.margemMm;
  const letraMm = tamanhoDaLetraMm(perfil);
  return {
    perfil: perfil.nome,
    papel: PAPEIS.find((p) => p.id === perfil.papel)?.rotulo ?? perfil.papel,
    marca: MARCAS.find((m) => m.id === perfil.marca)?.rotulo ?? perfil.marca,
    metodo: METODOS.find((m) => m.id === perfil.metodo)?.rotulo ?? perfil.metodo,
    colunas: perfil.colunas,
    larguraUtilMm: Math.round(larguraUtilMm * 10) / 10,
    letraMm: Math.round(letraMm * 100) / 100,
    letraPt: Math.round((letraMm / 0.3528) * 10) / 10,
    linhas: linhas.length,
    maiorLinha: linhas.reduce((m, l) => Math.max(m, l.texto.length), 0),
    acentos: perfil.acentos,
    navegador: resumirNavegador(args.navegador ?? ""),
    integracao:
      "Impressão pelo navegador (janela de impressão do computador). PrintNode: não configurado neste sistema.",
    avisos: args.avisos,
  };
}

/** Só o nome e a versão do navegador e do sistema — sem identificar a pessoa. */
export function resumirNavegador(ua: string): string {
  if (!ua) return "desconhecido";
  const sistema = /Windows/i.test(ua)
    ? "Windows"
    : /Android/i.test(ua)
      ? "Android"
      : /iPhone|iPad/i.test(ua)
        ? "iOS"
        : /Mac OS X/i.test(ua)
          ? "Mac"
          : /Linux/i.test(ua)
            ? "Linux"
            : "outro";
  const nav =
    ua.match(/Edg\/(\d+)/)?.[0].replace("Edg", "Edge") ??
    ua.match(/OPR\/(\d+)/)?.[0].replace("OPR", "Opera") ??
    ua.match(/Firefox\/(\d+)/)?.[0] ??
    ua.match(/Chrome\/(\d+)/)?.[0] ??
    (ua.match(/Version\/(\d+).*Safari/) ? `Safari/${ua.match(/Version\/(\d+)/)?.[1]}` : "outro");
  return `${nav} · ${sistema}`;
}

export function diagnosticoEmTexto(d: Diagnostico): string {
  const linhas = [
    "DIAGNÓSTICO DE IMPRESSÃO — FlyControl",
    `Perfil: ${d.perfil}`,
    `Papel: ${d.papel}`,
    `Marca informada: ${d.marca}`,
    `Método: ${d.metodo}`,
    `Letras por linha: ${d.colunas}`,
    `Largura útil: ${String(d.larguraUtilMm).replace(".", ",")} mm`,
    `Tamanho da letra: ${String(d.letraMm).replace(".", ",")} mm (${String(d.letraPt).replace(".", ",")} pt)`,
    `Linhas na comanda: ${d.linhas} (a maior tem ${d.maiorLinha} letras)`,
    `Acentos: ${d.acentos ? "mantidos" : "removidos"}`,
    `Navegador: ${d.navegador}`,
    `Integração: ${d.integracao}`,
    d.avisos.length ? "Avisos:" : "Avisos: nenhum",
    ...d.avisos.map((a) => `- [${a.nivel}] ${a.mensagem}`),
  ];
  return linhas.join("\n");
}
