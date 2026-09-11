/**
 * A memória do agente — e, principalmente, o que ela recusa a guardar.
 *
 * ESTE ARQUIVO EXISTE POR UMA ASSIMETRIA. Escrever memória é barato: uma linha
 * no banco. Apagar o efeito dela é caro: a frase já influenciou respostas, já
 * foi lida por gente da recepção, e já virou a forma como a clínica enxerga
 * aquela pessoa. Então a checagem tem que ser na ENTRADA, e tem que ser código.
 *
 * A REGRA, EM UMA LINHA: memória guarda o que a pessoa DISSE; nunca o que o
 * modelo concluiu SOBRE ela.
 *
 *   "Prefere horários depois das 17h"     — entra. A pessoa disse, é
 *                                           verificável na conversa, e muda o
 *                                           que o agente oferece amanhã.
 *
 *   "Paciente não tem dinheiro"           — NÃO entra. Ninguém disse isso. É
 *                                           leitura de entrelinha, envelhece
 *                                           mal, e vira um rótulo que segue a
 *                                           pessoa por anos.
 *
 *   "Paciente parece ansiosa"             — NÃO entra. Diagnóstico de leigo
 *                                           com cara de fato.
 *
 * POR QUE ISTO NÃO ESTÁ NO PROMPT. Um prompt pedindo "não infira" é uma
 * sugestão. Aqui é uma condição que o modelo não negocia — mesma decisão de
 * `dominio/guardrails.ts`, pelo mesmo motivo, e testável sem modelo nenhum.
 *
 * TODA MEMÓRIA NASCE COM PRAZO. Memória sem validade é rótulo permanente, e
 * uma preferência de horário de 2026 não tem por que reger uma conversa de
 * 2029. O prazo é o que faz a memória ser memória e não ficha.
 */

/* -------------------------------------------------------------------------- */
/* Contrato                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * De quem é a memória.
 *
 * Só dois níveis, e a ausência de um terceiro é decisão: não existe memória
 * "de conversa" nem "de turno". O que vale só dentro de uma conversa já está na
 * conversa — duplicá-lo aqui criaria um segundo lugar para a mesma coisa
 * envelhecer de forma diferente.
 */
export type EscopoMemoria = "paciente" | "organizacao";

/**
 * De onde a memória veio. É o que permite conferir — e o que decide a validade.
 *
 * `operador` é a memória que uma pessoa da clínica digitou. Ela nasce ATIVA sem
 * limiar de confiança, porque atrás dela existe alguém com nome que respondeu
 * por aquilo. `conversa` é extração de modelo, e passa por todo o resto.
 */
export type OrigemMemoria = "conversa" | "operador" | "sistema";

/**
 * `PENDENTE` é o estado mais importante dos três.
 *
 * Ele existe para a memória de confiança baixa não ter que escolher entre
 * "entra e influencia respostas" e "é descartada e ninguém nunca vê". Pendente
 * fica visível para revisão e NÃO vai ao modelo.
 */
export type StatusMemoria = "ATIVA" | "PENDENTE" | "INVALIDADA";

export type MemoriaCandidata = {
  escopo: EscopoMemoria;
  /** O paciente, quando o escopo é dele. Nulo na memória da clínica. */
  subjectId: string | null;
  conteudo: string;
  origem: OrigemMemoria;
  /** `conversation:<id>` ou `run:<id>`. É o que permite ir conferir na fonte. */
  origemRef: string | null;
  /** 0 a 1, declarado por quem extraiu. */
  confianca: number;
};

export type MemoriaValidada = {
  escopo: EscopoMemoria;
  subjectId: string | null;
  conteudo: string;
  origem: OrigemMemoria;
  origemRef: string | null;
  confianca: number;
  status: StatusMemoria;
  validoDe: string;
  /** Nulo só para memória de operador: uma pessoa pode declarar fato estável. */
  expiraEm: string | null;
  /** Conteúdo normalizado + sujeito. É o que impede a mesma memória duas vezes. */
  chaveDedupe: string;
};

export type VeredictoMemoria =
  | { ok: true; memoria: MemoriaValidada }
  | {
      ok: false;
      /** Estável, para métrica e teste. */
      codigo: string;
      /** Em português: é o que aparece para quem for revisar a recusa. */
      motivo: string;
    };

