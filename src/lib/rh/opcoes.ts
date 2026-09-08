/**
 * Catálogos do domínio de RH: tudo que vira <select>, chip ou pílula na tela.
 *
 * Os arrays são anotados com o tipo alvo em vez de `as const` porque um
 * `as const` os deixaria `readonly`, e componentes que fazem `[...lista].sort()`
 * ou recebem `string[]` não aceitariam o array readonly sem cópia.
 */
import type {
  AreaVaga,
  FaixaExperiencia,
  ModeloTrabalho,
  PrazoInicio,
  StatusCandidatura,
  StatusVaga,
  Vinculo,
} from "./tipos";

/** `icone` é o NOME do componente lucide-react; quem renderiza faz o mapa nome -> ícone. */
export const AREAS: { valor: AreaVaga; rotulo: string; descricao: string; icone: string }[] = [
  {
    valor: "dentista",
    rotulo: "Cirurgião-dentista",
    descricao: "Clínico geral ou especialista, com CRO ativo.",
    icone: "Stethoscope",
  },
  {
    valor: "asb-tsb",
    rotulo: "Auxiliar / Técnico em Saúde Bucal",
    descricao: "ASB e TSB para trabalho a quatro mãos e esterilização.",
    icone: "HeartPulse",
  },
  {
    valor: "recepcao",
    rotulo: "Recepção e atendimento",
    descricao: "Acolhimento, agenda, confirmação e pós-atendimento.",
    icone: "Headset",
  },
  {
    valor: "administrativo",
    rotulo: "Administrativo e gestão",
    descricao: "Financeiro, convênios, compras e rotinas da clínica.",
    icone: "Briefcase",
  },
  {
    valor: "estagio",
    rotulo: "Estágio",
    descricao: "Vagas para quem ainda está cursando.",
    icone: "GraduationCap",
  },
  {
    valor: "outro",
    rotulo: "Outra área",
    descricao: "Marketing, TI, limpeza e demais funções de apoio.",
    icone: "Sparkles",
  },
];

export const VINCULOS: { valor: Vinculo; rotulo: string }[] = [
  { valor: "clt", rotulo: "CLT" },
  { valor: "pj", rotulo: "PJ" },
  // Distinto de "PJ" de propósito: PJ pressupõe CNPJ e nota fiscal da pessoa;
  // prestador de serviços cobre também o autônomo com RPA. Quem publica a vaga
  // sabe a diferença, e o candidato também.
  { valor: "prestador", rotulo: "Prestador de serviços" },
  { valor: "estagio", rotulo: "Estágio" },
  { valor: "freelancer", rotulo: "Freelancer / diarista" },
  { valor: "indiferente", rotulo: "Indiferente" },
];

export const FAIXAS_EXPERIENCIA: { valor: FaixaExperiencia; rotulo: string }[] = [
  { valor: "sem", rotulo: "Sem experiência na área" },
  { valor: "0-2", rotulo: "Até 2 anos" },
  { valor: "2-5", rotulo: "De 2 a 5 anos" },
  { valor: "5-10", rotulo: "De 5 a 10 anos" },
  { valor: "10+", rotulo: "Mais de 10 anos" },
];

export const PRAZOS_INICIO: { valor: PrazoInicio; rotulo: string }[] = [
  { valor: "imediato", rotulo: "Imediato" },
  { valor: "15-dias", rotulo: "Em até 15 dias" },
  { valor: "30-dias", rotulo: "Em até 30 dias" },
  { valor: "a-combinar", rotulo: "A combinar" },
];

/** Especialidades reconhecidas pelo CFO, na grafia que o candidato espera ver. */
export const ESPECIALIDADES_ODONTO: string[] = [
  "Clínica geral",
  "Ortodontia",
  "Implantodontia",
  "Endodontia",
  "Periodontia",
  "Prótese dentária",
  "Odontopediatria",
  "Cirurgia e Traumatologia BMF",
  "Dentística",
  "Odontologia estética",
  "Harmonização orofacial",
  "Radiologia odontológica e imaginologia",
  "Estomatologia",
  "Odontogeriatria",
  "Disfunção temporomandibular e dor orofacial",
  "Odontologia do trabalho",
  "Pacientes com necessidades especiais",
  "Odontologia legal",
];

