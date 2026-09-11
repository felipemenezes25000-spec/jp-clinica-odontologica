/**
 * O disjuntor — Fase F, item 26.
 *
 * O PROBLEMA QUE ELE RESOLVE não é "chamar um provedor que está fora". É o que
 * acontece DEPOIS disso, e que a Fase B tornou possível pela primeira vez.
 *
 * Agora existe uma fila com retry e backoff. Quando o provedor de IA cai, cada
 * turno tenta, espera o timeout, falha, volta para a fila, e tenta de novo — até
 * cinco vezes, por job, para TODOS os jobs. Cem pacientes esperando viram
 * quinhentas chamadas condenadas, cada uma segurando uma conexão pelo tempo
 * inteiro do timeout.
 *
 * O efeito colateral é pior do que a causa: o worker fica ocupado esperando
 * respostas que não vêm, e as clínicas cujo provedor está no ar param de ser
 * atendidas também. Uma queda vira duas.
 *
 * O DISJUNTOR CORTA A PERNA. Depois de N falhas seguidas, ele abre e as chamadas
 * seguintes falham NA HORA, sem rede. O job vai para o backoff sem ter gasto
 * trinta segundos de timeout, e o worker segue para o próximo.
 *
 * OS TRÊS ESTADOS, e o do meio é o que faz o desenho funcionar:
 *
 *   FECHADO      tudo normal. Conta as falhas seguidas.
 *
 *   ABERTO       corta na hora. Passado o tempo de descanso, vira meio-aberto.
 *
 *   MEIO-ABERTO  deixa passar UMA chamada, de sondagem. Se ela funciona, fecha;
 *                se falha, abre de novo pelo dobro do tempo.
 *
 * Sem o meio-aberto, a volta seria um degrau: o disjuntor fecharia por tempo e
 * cem chamadas cairiam juntas em cima de um provedor que talvez ainda esteja se
 * recuperando — e derrubariam de novo. Uma sondagem por vez transforma o degrau
 * em toque.
 *
 * O QUE ELE DELIBERADAMENTE NÃO FAZ:
 *
 *   NÃO CONTA ERRO DE ENTRADA. Um 400 por prompt inválido é defeito NOSSO, e
 *   não indisponibilidade do provedor. Abrir o disjuntor por causa disso
 *   derrubaria o atendimento de todo mundo por um bug que afeta uma conversa.
 *
 *   NÃO PERSISTE. O estado vive em memória do processo. Numa função serverless
 *   isso significa que cada instância aprende sozinha — o que é pouco, e é o
 *   suficiente: dentro de UMA execução do cron, que processa um lote inteiro, é
 *   ali que a cascata acontece.
 */

export type EstadoDisjuntor = "fechado" | "aberto" | "meio_aberto";

export type Politica = {
  /** Falhas seguidas antes de abrir. */
  limite: number;
  /** Quanto tempo fica aberto, em ms, antes da primeira sondagem. */
  descansoMs: number;
  /** Teto do descanso quando a sondagem falha de novo. */
  descansoMaximoMs: number;
};

export const POLITICA_PADRAO: Politica = {
  /*
   * CINCO, e não uma.
   *
   * Um provedor devolve 500 esporádico sem estar fora do ar — é a vida normal de
   * uma API. Abrir na primeira falha faria o disjuntor disparar todo dia, e um
   * mecanismo que dispara à toa é um mecanismo que alguém desliga.
   *
   * Cinco seguidas, com o contador zerando a cada sucesso, é um sinal difícil de
   * produzir por acidente.
   */
  limite: 5,
  // Trinta segundos: mais curto que o menor backoff da fila (30s), para o job
  // que voltar encontrar o disjuntor já disposto a sondar.
  descansoMs: 30_000,
  descansoMaximoMs: 5 * 60_000,
};

export type Leitura = {
  estado: EstadoDisjuntor;
  /** `true` quando a chamada pode ir. */
  liberado: boolean;
  falhasSeguidas: number;
  /** Quando a próxima sondagem é permitida. `null` quando está fechado. */
  liberaEm: Date | null;
};

/**
 * Um disjuntor. Recebe o relógio por parâmetro, e não lê `Date.now()`.
 *
 * O PROJETO INTEIRO FAZ ASSIM, e aqui a razão é mais forte do que em outros
 * lugares: um disjuntor é uma máquina de estados regida por TEMPO. Testá-lo com
 * relógio de parede significaria `sleep` de trinta segundos por caso, e a
 * alternativa — congelar o relógio global — apagaria justamente as corridas que
 * este objeto existe para administrar.
 */
export class Disjuntor {
  private falhas = 0;
  private abertoAte: number | null = null;
  private descansoAtual: number;
  private sondando = false;

  constructor(
    readonly nome: string,
    private readonly politica: Politica = POLITICA_PADRAO,
  ) {
    this.descansoAtual = politica.descansoMs;
  }

