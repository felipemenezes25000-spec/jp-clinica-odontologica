import { createFileRoute, notFound } from "@tanstack/react-router";
import {
  ArrowLeft,
  ArrowUpRight,
  Check,
  ChevronDown,
  Clock3,
  MapPin,
  ShieldCheck,
} from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import { CapaVaga } from "@/components/site/CapaVaga";
import { Footer } from "@/components/site/Footer";
import { Header } from "@/components/site/Header";
import { SkipLink } from "@/components/site/SkipLink";
import { LinhaDeVaga } from "@/components/site/carreiras/LinhaDeVaga";
import { capaDaArea, segundaCapaDaArea } from "@/components/site/carreiras/capas";
import { MolduraCoroa } from "@/components/site/sistema/Coroa";
import { CLINICA, SITE_URL } from "@/lib/jp";
import { obterVagaPublica } from "@/lib/rh/api-portal";
import { formatarData } from "@/lib/rh/formatar";
import { MODELOS_TRABALHO, VINCULOS, resumirDisponibilidade } from "@/lib/rh/opcoes";
import type { ConfiguracoesRh, Vaga } from "@/lib/rh/tipos";
import { faixaSalarial, rotuloArea } from "@/lib/rh/vagas";

/* -------------------------------------------------------------------------- */
/* Leitura do domínio                                                         */
/* -------------------------------------------------------------------------- */

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

/** O marcador de item: um ✓ pequeno em círculo menta. Decorativo. */
function Marcador() {
  return (
    <span className="vg-check" aria-hidden="true">
      <Check />
    </span>
  );
}

