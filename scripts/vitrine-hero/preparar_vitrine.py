#!/usr/bin/env python3
"""
PREPARO DAS FOTOS DA VITRINE DO SITE (o alimento girando no topo da página).

O QUE ESTE PROGRAMA FAZ

A foto que o restaurante cadastrou no cardápio quase nunca serve do jeito que
está: tem mesa, prato, embalagem, parede. Para o alimento "flutuar" no topo do
site, ele precisa sair da foto sozinho, com o fundo realmente transparente.

É o trabalho do fotógrafo de cardápio que recorta o lanche da foto no
computador — só que feito por um programa, sempre do mesmo jeito.

As etapas, para cada foto:

  1. baixa a foto original (sem alterá-la — a original fica onde estava);
  2. encontra o alimento principal com um modelo de visão computacional
     gratuito e de código aberto (ISNet, via a biblioteca rembg);
  3. limpa a máscara: tira pedacinhos soltos e fecha furinhos;
  4. "descontamina" as bordas — tira a cor do fundo que ficou grudada no
     contorno, que é o que causa a auréola branca ou cinza em volta do pão;
  5. confere a qualidade (resolução, nitidez, se o alimento não está cortado
     pela borda da foto, se não sobrou só um pedaço);
  6. enquadra com uma margem pequena;
  7. salva em WebP com transparência, em dois tamanhos (computador e celular).

QUANDO RODA

  • No GitHub, pelo processo "Vitrine do site — preparar fotos"
    (.github/workflows/vitrine-hero.yml): de hora em hora ele pergunta ao banco
    se há foto pendente; se não houver, termina em segundos.
  • No computador, para testar uma foto solta:

        python scripts/vitrine-hero/preparar_vitrine.py --arquivo foto.jpg --saida recorte.webp

NADA AQUI É PAGO. O modelo é baixado uma vez do repositório público do rembg.
"""

from __future__ import annotations

import argparse
import hashlib
import io
import json
import os
import re
import sys
from datetime import datetime, timezone
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import asdict, dataclass, field

import numpy as np
from PIL import Image, ImageFilter, ImageOps

# ── Limites ────────────────────────────────────────────────────────────────

TAMANHO_MAXIMO_DOWNLOAD = 15 * 1024 * 1024  # 15 MB
LADO_MAXIMO_PROCESSAMENTO = 1600  # foto maior é reduzida antes do recorte
LADO_MINIMO_ORIGEM = 480  # foto menor que isso fica borrada no site
LADOS_DE_SAIDA = {"grande": 1200, "pequena": 640}
# BiRefNet (licença MIT): o melhor recorte entre os modelos abertos testados.
# A versão "lite" ficou visualmente igual à completa no teste e é 3x mais
# rápida. Para usar a completa: VITRINE_MODELO=birefnet-general.
MODELO = os.environ.get("VITRINE_MODELO", "birefnet-general-lite")
BUCKET = "hero-showcase"

# Cobertura: quanto da foto o alimento ocupa. Muito pouco = alimento minúsculo
# perdido na foto (vai pixelar ao ampliar). Quase tudo = o modelo não achou
# separação entre alimento e fundo.
COBERTURA_MINIMA = 0.06
COBERTURA_MAXIMA = 0.92
# Alimento encostado na borda da foto: no site ele apareceria "cortado no ar".
BORDA_CORTADA_MAXIMA = 0.10
# Nitidez mínima (variância do Laplaciano na região do alimento, escala 0-255).
NITIDEZ_MINIMA = 18.0


@dataclass
class Resultado:
    ok: bool
    motivo: str = ""
    largura: int = 0
    altura: int = 0
    preenchimento: float = 0.0
    qualidade: dict = field(default_factory=dict)


# ── Recorte ────────────────────────────────────────────────────────────────

_sessao = None


def sessao():
    """O modelo é carregado uma vez só por execução — carregar custa segundos."""
    global _sessao
    if _sessao is None:
        from rembg import new_session

        _sessao = new_session(MODELO)
    return _sessao


def abrir_imagem(dados: bytes) -> Image.Image:
    img = Image.open(io.BytesIO(dados))
    img = ImageOps.exif_transpose(img)  # foto de celular "deitada"
    return img.convert("RGB")


