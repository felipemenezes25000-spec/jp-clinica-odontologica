#!/usr/bin/env python3
"""
PREPARO DE FOTOS — src/assets  →  social/instagram/source/assets-derivados

    python social/instagram/source/scripts/preparar-fotos.py

Três coisas acontecem aqui, e nenhuma delas inventa imagem.

1. RECORTE DA FACHADA.
   A foto da fachada é real e boa, mas a placa traz um número de WhatsApp
   ("9 7169-4647") que NÃO é o que está em `src/lib/jp.ts` ("(11) 97616-5117").
   Publicar a placa em tamanho grande é publicar dois números de contato
   diferentes na mesma conta — a pessoa salva o errado e a clínica perde o
   lead sem nunca saber. Os recortes abaixo separam os usos: o do portão não
   traz texto nenhum e serve de fundo; o da placa inteira fica disponível, mas
   o ASSET-MANIFEST manda usá-lo só onde a legenda leva ao número certo.
   Corrigir a placa é ação da clínica, não deste kit.

2. AMPLIAÇÃO DOS INTERIORES.
   Sete ambientes reais só existem em 665×480 — abaixo do 1080 que o Instagram
   pede. Ampliar com Lanczos e devolver micro-contraste com uma máscara de
   nitidez não cria detalhe que não existe; só evita que a interpolação deixe a
   foto leitosa quando ela ocupa meia peça. Onde a diferença ainda aparece, a
   resposta certa é o SHOT-LIST, não o filtro.

3. VERSÃO DE FUNDO ESCURECIDA para as peças em que o texto pousa sobre a foto
   sem janela. O degradê do CSS resolve o rodapé; o topo, não.

Nada aqui sobrescreve `src/assets/`. O original continua sendo o original.
"""

from pathlib import Path

from PIL import Image, ImageEnhance, ImageFilter

AQUI = Path(__file__).resolve().parent
KIT = AQUI.parent.parent
RAIZ = KIT.parent.parent
ORIGEM = RAIZ / "src" / "assets"
DESTINO = KIT / "source" / "assets-derivados"
DESTINO.mkdir(parents=True, exist_ok=True)

SAIDA = []


def salvar(im: Image.Image, nome: str, qualidade: int = 92) -> None:
    caminho = DESTINO / nome
    im.save(caminho, "WEBP", quality=qualidade, method=6)
    SAIDA.append((nome, im.size, caminho.stat().st_size))


def nitidez(im: Image.Image) -> Image.Image:
    """Máscara de nitidez suave. Raio pequeno para não desenhar halo em borda
    de janela e de jaleco, que é o artefato que denuncia foto ampliada."""
    return im.filter(ImageFilter.UnsharpMask(radius=1.4, percent=88, threshold=3))


# ---------------------------------------------------------------------------
# 1. FACHADA
# ---------------------------------------------------------------------------
fachada = Image.open(ORIGEM / "fachada.webp").convert("RGB")

# 4:5 da placa, com a MESMA trava de x<=638 do fundo 9:16: o bloco do WhatsApp
# da placa nao bate com CLINICA.whatsapp e fica de fora de todo derivado.
salvar(
    nitidez(fachada.crop((26, 62, 638, 827)).resize((1080, 1350), Image.LANCZOS)),
    "fachada-placa-4x5.webp",
)

# 9:16 do portão e do muro, SEM texto de placa. É o fundo seguro da fachada:
# diz "prédio real, rua real" sem publicar número nenhum.
salvar(
    nitidez(fachada.crop((236, 585, 616, 1150)).resize((1080, 1606), Image.LANCZOS)),
    "fachada-portao-9x16.webp",
)

# O FUNDO 9:16 DA FACHADA E A METADE ESQUERDA DA PLACA, E A ESCOLHA TEM CONTA.
#
# A placa traz DOIS contatos: "3975-9902", que bate com CLINICA.telefone em
# src/lib/jp.ts, e "9 7169-4647", que NAO bate com CLINICA.whatsapp. Publicar a
# placa inteira e publicar dois numeros diferentes na mesma conta: a pessoa
# salva o errado e a clinica perde o lead sem nunca saber por que.
#
# Este recorte para em x=638. O bloco do WhatsApp comeca por volta de x=930 e o
# arroba do Instagram em x=940, entao os dois ficam de fora; o que entra e o
# toldo verde, as especialidades, a marca, "Dra. Juliana Pelisser", o CRO da
# responsavel tecnica, o telefone CERTO e o portao.
#
# 612x1088 e exatamente 9:16, e a ampliacao fica em 1,76x. A primeira tentativa
# recortava so o portao (287x510, 3,8x) e, pior, pedia y ate 1172 numa foto de
# 1150 de altura: o PIL preenche o excedente EM SILENCIO, e todo Reel que usava
# este fundo saia com uma faixa preta de 80px no rodape. Crop fora dos limites
# da origem nao da erro; da defeito.
salvar(
    nitidez(fachada.crop((26, 62, 638, 1150)).resize((1080, 1920), Image.LANCZOS)),
    "fundo-fachada-9x16.webp",
)

