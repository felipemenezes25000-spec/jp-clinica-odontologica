/**
 * Os efeitos sonoros, sintetizados.
 *
 * Nenhum arquivo: quatro sons curtos gerados pela Web Audio API. A escolha tem
 * três razões — não há licença a resolver, o bundle não cresce, e o timbre pode
 * ser afinado no código em vez de num editor de áudio.
 *
 * Todos abaixo de 220 ms e com ganho de pico baixo. O briefing pede som
 * "extremamente discreto"; qualquer coisa mais longa que isso vira UI de jogo.
 *
 * IMPORTANTE: isto só roda na web. No render do Remotion os efeitos não entram —
 * Web Audio depende do relógio do navegador e sairia fora de sincronia com o
 * frame. Para tê-los no MP4, entram na trilha, na edição de áudio.
 */

type Efeito = "whoosh" | "clique" | "pulso" | "sucesso";

let contexto: AudioContext | null = null;

function garantirContexto(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (contexto === null) {
    const Construtor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (Construtor === undefined) return null;
    contexto = new Construtor();
  }
  // O navegador suspende o contexto até haver gesto do usuário. Como todo som
  // aqui nasce de um clique ou do play, retomar na hora é seguro.
  if (contexto.state === "suspended") void contexto.resume();
  return contexto;
}

function envelope(ctx: AudioContext, pico: number, duracao: number): GainNode {
  const ganho = ctx.createGain();
  const agora = ctx.currentTime;
  ganho.gain.setValueAtTime(0, agora);
  ganho.gain.linearRampToValueAtTime(pico, agora + 0.012);
  ganho.gain.exponentialRampToValueAtTime(0.0001, agora + duracao);
  return ganho;
}

function tom(ctx: AudioContext, frequencia: number, duracao: number, pico: number, tipo: OscillatorType = "sine") {
  const osc = ctx.createOscillator();
  osc.type = tipo;
  osc.frequency.setValueAtTime(frequencia, ctx.currentTime);
  const ganho = envelope(ctx, pico, duracao);
  osc.connect(ganho).connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + duracao + 0.02);
}

function ruido(ctx: AudioContext, duracao: number, pico: number, corte: number) {
  const amostras = Math.floor(ctx.sampleRate * duracao);
  const buffer = ctx.createBuffer(1, amostras, ctx.sampleRate);
  const dados = buffer.getChannelData(0);
  for (let i = 0; i < amostras; i++) {
    // Decaimento embutido no próprio buffer: mais barato que automatizar ganho.
    dados[i] = (Math.random() * 2 - 1) * (1 - i / amostras);
  }
  const fonte = ctx.createBufferSource();
  fonte.buffer = buffer;
  const filtro = ctx.createBiquadFilter();
  filtro.type = "bandpass";
  filtro.frequency.setValueAtTime(corte, ctx.currentTime);
  filtro.Q.setValueAtTime(0.8, ctx.currentTime);
  const ganho = envelope(ctx, pico, duracao);
  fonte.connect(filtro).connect(ganho).connect(ctx.destination);
  fonte.start();
}

export function tocarEfeito(efeito: Efeito, ligado: boolean): void {
  if (!ligado) return;
  const ctx = garantirContexto();
  if (ctx === null) return;

  switch (efeito) {
    case "whoosh":
      ruido(ctx, 0.2, 0.05, 900);
      break;
    case "clique":
      tom(ctx, 1180, 0.05, 0.045, "triangle");
      break;
    case "pulso":
      tom(ctx, 620, 0.09, 0.03, "sine");
      break;
    case "sucesso":
      tom(ctx, 660, 0.1, 0.05, "sine");
      window.setTimeout(() => {
        const c = garantirContexto();
        if (c !== null) tom(c, 880, 0.16, 0.045, "sine");
      }, 90);
      break;
    default:
      break;
  }
}