def reduzir(img: Image.Image, lado: int) -> Image.Image:
    if max(img.size) <= lado:
        return img
    escala = lado / max(img.size)
    return img.resize((round(img.width * escala), round(img.height * escala)), Image.LANCZOS)


def mascara_do_modelo(img: Image.Image) -> np.ndarray:
    """Máscara 0..1 do alimento, do mesmo tamanho da foto."""
    from rembg import remove

    m = remove(img, session=sessao(), only_mask=True, post_process_mask=False)
    return np.asarray(m.convert("L"), dtype=np.float32) / 255.0


def componentes(binaria: np.ndarray) -> tuple[np.ndarray, int]:
    """Rotula as "ilhas" da máscara (sem depender de scipy)."""
    from PIL import Image as _I

    # Rotulagem por varredura com união de conjuntos — suficiente para 1600 px.
    h, w = binaria.shape
    rot = np.zeros((h, w), dtype=np.int32)
    pai = [0]

    def raiz(a: int) -> int:
        while pai[a] != a:
            pai[a] = pai[pai[a]]
            a = pai[a]
        return a

    proximo = 1
    for y in range(h):
        linha = binaria[y]
        acima = rot[y - 1] if y else None
        for x in np.flatnonzero(linha):
            vizinhos = []
            if x and rot[y, x - 1]:
                vizinhos.append(rot[y, x - 1])
            if acima is not None and acima[x]:
                vizinhos.append(acima[x])
            if not vizinhos:
                pai.append(proximo)
                rot[y, x] = proximo
                proximo += 1
            else:
                menor = min(raiz(v) for v in vizinhos)
                rot[y, x] = menor
                for v in vizinhos:
                    rv = raiz(v)
                    if rv != menor:
                        pai[rv] = menor
    mapa = np.array([raiz(i) for i in range(proximo)], dtype=np.int32)
    rot = mapa[rot]
    _, rot = np.unique(rot, return_inverse=True)
    rot = rot.reshape(h, w)
    del _I
    return rot, int(rot.max())


def limpar_mascara(alfa: np.ndarray) -> np.ndarray:
    """
    Tira pedacinhos soltos (migalha de fundo que o modelo achou que era
    comida) e fecha furinhos pequenos dentro do alimento.

    A análise é feita numa versão reduzida da máscara (rápida) e o resultado é
    aplicado na máscara de tamanho original.
    """
    h, w = alfa.shape
    escala = min(1.0, 400 / max(h, w))
    pequena = np.asarray(
        Image.fromarray((alfa * 255).astype(np.uint8)).resize(
            (max(1, round(w * escala)), max(1, round(h * escala))), Image.BILINEAR
        ),
        dtype=np.float32,
    ) / 255.0

    solido = pequena > 0.5
    rot, n = componentes(solido)
    if n == 0:
        return alfa
    areas = np.bincount(rot.ravel())[1:]
    maior = areas.max()
    manter = np.zeros(n + 1, dtype=bool)
    manter[1:] = areas >= maior * 0.04  # ilha com menos de 4% da maior sai
    corpo = manter[rot]

    # Furos: regiões de "fundo" que não encostam na borda e são pequenas.
    fundo_rot, nf = componentes(~corpo)
    if nf:
        bordas = set(np.unique(np.concatenate([fundo_rot[0], fundo_rot[-1], fundo_rot[:, 0], fundo_rot[:, -1]])))
        areas_f = np.bincount(fundo_rot.ravel())
        for r in range(1, nf + 1):
            if r not in bordas and areas_f[r] < corpo.sum() * 0.01:
                corpo[fundo_rot == r] = True

    # Volta para o tamanho original e combina com o alfa fino do modelo:
    # dentro do corpo vale o alfa do modelo (bordas macias); fora, zero.
    zona = Image.fromarray(corpo.astype(np.uint8) * 255).resize((w, h), Image.BILINEAR)
    zona = zona.filter(ImageFilter.MaxFilter(5))
    zona = np.asarray(zona, dtype=np.float32) / 255.0
    limpo = np.minimum(alfa, zona)
    # Furinhos fechados: onde o corpo diz "é comida" e o modelo hesitou.
    furo = (np.asarray(Image.fromarray(corpo.astype(np.uint8) * 255).resize((w, h), Image.NEAREST)) > 0) & (limpo < 0.5)
    limpo[furo] = np.maximum(limpo[furo], 0.98)
    return limpo


