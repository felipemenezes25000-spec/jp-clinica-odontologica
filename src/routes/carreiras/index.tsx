/**
 * Vitrine de vagas — /carreiras.
 *
 * Página do SITE, não do sistema: entra com o mesmo cabeçalho, o mesmo rodapé
 * e a mesma linguagem visual das páginas de tratamento. Quem chega aqui por um
 * link colado no WhatsApp precisa reconhecer a JP na primeira dobra.
 *
 * Os dados vêm do `loader` (SSR) de propósito: as vagas têm que estar no HTML
 * servido para o Google indexar cada anúncio e para o preview do WhatsApp
 * mostrar algo. Buscar no cliente deixaria a página vazia para os dois.
 */
import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  ArrowRight,
  ArrowUpRight,
  BadgeCheck,
  Bus,
  CalendarCheck,
  Check,
  Coffee,
  GraduationCap,
  HeartHandshake,
  Mail,
  MapPin,
  MessageCircle,
  Quote,
  Search,
  ShieldCheck,
  Smile,
  Sparkles,
  X,
  type LucideIcon,
} from "lucide-react";

import cantinhoCafeImg from "@/assets/cantinho-cafe.webp";
import entradaClinicaImg from "@/assets/entrada-clinica.webp";
import recepcaoImg from "@/assets/recepcao.webp";

import { Footer } from "@/components/site/Footer";
import { Header } from "@/components/site/Header";
import { Logo } from "@/components/site/Logo";
import { Reveal } from "@/components/site/Reveal";
import { SkipLink } from "@/components/site/SkipLink";
import { CartaoVaga } from "@/components/rh/CartaoVaga";

import { CLINICA, HISTORIA, MISSAO, SITE_URL, whatsappLink } from "@/lib/jp";
import { listarVagasPublicas } from "@/lib/rh/api-portal";
import { apenasDigitos } from "@/lib/rh/formatar";
import { AREAS, TURNOS, VINCULOS } from "@/lib/rh/opcoes";
import type { AreaVaga, Vinculo } from "@/lib/rh/tipos";
import { ordenarVagas } from "@/lib/rh/vagas";

const TITULO = "Trabalhe na JP — vagas na JP Clínica Integrada Odontológica, Freguesia do Ó";
const DESCRICAO =
  "Vagas abertas na JP Clínica Integrada Odontológica, na Vila Bruna, região da Freguesia do Ó, em São Paulo. Veja as oportunidades para dentistas, ASB/TSB, recepção e administrativo, ou cadastre seu currículo no banco de talentos.";
const URL_PAGINA = `${SITE_URL}/carreiras`;

export const Route = createFileRoute("/carreiras/")({
  head: () => ({
    meta: [
      { title: TITULO },
      { name: "description", content: DESCRICAO },
      { property: "og:title", content: TITULO },
      { property: "og:description", content: DESCRICAO },
      { property: "og:url", content: URL_PAGINA },
      { property: "og:type", content: "website" },
      { property: "og:locale", content: "pt_BR" },
      { property: "og:image", content: `${SITE_URL}${recepcaoImg}` },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: TITULO },
      { name: "twitter:description", content: DESCRICAO },
      { name: "twitter:image", content: `${SITE_URL}${recepcaoImg}` },
    ],
    links: [{ rel: "canonical", href: URL_PAGINA }],
  }),
  /**
   * O instante de referência sai daqui, junto com as vagas, e não de um
   * `new Date()` no componente: o inicializador de `useState` roda no servidor E
   * no navegador, então o relógio do aparelho reescreveria "há 16 minutos" como
   * "há 18 minutos" na hidratação — divergência que faz o React descartar o HTML
   * do SSR e repintar justamente a página que precisa ser indexada.
   *
   * O carimbo vem do próprio `listarVagasPublicas` (relógio do servidor), e não
   * de um `new Date()` aqui: em navegação no cliente o loader roda no navegador,
   * e ali o relógio do aparelho voltaria a mandar na conta.
   */
  loader: () => listarVagasPublicas(),
  component: PaginaCarreiras,
});

