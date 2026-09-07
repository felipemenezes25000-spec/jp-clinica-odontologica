import { createFileRoute, notFound } from "@tanstack/react-router";
import {
  ArrowLeft,
  ArrowUpRight,
  BadgeCheck,
  Briefcase,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock3,
  Gift,
  ListChecks,
  MapPin,
  Send,
  ShieldCheck,
  Sparkles,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { useId, useState } from "react";

import { CapaVaga, capaDaArea } from "@/components/site/CapaVaga";
import { CartaoVaga } from "@/components/rh/CartaoVaga";
import { Footer } from "@/components/site/Footer";
import { Header } from "@/components/site/Header";
import { Reveal } from "@/components/site/Reveal";
import { SkipLink } from "@/components/site/SkipLink";
import { CLINICA, SITE_URL } from "@/lib/jp";
import { obterVagaPublica } from "@/lib/rh/api-portal";
import { formatarData } from "@/lib/rh/formatar";
import { AREAS, MODELOS_TRABALHO, TURNOS, VINCULOS, resumirDisponibilidade } from "@/lib/rh/opcoes";
import type { ConfiguracoesRh, Vaga } from "@/lib/rh/tipos";
import { faixaSalarial, resumoJornada } from "@/lib/rh/vagas";

/* -------------------------------------------------------------------------- */
/* Leitura do domínio                                                         */
/* -------------------------------------------------------------------------- */

function rotuloArea(vaga: Vaga): string {
  return AREAS.find((a) => a.valor === vaga.area)?.rotulo ?? "Equipe JP";
}

function rotuloVinculo(vaga: Vaga): string {
  return VINCULOS.find((v) => v.valor === vaga.vinculo)?.rotulo ?? "A combinar";
}

function rotuloModelo(vaga: Vaga): string {
  return MODELOS_TRABALHO.find((m) => m.valor === vaga.modelo)?.rotulo ?? "Presencial";
}

/** Endereço de trabalho: o que o RH escreveu na vaga ou, na falta, o da clínica. */
function localDaVaga(vaga: Vaga): string {
  const proprio = vaga.local.trim();
  return proprio.length > 0 ? proprio : CLINICA.endereco;
}

/**
 * Benefícios da vaga com fallback para os do portal.
 *
 * A lista da vaga vence quando existe (pode ter um item específico daquela
 * função), e a lista padrão das configurações entra quando o RH não digitou
 * nada — sem isso, a coluna lateral abriria um bloco vazio justamente no
 * argumento que mais pesa na decisão de quem lê o anúncio.
 */
function beneficiosDaVaga(vaga: Vaga, config: ConfiguracoesRh): string[] {
  if (vaga.beneficios.length > 0) return vaga.beneficios;
  // O fallback só entra em vaga CLT: a lista padrão do portal é escrita em
  // verbas trabalhistas ("registro em carteira", vale-transporte), e herdá-la
  // numa vaga PJ, de estágio ou de diarista publicaria — na página e no
  // `jobBenefits` do JSON-LD — uma promessa que aquele contrato não sustenta.
  // Em vaga não-CLT o bloco some até o RH digitar os benefícios de verdade.
  return vaga.vinculo === "clt" ? config.beneficiosPadrao : [];
}

/**
 * Texto corrido -> parágrafos. Quebra em linha em branco em vez de renderizar
 * HTML: a descrição é digitada no painel e vai direto do disco para a tela,
 * então `dangerouslySetInnerHTML` aqui seria XSS com passo a passo.
 */
function paragrafos(texto: string): string[] {
  return texto
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

function cortar(texto: string, limite: number): string {
  const limpo = texto.replace(/\s+/g, " ").trim();
  if (limpo.length <= limite) return limpo;
  return `${limpo.slice(0, limite - 1).trimEnd()}…`;
}

/* -------------------------------------------------------------------------- */
/* JSON-LD (JobPosting)                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Vínculo da clínica -> vocabulário do schema.org. É `Record<string, string>` e
 * não `Record<Vinculo, string>` de propósito: `vinculo` pode chegar vazio de um
 * registro antigo, e o acesso indexado devolvendo `undefined` obriga o fallback
 * explícito em vez de deixar a chave sumir do JSON.
 */
const EMPREGO_SCHEMA: Record<string, string> = {
  clt: "FULL_TIME",
  pj: "CONTRACTOR",
  // Mesmo CONTRACTOR do PJ: o schema.org não separa PJ de autônomo, e é essa a
  // categoria que o Google for Jobs entende por "prestação de serviço".
  prestador: "CONTRACTOR",
  estagio: "INTERN",
  // "Freelancer / diarista": PER_DIEM é literalmente o pagamento por dia
  // trabalhado, que é o formato de quem cobre férias e faltas na clínica.
  freelancer: "PER_DIEM",
  indiferente: "OTHER",
};

/** "R$ 3.500,00" -> 3500. Devolve null quando não sobra número nenhum. */
function valorNumerico(texto: string): number | null {
  const bruto = texto
    .replace(/[^\d.,]/g, "")
    .replace(/\./g, "")
    .replace(",", ".");
  if (bruto.length === 0) return null;
  const n = Number(bruto);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function salarioSchema(vaga: Vaga): Record<string, unknown> | null {
  // Com o salário oculto no anúncio, nada de baseSalary: publicar no JSON-LD o
  // que a clínica escolheu não mostrar entregaria o número no resultado de busca.
  if (!vaga.mostrarSalario) return null;

  const min = valorNumerico(vaga.salarioMin);
  const max = valorNumerico(vaga.salarioMax);
  if (min === null && max === null) return null;

  // unitText "MONTH": o editor do painel pede o salário da vaga, que em clínica
  // é sempre mensal — não há campo de hora nem de dia.
  const valor: Record<string, unknown> = { "@type": "QuantitativeValue", unitText: "MONTH" };
  if (min !== null) valor["minValue"] = min;
  if (max !== null) valor["maxValue"] = max;

  return { "@type": "MonetaryAmount", currency: "BRL", value: valor };
}

/**
 * Descrição completa para o buscador. O Google pede a descrição inteira em
 * `description` — resumo sozinho derruba a vaga do Google Empregos —, então as
 * listas entram como texto, na mesma ordem em que aparecem na página.
 */
function descricaoSchema(vaga: Vaga): string {
  const partes: string[] = [];
  const resumo = vaga.resumo.trim();
  const descricao = vaga.descricao.trim();
  if (resumo.length > 0) partes.push(resumo);
  if (descricao.length > 0) partes.push(descricao);

  const secoes: [string, string[]][] = [
    ["Responsabilidades", vaga.responsabilidades],
    ["Requisitos", vaga.requisitos],
    ["Diferenciais", vaga.diferenciais],
  ];
  for (const [titulo, itens] of secoes) {
    if (itens.length === 0) continue;
    partes.push(`${titulo}:\n${itens.map((i) => `- ${i}`).join("\n")}`);
  }

  return partes.join("\n\n");
}

/**
 * JSON-LD do anúncio.
 *
 * Montado chave a chave, com `if` antes de cada campo opcional, porque um
 * `"validThrough": undefined` no meio do bloco invalida o rich result inteiro —
 * e com `exactOptionalPropertyTypes` a alternativa (espalhar `...(x && {})`)
 * ficaria menos legível do que a atribuição condicional.
 */
function jsonLdVaga(vaga: Vaga, config: ConfiguracoesRh, url: string): string {
  const e = CLINICA.local;
  const dados: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "JobPosting",
    title: vaga.titulo,
    description: descricaoSchema(vaga),
    identifier: { "@type": "PropertyValue", name: CLINICA.nome, value: vaga.slug },
    employmentType: EMPREGO_SCHEMA[vaga.vinculo] ?? "OTHER",
    hiringOrganization: {
      "@type": "Organization",
      name: CLINICA.nome,
      sameAs: SITE_URL,
      logo: `${SITE_URL}/og.png`,
    },
    jobLocation: {
      "@type": "Place",
      address: {
        "@type": "PostalAddress",
        // PostalAddress não tem campo de bairro: ele entra no logradouro, que é
        // como o endereço é escrito e lido por aqui.
        streetAddress: `${e.logradouro} — ${e.bairro}`,
        addressLocality: e.cidade,
        addressRegion: e.uf,
        postalCode: e.cep,
        addressCountry: e.pais,
      },
    },
    totalJobOpenings: vaga.quantidade,
    url,
    // A candidatura acontece no próprio site, no formulário de /trabalhe-conosco.
    directApply: true,
  };

  // Sem data de publicação o Google descarta o anúncio; `criadoEm` cobre a vaga
  // que por algum motivo ficou sem o carimbo de publicação.
  const publicado = vaga.publicadoEm.trim() || vaga.criadoEm.trim();
  if (publicado.length > 0) dados["datePosted"] = publicado;

  // 23:59 de Brasília porque `vagaAberta` trata o prazo como inclusivo: no dia
  // do encerramento a vaga ainda recebe candidatura.
  const prazo = vaga.encerraEm.trim();
  if (prazo.length > 0) dados["validThrough"] = `${prazo}T23:59:59-03:00`;

  if (vaga.modelo === "remoto") dados["jobLocationType"] = "TELECOMMUTE";

  const salario = salarioSchema(vaga);
  if (salario !== null) dados["baseSalary"] = salario;

  const beneficios = beneficiosDaVaga(vaga, config);
  if (beneficios.length > 0) dados["jobBenefits"] = beneficios.join(", ");

  return JSON.stringify(dados);
}

/* -------------------------------------------------------------------------- */
/* Rota                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * O que o loader entrega para a tela. Escrito à mão porque a inferência através
 * do server function + `notFound()` chega no componente como `any` — e aí todo
 * `.map()` de dentro da página perderia o tipo do item (e cairia no
 * `noImplicitAny`). Com o alias, `vaga` já vem sem o `null` que a API permite.
 */
type DadosVaga = {
  vaga: Vaga;
  config: ConfiguracoesRh;
  relacionadas: Vaga[];
  /** Instante do servidor, carimbado no loader — ver o comentário lá embaixo. */
  agoraIso: string;
};

export const Route = createFileRoute("/carreiras/$slug")({
  /**
   * Vaga inexistente, em rascunho, pausada ou vencida vira 404 de verdade, e não
   * uma página de aviso com HTTP 200: o "soft 404" faz o buscador manter no
   * índice um anúncio que já não existe — e quem clica no resultado se candidata
   * ao vazio. Como o `notFound()` sai daqui, `vaga` desce para a tela sem `null`.
   */
  loader: async ({ params }): Promise<DadosVaga> => {
    // Slug que se resume a espaço (o NBSP de link colado do Word ou do WhatsApp
    // sobrevive à normalização do roteador) não é vaga nenhuma. Sem este corte,
    // o validador do server function lança "Vaga não informada." e a URL responde
    // 500 com a mensagem interna, em vez do 404 que o buscador precisa ver.
    if (params.slug.trim().length === 0) throw notFound();

    const dados = await obterVagaPublica({ data: { slug: params.slug } });
    if (dados.vaga === null) throw notFound();

    // `agoraIso` sai do servidor junto com a vaga (é `obterVagaPublica` quem o
    // carimba): os cartões de vagas relacionadas imprimem "Publicada há X" no
    // HTML do SSR, e um `new Date()` no componente seria refeito com o relógio
    // do aparelho na hidratação — texto diferente do servido, que faz o React
    // descartar o HTML do SSR.
    return { ...dados, vaga: dados.vaga };
  },

  // `| undefined` explícito por causa do exactOptionalPropertyTypes: o contexto
  // que o roteador passa declara a chave sempre presente, podendo ser undefined.
  head: ({ loaderData }: { loaderData?: DadosVaga | undefined }) => {
    // O head também roda quando ainda não há dados (navegação em curso, ou o
    // loader lançou 404): sem o guarda, a tela de erro herdaria as metatags da
    // vaga anterior.
    if (!loaderData) return {};
    const { vaga, config } = loaderData;

    const url = `${SITE_URL}/carreiras/${vaga.slug}`;
    const title = `${vaga.titulo} — Trabalhe na JP | ${CLINICA.nome}`;
    const description = cortar(
      `${vaga.resumo} Vaga ${rotuloVinculo(vaga).toLowerCase()}, ${rotuloModelo(
        vaga,
      ).toLowerCase()}, em ${CLINICA.local.bairro}, ${CLINICA.local.cidade}.`,
      158,
    );
    const imagem = `${SITE_URL}/og.png`;

    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:url", content: url },
        { property: "og:type", content: "article" },
        { property: "og:locale", content: "pt_BR" },
        { property: "og:image", content: imagem },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:title", content: title },
        { name: "twitter:description", content: description },
        { name: "twitter:image", content: imagem },
      ],
      links: [{ rel: "canonical", href: url }],
      // JSON-LD no HTML servido, e não depois da hidratação: o rastreador do
      // Google Empregos lê o documento inicial, sem rodar JS.
      scripts: [{ type: "application/ld+json", children: jsonLdVaga(vaga, config, url) }],
    };
  },

  component: PaginaVaga,
  notFoundComponent: VagaNaoEncontrada,
});