/* -------------------------------------------------------------------------- */
/* Os números                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Acima disso não é memória, é resumo.
 *
 * Uma memória é uma frase que cabe numa linha de contexto. Parágrafo indica que
 * o extrator juntou três fatos num só — e três fatos numa linha não podem ser
 * invalidados separadamente.
 */
export const MAX_CARACTERES_MEMORIA = 180;

/** Abaixo disso a memória nasce PENDENTE e não vai ao modelo. */
export const LIMIAR_CONFIANCA_ATIVA = 0.8;

/** Quanto uma preferência extraída de conversa vale antes de expirar. */
export const VALIDADE_DIAS_CONVERSA = 180;

/** Teto do que entra no contexto de um turno. Memória é tempero, não prato. */
export const MAX_MEMORIAS_NO_CONTEXTO = 6;

/* -------------------------------------------------------------------------- */
/* O que nunca vira fato                                                      */
/* -------------------------------------------------------------------------- */

const normalizar = (t: string): string => t.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");

/**
 * Os padrões que desqualificam uma memória, cada um com o nome do problema.
 *
 * A ORDEM IMPORTA NA MENSAGEM, não no resultado: quem revisa a recusa lê o
 * primeiro motivo que bateu, e o primeiro deve ser o mais explicativo.
 *
 * Estes regexes são deliberadamente amplos. Uma memória recusada por engano
 * custa uma frase útil perdida; uma memória financeira ou clínica aceita por
 * engano custa um rótulo numa pessoa. A assimetria manda errar para o lado da
 * recusa.
 */
/*
 * SOBRE A FORMA DESTES REGEXES, porque é fácil escrevê-los errado:
 *
 * A fronteira `\b` fica SÓ NO INÍCIO dos radicais. `\b(diagnostic)\b` não casa
 * com "diagnóstico" — o `\b` final exige fim de palavra imediatamente depois do
 * radical, e ali vem "o". Um radical fechado dos dois lados é uma regra que
 * parece existir e nunca dispara: o pior defeito possível numa lista de recusa,
 * porque ela passa a aprovar exatamente o que foi escrita para barrar.
 *
 * Onde a palavra inteira é que importa — `gay`, `trans` — há um grupo separado,
 * com `\b` nas duas pontas, para "trans" não pegar "transferir".
 */