/** Bloco de lista da coluna larga. Some inteiro quando a lista está vazia. */
function BlocoLista({
  titulo,
  itens,
  rotuloVerTodos,
}: {
  titulo: string;
  itens: string[];
  rotuloVerTodos: string;
}) {
  const [expandido, setExpandido] = useState(false);
  const idLista = useId();

  if (itens.length === 0) return null;

  const excedente = itens.length - ITENS_VISIVEIS;

  return (
    <section data-entra aria-labelledby={`${idLista}-titulo`}>
      <h2 id={`${idLista}-titulo`} data-item>
        {titulo}
      </h2>

      {/* Duas colunas a partir de `sm`: cada item é uma frase curta, e uma frase
          curta ocupando a largura inteira desperdiça metade da linha. */}
      <ul id={idLista} className="vg-lista" data-item>
        {itens.map((item, i) => (
          <li
            key={`${i}-${item.slice(0, 24)}`}
            /* `hidden` em vez de não renderizar: o item continua no HTML
               servido, some da árvore de acessibilidade enquanto está
               recolhido, e volta sem custo de re-render ao expandir. */
            hidden={!expandido && i >= ITENS_VISIVEIS}
          >
            <Marcador />
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
          className="botao botao-chao vg-mais"
        >
          {expandido ? "Mostrar menos" : `${rotuloVerTodos} (+${excedente})`}
          <ChevronDown aria-hidden="true" />
        </button>
      )}
    </section>
  );
}

/** Linha do resumo lateral. Valor vazio nunca chega aqui — quem chama filtra. */
function LinhaResumo({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div>
      <dt>{rotulo}</dt>
      <dd>{valor}</dd>
    </div>
  );
}

/** Conta palavras: decide se o resumo cabe na medida de "frase de efeito". */
function contarPalavras(texto: string): number {
  return texto.split(/\s+/).filter((p) => p.length > 0).length;
}

function PaginaVaga() {
  const { vaga, config, relacionadas, agoraIso }: DadosVaga = Route.useLoaderData();

  /**
   * "Agora" nasce uma vez, no primeiro render, a partir do instante carimbado
   * pelo loader, e desce por prop para as linhas de vagas relacionadas. Medir o
   * tempo aqui — mesmo uma vez só — faria servidor e navegador escreverem textos
   * diferentes ("há 2 dias" vs. "ontem") e a hidratação quebraria.
   */
  const [agora] = useState(() => new Date(agoraIso));

  const salario = faixaSalarial(vaga);
  const jornada = vaga.jornada.trim();
  const prazo = formatarData(vaga.encerraEm);
  const publicadoEm = formatarData(vaga.publicadoEm || vaga.criadoEm);
  const local = localDaVaga(vaga);
  const beneficios = beneficiosDaVaga(vaga, config);
  /* Agrupado, e não uma pastilha por dia+turno: "segunda a sexta, manhã e
     tarde" virava DEZ pastilhas repetindo o nome do dia, e ninguém lê isso. */
  const turnos = resumirDisponibilidade(vaga.turnos);
  const posicoes = `${vaga.quantidade} ${vaga.quantidade === 1 ? "posição" : "posições"}`;
  const blocos = paragrafos(vaga.descricao);
  const resumo = vaga.resumo.trim();
  // Acima de ~25 palavras uma frase de efeito vira parágrafo: o corpo de texto
  // aguenta o comprimento, a medida grande não.
  const resumoLongo = contarPalavras(resumo) > 25;

  // encodeURIComponent por precaução: o slug hoje só tem [a-z0-9-], mas o link é
  // montado com um valor vindo do disco e blindar não custa nada.
  const linkCandidatura = `/trabalhe-conosco?vaga=${encodeURIComponent(vaga.slug)}`;

  const tituloLongo = vaga.titulo.length > 30;
  const segunda = segundaCapaDaArea(vaga.area);

  /* A barra fixa do celular só aparece depois que o botão do topo saiu da tela
     (por cima). Começa escondida no HTML do servidor: sem JS ela nunca cobre
     a primeira dobra, e o botão do resumo ainda está no fim do texto. */
  const botaoTopoRef = useRef<HTMLAnchorElement>(null);
  const [barraVisivel, setBarraVisivel] = useState(false);
  useEffect(() => {
    const alvo = botaoTopoRef.current;
    if (alvo === null || typeof IntersectionObserver === "undefined") return;
    const observador = new IntersectionObserver(([entrada]) => {
      if (entrada === undefined) return;
      setBarraVisivel(!entrada.isIntersecting && entrada.boundingClientRect.top < 0);
    });
    observador.observe(alvo);
    return () => observador.disconnect();
  }, []);

  return (
    <div className="site min-h-dvh">
      <SkipLink />
      <Header />

      <main id="conteudo">
        {/* TOPO — título, resumo, a ação e a foto da área. */}
        <section className="car-topo fundo-brilho" aria-labelledby="vaga-titulo">
          <div className="quadro car-topo-grade car-topo-grade--vaga">
            <div>
              <nav aria-label="Trilha de navegação" className="vg-trilha">
                <ol>
                  <li>
                    <a href="/">Início</a>
                  </li>
                  <li>
                    <a href="/carreiras">Carreiras</a>
                  </li>
                  <li aria-current="page">{vaga.titulo}</li>
                </ol>
              </nav>

              {/* Os títulos de vaga são digitados no painel e podem ser longos.
                  Até ~30 caracteres o H1 é `text-titulo` (duas linhas na coluna
                  larga); acima disso passa para `text-frase`, que cabe em duas
                  linhas até ~65 caracteres. Em vez de um `max-width` em `ch`
                  (que estourava um título realista para cinco linhas), a medida
                  é a da coluna e, no celular, o `vg-titulo` corta em três. */}
              <h1
                id="vaga-titulo"
                className={`vg-titulo ${tituloLongo ? "text-frase" : "text-titulo"}`}
                data-longo={tituloLongo ? "true" : undefined}
              >
                {vaga.titulo}
              </h1>

              <ul className="vg-etiquetas">
                {[rotuloArea(vaga, "Equipe JP"), rotuloVinculo(vaga), rotuloModelo(vaga)].map(
                  (e) => (
                    <li key={e}>{e}</li>
                  ),
                )}
              </ul>
              <p className="vg-local">
                <MapPin aria-hidden="true" />
                <span>{local}</span>
              </p>

              {resumo.length > 0 && (
                <p
                  className={`vg-resumo-hero ${resumoLongo ? "text-corpo" : "text-frase"}`}
                  data-longo={resumoLongo ? "true" : undefined}
                >
                  {resumo}
                </p>
              )}

              <div className="car-acoes">
                <a
                  ref={botaoTopoRef}
                  href={linkCandidatura}
                  className="botao botao-acento botao-grande"
                  data-ima
                >
                  Quero me candidatar
                  <ArrowUpRight aria-hidden="true" />
                </a>
                <a href="/carreiras" className="botao botao-chao botao-grande">
                  <ArrowLeft aria-hidden="true" />
                  Ver todas as vagas
                </a>
              </div>
              {publicadoEm.length > 0 && (
                <p className="mt-[var(--ritmo-2)] text-pequeno text-tinta-suave">
                  Publicada em {publicadoEm}
                </p>
              )}
            </div>

            <div className="car-topo-foto">
              {capaDaArea(vaga.area) !== null ? (
                <CapaVaga area={vaga.area} medir className="car-topo-moldura" />
              ) : (
                /* Área sem foto: um painel menta segura o lugar, com a mesma
                   caixa da foto — o layout não depende de imagem. */
                <MolduraCoroa medir className="car-topo-moldura" aria-hidden="true">
                  <span className="absolute inset-0" style={{ background: "var(--menta)" }} />
                </MolduraCoroa>
              )}
              <div className="vidro flutua car-selo car-selo--base">
                <span className="pastilha" aria-hidden="true">
                  <Clock3 />
                </span>
                <span>
                  <strong>{posicoes}</strong>
                  <small>{jornada.length > 0 ? jornada : "Vaga aberta agora"}</small>
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* CORPO */}
        <section className="secao-curta pt-4 sm:pt-6" aria-label="Detalhes da vaga">
          <div className="quadro vg-corpo">
            <div className="vg-prosa">
              {blocos.length > 0 && (
                <section data-entra aria-labelledby="vaga-sobre">
                  <h2 id="vaga-sobre" data-item>
                    Sobre a vaga
                  </h2>
                  <div className="vg-paragrafos" data-item>
                    {/* A posição entra na `key` porque dois parágrafos podem
                        começar igual (texto de RH repete abertura), e duas keys
                        iguais fazem a reconciliação descartar um deles. A lista
                        nunca é reordenada nem filtrada, então o índice é
                        identidade estável aqui. */}
                    {blocos.map((p, i) => (
                      <p key={`${i}-${p.slice(0, 24)}`}>{p}</p>
                    ))}
                  </div>
                </section>
              )}

              <BlocoLista
                titulo="O que você vai fazer"
                itens={vaga.responsabilidades}
                rotuloVerTodos="Ver todas as responsabilidades"
              />

              {/* Segunda foto: quebra o corredor de listas e põe o lugar na
                  leitura. Só aparece quando a área tem foto de apoio. */}
              {segunda !== null && (
                <figure className="vg-foto" data-obturador>
                  <MolduraCoroa medir>
                    <img
                      src={segunda.src}
                      alt={segunda.alt}
                      width={segunda.largura}
                      height={segunda.altura}
                      loading="lazy"
                      decoding="async"
                    />
                  </MolduraCoroa>
                </figure>
              )}

              {(vaga.requisitos.length > 0 || vaga.diferenciais.length > 0) && (
                <div className="vg-par cartao">
                  <BlocoLista
                    titulo="O que precisamos"
                    itens={vaga.requisitos}
                    rotuloVerTodos="Ver todos os requisitos"
                  />
                  <BlocoLista
                    titulo="O que conta pontos"
                    itens={vaga.diferenciais}
                    rotuloVerTodos="Ver todos os diferenciais"
                  />
                </div>
              )}

              {vaga.especialidades.length > 0 && (
                <section data-entra aria-labelledby="vaga-especialidades">
                  <h2 id="vaga-especialidades" data-item>
                    Especialidades envolvidas
                  </h2>
                  <ul className="vg-lista" data-item>
                    {vaga.especialidades.map((esp) => (
                      <li key={esp}>
                        <Marcador />
                        <span>{esp}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              <p className="vg-aviso">
                <ShieldCheck aria-hidden="true" />
                <span>
                  Todo o processo seletivo da {CLINICA.nome} é gratuito. Nunca pedimos depósito,
                  taxa de cadastro ou compra de material em nenhuma etapa.
                </span>
              </p>
            </div>

            {/* Coluna estreita, grudenta a partir do desktop. */}
            <div className="vg-resumo-lado">
              <aside className="vg-resumo cartao" aria-labelledby="vaga-resumo">
                <h2 id="vaga-resumo">Resumo da vaga</h2>

                {/* O botão abre o cartão: é a ação que acompanha a leitura, e
                    um cartão sticky mais alto que a tela escondia justamente o
                    fim dele. Área, vínculo, modelo e local não se repetem aqui:
                    já estão no topo da página. */}
                <a href={linkCandidatura} className="botao botao-acento">
                  Quero me candidatar
                  <ArrowUpRight aria-hidden="true" />
                </a>

                <dl>
                  {jornada.length > 0 && <LinhaResumo rotulo="Jornada" valor={jornada} />}
                  {/* `faixaSalarial` devolve vazio quando o RH escolheu não
                      divulgar: a linha some, em vez de dizer "a combinar". */}
                  {salario.length > 0 && <LinhaResumo rotulo="Remuneração" valor={salario} />}
                  <LinhaResumo rotulo="Posições" valor={posicoes} />
                  {prazo.length > 0 && <LinhaResumo rotulo="Inscrições até" valor={prazo} />}
                </dl>

                {turnos.length > 0 && (
                  <>
                    <h3>Turnos</h3>
                    <ul>
                      {turnos.map((t) => (
                        <li key={t}>
                          <Marcador />
                          <span>{t}</span>
                        </li>
                      ))}
                    </ul>
                  </>
                )}

                {beneficios.length > 0 && (
                  <>
                    <h3>Benefícios</h3>
                    <ul>
                      {beneficios.map((b) => (
                        <li key={b}>
                          <Marcador />
                          <span>{b}</span>
                        </li>
                      ))}
                    </ul>
                  </>
                )}

                {(config.emailRh.trim().length > 0 || config.whatsappRh.trim().length > 0) && (
                  <p className="vg-duvida">
                    Dúvidas sobre a vaga?{" "}
                    {config.whatsappRh.trim().length > 0
                      ? `Fale com o RH: ${config.whatsappRh}`
                      : `Escreva para ${config.emailRh}`}
                  </p>
                )}
              </aside>
            </div>
          </div>
        </section>

        {/* OUTRAS VAGAS */}
        {relacionadas.length > 0 && (
          <section className="secao-curta secao-clara" aria-labelledby="vaga-outras">
            <div className="quadro">
              <div
                className="flex flex-col justify-between gap-4 md:flex-row md:items-end"
                data-entra
              >
                <div>
                  <p className="sobretitulo" data-item>
                    Mais oportunidades
                  </p>
                  <h2 id="vaga-outras" className="text-titulo mt-[var(--ritmo-1)]" data-item>
                    Outras vagas abertas.
                  </h2>
                </div>
                <a href="/carreiras" className="botao botao-chao self-start" data-item>
                  Ver todas
                  <ArrowUpRight aria-hidden="true" />
                </a>
              </div>

              <ul className="car-lista">
                {relacionadas.map((outra) => (
                  <LinhaDeVaga key={outra.id} vaga={outra} agora={agora} />
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

      {/* Barra fixa só no celular, e só depois que o botão do topo sai da tela:
          no desktop o resumo grudento já mantém o botão à vista o tempo todo. O respiro de baixo vem de
          .mobile-sticky-cta, que soma o env(safe-area-inset-bottom) do iPhone. */}
      <div
        className="vg-barra mobile-sticky-cta"
        data-visivel={barraVisivel ? "true" : "false"}
        inert={!barraVisivel}
      >
        <a href={linkCandidatura} className="botao botao-acento w-full">
          Quero me candidatar
          <ArrowUpRight aria-hidden="true" />
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
    <div className="site min-h-dvh">
      <SkipLink />
      <Header />

      <main id="conteudo" className="fundo-brilho relative overflow-clip">
        <div className="quadro relative py-[clamp(3.25rem,1.75rem+3.5vw,5.5rem)]">
          <div className="cartao max-w-2xl p-[clamp(1.25rem,1rem+1.5vw,2rem)]">
            <p className="sobretitulo">Carreiras na JP</p>
            <h1 className="text-display mt-[var(--ritmo-1)]">Vaga indisponível.</h1>
            <p className="mt-[var(--ritmo-2)] max-w-[44ch] text-tinta-suave">
              O processo pode ter sido encerrado ou o endereço mudou. As vagas abertas hoje estão
              todas na página de carreiras — e, se a clínica estiver recebendo currículos
              espontâneos, o caminho para o banco de talentos está lá também.
            </p>
            <div className="mt-[var(--ritmo-3)]">
              <a href="/carreiras" className="botao botao-acento botao-grande">
                <ArrowLeft aria-hidden="true" />
                Ver vagas abertas
              </a>
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