def descontaminar(img: Image.Image, alfa: np.ndarray) -> np.ndarray:
    """
    Tira a cor do fundo que ficou "grudada" no contorno do alimento.

    Quando a borda é meio transparente (fio de queijo, folha de alface), o
    pixel guarda uma mistura da cor da comida com a cor da mesa. Sem esta
    etapa, ao pousar o recorte no fundo laranja do site, aparece um contorno
    branco ou cinza — a famosa "auréola". O cálculo (pymatting) estima qual
    seria a cor da comida sem o fundo.
    """
    from pymatting import estimate_foreground_ml

    rgb = np.asarray(img, dtype=np.float64) / 255.0
    frente = estimate_foreground_ml(rgb, alfa.astype(np.float64))
    return np.clip(frente * 255.0, 0, 255).astype(np.uint8)


def nitidez(img: Image.Image, alfa: np.ndarray) -> float:
    cinza = np.asarray(img.convert("L"), dtype=np.float32)
    lap = (
        -4 * cinza[1:-1, 1:-1]
        + cinza[:-2, 1:-1]
        + cinza[2:, 1:-1]
        + cinza[1:-1, :-2]
        + cinza[1:-1, 2:]
    )
    dentro = alfa[1:-1, 1:-1] > 0.9
    if dentro.sum() < 100:
        return 0.0
    return float(lap[dentro].var() ** 0.5)


def avaliar(img_original: Image.Image, img: Image.Image, alfa: np.ndarray) -> tuple[bool, str, dict]:
    """Confere se o recorte merece ir para o site. Devolve (ok, motivo, números)."""
    solido = alfa > 0.5
    cobertura = float(solido.mean())
    borda = np.concatenate([solido[0], solido[-1], solido[:, 0], solido[:, -1]])
    cortado = float(borda.mean())
    n_ilhas = componentes(
        np.asarray(Image.fromarray(solido.astype(np.uint8) * 255).resize((200, 200)), dtype=np.uint8) > 127
    )[1]
    nit = nitidez(img, alfa)
    lado_menor = min(img_original.size)
    q = {
        "lado_menor_origem": lado_menor,
        "cobertura": round(cobertura, 4),
        "borda_cortada": round(cortado, 4),
        "ilhas": n_ilhas,
        "nitidez": round(nit, 2),
        "modelo": MODELO,
    }
    if lado_menor < LADO_MINIMO_ORIGEM:
        return False, f"Foto pequena demais ({lado_menor}px no lado menor; o mínimo é {LADO_MINIMO_ORIGEM}px).", q
    if cobertura < COBERTURA_MINIMA:
        return False, "O alimento ocupa uma parte muito pequena da foto.", q
    if cobertura > COBERTURA_MAXIMA:
        return False, "Não foi possível separar o alimento do fundo (a foto parece ser só alimento ou só fundo).", q
    if cortado > BORDA_CORTADA_MAXIMA:
        return False, "O alimento está cortado pela borda da foto — flutuando no site ele apareceria pela metade.", q
    if nit < NITIDEZ_MINIMA:
        return False, "Foto desfocada ou com pouca definição.", q
    return True, "", q


def enquadrar(rgba: Image.Image) -> Image.Image:
    caixa = rgba.getchannel("A").point(lambda v: 255 if v > 8 else 0).getbbox()
    if not caixa:
        return rgba
    x0, y0, x1, y1 = caixa
    margem = round(max(x1 - x0, y1 - y0) * 0.03)
    return rgba.crop(
        (max(0, x0 - margem), max(0, y0 - margem), min(rgba.width, x1 + margem), min(rgba.height, y1 + margem))
    )


def para_webp(rgba: Image.Image, lado: int) -> bytes:
    img = rgba
    if max(img.size) > lado:
        escala = lado / max(img.size)
        img = img.resize((round(img.width * escala), round(img.height * escala)), Image.LANCZOS)
    saida = io.BytesIO()
    img.save(saida, "WEBP", quality=86, alpha_quality=95, method=6)
    return saida.getvalue()


