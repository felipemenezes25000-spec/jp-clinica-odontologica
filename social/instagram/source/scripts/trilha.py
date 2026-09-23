#!/usr/bin/env python3
"""
TRILHA SONORA — composta por código, sincronizada com o vídeo.

    python trilha.py entrada.json saida.wav

Chamado pelo `gerar-videos.mjs`, um por vídeo. A entrada traz a duração, o
instante da "virada" (fim do gancho), o instante do cartão final e a lista de
eventos do motor de vídeo — cada palavra que acende, cada check que se desenha,
cada transição em arco. A trilha é escrita em cima dessa lista.

============================================================================
 POR QUE COMPOR EM VEZ DE USAR UMA FAIXA PRONTA.

 1. LICENÇA. Música de banco "livre de royalties" quase nunca cobre mídia paga
    em nome de empresa de saúde sem uma licença estendida, e música "em alta"
    do Instagram não pode sair do Instagram — muito menos virar anúncio. Uma
    trilha sintetizada aqui, nota por nota, pertence a quem a gerou. Não há
    terceiro na cadeia.

 2. SINCRONIA. A virada da bateria cai EXATAMENTE no quadro em que o arco da
    marca revela a segunda cena, porque o compasso inteiro é deslocado para
    que o tempo forte coincida com ela. Cada check da lista tem a sua nota.
    Isso não se consegue colando uma faixa pronta por baixo.

 3. TESTE JUSTO. Nos anúncios, os três ganchos de um mesmo conceito recebem a
    MESMA semente — portanto a mesma música. Se o gancho B ganha do A, não foi
    por causa da trilha.
============================================================================

O arranjo, e o motivo de cada decisão:

  gancho (0 → virada)   pad + arpejo esparso + subida de ruído. Sem bateria:
                        os 2,8 s iniciais são da pergunta, não do ritmo.
  corpo (virada → CTA)  entra tudo: bumbo suave nos tempos 1 e 3, estalo no
                        2 e 4, chimbal no contratempo, baixo, arpejo em
                        colcheias. Andamento de 96 a 104 — o de "explicação
                        tranquila", não o de propaganda.
  cartão final          a bateria sai, o acorde resolve na tônica e um sino de
                        quatro notas assina. O último segundo desce em fade.

Nada é gravação, nada é sample. Tudo é seno, ruído filtrado e envelope.
"""

import json
import sys

import numpy as np
from scipy.io import wavfile
from scipy.signal import butter, fftconvolve, sosfilt

SR = 48000

# ---------------------------------------------------------------------------
# Harmonia. Duas progressões, ambas em modo maior, nenhuma com tensão forte:
# o assunto é saúde, e acorde menor demorado soa a notícia ruim.
# (baixo, [notas do pad])  — MIDI, pad em torno do dó central.
# ---------------------------------------------------------------------------
PROGRESSOES = {
    # IV – V – iii – vi   (a de "algo bom está para acontecer")
    "sobe": [
        (41, [53, 57, 60, 64]),  # Fmaj7
        (43, [55, 59, 62, 64]),  # G6
        (40, [52, 55, 59, 62]),  # Em7
        (45, [57, 60, 64, 67]),  # Am7
    ],
    # I – vi – IV – V   (a de "tudo em ordem")
    "calma": [
        (36, [55, 59, 60, 64]),  # Cmaj7
        (45, [57, 60, 64, 67]),  # Am7
        (41, [53, 57, 60, 64]),  # Fmaj7
        (43, [55, 59, 62, 67]),  # G
    ],
}
TONICA = (36, [55, 60, 64, 67])  # C — o acorde em que tudo termina


