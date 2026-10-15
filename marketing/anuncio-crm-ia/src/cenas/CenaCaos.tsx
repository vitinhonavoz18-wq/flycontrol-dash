import { AbsoluteFill, useCurrentFrame } from "remotion";
import { Celular, BarraStatus } from "../comp/Celular";
import { Avatar, IconeWhats } from "../comp/Pecas";
import { Titulo } from "../comp/Titulo";
import { CARTOES, MENSAGENS } from "../dados";
import { COR, FONTE, entraSai, iv, onda, pop, suave } from "../estilo";
import T from "../tempos.json";

const CONGELA = T.congela;
const ALTURA_LINHA = 104;

/** A tela de conversas do mensageiro, enchendo de mensagens novas. */
export const TelaConversas: React.FC<{ f: number }> = ({ f }) => {
  const chegaram = T.c1_mensagens.filter((t) => f >= t).length;
  const totalNaoLidas = T.c1_mensagens.reduce(
    (soma, t, i) => soma + (f >= t ? Math.min(1 + Math.floor((f - t) / 22) + (i % 2), 6) : 0),
    0,
  );
  // última notificação em banner (só as 6 primeiras, depois fica rápido demais)
  const ultima = T.c1_mensagens.slice(0, 6).reduce((ac, t, i) => (f >= t ? i : ac), -1);
  const tBanner = ultima >= 0 ? T.c1_mensagens[ultima] : -999;
  const banner = Math.min(iv(f, [tBanner, tBanner + 8], [0, 1]), iv(f, [tBanner + 26, tBanner + 34], [1, 0]));

  return (
    <div style={{ position: "absolute", inset: 0, background: "#fff", fontFamily: FONTE.ui }}>
      <BarraStatus />
      <div style={{ padding: "8px 26px 10px", display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ fontWeight: 800, fontSize: 36, color: COR.whatsEscuro, letterSpacing: "-0.02em", flex: 1 }}>
          WhatsApp
        </div>
        <div
          style={{
            background: COR.whats,
            color: "#fff",
            fontWeight: 800,
            fontSize: 20,
            borderRadius: 999,
            padding: "4px 12px",
            transform: `scale(${1 + 0.15 * Math.max(0, 1 - (f - (T.c1_mensagens[chegaram - 1] ?? -99)) / 8)})`,
          }}
        >
          {totalNaoLidas}
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, padding: "2px 22px 12px" }}>
        {["Tudo", "Não lidas", "Grupos"].map((t, i) => (
          <div
            key={t}
            style={{
              fontSize: 18,
              fontWeight: 600,
              padding: "6px 14px",
              borderRadius: 999,
              background: i === 1 ? "#D9FDD3" : COR.cinzaClaro,
              color: i === 1 ? "#0A6B3A" : COR.cinza,
            }}
          >
            {t}
          </div>
        ))}
      </div>
      <div style={{ position: "relative", height: 900 }}>
        {MENSAGENS.map((m, i) => {
          const t = T.c1_mensagens[i];
          if (f < t) return null;
          // posição: quantas mensagens chegaram depois desta
          const depois = T.c1_mensagens.filter((u) => u > t && f >= u);
          let y = 0;
          for (const u of depois) y += iv(f, [u, u + 7], [0, ALTURA_LINHA]);
          const entra = iv(f, [t, t + 7], [0, 1]);
          const nao = Math.min(1 + Math.floor((f - t) / 22) + (i % 2), 6);
          const quique = pop(f, t + 2, 12);
          return (
            <div
              key={i}
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                top: y,
                height: ALTURA_LINHA,
                display: "flex",
                alignItems: "center",
                gap: 16,
                padding: "0 24px",
                opacity: entra,
                transform: `translateY(${(1 - entra) * -30}px)`,
                background: f - t < 14 ? `rgba(37,211,102,${0.1 * (1 - (f - t) / 14)})` : undefined,
              }}
            >
              <Avatar nome={m.nome} i={i} tam={64} />
              <div style={{ flex: 1, minWidth: 0, borderBottom: `1px solid ${COR.borda}`, paddingBottom: 14, paddingTop: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <span style={{ fontWeight: 700, fontSize: 24, color: COR.texto }}>{m.nome}</span>
                  <span style={{ fontWeight: 600, fontSize: 17, color: COR.whatsEscuro }}>19:42</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
                  <span
                    style={{
                      fontSize: 21,
                      color: "#3F4652",
                      fontWeight: 500,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      maxWidth: 230,
                    }}
                  >
                    {m.texto}
                  </span>
                  <span
                    style={{
                      minWidth: 30,
                      height: 30,
                      borderRadius: 15,
                      background: COR.whats,
                      color: "#fff",
                      fontWeight: 800,
                      fontSize: 17,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      transform: `scale(${quique})`,
                    }}
                  >
                    {nao}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {/* banner de notificação */}
      {ultima >= 0 && (
        <div
          style={{
            position: "absolute",
            left: 14,
            right: 14,
            top: 58,
            borderRadius: 26,
            background: "rgba(245,245,247,0.96)",
            boxShadow: "0 16px 30px -12px rgba(0,0,0,0.35)",
            padding: "14px 18px",
            display: "flex",
            gap: 14,
            alignItems: "center",
            opacity: banner,
            transform: `translateY(${(1 - banner) * -120}px)`,
          }}
        >
          <IconeWhats tam={46} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 19, color: COR.texto }}>{MENSAGENS[ultima].nome}</div>
            <div style={{ fontSize: 19, color: "#3F4652", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {MENSAGENS[ultima].texto}
            </div>
          </div>
          <span style={{ fontSize: 15, color: COR.cinza, alignSelf: "flex-start" }}>agora</span>
        </div>
      )}
    </div>
  );
};

/** Cartão flutuante de mensagem (cena 2). */
export const Cartao: React.FC<{ nome: string; texto: string; i: number; escala: number }> = ({ nome, texto, i, escala }) => (
  <div
    style={{
      display: "flex",
      gap: 12,
      alignItems: "center",
      background: "#fff",
      borderRadius: 24,
      padding: "14px 20px 14px 14px",
      boxShadow: "0 24px 50px -18px rgba(17,24,39,0.35), 0 0 0 1px rgba(17,24,39,0.06)",
      fontFamily: FONTE.ui,
      transform: `scale(${escala})`,
      whiteSpace: "nowrap",
    }}
  >
    <Avatar nome={nome} i={i + 3} tam={48} />
    <div>
      <div style={{ fontSize: 16, fontWeight: 700, color: COR.cinza, display: "flex", gap: 8, alignItems: "center" }}>
        <span style={{ width: 9, height: 9, borderRadius: 5, background: COR.whats }} />
        {nome}
      </div>
      <div style={{ fontSize: 24, fontWeight: 600, color: COR.texto }}>{texto}</div>
    </div>
  </div>
);

export const CenaCaos: React.FC = () => {
  const f = useCurrentFrame();
  const fm = Math.min(f, CONGELA); // o tempo "para" no congelamento
  const congelado = f >= CONGELA;
  const saida = iv(f, [346, 384], [0, 1], entraSai);

  // celular: sobe da parte de baixo e se acomoda; na cena 2 a câmera se aproxima
  const sobe = iv(fm, [10, 52], [0, 1], suave);
  const aproxima = iv(fm, [196, 262], [0, 1], entraSai);
  const celY = 2500 - (2500 - 1010) * sobe + aproxima * 30 - saida * 120;
  const celEscala = (1 + aproxima * 0.08) * (1 - saida * 0.35);
  const rx = 20 - sobe * 10 + onda(fm, 3, 0.03) * 2 - aproxima * 4;
  const ry = -20 + sobe * 12 + onda(fm, 5, 0.025) * 3 + aproxima * 6;
  const rz = 5 - sobe * 3 + onda(fm, 7, 0.02) * 0.6;

  // tremidinha quando chega mensagem rápida (fim da cena 1 e cena 2)
  const tremor = !congelado ? Math.sin(fm * 2.7) * iv(fm, [140, 300], [0, 2.2]) : 0;

  const congelaFlash = iv(f, [CONGELA, CONGELA + 3], [0, 1]) * iv(f, [CONGELA + 3, CONGELA + 22], [1, 0]);
  const dessatura = congelado ? iv(f, [CONGELA, CONGELA + 8], [0, 1]) * (1 - iv(f, [338, 350], [0, 1])) : 0;

  const cartoes = CARTOES.map((c, i) => {
    const t = T.c2_cartoes[i];
    const viva = fm >= t;
    const e = iv(fm, [t, t + 22], [0, 1], suave);
    const deriva = (fm - t) * 0.0;
    const x0 = 540;
    const y0 = 1010;
    let x = x0 + (c.x - x0) * e + onda(fm, i, 0.04) * 10 + deriva;
    let y = y0 + (c.y - y0) * e + onda(fm, i + 9, 0.035) * 12;
    // cena 3: os cartões voam para a lista organizada do CRM e se dissolvem nela
    const voa = iv(f, [348 + (i % 6) * 3, 384 + (i % 6) * 3], [0, 1], entraSai);
    const alvoY = 840 + (i % 5) * 96;
    x = x + (600 - x) * voa;
    y = y + (alvoY - y) * voa;
    const prof = c.z;
    const escala = (0.78 + (prof + 1) * 0.16) * (0.4 + 0.6 * e) * (1 - voa * 0.35);
    const desfoque = (prof < -0.2 ? (-prof - 0.2) * 5 : 0) * (1 - voa) + voa * 4;
    const op = viva ? Math.min(1, e * 2) * (1 - iv(voa, [0.55, 1], [0, 1], (v) => v)) : 0;
    return { c, i, x, y, escala, desfoque, op, prof };
  });

  const desenha = (lista: typeof cartoes) =>
    lista.map(({ c, i, x, y, escala, desfoque, op }) => (
      <div
        key={i}
        style={{
          position: "absolute",
          left: x,
          top: y,
          transform: `translate(-50%,-50%) rotate(${onda(i, i, 1) * 3}deg)`,
          opacity: op,
          filter: desfoque > 0.1 ? `blur(${desfoque}px)` : undefined,
        }}
      >
        <Cartao nome={c.nome} texto={c.texto} i={i} escala={escala} />
      </div>
    ));

  return (
    <AbsoluteFill style={{ filter: dessatura > 0 ? `saturate(${1 - dessatura * 0.55}) contrast(${1 + dessatura * 0.04})` : undefined }}>
      <Titulo
        f={f}
        entra={6}
        sai={190}
        y={272}
        tamanho={86}
        linhas={[{ texto: "MUITA MENSAGEM NO" }, { texto: "HORÁRIO DE PICO?", cor: COR.laranja }]}
      />
      <Titulo
        f={f}
        entra={204}
        sai={344}
        y={248}
        tamanho={84}
        passo={4}
        linhas={[{ texto: "ENQUANTO VOCÊ" }, { texto: "PRODUZ..." }, { texto: "QUEM RESPONDE?", cor: COR.laranja }]}
      />

      {desenha(cartoes.filter((c) => c.prof < 0))}

      <div style={{ position: "absolute", inset: 0, transform: `translateX(${tremor}px)` }}>
        <Celular
          x={540}
          y={celY}
          escala={celEscala}
          rx={rx}
          ry={ry}
          rz={rz}
          largura={420}
          altura={860}
          opacidade={1 - iv(saida, [0.4, 1], [0, 1], (v) => v)}
          desfoque={saida * 10}
        >
          <TelaConversas f={fm} />
        </Celular>
      </div>

      {desenha(cartoes.filter((c) => c.prof >= 0))}

      {/* congelamento: onda de "pausa" saindo do celular */}
      {congelado && f < CONGELA + 30 && (
        <div
          style={{
            position: "absolute",
            left: 540,
            top: 1010,
            width: iv(f, [CONGELA, CONGELA + 28], [20, 1900]),
            height: iv(f, [CONGELA, CONGELA + 28], [20, 1900]),
            borderRadius: "50%",
            border: `4px solid rgba(255,90,0,${0.7 * (1 - iv(f, [CONGELA, CONGELA + 28], [0, 1]))})`,
            transform: "translate(-50%,-50%)",
          }}
        />
      )}
      <AbsoluteFill style={{ background: "#fff", opacity: congelaFlash * 0.55, pointerEvents: "none" }} />
    </AbsoluteFill>
  );
};