/**
 * Ícones da faixa de benefícios. São decorativos e entram por posição, porque
 * o texto de cada benefício é livre — o RH edita nas configurações e não há
 * como mapear ícone por palavra sem chutar. Por isso todos são `aria-hidden`:
 * quem lê por leitor de tela ouve só o benefício.
 */
const ICONES_BENEFICIO: LucideIcon[] = [
  BadgeCheck,
  Bus,
  Coffee,
  Smile,
  CalendarCheck,
  ShieldCheck,
  GraduationCap,
  HeartHandshake,
];

const MENSAGEM_WHATSAPP = "Olá! Vi as vagas no site da JP e gostaria de falar com o RH.";

/** Tira acento e caixa para a busca casar "protese" com "prótese". */
function normalizar(v: string): string {
  return v
    .normalize("NFD")
    .replace(/\p{Mn}/gu, "")
    .toLowerCase()
    .trim();
}

/**
 * Monta o wa.me a partir do número que a clínica digitou nas configurações.
 *
 * Não usamos `whatsappLink` aqui quando existe número de RH: aquele helper
 * aponta sempre para o WhatsApp geral da clínica, e mandar a pessoa para um
 * número diferente do que está escrito na tela é o tipo de detalhe que faz
 * candidato achar que caiu em página errada. Devolve "" quando o número não
 * tem dígitos suficientes — aí a tela cai no contato geral.
 */
function linkWhatsAppRh(numero: string, mensagem: string): string {
  const digitos = apenasDigitos(numero);
  if (digitos.length < 10) return "";
  // 10 ou 11 dígitos é número nacional (DDD + linha); acima disso já veio com
  // o código do país junto.
  const comPais = digitos.length <= 11 ? `55${digitos}` : digitos;
  return `https://wa.me/${comPais}?text=${encodeURIComponent(mensagem)}`;
}

