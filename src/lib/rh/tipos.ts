/**
 * Tipos e constantes do domínio de RH.
 *
 * Este arquivo é a fronteira comum entre o formulário público, o painel do admin
 * e a camada de persistência do servidor. Por isso ele não faz I/O, não importa
 * React e não conhece `fs` — qualquer um dos três lados pode carregá-lo.
 */
import { HISTORIA } from "@/lib/jp";
import type { FichaEntrevista } from "./ficha";
import type { AnaliseIa } from "./ia/tipos";

export type StatusCandidatura =
  "novo" | "triagem" | "entrevista" | "teste" | "proposta" | "contratado" | "reprovado" | "banco";

export type AreaVaga = "dentista" | "asb-tsb" | "recepcao" | "administrativo" | "estagio" | "outro";

export type Vinculo = "clt" | "pj" | "prestador" | "estagio" | "freelancer" | "indiferente";

export type FaixaExperiencia = "sem" | "0-2" | "2-5" | "5-10" | "10+";

export type PrazoInicio = "imediato" | "15-dias" | "30-dias" | "a-combinar";

export type ExperienciaItem = {
  empresa: string;
  cargo: string;
  periodo: string;
  atividades: string;
};

export type ArquivoCurriculo = {
  /** Já sanitizado: é este nome que vira arquivo em disco. */
  nomeArquivo: string;
  nomeOriginal: string;
  /** Mime declarado no upload. */
  tipo: string;
  tamanho: number;
  /** ISO. */
  enviadoEm: string;
};

export type Anotacao = { id: string; autor: string; texto: string; criadoEm: string };

export type Candidatura = {
  id: string;
  protocolo: string;
  criadoEm: string;
  atualizadoEm: string;

  /**
   * Trajeto até a clínica. `null` até alguém calcular — e para os registros
   * gravados antes deste campo existir ele chega como `undefined` do banco,
   * então quem lê usa `?? null`.
   */
  trajeto: Trajeto | null;

  /** Vaga a que a pessoa se candidatou. Vazio quando é candidatura espontânea. */
  vagaId: string;
  /**
   * Cópia do título no momento do envio. É redundante de propósito: se a vaga
   * for encerrada ou renomeada depois, a candidatura antiga continua fazendo
   * sentido — sem isso, o painel mostraria "vaga removida" para um processo que
   * a clínica ainda precisa entender. Quem manda no valor é o servidor.
   */
  vagaTitulo: string;

  area: AreaVaga;
  cargoDesejado: string;
  vinculo: Vinculo;
  especialidades: string[];
  disponibilidade: string[];
  inicioEm: PrazoInicio;
  pretensao: string;

  nome: string;
  nascimento: string;
  cpf: string;
  email: string;
  telefone: string;
  cep: string;
  logradouro: string;
  bairro: string;
  cidade: string;
  uf: string;
  linkedin: string;
  instagram: string;

  escolaridade: string;
  instituicao: string;
  anoFormacao: string;
  cro: string;
  croUf: string;
  posGraduacoes: string;
  cursos: string;

  anosExperiencia: FaixaExperiencia;
  experiencias: ExperienciaItem[];
  softwares: string[];
  competencias: string[];
  idiomas: string[];

  cartaApresentacao: string;
  origem: string;
  indicadoPor: string;
  curriculo: ArquivoCurriculo | null;
  consentimentoLgpd: boolean;
  /**
   * Qual redação do aviso a pessoa aceitou (`VERSAO_CONSENTIMENTO_LGPD` no
   * momento do envio). Só `consentimentoLgpd: true` prova que houve aceite, não
   * o quê foi aceito — e o texto muda com o tempo. Quem carimba é o servidor:
   * aceitar este campo do payload deixaria o registro dizer qualquer coisa.
   */
  consentimentoVersao: string;

  status: StatusCandidatura;
  nota: number;
  etiquetas: string[];
  responsavel: string;
  entrevistaEm: string;
  anotacoes: Anotacao[];
  arquivada: boolean;

  /**
   * Momento em que esta ficha e o currículo dela somem de vez. ISO, ou "" para
   * a esmagadora maioria — que não está marcada para nada.
   *
   * POR QUE MARCAR EM VEZ DE APAGAR NA HORA
   * Apagar era imediato e irreversível. Numa lista de 55 pessoas, um clique
   * errado é questão de tempo, e não havia de onde trazer de volta: o registro
   * e o PDF saíam do banco no mesmo instante. Agora o botão AGENDA — a ficha
   * sai da lista na hora, e sobram `DIAS_ATE_EXCLUIR` dias para desfazer.
   *
   * Quem apaga de fato é `varrerExcluidas`. Uma data no passado não significa
   * "já foi": significa "some na próxima varredura".
   */
  excluirEm: string;

  /**
   * Triagem por IA. `null` enquanto ninguém mandou analisar — e é `null`, e não
   * um objeto zerado, justamente para a tela conseguir distinguir "ainda não
   * analisei" de "analisei e não achei nada".
   */
  analise: AnaliseIa | null;
  /**
   * A ficha de entrevista no formato da clínica (o guia da Dra. Ana Beatriz e
   * do Jefferson). `null` enquanto ninguém mandou gerar — e é `null`, e não uma
   * ficha em branco, pelo mesmo motivo de `analise`: a tela precisa distinguir
   * "ainda não existe ficha" de "existe uma ficha que ninguém preencheu".
   */
  ficha: FichaEntrevista | null;
  /**
   * Nome do arquivo de onde a candidatura foi importada; "" quando a pessoa se
   * candidatou pelo site. É o rastro de onde aquele currículo apareceu — o
   * acervo da clínica chega em pastas, e sem isso não dá para voltar ao
   * original quando a leitura sai duvidosa.
   */
  origemArquivo: string;
  /**
   * SHA-256 do currículo. Serve para não reanalisar (nem recontratar espaço e
   * token com) o mesmo PDF que já entrou em outra importação — o mesmo arquivo
   * costuma aparecer em duas pastas diferentes.
   */
  hashArquivo: string;
};