/* -------------------------------------------------------------------------- */
/* Peças da página                                                            */
/* -------------------------------------------------------------------------- */

function Pilula({ icone: Icone, children }: { icone: LucideIcon; children: string }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-3.5 py-2 text-xs font-bold text-white">
      <Icone aria-hidden="true" className="h-4 w-4 text-lime" />
      {children}
    </span>
  );
}

/** Um dado objetivo do hero (remuneração, jornada, posições, prazo). */
function DadoHero({
  icone: Icone,
  rotulo,
  valor,
}: {
  icone: LucideIcon;
  rotulo: string;
  valor: string;
}) {
  return (
    <li className="rh-kpi">
      <span className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[.16em] text-white">
        <Icone aria-hidden="true" className="h-4 w-4" />
        {rotulo}
      </span>
      <span className="font-display text-lg font-extrabold leading-tight text-white sm:text-xl">
        {valor}
      </span>
    </li>
  );
}

/**
 * Quantos itens aparecem antes de o bloco oferecer "ver todos".
 *
 * Oito porque é o que cabe em quatro linhas de duas colunas sem empurrar a
 * seção seguinte para fora da tela. Vagas cadastradas com muito item — esta
 * aqui tem 19 responsabilidades — deixavam a página com scroll de quilômetro:
 * eram 38 cartões de UMA LINHA cada, empilhados.
 *
 * O corte é só de APRESENTAÇÃO. Nada é descartado: os itens escondidos
 * continuam no HTML (via atributo `hidden`, não removidos da árvore) e o
 * JSON-LD do anúncio leva a lista inteira de qualquer jeito, que é o que o
 * Google for Jobs lê. O painel segue cadastrando quantos itens quiser.
 */
