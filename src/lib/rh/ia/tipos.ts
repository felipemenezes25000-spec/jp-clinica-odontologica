/**
 * Tipos da triagem por IA.
 *
 * Mesma regra do `src/lib/rh/tipos.ts`: nada de I/O, nada de React, nada de
 * `node:`. Este arquivo é carregado pelo servidor (que chama a OpenAI e grava o
 * resultado em disco) e pelas telas do painel (que só leem o que já foi gravado).
 *
 * A divisão de trabalho que atravessa todo este diretório: **a IA lê e julga; o
 * código calcula**. `ExtracaoCurriculo` é o que o modelo leu do documento,
 * `MetricasPermanencia` é aritmética determinística feita em TypeScript sobre
 * essa leitura, e `Sinal` é o alerta — que pode vir do cálculo (provável), do
 * modelo (interpretação) ou da qualidade do documento.
 */

export type RecomendacaoIa = "entrevistar-ja" | "entrevistar" | "talvez" | "descartar";

export type SeveridadeSinal = "critico" | "alto" | "medio" | "baixo" | "info";

/**
 * De onde veio o alerta. Importa para a tela: "calculo" é fato aritmético que a
 * clínica pode repetir na mão; "ia" é leitura de quem interpretou o texto; e
 * "documento" fala da qualidade do arquivo, não da candidata.
 */
export type OrigemSinal = "calculo" | "ia" | "documento";

export type Sinal = {
  /** Identificador estável do tipo de alerta ("ultimo-curto", "datas-sobrepostas"). */
  chave: string;
  origem: OrigemSinal;
  severidade: SeveridadeSinal;
  /** "permanencia" | "documento" | "coerencia" | "contato" | "conformidade" */
  categoria: string;
  titulo: string;
  detalhe: string;
  /** Fatos concretos do currículo que sustentam o alerta. */
  evidencias: string[];
  /** Pergunta de entrevista que resolve a dúvida. "" quando não vira pergunta. */
  perguntar: string;
  /**
   * Se o alerta pode pesar na nota. Existe por causa dos sinais de
   * conformidade (LGPD e não-discriminação), que a clínica precisa VER mas
   * jamais usar contra a candidata — ver `dado-sensivel` em `sinais.ts`.
   */
  contaNaNota: boolean;
};

/* -------------------------------------------------------------------------- */
/* O que o modelo lê do documento                                             */
/* -------------------------------------------------------------------------- */

export type EmpregoExtraido = {
  empresa: string;
  cargo: string;
  /** "AAAA-MM", "AAAA" ou "" — nunca inventado. */
  inicio: string;
  fim: string;
  atual: boolean;
  descricao: string;
  setor: string;
  atendimentoPublico: boolean;
  administrativo: boolean;
  odontologico: boolean;
  saude: boolean;
};

export type FormacaoExtraida = {
  curso: string;
  instituicao: string;
  /** "medio" | "tecnico" | "superior" | "pos" | "outro" */
  nivel: string;
  conclusao: string;
  emAndamento: boolean;
};

export type ExtracaoCurriculo = {
  documentoValido: boolean;
  /** "curriculo" | "carta" | "guia" | "foto-avulsa" | "outro" */
  tipoDocumento: string;
  /** 0 a 100: quanto deu para ler com segurança. */
  legibilidade: number;

  nome: string;
  /** "AAAA-MM-DD", "AAAA-MM", "AAAA" ou "". */
  nascimento: string;
  idadeDeclarada: number | null;
  cidade: string;
  uf: string;
  telefone: string;
  email: string;
  linkedin: string;
  resumoObjetivo: string;

  formacoes: FormacaoExtraida[];
  empregos: EmpregoExtraido[];
  cursos: string[];
  idiomas: string[];
  softwares: string[];

  /** CRO, "CRO-SP 12345", COREN... "" quando o documento não traz. */
  registroProfissional: string;
  pretensaoDeclarada: string;

  /**
   * Dados que a lei permite escrever no currículo mas que a clínica não pode
   * usar para decidir: "estado civil", "filhos", "foto", "religiao", "idade".
   * Existe para gerar o alerta de conformidade, não para alimentar a nota.
   */
  dadosSensiveisPresentes: string[];
  /** O que atrapalhou a leitura: página cortada, datas contraditórias, borrão. */
  observacoesDoLeitor: string[];
};

/* -------------------------------------------------------------------------- */
/* O que o código calcula                                                     */
/* -------------------------------------------------------------------------- */

