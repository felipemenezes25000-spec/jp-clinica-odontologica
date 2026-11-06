/**
 * Formulário público de candidatura — uma tela só, em três blocos (a vaga, o
 * contato e o currículo).
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
import { Check, CircleAlert, RotateCcw, Send } from "lucide-react";

import consultorioImg from "@/assets/consultorio-2.webp";

import { AreaUpload } from "@/components/rh/AreaUpload";
import { CampoTexto, MensagemErro, Rotulo } from "@/components/rh/CampoTexto";
import { idCampo } from "@/components/rh/idsCampo";
import { Footer } from "@/components/site/Footer";
import { SkipLink } from "@/components/site/SkipLink";
import {
  BarraDeCandidatura,
  type EtapaDaCandidatura,
} from "@/components/site/carreiras/BarraDeCandidatura";
import { TelaDeSucesso } from "@/components/site/carreiras/TelaDeSucesso";
import { rastrearEnvioDeFormulario } from "@/lib/analytics/formulario";
import { MarcaCoroa, MolduraCoroa } from "@/components/site/sistema/Coroa";
import { Movimento } from "@/components/site/sistema/movimento";
import { CLINICA } from "@/lib/jp";
import { enviarCandidatura, listarVagasPublicas } from "@/lib/rh/api";
import type { RespostaPortal } from "@/lib/rh/api";
import { apenasDigitos, mascararTelefone } from "@/lib/rh/formatar";
import { AREAS, FAIXAS_EXPERIENCIA, PRAZOS_INICIO, VINCULOS } from "@/lib/rh/opcoes";
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
import { validarTudo } from "@/lib/rh/validar";
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
 * Rolagem que respeita "reduzir movimento": o `html` já tem
 * `scroll-behavior: smooth`, e um `behavior: "smooth"` explícito o ignora.
 */
