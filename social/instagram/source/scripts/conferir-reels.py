#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
CONFERÊNCIA DOS REELS — o vídeo pronto contra o roteiro que o gerou.

    python conferir-reels.py                 # confere todos os N**
    python conferir-reels.py N01 N07         # só esses
    python conferir-reels.py --sem-ouvido    # pula a transcrição (sem rede)

============================================================================
 O PROBLEMA QUE ESTE ARQUIVO RESOLVE.

 "Assista ao vídeo inteiro antes de considerar pronto" é a instrução certa e
 é exatamente a que não escala: dezessete vídeos são dez minutos de atenção
 ininterrupta, e o erro que importa — uma sílaba comida, a música cobrindo a
 frase, um quadro preto no corte — é o que o olho cansado deixa passar no
 décimo quarto.

 Então a pergunta vira outra: o que dá para PROVAR sem assistir?

   FORMA ....... 1080×1920, 30 fps, H.264, yuv420p, AAC 48 kHz estéreo.
                 Um número errado aqui e o Instagram recodifica o vídeo
                 inteiro — é o caminho mais curto para entregar borrado.
   VOLUME ...... -14 LUFS integrado. Acima disso as plataformas abaixam o
                 mix na reprodução, e abaixam a VOZ junto.
   QUADRO PRETO  `blackdetect`. Um quadro preto no meio de um corte é o
                 defeito que mais grita e o que menos se vê revisando.
   A FALA ...... e esta é a que vale: o áudio FINAL, já com música por cima,
                 volta para transcrição e é comparado com o roteiro. Se a
                 transcrição bate, está provado que a narração sobreviveu à
                 mixagem — que é a única coisa que "música sem cobrir a voz"
                 quer dizer de verdade.

 O que este arquivo NÃO prova: se o vídeo é bonito, se o corte tem ritmo, se
 a ilustração faz sentido. Isso continua sendo trabalho de olho humano — mas
 agora sobre dezessete vídeos que já passaram pelo que é mecânico.
