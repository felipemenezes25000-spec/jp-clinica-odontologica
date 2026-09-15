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
 * De QUAL SISTEMA veio um `EXTERNAL_ID` — §10.
 *
 * ============================================================================
 *  A COLISÃO QUE ESTE CAMPO IMPEDE, e ela é silenciosa e irreversível.
 *
 *  Até o `supabase/45`, `crc_patient_identities` guardava `(tipo, valor)` — e
 *  `EXTERNAL_ID` significava, por convenção não escrita, "id do paciente no
 *  Dental Office". O Dental Office numera pacientes com inteiros pequenos:
 *  `123`, `456`.
 *
 *  O Instagram também emite identificadores numéricos. O Messenger também. O
 *  Lead Ads também. Sem namespace:
 *
 *      EXTERNAL_ID / 123   ← paciente 123 do Dental Office
 *      EXTERNAL_ID / 123   ← IGSID de quem mandou um direct
 *
 *  são A MESMA LINHA. E `quemE("EXTERNAL_ID", "123")` devolve `UNICO` com
 *  confiança total — o mecanismo de ambiguidade nem dispara, porque do ponto
 *  de vista da tabela não HÁ ambiguidade: é um valor, um paciente.
 *
 *  O direct de um estranho entra no prontuário comercial de um paciente. E não
 *  há como descobrir depois, porque a única informação que separava os dois —
 *  de qual sistema o número veio — nunca foi gravada.
 *
 *  O NAMESPACE NÃO É DECORAÇÃO: ele faz parte da CHAVE. Ver o índice único da
 *  migração.
 * ============================================================================
 *
 * VAZIO PARA OS OUTROS TIPOS, e de propósito. Telefone, e-mail e CPF são
 * globais: `11999990000` é o mesmo número em qualquer sistema, e namespeá-los
 * quebraria o cruzamento que a tabela existe para fazer — o telefone que veio
 * do Dental Office deixaria de casar com o telefone que veio do site.
 */
export type NamespaceDeIdentidade = string;

export const SEM_NAMESPACE = "";

/**
 * O namespace exigido por tipo.
 *
 * `EXTERNAL_ID` sem namespace é exatamente o estado que causava a colisão, e
 * por isso `normalizarNamespace` o recusa. Os demais o recusam no sentido
 * inverso: preenchido, ele fragmentaria a busca.
 */
export function normalizarNamespace(
  tipo: TipoDeIdentidade,
  bruto: string | null | undefined,
): string | null {
  const v = (bruto ?? "").trim().toLowerCase();

  if (tipo !== "EXTERNAL_ID") {
    // Namespace num identificador global é erro de quem chamou, e engolir o
    // valor faria a linha nascer fora do alcance da busca. Recusar é barulhento.
    return v.length === 0 ? SEM_NAMESPACE : null;
  }

  if (v.length === 0) return null;
  // Só o que caberia num segmento de URL: o namespace aparece em log e em
  // chave de dedupe, e um valor com ':' ou '|' dentro quebraria as duas.
  if (!/^[a-z0-9][a-z0-9._-]{0,39}$/u.test(v)) return null;
  return v;
}

/**
 * A força de cada identificador.
 *
 * ============================================================================
 *  A ORDEM NÃO É ARBITRÁRIA — é quanto cada um é ÚNICO NO MUNDO.
 *
 *    EXTERNAL_ID  id emitido por um sistema. Único DENTRO do namespace dele.
 *    DOCUMENTO    CPF. Único por lei, e quase nunca preenchido.
 *    EMAIL        raramente compartilhado. Casais às vezes dividem; filhos não.
 *    TELEFONE     o mais disponível E o mais compartilhado. Família inteira.
 *
 *  Um sistema que trata os quatro como equivalentes resolve pelo que chegou
 *  primeiro — e o que chega primeiro é quase sempre o telefone, justamente o
 *  mais fraco.
 * ============================================================================
 *
 * ============================================================================
 *  E ENTRE DOIS `EXTERNAL_ID`, O NAMESPACE DESEMPATA.
 *
 *  O id do Dental Office vale 100 porque ele É o prontuário: o paciente existe
 *  porque aquela linha existe. Um IGSID vale 95 — ele identifica com certeza
 *  um PERFIL, e o vínculo perfil↔paciente é uma afirmação que alguém fez, não
 *  um fato do cadastro.
 *
 *  A diferença importa num caso concreto: a mesma pessoa com IGSID vinculado ao
 *  paciente A e id de Dental Office do paciente B significa que o vínculo
 *  social está errado. Empatados, `resolver()` devolveria `AMBIGUO` e pararia
 *  a operação; com o Dental Office na frente, ele resolve pelo prontuário — que
 *  é a fonte de verdade sobre quem é paciente — e o vínculo social pode ser
 *  corrigido depois, à mão.
 * ============================================================================
 */