function comportamentoDeRolagem(): ScrollBehavior {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
}

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
 * A candidatura sempre começa com um bloco de experiência em branco — o objeto
 * é o mesmo que o servidor valida, e uma lista vazia exigiria tratar o caso nos
 * dois lados.
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
 * meio minuto no bloco de contato.
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

  const [dados, setDados] = useState<Candidatura>(estadoInicial);
  const [erros, setErros] = useState<ErrosPasso>({});
  /* Por que "" | "rascunho" | "link" e não um booleano: as duas situações
     produzem a mesma consequência (a vaga sai do formulário) mas explicações
     diferentes. Num caso há preenchimento guardado para tranquilizar a pessoa;
     no outro ela acabou de chegar por um link e não perdeu nada. */
  const [vagaSumiu, setVagaSumiu] = useState<"" | "rascunho" | "link">("");
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [erroArquivo, setErroArquivo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [protocolo, setProtocolo] = useState("");
  const [escolhaFeita, setEscolhaFeita] = useState(false);
  const [rascunho, setRascunho] = useState<Candidatura | null>(null);
  const [copiado, setCopiado] = useState(false);

  /**
   * O que a validação precisa saber do portal e não está na candidatura.
   * Fica DEPOIS do estado do arquivo de propósito: `temCurriculo` depende dele,
   * e o currículo agora é obrigatório. Memorizado porque entra como dependência
   * de `enviar`: um objeto novo a cada render recriaria o callback a cada
   * tecla digitada.
   */
  const contexto = useMemo<ContextoPortal>(
    () => ({
      aceitandoEspontanea: config.aceitandoEspontanea,
      temCurriculo: arquivo !== null && arquivo.size > 0,
    }),
    [config.aceitandoEspontanea, arquivo],
  );

  /**
   * Um "agora" só para a página inteira. Nada de `new Date()` dentro do render
   * ou da validação: servidor e navegador chegariam a instantes diferentes e a
   * idade calculada no primeiro render mudaria na hidratação.
   */
  const [agora] = useState(() => new Date());

  /** `seq` faz o efeito de foco disparar de novo mesmo no mesmo campo. */
  const [foco, setFoco] = useState<{ campo: string; seq: number }>({ campo: "", seq: 0 });

  const prontoParaSalvar = useRef(false);
  const fixadaAplicada = useRef(false);
  const alertaRef = useRef<HTMLDivElement>(null);
  const timerCopiaRef = useRef<number | undefined>(undefined);

  const enviado = protocolo.length > 0;
  const vagaFixada = useMemo(
    () => (slugDaUrl.length > 0 ? (vagas.find((v) => v.slug === slugDaUrl) ?? null) : null),
    [vagas, slugDaUrl],
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
    if (fixadaAplicada.current || slugDaUrl.length === 0) return;
    fixadaAplicada.current = true;

    // `vagas` traz só as vagas ABERTAS. Um link para vaga encerrada, pausada
    // ou ainda em rascunho — o do WhatsApp que circulou semana passada, o
    // compartilhado por uma amiga — devolve `vagaFixada === null`, e até aqui
    // isso caía em silêncio: o formulário voltava para a lista de escolha sem
    // dizer nada, e quem clicou achava que tinha errado alguma coisa.
    if (vagaFixada === null) {
      setVagaSumiu("link");
      return;
    }
    escolherVaga(vagaFixada);
  }, [slugDaUrl, vagaFixada, escolherVaga]);

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
      foco.campo === "geral" ? alertaRef.current : document.getElementById(idCampo(foco.campo));
    if (alvo === null) return;
    // Focar (e não só rolar) é o ponto: quem usa leitor de tela precisa que o
    // cursor virtual pare no campo, ouvir o rótulo e ouvir a mensagem ligada
    // por aria-describedby. Rolar sozinho não move o foco de lugar nenhum.
    alvo.focus({ preventScroll: true });
    alvo.scrollIntoView({ block: "center", behavior: comportamentoDeRolagem() });
  }, [foco]);

  const apontarErros = useCallback((novos: ErrosPasso) => {
    setErros(novos);
    const campo = primeiroCampoComErro(novos);
    // Sobrou só "geral" ou "vagaId": os dois aparecem no alerta do topo.
    setFoco((f) => ({ campo: campo.length > 0 ? campo : "geral", seq: f.seq + 1 }));
  }, []);

  /* ---------------------------------------------------------------------- */
  /* Envio                                                                  */
  /* ---------------------------------------------------------------------- */

  const enviar = useCallback(
    async (form: HTMLFormElement) => {
      const todos = validarTudo(dados, agora, contexto);
      if (Object.keys(todos).length > 0) {
        apontarErros(todos);
        return;
      }
      // A tentativa só conta no funil depois de passar na validação (o form tem
      // `data-rastreio-proprio`, então o ouvinte global não a conta antes).
      rastrearEnvioDeFormulario(form);

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
          window.scrollTo({ top: 0, behavior: comportamentoDeRolagem() });
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
    },
    [dados, agora, contexto, arquivo, apontarErros, limparRascunho],
  );

  const copiarProtocolo = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(protocolo);
      setCopiado(true);
      window.clearTimeout(timerCopiaRef.current);
      timerCopiaRef.current = window.setTimeout(() => setCopiado(false), 2500);
    } catch {
      // Área de transferência negada (permissão ou contexto inseguro): o
      // protocolo está grande na tela justamente para poder ser copiado à mão.
    }
  }, [protocolo]);

  // O aviso "Copiado" não pode tentar atualizar a tela depois que ela saiu.
  useEffect(() => () => window.clearTimeout(timerCopiaRef.current), []);

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
    setVagaSumiu(vagaAindaAberta ? "" : "rascunho");
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

  /**
   * As três coroas da barra acendem pelo que já está preenchido. É um sinal de
   * andamento, não a validação: quem valida continua sendo `validarPasso`, que o
   * servidor repete. Os limites aqui são deliberadamente frouxos (um nome com
   * duas letras, um telefone com DDD) para a coroa não acender antes da hora.
   */
  const etapas = useMemo<EtapaDaCandidatura[]>(
    () => [
      { rotulo: "Vaga", feita: escolhaFeita && dados.area.length > 0 },
      {
        rotulo: "Contato",
        feita: dados.nome.trim().length > 1 && apenasDigitos(dados.telefone).length >= 10,
      },
      { rotulo: "Currículo", feita: arquivo !== null && dados.consentimentoLgpd },
    ],
    [escolhaFeita, dados.area, dados.nome, dados.telefone, dados.consentimentoLgpd, arquivo],
  );

  return (
    <div className="site candidatura min-h-dvh">
      <Movimento />
      <SkipLink />

      <BarraDeCandidatura etapas={etapas} enviado={enviado} />

      <main id="conteudo">
        {enviado ? (
          <TelaDeSucesso
            protocolo={protocolo}
            copiado={copiado}
            aoCopiar={() => void copiarProtocolo()}
            emailRh={config.emailRh}
          />
        ) : (
          <div className="quadro cand-pagina cand-grade">
            <div className="cand-lateral">
              <h1 className="text-titulo">Envie sua candidatura.</h1>
              <p className="text-pequeno text-tinta-suave">
                O que você preenche fica guardado neste navegador por 12 horas, então dá para parar
                e voltar depois.
              </p>

              <div className="cand-lateral-foto">
                <MolduraCoroa proporcao={1.45}>
                  <img
                    src={consultorioImg}
                    alt="Consultório da JP, com a cadeira odontológica e o armário de apoio"
                    width={1200}
                    height={896}
                    loading="lazy"
                    decoding="async"
                  />
                </MolduraCoroa>
              </div>
            </div>

            <div>
              {rascunho !== null ? (
                <div className="cand-rascunho">
                  <p>
                    Encontramos uma candidatura que você começou neste navegador. Quer continuar de
                    onde parou?
                  </p>
                  <div className="cand-rascunho-acoes">
                    <button type="button" onClick={restaurarRascunho} className="botao botao-tinta">
                      Continuar
                    </button>
                    <button type="button" onClick={descartarRascunho} className="botao botao-chao">
                      <RotateCcw aria-hidden="true" />
                      Começar do zero
                    </button>
                  </div>
                </div>
              ) : null}

              <form
                className="cand-form"
                noValidate
                data-rastreio-proprio
                onSubmit={(e) => {
                  e.preventDefault();
                  void enviar(e.currentTarget);
                }}
              >
                {/* Alerta do topo: erros que não pertencem a um campo. tabIndex
                    -1 para poder receber foco por código sem entrar no Tab. */}
                <div ref={alertaRef} id={idCampo("geral")} tabIndex={-1} className="outline-none">
                  {erroGeral.length > 0 || erroVaga.length > 0 ? (
                    <div role="alert" className="cand-alerta">
                      <CircleAlert aria-hidden="true" />
                      <div>
                        {erroGeral.length > 0 ? <p>{erroGeral}</p> : null}
                        {erroVaga.length > 0 ? <p>{erroVaga}</p> : null}
                      </div>
                    </div>
                  ) : null}

                  {/* Não é erro: é explicação, e por isso role="status" e não
                      role="alert". A vaga saiu do ar entre o momento em que a
                      pessoa escolheu e o momento em que ela voltou. Sem esta
                      linha a vaga sumiria do formulário sem explicação, e a
                      pessoa concluiria que ela mesma errou alguma coisa. */}
                  {vagaSumiu !== "" ? (
                    <div role="status" className="cand-aviso">
                      <CircleAlert aria-hidden="true" />
                      <p>
                        {vagaSumiu === "rascunho"
                          ? "A vaga que você tinha escolhido não está mais recebendo candidaturas. Guardamos tudo o que você já havia preenchido — é só escolher outra vaga ou seguir pelo banco de talentos."
                          : "O link que você abriu leva a uma vaga que não está mais recebendo candidaturas. Escolha uma das vagas abertas abaixo ou envie seu currículo para o banco de talentos."}
                      </p>
                    </div>
                  ) : null}
                </div>

                {/* Só para o leitor de tela: a hierarquia h1 > h2 > h3 dos blocos
                    precisa de um h2, e o título visível já é o H1 da lateral. */}
                <h2 className="sr-only">Formulário de candidatura</h2>

                <section className="cand-bloco" aria-labelledby="cand-bloco-vaga">
                  <h3 id="cand-bloco-vaga">A vaga</h3>
                  <PassoVaga
                    dados={dados}
                    erros={erros}
                    vagas={vagas}
                    aceitandoEspontanea={config.aceitandoEspontanea}
                    mensagemSemVagas={config.mensagemSemVagas}
                    escolhaFeita={escolhaFeita}
                    aoEscolherVaga={escolherVaga}
                    aoAtualizar={atualizar}
                  />
                </section>

                <section className="cand-bloco" aria-labelledby="cand-bloco-contato">
                  <h3 id="cand-bloco-contato">Seu contato</h3>
                  <PassoContato dados={dados} erros={erros} aoAtualizar={atualizar} />
                </section>

                <section className="cand-bloco" aria-labelledby="cand-bloco-curriculo">
                  <h3 id="cand-bloco-curriculo">Seu currículo</h3>
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
                </section>

                <div className="cand-envio">
                  <button type="submit" disabled={enviando} className="botao botao-acento" data-ima>
                    {enviando ? "Enviando..." : "Enviar candidatura"}
                    <Send aria-hidden="true" />
                  </button>
                </div>

                {/* Anúncio discreto do estado do envio para quem não vê o botão. */}
                <p className="sr-only" role="status">
                  {enviando ? "Enviando sua candidatura, aguarde." : ""}
                </p>
              </form>
            </div>
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* A vaga                                                                     */
/* -------------------------------------------------------------------------- */

/** "Área · vínculo · jornada · local · salário", só com o que existe. */
function metaDaVaga(vaga: Vaga): string {
  const vinculo = vaga.vinculo ? rotuloVinculo(vaga.vinculo) : "";
  return [
    rotuloArea(vaga.area),
    vinculo,
    resumoJornada(vaga),
    vaga.local.trim(),
    faixaSalarial(vaga),
  ]
    .filter((parte) => parte.length > 0)
    .join(" · ");
}

function PassoVaga(props: {
  dados: Candidatura;
  erros: ErrosPasso;
  vagas: Vaga[];
  aceitandoEspontanea: boolean;
  mensagemSemVagas: string;
  escolhaFeita: boolean;
  aoEscolherVaga: (vaga: Vaga | null) => void;
  aoAtualizar: (mudanca: Partial<Candidatura>) => void;
}) {
  const { dados, erros } = props;
  const espontaneaEscolhida = props.escolhaFeita && dados.vagaId.length === 0;
  // A área é preenchida sozinha ao escolher uma vaga. Só se pergunta quando a
  // candidatura é espontânea (ou quando o envio foi recusado por falta dela).
  const mostrarArea = espontaneaEscolhida || (erros["area"] ?? "").length > 0;

  return (
    <div className="space-y-8">
      {/* ---- Escolha da vaga ----
          Rádios NATIVOS dentro de <label>: o navegador dá de graça o Tab único
          para o grupo e as setas entre as opções. Botões com role="radio"
          prometiam as setas e não as entregavam (todos ficavam no Tab). */}
      <div>
        <Rotulo campo="vagaId" texto="A que vaga você quer se candidatar?" paraCampo={false} />
        {props.vagas.length === 0 ? (
          <p className="mb-3 text-tinta-suave">{props.mensagemSemVagas}</p>
        ) : null}
        <div role="radiogroup" aria-labelledby="rh-rotulo-vagaId" className="cand-opcoes">
          {props.vagas.map((v, i) => (
            <label key={v.id} className="cand-opcao">
              <input
                id={i === 0 ? idCampo("vagaId") : undefined}
                type="radio"
                name="cand-vaga"
                className="sr-only"
                checked={dados.vagaId === v.id}
                onChange={() => props.aoEscolherVaga(v)}
              />
              <MarcaCoroa />
              <span>
                <span className="cand-opcao-titulo">{v.titulo}</span>
                <span className="cand-opcao-meta">{metaDaVaga(v)}</span>
              </span>
            </label>
          ))}

          {props.aceitandoEspontanea ? (
            <label className="cand-opcao">
              <input
                id={props.vagas.length === 0 ? idCampo("vagaId") : undefined}
                type="radio"
                name="cand-vaga"
                className="sr-only"
                checked={espontaneaEscolhida}
                onChange={() => props.aoEscolherVaga(null)}
              />
              <MarcaCoroa />
              <span>
                <span className="cand-opcao-titulo">Candidatura espontânea</span>
                <span className="cand-opcao-meta">
                  Seu currículo fica no banco de talentos. Quando abrir uma vaga do seu perfil, a
                  gente chama você primeiro.
                </span>
              </span>
            </label>
          ) : null}
        </div>
      </div>

      {/* ---- Área (só na candidatura espontânea) ---- */}
      {mostrarArea ? (
        <div>
          <Rotulo campo="area" texto="Em que área você atua?" paraCampo={false} />
          <div
            role="radiogroup"
            aria-labelledby="rh-rotulo-area"
            aria-describedby={(erros["area"] ?? "").length > 0 ? "rh-erro-area" : undefined}
            className="cand-areas"
          >
            {AREAS.map((a, i) => (
              <label key={a.valor} className="cand-area">
                <input
                  id={i === 0 ? idCampo("area") : undefined}
                  type="radio"
                  name="cand-area"
                  className="sr-only"
                  checked={dados.area === a.valor}
                  onChange={() => props.aoAtualizar({ area: a.valor })}
                />
                <Check aria-hidden="true" />
                {a.rotulo}
              </label>
            ))}
          </div>
          <MensagemErro campo="area" texto={erros["area"] ?? ""} />
        </div>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Contato — nome, telefone e e-mail                                          */
/* -------------------------------------------------------------------------- */

/**
 * Nome, WhatsApp e e-mail. Só.
 *
 * Antes este passo pedia também nascimento, CPF, CEP, logradouro, bairro,
 * cidade, UF, LinkedIn e Instagram — nove campos que estão no currículo e que a
 * leitura por IA extrai sozinha (ver `preencherComExtracao`, em
 * servidor/analise.ts). Pedir de novo era cobrar da candidata um trabalho que o
 * sistema faz.
 *
 * Os três que ficaram não são arbitrários:
 *
 * - **nome** aparece na lista do painel no segundo em que a candidatura chega.
 *   Sem ele o RH veria uma fila de "sem nome" até alguém gastar a leitura.
 * - **WhatsApp** é por onde a clínica chama. Telefone lido errado num currículo
 *   escaneado falha calado: a pessoa nunca é chamada e ninguém descobre por quê.
 *   É o único dado que não pode depender de OCR.
 * - **e-mail** é opcional. Quase todo currículo traz, a leitura preenche, e
 *   quem preferir digitar, digita.
 */
function PassoContato(props: {
  dados: Candidatura;
  erros: ErrosPasso;
  aoAtualizar: (mudanca: Partial<Candidatura>) => void;
}) {
  const { dados, erros } = props;

  return (
    <div className="space-y-6">
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

      <div className="cand-grade-campos">
        <CampoTexto
          campo="telefone"
          rotulo="WhatsApp"
          valor={mascararTelefone(dados.telefone)}
          aoMudar={(v) => props.aoAtualizar({ telefone: apenasDigitos(v) })}
          erro={erros["telefone"]}
          placeholder="(11) 90000-0000"
          inputMode="tel"
          autoComplete="tel"
          ajuda="É por aqui que a clínica chama para conversar."
        />
        <CampoTexto
          campo="email"
          rotulo="E-mail"
          valor={dados.email}
          aoMudar={(v) => props.aoAtualizar({ email: v.trim() })}
          erro={erros["email"]}
          placeholder="voce@email.com"
          inputMode="email"
          autoComplete="email"
          maxLength={254}
          opcional
        />
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Currículo e envio                                                          */
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

  // O e-mail do RH pode não estar configurado ainda; sem ele, o canal de
  // contato para exercer os direitos da LGPD passa a ser o WhatsApp da clínica.
  const canalLgpd =
    props.emailRh.trim().length > 0
      ? `pelo e-mail ${props.emailRh.trim()}`
      : `pelo WhatsApp ${CLINICA.whatsapp}`;

  return (
    <div className="space-y-6">
      <AreaUpload
        campo="curriculo"
        arquivo={props.arquivo}
        aoEscolher={props.aoEscolherArquivo}
        erro={props.erroArquivo.length > 0 ? props.erroArquivo : (erros["curriculo"] ?? "")}
        aoErrar={props.aoErrarArquivo}
      />

      {/* ATENÇÃO ao editar o texto deste aviso: ele é o consentimento em si, e
          a redação vigente fica gravada em cada candidatura
          (`Candidatura.consentimentoVersao`). Mudou uma vírgula do que a pessoa
          autoriza? Suba `VERSAO_CONSENTIMENTO_LGPD` em `src/lib/rh/tipos.ts`,
          senão as fichas novas apontam para uma redação que ninguém leu. E o
          prazo citado aqui é o mesmo `MESES_RETENCAO_LGPD` que o painel usa
          para marcar ficha vencida — os dois números andam juntos. */}
      <div className="cand-consent">
        <label>
          <input
            id={idCampo("consentimentoLgpd")}
            type="checkbox"
            checked={dados.consentimentoLgpd}
            onChange={(e) => props.aoAtualizar({ consentimentoLgpd: e.target.checked })}
            aria-invalid={(erros["consentimentoLgpd"] ?? "").length > 0}
            aria-describedby="rh-ajuda-consentimentoLgpd"
            className="h-6 w-6 shrink-0 accent-tinta"
          />
          <span>
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