============================================================================
"""

import json
import os
import pathlib
import re
import subprocess
import sys
import time
import unicodedata
import urllib.request
import uuid
import difflib

AQUI = pathlib.Path(__file__).resolve().parent
KIT = AQUI.parent.parent
RAIZ = KIT.parent.parent
REELS = KIT / "exports/reels"
ROTEIROS = KIT / "source/roteiros"

# Abaixo disto a narração não sobreviveu à mixagem. 92% dá folga para o que o
# transcritor erra sozinho (pontuação, "pra"/"para", número por extenso).
ACERTO_MINIMO = 0.92


def ffprobe(arquivo, *args):
    return subprocess.run(
        ["ffprobe", "-v", "error", *args, str(arquivo)],
        capture_output=True, text=True, check=True,
    ).stdout.strip()


def chave_openai():
    for nome in (".env", ".env.local"):
        caminho = RAIZ / nome
        if not caminho.exists():
            continue
        for linha in caminho.read_text(encoding="utf-8").splitlines():
            if linha.startswith("OPENAI_API_KEY="):
                v = linha.split("=", 1)[1].strip().strip('"').strip("'")
                if v:
                    return v
    return None


def normalizar(t):
    t = unicodedata.normalize("NFD", t.lower())
    t = "".join(c for c in t if unicodedata.category(c) != "Mn")
    t = re.sub(r"[^a-z0-9 ]+", " ", t)
    return re.sub(r"\s+", " ", t).strip().split()


def transcrever(mp3, chave):
    dados = mp3.read_bytes()
    limite = "----" + uuid.uuid4().hex
    partes = []

    def campo(n, v):
        partes.append(
            f'--{limite}\r\nContent-Disposition: form-data; name="{n}"\r\n\r\n{v}\r\n'.encode()
        )

    campo("model", "whisper-1")
    campo("language", "pt")
    partes.append(
        f'--{limite}\r\nContent-Disposition: form-data; name="file"; '
        f'filename="{mp3.name}"\r\nContent-Type: audio/mpeg\r\n\r\n'.encode()
    )
    partes.append(dados)
    partes.append(f"\r\n--{limite}--\r\n".encode())
    corpo = b"".join(partes)
    req = urllib.request.Request(
        "https://api.openai.com/v1/audio/transcriptions",
        data=corpo,
        headers={
            "Authorization": f"Bearer {chave}",
            "Content-Type": f"multipart/form-data; boundary={limite}",
        },
    )
    return json.loads(urllib.request.urlopen(req, timeout=180).read())["text"]


def transcrever_com_paciencia(mp3, chave, tentativas=4):
    """O serviço é remoto e cai. Conferir dezessete vídeos com uma chamada
    de rede cada é garantir que UMA vai estourar o tempo — e sem repetição
    isso derruba a conferência inteira no décimo quarto arquivo, depois de
    já ter gasto todas as outras."""
    for n in range(tentativas):
        try:
            return transcrever(mp3, chave)
        except Exception as erro:
            if n == tentativas - 1:
                raise
            print(f"     (rede: tentativa {n + 1} falhou — {erro}; repetindo)")
            time.sleep(2.5 * (n + 1))


def conferir(roteiro, chave, tmp):
    r = json.loads(roteiro.read_text(encoding="utf-8"))
    mp4 = REELS / f"{r['arquivo']}.mp4"
    problemas = []
    notas = []

    if not mp4.exists():
        return r, [f"o MP4 não existe: {mp4.name}"], []

    # ── FORMA ────────────────────────────────────────────────────────────
    v = ffprobe(mp4, "-select_streams", "v:0", "-show_entries",
                "stream=width,height,r_frame_rate,codec_name,pix_fmt",
                "-of", "default=nw=1:nk=1").split("\n")
    codec, larg, alt, pix, fps = v[0], int(v[1]), int(v[2]), v[3], v[4]
    if (larg, alt) != (1080, 1920):
        problemas.append(f"resolução {larg}×{alt}, esperado 1080×1920")
    if fps != "30/1":
        problemas.append(f"{fps} fps, esperado 30")
    if codec != "h264":
        problemas.append(f"vídeo em {codec}, esperado h264")
    if pix != "yuv420p":
        problemas.append(f"pix_fmt {pix}, esperado yuv420p")

    a = ffprobe(mp4, "-select_streams", "a:0", "-show_entries",
                "stream=codec_name,sample_rate,channels",
                "-of", "default=nw=1:nk=1").split("\n")
    if a == [""]:
        problemas.append("SEM FAIXA DE ÁUDIO")
    else:
        if a[0] != "aac":
            problemas.append(f"áudio em {a[0]}, esperado aac")
        if a[1] != "48000":
            problemas.append(f"áudio a {a[1]} Hz, esperado 48000")
        if a[2] != "2":
            problemas.append(f"{a[2]} canal(is), esperado 2")

    dur = float(ffprobe(mp4, "-show_entries", "format=duration", "-of", "csv=p=0"))
    notas.append(f"{dur:.1f}s")
    if dur > 40:
        problemas.append(f"{dur:.1f}s — passa dos 40s do briefing")
    elif dur > 35:
        notas.append("acima da faixa ideal (20–35s)")

    # ── QUADRO PRETO ─────────────────────────────────────────────────────
    saida = subprocess.run(
        ["ffmpeg", "-hide_banner", "-nostats", "-i", str(mp4),
         "-vf", "blackdetect=d=0.06:pic_th=0.98", "-an", "-f", "null", "-"],
        capture_output=True, text=True,
    ).stderr
    pretos = re.findall(r"black_start:([\d.]+) black_end:([\d.]+)", saida)
    # um fim preto é o fade final legítimo; preto NO MEIO é defeito
    meio = [(s, e) for s, e in pretos if float(e) < dur - 0.4]
    if meio:
        problemas.append(f"quadro(s) preto(s) no meio: {meio}")

    # ── VOLUME ───────────────────────────────────────────────────────────
    saida = subprocess.run(
        ["ffmpeg", "-hide_banner", "-nostats", "-i", str(mp4),
         "-af", "ebur128=peak=true", "-f", "null", "-"],
        capture_output=True, text=True,
    ).stderr
    # findall + [-1]: o ebur128 imprime uma leitura por quadro ANTES do
    # resumo. `search` pega a primeira — que é o silêncio do primeiro quadro,
    # -70 LUFS, e reprova todo vídeo correto.
    todas = re.findall(r"I:\s+(-?[\d.]+) LUFS", saida)
    if todas:
        lufs = float(todas[-1])
        notas.append(f"{lufs:.1f} LUFS")
        if abs(lufs + 14) > 1.5:
            problemas.append(f"{lufs:.1f} LUFS, alvo -14")
    picos = re.findall(r"Peak:\s+(-?[\d.]+) dBFS", saida)
    if picos and float(picos[-1]) > -0.9:
        problemas.append(f"pico real {picos[-1]} dBFS — risco de distorção")

    # ── A FALA SOBREVIVEU À MÚSICA? ──────────────────────────────────────
    if chave:
        mp3 = tmp / f"{r['arquivo']}.mp3"
        subprocess.run(
            ["ffmpeg", "-v", "error", "-y", "-i", str(mp4),
             "-vn", "-ac", "1", "-ar", "16000", str(mp3)], check=True,
        )
        dito = transcrever_com_paciencia(mp3, chave)
        esperado = " ".join(
            (c.get("narracao") or "").replace("[[", "").replace("]]", "")
            for c in r["cenas"]
        )
        acerto = difflib.SequenceMatcher(
            None, normalizar(esperado), normalizar(dito)
        ).ratio()
        notas.append(f"fala {acerto * 100:.0f}%")
        if acerto < ACERTO_MINIMO:
            problemas.append(
                f"a narração não sobreviveu à mixagem ({acerto * 100:.0f}%)\n"
                f"       esperado: {esperado[:150]}…\n"
                f"       ouvido:   {dito[:150]}…"
            )
        mp3.unlink(missing_ok=True)

    return r, problemas, notas


def principal():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    chave = None if "--sem-ouvido" in sys.argv else chave_openai()
    if not chave and "--sem-ouvido" not in sys.argv:
        print("aviso: sem OPENAI_API_KEY — a fala não será conferida\n")

    tmp = pathlib.Path(os.environ.get("TEMP", "/tmp")) / "jp-conferir"
    tmp.mkdir(parents=True, exist_ok=True)

    roteiros = sorted(ROTEIROS.glob("N*.json"))
    if args:
        roteiros = [p for p in roteiros if any(a in p.name or a in p.stem for a in args)]

    total = 0
    for caminho in roteiros:
        r, problemas, notas = conferir(caminho, chave, tmp)
        marca = "✗" if problemas else "✓"
        print(f"{marca} {r['arquivo']:38s} {' · '.join(notas)}")
        for p in problemas:
            print(f"     → {p}")
        total += len(problemas)

    print()
    print(
        f"{len(roteiros)} vídeo(s) conferido(s) · "
        + ("nenhum problema" if total == 0 else f"{total} problema(s)")
    )
    return 1 if total else 0


if __name__ == "__main__":
    sys.exit(principal())
