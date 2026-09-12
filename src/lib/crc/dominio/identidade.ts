/**
 * Resolução de identidade — este telefone é de quem?
 *
 * ============================================================================
 *  A REGRA QUE NÃO SE NEGOCIA, e ela é do §21:
 *
 *      NUNCA FUNDIR SÓ POR NOME.
 *
 *  "Maria Silva" numa base de 8.000 pacientes são várias pessoas. Fundir por
 *  nome junta prontuários de gente diferente — e o estrago é IRREVERSÍVEL: não
 *  há como saber depois qual histórico era de quem, porque a informação que
 *  separava os dois foi apagada na fusão.
 *
 *  O nome entra como DESEMPATE entre candidatos que já casaram por outra coisa.
 *  Nunca como o casamento.
 * ============================================================================
 *
 * ============================================================================
 *  E O TELEFONE DE FAMÍLIA É O CASO QUE QUEBRA TUDO.
 *
 *  Mãe e filho de oito anos compartilham o número. A mensagem chega, o sistema
 *  resolve por telefone, e escreve no prontuário errado — ou pior, manda para o
 *  menor uma mensagem destinada à mãe.
 *
 *  A saída NÃO é escolher melhor: é RECUSAR ESCOLHER. Quando o identificador
 *  casa com mais de uma pessoa, a resolução devolve os candidatos e marca para
 *  revisão. É o que `crc_conversations.revisao_pendente` já faz, e este módulo
 *  generaliza a regra.
 * ============================================================================
 *
 * TUDO PURO.
 */

export type TipoDeIdentidade = "TELEFONE" | "EMAIL" | "EXTERNAL_ID" | "DOCUMENTO";

/**
 * A força de cada identificador.
 *
 * ============================================================================
 *  A ORDEM NÃO É ARBITRÁRIA — é quanto cada um é ÚNICO NO MUNDO.
 *
 *    EXTERNAL_ID  o id do paciente no Dental Office. É único por construção.
 *    DOCUMENTO    CPF. Único por lei, e quase nunca preenchido.
 *    EMAIL        raramente compartilhado. Casais às vezes dividem; filhos não.
 *    TELEFONE     o mais disponível E o mais compartilhado. Família inteira.
 *
 *  Um sistema que trata os quatro como equivalentes resolve pelo que chegou
 *  primeiro — e o que chega primeiro é quase sempre o telefone, justamente o
 *  mais fraco.
 * ============================================================================
 */
const FORCA: Readonly<Record<TipoDeIdentidade, number>> = {
  EXTERNAL_ID: 100,
  DOCUMENTO: 90,
  EMAIL: 60,
  TELEFONE: 40,
};

export function forcaDoIdentificador(tipo: TipoDeIdentidade): number {
  return FORCA[tipo];
}

/* -------------------------------------------------------------------------- */
/* Normalização                                                               */
/* -------------------------------------------------------------------------- */

/**
 * O valor, normalizado.
 *
 * É A NORMALIZAÇÃO QUE FAZ A TABELA FUNCIONAR. Guardar o valor cru
 * transformaria "(11) 99999-0000" e "5511999990000" em duas pessoas — e o
 * cruzamento, que é o ponto inteiro, nunca aconteceria.
 *
 * Devolve `null` quando o valor não serve como identificador. Recusar é melhor
 * que guardar lixo: uma linha com `valor: ""` casaria com toda outra linha
 * vazia, e fundiria pacientes sem nada em comum.
 */
export function normalizar(tipo: TipoDeIdentidade, bruto: string): string | null {
  const v = bruto.trim();
  if (v.length === 0) return null;

  if (tipo === "TELEFONE") {
    const digitos = v.replace(/\D/gu, "");
    /*
     * MENOS DE DEZ DÍGITOS NÃO É TELEFONE BRASILEIRO.
     *
     * O piso existe porque um campo com "9999" casaria com qualquer outro
     * cadastro truncado da base — e a fusão resultante juntaria pessoas cuja
     * única semelhança é o telefone estar mal preenchido.
     */
    if (digitos.length < 10) return null;
    if (digitos.length > 15) return null;
    return digitos;
  }

  if (tipo === "EMAIL") {
    const email = v.toLowerCase();
    // Validação mínima: tem arroba, tem ponto depois dela, e nada de espaço.
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email)) return null;
    return email;
  }

  if (tipo === "DOCUMENTO") {
    const digitos = v.replace(/\D/gu, "");
    // CPF tem 11; CNPJ tem 14. Qualquer outra coisa é campo mal preenchido.
    if (digitos.length !== 11 && digitos.length !== 14) return null;
    return digitos;
  }

  // EXTERNAL_ID vem do sistema de origem e não se normaliza: mexer nele
  // quebraria o casamento com a própria fonte.
  return v;
}

