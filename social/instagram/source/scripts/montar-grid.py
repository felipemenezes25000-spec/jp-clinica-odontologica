#!/usr/bin/env python3
"""
PRÉVIA DO GRID — monta como os 12 primeiros posts ficam no perfil.

    python social/instagram/source/scripts/montar-grid.py

POR QUE ISTO EXISTE, se cada peça já foi conferida uma a uma.

Porque uma peça boa pode ser uma peça ruim ao lado de outras duas. O §21 do
briefing chama isso de "o feed deve respirar": três posts escuros seguidos, ou
três cards tipográficos em sequência, transformam um perfil bonito num bloco.
Isso é invisível olhando arquivo por arquivo e óbvio nesta imagem.

DUAS COISAS QUE ESTA PRÉVIA ACERTA E QUE UM MONTAGEM À MÃO ERRA:

1. O GRID É AO CONTRÁRIO. O Instagram mostra o mais novo primeiro, no canto
   superior esquerdo. A ordem de publicação 1→12 aparece no perfil como
   12, 11, 10 / 9, 8, 7 / ... Planejar o xadrez na ordem de publicação e depois
   publicar produz exatamente o desenho espelhado do que se planejou.

2. O RECORTE DAS CAPAS DE REEL. Capa de Reel é 9:16, mas o grid mostra a faixa
   4:5 CENTRAL dela. Colar a capa inteira na prévia mostraria um enquadramento
   que ninguém vai ver.

A saída vai para `exports/grid/`.
"""

import sys
from pathlib import Path

from PIL import Image, ImageDraw

# O terminal do Windows abre em cp1252, e um "→" num print derruba o script
# inteiro com UnicodeEncodeError depois de as imagens já terem sido geradas —
# erro que parece falha de render e não é.
sys.stdout.reconfigure(encoding="utf-8")

AQUI = Path(__file__).resolve().parent
KIT = AQUI.parent.parent
EXPORTS = KIT / "exports"
SAIDA = EXPORTS / "grid"
SAIDA.mkdir(parents=True, exist_ok=True)

# Ordem de PUBLICAÇÃO (post 1 primeiro). A ordem do §36, ajustada para o
# xadrez: nenhuma trinca do grid fica com três superfícies iguais.
PUBLICACAO = [
    ("reel-covers/jp_ig_reel_r01_cover_v01.png", "1 · Reel — Implante dói?", True),
    ("feed/jp_ig_feed_s04_recepcao_v01.png", "2 · Foto real da clínica", False),
    ("feed/jp_ig_feed_s01_sorrir_muda_tudo_v01.png", "3 · Sorrir muda tudo.", False),
    ("feed/jp_ig_feed_s09_implantes_v01.png", "4 · Implantes dentários", False),
    ("feed/jp_ig_feed_s06_atendimento_humano_v01.png", "5 · Equipe real", False),
    ("feed/jp_ig_feed_s03_google_v01.png", "6 · Prova social", False),
    ("reel-covers/jp_ig_reel_r02_cover_v01.png", "7 · Reel — Dentadura", True),
    ("feed/jp_ig_feed_s08_freguesia_v01.png", "8 · Freguesia do Ó", False),
    ("reel-covers/jp_ig_reel_r03_cover_v01.png", "9 · Reel — Enxerto", True),
    ("feed/jp_ig_feed_s02_24_anos_v01.png", "10 · 24 anos", False),
    ("feed/jp_ig_feed_s05_estrutura_v01.png", "11 · Estrutura", False),
    ("reel-covers/jp_ig_reel_r11_cover_v01.png", "12 · Reel — Conheça a JP", True),
]

CELULA = 360  # largura de cada miniatura na prévia
ALTURA = int(CELULA * 1.25)  # o grid do Instagram hoje é 4:5
ESPACO = 6


def miniatura(caminho: Path, e_reel: bool) -> Image.Image:
    im = Image.open(caminho).convert("RGB")
    if e_reel:
        # A faixa 4:5 central dos 1080×1920 — o que o perfil realmente mostra.
        topo = (im.height - 1350) // 2
        im = im.crop((0, topo, im.width, topo + 1350))
    return im.resize((CELULA, ALTURA), Image.LANCZOS)


def montar(ordem, nome, titulo):
    largura = CELULA * 3 + ESPACO * 2
    altura = ALTURA * 4 + ESPACO * 3
    folha = Image.new("RGB", (largura, altura), (255, 255, 255))
    for i, (rel, _rotulo, e_reel) in enumerate(ordem):
        caminho = EXPORTS / rel
        if not caminho.exists():
            print("  faltando: " + rel)
            continue
        folha.paste(
            miniatura(caminho, e_reel),
            ((i % 3) * (CELULA + ESPACO), (i // 3) * (ALTURA + ESPACO)),
        )
    folha.save(SAIDA / nome, "PNG")
    print("  " + titulo + " → exports/grid/" + nome)


# Como fica NO PERFIL: o mais recente primeiro.
montar(list(reversed(PUBLICACAO)), "jp_ig_grid_como_fica_no_perfil.png", "grid do perfil")

# Como sair PUBLICANDO: a ordem cronológica, para a equipe seguir.
montar(PUBLICACAO, "jp_ig_grid_ordem_de_publicacao.png", "ordem de publicação")

# Uma folha de rosto com o rótulo de cada posição, para imprimir e riscar.
largura = CELULA * 3 + ESPACO * 2
folha = Image.new("RGB", (largura, ALTURA * 4 + ESPACO * 3 + 120), (255, 255, 255))
d = ImageDraw.Draw(folha)
for i, (rel, rotulo, e_reel) in enumerate(PUBLICACAO):
    caminho = EXPORTS / rel
    if caminho.exists():
        folha.paste(
            miniatura(caminho, e_reel),
            ((i % 3) * (CELULA + ESPACO), (i // 3) * (ALTURA + ESPACO)),
        )
    d.text(
        ((i % 3) * (CELULA + ESPACO) + 8, (i // 3) * (ALTURA + ESPACO) + ALTURA - 26),
        rotulo,
        fill=(9, 89, 2),
    )
folha.save(SAIDA / "jp_ig_grid_com_rotulos.png", "PNG")
print("  folha rotulada  → exports/grid/jp_ig_grid_com_rotulos.png")