def preparar(dados: bytes) -> tuple[Resultado, dict[str, bytes]]:
    """Da foto original ao recorte pronto. Não toca em rede nem em banco."""
    original = abrir_imagem(dados)
    img = reduzir(original, LADO_MAXIMO_PROCESSAMENTO)
    alfa = limpar_mascara(mascara_do_modelo(img))
    ok, motivo, q = avaliar(original, img, alfa)
    if not ok:
        return Resultado(ok=False, motivo=motivo, qualidade=q), {}
    frente = descontaminar(img, alfa)
    rgba = Image.fromarray(np.dstack([frente, (alfa * 255).round().astype(np.uint8)]), "RGBA")
    rgba = enquadrar(rgba)
    a = np.asarray(rgba.getchannel("A"), dtype=np.float32) / 255.0
    arquivos = {nome: para_webp(rgba, lado) for nome, lado in LADOS_DE_SAIDA.items()}
    grande = Image.open(io.BytesIO(arquivos["grande"]))
    return (
        Resultado(
            ok=True,
            largura=grande.width,
            altura=grande.height,
            preenchimento=round(float(a.mean()), 4),
            qualidade=q,
        ),
        arquivos,
    )


# ── Banco (Supabase) ───────────────────────────────────────────────────────


class Supabase:
    """
    Conversa com o Supabase usando a chave de serviço.

    A chave de serviço abre todas as portas do banco — por isso ela só existe
    nos segredos do GitHub, nunca no site nem no código.
    """

    def __init__(self, url: str, chave: str):
        self.url = url.rstrip("/")
        self.chave = chave
        self.projeto = urllib.parse.urlparse(self.url).hostname.split(".")[0]

    def _pedir(self, metodo: str, caminho: str, corpo=None, cabecalhos=None, bruto=False):
        h = {"apikey": self.chave, "Authorization": f"Bearer {self.chave}"}
        if cabecalhos:
            h.update(cabecalhos)
        dados = None
        if corpo is not None:
            if isinstance(corpo, (bytes, bytearray)):
                dados = bytes(corpo)
            else:
                dados = json.dumps(corpo).encode()
                h.setdefault("Content-Type", "application/json")
        req = urllib.request.Request(self.url + caminho, data=dados, method=metodo, headers=h)
        with urllib.request.urlopen(req, timeout=60) as r:
            conteudo = r.read()
        if bruto:
            return conteudo
        return json.loads(conteudo) if conteudo else None

    def reservar(self, limite: int) -> list[dict]:
        return self._pedir("POST", "/rest/v1/rpc/hero_showcase_claim", {"p_limit": limite}) or []

    def atualizar(self, item_id: str, campos: dict):
        self._pedir(
            "PATCH",
            f"/rest/v1/hero_showcase_items?id=eq.{urllib.parse.quote(item_id)}",
            campos,
            {"Prefer": "return=minimal"},
        )

    def enviar(self, caminho: str, conteudo: bytes):
        self._pedir(
            "POST",
            f"/storage/v1/object/{BUCKET}/{caminho}",
            conteudo,
            {"Content-Type": "image/webp", "x-upsert": "true", "Cache-Control": "31536000"},
        )

    def baixar_foto(self, url: str) -> bytes:
        """
        Fotos do nosso próprio depósito (que é privado) são baixadas com a chave
        de serviço. Fotos de outro endereço são baixadas como qualquer
        navegador baixaria — e só se forem imagem e de tamanho razoável.
        """
        u = urllib.parse.urlparse(url)
        if u.scheme != "https":
            raise ValueError("Endereço da foto precisa começar com https.")
        m = re.match(r"^/storage/v1/object/(?:sign|public|authenticated)/([a-z0-9-]+)/(.+)$", u.path)
        if u.hostname == f"{self.projeto}.supabase.co" and m:
            dados = self._pedir("GET", f"/storage/v1/object/{m.group(1)}/{m.group(2)}", bruto=True)
        else:
            req = urllib.request.Request(url, headers={"User-Agent": "FlyDelivery-Vitrine/1.0"})
            with urllib.request.urlopen(req, timeout=60) as r:
                tipo = (r.headers.get("Content-Type") or "").split(";")[0].strip().lower()
                if not tipo.startswith("image/") or tipo == "image/svg+xml":
                    raise ValueError(f"O endereço não é uma foto (tipo: {tipo or 'desconhecido'}).")
                dados = r.read(TAMANHO_MAXIMO_DOWNLOAD + 1)
        if len(dados) > TAMANHO_MAXIMO_DOWNLOAD:
            raise ValueError("Foto maior que 15 MB.")
        return dados