export const ESCOLARIDADES: string[] = [
  "Ensino médio incompleto",
  "Ensino médio completo",
  "Curso técnico",
  "Superior incompleto",
  "Superior completo",
  "Pós-graduação / especialização",
  "Mestrado",
  "Doutorado",
];

export const SOFTWARES: string[] = [
  "Dental Office",
  "Simples Dental",
  "iClinic",
  "Clinicorp",
  "Amigo",
  "Odontosys",
  "Dental Manager",
  "Excel / Planilhas",
  "Google Workspace",
  "Outro",
];

export const COMPETENCIAS: string[] = [
  "Atendimento humanizado",
  "Agendamento e confirmação",
  "Faturamento de convênios",
  "Negociação de planos de tratamento",
  "Esterilização e biossegurança",
  "Instrumentação a 4 mãos",
  "Radiografia periapical",
  "Moldagem",
  "Escaneamento intraoral",
  "Gestão de estoque",
  "Redes sociais",
  "Pós-venda e recall",
  "Controle de caixa",
  "Rotina de RH",
  "Inglês técnico",
  "Libras",
];

export const IDIOMAS: string[] = [
  "Português",
  "Inglês",
  "Espanhol",
  "Italiano",
  "Francês",
  "Alemão",
  "Libras",
];

export const ORIGENS: string[] = [
  "Indicação de colaborador",
  "Instagram da clínica",
  "Google",
  "Site da clínica",
  "LinkedIn",
  "Passou em frente à clínica",
  "Agência de emprego",
  "Outro",
];

export const UFS: string[] = [
  "AC",
  "AL",
  "AP",
  "AM",
  "BA",
  "CE",
  "DF",
  "ES",
  "GO",
  "MA",
  "MT",
  "MS",
  "MG",
  "PA",
  "PB",
  "PR",
  "PE",
  "PI",
  "RJ",
  "RN",
  "RS",
  "RO",
  "RR",
  "SC",
  "SP",
  "SE",
  "TO",
];

export const TURNOS: { valor: string; rotulo: string }[] = [
  { valor: "manha", rotulo: "Manhã" },
  { valor: "tarde", rotulo: "Tarde" },
  { valor: "noite", rotulo: "Noite" },
];

export const DIAS_SEMANA: { valor: string; rotulo: string; curto: string }[] = [
  { valor: "seg", rotulo: "Segunda", curto: "Seg" },
  { valor: "ter", rotulo: "Terça", curto: "Ter" },
  { valor: "qua", rotulo: "Quarta", curto: "Qua" },
  { valor: "qui", rotulo: "Quinta", curto: "Qui" },
  { valor: "sex", rotulo: "Sexta", curto: "Sex" },
  { valor: "sab", rotulo: "Sábado", curto: "Sáb" },
];

/**
 * A grade de disponibilidade vira uma lista plana de chaves ("seg-manha") em vez
 * de matriz: assim ela cabe em `string[]` no JSON e um turno novo não invalida
 * os registros já gravados.
 */
export function chaveDisponibilidade(dia: string, turno: string): string {
  return `${dia}-${turno}`;
}

export function rotuloDisponibilidade(chave: string): string {
  const separador = chave.indexOf("-");
  if (separador < 0) return chave;
  const dia = DIAS_SEMANA.find((d) => d.valor === chave.slice(0, separador));
  const turno = TURNOS.find((t) => t.valor === chave.slice(separador + 1));
  if (!dia || !turno) return chave;
  return `${dia.rotulo} - ${turno.rotulo.toLowerCase()}`;
}

