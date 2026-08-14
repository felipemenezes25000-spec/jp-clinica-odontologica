"""Gera os arquivos da marca a partir dos EPS originais da clínica.

    python scripts/gerar-marca.py

Lê `docs/marca/*.eps` e escreve `src/assets/marca/*.svg` mais os ícones de
`public/`. Rode de novo se a clínica entregar um EPS atualizado — nada aqui é
editado à mão.

Por que existe um conversor de EPS aqui dentro: os arquivos são PostScript da
CorelDRAW, e os operadores que ela emite para caminhos preenchidos são poucos
(m, l/L, c/C, v/V, y/Y, @c, F/f) e mapeiam quase 1:1 para SVG. Interpretar esse
subconjunto sai mais barato que exigir Ghostscript ou Inkscape instalados na
máquina de quem for mexer no site.

Precisa de: PyMuPDF e Pillow (só para os PNGs; os SVGs saem sem dependência).
"""

import io
import os
import re
import struct


def extrair_ps(caminho):
    d = open(caminho, "rb").read()
    if d[:4] == b"\xc5\xd0\xd3\xc6":  # wrapper DOS EPS com preview TIFF
        off, ln = struct.unpack("<II", d[4:12])
        d = d[off : off + ln]
    return d.decode("latin-1")


NUM = re.compile(r"^-?\d*\.?\d+(?:[eE][-+]?\d+)?$")


def fmt(v):
    s = f"{v:.4f}".rstrip("0").rstrip(".")
    return s if s not in ("-0", "") else "0"


def converter(caminho):
    ps = extrair_ps(caminho)
    corpo = ps[ps.find("%%EndSetup") :]
    corpo = re.sub(r"%[^\n]*", "", corpo)  # comentários

    pilha = []
    objetos = []  # (cor, [comandos])
    d = []
    cor = "#000000"
    atual = (0.0, 0.0)
    inicio = (0.0, 0.0)
    xs, ys = [], []

    def pop(n):
        vals = pilha[-n:]
        del pilha[-n:]
        return vals

    for tok in corpo.split():
        if NUM.match(tok):
            pilha.append(float(tok))
            continue

        if tok == "m":
            x, y = pop(2)
            d.append(f"M{fmt(x)} {fmt(y)}")
            atual = inicio = (x, y)
            xs.append(x)
            ys.append(y)
        elif tok in ("l", "L"):
            x, y = pop(2)
            d.append(f"L{fmt(x)} {fmt(y)}")
            atual = (x, y)
            xs.append(x)
            ys.append(y)
        elif tok in ("c", "C"):
            x1, y1, x2, y2, x3, y3 = pop(6)
            d.append(f"C{fmt(x1)} {fmt(y1)} {fmt(x2)} {fmt(y2)} {fmt(x3)} {fmt(y3)}")
            atual = (x3, y3)
            xs += [x1, x2, x3]
            ys += [y1, y2, y3]
        elif tok in ("v", "V"):  # primeiro controle = ponto atual
            x2, y2, x3, y3 = pop(4)
            x1, y1 = atual
            d.append(f"C{fmt(x1)} {fmt(y1)} {fmt(x2)} {fmt(y2)} {fmt(x3)} {fmt(y3)}")
            atual = (x3, y3)
            xs += [x2, x3]
            ys += [y2, y3]
        elif tok in ("y", "Y"):  # segundo controle = ponto final
            x1, y1, x3, y3 = pop(4)
            d.append(f"C{fmt(x1)} {fmt(y1)} {fmt(x3)} {fmt(y3)} {fmt(x3)} {fmt(y3)}")
            atual = (x3, y3)
            xs += [x1, x3]
            ys += [y1, y3]
        elif tok in ("@c", "@cp"):
            d.append("Z")
            atual = inicio
        elif tok in ("F", "f"):
            if tok == "f" and d and not d[-1].endswith("Z"):
                d.append("Z")
            if d:
                objetos.append((cor, "".join(d)))
            d = []
        elif tok == "create_rgb_color":
            r, g, b = pop(3)
            cor = "#%02X%02X%02X" % tuple(round(v * 255) for v in (r, g, b))
        elif tok == "@E":
            pop(4)
        elif tok in ("O", "@g", "@G", "R", "w", "j", "J", "M", "i", "A"):
            if pilha:
                pop(1)
        elif tok == "def":
            pilha.clear()
        elif tok in ("n", "N", "@np"):
            d = []
        # o resto (@sv, @rs, @sm, begin, end, @rax, ...) não afeta a geometria

    return objetos, (min(xs), min(ys), max(xs), max(ys))


RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__))) + "/"
MARCA = RAIZ + "docs/marca/"
DEST_SVG = RAIZ + "src/assets/marca/"
DEST_PUB = RAIZ + "public/"