/**
 * Campos que o painel do admin pode alterar. Nada preenchido pelo candidato entra
 * aqui: a rota de atualização copia só estas chaves, então um POST malicioso não
 * consegue reescrever nome, CPF ou currículo de ninguém.
 */
/**
 * `area` entra aqui, e é a única propriedade do CURRÍCULO que o painel pode
 * reescrever.
 *
 * Motivo, nas palavras do cliente: gente se candidata a recepção para "ter
 * visibilidade na clínica" e é dentista; ASB se inscreve na vaga de recepção
 * porque é a que está aberta. A área declarada no formulário é o que a pessoa
 * DISSE, e às vezes não é onde ela se encaixa — e é a área que decide a régua
 * da IA, o filtro do painel e a etiqueta do cartão.
 *
 * `cargoDesejado` — o que a pessoa escreveu de próprio punho — nunca é
 * reescrito, e a troca deixa uma linha no histórico dela. Reclassificar é
 * anotar uma leitura da clínica por cima do que foi declarado, nunca apagar o
 * que foi declarado.
 *
 * `vagaId` entra pelo mesmo motivo, para o outro caso: a pessoa se candidatou
 * à recepção porque era a vaga aberta e o lugar dela é outro processo. Trocar
 * a vaga move a candidatura de fila — muda o filtro "Vaga", a contagem do
 * anúncio e o comparativo.
 *
 * `vagaTitulo` NÃO entra: quem o escreve é o servidor, a partir da vaga
 * escolhida. Se o painel pudesse mandar o título, um POST forjado (ou um bug de
 * tela) gravaria "Cirurgião-dentista" numa candidatura ligada à vaga de
 * recepção, e as duas verdades nunca mais bateriam.
 */
/**
 * Distância e tempo até a clínica, por rua.
 *
 * Vem do OpenStreetMap (ver `servidor/rotas.ts`) e é GRAVADO na ficha porque a
 * consulta é a um serviço público de terceiros: calculado uma vez, vale para
 * sempre — o endereço da pessoa não muda e o da clínica também não. É `null`
 * enquanto ninguém calculou, e continua `null` quando não deu para calcular
 * (currículo que só diz "São Paulo", serviço fora do ar).
 *
 * NÃO substitui a região de `ia/proximidade.ts`: aquela é local, instantânea e
 * funciona para todo mundo; esta é precisa e funciona para quem informou o
 * bairro ou o CEP.
 */