export type ItemStatus = {
  valor: StatusCandidatura;
  rotulo: string;
  descricao: string;
  /**
   * Pílula sobre fundo claro. A letra é `text-ink` ou o tom escuro da própria
   * cor (amber-800, sky-800...): sobre papel, `text-lime`, `text-forest` e
   * `text-brand-text` estão fora por decisão do cliente — fundo claro, letra
   * preta.
   */
  pilulaClara: string;
  /**
   * Pílula sobre fundo escuro (rh-aurora, rh-vidro, jp-dark-glass). A letra é
   * SEMPRE `text-white`, também por ordem do cliente: em cima de verde, letra
   * branca. A identidade da cor passou para o anel e para o ponto/ícone, que
   * não são letra e por isso podem continuar coloridos.
   */
  pilulaEscura: string;
  /** Bolinha de status, para listas e colunas do funil. */
  ponto: string;
  /**
   * Frase completa de coluna vazia. Não dá para compor `Ninguém em ${rotulo}`:
   * metade dos rótulos já traz preposição ("Em triagem") ou pede contração
   * ("no Banco de talentos"), e "Ninguém em Não seguiu" não é frase nenhuma.
   */
  vazio: string;
};

/**
 * A primeira etapa do funil, com nome próprio. É exportada porque quem precisa
 * dela precisa DELA, e não do índice zero de uma lista: `STATUS[0]` obriga cada
 * chamador a lidar com um `undefined` que não existe, e um `"novo"` solto
 * espalha pelo painel a decisão de onde o funil começa.
 */
export const STATUS_INICIAL: ItemStatus = {
  valor: "novo",
  rotulo: "Novo",
  descricao: "Chegou agora e ainda não foi lido.",
  // `text-ink` e não `text-forest`: fundo claro pede letra preta. O verde da
  // marca continua no anel, que é contorno e não letra.
  pilulaClara: "bg-mint text-ink ring-1 ring-forest/25",
  // Letra branca sobre o verde, sem meio-termo: nem lime (3,9:1 sobre este
  // fundo) nem menta. O anel de lime foi reforçado para 45% porque agora é ele,
  // e a bolinha, que carregam a cor do estado.
  pilulaEscura: "bg-lime/15 text-white ring-1 ring-lime/45",
  ponto: "bg-lime",
  vazio: "Nenhuma candidatura nova",
};

/** Ordem do funil — a mesma usada nas colunas do painel. */
export const STATUS: ItemStatus[] = [
  STATUS_INICIAL,
  {
    valor: "triagem",
    rotulo: "Em triagem",
    descricao: "Currículo em análise pela equipe.",
    pilulaClara: "bg-amber-50 text-amber-800 ring-1 ring-amber-200",
    pilulaEscura: "bg-amber-300/15 text-white ring-1 ring-amber-200/45",
    ponto: "bg-amber-500",
    vazio: "Ninguém em triagem",
  },
  {
    valor: "entrevista",
    rotulo: "Entrevista",
    descricao: "Conversa agendada ou já realizada.",
    pilulaClara: "bg-sky-50 text-sky-800 ring-1 ring-sky-200",
    pilulaEscura: "bg-sky-300/15 text-white ring-1 ring-sky-200/45",
    ponto: "bg-sky-500",
    vazio: "Ninguém em entrevista",
  },
  {
    valor: "teste",
    rotulo: "Teste prático",
    descricao: "Avaliação técnica na clínica.",
    pilulaClara: "bg-violet-50 text-violet-800 ring-1 ring-violet-200",
    pilulaEscura: "bg-violet-300/15 text-white ring-1 ring-violet-200/45",
    ponto: "bg-violet-500",
    vazio: "Ninguém em teste prático",
  },
  {
    valor: "proposta",
    rotulo: "Proposta",
    descricao: "Proposta enviada, aguardando resposta.",
    pilulaClara: "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200",
    pilulaEscura: "bg-emerald-300/15 text-white ring-1 ring-emerald-200/45",
    ponto: "bg-emerald-500",
    vazio: "Ninguém com proposta aberta",
  },
  {
    valor: "contratado",
    rotulo: "Contratado",
    descricao: "Fechou com a clínica.",
    // Único estado sólido: é o desfecho que precisa saltar aos olhos na lista.
    pilulaClara: "bg-forest text-white ring-1 ring-forest",
    // Era `bg-lime` com letra `text-brand-deep`. Fundo verde pede letra branca,
    // e branco sobre `--lime` (#56a805) mede só 3,0:1 — não dá para ler rótulo
    // nenhum aí. Então o preenchimento desceu para `--forest`, onde o branco
    // passa de 10:1, e o lime ficou no anel: continua sendo a pílula sólida que
    // salta na lista, sem letra ilegível.
    pilulaEscura: "bg-forest text-white ring-1 ring-lime",
    ponto: "bg-forest",
    vazio: "Ninguém contratado ainda",
  },
  {
    valor: "reprovado",
    rotulo: "Não seguiu",
    descricao: "Processo encerrado para esta vaga.",
    pilulaClara: "bg-rose-50 text-rose-800 ring-1 ring-rose-200",
    pilulaEscura: "bg-rose-300/15 text-white ring-1 ring-rose-200/45",
    ponto: "bg-rose-500",
    vazio: "Nenhum processo encerrado",
  },
  {
    valor: "banco",
    rotulo: "Banco de talentos",
    descricao: "Bom perfil, guardado para uma vaga futura.",
    // Rótulo de pílula é rótulo: vai de `text-ink` no claro e de branco cheio no
    // escuro. O tom apagado ficou por conta do fundo e do anel, não da letra.
    pilulaClara: "bg-cream text-ink ring-1 ring-border-soft",
    pilulaEscura: "bg-white/10 text-white ring-1 ring-white/30",
    ponto: "bg-ink-soft",
    vazio: "Ninguém no banco de talentos",
  },
];