const RECUSAS: readonly { codigo: string; motivo: string; padrao: RegExp }[] = [
  {
    codigo: "especulacao",
    motivo:
      "A frase é dedução, não algo que a pessoa disse. Memória guarda o que foi dito; conclusão sobre alguém não é fato.",
    padrao:
      /\b(?:parec|provavel|aparent|imagin|supon|possivel|demonstr|indica\s+que|acho\s+que|talvez|deve\s+(?:estar|ser|ter)|pode\s+ser\s+que)/u,
  },
  {
    codigo: "juizo_financeiro",
    motivo:
      "A frase julga a situação financeira da pessoa. Isso não é memória: é rótulo, envelhece mal e muda como a clínica trata quem chega.",
    padrao:
      /\b(?:nao\s+tem\s+(?:dinheiro|condicoes|como\s+pagar)|sem\s+(?:dinheiro|condicoes|grana)|nao\s+pode\s+pagar|pobre|humilde|caloteir|mao\s+de\s+vaca|pao\s+dur|golpist|quebrad[oa]|endividad|falid[oa]|vai\s+dar\s+calote)/u,
  },
  {
    codigo: "juizo_de_pessoa",
    motivo:
      "A frase descreve o temperamento ou o caráter da pessoa. Memória não é ficha de comportamento.",
    padrao:
      /\b(?:chat[ao]|grosseir|mal\s+educad|estressad|nervos|ansios|deprimid|confus[ao]|burr[oa]|mentiu|mentir|enrolad|folgad|pentelh|escandalos|histeric|paranoic|carente|desequilibrad|insuportavel|dificil\s+de\s+lidar|encheu\s+o\s+saco)/u,
  },
  {
    codigo: "conteudo_clinico",
    motivo:
      "A frase carrega informação clínica. Isso pertence ao prontuário, com as regras de acesso dele — não à memória de um agente de WhatsApp.",
    padrao:
      /\b(?:diagnostic|carie|periodontit|gengivit|abscess|pulpit|bruxism|hiperten|diabet|gestante|gravid|alergi|anestes|antibiotic|dipiron|amoxicilin|remedi|medicament|dose|sintoma|dor\s+de\s+dente|sangrament|extracao|tratamento\s+de\s+canal|infeccao|tumor|cancer|hiv|depressao|transtorno|laudo|exame|radiografi|raio-?x)/u,
  },
  {
    codigo: "atributo_protegido",
    motivo:
      "A frase registra característica protegida (religião, política, orientação, origem, deficiência). Nada disso muda o que o agente responde.",
    padrao:
      // Acento já foi removido antes do teste: "muçulmano" chega como
      // "muculmano", "indígena" como "indigena".
      /\b(?:evangelic|catolic|espirita|umbanda|candomble|judeu|muculman|ateu|religi|petist|bolsonarist|esquerdist|direitist|comunist|lesbic|homossexual|heterossexual|bissexual|negr[oa]|branc[oa]|pard[oa]|indigen|nordestin|imigrant|venezuelan|bolivian|deficien|cadeirant|autist|surd[oa]|ceg[oa])|\b(?:gay|trans|vota\s+(?:em|no|na)|sindrome\s+de\s+down|testemunha\s+de\s+jeova)\b/u,
  },
  {
    codigo: "dado_identificavel",
    motivo:
      "A frase contém dado cadastral (CPF, telefone, endereço, cartão). Memória não é onde esses dados moram, e o modelo não precisa deles.",
    padrao:
      /(\bcpf\b|\brg\b|\bcep\b|\d{3}\.?\d{3}\.?\d{3}-?\d{2}|\(?\d{2}\)?\s?9?\d{4}-?\d{4}|\b(rua|avenida|av\.|travessa|alameda)\s+\w+|\bcartao\s+(de\s+credito|final)|\d{4}\s?\d{4}\s?\d{4}\s?\d{4})/u,
  },
  {
    codigo: "instrucao_disfarcada",
    motivo:
      "A frase dá ordem ao agente em vez de registrar fato. Memória que instrui é injeção de prompt com outro nome.",
    padrao:
      // Imperativos: aqui a palavra inteira É a regra. `esquec` como radical
      // barraria "Esqueceu o documento na última vez", que é memória legítima.
      /\b(?:ignore|ignora|desconsidere|esqueca|a\s+partir\s+de\s+agora\s+voce|voce\s+(?:deve|precisa|vai)|sempre\s+responda|nunca\s+responda|suas\s+(?:novas\s+)?instrucoes|system\s+prompt|aja\s+como)\b/u,
  },
];

/* -------------------------------------------------------------------------- */
/* A validação                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Decide se uma candidata pode virar memória, e com que status.
 *
 * Pura: nenhuma leitura de banco, nenhum relógio implícito. `agora` entra por
 * parâmetro como no resto do domínio, para o teste poder envelhecer memória sem
 * mexer no relógio do processo.
 */
export function validarMemoria(candidata: MemoriaCandidata, agora: Date): VeredictoMemoria {
  const conteudo = candidata.conteudo.trim().replace(/\s+/gu, " ");

  if (conteudo.length === 0) {
    return { ok: false, codigo: "vazia", motivo: "Memória sem conteúdo." };
  }
  if (conteudo.length > MAX_CARACTERES_MEMORIA) {
    return {
      ok: false,
      codigo: "longa",
      motivo: `A frase tem ${String(conteudo.length)} caracteres; acima de ${String(MAX_CARACTERES_MEMORIA)} é resumo, não memória.`,
    };
  }
  if (!Number.isFinite(candidata.confianca) || candidata.confianca < 0 || candidata.confianca > 1) {
    return { ok: false, codigo: "confianca_invalida", motivo: "Confiança fora de 0 a 1." };
  }
  if (candidata.escopo === "paciente" && candidata.subjectId === null) {
    return {
      ok: false,
      codigo: "sem_sujeito",
      motivo: "Memória de paciente sem paciente identificado.",
    };
  }
  // Memória da clínica com paciente preenchido é confusão de escopo — e ela
  // vazaria para o contexto de TODO paciente, porque é assim que o escopo de
  // organização é lido.
  if (candidata.escopo === "organizacao" && candidata.subjectId !== null) {
    return {
      ok: false,
      codigo: "escopo_confuso",
      motivo: "Memória da clínica não pertence a um paciente.",
    };
  }

  const texto = normalizar(conteudo);
  for (const r of RECUSAS) {
    if (r.padrao.test(texto)) return { ok: false, codigo: r.codigo, motivo: r.motivo };
  }

  /*
   * O STATUS, e por que operador é diferente.
   *
   * Extração de modelo com confiança baixa nasce PENDENTE: fica visível para
   * revisão e não influencia nenhuma resposta. Memória digitada por uma pessoa
   * nasce ATIVA — existe alguém com nome respondendo por ela, o que é uma
   * garantia que nenhum número de confiança oferece.
   */
  const status: StatusMemoria =
    candidata.origem === "operador" || candidata.confianca >= LIMIAR_CONFIANCA_ATIVA
      ? "ATIVA"
      : "PENDENTE";

  return {
    ok: true,
    memoria: {
      escopo: candidata.escopo,
      subjectId: candidata.subjectId,
      conteudo,
      origem: candidata.origem,
      origemRef: candidata.origemRef,
      confianca: candidata.confianca,
      status,
      validoDe: agora.toISOString(),
      expiraEm: expiraEm(candidata.origem, agora),
      chaveDedupe: chaveDeMemoria(candidata.escopo, candidata.subjectId, conteudo),
    },
  };
}