export type Trajeto = {
  /** Quilômetros por rua, uma casa decimal. */
  km: number;
  /** Minutos DE CARRO E SEM TRÂNSITO — a tela precisa dizer isso. */
  minutos: number;
  /** O endereço que foi consultado. É o que permite conferir o número. */
  origem: string;
  /** ISO. */
  calculadoEm: string;
};

export type CamposGeriveis = Pick<
  Candidatura,
  "status" | "nota" | "etiquetas" | "responsavel" | "entrevistaEm" | "arquivada" | "area" | "vagaId"
>;

/**
 * Janela de arrependimento da exclusão, em dias.
 *
 * Sete porque é o prazo que o cliente pediu e porque cobre uma semana inteira
 * de trabalho: quem apagou na sexta e percebeu na segunda ainda alcança.
 */
export const DIAS_ATE_EXCLUIR = 7;

/** Limite de upload, aplicado no cliente (retorno imediato) e no servidor (de verdade). */
export const TAMANHO_MAX_CURRICULO = 8 * 1024 * 1024;

/**
 * Redação vigente do aviso de LGPD do formulário público (finalidade, prazo e
 * controladora). **Suba a data sempre que o texto do aviso mudar**: é ela que
 * fica gravada em `Candidatura.consentimentoVersao` e é a única forma de saber
 * depois o que a pessoa leu quando marcou a caixa.
 */
export const VERSAO_CONSENTIMENTO_LGPD = "2026-09-06";

/**
 * Prazo de guarda prometido no aviso de LGPD do formulário ("pelo prazo de até
 * 24 meses"), em meses.
 *
 * É promessa feita ao candidato, não configuração: quem mudar o número aqui
 * precisa mudar o texto do aviso em `trabalhe-conosco.tsx` **e** subir
 * `VERSAO_CONSENTIMENTO_LGPD`, senão o registro de consentimento passa a
 * apontar para uma redação que ninguém leu.
 */
export const MESES_RETENCAO_LGPD = 24;

/**
 * Tamanho máximo de cada campo de texto longo, em caracteres.
 *
 * Existe porque o número precisa ser o MESMO no `maxLength` do campo e no corte
 * do servidor. Quando os dois discordam (o campo aceitava 6000 e o servidor
 * gravava 4000), o RH escreve, salva, recebe "Vaga salva." — e descobre o
 * parágrafo cortado no meio de uma frase só quando abre a página pública.
 * Um número, um lugar.
 */
export const LIMITES = {
  /** Descrição da vaga e carta de apresentação do candidato. */
  textoLongo: 4000,
  /** "Sobre a clínica", nas configurações do portal. */
  textoSobre: 2000,
  /** Pós-graduações e cursos livres, no formulário público. */
  formacaoLivre: 1000,
  /** Endereço do posto de trabalho ("Vila Bruna — São Paulo/SP"). */
  localVaga: 160,
} as const;

export const TIPOS_CURRICULO: readonly string[] = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/jpeg",
  "image/png",
];

/**
 * A extensão é checada além do mime porque navegador e sistema operacional
 * discordam com frequência no tipo de .doc/.docx (às vezes chega vazio ou
 * "application/octet-stream"); o par extensão + tamanho é o que segura de fato.
 */
export const EXTENSOES_CURRICULO: readonly string[] = [
  ".pdf",
  ".doc",
  ".docx",
  ".jpg",
  ".jpeg",
  ".png",
];

/**
 * Extensão → mime, para DECLARAR o tipo ao gravar o arquivo.
 *
 * POR QUE ISTO EXISTE
 * O bucket do Supabase tem lista branca de mime (a mesma `TIPOS_CURRICULO`) e
 * responde 415 a qualquer outro. Quem gravava currículo não informava tipo
 * nenhum, o driver caía no `application/octet-stream` padrão, e o Storage
 * recusava:
 *
 *   {"statusCode":"415","error":"invalid_mime_type",
 *    "message":"mime type application/octet-stream is not supported"}
 *
 * O erro subia como exceção e derrubava a candidatura INTEIRA — a pessoa via
 * "não conseguimos enviar, confira sua conexão", tentava de novo, falhava de
 * novo, e só passava se removesse o anexo. Ou seja: enquanto isso existiu,
 * nenhum currículo entrou pelo site. Os 54 do acervo vieram do script de
 * migração, que tinha um mapa de mime próprio — e por isso o furo não aparecia.
 *
 * A extensão manda, e não o `type` do navegador: Windows envia .doc como
 * "application/octet-stream" e às vezes como string vazia. A extensão já é
 * validada contra `EXTENSOES_CURRICULO` antes de qualquer gravação, então
 * aqui ela é confiável.
 */
