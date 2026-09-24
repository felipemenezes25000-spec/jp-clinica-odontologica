#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
MONTA A ENTREGA dos 17 Reels de set/out 2026.

    python montar-reels-set-out.py

Junta numa pasta só o que vai para as mãos de quem publica — vídeo, capa e
legenda de cada Reel, na ordem de publicação — e fecha o zip dos MP4.

POR QUE UMA PASTA NOVA E NÃO A `exports/`. A `exports/` é o depósito do kit:
tem 34 vídeos de outras campanhas, três variações de gancho por anúncio e as
capas antigas. Quem vai publicar não precisa escolher entre 80 arquivos às
sete da manhã. Aqui ficam 17 vídeos, 17 capas e 17 legendas, com o número do
dia na frente do nome — a ordem do arquivo É a ordem de publicação.

O .srt vai junto de propósito: o Instagram e o Facebook aceitam o arquivo no
upload e ele vira legenda oficial do Reel, que é o que faz o vídeo continuar
compreensível para quem assiste sem som E para quem depende de leitor de
tela. A legenda queimada na imagem não faz esse segundo trabalho.
"""

import hashlib
import json
import pathlib
import shutil
import subprocess
import zipfile

AQUI = pathlib.Path(__file__).resolve().parent
KIT = AQUI.parent.parent
REELS = KIT / "exports/reels"
CAPAS = KIT / "exports/capas-set-out"
DESTINO = KIT / "JP_REELS_SET_OUT_2026"
ZIP = DESTINO / "JP_REELS_01_A_17.zip"


def duracao(arquivo):
    return float(
        subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "format=duration",
             "-of", "csv=p=0", str(arquivo)],
            capture_output=True, text=True, check=True,
        ).stdout.strip()
    )


def principal():
    roteiros = sorted((KIT / "source/roteiros").glob("N*.json"))
    if len(roteiros) != 17:
        raise SystemExit(f"esperava 17 roteiros, achei {len(roteiros)}")

    if DESTINO.exists():
        shutil.rmtree(DESTINO)
    DESTINO.mkdir(parents=True)

    linhas = []
    mp4s = []
    faltando = []

    for caminho in roteiros:
        r = json.loads(caminho.read_text(encoding="utf-8"))
        base = r["arquivo"]
        n = base.split("_", 1)[0]

        mp4 = REELS / f"{base}.mp4"
        srt = REELS / f"{base}.srt"
        capa = CAPAS / f"{n}_CAPA.png"

        for origem in (mp4, srt, capa):
            if not origem.exists():
                faltando.append(origem.name)
                continue
            shutil.copy2(origem, DESTINO / origem.name)

        if mp4.exists():
            mp4s.append(DESTINO / mp4.name)
            linhas.append((n, r["titulo"], duracao(mp4), mp4.stat().st_size))

    if faltando:
        raise SystemExit("faltam arquivos:\n  " + "\n  ".join(faltando))

    with zipfile.ZipFile(ZIP, "w", zipfile.ZIP_STORED) as z:
        # ZIP_STORED, não DEFLATE: H.264 já está comprimido, e comprimir de
        # novo custa minutos para economizar menos de 1%.
        for m in mp4s:
            z.write(m, m.name)

    print(f"{DESTINO}\n")
    total = 0
    for n, titulo, dur, tam in linhas:
        total += tam
        print(f"  {n}  {titulo[:44]:46s} {dur:5.1f}s  {tam / 1e6:5.1f} MB")
    print(f"\n  {len(mp4s)} vídeos · {total / 1e6:.0f} MB")
    print(f"  {ZIP.name} · {ZIP.stat().st_size / 1e6:.0f} MB")

    # a soma de verificação existe para quem receber o zip conferir que ele
    # chegou inteiro — arquivo de vídeo truncado abre e só falha no fim
    sha = hashlib.sha256(ZIP.read_bytes()).hexdigest()[:16]
    print(f"  sha256 (16): {sha}")


if __name__ == "__main__":
    principal()