/* -------------------------------------------------------------------------- */
/* A resolução                                                                */
/* -------------------------------------------------------------------------- */

export type Candidato = {
  patientId: string;
  nome: string;
  /** Por qual tipo de identificador este candidato casou. */
  porQual: TipoDeIdentidade;
  /** O identificador é usado por mais de uma pessoa. */
  compartilhado: boolean;
  /** Alguém já confirmou esta ligação à mão. */
  confirmado: boolean;
};

export type Resolucao =
  | { tipo: "UNICO"; patientId: string; porque: string }
  | { tipo: "AMBIGUO"; candidatos: Candidato[]; porque: string }
  | { tipo: "NENHUM"; porque: string };

/**
 * Quem é esta pessoa?
 *
 * ============================================================================
 *  A FUNÇÃO PODE DEVOLVER "NÃO SEI", E ISSO É UMA FEATURE.
 *
 *  Todo sistema de identidade tem a tentação de sempre devolver alguém — é o
 *  que faz a demonstração parecer boa. O custo aparece meses depois, no
 *  prontuário com duas pessoas dentro.
 *
 *  `AMBIGUO` é a resposta certa quando ela é a verdade, e a tela sabe o que
 *  fazer com ela: perguntar.
 * ============================================================================
 */
export function resolver(candidatos: readonly Candidato[]): Resolucao {
  if (candidatos.length === 0) {
    return { tipo: "NENHUM", porque: "Nenhum paciente casa com este identificador." };
  }

  /*
   * 1. CONFIRMADO À MÃO GANHA DE TUDO.
   *
   * Se uma pessoa já disse "este telefone é da Ana", essa afirmação vale mais
   * que qualquer inferência — inclusive mais que um external id, porque o
   * external id pode estar errado na origem e alguém já corrigiu aqui.
   */
  const confirmados = candidatos.filter((c) => c.confirmado);
  if (confirmados.length === 1) {
    const unico = confirmados[0]!;
    return {
      tipo: "UNICO",
      patientId: unico.patientId,
      porque: `Ligação confirmada por uma pessoa (${rotulo(unico.porQual)}).`,
    };
  }
  if (confirmados.length > 1) {
    return {
      tipo: "AMBIGUO",
      candidatos: confirmados,
      porque: "Mais de um paciente tem este identificador confirmado. Alguém precisa decidir.",
    };
  }

  /*
   * 2. O IDENTIFICADOR COMPARTILHADO NUNCA RESOLVE SOZINHO.
   *
   * É o telefone de família. Mesmo com um candidato só hoje, ele foi MARCADO
   * como compartilhado porque alguém já viu duas pessoas nele — e o segundo
   * cadastro pode simplesmente não ter sido criado ainda.
   */
  const compartilhado = candidatos.some((c) => c.compartilhado);
  if (compartilhado) {
    return {
      tipo: "AMBIGUO",
      candidatos: [...candidatos],
      porque:
        "Este identificador é usado por mais de uma pessoa (telefone de família, por exemplo). O sistema não escolhe.",
    };
  }

  /*
   * 3. O MAIS FORTE VENCE, e só quando vence sozinho.
   *
   * Dois candidatos empatados no identificador mais forte é ambiguidade real —
   * dois pacientes com o mesmo CPF significa cadastro duplicado, e fundi-los
   * automaticamente é exatamente o que o §64 proíbe.
   */
  const maiorForca = Math.max(...candidatos.map((c) => FORCA[c.porQual]));
  const noTopo = candidatos.filter((c) => FORCA[c.porQual] === maiorForca);

  if (noTopo.length === 1) {
    const unico = noTopo[0]!;
    return {
      tipo: "UNICO",
      patientId: unico.patientId,
      porque: `Casou por ${rotulo(unico.porQual)}, e só um paciente tem este valor.`,
    };
  }

  return {
    tipo: "AMBIGUO",
    candidatos: noTopo,
    porque: `${String(noTopo.length)} pacientes casam por ${rotulo(noTopo[0]!.porQual)}. Provavelmente é cadastro duplicado.`,
  };
}

function rotulo(t: TipoDeIdentidade): string {
  const MAPA: Readonly<Record<TipoDeIdentidade, string>> = {
    TELEFONE: "telefone",
    EMAIL: "e-mail",
    EXTERNAL_ID: "id do sistema da clínica",
    DOCUMENTO: "documento",
  };
  return MAPA[t];
}