export type ItemLinhaDoTempo = {
  empresa: string;
  cargo: string;
  /** "AAAA-MM" ou "" quando o currículo não datou. */
  de: string;
  /** "AAAA-MM", "atual" ou "". */
  ate: string;
  meses: number | null;
  setor: string;
  odontologico: boolean;
  atendimentoPublico: boolean;
  administrativo: boolean;
  atual: boolean;
};

export type MetricasPermanencia = {
  totalEmpregos: number;
  empregosDatados: number;
  empregosSemData: number;

  /** O número que a clínica mais precisa acertar. */
  mesesUltimoEmprego: number | null;
  ultimoEmprego: { empresa: string; cargo: string; meses: number | null } | null;
  /** `null` quando não há nenhum vínculo datado para deduzir. */
  empregadaAtualmente: boolean | null;

  mediaMesesPorEmprego: number | null;
  medianaMeses: number | null;
  mesesExperienciaTotal: number | null;

  mesesEmOdontologia: number;
  mesesEmSaude: number;
  mesesAtendimentoPublico: number;
  mesesAdministrativo: number;

  empregosCurtos: number;
  /** Percentual (0..100) de vínculos com duração conhecida abaixo de 12 meses. */
  proporcaoCurtos: number | null;
  inicios24Meses: number;

  lacunas: { de: string; ate: string; meses: number }[];
  /** `a` e `b` no formato "cargo — empresa". */
  sobreposicoes: { a: string; b: string; meses: number }[];
  linhaDoTempo: ItemLinhaDoTempo[];
};

/* -------------------------------------------------------------------------- */
/* O que o modelo julga                                                       */
/* -------------------------------------------------------------------------- */

export type ChaveCriterio =
  "permanencia" | "aderencia" | "atendimento" | "administrativo" | "progressao" | "coerencia";

export type CriterioIa = {
  chave: ChaveCriterio;
  /** 0 a 10. */
  nota: number;
  justificativa: string;
  evidencias: string[];
};

export type AnaliseIa = {
  /**
   * `VERSAO_ANALISE` no momento em que rodou. É o que permite reanalisar em
   * lote só quem ficou para trás quando a rubrica ou o prompt mudarem — sem
   * isso, a clínica pagaria token para reanalisar 300 currículos idênticos.
   */
  versao: number;
  modelo: string;
  /** ISO. */
  analisadoEm: string;
  tokensEntrada: number;
  tokensSaida: number;

  extracao: ExtracaoCurriculo;
  metricas: MetricasPermanencia;
  sinais: Sinal[];

  /** 1 a 5. */
  estrelas: number;
  /** 0 a 100. */
  notaGeral: number;
  recomendacao: RecomendacaoIa;
  resumoUmaLinha: string;
  criterios: CriterioIa[];

  pontosFortes: string[];
  pontosAtencao: string[];
  impressao: string;
  perguntasEntrevista: { pergunta: string; porque: string }[];
  /** 0 a 100: quanto o modelo confia na própria análise, dado o que deu para ler. */
  confianca: number;

  /**
   * "" quando deu certo. Guardar a falha junto do registro (em vez de não
   * gravar nada) é o que faz a tela conseguir dizer "a análise falhou, tente de
   * novo" em vez de mostrar um card vazio para sempre.
   */
  erro: string;
};

/**
 * Suba este número quando mudar prompt, rubrica ou motor de sinais de um jeito
 * que invalide o que já foi analisado.
 */
/* 2: régua da recepção repesada a pedido do cliente (estabilidade 30) e sinal
   de estudo em andamento. Ficha analisada na versão 1 continua válida e visível;
   o número só marca que a nota dela saiu de outra régua. */
export const VERSAO_ANALISE = 2;

/**
 * Análise zerada. É função, e não constante, pelo mesmo motivo de
 * `candidaturaVazia()`: os arrays seriam compartilhados por referência entre
 * todos os registros que caíssem no estado vazio.
 */
export function analiseVazia(): AnaliseIa {
  return {
    versao: VERSAO_ANALISE,
    modelo: "",
    analisadoEm: "",
    tokensEntrada: 0,
    tokensSaida: 0,

    extracao: extracaoVazia(),
    metricas: metricasVazias(),
    sinais: [],

    estrelas: 0,
    notaGeral: 0,
    recomendacao: "talvez",
    resumoUmaLinha: "",
    criterios: [],

    pontosFortes: [],
    pontosAtencao: [],
    impressao: "",
    perguntasEntrevista: [],
    confianca: 0,

    erro: "",
  };
}