ESCURO, CLARO, BRANCO = "#095902", "#56A805", "#FFFFFF"
DEEP = "#032F01"

# --- Índices dos objetos, lidos das caixas delimitadoras de cada EPS ----------
# logo-jp-1: 0,1 sombra do JP | 2 dente+rabo | 3 vão do sorriso | 4 folha
#            5 sombra do texto | 6 texto | 7 JP
L_JP, L_JP_SOMBRA = 7, 0
L_DENTE, L_SORRISO, L_FOLHA = 2, 3, 4
L_TEXTO, L_TEXTO_SOMBRA = 6, 5
# logo-jp-2: símbolo compacto = metade clara + metade escura do dente + JP
S_IDX = [10, 11, 16, 17]

num = re.compile(r"-?\d*\.?\d+")


def prec(d, casas=2):
    return re.sub(
        r"-?\d*\.?\d+",
        lambda m: f"{float(m.group()):.{casas}f}".rstrip("0").rstrip(".") or "0",
        d,
    )


def caixa(objetos, idx):
    xs, ys = [], []
    for i in idx:
        v = [float(x) for x in num.findall(objetos[i][1])]
        xs += v[0::2]
        ys += v[1::2]
    return min(xs), min(ys), max(xs), max(ys)


def deslocamento(objetos, a, b):
    """Deslocamento médio de a para b, quando um é cópia translada do outro."""
    na = [float(x) for x in num.findall(objetos[a][1])]
    nb = [float(x) for x in num.findall(objetos[b][1])]
    dx = sum(y - x for x, y in zip(na[0::2], nb[0::2])) / (len(na) // 2)
    dy = sum(y - x for x, y in zip(na[1::2], nb[1::2])) / (len(na) // 2)
    return round(dx, 4), round(dy, 4)


def svg(caixa_, corpo, titulo):
    x0, y0, x1, y1 = caixa_
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" '
        'xmlns:xlink="http://www.w3.org/1999/xlink" '
        f'viewBox="0 0 {fmt(x1 - x0)} {fmt(y1 - y0)}" '
        f'role="img" aria-label="{titulo}">'
        f'<g transform="translate({fmt(-x0)} {fmt(y1)}) scale(1 -1)">'
        f"{corpo}</g></svg>"
    )


def usar(alvo, x, y, cor):
    """<use> com xlink de reserva.

    Sem o fallback, um Safari antigo que ignore `href` não desenha nem o "JP" nem
    o "Clínica Odontológica" — some o nome inteiro e sobra só o dente. Os 40 bytes
    a mais valem esse seguro.
    """
    x, y = x + 0.0 or 0.0, y + 0.0 or 0.0  # evita "-0.0" no atributo
    pos = f'x="{x:g}" y="{y:g}" ' if (x or y) else ""
    return f'<use href="#{alvo}" xlink:href="#{alvo}" {pos}fill="{cor}"/>'


def lockup(lock, cx, escuro, claro):
    """Lockup horizontal. `escuro` pinta contorno e sombras; `claro`, o miolo.

    O vão do sorriso entra somado ao dente com fill-rule evenodd: assim ele é um
    furo de verdade e o fundo aparece por ele, em vez de um retângulo branco que
    só funcionaria sobre branco.
    """
    dx_txt, dy_txt = deslocamento(lock, L_TEXTO_SOMBRA, L_TEXTO)
    dx_jp, dy_jp = deslocamento(lock, L_JP_SOMBRA, L_JP)
    dente = prec(lock[L_DENTE][1]) + prec(lock[L_SORRISO][1])

    return svg(
        cx,
        "<defs>"
        f'<path id="jp" d="{prec(lock[L_JP][1])}"/>'
        f'<path id="tx" d="{prec(lock[L_TEXTO][1])}"/>'
        "</defs>"
        + usar("jp", -dx_jp, -dy_jp, escuro)
        + f'<path fill="{escuro}" fill-rule="evenodd" d="{dente}"/>'
        + f'<path fill="{claro}" d="{prec(lock[L_FOLHA][1])}"/>'
        + usar("tx", -dx_txt, -dy_txt, escuro)
        + usar("tx", 0, 0, claro)
        + usar("jp", 0, 0, claro),
        "JP Clínica Odontológica",
    )


def simbolo(sim, escuro, claro):
    cx = caixa(sim, S_IDX)
    corpo = ""
    for i in S_IDX:
        cor, d = sim[i]
        corpo += f'<path fill="{escuro if cor == ESCURO else claro}" d="{prec(d)}"/>'
    return svg(cx, corpo, "JP Clínica Odontológica")


def ladrilho(sim, escuro, claro, fundo, lado=64, raio=14, folga=0.10):
    """Símbolo centralizado num quadrado opaco — favicon, ícone de app."""
    x0, y0, x1, y1 = caixa(sim, S_IDX)
    w, h = x1 - x0, y1 - y0
    e = (lado * (1 - 2 * folga)) / max(w, h)
    dx, dy = (lado - w * e) / 2, (lado - h * e) / 2
    corpo = ""
    for i in S_IDX:
        cor, d = sim[i]
        corpo += f'<path fill="{escuro if cor == ESCURO else claro}" d="{prec(d)}"/>'
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {lado} {lado}" '
        'role="img" aria-label="JP Clínica Odontológica">'
        + (f'<rect width="{lado}" height="{lado}" rx="{raio}" fill="{fundo}"/>' if fundo else "")
        + f'<g transform="translate({fmt(dx - x0 * e)} {fmt(dy + y1 * e)}) '
        f'scale({fmt(e)} {fmt(-e)})">{corpo}</g></svg>'
    )