function PaginaCarreiras() {
  const { vagas, config, agoraIso } = Route.useLoaderData();

  /**
   * REGRA DAS DATAS: um `agora` só para a página inteira, congelado no primeiro
   * render e vindo do `loader`. `new Date()` dentro do cartão faria cada cartão
   * medir um instante diferente; `new Date()` aqui faria o navegador medir um
   * instante diferente do servidor (ver o comentário do `loader`).
   */
  const [agora] = useState(() => new Date(agoraIso));

  const [busca, setBusca] = useState("");
  const [area, setArea] = useState<AreaVaga | "">("");
  const [vinculo, setVinculo] = useState<Vinculo | "">("");
  const [turno, setTurno] = useState("");

  // Só oferecemos filtro do que existe: um chip "Estágio" que sempre devolve
  // zero resultado é uma promessa vazia na cara de quem procura emprego.
  const areasPresentes = useMemo(
    () => AREAS.filter((a) => vagas.some((v) => v.area === a.valor)),
    [vagas],
  );
  const vinculosPresentes = useMemo(
    () => VINCULOS.filter((x) => vagas.some((v) => v.vinculo === x.valor)),
    [vagas],
  );
  const turnosPresentes = useMemo(
    () => TURNOS.filter((t) => vagas.some((v) => v.turnos.includes(t.valor))),
    [vagas],
  );

  const filtradas = useMemo(() => {
    const termo = normalizar(busca);
    const achadas = vagas.filter((v) => {
      if (area !== "" && v.area !== area) return false;
      if (vinculo !== "" && v.vinculo !== vinculo) return false;
      if (turno !== "" && !v.turnos.includes(turno)) return false;
      if (termo.length === 0) return true;
      const alvo = normalizar([v.titulo, v.resumo, ...v.requisitos].join(" "));
      return alvo.includes(termo);
    });
    // O servidor já entrega ordenado, mas reordenar aqui é barato e garante que
    // a vaga em destaque continue no topo de qualquer recorte do filtro.
    return ordenarVagas(achadas);
  }, [vagas, busca, area, vinculo, turno]);

  const temFiltro = busca.trim().length > 0 || area !== "" || vinculo !== "" || turno !== "";

  const limparFiltros = () => {
    setBusca("");
    setArea("");
    setVinculo("");
    setTurno("");
  };

  const emailRh = config.emailRh.trim();
  const whatsappRh = config.whatsappRh.trim();
  const linkRh = linkWhatsAppRh(whatsappRh, MENSAGEM_WHATSAPP);
  const beneficios = config.beneficiosPadrao.filter((b) => b.trim().length > 0);
  const sobre = config.textoSobre.trim();

  return (
    <div className="min-h-dvh bg-cream">
      <SkipLink />
      <Header />

      <main id="conteudo">
        {/* 01 — CAPA */}
        <section className="section-deep relative isolate overflow-hidden pb-16 pt-14 text-white sm:pb-20 sm:pt-16 lg:pb-24 lg:pt-20">
          <div aria-hidden="true" className="rh-grade absolute inset-0" />
          {/* Marca d'água: alt vazio, é decoração — o nome da clínica já está no
              cabeçalho e no rodapé. */}
          <Logo
            variante="simbolo"
            fundo="escuro"
            altura={620}
            className="pointer-events-none absolute -right-24 -top-16 w-auto max-w-none opacity-[.07] sm:-right-16"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -left-24 top-24 h-96 w-96 rounded-full bg-lime/12 blur-[130px]"
          />

          <div className="jp-container relative">
            <Reveal>
              {/* REGRA DE CONTRASTE DA CLÍNICA: em fundo verde, letra branca —
                  sem exceção. Este eyebrow era `text-lime`, que sobre o verde
                  escuro do `.section-deep` fica em 4,66:1 e some no celular sob
                  luz do sol. O lime segue vivo nos elementos que NÃO são letra
                  (o halo, a borda, o ✓ dos chips). */}
              <span className="eyebrow text-white">Trabalhe na JP</span>
              <h1 className="mt-6 max-w-4xl font-display text-[clamp(2.9rem,7.5vw,6.4rem)] font-extrabold leading-[.9] tracking-[-.055em]">
                {config.tituloPortal}
              </h1>
              {config.chamadaPortal.trim().length > 0 ? (
                <p className="mt-7 max-w-2xl text-base font-medium leading-relaxed text-white/85 sm:text-lg">
                  {config.chamadaPortal}
                </p>
              ) : null}

              <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                <a
                  href="#vagas"
                  className="inline-flex min-h-[3.25rem] items-center justify-center gap-2 rounded-full bg-lime px-6 py-3 font-extrabold text-brand-deep transition hover:-translate-y-0.5 hover:bg-white"
                >
                  {vagas.length > 0 ? "Ver vagas abertas" : "Ver o portal de vagas"}
                  <ArrowRight className="h-4 w-4" />
                </a>
                <a href="/trabalhe-conosco" className="button-ghost-light">
                  Banco de talentos
                  <ArrowUpRight className="h-4 w-4" />
                </a>
              </div>
            </Reveal>

            <Reveal delay={90}>
              <dl className="mt-12 grid gap-4 sm:grid-cols-3 sm:gap-5">
                {[
                  {
                    valor: `${HISTORIA.anos} anos`,
                    rotulo: "de clínica, desde 2002",
                  },
                  {
                    valor: vagas.length === 1 ? "1 vaga aberta" : `${vagas.length} vagas abertas`,
                    // O rótulo concorda com o valor: com uma vaga só — o caso
                    // mais comum numa clínica de bairro — "publicadas" ao lado
                    // de "1 vaga aberta" fica errado na mesma linha visual.
                    rotulo:
                      vagas.length === 1 ? "publicada neste momento" : "publicadas neste momento",
                  },
                  { valor: CLINICA.bairro, rotulo: "em São Paulo" },
                ].map((item) => (
                  <div key={item.rotulo} className="jp-dark-glass rounded-[1.3rem] p-5 sm:p-6">
                    <dt className="text-xs font-extrabold uppercase tracking-[.16em] text-white">
                      {item.rotulo}
                    </dt>
                    <dd className="mt-2 font-display text-xl font-extrabold leading-tight tracking-[-.02em] text-white sm:text-2xl">
                      {item.valor}
                    </dd>
                  </div>
                ))}
              </dl>
            </Reveal>
          </div>
        </section>

        {/* 02 — BENEFÍCIOS */}
        {beneficios.length > 0 ? (
          <section className="jp-section section-light relative overflow-hidden">
            <div className="jp-container relative">
              {/* A faixa mostra os benefícios PADRÃO do portal, que não sabem de
                  vínculo: "registro em carteira" está na lista de fábrica e não
                  vale para PJ, estágio nem diarista. Por isso o título não afirma
                  cobertura universal — quem manda é o anúncio de cada vaga. */}
              <Reveal>
                <span className="eyebrow text-ink">Benefícios</span>
                <h2 className="mt-5 max-w-3xl font-display text-[clamp(2rem,4.4vw,3.4rem)] font-extrabold leading-[.95] tracking-[-.04em] text-forest-2">
                  O que a clínica costuma oferecer.
                </h2>
                <p className="mt-5 max-w-xl text-base leading-relaxed text-ink-soft">
                  A lista muda conforme o vínculo e a função: os benefícios que valem para cada vaga
                  estão no anúncio dela.
                </p>
              </Reveal>

              <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {beneficios.map((beneficio, i) => {
                  const Icone = ICONES_BENEFICIO[i % ICONES_BENEFICIO.length] ?? BadgeCheck;
                  return (
                    <Reveal as="li" key={beneficio} delay={i * 45} className="h-full">
                      <div className="card-premium flex h-full flex-col gap-4 p-6">
                        <span className="grid h-11 w-11 place-items-center rounded-full bg-mint text-forest">
                          <Icone className="h-5 w-5" aria-hidden="true" />
                        </span>
                        <p className="text-sm font-bold leading-snug text-ink">{beneficio}</p>
                      </div>
                    </Reveal>
                  );
                })}
              </ul>
            </div>
          </section>
        ) : null}

        {/* 03 — POR QUE A JP */}
        <section className="jp-section relative overflow-hidden bg-paper">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -left-32 top-10 h-96 w-96 rounded-full bg-mint/60 blur-[130px]"
          />
          <div className="jp-container relative grid gap-12 lg:grid-cols-[1.02fr_.98fr] lg:items-center lg:gap-16">
            <Reveal>
              <span className="eyebrow text-ink">Por que a JP</span>
              <h2 className="mt-5 max-w-2xl font-display text-[clamp(2.1rem,4.6vw,3.6rem)] font-extrabold leading-[.95] tracking-[-.045em] text-forest-2">
                Clínica de bairro, equipe que se apoia.
              </h2>
              {sobre.length > 0 ? (
                <p className="mt-6 max-w-xl text-base leading-relaxed text-ink-soft">{sobre}</p>
              ) : null}

              <figure className="jp-soft-card mt-8 rounded-[1.4rem] p-6 sm:p-7">
                <Quote className="h-6 w-6 text-forest" aria-hidden="true" />
                <blockquote className="mt-3 font-display text-lg font-extrabold leading-snug tracking-[-.02em] text-ink sm:text-xl">
                  {MISSAO}
                </blockquote>
                <figcaption className="mt-3 text-xs font-extrabold uppercase tracking-[.16em] text-ink-soft">
                  Missão da JP, no quadro da parede
                </figcaption>
              </figure>

              <p className="mt-6 flex items-center gap-2 text-sm font-bold text-ink-soft">
                <MapPin className="h-4 w-4 text-forest" aria-hidden="true" />
                {CLINICA.endereco}
              </p>
            </Reveal>

            <Reveal delay={90} className="relative">
              <div className="overflow-hidden rounded-[2rem] border border-forest/8 bg-white p-2.5 shadow-[0_38px_100px_-45px_rgba(3,47,1,.42)]">
                <img
                  src={recepcaoImg}
                  alt="Recepção da JP Clínica Integrada Odontológica"
                  loading="lazy"
                  className="aspect-[4/3] w-full rounded-[1.6rem] object-cover"
                />
              </div>
              <div className="mt-4 grid grid-cols-2 gap-4">
                <img
                  src={entradaClinicaImg}
                  alt="Entrada da clínica, na Vila Bruna"
                  loading="lazy"
                  className="aspect-[4/3] w-full rounded-[1.3rem] border border-forest/8 object-cover"
                />
                <img
                  src={cantinhoCafeImg}
                  alt="Cantinho do café da equipe"
                  loading="lazy"
                  className="aspect-[4/3] w-full rounded-[1.3rem] border border-forest/8 object-cover"
                />
              </div>
            </Reveal>
          </div>
        </section>

        {/* 04 — VAGAS */}
        <section id="vagas" className="jp-section section-light relative scroll-mt-24">
          <div className="jp-container relative">
            <Reveal className="flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
              <div>
                <span className="eyebrow text-ink">Vagas abertas</span>
                <h2 className="mt-5 max-w-2xl font-display text-[clamp(2.1rem,4.6vw,3.6rem)] font-extrabold leading-[.95] tracking-[-.045em] text-forest-2">
                  Encontre a sua vaga.
                </h2>
              </div>
              {vagas.length > 0 ? (
                <p
                  aria-live="polite"
                  className="text-sm font-extrabold text-ink-soft lg:pb-2 lg:text-right"
                >
                  {filtradas.length === 1
                    ? "1 vaga encontrada"
                    : `${filtradas.length} vagas encontradas`}
                  {temFiltro ? ` de ${vagas.length}` : ""}
                </p>
              ) : null}
            </Reveal>

            {vagas.length === 0 ? (
              /* VAZIO 1 — a clínica não tem nenhuma vaga publicada. Não é erro
                 nem filtro: é o estado normal entre um processo e outro, então
                 a tela leva direto ao banco de talentos. */
              <Reveal className="mt-10">
                <div className="rh-papel mx-auto max-w-2xl p-8 text-center sm:p-10">
                  <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-mint text-forest">
                    <Sparkles className="h-6 w-6" aria-hidden="true" />
                  </span>
                  <h3 className="mt-5 font-display text-2xl font-extrabold leading-tight tracking-[-.03em] text-forest-2">
                    Nenhuma vaga aberta por enquanto
                  </h3>
                  <p className="mt-4 text-base leading-relaxed text-ink-soft">
                    {config.mensagemSemVagas}
                  </p>
                  <a href="/trabalhe-conosco" className="button-primary mt-7">
                    Entrar no banco de talentos
                    <ArrowUpRight className="h-4 w-4" />
                  </a>
                </div>
              </Reveal>
            ) : (
              <>
                <Reveal delay={60} className="mt-9">
                  <div className="rh-papel p-5 sm:p-6">
                    <div className="relative">
                      <label htmlFor="busca-vaga" className="rh-rotulo">
                        Buscar vaga
                      </label>
                      <Search
                        className="pointer-events-none absolute left-4 top-[2.65rem] h-4 w-4 text-ink-soft"
                        aria-hidden="true"
                      />
                      <input
                        id="busca-vaga"
                        type="search"
                        value={busca}
                        onChange={(e) => setBusca(e.target.value)}
                        placeholder="Cargo, requisito ou palavra do anúncio"
                        className="rh-campo"
                        /* O recuo da lupa vai inline porque `.rh-campo` declara o
                           atalho `padding` fora de qualquer camada do Tailwind e
                           venceria a utilitária `pl-10`: o texto digitado
                           começaria em 14px e passaria por baixo do ícone. Mesmo
                           remédio de LoginRh.tsx. */
                        style={{ paddingLeft: "2.5rem" }}
                      />
                    </div>

                    {/* Os chips são botões com aria-pressed, e não um radiogroup:
                        radiogroup promete navegação por setas do teclado, que
                        não implementamos aqui. O estado ativo aparece na borda,
                        no peso da fonte (via .rh-chip) e no ✓ — nunca só na cor. */}
                    {areasPresentes.length > 1 ? (
                      <div className="mt-5">
                        <span className="rh-rotulo">Área</span>
                        <div
                          role="group"
                          aria-label="Filtrar vagas por área"
                          className="flex flex-wrap gap-2"
                        >
                          <ChipFiltro
                            rotulo="Todas as áreas"
                            ativo={area === ""}
                            aoClicar={() => setArea("")}
                          />
                          {areasPresentes.map((a) => (
                            <ChipFiltro
                              key={a.valor}
                              rotulo={a.rotulo}
                              ativo={area === a.valor}
                              aoClicar={() => setArea(area === a.valor ? "" : a.valor)}
                            />
                          ))}
                        </div>
                      </div>
                    ) : null}

                    {vinculosPresentes.length > 1 ? (
                      <div className="mt-5">
                        <span className="rh-rotulo">Vínculo</span>
                        <div
                          role="group"
                          aria-label="Filtrar vagas por tipo de vínculo"
                          className="flex flex-wrap gap-2"
                        >
                          <ChipFiltro
                            rotulo="Qualquer vínculo"
                            ativo={vinculo === ""}
                            aoClicar={() => setVinculo("")}
                          />
                          {vinculosPresentes.map((v) => (
                            <ChipFiltro
                              key={v.valor}
                              rotulo={v.rotulo}
                              ativo={vinculo === v.valor}
                              aoClicar={() => setVinculo(vinculo === v.valor ? "" : v.valor)}
                            />
                          ))}
                        </div>
                      </div>
                    ) : null}

                    {turnosPresentes.length > 1 ? (
                      <div className="mt-5">
                        <span className="rh-rotulo">Turno</span>
                        <div
                          role="group"
                          aria-label="Filtrar vagas por turno"
                          className="flex flex-wrap gap-2"
                        >
                          <ChipFiltro
                            rotulo="Todos os turnos"
                            ativo={turno === ""}
                            aoClicar={() => setTurno("")}
                          />
                          {turnosPresentes.map((t) => (
                            <ChipFiltro
                              key={t.valor}
                              rotulo={t.rotulo}
                              ativo={turno === t.valor}
                              aoClicar={() => setTurno(turno === t.valor ? "" : t.valor)}
                            />
                          ))}
                        </div>
                      </div>
                    ) : null}

                    {temFiltro ? (
                      <button
                        type="button"
                        onClick={limparFiltros}
                        className="mt-5 inline-flex min-h-[2.75rem] items-center gap-2 rounded-full border border-border-soft bg-white px-4 py-2 text-sm font-extrabold text-ink transition hover:border-forest/40"
                      >
                        <X className="h-4 w-4" aria-hidden="true" />
                        Limpar filtros
                      </button>
                    ) : null}
                  </div>
                </Reveal>

                {filtradas.length === 0 ? (
                  /* VAZIO 2 — há vagas, mas nenhuma casa com o filtro. Tela
                     diferente da anterior de propósito: aqui o caminho é
                     afrouxar a busca, não ir para o banco de talentos. */
                  <Reveal className="mt-10">
                    <div className="jp-soft-card mx-auto max-w-xl rounded-[1.5rem] p-8 text-center">
                      <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-cream text-forest ring-1 ring-border-soft">
                        <Search className="h-5 w-5" aria-hidden="true" />
                      </span>
                      <h3 className="mt-4 font-display text-xl font-extrabold leading-tight text-forest-2">
                        Nenhuma vaga com esses filtros
                      </h3>
                      {/* A frase inteira entra no ternário: com uma vaga só, trocar
                          apenas o miolo deixaria "As vaga aberta … continuam". */}
                      <p className="mt-3 text-sm leading-relaxed text-ink-soft">
                        {vagas.length === 1
                          ? "A única vaga aberta da clínica continua no ar — só não bate com o que você marcou."
                          : `As ${vagas.length} vagas abertas da clínica continuam no ar — só não batem com o que você marcou.`}{" "}
                        Tire um filtro e veja todas.
                      </p>
                      <button type="button" onClick={limparFiltros} className="button-primary mt-6">
                        <X className="h-4 w-4" aria-hidden="true" />
                        Limpar filtros
                      </button>
                    </div>
                  </Reveal>
                ) : (
                  <ul className="mt-9 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
                    {filtradas.map((vaga, i) => (
                      <Reveal as="li" key={vaga.id} delay={Math.min(i, 6) * 55} className="h-full">
                        <CartaoVaga vaga={vaga} agora={agora} destaque={vaga.destaque} />
                      </Reveal>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>
        </section>

        {/* 05 — FALE COM O RH */}
        <section className="jp-section section-deep relative overflow-hidden text-white">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -right-20 top-10 h-96 w-96 rounded-full bg-lime/12 blur-[130px]"
          />
          <div className="jp-container relative grid gap-10 lg:grid-cols-[1.05fr_.95fr] lg:items-center">
            <Reveal>
              <span className="eyebrow text-white">Fale com o RH</span>
              <h2 className="mt-5 max-w-xl font-display text-[clamp(2rem,4.4vw,3.4rem)] font-extrabold leading-[.95] tracking-[-.045em]">
                {config.aceitandoEspontanea
                  ? "Não achou a sua vaga? Deixe seu currículo."
                  : "Ficou com dúvida sobre alguma vaga?"}
              </h2>
              <p className="mt-5 max-w-lg text-base leading-relaxed text-white/85">
                {config.aceitandoEspontanea
                  ? "A clínica guarda os currículos do banco de talentos e chama primeiro quem já se apresentou quando abre uma vaga do perfil."
                  : "Fale com a gente pelos canais abaixo — respondemos em horário comercial, de segunda a sexta."}
              </p>

              {config.aceitandoEspontanea ? (
                <a
                  href="/trabalhe-conosco"
                  className="mt-8 inline-flex min-h-[3.25rem] items-center justify-center gap-2 rounded-full bg-lime px-6 py-3 font-extrabold text-brand-deep transition hover:-translate-y-0.5 hover:bg-white"
                >
                  Cadastrar meu currículo
                  <ArrowUpRight className="h-4 w-4" />
                </a>
              ) : null}
            </Reveal>

            <Reveal delay={80}>
              <div className="grid gap-4">
                {emailRh.length > 0 ? (
                  <a
                    href={`mailto:${emailRh}?subject=${encodeURIComponent("Candidatura — site da JP")}`}
                    className="jp-dark-glass flex items-center gap-4 rounded-[1.3rem] p-5 transition hover:-translate-y-0.5"
                  >
                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-lime/15 text-lime">
                      <Mail className="h-5 w-5" aria-hidden="true" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-xs font-extrabold uppercase tracking-[.16em] text-white">
                        E-mail do RH
                      </span>
                      <span className="mt-1 block truncate font-display text-lg font-extrabold">
                        {emailRh}
                      </span>
                    </span>
                  </a>
                ) : null}

                {/* Com número de RH cadastrado, mostramos e discamos o número
                    dele; sem ele, o contato é o WhatsApp geral da clínica — e a
                    tela diz qual dos dois é, para ninguém achar que falou com o
                    RH quando falou com a recepção. */}
                <a
                  href={linkRh.length > 0 ? linkRh : whatsappLink(MENSAGEM_WHATSAPP)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="jp-dark-glass flex items-center gap-4 rounded-[1.3rem] p-5 transition hover:-translate-y-0.5"
                >
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-lime/15 text-lime">
                    <MessageCircle className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-xs font-extrabold uppercase tracking-[.16em] text-white">
                      {linkRh.length > 0 ? "WhatsApp do RH" : "WhatsApp da clínica"}
                    </span>
                    <span className="mt-1 block truncate font-display text-lg font-extrabold">
                      {linkRh.length > 0 ? whatsappRh : CLINICA.whatsapp}
                    </span>
                  </span>
                </a>

                <p className="flex items-center gap-2 pl-1 text-sm font-bold text-white/85">
                  <Check className="h-4 w-4 text-lime" aria-hidden="true" />
                  {CLINICA.horario}
                </p>
              </div>
            </Reveal>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}

/**
 * Chip de filtro. Botão de verdade, com `aria-pressed` — o `.rh-chip` já traz
 * borda e peso extra no estado ativo, e o ✓ fecha o terceiro sinal não
 * cromático exigido pela WCAG 1.4.1.
 */
function ChipFiltro({
  rotulo,
  ativo,
  aoClicar,
}: {
  rotulo: string;
  ativo: boolean;
  aoClicar: () => void;
}) {
  return (
    <button
      type="button"
      onClick={aoClicar}
      aria-pressed={ativo}
      data-ativo={ativo ? "true" : "false"}
      className="rh-chip"
    >
      {ativo ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : null}
      {rotulo}
    </button>
  );
}