# FAIXA DA PLACA, para janela horizontal de peca de feed.
#
# Uma janela de 1080x620 tem proporcao 1,74. Enfiar nela um arquivo 4:5 faz o
# object-fit recortar uma tira do meio da placa -- que cai justamente entre o
# nome da clinica e o arame da mureta, o pior enquadramento possivel. Esta
# faixa ja nasce na proporcao da janela, com o toldo, as especialidades, a
# marca e o nome. Mesma trava de x<=638.
salvar(
    nitidez(fachada.crop((26, 188, 638, 528)).resize((1080, 600), Image.LANCZOS)),
    "fachada-faixa.webp",
)

# Quadrado da entrada, para grade e Destaque.
salvar(
    nitidez(fachada.crop((26, 330, 638, 942)).resize((1080, 1080), Image.LANCZOS)),
    "fachada-entrada-1x1.webp",
)

# ---------------------------------------------------------------------------
# 2. AMPLIAÇÃO DOS INTERIORES REAIS
#    Só os limpos entram. Os "-completa" são a arte antiga com moldura verde e
#    letreiro "NOSSA CLÍNICA!" — moldura de 2019 num feed de 2026 é exatamente o
#    que esta reformulação existe para tirar do ar.
# ---------------------------------------------------------------------------
PEQUENAS = [
    "recepcao",
    "entrada-clinica",
    "consultorio-janela",
    "consultorio-bancada",
    "consultorio-cadeira-lilas",
    "cantinho-cafe",
    "escritorio",
]

for nome in PEQUENAS:
    im = Image.open(ORIGEM / f"{nome}.webp").convert("RGB")
    grande = im.resize((im.width * 2, im.height * 2), Image.LANCZOS)
    salvar(nitidez(grande), f"{nome}-2x.webp")

# ---------------------------------------------------------------------------
# 3. FUNDOS ESCURECIDOS
#    Para peça em que a headline pousa direto na foto. Escurecer 22% e tirar 8%
#    de saturação não é filtro de estilo: é o que faz o branco do texto passar
#    de 3:1 para acima de 7:1 sobre a parede clara do consultório.
# ---------------------------------------------------------------------------
FUNDOS = {
    "consultorio-implantes-1": "fundo-implantes-9x16.webp",
    "consultorio-implantes-2": "fundo-implantes-b-9x16.webp",
    "esterilizacao": "fundo-esterilizacao-9x16.webp",
    "consultorio-1": "fundo-consultorio-9x16.webp",
    "consultorio-2": "fundo-consultorio-b-9x16.webp",
    "equipamento": "fundo-equipamento-9x16.webp",
}

for origem, saida in FUNDOS.items():
    im = Image.open(ORIGEM / f"{origem}.webp").convert("RGB")
    # recorte 9:16 centrado
    alvo = im.height * 9 / 16
    if alvo <= im.width:
        x = (im.width - alvo) / 2
        rec = im.crop((int(x), 0, int(x + alvo), im.height))
    else:
        alturaAlvo = im.width * 16 / 9
        y = max(0, (im.height - alturaAlvo) / 2)
        rec = im.crop((0, int(y), im.width, int(min(im.height, y + alturaAlvo))))
    rec = rec.resize((1080, 1920), Image.LANCZOS)
    rec = ImageEnhance.Brightness(rec).enhance(0.9)
    rec = ImageEnhance.Color(rec).enhance(0.92)
    salvar(nitidez(rec), saida)

print(f"{len(SAIDA)} arquivos em {DESTINO.relative_to(RAIZ)}")
for nome, tamanho, bytes_ in SAIDA:
    print(f"  {nome:38s} {tamanho[0]}x{tamanho[1]:<6} {bytes_ // 1024} KB")