/**
 * Nunca devolve undefined: um JSON antigo com status desconhecido cairia em
 * `undefined` e quebraria a renderização da pílula inteira.
 */
export function statusPor(valor: StatusCandidatura): ItemStatus {
  return STATUS.find((s) => s.valor === valor) ?? STATUS_INICIAL;
}

export const ETIQUETAS_SUGERIDAS: string[] = [
  "Perfil forte",
  "Mora perto",
  "Disponibilidade imediata",
  "Precisa de treinamento",
  "Reavaliar em 6 meses",
  "Indicação interna",
];

/* -------------------------------------------------------------------------- */
/* Vagas                                                                      */
/* -------------------------------------------------------------------------- */

export const MODELOS_TRABALHO: { valor: ModeloTrabalho; rotulo: string }[] = [
  { valor: "presencial", rotulo: "Presencial" },
  { valor: "hibrido", rotulo: "Híbrido" },
  { valor: "remoto", rotulo: "Remoto" },
];

export type ItemStatusVaga = {
  valor: StatusVaga;
  rotulo: string;
  descricao: string;
  /** Mesma regra de `ItemStatus.pilulaClara`: fundo claro, letra `text-ink`. */
  pilulaClara: string;
  /** Mesma regra de `ItemStatus.pilulaEscura`: fundo verde, letra branca. */
  pilulaEscura: string;
};

const STATUS_VAGA_INICIAL: ItemStatusVaga = {
  valor: "rascunho",
  rotulo: "Rascunho",
  descricao: "Só o RH enxerga. Nada disso está no site.",
  pilulaClara: "bg-cream text-ink ring-1 ring-border-soft",
  pilulaEscura: "bg-white/10 text-white ring-1 ring-white/30",
};

/** Ordem do ciclo de vida da vaga, do rascunho ao encerramento. */
export const STATUS_VAGA: ItemStatusVaga[] = [
  STATUS_VAGA_INICIAL,
  {
    valor: "aberta",
    rotulo: "Aberta",
    descricao: "Publicada no portal e recebendo candidaturas.",
    // Sólida: é o único estado em que a vaga está no ar, e confundir isso com
    // "pausada" custa caro — ou some do site sem querer, ou fica publicada demais.
    pilulaClara: "bg-forest text-white ring-1 ring-forest",
    // Mesma troca de "contratado": o sólido virou `--forest` com letra branca,
    // porque branco sobre `--lime` fica em 3,0:1 e não se lê.
    pilulaEscura: "bg-forest text-white ring-1 ring-lime",
  },
  {
    valor: "pausada",
    rotulo: "Pausada",
    descricao: "Fora do ar por ora, sem perder nada do que já foi escrito.",
    pilulaClara: "bg-amber-50 text-amber-800 ring-1 ring-amber-200",
    pilulaEscura: "bg-amber-300/15 text-white ring-1 ring-amber-200/45",
  },
  {
    valor: "encerrada",
    rotulo: "Encerrada",
    descricao: "Processo finalizado; fica no histórico da clínica.",
    pilulaClara: "bg-rose-50 text-rose-800 ring-1 ring-rose-200",
    pilulaEscura: "bg-rose-300/15 text-white ring-1 ring-rose-200/45",
  },
];