/** Extração zerada — o estado de "ainda não li este documento". */
export function extracaoVazia(): ExtracaoCurriculo {
  return {
    documentoValido: false,
    tipoDocumento: "",
    legibilidade: 0,

    nome: "",
    nascimento: "",
    idadeDeclarada: null,
    cidade: "",
    uf: "",
    telefone: "",
    email: "",
    linkedin: "",
    resumoObjetivo: "",

    formacoes: [],
    empregos: [],
    cursos: [],
    idiomas: [],
    softwares: [],

    registroProfissional: "",
    pretensaoDeclarada: "",

    dadosSensiveisPresentes: [],
    observacoesDoLeitor: [],
  };
}

/**
 * Métricas de quem não tem nenhum vínculo listado. Escrita à mão, e não
 * derivada de `calcularMetricas([], agora)`, porque este arquivo não pode
 * depender de um `Date` — ele é avaliado durante o SSR, onde "agora" precisa
 * entrar sempre por parâmetro.
 */
export function metricasVazias(): MetricasPermanencia {
  return {
    totalEmpregos: 0,
    empregosDatados: 0,
    empregosSemData: 0,

    mesesUltimoEmprego: null,
    ultimoEmprego: null,
    empregadaAtualmente: null,

    mediaMesesPorEmprego: null,
    medianaMeses: null,
    mesesExperienciaTotal: null,

    mesesEmOdontologia: 0,
    mesesEmSaude: 0,
    mesesAtendimentoPublico: 0,
    mesesAdministrativo: 0,

    empregosCurtos: 0,
    proporcaoCurtos: null,
    inicios24Meses: 0,

    lacunas: [],
    sobreposicoes: [],
    linhaDoTempo: [],
  };
}

/* -------------------------------------------------------------------------- */
/* Ranking — a comparação entre candidatas da mesma vaga                      */
/* -------------------------------------------------------------------------- */

export type ItemRanking = {
  /** Id da candidatura. É por ele que a tela liga a posição à ficha. */
  id: string;
  /** 1 é quem a clínica liga primeiro. Renumerado em código, nunca pelo modelo. */
  posicao: number;
  porque: string;
};

export type RankingIa = {
  ordem: ItemRanking[];
  /** Ids de quem entrevistar primeiro — no máximo cinco. */
  shortlist: string[];
  /** O que a leva inteira tem de comum, e o que a clínica deveria fazer. */
  observacaoGeral: string;
};

/**
 * O ranking como fica em disco.
 *
 * `area` é `string` e não `AreaVaga` de propósito: `tipos.ts` já importa este
 * arquivo, e importar `AreaVaga` de volta fecharia um ciclo entre os dois — que
 * o TypeScript aguenta (são tipos, some na compilação), mas que confunde quem
 * lê. O valor gravado é sempre uma área do domínio, ou "" para "todas".
 */
export type RankingSalvo = RankingIa & {
  chave: string;
  area: string;
  tituloVaga: string;
  /** ISO. */
  geradoEm: string;
  modelo: string;
  /** Quantas candidatas entraram na comparação. */
  total: number;
  tokensEntrada: number;
  tokensSaida: number;
};

/* -------------------------------------------------------------------------- */
/* Catálogos de exibição                                                      */
/* -------------------------------------------------------------------------- */

export type ItemRecomendacao = {
  valor: RecomendacaoIa;
  rotulo: string;
  /** Ordem da fila de entrevista: 1 é quem a clínica liga primeiro. */
  ordem: number;
  /**
   * Pílula sobre fundo claro: letra `text-ink` ou o tom escuro da própria cor.
   * `text-lime`, `text-forest` e `text-brand-text` estão fora como letra sobre
   * papel — fundo claro, letra preta.
   */
  pilulaClara: string;
  /**
   * Pílula sobre fundo escuro (rh-aurora, rh-gaveta, jp-dark-glass): a letra é
   * SEMPRE branca. Quem carrega a cor da recomendação é o anel e o ícone, que
   * não são letra.
   */
  pilulaEscura: string;
};

const RECOMENDACAO_PADRAO: ItemRecomendacao = {
  valor: "talvez",
  rotulo: "Talvez",
  ordem: 3,
  pilulaClara: "bg-amber-50 text-amber-800 ring-1 ring-amber-200",
  pilulaEscura: "bg-amber-300/15 text-white ring-1 ring-amber-200/45",
};

