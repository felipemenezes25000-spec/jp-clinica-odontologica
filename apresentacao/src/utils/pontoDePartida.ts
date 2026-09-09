import { CENAS_POSICIONADAS, DURACAO_TOTAL, FPS_FILME } from "@/data/linhaDoTempo";

/**
 * De onde o tour começa, lido da URL.
 *
 * `?cena=cobranca`   abre parado no início daquela cena
 * `?frame=5990`      abre parado naquele frame
 * `?t=3:08`          o mesmo, em minuto:segundo
 *
 * Serve para duas coisas do dia a dia: mandar para alguém o trecho exato que
 * precisa de revisão ("olha a cobrança") sem pedir para a pessoa arrastar a
 * barra, e conferir uma cena recém-mexida sem esperar os cinco minutos.
 *
 * Abre PARADO de propósito. Quem chega por um link desses veio olhar um quadro
 * específico; começar a tocar tiraria da tela justamente o que a pessoa veio
 * ver. O botão de play está logo ali.
 *
 * Entrada inválida é ignorada em silêncio — o tour abre normalmente, do começo.
 * Um link velho apontando para uma cena que não existe mais não pode virar
 * página quebrada.
 */
export function pontoDePartida(busca: string): number | null {
  const p = new URLSearchParams(busca);

  const cena = p.get("cena");
  if (cena !== null) {
    const achada = CENAS_POSICIONADAS.find((c) => c.id === cena);
    // Dois segundos DEPOIS do corte, e não no corte. No primeiro frame de uma
    // cena nada apareceu ainda — tudo está em opacidade zero esperando a
    // entrada — e quem abre o link vê um quadro vazio e acha que quebrou.
    // Dois segundos bastam para a composição estar de pé.
    if (achada !== undefined) {
      return limitar(achada.inicioFrame + Math.min(2 * FPS_FILME, achada.duracao - 1));
    }
  }

  const frame = p.get("frame");
  if (frame !== null) {
    const n = Number(frame);
    if (Number.isFinite(n)) return limitar(Math.round(n));
  }

  const tempo = p.get("t");
  if (tempo !== null) {
    const segundos = emSegundos(tempo);
    if (segundos !== null) return limitar(Math.round(segundos * FPS_FILME));
  }

  return null;
}

/** Aceita `188`, `3:08` e `3:08.5`. */
function emSegundos(texto: string): number | null {
  const partes = texto.split(":");
  if (partes.length > 2) return null;
  const numeros = partes.map(Number);
  if (numeros.some((n) => !Number.isFinite(n) || n < 0)) return null;
  return numeros.length === 2 ? numeros[0]! * 60 + numeros[1]! : numeros[0]!;
}

function limitar(frame: number): number {
  return Math.max(0, Math.min(DURACAO_TOTAL - 1, frame));
}