  ler(agora: Date): Leitura {
    const t = agora.getTime();

    if (this.abertoAte === null) {
      return { estado: "fechado", liberado: true, falhasSeguidas: this.falhas, liberaEm: null };
    }

    if (t < this.abertoAte) {
      return {
        estado: "aberto",
        liberado: false,
        falhasSeguidas: this.falhas,
        liberaEm: new Date(this.abertoAte),
      };
    }

    /*
     * MEIO-ABERTO: passou o descanso, mas o disjuntor NÃO fechou sozinho.
     *
     * `liberado` é true aqui — uma chamada passa. `sondando` marca que ela é a
     * sondagem, e enquanto ela não voltar, a próxima leitura ainda diz
     * meio-aberto. Não há trava contra duas sondagens simultâneas, e isso é
     * deliberado: travar exigiria estado compartilhado entre instâncias, que é
     * exatamente o que este objeto não tem. Duas sondagens em vez de cem já é a
     * diferença que importa.
     */
    this.sondando = true;
    return {
      estado: "meio_aberto",
      liberado: true,
      falhasSeguidas: this.falhas,
      liberaEm: new Date(this.abertoAte),
    };
  }

  /** A chamada funcionou. */
  sucesso(): void {
    this.falhas = 0;
    this.abertoAte = null;
    this.sondando = false;
    // O descanso volta ao mínimo: o próximo incidente começa do zero, e não
    // herda a paciência acumulada no anterior.
    this.descansoAtual = this.politica.descansoMs;
  }

  /**
   * A chamada falhou por INDISPONIBILIDADE.
   *
   * Ver `contaComoQueda` para o que entra aqui e o que não entra.
   */
  falha(agora: Date): void {
    this.falhas += 1;

    if (this.sondando) {
      // A sondagem falhou: o provedor ainda não voltou. Dobra o descanso, com
      // teto — insistir no mesmo ritmo contra uma queda longa é o que
      // transforma incidente em tempestade de retry.
      this.sondando = false;
      this.descansoAtual = Math.min(this.descansoAtual * 2, this.politica.descansoMaximoMs);
      this.abertoAte = agora.getTime() + this.descansoAtual;
      return;
    }

    if (this.falhas >= this.politica.limite) {
      this.abertoAte = agora.getTime() + this.descansoAtual;
    }
  }

  /** Só para teste e para a tela de saúde: volta ao estado de fábrica. */
  reiniciar(): void {
    this.falhas = 0;
    this.abertoAte = null;
    this.sondando = false;
    this.descansoAtual = this.politica.descansoMs;
  }
}

/**
 * Este erro conta como queda do provedor?
 *
 * A DISTINÇÃO É O CORAÇÃO DO MECANISMO, e errá-la é pior do que não ter
 * disjuntor nenhum:
 *
 *   CONTA     timeout, 5xx, 429, DNS, conexão recusada. São sinais de que o
 *             outro lado não está atendendo, e insistir só piora.
 *
 *   NÃO CONTA 400, 401, 403, 422. São defeitos NOSSOS — prompt malformado,
 *             chave errada, parâmetro inválido. Abrir o disjuntor por causa
 *             deles derrubaria o atendimento de TODAS as clínicas por causa de
 *             um bug que afeta uma conversa.
 *
 * O 401 é o caso mais tentador de classificar errado: parece "o provedor
 * recusou". Mas uma chave expirada não melhora com descanso — ela melhora com
 * alguém trocando a chave. O disjuntor só atrasaria a descoberta.
 */
export function contaComoQueda(codigo: string, status?: number): boolean {
  if (typeof status === "number") {
    if (status === 429) return true;
    if (status >= 500) return true;
    if (status >= 400) return false;
  }

  const c = codigo.toLowerCase();
  return (
    c.includes("timeout") ||
    c.includes("indisponivel") ||
    c.includes("indisponível") ||
    c.includes("econn") ||
    c.includes("enotfound") ||
    c.includes("network") ||
    c.includes("rede") ||
    c.includes("fetch")
  );
}

/* -------------------------------------------------------------------------- */
/* O registro de disjuntores                                                  */
/* -------------------------------------------------------------------------- */

const disjuntores = new Map<string, Disjuntor>();

/**
 * Um disjuntor por (organização, provedor, finalidade).
 *
 * POR QUE NÃO UM SÓ POR PROVEDOR. Porque as clínicas usam chaves diferentes —
 * o BYOK da Fase anterior existe justamente para isso. Uma clínica com a cota
 * estourada não pode abrir o disjuntor da clínica vizinha, que está com a conta
 * em dia. Compartilhar o estado transformaria um problema de cobrança de um
 * cliente em indisponibilidade de todos.
 */
export function disjuntorDe(chave: string, politica?: Politica): Disjuntor {
  let d = disjuntores.get(chave);
  if (d === undefined) {
    d = new Disjuntor(chave, politica);
    disjuntores.set(chave, d);
  }
  return d;
}

/** O panorama para a tela de saúde. Só o que está machucado interessa. */
export function disjuntoresAbertos(agora: Date): { chave: string; leitura: Leitura }[] {
  const abertos: { chave: string; leitura: Leitura }[] = [];
  for (const [chave, d] of disjuntores) {
    const leitura = d.ler(agora);
    if (leitura.estado !== "fechado") abertos.push({ chave, leitura });
  }
  return abertos;
}

export function _limparDisjuntores(): void {
  disjuntores.clear();
}