export const MIME_POR_EXTENSAO: Readonly<Record<string, string>> = {
  ".pdf": "application/pdf",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
};

/**
 * O mime com que o arquivo deve ser GRAVADO. Sempre um dos aceitos, ou
 * `application/octet-stream` quando a extensão é desconhecida — caso em que a
 * gravação deve mesmo ser recusada, e recusar é o comportamento certo.
 *
 * `tipoInformado` entra só como desempate para extensões ambíguas; ele é
 * string livre vinda do cliente e nunca decide sozinho.
 */
export function mimeDeCurriculo(nomeArquivo: string, tipoInformado?: string): string {
  const corte = nomeArquivo.lastIndexOf(".");
  const extensao = corte > 0 ? nomeArquivo.slice(corte).toLowerCase() : "";
  const porExtensao = MIME_POR_EXTENSAO[extensao];
  if (porExtensao !== undefined) return porExtensao;
  if (tipoInformado !== undefined && TIPOS_CURRICULO.includes(tipoInformado)) return tipoInformado;
  return "application/octet-stream";
}

/**
 * Candidatura zerada. É função, e não constante, porque os arrays e o objeto
 * seriam compartilhados por referência entre o formulário e cada registro lido
 * do disco — um `push` em um deles vazaria para todos os outros.
 *
 * `area`, `vinculo`, `inicioEm` e `anosExperiencia` nascem com string vazia:
 * o formulário precisa de um estado "ainda não escolhi", e as uniões do domínio
 * não têm membro vazio de propósito (o dado gravado nunca fica assim, porque
 * `validarPasso` barra o avanço antes disso).
 */
export function candidaturaVazia(): Candidatura {
  return {
    id: "",
    protocolo: "",
    criadoEm: "",
    atualizadoEm: "",

    trajeto: null,
    vagaId: "",
    vagaTitulo: "",

    area: "" as AreaVaga,
    cargoDesejado: "",
    vinculo: "" as Vinculo,
    especialidades: [],
    disponibilidade: [],
    inicioEm: "" as PrazoInicio,
    pretensao: "",

    nome: "",
    nascimento: "",
    cpf: "",
    email: "",
    telefone: "",
    cep: "",
    logradouro: "",
    bairro: "",
    cidade: "",
    uf: "",
    linkedin: "",
    instagram: "",

    escolaridade: "",
    instituicao: "",
    anoFormacao: "",
    cro: "",
    croUf: "",
    posGraduacoes: "",
    cursos: "",

    anosExperiencia: "" as FaixaExperiencia,
    experiencias: [],
    softwares: [],
    competencias: [],
    idiomas: [],

    cartaApresentacao: "",
    origem: "",
    indicadoPor: "",
    curriculo: null,
    consentimentoLgpd: false,
    consentimentoVersao: "",

    status: "novo",
    nota: 0,
    etiquetas: [],
    responsavel: "",
    entrevistaEm: "",
    anotacoes: [],
    arquivada: false,
    excluirEm: "",

    analise: null,
    ficha: null,
    origemArquivo: "",
    hashArquivo: "",
  };
}

/* -------------------------------------------------------------------------- */
/* Vagas                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * "rascunho" e "encerrada" existem para que a vaga nunca precise ser apagada
 * para sair do ar: candidaturas antigas apontam para ela pelo id, e excluir o
 * registro deixaria esse histórico órfão.
 */
export type StatusVaga = "rascunho" | "aberta" | "pausada" | "encerrada";

export type ModeloTrabalho = "presencial" | "hibrido" | "remoto";