/** Nunca devolve undefined, pelo mesmo motivo de `statusPor`. */
export function statusVagaPor(valor: StatusVaga): ItemStatusVaga {
  return STATUS_VAGA.find((s) => s.valor === valor) ?? STATUS_VAGA_INICIAL;
}

/**
 * Resume uma grade de disponibilidade em frases legíveis.
 *
 * A lista crua é uma chave por combinação dia+turno, e uma escala comum de
 * clínica ("segunda a sexta, manhã e tarde") vira DEZ pastilhas repetindo o
 * nome do dia: "Segunda - manhã", "Segunda - tarde", "Terça - manhã"… Ninguém
 * lê isso; a pessoa vê um bloco de texto e pula.
 *
 * Aqui os dias com o MESMO conjunto de turnos são agrupados em faixas
 * contíguas, na ordem da semana. O exemplo acima vira uma linha só:
 * "Segunda a sexta · manhã e tarde".
 *
 * Dia solto continua solto, e escala irregular (segunda de manhã, quarta o dia
 * todo) produz uma faixa por padrão — nunca esconde diferença de horário, que é
 * justamente o que a candidata precisa comparar com a vida dela.
 */
export function resumirDisponibilidade(chaves: string[]): string[] {
  const ordemTurno = new Map(TURNOS.map((t, i) => [t.valor, i]));

  // dia -> turnos, na ordem manhã/tarde/noite.
  const porDia = new Map<string, string[]>();
  for (const chave of chaves) {
    const corte = chave.indexOf("-");
    if (corte < 0) continue;
    const dia = chave.slice(0, corte);
    const turno = chave.slice(corte + 1);
    if (!ordemTurno.has(turno)) continue;
    const atual = porDia.get(dia) ?? [];
    if (!atual.includes(turno)) atual.push(turno);
    porDia.set(dia, atual);
  }
  for (const lista of porDia.values()) {
    lista.sort((a, b) => (ordemTurno.get(a) ?? 0) - (ordemTurno.get(b) ?? 0));
  }

  const nomeTurnos = (turnos: string[]): string => {
    const nomes = turnos.map((t) => TURNOS.find((x) => x.valor === t)?.rotulo.toLowerCase() ?? t);
    if (nomes.length <= 1) return nomes[0] ?? "";
    return nomes.slice(0, -1).join(", ") + " e " + nomes[nomes.length - 1];
  };

  const frases: string[] = [];
  let inicio: { indice: number; assinatura: string; turnos: string[] } | null = null;
  let fim = -1;

  const fechar = (): void => {
    if (inicio === null) return;
    const primeiro = DIAS_SEMANA[inicio.indice];
    const ultimo = DIAS_SEMANA[fim];
    if (primeiro === undefined || ultimo === undefined) return;
    const quantos = fim - inicio.indice + 1;
    const dias =
      quantos === 1
        ? primeiro.rotulo
        : quantos === 2
          ? `${primeiro.rotulo} e ${ultimo.rotulo.toLowerCase()}`
          : `${primeiro.rotulo} a ${ultimo.rotulo.toLowerCase()}`;
    frases.push(`${dias} · ${nomeTurnos(inicio.turnos)}`);
    inicio = null;
  };

  DIAS_SEMANA.forEach((dia, indice) => {
    const turnos = porDia.get(dia.valor);
    // Dia sem turno nenhum quebra a faixa: "segunda a sexta" não pode incluir
    // uma quarta em que a clínica não abre.
    if (turnos === undefined || turnos.length === 0) {
      fechar();
      return;
    }
    const assinatura = turnos.join("|");
    if (inicio !== null && inicio.assinatura === assinatura && fim === indice - 1) {
      fim = indice;
      return;
    }
    fechar();
    inicio = { indice, assinatura, turnos };
    fim = indice;
  });
  fechar();

  return frases;
}