const FORCA: Readonly<Record<TipoDeIdentidade, number>> = {
  EXTERNAL_ID: 95,
  DOCUMENTO: 90,
  EMAIL: 60,
  TELEFONE: 40,
};

/** O namespace que representa o prontuário, e por isso vale mais. */
export const NAMESPACE_DO_PRONTUARIO = "dental-office";

export function forcaDoIdentificador(
  tipo: TipoDeIdentidade,
  namespace: NamespaceDeIdentidade = SEM_NAMESPACE,
): number {
  if (tipo === "EXTERNAL_ID" && namespace === NAMESPACE_DO_PRONTUARIO) return 100;
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
  /**
   * De qual sistema veio o identificador, quando ele é `EXTERNAL_ID`.
   *
   * OPCIONAL PARA NÃO QUEBRAR QUEM JÁ CHAMA, e o default é vazio — que é
   * exatamente o que os tipos globais usam. Um `EXTERNAL_ID` sem namespace
   * aqui não colide com nada: ele só perde o bônus de força do prontuário, e
   * `resolver()` o trata como qualquer id externo.
   */
  namespace?: NamespaceDeIdentidade;
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
      porque: `Ligação confirmada por uma pessoa (${rotulo(unico.porQual, unico.namespace)}).`,
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
  const forcaDe = (c: Candidato): number =>
    forcaDoIdentificador(c.porQual, c.namespace ?? SEM_NAMESPACE);

  const maiorForca = Math.max(...candidatos.map(forcaDe));
  const noTopo = candidatos.filter((c) => forcaDe(c) === maiorForca);

  if (noTopo.length === 1) {
    const unico = noTopo[0]!;
    return {
      tipo: "UNICO",
      patientId: unico.patientId,
      porque: `Casou por ${rotulo(unico.porQual, unico.namespace)}, e só um paciente tem este valor.`,
    };
  }

  return {
    tipo: "AMBIGUO",
    candidatos: noTopo,
    porque: `${String(noTopo.length)} pacientes casam por ${rotulo(noTopo[0]!.porQual, noTopo[0]!.namespace)}. Provavelmente é cadastro duplicado.`,
  };
}

/**
 * O nome do identificador, para a frase que a tela mostra.
 *
 * O NAMESPACE APARECE NO RÓTULO, e é o que faz a explicação ser útil: "casou
 * por id do sistema da clínica" e "casou por perfil do Instagram" levam a
 * pessoa a conferir coisas diferentes. Sem ele, as duas frases eram idênticas.
 */
function rotulo(t: TipoDeIdentidade, namespace?: NamespaceDeIdentidade): string {
  if (t === "EXTERNAL_ID") {
    const ns = (namespace ?? "").trim();
    if (ns === NAMESPACE_DO_PRONTUARIO) return "id do sistema da clínica";
    if (ns === "instagram") return "perfil do Instagram";
    if (ns === "messenger") return "perfil do Messenger";
    if (ns === "whatsapp") return "conta de WhatsApp";
    if (ns === "meta-lead") return "formulário da Meta";
    if (ns.length > 0) return `id externo (${ns})`;
    return "id externo sem origem declarada";
  }

  const MAPA: Readonly<Record<Exclude<TipoDeIdentidade, "EXTERNAL_ID">, string>> = {
    TELEFONE: "telefone",
    EMAIL: "e-mail",
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
