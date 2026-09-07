/**
 * Formulário público de candidatura — o assistente de 5 passos do Portal de RH.
 *
 * Duas decisões de estrutura que valem ser ditas em voz alta:
 *
 * 1. Esta página NÃO usa o `<Header/>` do site. Ele é `sticky top-0 z-[100]` e
 *    disputaria o topo com a barra de progresso do assistente, que também
 *    precisa ficar grudada. Além disso, são treze elementos focáveis antes do
 *    primeiro campo — num fluxo de tarefa, isso é obstáculo, não navegação.
 *    No lugar dele vai uma barra enxuta com a marca, o caminho de volta e o
 *    progresso. O rodapé completo continua no fim, para quem terminar a leitura.
 * 2. O estado é o próprio objeto `Candidatura`. Sem tradução entre "modelo do
 *    formulário" e "modelo do domínio" não existe o campo que alguém esqueceu
 *    de copiar de um lado para o outro — e `validarPasso` recebe exatamente a
 *    mesma estrutura que o servidor vai validar de novo.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  ArrowLeft,
  ArrowRight,
  Briefcase,
  Check,
  CircleAlert,
  Clock3,
  Copy,
  GraduationCap,
  Headset,
  HeartPulse,
  Info,
  MapPin,
  MessageCircle,
  Plus,
  RotateCcw,
  Send,
  Sparkles,
  Stethoscope,
  Trash2,
  Banknote,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { AreaUpload } from "@/components/rh/AreaUpload";
import {
  Ajuda,
  CampoSelect,
  CampoTexto,
  CampoTextarea,
  MensagemErro,
  Rotulo,
} from "@/components/rh/CampoTexto";
import { idCampo } from "@/components/rh/idsCampo";
import { GradeTurnos } from "@/components/rh/GradeTurnos";
import { SeletorChips } from "@/components/rh/SeletorChips";
import { Footer } from "@/components/site/Footer";
import { Logo } from "@/components/site/Logo";
import { SkipLink } from "@/components/site/SkipLink";
import { CLINICA, whatsappLink } from "@/lib/jp";
import { enviarCandidatura, listarVagasPublicas } from "@/lib/rh/api";
import type { RespostaPortal } from "@/lib/rh/api";
import {
  apenasDigitos,
  mascararCep,
  mascararCpf,
  mascararMoeda,
  mascararTelefone,
} from "@/lib/rh/formatar";
import {
  AREAS,
  COMPETENCIAS,
  ESCOLARIDADES,
  ESPECIALIDADES_ODONTO,
  FAIXAS_EXPERIENCIA,
  IDIOMAS,
  ORIGENS,
  PRAZOS_INICIO,
  SOFTWARES,
  UFS,
  VINCULOS,
} from "@/lib/rh/opcoes";
import { LIMITES, MESES_RETENCAO_LGPD, candidaturaVazia } from "@/lib/rh/tipos";
import type {
  AreaVaga,
  Candidatura,
  ExperienciaItem,
  FaixaExperiencia,
  PrazoInicio,
  Vaga,
  Vinculo,
} from "@/lib/rh/tipos";
import { faixaSalarial, resumoJornada } from "@/lib/rh/vagas";
import { passoDoErro, validarPasso, validarTudo } from "@/lib/rh/validar";
import type { ContextoPortal, ErrosPasso } from "@/lib/rh/validar";

const TITULO = "Trabalhe conosco — JP Clínica Integrada Odontológica";
const DESCRICAO =
  "Envie sua candidatura para a JP Clínica Integrada Odontológica, na Vila Bruna, região da Freguesia do Ó, em São Paulo.";

/** Chave única do rascunho. Trocá-la invalida os rascunhos já salvos. */
const CHAVE_RASCUNHO = "jp-rh-rascunho";

/**
 * Rascunho velho deixa de ser retomada e vira vazamento: este formulário também
 * é preenchido no tablet da recepção e no computador de casa que outra pessoa
 * usa depois. Passadas essas horas, o que estiver guardado é descartado sem
 * perguntar — e um rascunho sem carimbo (versão antiga do formulário) também.
 */
const VALIDADE_RASCUNHO_MS = 12 * 60 * 60 * 1000;

const MAX_EXPERIENCIAS = 5;
/** Mesmo teto que `montarCandidatura` grava — ver `LIMITES`, em tipos.ts. */
const MAX_CARTA = LIMITES.textoLongo;

/**
 * Alvo de foco que não é um campo do formulário: o título do passo. Vive junto
 * dos nomes de campo em `foco.campo`, e por isso precisa ser um nome que
 * nenhuma chave de `Candidatura` use.
 */
const CAMPO_PASSO = "__passo";

/**
 * Teto de pós-graduações e cursos. É o mesmo número que `montarCandidatura`
 * usa no servidor: com 1500 aqui, o candidato escrevia a última linha, via
 * "candidatura enviada" e perdia 500 caracteres sem nunca ficar sabendo.
 */
const MAX_TEXTO_LONGO = LIMITES.formacaoLivre;

const PASSOS: { numero: number; titulo: string; resumo: string }[] = [
  { numero: 1, titulo: "A vaga", resumo: "Onde você quer trabalhar com a gente" },
  { numero: 2, titulo: "Você", resumo: "Como a clínica fala com você" },
  { numero: 3, titulo: "Formação", resumo: "Onde você estudou e o que tem de registro" },
  { numero: 4, titulo: "Experiência", resumo: "O que você já fez e sabe fazer" },
  { numero: 5, titulo: "Currículo", resumo: "Anexo, carta e envio" },
];

/**
 * Mapa explícito nome -> componente para o `icone` de `AREAS`. Indexar o módulo
 * inteiro do lucide (`import * as Icones`) resolveria em uma linha, mas puxaria
 * as mais de mil árvores de ícone para o bundle: nenhum bundler consegue provar
 * quais sobram quando a chave é dinâmica.
 */
const ICONES_AREA: Record<string, LucideIcon> = {
  Stethoscope,
  HeartPulse,
  Headset,
  Briefcase,
  GraduationCap,
  Sparkles,
};

/**
 * Ordem de leitura do formulário. `validarPasso` já devolve os erros em ordem
 * de inserção, mas os erros do servidor chegam misturados — e é daqui que sai o
 * campo que vai receber o foco.
 */
const ORDEM_CAMPOS: string[] = [
  "area",
  "cargoDesejado",
  "vinculo",
  "especialidades",
  "disponibilidade",
  "inicioEm",
  "pretensao",
  "nome",
  "nascimento",
  "cpf",
  "email",
  "telefone",
  "cep",
  "logradouro",
  "bairro",
  "cidade",
  "uf",
  "escolaridade",
  "instituicao",
  "anoFormacao",
  "cro",
  "croUf",
  "anosExperiencia",
  "experiencias",
  "curriculo",
  "cartaApresentacao",
  "origem",
  "indicadoPor",
  "consentimentoLgpd",
];

/* -------------------------------------------------------------------------- */
/* Funções puras de apoio                                                     */
/* -------------------------------------------------------------------------- */

function experienciaVazia(): ExperienciaItem {
  return { empresa: "", cargo: "", periodo: "", atividades: "" };
}

/**
 * O passo 4 sempre mostra pelo menos um bloco de experiência em branco — um
 * formulário que começa com uma lista vazia e um botão "adicionar" faz a pessoa
 * pensar que aquele passo é opcional.
 */
function estadoInicial(): Candidatura {
  return { ...candidaturaVazia(), experiencias: [experienciaVazia()] };
}

function experienciaEmBranco(exp: ExperienciaItem): boolean {
  return [exp.empresa, exp.cargo, exp.periodo, exp.atividades].every((c) => c.trim().length === 0);
}

/** Existe algo digitado? Decide se vale avisar ao sair e se vale salvar rascunho. */
function temConteudo(dados: Candidatura): boolean {
  const textos = [
    dados.vagaId,
    dados.area,
    dados.cargoDesejado,
    dados.nome,
    dados.cpf,
    dados.email,
    dados.telefone,
    dados.escolaridade,
    dados.cartaApresentacao,
  ];
  if (textos.some((t) => t.trim().length > 0)) return true;
  if (dados.disponibilidade.length > 0 || dados.especialidades.length > 0) return true;
  return dados.experiencias.some((e) => !experienciaEmBranco(e));
}

function textoDe(objeto: Record<string, unknown>, chave: string): string {
  const valor = objeto[chave];
  return typeof valor === "string" ? valor.slice(0, MAX_CARTA) : "";
}

function listaDe(objeto: Record<string, unknown>, chave: string): string[] {
  const valor = objeto[chave];
  if (!Array.isArray(valor)) return [];
  return valor.filter((item): item is string => typeof item === "string").slice(0, 30);
}

/** Vale só se estiver na lista conhecida; senão volta ao estado "não escolhi". */
function uniaoDe<T extends string>(bruto: string, permitidos: readonly string[]): T {
  return (permitidos.includes(bruto) ? bruto : "") as T;
}

/**
 * Reconstrói o rascunho campo a campo, em vez de confiar no que estiver no
 * localStorage. O conteúdo é do próprio usuário, mas pode ser de uma versão
 * antiga do formulário (ou ter sido editado à mão) — e um `experiencias` que
 * chegasse como número derrubaria a tela na hora de renderizar.
 */