/**
 * O prazo. Nulo só para operador.
 *
 * Uma pessoa da clínica pode declarar um fato estável ("não atendemos convênio
 * X") e não há por que ele expirar sozinho. Extração de modelo sempre expira:
 * ela não tem ninguém por trás para renovar.
 */
function expiraEm(origem: OrigemMemoria, agora: Date): string | null {
  if (origem === "operador") return null;
  return new Date(agora.getTime() + VALIDADE_DIAS_CONVERSA * 86_400_000).toISOString();
}

/**
 * A chave que impede a mesma memória duas vezes.
 *
 * Normaliza acento, caixa e pontuação: "Prefere horários depois das 17h" e
 * "prefere horarios depois das 17h!" são a MESMA memória. Sem isto, cada
 * conversa em que a pessoa repetisse a preferência criaria outra linha, e o
 * contexto do turno encheria de cópias da mesma frase.
 */
export function chaveDeMemoria(
  escopo: EscopoMemoria,
  subjectId: string | null,
  conteudo: string,
): string {
  const nucleo = normalizar(conteudo)
    .replace(/[^a-z0-9\s]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
  return `${escopo}:${subjectId ?? "org"}:${nucleo}`;
}

/* -------------------------------------------------------------------------- */
/* Vigência e leitura                                                         */
/* -------------------------------------------------------------------------- */

export type MemoriaGravada = {
  id: string;
  escopo: EscopoMemoria;
  subjectId: string | null;
  conteudo: string;
  origem: OrigemMemoria;
  origemRef: string | null;
  confianca: number;
  status: StatusMemoria;
  validoDe: string;
  expiraEm: string | null;
  criadoEm: string;
};

/**
 * A memória vale agora?
 *
 * A checagem é feita AQUI e não só no filtro do banco porque expirar é
 * silencioso: uma linha com `expira_em` no passado continua ATIVA na coluna, e
 * um filtro esquecido a colocaria de volta no contexto. Duas checagens para a
 * mesma garantia é o preço de a garantia ser sobre o que o modelo lê.
 */
export function memoriaVigente(m: MemoriaGravada, agora: Date): boolean {
  if (m.status !== "ATIVA") return false;
  const de = Date.parse(m.validoDe);
  if (Number.isFinite(de) && de > agora.getTime()) return false;
  if (m.expiraEm === null) return true;
  const ate = Date.parse(m.expiraEm);
  return !Number.isFinite(ate) || ate > agora.getTime();
}

/**
 * As memórias que entram no contexto, já filtradas, ordenadas e limitadas.
 *
 * Ordem: confiança primeiro, e a mais nova desempata. Com teto de seis, o que
 * fica de fora é o que o extrator teve menos certeza — que é exatamente o que
 * se quer perder.
 */
export function memoriasParaContexto(
  memorias: readonly MemoriaGravada[],
  agora: Date,
  maximo = MAX_MEMORIAS_NO_CONTEXTO,
): MemoriaGravada[] {
  return memorias
    .filter((m) => memoriaVigente(m, agora))
    .sort((a, b) =>
      b.confianca - a.confianca !== 0
        ? b.confianca - a.confianca
        : Date.parse(b.criadoEm) - Date.parse(a.criadoEm),
    )
    .slice(0, maximo);
}
