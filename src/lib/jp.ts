/** Retratos reais. Import, e não caminho em string, pelo mesmo motivo dos
 *  avatares: quem resolve a URL com hash é o bundler. */
import fotoJeferson from "@/assets/jefferson-barbosa.webp";
import fotoJuliana from "@/assets/juliana-pelisser.webp";

/**
 * Domínio de produção. Necessário porque og:image e canonical exigem URL absoluta.
 *
 * Com `www` porque é a forma canônica de verdade: o apex responde 308 e manda
 * para cá. Apontar para o endereço da Vercel, como estava, fazia o canonical de
 * cada página indicar ao buscador um domínio diferente do que a pessoa acessou.
 */
export const SITE_URL = "https://www.jpclinicaodontologica.com.br";

/**
 * Endereço em partes. O JSON-LD exige logradouro, cidade, UF e CEP separados,
 * e antes eles estavam escritos à mão no JSX — dois lugares para errar. Aqui a
 * string de exibição é montada a partir das partes, então há uma verdade só.
 */
const ENDERECO = {
  logradouro: "R. Rio Verde, 1029",
  bairro: "Vila Bruna",
  cidade: "São Paulo",
  uf: "SP",
  cep: "02934-201",
  pais: "BR",
} as const;

export const CLINICA = {
  nome: "JP Clínica Integrada Odontológica",
  razaoSocial: "J P Clínica Integrada Odontológica LTDA",
  cnpj: "42.401.404/0001-37",
  assinatura: "Ver seu sorriso é nossa missão.",
  telefone: "(11) 3975-9902",
  telefoneHref: "tel:+551139759902",
  whatsapp: "(11) 97616-5117",
  whatsappHref: "https://wa.me/5511976165117",
  local: ENDERECO,
  endereco: `${ENDERECO.logradouro} — ${ENDERECO.bairro}, ${ENDERECO.cidade} - ${ENDERECO.uf}, ${ENDERECO.cep}`,
  bairro: "Vila Bruna • região da Freguesia do Ó",
  cep: ENDERECO.cep,
  mapsHref:
    "https://www.google.com/maps/search/?api=1&query=R.+Rio+Verde,+1029+-+Vila+Bruna,+São+Paulo+-+SP,+02934-201",
  // Endpoint de embed do Google, sem chave de API.
  // Usamos a URL final de propósito: a forma curta (maps.google.com/...&output=embed)
  // passa por um redirecionamento que responde com X-Frame-Options: SAMEORIGIN.
  // Esta responde 200 sem esse cabeçalho, então pode ser enquadrada.
  /**
   * Embed de viewport, centrado nas coordenadas que o próprio Google resolveu
   * para o endereço (-23.4884235, -46.7046298).
   *
   * Não use a forma de busca (`!2m1!1s<endereço>`) nem a de compartilhamento
   * (`!3m3!1m2!1s<featureid>`): as duas rodam em modo "spotlit" e desenham um
   * painel branco no canto superior esquerdo, que aparecia por trás do nosso
   * cartão de endereço. A viewport não desenha painel — e, como ela também não
   * põe marcador, o pino é nosso, posicionado no centro do iframe.
   */
  mapsEmbed:
    "https://www.google.com/maps/embed?pb=!1m14!1m12!1m3!1d3659.2243490310!2d-46.7046298!3d-23.4884235!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!5e0!3m2!1spt-BR!2sbr!4v1770000000000!5m2!1spt-BR!2sbr",
  horario: "Segunda a sexta, 08:00 às 18:00",
  instagram: "https://www.instagram.com/jpclinicaodontologica/",
  facebook: "https://www.facebook.com/jpclinicaodontologica/",
  provaSocial: "4,5★ no Google • 176 avaliações",
};

/**
 * Trajetória da clínica.
 *
 * ✅ Data exata informada pela clínica em 14/08/2026: fundada em 17/08/2002.
 * Antes constava "2003, 23 anos", que era o que se sabia então. Com o dia certo,
 * o aniversário de 24 anos cai em 17/08/2026.
 *
 * Não "corrija" para 2021 achando que é erro. O CNPJ 42.401.404/0001-37 é de
 * 21/06/2021 e uma avaliação no Google fala em "mais de 3 anos" — os dois batem
 * com a pessoa jurídica atual, não com o início da clínica. A data de abertura
 * de um CNPJ não mede a idade de um negócio.
 *
 * `anos` é literal de propósito, como `anoCopyright`: calcular a partir de
 * `new Date()` faria servidor e navegador divergirem na virada do ano.
 * Custo: uma edição por ano, sempre em 17 de agosto.
 *   17/08/2027 → 25    17/08/2028 → 26
 */