function lerRascunho(cru: string, agora: number): Candidatura | null {
  let bruto: unknown;
  try {
    bruto = JSON.parse(cru);
  } catch {
    return null;
  }
  if (bruto === null || typeof bruto !== "object" || Array.isArray(bruto)) return null;
  const m = bruto as Record<string, unknown>;

  const salvoEm = Date.parse(textoDe(m, "salvoEm"));
  if (!Number.isFinite(salvoEm) || agora - salvoEm > VALIDADE_RASCUNHO_MS) return null;

  const brutasExperiencias = Array.isArray(m["experiencias"]) ? m["experiencias"] : [];
  const experiencias = brutasExperiencias
    .filter(
      (item): item is Record<string, unknown> =>
        item !== null && typeof item === "object" && !Array.isArray(item),
    )
    .slice(0, MAX_EXPERIENCIAS)
    .map((item): ExperienciaItem => ({
      empresa: textoDe(item, "empresa"),
      cargo: textoDe(item, "cargo"),
      periodo: textoDe(item, "periodo"),
      atividades: textoDe(item, "atividades"),
    }));

  return {
    ...estadoInicial(),

    vagaId: textoDe(m, "vagaId"),
    area: uniaoDe<AreaVaga>(
      textoDe(m, "area"),
      AREAS.map((a) => a.valor),
    ),
    cargoDesejado: textoDe(m, "cargoDesejado"),
    vinculo: uniaoDe<Vinculo>(
      textoDe(m, "vinculo"),
      VINCULOS.map((v) => v.valor),
    ),
    especialidades: listaDe(m, "especialidades"),
    disponibilidade: listaDe(m, "disponibilidade"),
    inicioEm: uniaoDe<PrazoInicio>(
      textoDe(m, "inicioEm"),
      PRAZOS_INICIO.map((p) => p.valor),
    ),
    pretensao: textoDe(m, "pretensao"),

    // CPF, nascimento e endereço não são lidos porque não são gravados
    // (`paraRascunho`): voltam vazios de `estadoInicial()`. Ver o comentário lá.
    nome: textoDe(m, "nome"),
    email: textoDe(m, "email"),
    telefone: textoDe(m, "telefone"),
    linkedin: textoDe(m, "linkedin"),
    instagram: textoDe(m, "instagram"),

    escolaridade: textoDe(m, "escolaridade"),
    instituicao: textoDe(m, "instituicao"),
    anoFormacao: textoDe(m, "anoFormacao"),
    cro: textoDe(m, "cro"),
    croUf: textoDe(m, "croUf"),
    posGraduacoes: textoDe(m, "posGraduacoes"),
    cursos: textoDe(m, "cursos"),

    anosExperiencia: uniaoDe<FaixaExperiencia>(
      textoDe(m, "anosExperiencia"),
      FAIXAS_EXPERIENCIA.map((f) => f.valor),
    ),
    experiencias: experiencias.length > 0 ? experiencias : [experienciaVazia()],
    softwares: listaDe(m, "softwares"),
    competencias: listaDe(m, "competencias"),
    idiomas: listaDe(m, "idiomas"),

    cartaApresentacao: textoDe(m, "cartaApresentacao"),
    origem: textoDe(m, "origem"),
    indicadoPor: textoDe(m, "indicadoPor"),
    // O arquivo nunca é guardado: um currículo de 8 MB em base64 estoura a cota
    // do localStorage e, pior, deixaria um documento pessoal no disco de um
    // computador que pode ser compartilhado.
    curriculo: null,
    consentimentoLgpd: m["consentimentoLgpd"] === true,
  };
}

/**
 * O que vai para o localStorage — que é o disco de um computador que pode ser
 * de todo mundo.
 *
 * Pelo mesmo motivo que o currículo não é guardado, CPF, data de nascimento e
 * endereço também não são: quem abrisse o formulário depois no mesmo navegador
 * leria o documento e a casa de quem passou antes. O que sobra (vaga, nome,
 * contato, formação, experiência, carta) é o que faz a retomada valer a pena e
 * a pessoa reconhece como seu — os três campos identificadores ela redigita em
 * meio minuto no passo 2.
 *
 * `salvoEm` é o carimbo que `lerRascunho` usa para descartar rascunho velho.
 */
function paraRascunho(dados: Candidatura): Record<string, unknown> {
  return {
    ...dados,
    cpf: "",
    nascimento: "",
    cep: "",
    logradouro: "",
    bairro: "",
    cidade: "",
    uf: "",
    salvoEm: new Date().toISOString(),
  };
}

/** Primeiro campo com erro, na ordem em que a pessoa lê o formulário. */
function primeiroCampoComErro(erros: ErrosPasso): string {
  for (const campo of ORDEM_CAMPOS) {
    if ((erros[campo] ?? "").length > 0) return campo;
  }
  return "";
}

/** Os campos que o ViaCEP preenche, como estavam quando a busca começou. */
type EnderecoBase = { logradouro: string; bairro: string; cidade: string; uf: string };

/**
 * Aplica o valor do ViaCEP só se o campo continuar exatamente como estava
 * quando a busca começou. O serviço leva 1-2 s no 4G, e nesse tempo muita gente
 * já está digitando o próprio endereço: sobrescrever o que a pessoa acabou de
 * escrever é pior do que não preencher nada.
 */
function preencherEndereco(atual: string, antes: string, vindo: string): string {
  return atual === antes && vindo.length > 0 ? vindo : atual;
}

/** Tira as linhas de experiência em branco antes de mandar para o servidor. */
function paraEnvio(dados: Candidatura): Candidatura {
  return { ...dados, experiencias: dados.experiencias.filter((e) => !experienciaEmBranco(e)) };
}

function rotuloArea(area: AreaVaga): string {
  return AREAS.find((a) => a.valor === area)?.rotulo ?? "";
}

function rotuloVinculo(vinculo: Vinculo): string {
  return VINCULOS.find((v) => v.valor === vinculo)?.rotulo ?? "";
}

/* -------------------------------------------------------------------------- */
/* Rota                                                                       */
/* -------------------------------------------------------------------------- */

export const Route = createFileRoute("/trabalhe-conosco")({
  // Devolver `{ vaga: "" }` quando não há vaga na URL faria o roteador reescrever
  // "/trabalhe-conosco" como "/trabalhe-conosco?vaga=" com um 307 a cada visita:
  // um round-trip extra para todo mundo que clica em "Cadastrar meu currículo",
  // e um endereço sujo na barra. Sem o parâmetro, a chave não entra no objeto.
  validateSearch: (s: Record<string, unknown>): { vaga?: string } =>
    typeof s["vaga"] === "string" && s["vaga"].length > 0 ? { vaga: s["vaga"] } : {},
  // O retorno é anotado à mão: a inferência do server function não atravessa
  // a fronteira do loader gerado, e sem isso `useLoaderData()` chegaria como
  // `any` — e a tela inteira perderia a checagem de tipo silenciosamente.
  loader: (): Promise<RespostaPortal> => listarVagasPublicas(),
  head: () => ({
    meta: [
      { title: TITULO },
      { name: "description", content: DESCRICAO },
      // O formulário em si não tem por que ser indexado: quem procura emprego
      // deve cair no portal de vagas (/carreiras), que é onde está o conteúdo.
      // Uma página de formulário no índice também compete com ela mesma.
      { name: "robots", content: "noindex" },
      { property: "og:title", content: TITULO },
      { property: "og:description", content: DESCRICAO },
      { property: "og:type", content: "website" },
      { property: "og:locale", content: "pt_BR" },
    ],
  }),
  component: PaginaCandidatura,
});

/* -------------------------------------------------------------------------- */
/* Página                                                                     */
/* -------------------------------------------------------------------------- */