const ITENS_VISIVEIS = 8;

/** Bloco de lista da coluna larga. Some inteiro quando a lista está vazia. */
function BlocoLista({
  titulo,
  apoio,
  icone: Icone,
  itens,
  atraso,
  rotuloVerTodos,
}: {
  titulo: string;
  apoio: string;
  icone: LucideIcon;
  itens: string[];
  atraso: number;
  rotuloVerTodos: string;
}) {
  const [expandido, setExpandido] = useState(false);
  const idLista = useId();

  if (itens.length === 0) return null;

  const excedente = itens.length - ITENS_VISIVEIS;

  return (
    <Reveal delay={atraso} className="mt-10">
      <h2 className="flex items-center gap-3 font-display text-[clamp(1.45rem,3vw,1.9rem)] font-extrabold leading-tight tracking-[-.03em] text-forest-2">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-mint text-forest">
          <Icone aria-hidden="true" className="h-[1.15rem] w-[1.15rem]" />
        </span>
        {titulo}
      </h2>
      <p className="mt-2 text-sm font-semibold text-ink-soft">{apoio}</p>

      {/* Duas colunas a partir de `sm`: cada item é uma frase curta, e uma
          frase curta ocupando a largura inteira desperdiça metade da linha.
          No celular fica em coluna única, sem estouro horizontal. */}
      <ul id={idLista} className="mt-4 grid gap-2.5 sm:grid-cols-2">
        {itens.map((item, i) => (
          <li
            key={`${i}-${item.slice(0, 24)}`}
            /* `hidden` em vez de não renderizar: o item continua no HTML
               servido, some da árvore de acessibilidade enquanto está
               recolhido, e volta sem custo de re-render ao expandir. */
            hidden={!expandido && i >= ITENS_VISIVEIS}
            className="flex items-start gap-2.5 rounded-xl border border-border-soft bg-paper px-3.5 py-3 text-[0.95rem] leading-snug text-ink"
          >
            <CheckCircle2 aria-hidden="true" className="mt-[3px] h-4 w-4 shrink-0 text-forest" />
            <span>{item}</span>
          </li>
        ))}
      </ul>

      {excedente > 0 && (
        <button
          type="button"
          onClick={() => setExpandido((v) => !v)}
          aria-expanded={expandido}
          aria-controls={idLista}
          className="mt-3 inline-flex min-h-11 items-center gap-1.5 rounded-full border border-forest/25 bg-white px-4 text-sm font-bold text-ink transition hover:border-forest hover:bg-mint"
        >
          {expandido ? "Mostrar menos" : `${rotuloVerTodos} (+${excedente})`}
          <ChevronDown
            aria-hidden="true"
            className={`h-4 w-4 transition-transform ${expandido ? "rotate-180" : ""}`}
          />
        </button>
      )}
    </Reveal>
  );
}