export const HISTORIA = {
  fundacao: 2002,
  /** Dia exato, para quem for atualizar `anos` saber a partir de quando vale. */
  fundacaoData: "17/08/2002",
  anos: 24,
  /** Ano do aviso de copyright. Fixo pelo mesmo motivo de `anos`: `new Date()`
   *  no render faria servidor e navegador divergirem na virada do ano. */
  anoCopyright: 2026,
};

/**
 * Missão oficial da clínica, transcrita do quadro afixado na parede da JP.
 * Texto da própria clínica — não reescrever sem confirmar com eles.
 */
export const MISSAO =
  "Proporcionar aos nossos pacientes um tratamento humanizado e personalizado do começo ao fim, saúde bucal, sorriso e satisfação, resgatando sua autoestima!";

/**
 * Apresentação do gestor da clínica, escrita por ele — texto dele, em primeira
 * pessoa. Não reescrever sem confirmar.
 *
 * Ele não é dentista: é formado em Comunicação Social, com habilitação em
 * Relações Públicas. Por isso o card dele traz cargo e formação onde os demais
 * trazem CRO. Número de registro é dado regulado pelo CFO (Resolução 196/2019)
 * e atribuí-lo a quem não é do conselho seria afirmação falsa sobre uma pessoa
 * real — ver `Profissional.registro`.
 */
export const GESTOR = {
  nome: "Jeferson Barbosa",
  /**
   * "Gestor e fundador" veio da clínica. A apresentação dele, abaixo, fala do
   * trabalho de hoje e não menciona a fundação — quem informou os dois papéis
   * foi a clínica, e é ela quem sabe.
   */
  papel: "Gestor e fundador",
  formacao: "Comunicação Social — Relações Públicas",
  /**
   * Retrato de uma pessoa que existe — diferente dos rostos gerados que ainda
   * ocupam os cards fictícios. Não trocar por imagem de gerador.
   *
   * Recortado em 0,95:1 a partir do original 896x1200, começando 100px abaixo
   * do topo: é o enquadramento que deixa folga sobre a cabeça sem cortá-la.
   */
  foto: fotoJeferson as string | undefined,
  texto: [
    "Sou Jeferson Barbosa, formado em Comunicação Social, com habilitação em Relações Públicas.",
    "Ao longo da minha trajetória, descobri que comunicar vai muito além de falar ou transmitir uma mensagem. É saber ouvir, compreender pessoas, criar conexões e construir relacionamentos.",
    "Hoje, atuo como gestor da JP Clínica Integrada Odontológica, onde tenho a oportunidade de unir minha formação em comunicação à gestão de pessoas, processos e atendimento.",
    "Meu propósito é contribuir para que a clínica seja mais do que um lugar onde as pessoas buscam atendimento odontológico: quero ajudar a construir um ambiente baseado em acolhimento, respeito, confiança e cuidado humanizado.",
    "Acredito que uma boa gestão começa pelas pessoas. E que, quando existe propósito, comprometimento e humanidade, os resultados acontecem naturalmente.",
    "Sou Jeferson Barbosa: comunicador, gestor e, acima de tudo, alguém que acredita no poder das pessoas e das conexões.",
  ],
};

/**
 * Apresentação da fundadora, texto da clínica — não reescrever sem confirmar.
 *
 * Só a apresentação mora aqui: nome, CRO, cargo e retrato dela ficam em
 * EQUIPE[0], porque ela é dentista com registro e essa é a fonte que o rodapé
 * das 9 rotas lê. O Jeferson tem tudo em GESTOR justamente por não ser do
 * conselho — não há registro dele para guardar.
 */
export const FUNDADORA = {
  titulo: "Uma trajetória construída com sonhos, propósito e muitos sorrisos",
  formacao: "Odontologia — Faculdade de Odontologia de Araçatuba, UNESP (2001)",
  /** Escrito em terceira pessoa, ao contrário do texto do Jeferson. É assim
   *  que veio da clínica, e uniformizar seria reescrever o texto deles. */
  texto: [
    "Em 2001, a Dra. Juliana Pelisser Barbosa concluía sua formação pela Faculdade de Odontologia de Araçatuba — UNESP, carregando consigo muito mais do que um diploma: carregava sonhos, ideais e o desejo de transformar vidas através da Odontologia.",
    "Ao longo dessa trajetória, muitos desses sonhos foram se tornando realidade. Entre eles, o sonho de oferecer um atendimento verdadeiramente humanizado, onde cada paciente seja acolhido, ouvido e tratado com carinho, respeito e atenção.",
    "Para a Dra. Juliana, exercer a Odontologia nunca foi apenas sobre tratamentos, resultados ou questões financeiras. É, acima de tudo, sobre pessoas. É cuidar do bem-estar, devolver a autoestima, proporcionar confiança e, principalmente, fazer com que cada paciente saia da clínica levando consigo não apenas um novo sorriso, mas também a alegria de ser cuidado.",
    "Hoje, olhar para tudo o que foi construído ao longo desses anos é motivo de orgulho e gratidão. Ver novos projetos acontecendo, novas realizações surgindo e, principalmente, acompanhar tantos novos sorrisos é uma das maiores recompensas dessa caminhada.",
    "Cada sorriso transformado representa uma história, uma conquista e a confirmação de que vale a pena continuar acreditando nos sonhos.",
    "A trajetória continua. Os sonhos também. E que venham muitos outros sorrisos!",
  ],
};