/* -------------------------------------------------------------------------- */
/* Duplicados                                                                 */
/* -------------------------------------------------------------------------- */

export type SuspeitaDeDuplicata = {
  a: string;
  b: string;
  /** 0..1. Acima de `CONFIANCA_PARA_SUGERIR`, vale mostrar para alguém. */
  confianca: number;
  porque: string;
};

/**
 * Acima disto, vale sugerir a fusão para uma pessoa conferir.
 *
 * ============================================================================
 *  E NUNCA, EM NENHUM VALOR, FUNDIR SOZINHO.
 *
 *  O §64 é explícito: sem merge automático de baixa confiança. Mas a leitura
 *  correta é mais dura que isso — não há merge automático de confiança
 *  NENHUMA, porque o erro é irreversível e o acerto só economiza um clique.
 *
 *  Uma fusão errada junta dois prontuários e apaga a fronteira entre eles. Um
 *  clique a mais custa três segundos.
 * ============================================================================
 */
export const CONFIANCA_PARA_SUGERIR = 0.7;

export type ParaComparar = {
  patientId: string;
  nome: string;
  telefone: string | null;
  email: string | null;
  documento: string | null;
  externalId: string | null;
};

/**
 * Estes dois cadastros são a mesma pessoa?
 *
 * DEVOLVE SUSPEITA, E NÃO DECISÃO. O nome participa — mas só como reforço, e
 * nunca sozinho: dois "Maria Silva" sem nenhum identificador em comum devolvem
 * confiança abaixo do limiar e não viram sugestão.
 */
export function compararCadastros(a: ParaComparar, b: ParaComparar): SuspeitaDeDuplicata | null {
  if (a.patientId === b.patientId) return null;

  const razoes: string[] = [];
  let confianca = 0;

  if (a.documento !== null && a.documento === b.documento) {
    confianca = Math.max(confianca, 0.98);
    razoes.push("mesmo documento");
  }

  if (a.externalId !== null && a.externalId === b.externalId) {
    confianca = Math.max(confianca, 0.95);
    razoes.push("mesmo id no sistema da clínica");
  }

  if (a.email !== null && a.email === b.email) {
    confianca = Math.max(confianca, 0.8);
    razoes.push("mesmo e-mail");
  }

  if (a.telefone !== null && a.telefone === b.telefone) {
    /*
     * TELEFONE IGUAL SOZINHO NÃO CHEGA AO LIMIAR, e é de propósito: é
     * exatamente o caso da família. Ele só cruza a linha somado ao nome
     * parecido — mãe e filho têm o mesmo telefone e nomes diferentes.
     */
    confianca = Math.max(confianca, 0.5);
    razoes.push("mesmo telefone");
  }

  const nomesParecidos = nomeParecido(a.nome, b.nome);
  if (nomesParecidos) {
    // O nome só SOMA. Nunca inicia — ver o cabeçalho do arquivo.
    if (confianca > 0) {
      confianca = Math.min(0.99, confianca + 0.25);
      razoes.push("nome parecido");
    }
  }

  if (confianca === 0) return null;

  return {
    a: a.patientId,
    b: b.patientId,
    confianca: Number(confianca.toFixed(2)),
    porque: razoes.join(", "),
  };
}

/**
 * Nomes parecidos o suficiente para reforçar uma suspeita.
 *
 * NÃO É COMPARAÇÃO DE STRING BONITA. É normalização agressiva — sem acento, sem
 * caixa, sem partícula — e comparação do primeiro e do último nome. "José da
 * Silva Santos" e "Jose Silva Santos" são a mesma pessoa; "Maria Silva" e
 * "Maria Souza" não são.
 */
export function nomeParecido(a: string, b: string): boolean {
  const partes = (s: string): string[] =>
    s
      .normalize("NFD")
      .replace(/[̀-ͯ]/gu, "")
      .toLowerCase()
      .replace(/[^a-z\s]/gu, " ")
      .split(/\s+/u)
      .filter((p) => p.length > 2 && !PARTICULAS.has(p));

  const pa = partes(a);
  const pb = partes(b);

  if (pa.length === 0 || pb.length === 0) return false;

  const primeiroIgual = pa[0] === pb[0];
  const ultimoIgual = pa[pa.length - 1] === pb[pb.length - 1];

  return primeiroIgual && ultimoIgual;
}

const PARTICULAS = new Set(["dos", "das", "de", "da", "do", "e"]);
