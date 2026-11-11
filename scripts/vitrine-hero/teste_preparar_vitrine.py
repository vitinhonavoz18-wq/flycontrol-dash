"""
Teste do caminho completo do recorte, com um banco de mentira na memória.

Roda sem internet e sem Supabase:

    python scripts/vitrine-hero/teste_preparar_vitrine.py

Confere quatro casos: foto boa vira recorte com fundo transparente; a mesma
foto de novo não é recortada outra vez; foto ruim é recusada com o motivo; e
foto que não baixa vira "falhou" sem derrubar as outras.
"""

import io
import os
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

sys.path.insert(0, os.path.dirname(__file__))
import preparar_vitrine as pv  # noqa: E402


def foto_de_prato(tamanho=(900, 700), nitida=True) -> bytes:
    """Um "lanche" desenhado sobre uma "mesa" com textura — com fundo de verdade."""
    rng = np.random.default_rng(7)
    mesa = (rng.normal(150, 18, (tamanho[1], tamanho[0], 3))).clip(0, 255).astype(np.uint8)
    img = Image.fromarray(mesa, "RGB").filter(ImageFilter.GaussianBlur(2))
    d = ImageDraw.Draw(img)
    w, h = tamanho
    d.ellipse((w * 0.22, h * 0.18, w * 0.78, h * 0.52), fill=(196, 112, 40))   # pão de cima
    d.rectangle((w * 0.2, h * 0.48, w * 0.8, h * 0.6), fill=(92, 52, 30))      # carne
    d.rectangle((w * 0.21, h * 0.44, w * 0.79, h * 0.5), fill=(80, 170, 60))   # alface
    d.ellipse((w * 0.22, h * 0.56, w * 0.78, h * 0.78), fill=(206, 128, 52))   # pão de baixo
    for i in range(400):  # gergelim: textura para a nitidez
        x, y = rng.uniform(w * 0.3, w * 0.7), rng.uniform(h * 0.22, h * 0.4)
        d.ellipse((x, y, x + 5, y + 3), fill=(245, 230, 190))
    if not nitida:
        img = img.filter(ImageFilter.GaussianBlur(9))
    saida = io.BytesIO()
    img.save(saida, "JPEG", quality=90)
    return saida.getvalue()


class BancoDeMentira:
    def __init__(self, itens, fotos):
        self.itens = {i["id"]: dict(i) for i in itens}
        self.fotos = fotos
        self.arquivos = {}

    def reservar(self, limite):
        return [dict(i) for i in list(self.itens.values())[:limite]]

    def atualizar(self, item_id, campos):
        self.itens[item_id].update(campos)

    def enviar(self, caminho, conteudo):
        self.arquivos[caminho] = conteudo

    def baixar_foto(self, url):
        if url not in self.fotos:
            raise ValueError("HTTP 404 ao baixar a foto")
        return self.fotos[url]


def main():
    boa = foto_de_prato()
    fotos = {"https://x/boa.jpg": boa, "https://x/borrada.jpg": foto_de_prato(nitida=False),
             "https://x/pequena.jpg": foto_de_prato((300, 240))}
    banco = BancoDeMentira(
        [
            {"id": "a", "image_url": "https://x/boa.jpg"},
            {"id": "b", "image_url": "https://x/borrada.jpg"},
            {"id": "c", "image_url": "https://x/pequena.jpg"},
            {"id": "d", "image_url": "https://x/sumiu.jpg"},
            {"id": "e", "image_url": ""},
        ],
        fotos,
    )
    falhas = pv.processar_pendentes(10, sb=banco)
    a, b, c, d, e = (banco.itens[k] for k in "abcde")

    erros = []

    def confere(cond, msg):
        print(("ok   " if cond else "ERRO ") + msg)
        if not cond:
            erros.append(msg)

    confere(a["status"] == "pronto", f"foto boa vira recorte pronto ({a.get('status_detail')})")
    grande = banco.arquivos.get(a.get("cutout_path", ""))
    confere(grande is not None and a.get("cutout_path_small") in banco.arquivos, "recortes grande e pequeno enviados ao depósito")
    if grande:
        im = Image.open(io.BytesIO(grande))
        alfa = np.asarray(im.convert("RGBA").getchannel("A"))
        confere(im.format == "WEBP" and im.mode == "RGBA", "recorte é WebP com canal de transparência")
        confere((alfa == 0).mean() > 0.05, f"fundo realmente transparente ({(alfa == 0).mean():.0%} dos pixels)")
        confere(a["cutout_width"] == im.width and a["cutout_height"] == im.height, "medidas registradas batem com o arquivo")
    confere(0 < float(a.get("fill_ratio") or 0) <= 1, "preenchimento registrado")
    confere(b["status"] == "falhou" and "desfocada" in (b.get("status_detail") or ""), f"foto borrada recusada: {b.get('status_detail')}")
    confere(c["status"] == "falhou" and "pequena" in (c.get("status_detail") or "").lower(), f"foto pequena recusada: {c.get('status_detail')}")
    confere(d["status"] == "falhou" and "404" in (d.get("status_detail") or ""), f"foto que não baixa: {d.get('status_detail')}")
    confere(e["status"] == "falhou" and "não tem foto" in (e.get("status_detail") or ""), "produto sem foto")
    confere(falhas == 4, f"quatro problemas contados ({falhas})")

    # Segunda passada com a mesma foto: não recorta de novo.
    enviados = len(banco.arquivos)
    banco.itens = {"a": dict(a, status="processando")}
    chamadas = {"n": 0}
    original = pv.preparar
    pv.preparar = lambda dados: (chamadas.__setitem__("n", chamadas["n"] + 1), original(dados))[1]
    pv.processar_pendentes(10, sb=banco)
    pv.preparar = original
    confere(chamadas["n"] == 0 and len(banco.arquivos) == enviados and banco.itens["a"]["status"] == "pronto",
            "mesma foto: recorte reaproveitado, nada processado de novo")

    print("\nTUDO CERTO" if not erros else f"\n{len(erros)} FALHA(S)")
    sys.exit(1 if erros else 0)


if __name__ == "__main__":
    main()