export type Vaga = {
  id: string;
  /** Derivado do título pelo servidor; é ele que vira URL pública da vaga. */
  slug: string;
  titulo: string;

  area: AreaVaga;
  vinculo: Vinculo;
  status: StatusVaga;
  destaque: boolean;

  resumo: string;
  descricao: string;
  responsabilidades: string[];
  requisitos: string[];
  diferenciais: string[];
  beneficios: string[];
  especialidades: string[];

  jornada: string;
  turnos: string[];
  local: string;
  modelo: ModeloTrabalho;

  /** Texto já mascarado ("R$ 3.500,00"), não número: é o que o RH digita. */
  salarioMin: string;
  salarioMax: string;
  mostrarSalario: boolean;

  quantidade: number;

  criadoEm: string;
  atualizadoEm: string;
  /** Carimbado na primeira vez que a vaga é publicada; ordena o portal. */
  publicadoEm: string;
  /** "AAAA-MM-DD" ou vazio para "sem prazo". */
  encerraEm: string;
};

/**
 * Vaga zerada, pelos mesmos motivos de `candidaturaVazia()`: arrays novos a cada
 * chamada e um estado "ainda não escolhi" para as uniões que o formulário do
 * painel precisa começar em branco.
 *
 * `modelo` nasce em "presencial" porque é a realidade de quase toda função de
 * clínica — o RH troca nas exceções, em vez de preencher no caso comum.
 */
export function vagaVazia(): Vaga {
  return {
    id: "",
    slug: "",
    titulo: "",

    area: "" as AreaVaga,
    vinculo: "" as Vinculo,
    status: "rascunho",
    destaque: false,

    resumo: "",
    descricao: "",
    responsabilidades: [],
    requisitos: [],
    diferenciais: [],
    beneficios: [],
    especialidades: [],

    jornada: "",
    turnos: [],
    local: "",
    modelo: "presencial",

    salarioMin: "",
    salarioMax: "",
    mostrarSalario: false,

    quantidade: 1,

    criadoEm: "",
    atualizadoEm: "",
    publicadoEm: "",
    encerraEm: "",
  };
}

/* -------------------------------------------------------------------------- */
/* Configurações do portal                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Textos e chaves do portal que o RH edita sem precisar de deploy. Fica em um
 * único arquivo (e não espalhado em variáveis de ambiente) porque é conteúdo
 * editorial, não segredo.
 */
/**
 * A senha do painel, guardada como VERIFICADOR e nunca como senha.
 *
 * Fica fora de `ConfiguracoesRh` de propósito, e a razão é a tela: as
 * configurações são entregues inteiras ao navegador para o formulário da aba
 * Config desenhar os campos. Um hash de senha ali viajaria junto, ficaria no
 * HTML da página e no cache do navegador — e hash exposto é hash que alguém
 * leva para casa e ataca com calma. Este registro só existe do lado do
 * servidor, e nenhuma server function o devolve.
 *
 * `sal` é sorteado por senha: sem ele, duas instalações com a mesma senha teriam
 * o mesmo hash, e uma tabela pronta responderia as duas de uma vez.
 */
export type SenhaGuardada = {
  /** Hoje sempre "scrypt". Nomeado para o dia em que mudar e os antigos ainda precisarem abrir. */
  algoritmo: "scrypt";
  /** Sal aleatório, em hexadecimal. */
  sal: string;
  /** Digest em hexadecimal. */
  hash: string;
  atualizadoEm: string;
};

export type ConfiguracoesRh = {
  tituloPortal: string;
  chamadaPortal: string;
  textoSobre: string;
  beneficiosPadrao: string[];
  emailRh: string;
  whatsappRh: string;
  /** Com `false`, o portal só aceita candidatura ligada a uma vaga aberta. */
  aceitandoEspontanea: boolean;
  mensagemSemVagas: string;
  /**
   * Ler com a IA toda candidatura que chega pelo site, sem ninguém pedir.
   *
   * Nasce DESLIGADO. Ligado por padrão, divulgar uma vaga e receber 200
   * currículos dispara 200 leituras — duas chamadas ao modelo cada uma — sem
   * que ninguém tenha autorizado gasto nenhum: quem paga a fatura não estava na
   * frente da tela, e o único aviso chega no fim do mês. O RH liga quando
   * quiser, na aba Config, sabendo o que está ligando.
   */
  analisarAoReceber: boolean;
  /**
   * Quem assina as mensagens que o painel escreve para a candidata ("Aqui é a
   * Ana Beatriz, da JP…"). Vazio de propósito: é um nome de pessoa real e quem
   * preenche é a clínica. Quando fica em branco, a central de contato assina
   * com o nome da clínica — impessoal, mas nunca com um nome inventado no
   * código, que é o que apareceria no WhatsApp de uma candidata.
   */
  assinaturaRh: string;
  atualizadoEm: string;
};