def hz(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def trilha(cfg):
    semente = cfg.get("semente", 1)
    rng = np.random.default_rng(semente)
    duracao = float(cfg["duracao"])
    virada = float(cfg["drop"])
    cta = float(cfg["cta"])
    eventos = cfg.get("eventos", [])

    bpm = [96, 100, 104][semente % 3]
    prog = PROGRESSOES["sobe" if (semente // 3) % 2 == 0 else "calma"]
    transp = [0, 2, -3][(semente // 6) % 3]  # dó, ré ou lá — varia entre vídeos
    beat = 60.0 / bpm
    compasso = 4 * beat

    # O compasso é deslocado para que um tempo forte caia exatamente na virada.
    t0 = virada - compasso * np.ceil(virada / compasso + 1e-9)

    N = int((duracao + 0.05) * SR)
    musica = np.zeros((2, N))
    pad_bus = np.zeros((2, N))  # o pad passa por um passa-alta antes de entrar
    envio = np.zeros((2, N))  # o que vai para a reverberação
    sfx = np.zeros((2, N))

    def pos(t):
        return int(round(t * SR))

    def soma(dst, sinal, t, pan=0.0, ganho=1.0):
        i = pos(t)
        if i >= dst.shape[1] or len(sinal) == 0:
            return
        if i < 0:
            sinal = sinal[-i:]
            i = 0
        n = min(len(sinal), dst.shape[1] - i)
        th = (pan + 1) * np.pi / 4
        dst[0, i : i + n] += sinal[:n] * np.cos(th) * ganho * 1.414
        dst[1, i : i + n] += sinal[:n] * np.sin(th) * ganho * 1.414

    def acorde_em(t):
        """Acorde vigente no instante t. No cartão final, sempre a tônica."""
        if t >= cta - 0.05:
            b, notas = TONICA
        else:
            k = int(np.floor((t - t0) / compasso)) % len(prog)
            b, notas = prog[k]
        return b + transp, [n + transp for n in notas]

    # ---------------------------------------------------------------- PAD
    # Cada acorde dura um compasso e solta 1,2 s por cima do seguinte: o
    # ataque de meio segundo de um cobre o relaxamento do outro, e o colchão
    # não "respira" na troca.
    n_comp = int(np.ceil((duracao - t0) / compasso)) + 1
    marcos = [t0 + k * compasso for k in range(n_comp)]
    if cta < duracao:
        marcos = [m for m in marcos if m < cta - 0.05] + [cta]
    for idx, ini in enumerate(marcos):
        fim = marcos[idx + 1] if idx + 1 < len(marcos) else duracao + 0.4
        _, notas = acorde_em(ini + 0.01)
        dur = fim - ini + 1.2
        tt = np.arange(int(dur * SR)) / SR
        env = np.minimum(1, tt / 0.5) * np.clip((dur - tt) / 1.2, 0, 1)
        env = env**1.5
        for m in notas:
            f = hz(m)
            for d, pan in ((-5, -0.55), (5, 0.55)):
                ff = f * 2 ** (d / 1200)
                ph = rng.uniform(0, 2 * np.pi)
                # Camada de oitava acima: é ela que o alto-falante do celular
                # reproduz. Sem ela o colchão inteiro mora abaixo de 400 Hz,
                # onde o telefone não chega, e a trilha "some" no aparelho.
                s = (
                    0.75 * np.sin(2 * np.pi * ff * tt + ph)
                    + 0.3 * np.sin(4 * np.pi * ff * tt + ph)
                    + 0.42 * np.sin(4 * np.pi * ff * 1.003 * tt)
                    + 0.14 * np.sin(6 * np.pi * ff * tt)
                    + 0.08 * np.sin(8 * np.pi * ff * tt)
                )
                s *= env * 0.03
                soma(pad_bus, s, ini, pan)
                soma(envio, s, ini, pan, 0.6)

    # ------------------------------------------------------------- ARPEJO
    # O pad entra no mix já sem a lama abaixo de 140 Hz: quem cuida do grave é
    # o baixo, e dois instrumentos disputando a mesma faixa só somam volume
    # que o celular não reproduz.
    hp_pad = butter(2, 140, "high", fs=SR, output="sos")
    musica += np.stack([sosfilt(hp_pad, pad_bus[c]) for c in range(2)])

    def pluck(f, vel, dur=0.9):
        """Nota dedilhada. Os harmônicos 2 a 5 decaem mais rápido que a
        fundamental — é o que dá o ataque brilhante de marimba/kalimba, e é a
        parte que o ouvido percebe primeiro num alto-falante pequeno."""
        tt = np.arange(int(dur * SR)) / SR
        env = np.minimum(1, tt / 0.003) * np.exp(-tt / 0.22)
        return (
            np.sin(2 * np.pi * f * tt)
            + 0.45 * np.sin(4 * np.pi * f * tt) * np.exp(-tt / 0.09)
            + 0.22 * np.sin(6 * np.pi * f * tt) * np.exp(-tt / 0.05)
            + 0.12 * np.sin(8 * np.pi * f * tt) * np.exp(-tt / 0.03)
            + 0.06 * np.sin(10 * np.pi * f * tt) * np.exp(-tt / 0.02)
        ) * env * vel

    padrao = [0, 2, 1, 3, 2, 1, 3, 2]
    passo = beat / 2
    k = 0
    t = t0
    while t < duracao - 0.3:
        dentro = virada <= t < cta
        # No gancho, só semínimas; no cartão final, mínimas.
        vale = dentro or (t < virada and k % 2 == 0) or (t >= cta and k % 4 == 0)
        if t >= -0.01 and vale:
            _, notas = acorde_em(t + 0.01)
            m = notas[padrao[k % len(padrao)]] + 12
            vel = 0.05 * rng.uniform(0.75, 1.0) * (1.0 if dentro else 0.8)
            s = pluck(hz(m), vel)
            pan = 0.32 if k % 2 else -0.32
            soma(musica, s, t, pan)
            soma(envio, s, t, pan, 0.8)
            # eco em colcheia pontuada, pingue-pongue
            for r in range(1, 3):
                soma(musica, s * (0.3**r), t + r * 0.75 * beat, -pan * (1 if r % 2 else -1))
        t += passo
        k += 1

    # ---------------------------------------------------------------- BAIXO
    lp_baixo = butter(2, 380, "low", fs=SR, output="sos")
    t = t0
    while t < cta:
        if t >= virada - 0.01:
            b, _ = acorde_em(t + 0.01)
            for off, dur in ((0.0, 1.4 * beat), (2.5 * beat, 1.2 * beat)):
                tt = np.arange(int((dur + 0.15) * SR)) / SR
                env = np.minimum(1, tt / 0.012) * np.clip((dur + 0.15 - tt) / 0.15, 0, 1)
                f = hz(b)
                # O 2º e o 3º harmônico são o baixo que o celular toca: a
                # fundamental (65–110 Hz) só existe em fone e caixa de som.
                s = (
                    np.sin(2 * np.pi * f * tt)
                    + 0.45 * np.sin(4 * np.pi * f * tt)
                    + 0.2 * np.sin(6 * np.pi * f * tt)
                ) * env * 0.06
                soma(musica, sosfilt(lp_baixo, s), t + off)
        t += compasso

    # -------------------------------------------------------------- BATERIA
    hp_estalo = butter(2, [1400, 5200], "band", fs=SR, output="sos")
    hp_chimbal = butter(2, 7500, "high", fs=SR, output="sos")
    hp_clique = butter(2, 2500, "high", fs=SR, output="sos")

    def bumbo():
        """Bumbo mais baixo que no primeiro corte, com um clique de ataque: o
        corpo (48 Hz) é para fone; o clique é o que marca o tempo no celular."""
        tt = np.arange(int(0.45 * SR)) / SR
        f = 48 + 72 * np.exp(-tt / 0.035)
        fase = 2 * np.pi * np.cumsum(f) / SR
        corpo = np.sin(fase) * np.exp(-tt / 0.2) * 0.15
        clique = sosfilt(hp_clique, rng.standard_normal(len(tt))) * np.exp(-tt / 0.004) * 0.05
        return corpo + clique

    def estalo():
        tt = np.arange(int(0.25 * SR)) / SR
        return sosfilt(hp_estalo, rng.standard_normal(len(tt))) * np.exp(-tt / 0.06) * 0.09

    def chimbal(v):
        tt = np.arange(int(0.08 * SR)) / SR
        return sosfilt(hp_chimbal, rng.standard_normal(len(tt))) * np.exp(-tt / 0.022) * v

    t = virada
    b = 0
    while t < cta - 0.05:
        fase = b % 4
        if fase in (0, 2):
            soma(musica, bumbo(), t)
        if fase in (1, 3):
            soma(musica, estalo(), t, 0.05)
            soma(envio, estalo(), t, 0.05, 0.5)
        soma(musica, chimbal(0.045), t + beat / 2, 0.22)
        t += beat
        b += 1

    # --------------------------------------------------- SUBIDA ATÉ A VIRADA
    def varredura(dur, f_ini, f_fim, pico=0.5, formato="subida"):
        """Ruído passando por um passa-baixa de corte móvel. O laço é por
        amostra porque o coeficiente muda a cada uma — são poucas dezenas de
        milhares de amostras, e vale mais que um filtro por blocos que estala
        na emenda."""
        n = int(dur * SR)
        ruido = rng.standard_normal(n)
        tt = np.arange(n) / n
        fc = f_ini * (f_fim / f_ini) ** tt
        a = 1 - np.exp(-2 * np.pi * fc / SR)
        y = np.empty(n)
        acc = 0.0
        for i in range(n):
            acc += a[i] * (ruido[i] - acc)
            y[i] = acc
        if formato == "subida":
            env = tt**2.2
        else:
            env = np.sin(np.pi * np.clip(tt / pico, 0, 1) / 2) * np.clip((1 - tt) / (1 - pico), 0, 1) ** 1.4
        return y * env

    dur_sub = min(1.6, max(0.6, virada - 0.2))
    s = varredura(dur_sub, 300, 7000) * 0.11
    soma(sfx, s, virada - dur_sub, -0.2)
    soma(sfx, s, virada - dur_sub, 0.2, 0.7)

    def boom():
        tt = np.arange(int(0.9 * SR)) / SR
        f = 38 + 60 * np.exp(-tt / 0.08)
        return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-tt / 0.35) * 0.12

    soma(sfx, boom(), virada)

    # ------------------------------------------------------ EFEITOS DO VÍDEO
    escala = [0, 2, 4, 7, 9, 12, 14, 16]  # pentatônica — nenhuma nota colide
    k_tick = 0

    def sino(f, dur=1.6, ganho=1.0):
        tt = np.arange(int(dur * SR)) / SR
        parc = [(1.0, 1.0, 1.4), (2.0, 0.45, 0.9), (2.76, 0.3, 0.6), (5.4, 0.12, 0.25)]
        s = sum(a * np.sin(2 * np.pi * f * r * tt) * np.exp(-tt / d) for r, a, d in parc)
        return s * np.minimum(1, tt / 0.002) * ganho

    for ev in eventos:
        te = float(ev["t"])
        tipo = ev["tipo"]
        if tipo == "whoosh":
            d = float(ev.get("dur", 0.5)) + 0.25
            s = varredura(d, 250, 5000, pico=0.55, formato="sopro") * 0.1
            soma(sfx, s, te - 0.08, -0.35)
            soma(sfx, s[::-1] * 0.4, te - 0.08, 0.35)
        elif tipo == "arco":
            if abs(te + float(ev.get("dur", 0.6)) - virada) < 0.15:
                continue  # a subida e o boom da virada já cobrem este arco
            d = float(ev.get("dur", 0.6)) + 0.35
            s = varredura(d, 200, 6000, pico=0.6, formato="sopro") * 0.12
            soma(sfx, s, te - 0.1, -0.3)
            soma(sfx, s, te - 0.1, 0.3, 0.8)
            soma(sfx, boom() * 0.7, te + float(ev.get("dur", 0.6)))
        elif tipo == "sopro":
            s = varredura(0.4, 400, 3500, pico=0.4, formato="sopro") * 0.05
            soma(sfx, s, te - 0.05, rng.uniform(-0.3, 0.3))
        elif tipo == "tick":
            _, notas = acorde_em(te)
            m = 72 + transp + escala[k_tick % len(escala)]
            k_tick += 1
            s = pluck(hz(m), 0.06, dur=0.6)
            soma(sfx, s, te, 0.15 * (1 if k_tick % 2 else -1))
            soma(envio, s, te, 0, 0.9)
        elif tipo == "pop":
            tt = np.arange(int(0.18 * SR)) / SR
            f = 520 + 520 * np.exp(-tt / 0.02)
            s = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-tt / 0.05) * 0.08
            soma(sfx, s, te)
            soma(envio, s, te, 0, 0.6)
        elif tipo == "brilho":
            for j, m in enumerate((84, 88, 91)):
                s = sino(hz(m + transp), 0.9, 0.018)
                soma(sfx, s, te + j * 0.05, -0.3 + 0.3 * j)
                soma(envio, s, te + j * 0.05, 0, 1.2)
        # ---- vocabulário do motor 3 ------------------------------------
        elif tipo == "impacto":
            # a palavra gigante do primeiro quadro: grave curto + ataque seco
            soma(sfx, boom() * 1.1, te)
            soma(sfx, estalo() * 0.7, te, 0.0)
            soma(envio, estalo() * 0.5, te, 0, 0.8)
        elif tipo == "voo":
            d = float(ev.get("dur", 0.55)) + 0.15
            s = varredura(d, 600, 7500, pico=0.7, formato="sopro") * 0.075
            soma(sfx, s, te - 0.05, -0.25)
            soma(sfx, s, te - 0.05, 0.25, 0.7)
        elif tipo == "risco":
            # traço que se desenha: ar fino, quase inaudível no celular
            s = varredura(0.55, 2500, 9000, pico=0.35, formato="sopro") * 0.03
            soma(sfx, s, te, rng.uniform(-0.4, 0.4))
        elif tipo == "rosca":
            # o parafuso descendo: cliques curtos que desaceleram
            d = float(ev.get("dur", 1.0))
            n_r = 9
            for j in range(n_r):
                u = j / (n_r - 1)
                tj = te + d * (1 - (1 - u) ** 0.6)
                tt = np.arange(int(0.03 * SR)) / SR
                cl = sosfilt(hp_clique, rng.standard_normal(len(tt))) * np.exp(-tt / 0.005) * 0.035
                soma(sfx, cl, tj, 0.12 * np.sin(j * 1.7))
        elif tipo == "encaixe":
            # peça que assenta: clique + corpo grave curto + nota
            tt = np.arange(int(0.05 * SR)) / SR
            cl = sosfilt(hp_clique, rng.standard_normal(len(tt))) * np.exp(-tt / 0.008) * 0.07
            soma(sfx, cl, te)
            soma(sfx, boom() * 0.45, te)
            s = sino(hz(79 + transp), 1.0, 0.035)
            soma(sfx, s, te + 0.02, 0.1)
            soma(envio, s, te + 0.02, 0, 1.0)
        elif tipo == "graos":
            d = float(ev.get("dur", 1.2))
            for j in range(16):
                tj = te + d * (j / 15) ** 1.3 + rng.uniform(-0.02, 0.02)
                s = pluck(hz(96 + transp + escala[j % 5]), 0.008, dur=0.12)
                soma(sfx, s, tj, rng.uniform(-0.5, 0.5))
        elif tipo == "varre":
            d = float(ev.get("dur", 1.2))
            s = varredura(d, 400, 4000, pico=0.5, formato="sopro") * 0.06
            soma(sfx, s, te, -0.2)
            soma(sfx, s[::-1], te, 0.2, 0.6)
        elif tipo == "toque":
            tt = np.arange(int(0.12 * SR)) / SR
            f = 1400 + 900 * np.exp(-tt / 0.012)
            s = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-tt / 0.025) * 0.05
            soma(sfx, s, te)
            soma(envio, s, te, 0, 0.7)
        elif tipo == "conta":
            d = float(ev.get("dur", 1.1))
            n_t = 12
            for j in range(n_t):
                # ticks densos no começo, espaçados no fim: a curva do contador
                u = j / (n_t - 1)
                tj = te + d * (1 - (1 - u) ** (1 / 3))
                s = pluck(hz(84 + transp + (j % 3) * 2), 0.018, dur=0.2)
                soma(sfx, s, tj, 0.2 * np.sin(j))
            s = sino(hz(79 + transp), 1.2, 0.05)
            soma(sfx, s, te + d, 0)
            soma(envio, s, te + d, 0, 1.0)

    # sino de assinatura no cartão final: tônica arpejada
    if cta < duracao:
        for j, m in enumerate((72, 76, 79, 84)):
            s = sino(hz(m + transp), 2.2, 0.05)
            soma(sfx, s, cta + 0.35 + j * 0.11, -0.25 + j * 0.17)
            soma(envio, s, cta + 0.35 + j * 0.11, 0, 1.0)

    # ----------------------------------------------------------- REVERB
    # Resposta de sala sintética: ruído estéreo com decaimento exponencial e
    # a cauda escurecida. Sala média, não catedral.
    n_ir = int(2.2 * SR)
    tt = np.arange(n_ir) / SR
    lp_ir = butter(2, 4500, "low", fs=SR, output="sos")
    ir = np.stack(
        [sosfilt(lp_ir, rng.standard_normal(n_ir)) * np.exp(-tt / 0.5) for _ in range(2)]
    )
    ir /= np.sqrt(np.sum(ir**2, axis=1, keepdims=True))
    molhado = np.stack([fftconvolve(envio[c], ir[c])[:N] for c in range(2)])

    mix = musica + sfx + 0.28 * molhado

    # ------------------------------------------------------------- MASTER
    # Limpeza de grave abaixo de 30 Hz, nível em torno de -16 dBFS RMS (o
    # Instagram normaliza perto de -14 LUFS; chegar um pouco abaixo evita que
    # a plataforma comprima), e um limitador suave para o pico nunca bater.
    hp = butter(2, 30, "high", fs=SR, output="sos")
    mix = np.stack([sosfilt(hp, mix[c]) for c in range(2)])

    # EQUALIZAÇÃO PARA O CELULAR. O primeiro corte da trilha tinha 65% da
    # energia abaixo de 250 Hz e 1,7% acima de 2 kHz — medido, não estimado.
    # Num alto-falante de telefone, que quase não reproduz grave, isso soa
    # abafado e baixo, e a normalização do Instagram ainda "gasta" o volume no
    # grave que ninguém ouve. Prateleira de -4 dB abaixo de 120 Hz e de +5 dB
    # acima de 2,5 kHz, as duas feitas por soma de filtro (sem fase estranha
    # no meio da banda).
    lp_grave = butter(2, 120, "low", fs=SR, output="sos")
    hp_agudo = butter(2, 2500, "high", fs=SR, output="sos")
    corte = 1 - 10 ** (-4 / 20)
    ganho = 10 ** (5 / 20) - 1
    mix = np.stack(
        [mix[c] - corte * sosfilt(lp_grave, mix[c]) + ganho * sosfilt(hp_agudo, mix[c]) for c in range(2)]
    )
    rms = np.sqrt(np.mean(mix**2)) + 1e-12
    mix *= 10 ** (-16 / 20) / rms
    teto = 10 ** (-1.2 / 20)
    mix = teto * np.tanh(mix / teto)

    n_ini = int(0.03 * SR)
    mix[:, :n_ini] *= np.linspace(0, 1, n_ini)
    n_fim = int(0.9 * SR)
    mix[:, -n_fim:] *= np.linspace(1, 0, n_fim) ** 1.5

    return mix, bpm


def main():
    # O terminal do Windows abre em cp1252 e o "·" do resumo sai trocado.
    sys.stdout.reconfigure(encoding="utf-8")
    entrada, saida = sys.argv[1], sys.argv[2]
    with open(entrada, encoding="utf-8") as f:
        cfg = json.load(f)
    mix, bpm = trilha(cfg)
    pcm = np.clip(mix.T * 32767, -32768, 32767).astype(np.int16)
    wavfile.write(saida, SR, pcm)
    pico = 20 * np.log10(np.max(np.abs(mix)) + 1e-12)
    rms = 20 * np.log10(np.sqrt(np.mean(mix**2)) + 1e-12)
    print(f"trilha {mix.shape[1] / SR:.1f}s · {bpm} bpm · pico {pico:.1f} dBFS · rms {rms:.1f} dBFS")


if __name__ == "__main__":
    main()