/**
 * Avaliações reais de pacientes no Google.
 *
 * Nota e volume conferidos direto na ficha do Google em agosto de 2026:
 * 4,5 estrelas com 176 avaliações.
 *
 * Os textos abaixo vieram de um agregador (DentMap), que capturou apenas parte
 * das avaliações — vale conferir na ficha do Google e, se possível, ampliar
 * a seleção. Não acrescente depoimento que não exista lá.
 */
/**
 * Sem retrato, de propósito.
 *
 * Cada card trazia um rosto de gerador de faces ao lado do nome de quem
 * avaliou. Como os nomes são de pessoas reais da ficha do Google, a imagem
 * dizia "esta é a Marjorye" apontando para alguém que não existe. O card agora
 * mostra só nome e nota — que é o que o Google mostra também.
 */
export type Depoimento = {
  autor: string;
  texto: string;
  /** Marca depoimento inventado. Os reais vieram da ficha do Google. */
  ficticio?: boolean;
};

/** O primeiro entra em destaque; os quatro seguintes formam a grade. */
export const DEPOIMENTOS: Depoimento[] = [
  {
    autor: "Mari Nozzolillo",
    texto:
      "Estou muito satisfeita com a atendimento da Clínica, fui atendida pela Dra Ana Beatriz que fez a extração do meu dente com muita calma e paciência, me esclareceu todos os procedimentos que iria fazer e foi muito cuidadosa em todo momento. Um ambiente limpo, organizado e aconchegante. Super indico com certeza!",
  },
  {
    autor: "Valéria C.",
    texto:
      "Já faço meus tratamentos com eles há mais de 3 anos. A clínica é maravilhosa, atendimento cuidadoso e equipe muito acolhedora.",
  },
  {
    autor: "Marjorye A.",
    texto: "Fui bem recepcionada pelo Jeferson. Tudo muito perfeito! Parabéns a todos!",
  },
  // ─── ⚠️ FICTÍCIOS — TROCAR POR AVALIAÇÕES REAIS DO GOOGLE ──────────────────
  // A ficha tem 176 avaliações; só três foram transcritas até agora. Estes dois
  // existem para completar a grade. Depoimento inventado sob o rótulo
  // "avaliação no Google" é propaganda enganosa — substituir antes de divulgar.
  {
    autor: "Carolina T.",
    texto:
      "Meu filho foi muito bem atendido. Equipe paciente, carinhosa e muito profissional. Recomendo!",
    ficticio: true,
  },
  {
    autor: "Rafael M.",
    texto:
      "Atendimento impecável desde o primeiro contato. Planos claros e tratamentos que fazem a diferença.",
    ficticio: true,
  },
  // ───────────────────────────────────────────────────────────────────────────
];

/**
 * Equipe clínica.
 *
 * Só entra aqui quem tiver registro confirmado — CRO é dado regulado pelo CFO e
 * publicar número errado expõe a clínica. Os dados abaixo foram lidos da placa
 * da fachada. Campos opcionais ficam de fora do card quando ausentes.
 */
export type Profissional = {
  nome: string;
  registro: string;
  papel?: string;
  formacao?: string;
  especialidade?: string;
  /**
   * Vaga a preencher: renderiza em tom apagado, sem nome nem CRO inventado.
   */
  placeholder?: boolean;
  /**
   * ⚠️ PROFISSIONAL FICTÍCIO — apenas para visualizar o layout.
   *
   * Nome, especialidade, CRO e retrato são inventados. O rosto vem de um
   * gerador de faces (pessoa que não existe), justamente para não usar a
   * imagem de alguém real. O CRO segue o formato 00.00X, que nenhum registro
   * verdadeiro tem.
   *
   * SUBSTITUA POR DADOS REAIS ANTES DE DIVULGAR O SITE. Publicar dentista
   * inexistente numa clínica real induz o paciente a erro, e número de CRO é
   * dado regulado pelo CFO (Resolução 196/2019).
   */
  ficticio?: boolean;
  /**
   * Retrato recortado, em PNG ou WebP **com fundo transparente**.
   * Foto com fundo original quebra o efeito: a graça é a silhueta sobre a
   * forma verde, com a cabeça passando do topo. Sem foto, o card cai num
   * marcador neutro e o layout continua íntegro.
   */
  foto?: string;
};

