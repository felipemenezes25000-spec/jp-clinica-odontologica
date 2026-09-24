#!/usr/bin/env python
"""
NARRAÇÃO — roteiro JSON  →  uma faixa de voz por cena, com o tempo de cada
palavra.

    python narracao.py pedido.json saida.json

O pedido traz a voz, o ritmo e a lista de falas. A saída traz, para cada fala,
o arquivo de áudio, a duração medida no arquivo (não a estimada) e o instante
de início e fim de CADA PALAVRA.

============================================================================
 POR QUE A PALAVRA IMPORTA.

 Legenda de Reel não é transcrição: é a palavra acendendo no instante em que a
 voz a diz. O serviço devolve esse instante de graça — `boundary="WordBoundary"`
 — e é isso que faz a legenda parecer montada por um editor e não colada por
 cima. Sem isso sobra o de sempre: um parágrafo parado embaixo da tela.

 A DURAÇÃO DA CENA NASCE AQUI. O roteiro não escolhe mais quanto tempo uma cena
 dura; quem escolhe é a voz. A cena dura o que a fala dura, mais o respiro. É a
 única forma de a imagem nunca cortar a frase no meio — o defeito nº 1 de vídeo
 com narração colada depois.

 CACHE. O mesmo texto, na mesma voz, no mesmo ritmo, é o mesmo arquivo: a chave
 é o sha1 dos três. Refazer um roteiro inteiro depois de mexer em UMA frase
 baixa só aquela frase. Sem isso, cada ajuste de vírgula custaria 17 downloads.
============================================================================
"""

import asyncio
import hashlib
import json
import subprocess
import sys
from pathlib import Path

import edge_tts

AQUI = Path(__file__).resolve().parent
CACHE = AQUI.parent / ".cache-voz"

# Quanto de silêncio a cena guarda depois que a voz cala. Abaixo disto a
# próxima frase entra por cima do fim da anterior e o vídeo soa afobado.
RESPIRO_PADRAO = 0.34


def chave(texto: str, voz: str, ritmo: str, tom: str) -> str:
    cru = f"{voz}|{ritmo}|{tom}|{texto}".encode("utf-8")
    return hashlib.sha1(cru).hexdigest()[:20]


def duracao_real(arquivo: Path) -> float:
    """A duração do ARQUIVO, medida pelo ffprobe.

    O último `WordBoundary` termina antes do fim do mp3 — sobra o rabo de
    silêncio que o sintetizador sempre põe. Cortar a cena pelo último evento
    engole a sílaba final de quase toda frase.
    """
    saida = subprocess.run(
        [
            "ffprobe", "-v", "error",
            "-show_entries", "format=duration",
            "-of", "csv=p=0", str(arquivo),
        ],
        capture_output=True, text=True, check=True,
    )
    return float(saida.stdout.strip())


async def falar(texto: str, voz: str, ritmo: str, tom: str, destino: Path):
    """Sintetiza uma fala e devolve as marcas de palavra."""
    com = edge_tts.Communicate(
        texto, voz, rate=ritmo, pitch=tom, boundary="WordBoundary"
    )
    palavras = []
    audio = bytearray()
    async for pedaco in com.stream():
        if pedaco["type"] == "audio":
            audio.extend(pedaco["data"])
        elif pedaco["type"] == "WordBoundary":
            palavras.append(
                {
                    "texto": pedaco["text"],
                    "inicio": round(pedaco["offset"] / 1e7, 4),
                    "dur": round(pedaco["duration"] / 1e7, 4),
                }
            )
    if not audio:
        raise RuntimeError(f"o serviço não devolveu áudio para: {texto[:60]!r}")
    destino.write_bytes(bytes(audio))
    return palavras


async def principal():
    pedido = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
    voz = pedido.get("voz", "pt-BR-AntonioNeural")
    ritmo = pedido.get("ritmo", "+0%")
    tom = pedido.get("tom", "+0Hz")
    CACHE.mkdir(parents=True, exist_ok=True)

    cenas = []
    for i, cena in enumerate(pedido["cenas"]):
        texto = (cena.get("narracao") or "").strip()
        if not texto:
            cenas.append({"texto": "", "arquivo": None, "duracao": 0.0, "palavras": []})
            continue

        # A voz de uma cena pode divergir da do vídeo — é assim que o Reel 07
        # põe a clínica falando de si numa voz e a pergunta do gancho em outra.
        v = cena.get("voz", voz)
        r = cena.get("ritmo", ritmo)
        p = cena.get("tom", tom)

        k = chave(texto, v, r, p)
        mp3 = CACHE / f"{k}.mp3"
        marcas = CACHE / f"{k}.json"

        if mp3.exists() and marcas.exists():
            palavras = json.loads(marcas.read_text(encoding="utf-8"))
        else:
            for tentativa in range(4):
                try:
                    palavras = await falar(texto, v, r, p, mp3)
                    break
                except Exception as erro:  # rede instável: o serviço é remoto
                    if tentativa == 3:
                        raise
                    print(
                        f"  voz: tentativa {tentativa + 1} falhou ({erro}); repetindo",
                        file=sys.stderr,
                    )
                    await asyncio.sleep(1.5 * (tentativa + 1))
            marcas.write_text(
                json.dumps(palavras, ensure_ascii=False), encoding="utf-8"
            )

        dur = duracao_real(mp3)
        cenas.append(
            {
                "i": i,
                "texto": texto,
                "arquivo": str(mp3),
                "duracao": round(dur, 3),
                "respiro": cena.get("respiro", RESPIRO_PADRAO),
                "palavras": palavras,
                "voz": v,
            }
        )

    total = sum(c["duracao"] + c.get("respiro", 0) for c in cenas)
    Path(sys.argv[2]).write_text(
        json.dumps({"cenas": cenas, "total": round(total, 3)}, ensure_ascii=False),
        encoding="utf-8",
    )
    faladas = sum(1 for c in cenas if c["arquivo"])
    print(f"voz: {faladas} falas · {total:.1f}s")


if __name__ == "__main__":
    asyncio.run(principal())