/** Linha do resumo lateral. Valor vazio nunca chega aqui — quem chama filtra. */
function LinhaResumo({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-border-soft py-3 last:border-b-0">
      <dt className="text-[11px] font-black uppercase tracking-[.14em] text-ink-soft">{rotulo}</dt>
      <dd className="text-sm font-bold leading-snug text-ink">{valor}</dd>
    </div>
  );
}

function PaginaVaga() {
  const { vaga, config, relacionadas, agoraIso }: DadosVaga = Route.useLoaderData();

  /**
   * "Agora" nasce uma vez, no primeiro render, a partir do instante carimbado
   * pelo loader, e desce por prop para os cartões de vagas relacionadas. Medir o
   * tempo aqui — mesmo uma vez só — faria servidor e navegador escreverem textos
   * diferentes ("há 2 dias" vs. "ontem") e a hidratação quebraria.
   */
  const [agora] = useState(() => new Date(agoraIso));

  const salario = faixaSalarial(vaga);
  const jornada = resumoJornada(vaga);
  const prazo = formatarData(vaga.encerraEm);
  const publicadoEm = formatarData(vaga.publicadoEm || vaga.criadoEm);
  const local = localDaVaga(vaga);
  const beneficios = beneficiosDaVaga(vaga, config);
  /* Área sem foto cadastrada mantém o hero liso de antes — o layout não pode
     depender de uma imagem que pode não existir. */
  const temCapa = capaDaArea(vaga.area) !== null;
  /* Agrupado, e não uma pastilha por dia+turno: "segunda a sexta, manhã e
     tarde" virava DEZ pastilhas repetindo o nome do dia, e ninguém lê isso. */
  const turnos = resumirDisponibilidade(vaga.turnos);
  const posicoes = `${vaga.quantidade} ${vaga.quantidade === 1 ? "posição" : "posições"}`;
  const blocos = paragrafos(vaga.descricao);

  // encodeURIComponent por precaução: o slug hoje só tem [a-z0-9-], mas o link é
  // montado com um valor vindo do disco e blindar não custa nada.
  const linkCandidatura = `/trabalhe-conosco?vaga=${encodeURIComponent(vaga.slug)}`;

  return (
    <div className="min-h-dvh bg-cream">
      <SkipLink />
      <Header />

      <main id="conteudo">
        {/* HERO */}
        <section className="section-deep noise relative isolate overflow-hidden pb-10 pt-8 text-white sm:pb-12 sm:pt-9">
          <CapaVaga area={vaga.area} />
          {/* `lg:pr-[38%]` só existe quando há capa: sem ela o conteúdo usa a
              largura inteira, como sempre usou. Com ela, o texto para antes da
              parte em que a foto realmente aparece — o trecho que ele invade já
              é verde sólido pelo véu, então a leitura não perde contraste. */}
          <div className={`jp-container relative z-10${temCapa ? " lg:pr-[40%]" : ""}`}>
            <nav aria-label="Trilha de navegação">
              <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-bold text-white/85">
                <li>
                  <a href="/" className="transition-colors hover:text-white">
                    Início
                  </a>
                </li>
                <li aria-hidden="true" className="flex items-center">
                  <ChevronRight className="h-3.5 w-3.5" />
                </li>
                <li>
                  <a href="/carreiras" className="transition-colors hover:text-white">
                    Carreiras
                  </a>
                </li>
                <li aria-hidden="true" className="flex items-center">
                  <ChevronRight className="h-3.5 w-3.5" />
                </li>
                <li aria-current="page" className="text-white">
                  {vaga.titulo}
                </li>
              </ol>
            </nav>

            <Reveal className="mt-7 max-w-4xl">
              <p className="eyebrow text-white">
                <span aria-hidden="true" className="h-2 w-2 rounded-full bg-lime" />
                Vaga aberta · {rotuloArea(vaga)}
              </p>
              <h1 className="mt-5 font-display text-[clamp(2rem,4.6vw,3.4rem)] font-extrabold leading-[.95] tracking-[-.045em] [overflow-wrap:anywhere]">
                {vaga.titulo}
              </h1>
              {vaga.resumo.trim().length > 0 && (
                <p className="mt-4 max-w-xl text-base font-medium leading-relaxed text-white/85">
                  {vaga.resumo}
                </p>
              )}

              <div className="mt-7 flex flex-wrap gap-2.5">
                <Pilula icone={Briefcase}>{rotuloArea(vaga)}</Pilula>
                <Pilula icone={BadgeCheck}>{rotuloVinculo(vaga)}</Pilula>
                <Pilula icone={Sparkles}>{rotuloModelo(vaga)}</Pilula>
                <Pilula icone={MapPin}>{local}</Pilula>
              </div>
            </Reveal>

            <Reveal delay={90}>
              <ul className={`mt-7 grid gap-3 sm:grid-cols-2${temCapa ? "" : " lg:grid-cols-4"}`}>
                {/* `faixaSalarial` devolve vazio quando o RH escolheu não divulgar:
                    a linha continua na barra, mas dizendo o que é verdade. */}
                <DadoHero
                  icone={Wallet}
                  rotulo="Remuneração"
                  valor={salario.length > 0 ? salario : "A combinar"}
                />
                <DadoHero
                  icone={Clock3}
                  rotulo="Jornada"
                  valor={vaga.jornada.trim().length > 0 ? vaga.jornada : rotuloModelo(vaga)}
                />
                <DadoHero icone={Users} rotulo="Vagas" valor={posicoes} />
                <DadoHero
                  icone={CalendarClock}
                  rotulo="Inscrições"
                  valor={prazo.length > 0 ? `Até ${prazo}` : "Sem prazo definido"}
                />
              </ul>
            </Reveal>

            <Reveal delay={150}>
              <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center">
                <a href={linkCandidatura} className="button-primary">
                  <Send aria-hidden="true" className="h-5 w-5" /> Quero me candidatar
                  <ArrowUpRight aria-hidden="true" className="h-4 w-4" />
                </a>
                <a href="/carreiras" className="button-ghost-light">
                  <ArrowLeft aria-hidden="true" className="h-4 w-4" /> Ver todas as vagas
                </a>
              </div>
              {publicadoEm.length > 0 && (
                <p className="mt-5 text-xs font-semibold text-white/85">
                  Publicada em {publicadoEm}
                </p>
              )}
            </Reveal>
          </div>
        </section>

        {/* CORPO */}
        <section className="jp-section bg-cream">
          <div className="jp-container mx-auto grid max-w-[1280px] gap-8 lg:grid-cols-[1.6fr_.9fr] lg:items-start lg:gap-12">
            {/* Coluna larga. `order` só existe por causa do celular: ali o
                resumo da vaga e o botão precisam vir ANTES do texto longo —
                quem abre o anúncio no telefone decide pelo essencial (local,
                jornada, benefícios) muito antes de ler as responsabilidades.
                No desktop a ordem volta ao natural, com o cartão à direita. */}
            <div className="order-2 lg:order-1">
              {blocos.length > 0 && (
                <Reveal>
                  <h2 className="font-display text-[clamp(1.6rem,3.4vw,2.1rem)] font-extrabold leading-tight tracking-[-.04em] text-forest-2">
                    Sobre a vaga
                  </h2>
                  <div className="mt-4 grid gap-4 text-base leading-relaxed text-ink">
                    {/* A posição entra na `key` porque dois parágrafos podem
                        começar igual (texto de RH repete abertura), e duas keys
                        iguais fazem a reconciliação descartar um deles no
                        primeiro re-render — que acontece, via `Reveal`. A lista
                        nunca é reordenada nem filtrada, então o índice é
                        identidade estável aqui. */}
                    {blocos.map((p, i) => (
                      <p key={`${i}-${p.slice(0, 24)}`}>{p}</p>
                    ))}
                  </div>
                </Reveal>
              )}

              <BlocoLista
                titulo="O que você vai fazer"
                apoio="A rotina da função, do jeito que ela acontece na clínica."
                icone={ListChecks}
                itens={vaga.responsabilidades}
                atraso={60}
                rotuloVerTodos="Ver todas as responsabilidades"
              />
              <BlocoLista
                titulo="O que precisamos"
                apoio="Requisitos que a equipe considera indispensáveis para começar."
                icone={BadgeCheck}
                itens={vaga.requisitos}
                atraso={90}
                rotuloVerTodos="Ver todos os requisitos"
              />
              <BlocoLista
                titulo="O que conta pontos"
                apoio="Nada aqui é obrigatório — são diferenciais que pesam na escolha."
                icone={Sparkles}
                itens={vaga.diferenciais}
                atraso={120}
                rotuloVerTodos="Ver todos os diferenciais"
              />

              {vaga.especialidades.length > 0 && (
                <Reveal delay={150} className="mt-10">
                  <h2 className="font-display text-[clamp(1.45rem,3vw,1.9rem)] font-extrabold leading-tight tracking-[-.03em] text-forest-2">
                    Especialidades envolvidas
                  </h2>
                  <ul className="mt-4 flex flex-wrap gap-2">
                    {vaga.especialidades.map((esp) => (
                      <li
                        key={esp}
                        className="rounded-full bg-mint px-4 py-2 text-sm font-bold text-ink ring-1 ring-forest/15"
                      >
                        {esp}
                      </li>
                    ))}
                  </ul>
                </Reveal>
              )}

              {/* Fecho da leitura. Quem chegou até aqui leu tudo e não deveria
                  ter de rolar de volta ao topo (ou caçar a barra do celular)
                  para se candidatar. Horizontal no desktop, coluna no telefone. */}
              <Reveal delay={160} className="mt-10">
                <div className="flex flex-col gap-5 rounded-[1.4rem] bg-forest p-6 sm:flex-row sm:items-center sm:justify-between sm:p-7">
                  <div>
                    <p className="font-display text-xl font-extrabold leading-tight text-white sm:text-2xl">
                      Gostou da oportunidade?
                    </p>
                    <p className="mt-1.5 text-sm font-semibold leading-relaxed text-white">
                      Envie sua candidatura e venha fazer parte da nossa equipe.
                    </p>
                  </div>
                  {/* Botão branco sobre o verde: fundo verde leva letra branca,
                      e um botão verde dentro de um bloco verde sumiria. */}
                  <a
                    href={linkCandidatura}
                    className="inline-flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-full bg-white px-6 text-sm font-extrabold text-forest-2 transition hover:bg-mint"
                  >
                    <Send aria-hidden="true" className="h-5 w-5" /> Quero me candidatar
                  </a>
                </div>
              </Reveal>

              <Reveal delay={170}>
                <p className="mt-8 flex items-start gap-3 rounded-2xl border border-border-soft bg-paper p-5 text-sm font-semibold leading-relaxed text-ink-soft">
                  <ShieldCheck aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-forest" />
                  <span>
                    Todo o processo seletivo da {CLINICA.nome} é gratuito. Nunca pedimos depósito,
                    taxa de cadastro ou compra de material em nenhuma etapa.
                  </span>
                </p>
              </Reveal>
            </div>

            {/* Coluna estreita, grudenta a partir do desktop. `top-28` porque o
                cabeçalho do site é sticky e ficaria por cima do cartão. */}
            <Reveal delay={80} className="order-1 lg:order-2 lg:sticky lg:top-28">
              <div className="jp-soft-card rounded-[1.6rem] p-6 sm:p-7">
                <h2 className="font-display text-2xl font-black leading-tight text-forest-2">
                  Resumo da vaga
                </h2>

                <dl className="mt-5">
                  <LinhaResumo rotulo="Área" valor={rotuloArea(vaga)} />
                  <LinhaResumo rotulo="Vínculo" valor={rotuloVinculo(vaga)} />
                  <LinhaResumo rotulo="Modelo" valor={rotuloModelo(vaga)} />
                  <LinhaResumo rotulo="Local" valor={local} />
                  {jornada.length > 0 && <LinhaResumo rotulo="Jornada" valor={jornada} />}
                  {salario.length > 0 && <LinhaResumo rotulo="Remuneração" valor={salario} />}
                  <LinhaResumo rotulo="Posições" valor={posicoes} />
                  {prazo.length > 0 && <LinhaResumo rotulo="Inscrições até" valor={prazo} />}
                </dl>

                {turnos.length > 0 && (
                  <div className="mt-6">
                    <h3 className="text-[11px] font-black uppercase tracking-[.14em] text-ink-soft">
                      Turnos
                    </h3>
                    <ul className="mt-3 flex flex-wrap gap-2">
                      {turnos.map((t) => (
                        <li
                          key={t}
                          className="rounded-full bg-cream px-3 py-1.5 text-xs font-bold text-ink ring-1 ring-border-soft"
                        >
                          {t}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {beneficios.length > 0 && (
                  <div className="mt-7 border-t border-border-soft pt-6">
                    <h3 className="flex items-center gap-2 font-display text-lg font-extrabold text-forest-2">
                      <Gift aria-hidden="true" className="h-5 w-5 text-forest" />
                      Benefícios
                    </h3>
                    <ul className="mt-4 grid gap-2.5">
                      {beneficios.map((b) => (
                        <li
                          key={b}
                          className="flex items-start gap-2.5 text-sm leading-snug text-ink"
                        >
                          <CheckCircle2
                            aria-hidden="true"
                            className="mt-0.5 h-4 w-4 shrink-0 text-forest"
                          />
                          <span>{b}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <a href={linkCandidatura} className="button-primary mt-7 w-full">
                  <Send aria-hidden="true" className="h-5 w-5" /> Quero me candidatar
                </a>

                {(config.emailRh.trim().length > 0 || config.whatsappRh.trim().length > 0) && (
                  <p className="mt-4 text-center text-xs font-semibold leading-relaxed text-ink-soft">
                    Dúvidas sobre a vaga?{" "}
                    {config.whatsappRh.trim().length > 0
                      ? `Fale com o RH: ${config.whatsappRh}`
                      : `Escreva para ${config.emailRh}`}
                  </p>
                )}
              </div>
            </Reveal>
          </div>
        </section>

        {/* OUTRAS VAGAS */}
        {relacionadas.length > 0 && (
          <section className="jp-section bg-paper">
            <div className="jp-container">
              <Reveal className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
                <div>
                  <span className="eyebrow text-ink">Continue olhando</span>
                  <h2 className="mt-4 font-display text-[clamp(2rem,4.4vw,3.4rem)] font-extrabold leading-[.9] tracking-[-.05em] text-forest-2">
                    Outras vagas abertas.
                  </h2>
                </div>
                <a href="/carreiras" className="button-dark shrink-0">
                  Ver todas <ArrowUpRight aria-hidden="true" className="h-4 w-4" />
                </a>
              </Reveal>

              <ul className="mt-9 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {relacionadas.map((outra) => (
                  <li key={outra.id}>
                    <CartaoVaga vaga={outra} agora={agora} />
                  </li>
                ))}
              </ul>
            </div>
          </section>
        )}

        {/* Compensa a altura da barra fixa do celular, para o rodapé não terminar
            escondido atrás dela. */}
        <div aria-hidden="true" className="h-24 lg:hidden" />
      </main>

      <Footer />

      {/* Barra fixa só no celular: no desktop o cartão grudento já mantém o botão
          à vista o tempo todo. O respiro de baixo vem de .mobile-sticky-cta, que
          soma o env(safe-area-inset-bottom) do iPhone à altura do botão. */}
      <div className="mobile-sticky-cta fixed inset-x-0 bottom-0 z-[80] border-t border-lime/25 bg-brand-deep/95 px-4 pt-2.5 backdrop-blur-md lg:hidden">
        <a href={linkCandidatura} className="button-primary w-full">
          <Send aria-hidden="true" className="h-5 w-5" /> Quero me candidatar
        </a>
      </div>
    </div>
  );
}

/**
 * Vaga inexistente, ainda em rascunho, pausada ou com prazo vencido caem todas
 * aqui — e a tela não conta qual dos casos é, de propósito: dizer "esta vaga
 * está em rascunho" revelaria que existe conteúdo que a clínica não publicou.
 *
 * Esta tela é `notFoundComponent`: ela não recebe `loaderData` (e o `data` de
 * `notFound()` não atravessa a hidratação — o SSR só transporta o sinalizador de
 * "não encontrado"), então aqui não se sabe se o banco de talentos está aberto.
 * Por isso nada de prometer que ele "continua recebendo currículos": o caminho é
 * /carreiras, que lê a configuração e mostra o convite só quando ele é verdade.
 */
function VagaNaoEncontrada() {
  return (
    <div className="min-h-dvh bg-cream">
      <SkipLink />
      <Header />

      <main id="conteudo" className="section-deep noise flex min-h-[68vh] items-center text-white">
        <div className="jp-container py-16">
          <p className="eyebrow text-white">
            <span aria-hidden="true" className="h-2 w-2 rounded-full bg-lime" />
            Vaga indisponível
          </p>
          <h1 className="mt-6 max-w-3xl font-display text-[clamp(2.4rem,6.5vw,4.5rem)] font-extrabold leading-[.88] tracking-[-.05em]">
            {/* O destaque era `text-lime` — letra verde em fundo verde, o que a
                clínica proibiu. A ênfase não se perde: a LINHA embaixo continua
                lime (linha não é letra), e a palavra fica branca como o resto. */}
            Esta vaga não está mais{" "}
            <span className="text-white underline decoration-lime decoration-4 underline-offset-[6px]">
              recebendo candidaturas.
            </span>
          </h1>
          <p className="mt-6 max-w-xl text-base font-medium leading-relaxed text-white/85">
            O processo pode ter sido encerrado ou o endereço mudou. As vagas abertas hoje estão
            todas na página de carreiras — e, se a clínica estiver recebendo currículos espontâneos,
            o caminho para o banco de talentos está lá também.
          </p>
          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <a href="/carreiras" className="button-primary">
              <ArrowLeft aria-hidden="true" className="h-4 w-4" /> Ver vagas abertas
            </a>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