/**
 * A responsável técnica da clínica.
 *
 * Fica **fora** de EQUIPE de propósito. A linha "Responsável técnica" do rodapé
 * sai nas 9 rotas por exigência da Resolução CFO 196/2019, e antes ela lia
 * EQUIPE[0] — ou seja, dependia de a pessoa certa ser a primeira da lista.
 * Bastou tirá-la da seção de equipe para essa linha passar a publicar o CRO
 * inventado do primeiro dentista fictício. Agora a fonte é explícita e a lista
 * da equipe pode mudar à vontade sem tocar num dado regulado.
 *
 * Também alimenta o card dela no bloco de história.
 */
export const RESPONSAVEL_TECNICA: Profissional = {
  /**
   * Nome completo, como a clínica confirmou. Chegou a ficar só "Pelisser
   * Barbosa" por um tempo, e voltou ao completo — que é também o que a linha de
   * responsável técnica do rodapé pede, por ser identificação exigida pela
   * Resolução CFO 196/2019.
   *
   * O texto dela tinha chegado como "Pelissari"; prevaleceu a grafia da clínica.
   */
  nome: "Dra. Juliana Pelisser Barbosa",
  /**
   * ✅ CONFERIDO PELA CLÍNICA em 14/08/2026.
   *
   * O campo já esteve como "78.159". A placa da fachada dizia "Responsável
   * Técnico CROSP 75.159" — lida com ampliação de 8x na foto original
   * (jp-clinica-odontologica-6.jpg) — e a clínica confirmou esse número.
   * As duas fontes batem, então o aviso de conferência saiu daqui.
   */
  registro: "CROSP 75.159",
  /**
   * Os três papéis na mesma linha porque os três valem: gestão e fundação,
   * informados pela clínica, e a responsabilidade técnica, que é o vínculo
   * regulado e sai também no rodapé de todas as rotas.
   */
  papel: "Gestora, fundadora e responsável técnica",
  foto: fotoJuliana,
};

/**
 * Quem aparece na seção "Nossa equipe".
 *
 * A responsável técnica não está aqui — ela tem apresentação própria no bloco
 * de história, e a clínica preferiu não repeti-la nesta grade.
 */
export const EQUIPE: Profissional[] = [
  // ─── ⚠️ FICTÍCIOS — TROCAR ANTES DE DIVULGAR ───────────────────────────────
  // Nenhuma destas pessoas existe. Retratos gerados por IA; CRO no formato
  // 00.00X, que nenhum registro real usa. Servem só para ver o layout cheio.
  //
  // As fotos ficam em public/images/equipe/ e são servidas por caminho
  // absoluto — vieram prontas e não passam pelo pipeline de assets do Vite.
  {
    nome: "Dr. Ricardo Almeida",
    registro: "CRO-SP 00.001",
    papel: "Clínico geral",
    foto: "/images/equipe/ricardo-almeida.jpg",
    ficticio: true,
  },
  {
    nome: "Dra. Mariana Costa",
    registro: "CRO-SP 00.002",
    papel: "Ortodontia",
    foto: "/images/equipe/mariana-costa.jpg",
    ficticio: true,
  },
  {
    nome: "Dr. Felipe Nunes",
    registro: "CRO-SP 00.003",
    papel: "Implantodontia",
    foto: "/images/equipe/felipe-nunes.jpg",
    ficticio: true,
  },
  {
    nome: "Dra. Camila Rocha",
    registro: "CRO-SP 00.004",
    papel: "Odontopediatria",
    foto: "/images/equipe/camila-rocha.jpg",
    ficticio: true,
  },
  {
    nome: "Dra. Beatriz Lima",
    registro: "CRO-SP 00.005",
    papel: "Harmonização orofacial",
    foto: "/images/equipe/beatriz-lima.jpg",
    ficticio: true,
  },
  // ───────────────────────────────────────────────────────────────────────────
];

export const whatsappLink = (mensagem: string) =>
  `${CLINICA.whatsappHref}?text=${encodeURIComponent(mensagem)}`;