function PaginaCandidatura() {
  // As duas anotações não são decorativas: este projeto não registra o router
  // no `declare module` do TanStack, então `useLoaderData()` e `useSearch()`
  // chegam como `any`. Sem dizer o tipo aqui, a tela inteira perderia a
  // checagem — e `vaga.titulo` num campo que não existe passaria batido.
  const { vagas, config }: RespostaPortal = Route.useLoaderData();
  const { vaga: slugDaUrl = "" }: { vaga?: string } = Route.useSearch();

  /**
   * O que a validação precisa saber do portal. Memorizado porque entra como
   * dependência de `avancar`: um objeto novo a cada render recriaria o callback
   * a cada tecla digitada.
   */
  const contexto = useMemo<ContextoPortal>(
    () => ({ aceitandoEspontanea: config.aceitandoEspontanea }),
    [config.aceitandoEspontanea],
  );

  const [dados, setDados] = useState<Candidatura>(estadoInicial);
  const [passo, setPasso] = useState(1);
  const [erros, setErros] = useState<ErrosPasso>({});
  const [vagaDoRascunhoSumiu, setVagaDoRascunhoSumiu] = useState(false);
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [erroArquivo, setErroArquivo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [protocolo, setProtocolo] = useState("");
  const [escolhaFeita, setEscolhaFeita] = useState(false);
  const [rascunho, setRascunho] = useState<Candidatura | null>(null);
  const [buscandoCep, setBuscandoCep] = useState(false);
  const [copiado, setCopiado] = useState(false);

  /**
   * Um "agora" só para a página inteira. Nada de `new Date()` dentro do render
   * ou da validação: servidor e navegador chegariam a instantes diferentes e a
   * idade calculada no primeiro render mudaria na hidratação.
   */
  const [agora] = useState(() => new Date());

  /** `seq` faz o efeito de foco disparar de novo mesmo no mesmo campo. */
  const [foco, setFoco] = useState<{ campo: string; seq: number }>({ campo: "", seq: 0 });

  const prontoParaSalvar = useRef(false);
  const cepBuscado = useRef("");
  const fixadaAplicada = useRef(false);
  const alertaRef = useRef<HTMLDivElement>(null);
  const tituloPassoRef = useRef<HTMLHeadingElement>(null);

  const enviado = protocolo.length > 0;
  const vagaFixada = useMemo(
    () => (slugDaUrl.length > 0 ? (vagas.find((v) => v.slug === slugDaUrl) ?? null) : null),
    [vagas, slugDaUrl],
  );
  const vagaEscolhida = useMemo(
    () => (dados.vagaId.length > 0 ? (vagas.find((v) => v.id === dados.vagaId) ?? null) : null),
    [vagas, dados.vagaId],
  );
  const preenchido = useMemo(() => temConteudo(dados), [dados]);

  /* ---------------------------------------------------------------------- */
  /* Atualização de campos                                                  */
  /* ---------------------------------------------------------------------- */

  const atualizar = useCallback((mudanca: Partial<Candidatura>) => {
    setDados((d) => ({ ...d, ...mudanca }));
    // Some com o erro do campo assim que a pessoa mexe nele: manter a mensagem
    // vermelha embaixo de um campo já corrigido é ruído, e ela volta sozinha na
    // próxima tentativa de avançar.
    setErros((e) => {
      const chaves = Object.keys(mudanca).filter((c) => (e[c] ?? "").length > 0);
      if (chaves.length === 0) return e;
      const copia = { ...e };
      for (const c of chaves) delete copia[c];
      return copia;
    });
  }, []);

  const alternarEmLista = useCallback(
    (chave: "especialidades" | "softwares" | "competencias" | "idiomas", valor: string) => {
      setDados((d) => {
        const atual = d[chave];
        const proxima = atual.includes(valor)
          ? atual.filter((v) => v !== valor)
          : [...atual, valor];
        return { ...d, [chave]: proxima };
      });
      setErros((e) => {
        if ((e[chave] ?? "").length === 0) return e;
        const copia = { ...e };
        delete copia[chave];
        return copia;
      });
    },
    [],
  );

  /**
   * Escolher a vaga preenche área, vínculo e cargo a partir dela. É a resposta
   * certa em quase todo caso — a pessoa clicou justamente nessa vaga — e evita
   * o absurdo de alguém se candidatar a "Recepcionista" marcando a área
   * "Cirurgião-dentista". Os três campos continuam editáveis: quem tem CRO e se
   * candidata a uma vaga de ASB pode ajustar o cargo desejado.
   */
  const escolherVaga = useCallback((vaga: Vaga | null) => {
    setEscolhaFeita(true);
    setDados((d) => {
      const idNovo = vaga?.id ?? "";
      // Reclicar na mesma vaga não pode desfazer o que a pessoa ajustou depois.
      if (d.vagaId === idNovo && (vaga === null || d.area === vaga.area)) return d;
      if (vaga === null) return { ...d, vagaId: "" };
      return {
        ...d,
        vagaId: vaga.id,
        area: vaga.area,
        vinculo: vaga.vinculo,
        cargoDesejado: vaga.titulo,
      };
    });
    setErros({});
  }, []);

  /* ---------------------------------------------------------------------- */
  /* Rascunho em localStorage                                               */
  /* ---------------------------------------------------------------------- */

  useEffect(() => {
    // A leitura só acontece aqui, e nunca no primeiro render: o HTML vem do
    // servidor, onde `localStorage` não existe. Ler durante o render faria o
    // cliente montar uma árvore diferente da que veio no HTML, e o React
    // descartaria a página inteira na hidratação.
    try {
      const cru = window.localStorage.getItem(CHAVE_RASCUNHO);
      if (cru !== null) {
        const salvo = lerRascunho(cru, Date.now());
        if (salvo !== null && temConteudo(salvo)) setRascunho(salvo);
        // Rascunho vencido (ou ilegível) sai do disco na mesma visita: ele já
        // não vai ser oferecido a ninguém, não há por que continuar guardado.
        else window.localStorage.removeItem(CHAVE_RASCUNHO);
      }
    } catch {
      // localStorage pode lançar (janela anônima, cookies de terceiros
      // bloqueados, cota estourada). O formulário funciona igual sem ele —
      // perde só a rede de segurança do rascunho —, então o erro morre aqui.
    }
    prontoParaSalvar.current = true;
  }, []);

  useEffect(() => {
    // Duas guardas antes do debounce, e as duas são de correção, não de
    // desempenho: enquanto houver rascunho pendente de resposta, `dados` ainda
    // é o formulário vazio, e gravá-lo sobrescreveria no disco justamente a
    // candidatura que está sendo oferecida — bastaria abrir a página, esperar
    // um segundo e sair para perdê-la. Formulário vazio também não se grava:
    // visitar a página não pode apagar o que já estava guardado.
    if (!prontoParaSalvar.current || enviado || rascunho !== null || !temConteudo(dados)) return;
    // Debounce: o estado muda a cada tecla, e serializar a candidatura inteira
    // dezenas de vezes por segundo é trabalho jogado fora.
    const timer = window.setTimeout(() => {
      try {
        window.localStorage.setItem(CHAVE_RASCUNHO, JSON.stringify(paraRascunho(dados)));
      } catch {
        // Mesmo motivo do efeito acima: falhar em salvar não pode travar nada.
      }
    }, 700);
    return () => window.clearTimeout(timer);
  }, [dados, enviado, rascunho]);

  const limparRascunho = useCallback(() => {
    try {
      window.localStorage.removeItem(CHAVE_RASCUNHO);
    } catch {
      // Idem: sem localStorage não há o que limpar.
    }
  }, []);

  /* ---------------------------------------------------------------------- */
  /* Vaga vinda da URL                                                      */
  /* ---------------------------------------------------------------------- */

  useEffect(() => {
    if (fixadaAplicada.current || vagaFixada === null) return;
    fixadaAplicada.current = true;
    escolherVaga(vagaFixada);
  }, [vagaFixada, escolherVaga]);

  /* ---------------------------------------------------------------------- */
  /* Aviso ao sair                                                          */
  /* ---------------------------------------------------------------------- */

  useEffect(() => {
    if (enviado || !preenchido) return;
    const aoSair = (evento: BeforeUnloadEvent) => {
      evento.preventDefault();
      // Parte dos navegadores ainda exige `returnValue` definido para exibir
      // o diálogo nativo; o texto em si é ignorado por todos há anos.
      evento.returnValue = "";
    };
    window.addEventListener("beforeunload", aoSair);
    return () => window.removeEventListener("beforeunload", aoSair);
  }, [enviado, preenchido]);

  /* ---------------------------------------------------------------------- */
  /* Foco no primeiro campo inválido                                        */
  /* ---------------------------------------------------------------------- */

  useEffect(() => {
    if (foco.campo.length === 0) return;
    const alvo =
      foco.campo === "geral"
        ? alertaRef.current
        : foco.campo === CAMPO_PASSO
          ? tituloPassoRef.current
          : document.getElementById(idCampo(foco.campo));
    if (alvo === null) return;
    // Focar (e não só rolar) é o ponto: quem usa leitor de tela precisa que o
    // cursor virtual pare no campo, ouvir o rótulo e ouvir a mensagem ligada
    // por aria-describedby. Rolar sozinho não move o foco de lugar nenhum.
    alvo.focus({ preventScroll: true });
    // Na troca de passo quem manda no scroll é `irPara`, que volta ao topo do
    // formulário inteiro; centralizar o título aqui brigaria com aquele scroll.
    if (foco.campo !== CAMPO_PASSO) alvo.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [foco]);

  const apontarErros = useCallback((novos: ErrosPasso) => {
    setErros(novos);
    const campo = primeiroCampoComErro(novos);
    if (campo.length > 0) {
      setPasso(passoDoErro(campo));
      setFoco((f) => ({ campo, seq: f.seq + 1 }));
      return;
    }
    // Sobrou só "geral" ou "vagaId": os dois aparecem no alerta do topo.
    setPasso(1);
    setFoco((f) => ({ campo: "geral", seq: f.seq + 1 }));
  }, []);

  /* ---------------------------------------------------------------------- */
  /* Navegação entre passos                                                 */
  /* ---------------------------------------------------------------------- */

  const irPara = useCallback((destino: number) => {
    setPasso(destino);
    // Trocar de passo troca a página inteira embaixo de um botão que não muda
    // de lugar nem de rótulo. Sem mover o foco para o título do passo novo,
    // quem usa leitor de tela aperta "Continuar" e não ouve absolutamente nada
    // — precisa sair explorando o documento para descobrir onde parou.
    setFoco((f) => ({ campo: CAMPO_PASSO, seq: f.seq + 1 }));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const avancar = useCallback(() => {
    const novos = validarPasso(passo, dados, agora, contexto);
    if (Object.keys(novos).length > 0) {
      apontarErros(novos);
      return;
    }
    setErros({});
    irPara(Math.min(passo + 1, PASSOS.length));
  }, [passo, dados, agora, contexto, apontarErros, irPara]);

  const voltar = useCallback(() => {
    setErros({});
    irPara(Math.max(passo - 1, 1));
  }, [passo, irPara]);

  /* ---------------------------------------------------------------------- */
  /* ViaCEP                                                                 */
  /* ---------------------------------------------------------------------- */

  const buscarEndereco = useCallback(async (digitos: string, antes: EnderecoBase) => {
    setBuscandoCep(true);
    try {
      const resposta = await fetch(`https://viacep.com.br/ws/${digitos}/json/`);
      if (!resposta.ok) return;
      const corpo: unknown = await resposta.json();
      if (corpo === null || typeof corpo !== "object" || Array.isArray(corpo)) return;
      const c = corpo as Record<string, unknown>;
      // O ViaCEP responde 200 com `{ "erro": true }` para CEP inexistente.
      if (c["erro"] === true || c["erro"] === "true") return;
      // A pessoa pode ter corrigido o CEP enquanto esta busca estava em voo: a
      // resposta do CEP antigo não pode preencher o endereço do novo.
      if (cepBuscado.current !== digitos) return;
      setDados((d) => ({
        ...d,
        logradouro: preencherEndereco(d.logradouro, antes.logradouro, textoDe(c, "logradouro")),
        bairro: preencherEndereco(d.bairro, antes.bairro, textoDe(c, "bairro")),
        cidade: preencherEndereco(d.cidade, antes.cidade, textoDe(c, "localidade")),
        uf: preencherEndereco(d.uf, antes.uf, textoDe(c, "uf")),
      }));
    } catch {
      // Silêncio proposital. O ViaCEP é uma conveniência de terceiro: se ele
      // cair, estiver bloqueado por uma extensão ou o wi-fi oscilar, a pessoa
      // simplesmente digita o endereço à mão. Mostrar "erro ao buscar CEP" só
      // criaria a impressão de que o formulário quebrou — e um `throw` aqui
      // derrubaria a página inteira no error boundary.
    } finally {
      // Quem apaga o "Buscando endereço..." é só a busca mais recente: a antiga
      // terminando não pode dizer que acabou o que ainda está acontecendo.
      if (cepBuscado.current === digitos) setBuscandoCep(false);
    }
  }, []);

  const aoMudarCep = useCallback(
    (valor: string) => {
      const mascarado = mascararCep(valor);
      atualizar({ cep: mascarado });
      const digitos = apenasDigitos(mascarado);
      if (digitos.length !== 8 || cepBuscado.current === digitos) return;
      cepBuscado.current = digitos;
      // Retrato do endereço no momento do pedido: o que a pessoa digitar
      // enquanto o ViaCEP responde vence o que o serviço devolver.
      void buscarEndereco(digitos, {
        logradouro: dados.logradouro,
        bairro: dados.bairro,
        cidade: dados.cidade,
        uf: dados.uf,
      });
    },
    [atualizar, buscarEndereco, dados.logradouro, dados.bairro, dados.cidade, dados.uf],
  );

  /* ---------------------------------------------------------------------- */
  /* Experiências                                                           */
  /* ---------------------------------------------------------------------- */

  const mudarExperiencia = useCallback(
    (indice: number, campo: keyof ExperienciaItem, valor: string) => {
      setDados((d) => ({
        ...d,
        experiencias: d.experiencias.map((exp, i) =>
          i === indice ? { ...exp, [campo]: valor } : exp,
        ),
      }));
      setErros((e) => {
        if ((e["experiencias"] ?? "").length === 0) return e;
        const copia = { ...e };
        delete copia["experiencias"];
        return copia;
      });
    },
    [],
  );

  const adicionarExperiencia = useCallback(() => {
    setDados((d) =>
      d.experiencias.length >= MAX_EXPERIENCIAS
        ? d
        : { ...d, experiencias: [...d.experiencias, experienciaVazia()] },
    );
  }, []);

  const removerExperiencia = useCallback((indice: number) => {
    setDados((d) => {
      const restantes = d.experiencias.filter((_, i) => i !== indice);
      // Nunca deixa a lista vazia: o passo precisa mostrar sempre um bloco.
      return { ...d, experiencias: restantes.length > 0 ? restantes : [experienciaVazia()] };
    });
  }, []);

  /* ---------------------------------------------------------------------- */
  /* Envio                                                                  */
  /* ---------------------------------------------------------------------- */

  const enviar = useCallback(async () => {
    const todos = validarTudo(dados, agora, contexto);
    if (Object.keys(todos).length > 0) {
      apontarErros(todos);
      return;
    }

    setEnviando(true);
    setErros({});
    try {
      const formulario = new FormData();
      formulario.append("dados", JSON.stringify(paraEnvio(dados)));
      if (arquivo !== null) formulario.append("curriculo", arquivo);

      const resposta = await enviarCandidatura({ data: formulario });
      if (resposta.ok) {
        setProtocolo(resposta.protocolo);
        limparRascunho();
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }
      apontarErros(resposta.erros);
    } catch {
      setErros({
        geral:
          "Não conseguimos enviar sua candidatura agora. Confira sua conexão e tente de novo em alguns instantes — o que você preencheu continua aqui.",
      });
      setFoco((f) => ({ campo: "geral", seq: f.seq + 1 }));
    } finally {
      setEnviando(false);
    }
  }, [dados, agora, contexto, arquivo, apontarErros, limparRascunho]);

  const copiarProtocolo = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(protocolo);
      setCopiado(true);
      window.setTimeout(() => setCopiado(false), 2500);
    } catch {
      // Área de transferência negada (permissão ou contexto inseguro): o
      // protocolo está grande na tela justamente para poder ser copiado à mão.
    }
  }, [protocolo]);

  const restaurarRascunho = useCallback(() => {
    if (rascunho === null) return;
    // Quando existe vaga na URL, é ela que manda: a pessoa acabou de clicar em
    // "Candidatar-se" nesta vaga, e o rascunho pode ser de outra, começada dias
    // atrás. Repor a vaga antiga aqui mandaria a candidatura para o processo
    // errado sem nada na tela dizendo que o destino mudou.
    const base =
      vagaFixada === null || rascunho.vagaId === vagaFixada.id
        ? rascunho
        : {
            ...rascunho,
            vagaId: vagaFixada.id,
            area: vagaFixada.area,
            vinculo: vagaFixada.vinculo,
            cargoDesejado: vagaFixada.titulo,
          };

    // A vaga do rascunho pode ter sido encerrada, pausada ou despublicada entre
    // o dia em que a pessoa começou e o dia em que ela voltou. Restaurar o
    // `vagaId` morto fazia o envio ser recusado com "esta vaga não está mais
    // recebendo candidaturas" — inclusive para quem tinha entrado justamente
    // pelo banco de talentos e nem escolheu vaga nenhuma. Aqui o vínculo morto
    // cai e a candidatura vira espontânea, que é o que a pessoa queria.
    // A área e o cargo continuam: eles descrevem a pessoa, não a vaga.
    const vagaAindaAberta = base.vagaId.length === 0 || vagas.some((v) => v.id === base.vagaId);
    const restaurado = vagaAindaAberta ? base : { ...base, vagaId: "" };
    setVagaDoRascunhoSumiu(!vagaAindaAberta);
    setDados(restaurado);
    setEscolhaFeita(temConteudo(restaurado));
    setRascunho(null);
    // A vaga da URL já está aplicada acima; o efeito não precisa fazer de novo.
    fixadaAplicada.current = true;
  }, [rascunho, vagaFixada, vagas]);

  const descartarRascunho = useCallback(() => {
    setRascunho(null);
    limparRascunho();
  }, [limparRascunho]);

  /* ---------------------------------------------------------------------- */
  /* Render                                                                 */
  /* ---------------------------------------------------------------------- */

  const erroGeral = erros["geral"] ?? "";
  const erroVaga = erros["vagaId"] ?? "";
  const progresso = enviado
    ? 100
    : Math.round(((passo - 1) / PASSOS.length) * 100 + 100 / PASSOS.length);

  return (
    <div className="min-h-dvh bg-cream">
      <SkipLink />

      <BarraTopo passo={passo} progresso={progresso} enviado={enviado} aoIrPara={irPara} />

      <main id="conteudo">
        {enviado ? (
          <TelaSucesso
            protocolo={protocolo}
            copiado={copiado}
            aoCopiar={() => void copiarProtocolo()}
            emailRh={config.emailRh}
          />
        ) : (
          <div className="relative">
            {/* A malha é uma camada só de decoração, atrás do conteúdo. Ela NÃO
                pode ir na div do formulário: .rh-grade traz um mask-image, e
                máscara em CSS vale para o elemento inteiro — o formulário todo
                desbotaria de cima para baixo junto com o desenho da grade. */}
            <div
              className="rh-grade pointer-events-none absolute inset-x-0 top-0 h-80"
              aria-hidden="true"
            />
            <div className="relative jp-container py-10 sm:py-14">
              <div className="mx-auto max-w-3xl">
                <p className="eyebrow text-ink">Candidatura</p>
                <h1 className="mt-3 font-display text-3xl font-extrabold leading-[1.02] tracking-[-0.04em] text-forest-2 sm:text-4xl lg:text-5xl">
                  {config.tituloPortal}
                </h1>
                <p className="mt-4 max-w-2xl text-base font-medium leading-relaxed text-ink-soft">
                  {config.chamadaPortal}
                </p>
                <p className="mt-4 flex items-center gap-2 text-sm font-semibold text-ink-soft">
                  <Clock3 className="h-4 w-4 text-forest" aria-hidden="true" />
                  Cinco passos, cerca de seis minutos. Dá para parar e voltar depois.
                </p>

                {rascunho !== null ? (
                  <div className="mt-6 flex flex-col gap-3 rounded-2xl border border-forest/25 bg-mint p-4 sm:flex-row sm:items-center sm:justify-between">
                    <p className="flex items-start gap-2 text-sm font-semibold text-ink">
                      <RotateCcw className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                      <span>
                        Encontramos uma candidatura que você começou neste navegador. Quer continuar
                        de onde parou?
                      </span>
                    </p>
                    <div className="flex shrink-0 gap-2">
                      <button
                        type="button"
                        onClick={restaurarRascunho}
                        className="inline-flex min-h-11 items-center rounded-full bg-forest px-4 text-sm font-bold text-white transition hover:bg-brand-deep"
                      >
                        Continuar
                      </button>
                      <button
                        type="button"
                        onClick={descartarRascunho}
                        className="inline-flex min-h-11 items-center rounded-full border border-forest/25 bg-white px-4 text-sm font-bold text-ink transition hover:bg-white/70"
                      >
                        Começar do zero
                      </button>
                    </div>
                  </div>
                ) : null}

                <form
                  className="rh-papel mt-8 p-5 sm:p-7 lg:p-9"
                  noValidate
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (passo < PASSOS.length) avancar();
                    else void enviar();
                  }}
                >
                  {/* Alerta do topo: erros que não pertencem a um campo. tabIndex
                    -1 para poder receber foco por código sem entrar no Tab. */}
                  <div ref={alertaRef} id={idCampo("geral")} tabIndex={-1} className="outline-none">
                    {erroGeral.length > 0 || erroVaga.length > 0 ? (
                      <div
                        role="alert"
                        className="mb-6 flex items-start gap-3 rounded-2xl border border-destructive/30 bg-destructive/5 p-4"
                      >
                        <CircleAlert
                          className="mt-0.5 h-5 w-5 shrink-0 text-destructive"
                          aria-hidden="true"
                        />
                        <div className="text-sm font-semibold leading-relaxed text-destructive">
                          {erroGeral.length > 0 ? <p>{erroGeral}</p> : null}
                          {erroVaga.length > 0 ? <p>{erroVaga}</p> : null}
                        </div>
                      </div>
                    ) : null}

                    {/* Não é erro: é explicação. A pessoa começou a candidatura
                        quando a vaga estava aberta e voltou depois que ela saiu
                        do ar. Sem esta linha, a vaga simplesmente sumiria do
                        formulário e ela não saberia por quê. */}
                    {vagaDoRascunhoSumiu ? (
                      <div
                        role="status"
                        className="mb-6 flex items-start gap-3 rounded-2xl border border-border-soft bg-mint/60 p-4"
                      >
                        <CircleAlert
                          className="mt-0.5 h-5 w-5 shrink-0 text-forest"
                          aria-hidden="true"
                        />
                        <p className="text-sm font-semibold leading-relaxed text-ink">
                          A vaga que você tinha escolhido não está mais recebendo candidaturas.
                          Guardamos tudo o que você já havia preenchido — é só escolher outra vaga
                          ou seguir pelo banco de talentos.
                        </p>
                      </div>
                    ) : null}
                  </div>

                  <header className="mb-7 border-b border-border-soft pb-5">
                    {/* Escondido do leitor de tela porque o mesmo texto entra no
                        <h2> abaixo, que é o alvo do foco na troca de passo. */}
                    <p className="eyebrow text-ink" aria-hidden="true">
                      Passo {passo} de {PASSOS.length}
                    </p>
                    {/* tabIndex -1 para receber foco por código na troca de
                        passo, sem entrar na ordem de tabulação. O número do
                        passo entra aqui só para o leitor de tela: ele já está
                        na linha acima, que é visual. */}
                    <h2
                      ref={tituloPassoRef}
                      tabIndex={-1}
                      className="mt-2 font-display text-2xl font-extrabold tracking-[-0.03em] text-forest-2 outline-none sm:text-3xl"
                    >
                      <span className="sr-only">
                        Passo {passo} de {PASSOS.length}:{" "}
                      </span>
                      {PASSOS[passo - 1]?.titulo ?? ""}
                    </h2>
                    <p className="mt-1 text-sm font-medium text-ink-soft">
                      {PASSOS[passo - 1]?.resumo ?? ""}
                    </p>
                  </header>

                  {passo === 1 ? (
                    <PassoVaga
                      dados={dados}
                      erros={erros}
                      vagas={vagas}
                      agora={agora}
                      aceitandoEspontanea={config.aceitandoEspontanea}
                      mensagemSemVagas={config.mensagemSemVagas}
                      vagaEscolhida={vagaEscolhida}
                      vagaFixada={vagaFixada}
                      escolhaFeita={escolhaFeita}
                      aoEscolherVaga={escolherVaga}
                      aoTrocarVaga={() => setEscolhaFeita(false)}
                      aoAtualizar={atualizar}
                      aoAlternarLista={alternarEmLista}
                    />
                  ) : null}

                  {passo === 2 ? (
                    <PassoPessoal
                      dados={dados}
                      erros={erros}
                      buscandoCep={buscandoCep}
                      aoAtualizar={atualizar}
                      aoMudarCep={aoMudarCep}
                    />
                  ) : null}

                  {passo === 3 ? (
                    <PassoFormacao dados={dados} erros={erros} aoAtualizar={atualizar} />
                  ) : null}

                  {passo === 4 ? (
                    <PassoExperiencia
                      dados={dados}
                      erros={erros}
                      aoAtualizar={atualizar}
                      aoAlternarLista={alternarEmLista}
                      aoMudarExperiencia={mudarExperiencia}
                      aoAdicionarExperiencia={adicionarExperiencia}
                      aoRemoverExperiencia={removerExperiencia}
                    />
                  ) : null}

                  {passo === 5 ? (
                    <PassoFinal
                      dados={dados}
                      erros={erros}
                      arquivo={arquivo}
                      erroArquivo={erroArquivo}
                      emailRh={config.emailRh}
                      aoAtualizar={atualizar}
                      aoEscolherArquivo={setArquivo}
                      aoErrarArquivo={setErroArquivo}
                    />
                  ) : null}

                  <div className="mt-9 flex flex-col-reverse gap-3 border-t border-border-soft pt-6 sm:flex-row sm:items-center sm:justify-between">
                    <button
                      type="button"
                      onClick={voltar}
                      disabled={passo === 1}
                      className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-border-soft bg-white px-5 text-sm font-bold text-ink transition hover:border-ink-soft hover:bg-cream disabled:cursor-not-allowed disabled:opacity-45"
                    >
                      <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                      Voltar
                    </button>

                    {passo < PASSOS.length ? (
                      <button
                        type="submit"
                        className="button-primary inline-flex min-h-12 items-center justify-center gap-2"
                      >
                        Continuar
                        <ArrowRight className="h-4 w-4" aria-hidden="true" />
                      </button>
                    ) : (
                      <button
                        type="submit"
                        disabled={enviando}
                        className="button-primary inline-flex min-h-12 items-center justify-center gap-2 disabled:cursor-progress disabled:opacity-70"
                      >
                        {enviando ? "Enviando..." : "Enviar candidatura"}
                        <Send className="h-4 w-4" aria-hidden="true" />
                      </button>
                    )}
                  </div>

                  {/* Anúncio discreto do estado do envio para quem não vê o botão. */}
                  <p className="sr-only" role="status">
                    {enviando ? "Enviando sua candidatura, aguarde." : ""}
                  </p>
                </form>
              </div>
            </div>
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Barra superior com progresso                                               */
/* -------------------------------------------------------------------------- */

function BarraTopo(props: {
  passo: number;
  progresso: number;
  enviado: boolean;
  aoIrPara: (destino: number) => void;
}) {
  return (
    <div className="sticky top-0 z-40 border-b border-border-soft bg-paper/95 backdrop-blur-md">
      <div className="jp-container flex h-16 items-center justify-between gap-4">
        <a href="/" className="flex items-center gap-3" aria-label="Ir para a página inicial">
          <Logo variante="lockup" fundo="claro" altura={28} className="h-7 w-auto" />
        </a>
        <a
          href="/carreiras"
          className="inline-flex min-h-11 items-center gap-2 rounded-full border border-border-soft px-4 text-xs font-bold uppercase tracking-[0.1em] text-ink transition hover:bg-mint"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          Ver vagas
        </a>
      </div>

      {props.enviado ? null : (
        <div className="jp-container pb-3">
          <div
            className="rh-progresso"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={props.progresso}
            aria-label={`Progresso da candidatura: passo ${props.passo} de ${PASSOS.length}`}
          >
            <div className="rh-progresso-barra" style={{ width: `${props.progresso}%` }} />
          </div>

          <ol className="rh-scroll mt-3 flex items-center gap-1 overflow-x-auto pb-1">
            {PASSOS.map((p) => {
              const estado =
                p.numero < props.passo ? "feito" : p.numero === props.passo ? "atual" : "futuro";
              const concluido = p.numero < props.passo;
              return (
                <li key={p.numero} className="flex shrink-0 items-center gap-1">
                  {/* Só os passos já concluídos viram botão: deixar clicar num
                      passo futuro pularia a validação do passo atual, e a pessoa
                      chegaria ao envio com campos obrigatórios em branco. */}
                  <button
                    type="button"
                    disabled={!concluido}
                    onClick={() => props.aoIrPara(p.numero)}
                    aria-current={estado === "atual" ? "step" : undefined}
                    className="flex min-h-11 items-center gap-2 rounded-full px-2 transition enabled:hover:bg-mint disabled:cursor-default"
                  >
                    <span className="rh-passo" data-estado={estado} aria-hidden="true">
                      {concluido ? <Check className="h-3.5 w-3.5" /> : p.numero}
                    </span>
                    <span
                      className={`whitespace-nowrap text-xs font-bold ${
                        estado === "futuro" ? "text-ink-soft" : "text-ink"
                      } ${estado === "atual" ? "" : "hidden sm:inline"}`}
                    >
                      {p.titulo}
                    </span>
                    <span className="sr-only">
                      {concluido
                        ? `Passo ${p.numero}, ${p.titulo}, concluído. Voltar para este passo.`
                        : `Passo ${p.numero}, ${p.titulo}`}
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Passo 1 — a vaga                                                           */
/* -------------------------------------------------------------------------- */

function ResumoVaga(props: { vaga: Vaga }) {
  const salario = faixaSalarial(props.vaga);
  const jornada = resumoJornada(props.vaga);
  return (
    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs font-semibold text-ink-soft">
      <span className="inline-flex items-center gap-1.5">
        <Briefcase className="h-3.5 w-3.5" aria-hidden="true" />
        {rotuloArea(props.vaga.area)}
        {props.vaga.vinculo ? ` · ${rotuloVinculo(props.vaga.vinculo)}` : ""}
      </span>
      {jornada.length > 0 ? (
        <span className="inline-flex items-center gap-1.5">
          <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />
          {jornada}
        </span>
      ) : null}
      {props.vaga.local.trim().length > 0 ? (
        <span className="inline-flex items-center gap-1.5">
          <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
          {props.vaga.local}
        </span>
      ) : null}
      {salario.length > 0 ? (
        <span className="inline-flex items-center gap-1.5">
          <Banknote className="h-3.5 w-3.5" aria-hidden="true" />
          {salario}
        </span>
      ) : null}
    </div>
  );
}

function PassoVaga(props: {
  dados: Candidatura;
  erros: ErrosPasso;
  vagas: Vaga[];
  agora: Date;
  aceitandoEspontanea: boolean;
  mensagemSemVagas: string;
  vagaEscolhida: Vaga | null;
  vagaFixada: Vaga | null;
  escolhaFeita: boolean;
  aoEscolherVaga: (vaga: Vaga | null) => void;
  aoTrocarVaga: () => void;
  aoAtualizar: (mudanca: Partial<Candidatura>) => void;
  aoAlternarLista: (
    chave: "especialidades" | "softwares" | "competencias" | "idiomas",
    valor: string,
  ) => void;
}) {
  const { dados, erros } = props;
  const espontaneaEscolhida = props.escolhaFeita && props.vagaEscolhida === null;
  const mostrarLista =
    !props.escolhaFeita || (dados.vagaId.length > 0 && props.vagaEscolhida === null);

  return (
    <div className="space-y-8">
      {/* ---- Escolha da vaga ---- */}
      {mostrarLista ? (
        <div>
          <Rotulo campo="vagaId" texto="A que vaga você quer se candidatar?" paraCampo={false} />
          {props.vagas.length === 0 ? (
            <p className="rounded-2xl border border-border-soft bg-white p-4 text-sm font-medium leading-relaxed text-ink-soft">
              {props.mensagemSemVagas}
            </p>
          ) : null}
          <div
            role="radiogroup"
            aria-labelledby="rh-rotulo-vagaId"
            className="grid gap-3 sm:grid-cols-2"
          >
            {props.vagas.map((v, i) => (
              <button
                key={v.id}
                id={i === 0 ? idCampo("vagaId") : undefined}
                type="button"
                role="radio"
                aria-checked={dados.vagaId === v.id}
                className="rh-cartao-opcao"
                data-ativo={dados.vagaId === v.id ? "true" : "false"}
                onClick={() => props.aoEscolherVaga(v)}
              >
                <span className="font-display text-lg font-extrabold leading-tight text-ink">
                  {v.titulo}
                </span>
                <span className="text-sm font-medium leading-relaxed text-ink-soft">
                  {v.resumo}
                </span>
                <ResumoVaga vaga={v} />
              </button>
            ))}

            {props.aceitandoEspontanea ? (
              <button
                id={props.vagas.length === 0 ? idCampo("vagaId") : undefined}
                type="button"
                role="radio"
                aria-checked={espontaneaEscolhida}
                className="rh-cartao-opcao"
                data-ativo={espontaneaEscolhida ? "true" : "false"}
                onClick={() => props.aoEscolherVaga(null)}
              >
                <span className="font-display text-lg font-extrabold leading-tight text-ink">
                  Candidatura espontânea
                </span>
                <span className="text-sm font-medium leading-relaxed text-ink-soft">
                  Seu currículo fica no banco de talentos da clínica. Quando abrir uma vaga do seu
                  perfil, a gente chama você primeiro.
                </span>
              </button>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-forest/25 bg-mint p-5">
          <p className="eyebrow text-ink">
            {props.vagaEscolhida !== null ? "Vaga escolhida" : "Banco de talentos"}
          </p>
          <p className="mt-2 font-display text-xl font-extrabold leading-tight text-ink">
            {props.vagaEscolhida !== null ? props.vagaEscolhida.titulo : "Candidatura espontânea"}
          </p>
          {props.vagaEscolhida !== null ? (
            <>
              <p className="mt-2 text-sm font-medium leading-relaxed text-ink">
                {props.vagaEscolhida.resumo}
              </p>
              <ResumoVaga vaga={props.vagaEscolhida} />
            </>
          ) : (
            <p className="mt-2 text-sm font-medium leading-relaxed text-ink">
              Seu currículo fica guardado com a equipe e é o primeiro a ser olhado quando abrir uma
              vaga do seu perfil.
            </p>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={props.aoTrocarVaga}
              className="inline-flex min-h-11 items-center gap-2 rounded-full border border-forest/30 bg-white px-4 text-sm font-bold text-ink transition hover:bg-white/70"
            >
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
              Escolher outra vaga
            </button>
            {props.vagaFixada !== null ? (
              <a
                href="/carreiras"
                className="inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-sm font-bold text-ink underline decoration-forest/30 underline-offset-4 transition hover:decoration-forest"
              >
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                Voltar para todas as vagas
              </a>
            ) : null}
          </div>
        </div>
      )}

      {/* ---- Área ---- */}
      <div>
        <Rotulo campo="area" texto="Em que área você atua?" paraCampo={false} />
        <div
          role="radiogroup"
          aria-labelledby="rh-rotulo-area"
          aria-describedby={(erros["area"] ?? "").length > 0 ? "rh-erro-area" : undefined}
          className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
        >
          {AREAS.map((a, i) => {
            const Icone = ICONES_AREA[a.icone] ?? Sparkles;
            const ativo = dados.area === a.valor;
            return (
              <button
                key={a.valor}
                id={i === 0 ? idCampo("area") : undefined}
                type="button"
                role="radio"
                aria-checked={ativo}
                className="rh-cartao-opcao"
                data-ativo={ativo ? "true" : "false"}
                onClick={() => props.aoAtualizar({ area: a.valor })}
              >
                <span className="flex items-center gap-2">
                  <Icone className="h-5 w-5 shrink-0 text-forest" aria-hidden="true" />
                  <span className="font-display text-base font-extrabold leading-tight text-ink">
                    {a.rotulo}
                  </span>
                  {ativo ? (
                    <Check className="ml-auto h-4 w-4 shrink-0 text-forest" aria-hidden="true" />
                  ) : null}
                </span>
                <span className="text-sm font-medium leading-relaxed text-ink-soft">
                  {a.descricao}
                </span>
              </button>
            );
          })}
        </div>
        <MensagemErro campo="area" texto={erros["area"] ?? ""} />
      </div>

      <CampoTexto
        campo="cargoDesejado"
        rotulo="Cargo desejado"
        valor={dados.cargoDesejado}
        aoMudar={(v) => props.aoAtualizar({ cargoDesejado: v })}
        erro={erros["cargoDesejado"]}
        ajuda="Como você chamaria a função: Recepcionista, ASB, Dentista clínico geral..."
        placeholder="Ex.: Auxiliar em Saúde Bucal"
        maxLength={120}
        autoComplete="organization-title"
      />

      <SeletorChips
        campo="vinculo"
        rotulo="Tipo de vínculo"
        modo="unica"
        opcoes={VINCULOS}
        selecionados={dados.vinculo ? [dados.vinculo] : []}
        aoAlternar={(v) => props.aoAtualizar({ vinculo: v as Vinculo })}
        erro={erros["vinculo"]}
      />

      {/* Especialidades só fazem sentido para quem tem CRO — para uma
          recepcionista, essa lista seria só ruído. */}
      {dados.area === "dentista" ? (
        <SeletorChips
          campo="especialidades"
          rotulo="Especialidades"
          modo="multipla"
          opcoes={ESPECIALIDADES_ODONTO.map((e) => ({ valor: e, rotulo: e }))}
          selecionados={dados.especialidades}
          aoAlternar={(v) => props.aoAlternarLista("especialidades", v)}
          erro={erros["especialidades"]}
          ajuda="Marque tudo em que você atende, mesmo sem título de especialista."
        />
      ) : null}

      <GradeTurnos
        campo="disponibilidade"
        selecionadas={dados.disponibilidade}
        aoMudar={(chaves) => props.aoAtualizar({ disponibilidade: chaves })}
        erro={erros["disponibilidade"]}
        ajuda="Toque nos turnos em que você pode trabalhar. O nome do dia marca a linha inteira; o nome do turno marca a coluna."
      />

      <div className="grid gap-5 sm:grid-cols-2">
        <SeletorChips
          campo="inicioEm"
          rotulo="Quando você pode começar?"
          modo="unica"
          opcoes={PRAZOS_INICIO}
          selecionados={dados.inicioEm ? [dados.inicioEm] : []}
          aoAlternar={(v) => props.aoAtualizar({ inicioEm: v as PrazoInicio })}
          erro={erros["inicioEm"]}
          opcional
        />
        <CampoTexto
          campo="pretensao"
          rotulo="Pretensão salarial"
          valor={dados.pretensao}
          aoMudar={(v) => props.aoAtualizar({ pretensao: mascararMoeda(v) })}
          erro={erros["pretensao"]}
          ajuda="Deixe em branco se preferir conversar sobre isso depois."
          placeholder="R$ 0,00"
          inputMode="numeric"
          opcional
        />
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Passo 2 — você                                                             */
/* -------------------------------------------------------------------------- */

function PassoPessoal(props: {
  dados: Candidatura;
  erros: ErrosPasso;
  buscandoCep: boolean;
  aoAtualizar: (mudanca: Partial<Candidatura>) => void;
  aoMudarCep: (valor: string) => void;
}) {
  const { dados, erros } = props;

  return (
    <div className="space-y-5">
      <CampoTexto
        campo="nome"
        rotulo="Nome completo"
        valor={dados.nome}
        aoMudar={(v) => props.aoAtualizar({ nome: v })}
        erro={erros["nome"]}
        placeholder="Como está no seu documento"
        autoComplete="name"
        maxLength={120}
      />

      <div className="grid gap-5 sm:grid-cols-2">
        <CampoTexto
          campo="nascimento"
          rotulo="Data de nascimento"
          tipo="date"
          valor={dados.nascimento}
          aoMudar={(v) => props.aoAtualizar({ nascimento: v })}
          erro={erros["nascimento"]}
          autoComplete="bday"
        />
        <CampoTexto
          campo="cpf"
          rotulo="CPF"
          valor={dados.cpf}
          aoMudar={(v) => props.aoAtualizar({ cpf: mascararCpf(v) })}
          erro={erros["cpf"]}
          placeholder="000.000.000-00"
          inputMode="numeric"
        />
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <CampoTexto
          campo="email"
          rotulo="E-mail"
          tipo="email"
          valor={dados.email}
          aoMudar={(v) => props.aoAtualizar({ email: v })}
          erro={erros["email"]}
          placeholder="voce@email.com"
          autoComplete="email"
          inputMode="email"
          maxLength={254}
        />
        <CampoTexto
          campo="telefone"
          rotulo="Telefone com DDD"
          tipo="tel"
          valor={dados.telefone}
          aoMudar={(v) => props.aoAtualizar({ telefone: mascararTelefone(v) })}
          erro={erros["telefone"]}
          ajuda="De preferência o WhatsApp: é por ali que a clínica chama."
          placeholder="(11) 90000-0000"
          autoComplete="tel"
          inputMode="tel"
        />
      </div>

      <div className="grid gap-5 sm:grid-cols-[minmax(0,10rem)_1fr]">
        <div>
          <CampoTexto
            campo="cep"
            rotulo="CEP"
            valor={dados.cep}
            aoMudar={props.aoMudarCep}
            erro={erros["cep"]}
            placeholder="00000-000"
            autoComplete="postal-code"
            inputMode="numeric"
            opcional
          />
          {/* aria-live para quem não vê a tela saber que os campos abaixo vão
              se preencher sozinhos daqui a um instante. */}
          <p className="rh-ajuda flex items-center gap-1.5" aria-live="polite">
            {props.buscandoCep ? (
              <>
                <Info className="h-3.5 w-3.5" aria-hidden="true" />
                Buscando endereço...
              </>
            ) : (
              ""
            )}
          </p>
        </div>
        <CampoTexto
          campo="logradouro"
          rotulo="Rua e número"
          valor={dados.logradouro}
          aoMudar={(v) => props.aoAtualizar({ logradouro: v })}
          erro={erros["logradouro"]}
          autoComplete="street-address"
          maxLength={160}
          opcional
        />
      </div>

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_7rem]">
        <CampoTexto
          campo="bairro"
          rotulo="Bairro"
          valor={dados.bairro}
          aoMudar={(v) => props.aoAtualizar({ bairro: v })}
          erro={erros["bairro"]}
          maxLength={120}
          opcional
        />
        <CampoTexto
          campo="cidade"
          rotulo="Cidade"
          valor={dados.cidade}
          aoMudar={(v) => props.aoAtualizar({ cidade: v })}
          erro={erros["cidade"]}
          autoComplete="address-level2"
          maxLength={120}
        />
        <CampoSelect
          campo="uf"
          rotulo="Estado"
          valor={dados.uf}
          aoMudar={(v) => props.aoAtualizar({ uf: v })}
          erro={erros["uf"]}
          opcoes={UFS.map((u) => ({ valor: u, rotulo: u }))}
          vazio="UF"
        />
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <CampoTexto
          campo="linkedin"
          rotulo="LinkedIn"
          tipo="url"
          valor={dados.linkedin}
          aoMudar={(v) => props.aoAtualizar({ linkedin: v })}
          erro={erros["linkedin"]}
          placeholder="linkedin.com/in/seu-perfil"
          inputMode="url"
          maxLength={200}
          opcional
        />
        <CampoTexto
          campo="instagram"
          rotulo="Instagram"
          valor={dados.instagram}
          aoMudar={(v) => props.aoAtualizar({ instagram: v })}
          erro={erros["instagram"]}
          placeholder="@seu.perfil"
          maxLength={100}
          opcional
        />
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Passo 3 — formação                                                         */
/* -------------------------------------------------------------------------- */

function PassoFormacao(props: {
  dados: Candidatura;
  erros: ErrosPasso;
  aoAtualizar: (mudanca: Partial<Candidatura>) => void;
}) {
  const { dados, erros } = props;

  return (
    <div className="space-y-5">
      <CampoSelect
        campo="escolaridade"
        rotulo="Escolaridade"
        valor={dados.escolaridade}
        aoMudar={(v) => props.aoAtualizar({ escolaridade: v })}
        erro={erros["escolaridade"]}
        opcoes={ESCOLARIDADES.map((e) => ({ valor: e, rotulo: e }))}
      />

      <div className="grid gap-5 sm:grid-cols-[1fr_9rem]">
        <CampoTexto
          campo="instituicao"
          rotulo="Instituição de ensino"
          valor={dados.instituicao}
          aoMudar={(v) => props.aoAtualizar({ instituicao: v })}
          erro={erros["instituicao"]}
          maxLength={160}
          opcional
        />
        <CampoTexto
          campo="anoFormacao"
          rotulo="Ano de conclusão"
          valor={dados.anoFormacao}
          aoMudar={(v) => props.aoAtualizar({ anoFormacao: apenasDigitos(v).slice(0, 4) })}
          erro={erros["anoFormacao"]}
          placeholder="2019"
          inputMode="numeric"
          opcional
        />
      </div>

      {/* Bloco destacado: para dentista, CRO é o que separa uma candidatura
          válida de uma inválida — e é o primeiro campo que o RH confere. */}
      {dados.area === "dentista" ? (
        <div className="rounded-2xl border border-forest/25 bg-mint p-5">
          <p className="flex items-center gap-2 font-display text-base font-extrabold text-ink">
            <Stethoscope className="h-5 w-5" aria-hidden="true" />
            Registro no Conselho
          </p>
          <p className="mt-1 text-sm font-medium text-ink-soft">
            Obrigatório para quem se candidata como cirurgião-dentista.
          </p>
          <div className="mt-4 grid gap-5 sm:grid-cols-[1fr_7rem]">
            <CampoTexto
              campo="cro"
              rotulo="Número do CRO"
              valor={dados.cro}
              aoMudar={(v) => props.aoAtualizar({ cro: apenasDigitos(v).slice(0, 8) })}
              erro={erros["cro"]}
              placeholder="Somente números"
              inputMode="numeric"
            />
            <CampoSelect
              campo="croUf"
              rotulo="UF do CRO"
              valor={dados.croUf}
              aoMudar={(v) => props.aoAtualizar({ croUf: v })}
              erro={erros["croUf"]}
              opcoes={UFS.map((u) => ({ valor: u, rotulo: u }))}
              vazio="UF"
            />
          </div>
        </div>
      ) : null}

      <CampoTextarea
        campo="posGraduacoes"
        rotulo="Pós-graduações e especializações"
        valor={dados.posGraduacoes}
        aoMudar={(v) => props.aoAtualizar({ posGraduacoes: v })}
        erro={erros["posGraduacoes"]}
        ajuda="Uma por linha, com a instituição e o ano, se lembrar."
        maxLength={MAX_TEXTO_LONGO}
        linhas={4}
        opcional
      />

      <CampoTextarea
        campo="cursos"
        rotulo="Cursos e capacitações"
        valor={dados.cursos}
        aoMudar={(v) => props.aoAtualizar({ cursos: v })}
        erro={erros["cursos"]}
        ajuda="Biossegurança, radiologia, atendimento, gestão — o que fizer sentido para a vaga."
        maxLength={MAX_TEXTO_LONGO}
        linhas={4}
        opcional
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Passo 4 — experiência                                                      */
/* -------------------------------------------------------------------------- */

function PassoExperiencia(props: {
  dados: Candidatura;
  erros: ErrosPasso;
  aoAtualizar: (mudanca: Partial<Candidatura>) => void;
  aoAlternarLista: (
    chave: "especialidades" | "softwares" | "competencias" | "idiomas",
    valor: string,
  ) => void;
  aoMudarExperiencia: (indice: number, campo: keyof ExperienciaItem, valor: string) => void;
  aoAdicionarExperiencia: () => void;
  aoRemoverExperiencia: (indice: number) => void;
}) {
  const { dados, erros } = props;
  const cheio = dados.experiencias.length >= MAX_EXPERIENCIAS;

  return (
    <div className="space-y-8">
      <SeletorChips
        campo="anosExperiencia"
        rotulo="Tempo de experiência na área"
        modo="unica"
        opcoes={FAIXAS_EXPERIENCIA}
        selecionados={dados.anosExperiencia ? [dados.anosExperiencia] : []}
        aoAlternar={(v) => props.aoAtualizar({ anosExperiencia: v as FaixaExperiencia })}
        erro={erros["anosExperiencia"]}
      />

      <div>
        <Rotulo campo="experiencias" texto="Onde você já trabalhou" paraCampo={false} />
        <Ajuda
          campo="experiencias"
          texto={`Comece pela mais recente. Até ${MAX_EXPERIENCIAS} experiências — se estiver começando agora, pode deixar em branco.`}
        />

        <div className="mt-4 space-y-4">
          {dados.experiencias.map((exp, i) => (
            <fieldset key={i} className="rounded-2xl border border-border-soft bg-white p-4 sm:p-5">
              <legend className="px-1 text-xs font-bold uppercase tracking-[0.12em] text-ink">
                Experiência {i + 1}
              </legend>

              <div className="mt-2 grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="rh-rotulo">Empresa ou clínica</span>
                  <input
                    // A primeira caixa carrega o id do grupo: é dela que o
                    // assistente se aproxima quando o erro é "experiencias".
                    id={i === 0 ? idCampo("experiencias") : undefined}
                    className="rh-campo"
                    value={exp.empresa}
                    maxLength={120}
                    onChange={(e) => props.aoMudarExperiencia(i, "empresa", e.target.value)}
                    aria-invalid={(erros["experiencias"] ?? "").length > 0}
                  />
                </label>
                <label className="block">
                  <span className="rh-rotulo">Cargo</span>
                  <input
                    className="rh-campo"
                    value={exp.cargo}
                    maxLength={120}
                    onChange={(e) => props.aoMudarExperiencia(i, "cargo", e.target.value)}
                  />
                </label>
                <label className="block sm:col-span-2">
                  <span className="rh-rotulo">Período</span>
                  <input
                    className="rh-campo"
                    value={exp.periodo}
                    maxLength={60}
                    placeholder="Ex.: mar/2021 a hoje"
                    onChange={(e) => props.aoMudarExperiencia(i, "periodo", e.target.value)}
                  />
                </label>
                <label className="block sm:col-span-2">
                  <span className="rh-rotulo">Principais atividades</span>
                  <textarea
                    className="rh-campo"
                    rows={3}
                    value={exp.atividades}
                    maxLength={1000}
                    onChange={(e) => props.aoMudarExperiencia(i, "atividades", e.target.value)}
                  />
                </label>
              </div>

              {dados.experiencias.length > 1 ? (
                <button
                  type="button"
                  onClick={() => props.aoRemoverExperiencia(i)}
                  className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-full px-3 text-sm font-bold text-destructive transition hover:bg-destructive/8"
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                  Remover experiência {i + 1}
                </button>
              ) : null}
            </fieldset>
          ))}
        </div>

        <MensagemErro campo="experiencias" texto={erros["experiencias"] ?? ""} />

        <button
          type="button"
          onClick={props.aoAdicionarExperiencia}
          disabled={cheio}
          className="mt-4 inline-flex min-h-12 items-center gap-2 rounded-full border border-forest/25 bg-white px-5 text-sm font-bold text-ink transition enabled:hover:bg-mint disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Adicionar experiência
        </button>
        {cheio ? (
          <p className="rh-ajuda">
            Chegou ao limite de {MAX_EXPERIENCIAS}. O resto cabe no currículo anexo.
          </p>
        ) : null}
      </div>

      <SeletorChips
        campo="softwares"
        rotulo="Sistemas que você já usou"
        modo="multipla"
        opcoes={SOFTWARES.map((s) => ({ valor: s, rotulo: s }))}
        selecionados={dados.softwares}
        aoAlternar={(v) => props.aoAlternarLista("softwares", v)}
        erro={erros["softwares"]}
        opcional
      />

      <SeletorChips
        campo="competencias"
        rotulo="O que você sabe fazer"
        modo="multipla"
        opcoes={COMPETENCIAS.map((c) => ({ valor: c, rotulo: c }))}
        selecionados={dados.competencias}
        aoAlternar={(v) => props.aoAlternarLista("competencias", v)}
        erro={erros["competencias"]}
        opcional
      />

      <SeletorChips
        campo="idiomas"
        rotulo="Idiomas"
        modo="multipla"
        opcoes={IDIOMAS.map((i) => ({ valor: i, rotulo: i }))}
        selecionados={dados.idiomas}
        aoAlternar={(v) => props.aoAlternarLista("idiomas", v)}
        erro={erros["idiomas"]}
        opcional
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Passo 5 — currículo e envio                                                */
/* -------------------------------------------------------------------------- */

function PassoFinal(props: {
  dados: Candidatura;
  erros: ErrosPasso;
  arquivo: File | null;
  erroArquivo: string;
  emailRh: string;
  aoAtualizar: (mudanca: Partial<Candidatura>) => void;
  aoEscolherArquivo: (arquivo: File | null) => void;
  aoErrarArquivo: (mensagem: string) => void;
}) {
  const { dados, erros } = props;
  // "Indicação de colaborador" é a única origem que pede um nome; procurar por
  // "indica" cobre também qualquer variação que o RH venha a cadastrar depois.
  const pedeIndicacao = dados.origem.toLowerCase().includes("indica");
  const restantes = MAX_CARTA - dados.cartaApresentacao.length;

  // O e-mail do RH pode não estar configurado ainda; sem ele, o canal de
  // contato para exercer os direitos da LGPD passa a ser o WhatsApp da clínica.
  const canalLgpd =
    props.emailRh.trim().length > 0
      ? `pelo e-mail ${props.emailRh.trim()}`
      : `pelo WhatsApp ${CLINICA.whatsapp}`;

  return (
    <div className="space-y-7">
      <AreaUpload
        campo="curriculo"
        arquivo={props.arquivo}
        aoEscolher={props.aoEscolherArquivo}
        erro={props.erroArquivo.length > 0 ? props.erroArquivo : (erros["curriculo"] ?? "")}
        aoErrar={props.aoErrarArquivo}
      />

      <CampoTextarea
        campo="cartaApresentacao"
        rotulo="Por que você quer trabalhar na JP?"
        valor={dados.cartaApresentacao}
        aoMudar={(v) => props.aoAtualizar({ cartaApresentacao: v.slice(0, MAX_CARTA) })}
        erro={erros["cartaApresentacao"]}
        ajuda="Escreva do seu jeito. Duas ou três frases sinceras valem mais que uma página inteira."
        maxLength={MAX_CARTA}
        linhas={6}
        opcional
        rodape={
          <p className="mt-1 text-right text-xs font-semibold tabular-nums text-ink">
            {restantes} {restantes === 1 ? "caractere restante" : "caracteres restantes"}
          </p>
        }
      />

      <div className="grid gap-5 sm:grid-cols-2">
        <CampoSelect
          campo="origem"
          rotulo="Como você chegou até a clínica?"
          valor={dados.origem}
          aoMudar={(v) => props.aoAtualizar({ origem: v })}
          erro={erros["origem"]}
          opcoes={ORIGENS.map((o) => ({ valor: o, rotulo: o }))}
        />
        {pedeIndicacao ? (
          <CampoTexto
            campo="indicadoPor"
            rotulo="Quem indicou você?"
            valor={dados.indicadoPor}
            aoMudar={(v) => props.aoAtualizar({ indicadoPor: v })}
            erro={erros["indicadoPor"]}
            ajuda="O nome de quem trabalha (ou trabalhou) aqui."
            maxLength={120}
          />
        ) : null}
      </div>

      {/* ATENÇÃO ao editar o texto deste aviso: ele é o consentimento em si, e
          a redação vigente fica gravada em cada candidatura
          (`Candidatura.consentimentoVersao`). Mudou uma vírgula do que a pessoa
          autoriza? Suba `VERSAO_CONSENTIMENTO_LGPD` em `src/lib/rh/tipos.ts`,
          senão as fichas novas apontam para uma redação que ninguém leu. E o
          prazo citado aqui é o mesmo `MESES_RETENCAO_LGPD` que o painel usa
          para marcar ficha vencida — os dois números andam juntos. */}
      <div className="rounded-2xl border border-border-soft bg-white p-5">
        <label className="flex cursor-pointer items-start gap-3">
          <input
            id={idCampo("consentimentoLgpd")}
            type="checkbox"
            checked={dados.consentimentoLgpd}
            onChange={(e) => props.aoAtualizar({ consentimentoLgpd: e.target.checked })}
            aria-invalid={(erros["consentimentoLgpd"] ?? "").length > 0}
            aria-describedby="rh-ajuda-consentimentoLgpd"
            className="mt-0.5 h-6 w-6 shrink-0 accent-[#095902]"
          />
          <span className="text-sm font-medium leading-relaxed text-ink">
            Autorizo a <strong>{CLINICA.nome}</strong> ({CLINICA.razaoSocial}, CNPJ {CLINICA.cnpj}),
            na condição de <strong>controladora</strong> dos meus dados pessoais, a tratar as
            informações e o currículo que envio neste formulário com a finalidade exclusiva de
            participação em processos seletivos, pelo prazo de até {MESES_RETENCAO_LGPD} meses.
            Declaro estar ciente de que posso solicitar acesso, correção, portabilidade ou{" "}
            <strong>exclusão dos meus dados</strong> a qualquer momento {canalLgpd}, nos termos da
            Lei nº 13.709/2018 (LGPD).
          </span>
        </label>
        <p className="rh-ajuda" id="rh-ajuda-consentimentoLgpd">
          Seus dados não são vendidos nem compartilhados com terceiros para outra finalidade.
        </p>
        <MensagemErro campo="consentimentoLgpd" texto={erros["consentimentoLgpd"] ?? ""} />
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Tela de sucesso                                                            */
/* -------------------------------------------------------------------------- */

function TelaSucesso(props: {
  protocolo: string;
  copiado: boolean;
  aoCopiar: () => void;
  emailRh: string;
}) {
  const passosDepois = [
    {
      titulo: "A equipe lê a sua candidatura",
      texto: "Tudo o que chega é lido por gente da clínica — nada de filtro automático.",
    },
    {
      titulo: "Se o perfil combinar, a gente chama",
      texto: "O contato vem pelo WhatsApp ou telefone que você deixou, no horário comercial.",
    },
    {
      titulo: "Conversa e visita à clínica",
      texto: "A entrevista é aqui na Vila Bruna, para você conhecer a estrutura e a equipe.",
    },
  ];

  return (
    <div className="jp-container py-12 sm:py-16">
      <div className="mx-auto max-w-3xl">
        <div className="rh-papel overflow-hidden">
          {/* Só .section-deep aqui: .rh-grade também declara background-image e,
              por vir depois no styles.css, apagaria o gradiente escuro — o bloco
              ficaria branco e o lime do texto cairia para 2,8:1 de contraste. */}
          <div className="section-deep px-6 py-10 text-center sm:px-10 sm:py-14">
            <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-lime/15 ring-1 ring-lime/40">
              <Check className="h-8 w-8 text-lime" aria-hidden="true" />
            </span>
            <p className="eyebrow mt-6 text-white">Candidatura enviada</p>
            <h1 className="mt-3 font-display text-3xl font-extrabold leading-[1.02] tracking-[-0.04em] text-white sm:text-4xl">
              Recebemos o seu currículo.
            </h1>
            <p className="mx-auto mt-4 max-w-lg text-base font-medium leading-relaxed text-white/85">
              Guarde o número do protocolo. É por ele que a equipe encontra a sua candidatura se
              você quiser falar com a gente.
            </p>

            {/* O protocolo é o único dado que a pessoa precisa levar embora
                daqui, então tudo dentro deste bloco escuro é branco puro: o
                rótulo era `text-lime` e o número já era branco. A borda e o
                anel seguem lime — são traço, não letra. */}
            <div className="mx-auto mt-8 max-w-sm rounded-2xl border border-lime/35 bg-brand-deep/60 p-5">
              <p className="text-[0.65rem] font-bold uppercase tracking-[0.18em] text-white">
                Protocolo
              </p>
              <p className="mt-2 break-all font-display text-3xl font-extrabold tabular-nums tracking-tight text-white sm:text-4xl">
                {props.protocolo}
              </p>
              <button
                type="button"
                onClick={props.aoCopiar}
                className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-full bg-lime px-5 text-sm font-extrabold text-brand-deep transition hover:brightness-105"
              >
                {props.copiado ? (
                  <Check className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <Copy className="h-4 w-4" aria-hidden="true" />
                )}
                {props.copiado ? "Copiado" : "Copiar protocolo"}
              </button>
              {/* role="status" anuncia a confirmação da cópia sem roubar o foco. */}
              <p className="sr-only" role="status">
                {props.copiado ? "Protocolo copiado para a área de transferência." : ""}
              </p>
            </div>
          </div>

          <div className="p-6 sm:p-10">
            <h2 className="font-display text-xl font-extrabold tracking-[-0.03em] text-forest-2">
              O que acontece agora
            </h2>
            <ol className="mt-5 space-y-4">
              {passosDepois.map((p, i) => (
                <li key={p.titulo} className="flex gap-4">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-mint font-display text-sm font-extrabold tabular-nums text-ink">
                    {i + 1}
                  </span>
                  <div>
                    <p className="font-display text-base font-extrabold text-ink">{p.titulo}</p>
                    <p className="mt-0.5 text-sm font-medium leading-relaxed text-ink-soft">
                      {p.texto}
                    </p>
                  </div>
                </li>
              ))}
            </ol>

            <div className="mt-7 flex items-start gap-3 rounded-2xl border border-border-soft bg-cream p-4">
              <Clock3 className="mt-0.5 h-5 w-5 shrink-0 text-forest" aria-hidden="true" />
              {/* Sem prazo em número: o painel é operado por uma pessoa só e não
                  mede nada parecido com um SLA — prometer "15 dias úteis" era um
                  compromisso por escrito que ninguém no sistema garante. */}
              <p className="text-sm font-medium leading-relaxed text-ink">
                <strong className="font-bold text-ink">Retorno:</strong> a equipe entra em contato
                assim que concluir a triagem. Se o seu perfil servir para uma vaga futura, seu
                currículo fica no banco de talentos por {MESES_RETENCAO_LGPD} meses.
              </p>
            </div>

            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <a
                href={whatsappLink(
                  `Olá! Enviei minha candidatura pelo site. Meu protocolo é ${props.protocolo}.`,
                )}
                target="_blank"
                rel="noopener noreferrer"
                className="button-primary inline-flex min-h-12 items-center justify-center gap-2"
              >
                <MessageCircle className="h-4 w-4" aria-hidden="true" />
                Falar no WhatsApp
              </a>
              <a
                href="/carreiras"
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-border-soft bg-white px-5 text-sm font-bold text-ink transition hover:bg-cream"
              >
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                Ver outras vagas
              </a>
            </div>

            {props.emailRh.trim().length > 0 ? (
              <p className="mt-5 text-sm font-medium text-ink-soft">
                Dúvidas sobre o processo? Escreva para{" "}
                <a
                  href={`mailto:${props.emailRh.trim()}`}
                  className="font-bold text-ink underline decoration-forest/30 underline-offset-4 hover:decoration-forest"
                >
                  {props.emailRh.trim()}
                </a>
                .
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