def processar_pendentes(limite: int, sb: "Supabase | None" = None) -> int:
    if sb is None:
        url = os.environ.get("SUPABASE_URL", "").strip()
        chave = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "").strip()
        if not url or not chave:
            print("::notice::SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY não configurados — nada a fazer.")
            return 0
        sb = Supabase(url, chave)
    itens = sb.reservar(limite)
    print(f"Fotos para preparar: {len(itens)}")
    falhas = 0
    for item in itens:
        item_id = item["id"]
        try:
            fonte = (item.get("image_url") or "").strip()
            if not fonte:
                raise ValueError("O produto não tem foto cadastrada.")
            dados = sb.baixar_foto(fonte)
            assinatura = hashlib.sha256(dados).hexdigest()

            # Mesma foto que já foi preparada: não processa de novo.
            if assinatura == item.get("source_hash") and item.get("cutout_path"):
                sb.atualizar(item_id, {"status": "pronto", "source_url": fonte, "status_detail": None})
                print(f"  {item_id}: foto não mudou, recorte reaproveitado")
                continue

            resultado, arquivos = preparar(dados)
            if not resultado.ok:
                sb.atualizar(
                    item_id,
                    {
                        "status": "falhou",
                        "status_detail": resultado.motivo,
                        "quality": resultado.qualidade,
                        "source_url": fonte,
                        "source_hash": assinatura,
                    },
                )
                print(f"  {item_id}: recusada — {resultado.motivo}")
                falhas += 1
                continue

            base = f"{item_id}/{assinatura[:16]}"
            sb.enviar(f"{base}-1200.webp", arquivos["grande"])
            sb.enviar(f"{base}-640.webp", arquivos["pequena"])
            sb.atualizar(
                item_id,
                {
                    "status": "pronto",
                    "status_detail": None,
                    "source_url": fonte,
                    "source_hash": assinatura,
                    "cutout_path": f"{base}-1200.webp",
                    "cutout_path_small": f"{base}-640.webp",
                    "cutout_width": resultado.largura,
                    "cutout_height": resultado.altura,
                    "fill_ratio": resultado.preenchimento,
                    "quality": resultado.qualidade,
                    "processed_at": datetime.now(timezone.utc).isoformat(),
                },
            )
            print(f"  {item_id}: pronta ({resultado.largura}x{resultado.altura})")
        except Exception as erro:  # noqa: BLE001 — uma foto ruim não pode parar as outras
            falhas += 1
            motivo = str(erro)[:300]
            print(f"::warning::{item_id}: {motivo}")
            try:
                sb.atualizar(item_id, {"status": "falhou", "status_detail": f"Erro ao preparar: {motivo}"})
            except Exception as erro2:  # noqa: BLE001
                print(f"::warning::{item_id}: não consegui registrar a falha: {erro2}")
    return falhas


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--arquivo", help="Prepara uma foto local (teste).")
    p.add_argument("--saida", help="Onde salvar o recorte da foto local (.webp).")
    p.add_argument("--pendentes", action="store_true", help="Prepara as fotos pendentes no banco.")
    p.add_argument("--limite", type=int, default=8, help="Máximo de fotos por execução.")
    a = p.parse_args()

    if a.arquivo:
        with open(a.arquivo, "rb") as f:
            resultado, arquivos = preparar(f.read())
        print(json.dumps(asdict(resultado), ensure_ascii=False, indent=2))
        if resultado.ok and a.saida:
            with open(a.saida, "wb") as f:
                f.write(arquivos["grande"])
            pequena = re.sub(r"(\.webp)?$", "-640.webp", a.saida, count=1)
            with open(pequena, "wb") as f:
                f.write(arquivos["pequena"])
        sys.exit(0 if resultado.ok else 2)

    if a.pendentes:
        falhas = processar_pendentes(a.limite)
        # Foto recusada por qualidade não é erro do processo: só avisa.
        print(f"Concluído. Fotos com problema: {falhas}")
        return

    p.print_help()


if __name__ == "__main__":
    main()