export const NAV = [
  { label: "Início", href: "/#inicio" },
  { label: "A Clínica", href: "/#clinica" },
  { label: "Nossa História", href: "/#historia" },
  { label: "Tratamentos", href: "/#tratamentos" },
  { label: "Depoimentos", href: "/#depoimentos" },
  { label: "Estrutura", href: "/#estrutura" },
  { label: "FAQ", href: "/#faq" },
  { label: "Contato", href: "/#fale" },
];

export type Tratamento = {
  slug: string;
  titulo: string;
  short: string;
  desc: string;
  icone: string;
  kicker: string;
  manifesto: string;
  paraQuem: string[];
  beneficios: string[];
  etapas: { n: string; titulo: string; texto: string }[];
  faq: { q: string; a: string }[];
  destaque: string;
};

export const TRATAMENTOS: Tratamento[] = [
  {
    slug: "limpeza-profilaxia",
    titulo: "Limpeza e profilaxia",
    short: "Limpeza",
    desc: "Remoção de placa e tártaro, com orientação de higiene e acompanhamento preventivo individualizado.",
    icone: "sparkles",
    kicker: "Prevenção que começa no básico bem feito.",
    manifesto:
      "Saúde bucal também é rotina. A limpeza profissional entra como parte de um acompanhamento pensado para preservar dentes e gengiva ao longo do tempo.",
    paraQuem: [
      "Quem quer manter a prevenção em dia",
      "Pacientes com acúmulo de placa ou tártaro",
      "Quem precisa revisar hábitos de higiene",
    ],
    beneficios: [
      "Acompanhamento preventivo",
      "Orientação de higiene personalizada",
      "Avaliação de dentes e gengiva durante a consulta",
    ],
    etapas: [
      {
        n: "01",
        titulo: "Avaliação",
        texto: "A equipe examina dentes e gengiva e entende sua rotina de higiene.",
      },
      {
        n: "02",
        titulo: "Limpeza",
        texto: "A remoção de placa e tártaro é feita conforme a necessidade identificada.",
      },
      {
        n: "03",
        titulo: "Orientação",
        texto: "Você recebe recomendações práticas para o cuidado em casa.",
      },
      {
        n: "04",
        titulo: "Acompanhamento",
        texto: "O intervalo de retorno é definido de forma individual.",
      },
    ],
    faq: [
      {
        q: "Limpeza e remoção de tártaro são a mesma coisa?",
        a: "Podem fazer parte da mesma consulta, mas a conduta depende do que for identificado na avaliação.",
      },
      {
        q: "Qual é o intervalo ideal?",
        a: "Não existe um intervalo único para todas as pessoas. A periodicidade é definida de acordo com o seu caso.",
      },
    ],
    destaque: "Cuidar antes de incomodar.",
  },
  {
    slug: "clareamento-dental",
    titulo: "Clareamento dental",
    short: "Clareamento",
    desc: "Protocolos de clareamento indicados após avaliação, respeitando as características e a sensibilidade de cada paciente.",
    icone: "sun",
    kicker: "Estética com indicação, não com pressa.",
    manifesto:
      "Clarear o sorriso começa por entender a condição dos dentes e o resultado possível para o seu caso. A proposta é buscar naturalidade com acompanhamento profissional.",
    paraQuem: [
      "Quem deseja um sorriso visualmente mais claro",
      "Pacientes aptos após avaliação clínica",
      "Quem busca um plano estético acompanhado",
    ],
    beneficios: [
      "Planejamento individual",
      "Acompanhamento da evolução",
      "Orientações para antes, durante e depois",
    ],
    etapas: [
      {
        n: "01",
        titulo: "Avaliação",
        texto: "A condição dos dentes e gengiva é analisada antes de qualquer indicação.",
      },
      {
        n: "02",
        titulo: "Planejamento",
        texto: "A equipe define a abordagem adequada e explica o que esperar.",
      },
      {
        n: "03",
        titulo: "Clareamento",
        texto: "O protocolo é realizado de acordo com a indicação profissional.",
      },
      {
        n: "04",
        titulo: "Revisão",
        texto: "A evolução é acompanhada e os cuidados de manutenção são orientados.",
      },
    ],
    faq: [
      {
        q: "Todo mundo pode fazer clareamento?",
        a: "Não. A indicação depende da avaliação clínica, da saúde bucal e de características individuais.",
      },
      {
        q: "O resultado fica igual para todas as pessoas?",
        a: "Não. A resposta ao clareamento varia, por isso o planejamento é individualizado.",
      },
    ],
    destaque: "Mais luz. Sem perder naturalidade.",
  },
  {
    slug: "restauracoes",
    titulo: "Restaurações",
    short: "Restaurações",
    desc: "Recuperação de dentes comprometidos por cárie ou perda de estrutura, buscando função, forma e integração estética.",
    icone: "shield",
    kicker: "Reconstruir sem chamar atenção para a reconstrução.",
    manifesto:
      "Uma restauração bem planejada busca devolver ao dente o que foi perdido, respeitando função, formato e contexto do sorriso.",
    paraQuem: [
      "Pacientes com cárie",
      "Dentes com perda de estrutura",
      "Casos que precisam recuperar forma e função",
    ],
    beneficios: [
      "Recuperação da estrutura dental",
      "Busca por integração estética",
      "Planejamento de acordo com a extensão do caso",
    ],
    etapas: [
      {
        n: "01",
        titulo: "Diagnóstico",
        texto: "A equipe identifica a extensão do comprometimento do dente.",
      },
      {
        n: "02",
        titulo: "Planejamento",
        texto: "A conduta e o material são definidos conforme a indicação.",
      },
      {
        n: "03",
        titulo: "Restauração",
        texto: "A estrutura é reconstruída buscando função e formato adequados.",
      },
      {
        n: "04",
        titulo: "Ajustes",
        texto: "Mordida, acabamento e orientações são revisados ao final.",
      },
    ],
    faq: [
      {
        q: "Toda cárie precisa de restauração?",
        a: "A conduta depende da avaliação e do estágio da lesão. O profissional define a abordagem mais adequada.",
      },
      {
        q: "Restauração pode precisar ser trocada?",
        a: "Restaurações precisam de acompanhamento. A necessidade de reparo ou troca é avaliada caso a caso.",
      },
    ],
    destaque: "Forma e função voltando a conversar.",
  },
  {
    slug: "implantes-dentarios",
    titulo: "Implantes dentários",
    short: "Implantes",
    desc: "Reabilitação de dentes ausentes com planejamento individual e acompanhamento profissional em cada etapa.",
    icone: "anchor",
    kicker: "Reabilitação é recuperar presença, função e confiança.",
    manifesto:
      "Perder um dente muda mais do que a imagem do sorriso. O planejamento com implantes considera estrutura, função e contexto clínico antes de definir o caminho.",
    paraQuem: [
      "Pessoas com um ou mais dentes ausentes",
      "Quem precisa discutir possibilidades de reabilitação",
      "Pacientes aptos após exames e avaliação",
    ],
    beneficios: [
      "Planejamento reabilitador individual",
      "Acompanhamento por etapas",
      "Foco em função e integração ao sorriso",
    ],
    etapas: [
      {
        n: "01",
        titulo: "Avaliação",
        texto: "Histórico, condição bucal e exames necessários são considerados no planejamento.",
      },
      {
        n: "02",
        titulo: "Plano",
        texto: "A equipe explica possibilidades, etapas e cuidados previstos para o caso.",
      },
      {
        n: "03",
        titulo: "Tratamento",
        texto: "O procedimento é realizado conforme a indicação e o planejamento profissional.",
      },
      {
        n: "04",
        titulo: "Reabilitação e manutenção",
        texto: "A fase protética e os retornos de acompanhamento completam o cuidado.",
      },
    ],
    faq: [
      {
        q: "Implante serve para qualquer pessoa?",
        a: "Não necessariamente. A indicação depende de avaliação clínica, exames e condições individuais de saúde.",
      },
      {
        q: "Preciso fazer exames antes?",
        a: "Em muitos casos, exames de imagem e outras avaliações ajudam no planejamento. A equipe orienta o que é necessário.",
      },
    ],
    destaque: "Um plano para voltar a sorrir com estrutura.",
  },
  {
    slug: "proteses-dentarias",
    titulo: "Próteses dentárias",
    short: "Próteses",
    desc: "Soluções protéticas fixas ou removíveis planejadas para apoiar mastigação, conforto e harmonia do sorriso.",
    icone: "layers",
    kicker: "Reabilitar é devolver possibilidades ao dia a dia.",
    manifesto:
      "Próteses são parte de um projeto de reabilitação. Cada caso pede uma solução compatível com as condições clínicas, a função e as prioridades do paciente.",
    paraQuem: [
      "Quem perdeu um ou mais dentes",
      "Pacientes que precisam revisar uma prótese existente",
      "Quem busca recuperar função mastigatória",
    ],
    beneficios: [
      "Planejamento individual",
      "Opções fixas ou removíveis conforme indicação",
      "Acompanhamento de adaptação e manutenção",
    ],
    etapas: [
      {
        n: "01",
        titulo: "Avaliação",
        texto: "A condição bucal e a necessidade de reabilitação são analisadas.",
      },
      {
        n: "02",
        titulo: "Escolha da solução",
        texto: "As possibilidades adequadas ao caso são apresentadas com clareza.",
      },
      {
        n: "03",
        titulo: "Confecção e provas",
        texto: "A adaptação, forma e função são conferidas ao longo do processo.",
      },
      {
        n: "04",
        titulo: "Entrega e retorno",
        texto: "A equipe orienta higiene, adaptação e acompanhamento.",
      },
    ],
    faq: [
      {
        q: "Existe só um tipo de prótese?",
        a: "Não. Há diferentes soluções protéticas, e a escolha depende da avaliação e das condições de cada caso.",
      },
      {
        q: "Prótese precisa de manutenção?",
        a: "Sim. O acompanhamento ajuda a revisar adaptação, higiene e condições dos tecidos de suporte.",
      },
    ],
    destaque: "Conforto para voltar ao que importa.",
  },
  {
    slug: "ortodontia",
    titulo: "Aparelhos e ortodontia",
    short: "Ortodontia",
    desc: "Alinhamento dos dentes e acompanhamento da mordida por meio de planejamento ortodôntico individualizado.",
    icone: "align",
    kicker: "Mover dentes exige direção.",
    manifesto:
      "Ortodontia é um processo. O objetivo, o tipo de aparelho e o tempo de acompanhamento dependem do diagnóstico e da resposta de cada paciente.",
    paraQuem: [
      "Quem deseja avaliar alinhamento dentário",
      "Pacientes com alterações de mordida",
      "Crianças, adolescentes ou adultos com indicação ortodôntica",
    ],
    beneficios: [
      "Planejamento de movimentação",
      "Acompanhamento periódico",
      "Avaliação funcional e estética do sorriso",
    ],
    etapas: [
      {
        n: "01",
        titulo: "Avaliação",
        texto: "A posição dos dentes, mordida e objetivos são analisados.",
      },
      {
        n: "02",
        titulo: "Documentação",
        texto: "Quando indicada, a documentação ajuda a estruturar o planejamento.",
      },
      {
        n: "03",
        titulo: "Tratamento",
        texto: "O aparelho e a estratégia são definidos de acordo com o diagnóstico.",
      },
      {
        n: "04",
        titulo: "Acompanhamento",
        texto: "As consultas periódicas permitem revisar a evolução e ajustar o plano.",
      },
    ],
    faq: [
      {
        q: "Adulto pode usar aparelho?",
        a: "Sim, quando há indicação. A possibilidade e o tipo de tratamento são definidos após avaliação.",
      },
      {
        q: "Quanto tempo dura?",
        a: "O tempo varia conforme o diagnóstico, o objetivo e a resposta individual ao tratamento.",
      },
    ],
    destaque: "Um movimento por vez. Um plano inteiro por trás.",
  },
  {
    slug: "odontopediatria",
    titulo: "Odontopediatria",
    short: "Odontopediatria",
    desc: "Cuidado odontológico para crianças com linguagem simples, acolhimento e construção gradual de confiança.",
    icone: "heart",
    kicker: "O primeiro vínculo com o dentista pode ser uma boa memória.",
    manifesto:
      "Cuidar de criança também é cuidar da experiência. A consulta respeita o tempo, a curiosidade e a adaptação de cada pequeno paciente.",
    paraQuem: [
      "Bebês e crianças",
      "Famílias que querem iniciar prevenção cedo",
      "Crianças que precisam construir confiança no ambiente odontológico",
    ],
    beneficios: [
      "Abordagem acolhedora",
      "Orientação para responsáveis",
      "Foco em prevenção e hábitos desde cedo",
    ],
    etapas: [
      {
        n: "01",
        titulo: "Acolhimento",
        texto: "A criança conhece o ambiente e a equipe de forma gradual.",
      },
      {
        n: "02",
        titulo: "Avaliação",
        texto: "A saúde bucal, hábitos e fase de desenvolvimento são observados.",
      },
      {
        n: "03",
        titulo: "Orientação",
        texto: "Responsáveis recebem orientações práticas para a rotina da criança.",
      },
      {
        n: "04",
        titulo: "Acompanhamento",
        texto: "Os retornos ajudam a manter prevenção e familiaridade com o cuidado.",
      },
    ],
    faq: [
      {
        q: "Quando levar a criança ao dentista?",
        a: "A avaliação precoce pode ajudar os responsáveis com higiene, hábitos e prevenção. A equipe orienta de acordo com a fase da criança.",
      },
      {
        q: "E se a criança tiver medo?",
        a: "A adaptação pode ser gradual. O atendimento busca respeitar o tempo da criança e construir confiança.",
      },
    ],
    destaque: "Pequenos sorrisos. Grandes memórias.",
  },
  {
    slug: "harmonizacao-orofacial",
    titulo: "Harmonização orofacial",
    short: "Harmonização",
    desc: "Botox, preenchimento e skinbooster quando indicados, sempre mediante avaliação profissional e planejamento individual.",
    icone: "wand",
    kicker: "Estética facial sem apagar quem você é.",
    manifesto:
      "Procedimentos faciais devem começar por indicação, proporção e contexto. O objetivo é construir um plano coerente com a anatomia e as expectativas do paciente.",
    paraQuem: [
      "Quem deseja discutir estética facial com um profissional",
      "Pacientes aptos após avaliação",
      "Quem busca um plano individual para botox, preenchimento ou skinbooster",
    ],
    beneficios: [
      "Avaliação individual",
      "Planejamento por objetivos",
      "Indicação responsável de procedimentos",
    ],
    etapas: [
      {
        n: "01",
        titulo: "Conversa",
        texto: "Objetivos, histórico e expectativas são discutidos sem pressa.",
      },
      {
        n: "02",
        titulo: "Avaliação facial",
        texto: "O profissional analisa proporções e indicações possíveis para o caso.",
      },
      {
        n: "03",
        titulo: "Plano",
        texto: "Procedimentos e prioridades são definidos apenas quando indicados.",
      },
      {
        n: "04",
        titulo: "Acompanhamento",
        texto: "A evolução é revisada e novas condutas dependem da necessidade clínica.",
      },
    ],
    faq: [
      {
        q: "Vocês fazem botox e preenchimento?",
        a: "Esses procedimentos aparecem entre os serviços divulgados pela clínica e são realizados somente mediante avaliação e indicação profissional.",
      },
      {
        q: "Posso escolher um procedimento pela internet?",
        a: "O site ajuda a entender possibilidades, mas a indicação só pode ser definida após avaliação profissional.",
      },
    ],
    destaque: "Sutileza é parte do plano.",
  },
];