/**
 * Conteúdo inicial do portal. Não são textos de exemplo: são os textos que a JP
 * pode publicar como estão, escritos a partir da missão e da história da clínica
 * (ver `MISSAO` e `HISTORIA` em `src/lib/jp.ts`). O RH ajusta o que quiser, mas
 * o portal nunca abre vazio nem com "lorem ipsum" no ar.
 */
export function configuracoesPadrao(): ConfiguracoesRh {
  return {
    tituloPortal: "Trabalhe na JP",
    // "da vizinhança" saiu de propósito. A clínica só está na Vila Bruna desde
    // 2024 (antes era Pirituba — ver o comentário de `HISTORIA` em
    // `src/lib/jp.ts`), e o site já corrigiu uma vez a mesma figura: dizer "há
    // mais de 20 anos cuidando dos sorrisos da vizinhança" atribui ao bairro
    // atual um tempo que pertence aos dois endereços.
    // "mais de 20 anos" era literal, e o site se contradizia por causa disso: o
    // topo de /carreiras dizia 20 e as estatísticas logo abaixo, na MESMA
    // página, diziam 24 e "desde 2002". Tecnicamente 24 é "mais de 20" — mas
    // quem lê os dois números juntos não lê uma tecnicalidade, lê descuido.
    //
    // Agora sai de HISTORIA.anos, a mesma fonte do resto do site, e o número
    // deixa de envelhecer sozinho. O fato exato também vende melhor que o
    // arredondado para baixo.
    chamadaPortal: `Há ${String(HISTORIA.anos)} anos cuidando de sorrisos em São Paulo. Se para você atender bem é olhar no olho, chamar pelo nome e explicar o tratamento com calma, o seu lugar é aqui.`,
    textoSobre:
      "A JP Clínica Integrada Odontológica nasceu em 2002 e hoje atende na Vila Bruna, na região da Freguesia do Ó, em São Paulo. As pessoas voltam, trazem a família e conhecem a equipe pelo nome. Nossa missão é proporcionar um tratamento humanizado e personalizado do começo ao fim — saúde bucal, sorriso e satisfação, resgatando a autoestima de cada paciente. Quem trabalha aqui encontra estrutura completa, equipe que se apoia de verdade e espaço para crescer junto com a clínica.",
    // Lista escrita em verbas trabalhistas (registro em carteira,
    // vale-transporte, escala fixa): ela descreve o pacote de uma vaga CLT.
    // Quem a usa como fallback precisa conferir o vínculo antes — herdá-la numa
    // vaga PJ ou de estágio publica uma promessa que aquele contrato não
    // sustenta, inclusive no `jobBenefits` do JSON-LD.
    beneficiosPadrao: [
      "Registro em carteira desde o primeiro dia",
      "Vale-transporte",
      "Vale-refeição ou refeição no local",
      "Tratamento odontológico gratuito para você e desconto para a família",
      "Escala fixa, com fim de semana livre",
      "Treinamento interno em biossegurança e atendimento",
      "Apoio para cursos e especializações da área",
      "Uniforme e EPIs fornecidos pela clínica",
    ],
    // Deixados em branco de propósito: e-mail e WhatsApp de RH são dados de
    // contato reais e quem preenche é a clínica, na primeira visita à tela de
    // configurações. Inventar um endereço aqui mandaria candidato para o vazio.
    emailRh: "",
    whatsappRh: "",
    aceitandoEspontanea: true,
    mensagemSemVagas:
      "No momento não temos vagas abertas. Deixe seu currículo no banco de talentos: quando abrir uma oportunidade do seu perfil, a gente chama você primeiro.",
    // Desligado de fábrica: ver o comentário do campo em `ConfiguracoesRh`.
    // Uma instalação nova não pode gastar dinheiro do cliente antes de alguém
    // abrir o painel pela primeira vez.
    analisarAoReceber: false,
    // Em branco pelo mesmo motivo de `emailRh` e `whatsappRh`: é dado real da
    // clínica, e um nome de fantasia aqui chegaria ao celular da candidata.
    assinaturaRh: "",
    atualizadoEm: "",
  };
}