/** Na ordem da fila: quem entrevistar primeiro aparece primeiro. */
export const RECOMENDACOES: ItemRecomendacao[] = [
  {
    valor: "entrevistar-ja",
    rotulo: "Entrevistar já",
    ordem: 1,
    // Sólida, como "contratado" no funil: é o único estado que pede ação hoje.
    pilulaClara: "bg-forest text-white ring-1 ring-forest",
    // O sólido escuro é `--forest` com letra branca, e não `--lime`: fundo verde
    // pede letra branca, e branco sobre lime mede 3,0:1. O lime segue no anel.
    pilulaEscura: "bg-forest text-white ring-1 ring-lime",
  },
  {
    valor: "entrevistar",
    rotulo: "Entrevistar",
    ordem: 2,
    pilulaClara: "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200",
    pilulaEscura: "bg-emerald-300/15 text-white ring-1 ring-emerald-200/45",
  },
  RECOMENDACAO_PADRAO,
  {
    valor: "descartar",
    rotulo: "Descartar",
    ordem: 4,
    pilulaClara: "bg-rose-50 text-rose-800 ring-1 ring-rose-200",
    pilulaEscura: "bg-rose-300/15 text-white ring-1 ring-rose-200/45",
  },
];

export type ItemSeveridade = {
  valor: SeveridadeSinal;
  rotulo: string;
  /**
   * Peso do alerta, também usado para ordenar. `info` vale 0 de propósito:
   * é aviso de contexto, não desconto — e é onde mora o sinal de conformidade,
   * que nunca pode empurrar a nota de ninguém para baixo.
   */
  peso: number;
  /** Fundo claro, letra `text-ink` ou o tom escuro da própria cor. */
  pilulaClara: string;
  /** Fundo verde/escuro, letra branca. Cor da gravidade fica no anel e no ícone. */
  pilulaEscura: string;
  /** Nome do componente lucide-react; quem renderiza faz o mapa nome -> ícone. */
  icone: string;
};

const SEVERIDADE_PADRAO: ItemSeveridade = {
  valor: "info",
  rotulo: "Informação",
  peso: 0,
  pilulaClara: "bg-cream text-ink ring-1 ring-border-soft",
  pilulaEscura: "bg-white/10 text-white ring-1 ring-white/30",
  icone: "Info",
};

/** Do mais grave para o mais leve — é esta a ordem em que o RH quer ler. */
export const SEVERIDADES: ItemSeveridade[] = [
  {
    valor: "critico",
    rotulo: "Crítico",
    peso: 100,
    // Sólida nos dois lados: crítico é o que faz a clínica parar antes de ligar.
    // Aqui o fundo não é verde nem branco — é rosé cheio —, então cada face
    // segue a metade da regra que lhe cabe: preenchimento escuro pede letra
    // branca (4,7:1) e preenchimento claro pede letra escura da própria cor
    // (rose-950 sobre rose-300 passa de 12:1).
    pilulaClara: "bg-rose-600 text-white ring-1 ring-rose-600",
    pilulaEscura: "bg-rose-300 text-rose-950 ring-1 ring-rose-300",
    icone: "OctagonAlert",
  },
  {
    valor: "alto",
    rotulo: "Atenção alta",
    peso: 60,
    pilulaClara: "bg-rose-50 text-rose-800 ring-1 ring-rose-200",
    pilulaEscura: "bg-rose-300/15 text-white ring-1 ring-rose-200/45",
    icone: "TriangleAlert",
  },
  {
    valor: "medio",
    rotulo: "Atenção",
    peso: 30,
    pilulaClara: "bg-amber-50 text-amber-800 ring-1 ring-amber-200",
    pilulaEscura: "bg-amber-300/15 text-white ring-1 ring-amber-200/45",
    icone: "CircleAlert",
  },
  {
    valor: "baixo",
    rotulo: "Observação",
    peso: 10,
    pilulaClara: "bg-sky-50 text-sky-800 ring-1 ring-sky-200",
    pilulaEscura: "bg-sky-300/15 text-white ring-1 ring-sky-200/45",
    icone: "CircleHelp",
  },
  SEVERIDADE_PADRAO,
];

/** Nunca devolve undefined, pelo mesmo motivo de `statusPor` em `opcoes.ts`. */
export function severidadePor(valor: SeveridadeSinal): ItemSeveridade {
  return SEVERIDADES.find((s) => s.valor === valor) ?? SEVERIDADE_PADRAO;
}

/** Idem: um JSON antigo com recomendação desconhecida não pode quebrar a tela. */
export function recomendacaoPor(valor: RecomendacaoIa): ItemRecomendacao {
  return RECOMENDACOES.find((r) => r.valor === valor) ?? RECOMENDACAO_PADRAO;
}