export const FAQ = [
  {
    q: "Como faço para agendar uma avaliação?",
    /**
     * Nada de contato é redigitado nas respostas — tudo sai de CLINICA e de
     * ENDERECO. Estava tudo à mão, e foi assim que um WhatsApp errado sobreviveu
     * no site: corrigir o cadastro não corrigia a FAQ.
     *
     * O horário entra em minúsculas porque no cadastro ele é uma frase solta
     * ("Segunda a sexta…") e aqui vem no meio de outra.
     */
    a: `Você pode falar com a recepção pelo WhatsApp ${CLINICA.whatsapp}, ligar para ${CLINICA.telefone} ou usar o formulário do site. Atendemos ${CLINICA.horario.toLowerCase()}.`,
  },
  {
    q: "Onde fica a clínica?",
    a: `A ${CLINICA.nome} fica na ${ENDERECO.logradouro} — ${ENDERECO.bairro}, região da Freguesia do Ó, em ${ENDERECO.cidade} (CEP ${ENDERECO.cep}).`,
  },
  {
    q: "Vocês atendem crianças e idosos?",
    a: "Sim. Atendemos todas as fases da vida — da odontopediatria ao cuidado com adultos e idosos.",
  },
  {
    q: "Tenho receio de ir ao dentista. Posso conversar antes?",
    a: "Sim. Você pode explicar suas preocupações no agendamento e durante a avaliação. Explicamos cada etapa antes de começar e respeitamos o seu ritmo.",
  },
  {
    q: "De quanto em quanto tempo devo fazer check-up?",
    a: "A periodicidade depende do histórico, da condição bucal e do risco individual. O intervalo ideal deve ser definido pelo profissional na avaliação.",
  },
  {
    q: "Como sei qual tratamento eu preciso?",
    a: "O site apresenta os serviços da clínica, mas a indicação só é definida após avaliação presencial e análise individual do caso.",
  },
  {
    q: "A harmonização orofacial é indicada para qualquer pessoa?",
    a: "Não. Procedimentos como botox, preenchimento e skinbooster dependem de avaliação profissional, histórico de saúde e indicação individual.",
  },
  {
    q: "A clínica trabalha com convênios ou parcelamento?",
    a: "Essas condições podem mudar. Para informação atualizada sobre convênios, formas de pagamento e disponibilidade, consulte diretamente a equipe pelo WhatsApp.",
  },
];