def rasterizador():
    """PyMuPDF e Pillow só entram na parte dos PNGs — os SVGs saem sem nada."""
    import fitz
    from PIL import Image

    return fitz, Image


def png(svg_txt, destino, largura, fundo=None):
    fitz, Image = rasterizador()
    tmp = os.path.join(os.path.dirname(destino), "_tmp.svg")
    open(tmp, "w", encoding="utf-8").write(svg_txt)
    d = fitz.open(tmp)
    e = largura / d[0].rect.width
    p = d[0].get_pixmap(matrix=fitz.Matrix(e, e), alpha=True)
    im = Image.open(io.BytesIO(p.tobytes("png"))).convert("RGBA")
    if fundo:
        base = Image.new("RGBA", im.size, fundo)
        base.alpha_composite(im)
        im = base
    im.save(destino)
    os.remove(tmp)
    return im.size


def og(lock, cx, destino, larg=1200, alt=630, ocupacao=0.44):
    """Cartão de compartilhamento: a marca, nas cores originais, sobre branco.

    A marca ocupa 44% da largura por causa de como o WhatsApp monta o preview:
    quando ele cai no formato de miniatura, corta um quadrado do centro da
    imagem — 630x630 de um cartão 1200x630, ou seja, some com 285px de cada
    ponta. Em 62% o corte decepava o "Odontológica"; em 52% encostava na borda.
    Em 44% a marca inteira cabe nos dois formatos, o largo e o quadrado.
    """
    fitz, Image = rasterizador()
    tela = Image.new("RGB", (larg, alt), (255, 255, 255))
    marca = lockup(lock, cx, ESCURO, CLARO)
    tmp = os.path.join(os.path.dirname(destino), "_tmp.svg")
    open(tmp, "w", encoding="utf-8").write(marca)
    d = fitz.open(tmp)
    e = (larg * ocupacao) / d[0].rect.width
    p = d[0].get_pixmap(matrix=fitz.Matrix(e, e), alpha=True)
    im = Image.open(io.BytesIO(p.tobytes("png"))).convert("RGBA")
    tela.paste(im, ((larg - im.width) // 2, (alt - im.height) // 2), im)
    tela.save(destino, quality=95)
    os.remove(tmp)
    return tela.size


if __name__ == "__main__":
    lock, cx = converter(MARCA + "logo-jp-1.eps")
    sim, _ = converter(MARCA + "logo-jp-2.eps")

    os.makedirs(DEST_SVG, exist_ok=True)

    arquivos = {
        DEST_SVG + "logo-jp.svg": lockup(lock, cx, ESCURO, CLARO),
        DEST_SVG + "logo-jp-claro.svg": lockup(lock, cx, BRANCO, CLARO),
        DEST_SVG + "marca-jp.svg": simbolo(sim, ESCURO, CLARO),
        DEST_SVG + "marca-jp-claro.svg": simbolo(sim, BRANCO, CLARO),
        DEST_PUB + "favicon.svg": ladrilho(sim, ESCURO, CLARO, BRANCO),
    }
    for caminho, conteudo in arquivos.items():
        open(caminho, "w", encoding="utf-8").write(conteudo)
        print(f"{os.path.basename(caminho):22} {len(conteudo) / 1024:6.1f} KB")

    tile = ladrilho(sim, ESCURO, CLARO, BRANCO)
    png(tile, DEST_PUB + "favicon-32.png", 32)
    png(tile, DEST_PUB + "favicon-96.png", 96)
    png(tile, DEST_PUB + "apple-touch-icon.png", 180, fundo=(255, 255, 255, 255))
    png(tile, DEST_PUB + "icon-192.png", 192, fundo=(255, 255, 255, 255))
    png(tile, DEST_PUB + "icon-512.png", 512, fundo=(255, 255, 255, 255))
    print("og.png", og(lock, cx, DEST_PUB + "og.png"))
