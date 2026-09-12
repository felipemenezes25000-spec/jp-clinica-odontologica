/**
 * O freio de tentativa de login.
 *
 * ========================================================================
 *  O QUE FALTAVA: nada segurava quem tentava senha em sequência.
 *
 *  O login do CRC está exposto na internet, e o que existia era um `registrar`
 *  de aviso a cada recusa — útil para descobrir DEPOIS, inútil para impedir. Um
 *  script comum faz milhares de tentativas por minuto contra uma lista de
 *  e-mails vazados, e a única barreira era o `scrypt` ser lento.
 *
 *  O scrypt ajuda e não resolve: ele encarece cada tentativa para o atacante e
 *  encarece TAMBÉM para o servidor. Sem freio, uma rajada de login vira uma
 *  rajada de scrypt, e o painel inteiro fica lento para quem está trabalhando.
 * ========================================================================
 *
 * POR QUE É PURO E EM MEMÓRIA, e o que isso custa.
 *
 * Puro porque a regra — quantas tentativas, em quanto tempo, quanto espera —
 * merece teste sem banco e sem relógio de parede.
 *
 * Em memória porque a alternativa seria uma tabela, e uma tabela por tentativa
 * de login transforma um ataque de senha num ataque de escrita: o atacante
 * passaria a encher o banco de graça. O custo é que, em serverless, cada
 * instância tem o próprio contador — então o teto real é "N por instância".
 * Isso reduz a eficácia contra um ataque distribuído e não a zera, e é bem
 * melhor do que o nada que existia.
 *
 * A DEFESA DE VERDADE contra ataque distribuído é na borda (WAF/Cloudflare), e
 * não aqui. Este módulo é o que dá para garantir dentro da aplicação.
 */

export type EstadoDoFreio = {
  /** Pode tentar agora? */
  liberado: boolean;
  /** Quantos segundos faltam, quando bloqueado. */
  esperaSegundos: number;
  /** Tentativas falhas contadas nesta janela. */
  tentativas: number;
};

/** Cinco tentativas erradas. A sexta espera. */
export const MAX_TENTATIVAS_LOGIN = 5;

/** A janela em que as tentativas somam. */
export const JANELA_MS = 15 * 60_000;

/**
 * Quanto tempo o bloqueio dura, em milissegundos.
 *
 * CRESCENTE, e com teto de quinze minutos: 1min, 2min, 4min, 8min, 15min. A
 * primeira espera é curta de propósito — quem errou a senha de verdade não pode
 * ser punido como um atacante, e um minuto é o suficiente para tornar a força
 * bruta inviável sem tornar o produto insuportável.
 */
export function esperaDoBloqueio(tentativas: number): number {
  const excedentes = Math.max(tentativas - MAX_TENTATIVAS_LOGIN, 0);
  if (excedentes === 0) return 0;
  return Math.min(60_000 * Math.pow(2, excedentes - 1), 15 * 60_000);
}

type Registro = { tentativas: number; primeiraEm: number; bloqueadoAte: number };

const porChave = new Map<string, Registro>();

/**
 * A chave do freio.
 *
 * IP **E** E-MAIL, e não um dos dois:
 *
 *   só IP    puniria um consultório inteiro atrás do mesmo NAT porque uma
 *            pessoa errou a senha três vezes;
 *   só e-mail deixaria um atacante travar a conta de alguém de propósito, de
 *            fora, só errando a senha — negação de serviço contra a vítima.
 *
 * Com os dois, o bloqueio atinge a combinação que está errando, e não a pessoa
 * nem a rede isoladamente.
 */
export function chaveDoFreio(ip: string, email: string): string {
  return `${ip.trim()}|${email.trim().toLowerCase()}`;
}

/** Consulta sem contar. É o que roda ANTES de verificar a senha. */
export function conferirFreio(chave: string, agora = Date.now()): EstadoDoFreio {
  const r = porChave.get(chave);
  if (r === undefined) return { liberado: true, esperaSegundos: 0, tentativas: 0 };

  // A janela expirou: o histórico não vale mais.
  if (agora - r.primeiraEm > JANELA_MS && agora >= r.bloqueadoAte) {
    porChave.delete(chave);
    return { liberado: true, esperaSegundos: 0, tentativas: 0 };
  }

  if (agora < r.bloqueadoAte) {
    return {
      liberado: false,
      esperaSegundos: Math.ceil((r.bloqueadoAte - agora) / 1000),
      tentativas: r.tentativas,
    };
  }

  return { liberado: true, esperaSegundos: 0, tentativas: r.tentativas };
}

/** Conta uma tentativa ERRADA e devolve o estado resultante. */
export function registrarFalha(chave: string, agora = Date.now()): EstadoDoFreio {
  const r = porChave.get(chave);
  const dentroDaJanela = r !== undefined && agora - r.primeiraEm <= JANELA_MS;

  const tentativas = dentroDaJanela ? r.tentativas + 1 : 1;
  const primeiraEm = dentroDaJanela ? r.primeiraEm : agora;
  const espera = esperaDoBloqueio(tentativas);

  porChave.set(chave, { tentativas, primeiraEm, bloqueadoAte: agora + espera });

  /*
   * O MAPA É LIMPO AQUI, e não por um temporizador: em serverless um
   * `setInterval` pode nunca disparar, e um mapa que só cresce é um vazamento
   * de memória com nome de cache. Limpar na escrita amarra o custo ao uso.
   */
  if (porChave.size > 10_000) limpar(agora);

  return {
    liberado: espera === 0,
    esperaSegundos: Math.ceil(espera / 1000),
    tentativas,
  };
}

/** O acerto zera o histórico: quem entrou não é suspeito. */
export function registrarSucesso(chave: string): void {
  porChave.delete(chave);
}

function limpar(agora: number): void {
  for (const [chave, r] of porChave) {
    if (agora - r.primeiraEm > JANELA_MS && agora >= r.bloqueadoAte) porChave.delete(chave);
  }
}

/** Só para teste. */
export function _limparFreio(): void {
  porChave.clear();
}
