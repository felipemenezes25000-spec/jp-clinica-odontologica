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
import { useMemo, useState, type CSSProperties } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  ArrowUpRight,
  CalendarDays,
  Check,
  Clock3,
  Mail,
  MapPin,
  MessageCircle,
  Search,
  X,
} from "lucide-react";

import consultorioImg from "@/assets/consultorio-1.webp";
import cantinhoCafeImg from "@/assets/cantinho-cafe-lateral.webp";
import entradaClinicaImg from "@/assets/entrada-clinica.webp";
import recepcaoImg from "@/assets/recepcao.webp";

import { Footer } from "@/components/site/Footer";
import { Header } from "@/components/site/Header";
import { SkipLink } from "@/components/site/SkipLink";
import { LinhaDeVaga } from "@/components/site/carreiras/LinhaDeVaga";
import { MolduraCoroa } from "@/components/site/sistema/Coroa";
import { AvataresEquipe } from "@/components/site/ui/AvataresEquipe";
import { DENTISTAS } from "@/components/site/ui/avatares";
import { Estrelas } from "@/components/site/ui/Estrelas";

import { AVALIACOES, CLINICA, HISTORIA, MISSAO, SITE_URL, notaBR, whatsappLink } from "@/lib/jp";
import { FECHO_LOCAL, descricaoLocal, tituloLocal } from "@/lib/seo";
import { listarVagasPublicas } from "@/lib/rh/api-portal";
import { apenasDigitos } from "@/lib/rh/formatar";
import { AREAS, TURNOS, VINCULOS } from "@/lib/rh/opcoes";
import type { AreaVaga, Vinculo } from "@/lib/rh/tipos";
import { ordenarVagas } from "@/lib/rh/vagas";

/*
 * TÍTULO E DESCRIÇÃO PASSAM PELO `seo.ts`, como as 17 rotas de paciente.
 *
 * Esta página escrevia os dois à mão e estourava os dois limites: **75**
 * caracteres de título (o Google corta perto de 60) e **228** de descrição (ele
 * corta perto de 155) — medido no HTML servido em 14/09/2026. O corte caía
 * dentro do nome da clínica, e o fim da descrição era texto que ninguém leu.
 *
 * `tituloLocal` põe o assunto na frente e encolhe a marca até caber;
 * `descricaoLocal` junta só as frases que cabem INTEIRAS, nunca cortando no meio
 * de uma. Era o defeito que `seo.ts` existe para não deixar acontecer, e esta
 * rota tinha ficado de fora dele.
 */
/* "Vagas de emprego", e não "Trabalhe na JP": o assunto entra ANTES da região,
   e "Trabalhe na JP na Freguesia do Ó" repetia a preposição. Além de ler
   melhor, começa pelo termo que quem procura emprego digita — a mesma lógica
   que põe "implante dentário" na frente nas páginas de paciente. */
const TITULO = tituloLocal("Vagas de emprego");
const DESCRICAO = descricaoLocal(
  "Vagas abertas na clínica para dentistas, ASB/TSB, recepção e administrativo.",
  "Cadastre seu currículo no banco de talentos.",
  FECHO_LOCAL,
);
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
      { property: "og:image", content: `${SITE_URL}${consultorioImg}` },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: TITULO },
      { name: "twitter:description", content: DESCRICAO },
      { name: "twitter:image", content: `${SITE_URL}${consultorioImg}` },
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
   * render e vindo do `loader`. `new Date()` dentro da linha faria cada linha
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
  const sobre = config.textoSobre.trim();
  const chamada = config.chamadaPortal.trim();
  const titulo = config.tituloPortal.trim() || "Trabalhe na JP";
  const total = vagas.length;

  /* Filtro é para quem tem o que filtrar. Com até 6 vagas o formulário de busca
     seria maior que a lista filtrada (~400px no desktop, 1,5 tela no celular
     antes da primeira vaga): só a lista. De 7 a 12, busca + área; acima disso,
     tudo. */
  const mostrarBusca = total > 6;
  const mostrarOutrosFiltros = total > 12;

  /* O texto "sobre" que a clínica edita no painel já fala da missão (e o
     rodapé do site a repete). A citação em bloco só entra quando não há texto
     nenhum: antes a mesma frase aparecia duas vezes lado a lado. */
  const mostrarMissao = sobre.length === 0;

  return (
    <div className="site min-h-dvh">
      <SkipLink />
      <Header />

      <main id="conteudo">
        {/* TOPO — o H1 diz o que a página é; a foto é o consultório. */}
        <section className="car-topo fundo-brilho" aria-labelledby="car-titulo">
          <div className="quadro car-topo-grade">
            <div>
              <p className="sobretitulo" data-chega>
                Carreiras na JP
              </p>
              <h1 id="car-titulo" className="car-topo-titulo linhas-topo">
                <span className="linha">
                  <span>{titulo}</span>
                </span>
              </h1>
              {chamada.length > 0 ? (
                <p className="car-chamada" data-chega style={{ "--d": "260ms" } as CSSProperties}>
                  {chamada}
                </p>
              ) : null}

              <div className="car-acoes" data-chega style={{ "--d": "360ms" } as CSSProperties}>
                <a
                  href={total > 0 ? "#vagas" : "/trabalhe-conosco"}
                  className="botao botao-acento botao-grande"
                  data-ima
                >
                  {total > 0 ? "Ver vagas abertas" : "Entrar no banco de talentos"}
                  <ArrowUpRight aria-hidden="true" />
                </a>
                {total > 0 ? (
                  <a href="/trabalhe-conosco" className="botao botao-chao botao-grande">
                    Banco de talentos
                  </a>
                ) : null}
              </div>

              <dl className="car-fatos" data-chega style={{ "--d": "480ms" } as CSSProperties}>
                <div>
                  <dt>de clínica, desde {HISTORIA.fundacao}</dt>
                  <dd>
                    <span data-numero={HISTORIA.anos} data-casas="0">
                      {HISTORIA.anos}
                    </span>{" "}
                    anos
                  </dd>
                </div>
                {/* Zero não é fato que atraia ninguém: sem vaga, o fato some
                    (a seção de vagas já explica o estado). */}
                {total > 0 ? (
                  <div>
                    <dt>abertas agora</dt>
                    <dd>{total === 1 ? "1 vaga" : `${total} vagas`}</dd>
                  </div>
                ) : null}
                <div>
                  <dt>em São Paulo</dt>
                  <dd>{CLINICA.local.bairro}</dd>
                </div>
              </dl>
            </div>

            <div className="car-topo-foto">
              <MolduraCoroa medir className="car-topo-moldura">
                <img
                  src={consultorioImg}
                  alt="Consultório da JP Clínica Odontológica, com a cadeira pronta para o próximo paciente"
                  width={1400}
                  height={1045}
                  sizes="(min-width: 1024px) 36rem, 92vw"
                  fetchPriority="high"
                  decoding="async"
                />
              </MolduraCoroa>
              <div className="vidro flutua car-selo car-selo--alto">
                <AvataresEquipe max={3} tamanho={36} />
                <span>
                  <strong>{DENTISTAS.length} dentistas</strong>
                  <small>com registro no CRO</small>
                </span>
              </div>
              <div className="vidro flutua-2 car-selo car-selo--base">
                <span>
                  <Estrelas tamanho="0.95rem" />
                  <strong>{notaBR} no Google</strong>
                  <small>{AVALIACOES.total} avaliações de pacientes</small>
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* POR QUE A JP */}
        <section id="a-jp" className="secao-curta" aria-labelledby="car-porque">
          <div className="quadro">
            <div className="car-porque">
              <div className="car-porque-texto" data-entra>
                <p className="sobretitulo" data-item>
                  A clínica por dentro
                </p>
                <h2 id="car-porque" className="text-titulo" data-item>
                  Onde você vai trabalhar.
                </h2>
                {sobre.length > 0 ? (
                  <p className="car-sobre text-corpo" data-item>
                    {sobre}
                  </p>
                ) : null}
                {mostrarMissao ? (
                  <figure className="cartao car-missao" data-item>
                    <blockquote className="text-frase">{MISSAO}</blockquote>
                  </figure>
                ) : null}
              </div>

              <div className="car-fotos">
                <div data-obturador>
                  <MolduraCoroa proporcao={0.85}>
                    <img
                      src={recepcaoImg}
                      alt="Corredor da recepção da JP, com o balcão e as cadeiras verdes da sala de espera"
                      width={665}
                      height={480}
                      sizes="(min-width: 1024px) 18rem, 44vw"
                      loading="lazy"
                      decoding="async"
                    />
                  </MolduraCoroa>
                </div>
                <div data-obturador>
                  <MolduraCoroa proporcao={0.85}>
                    <img
                      src={cantinhoCafeImg}
                      alt="Cantinho do café da clínica visto de lado, com o letreiro na parede e a bandeja de café"
                      width={900}
                      height={1200}
                      sizes="(min-width: 1024px) 18rem, 44vw"
                      /* Foto vertical, de lado: o centro pega o letreiro e a mesa. */
                      style={{ objectPosition: "50% 50%" }}
                      loading="lazy"
                      decoding="async"
                    />
                  </MolduraCoroa>
                </div>
              </div>
            </div>

            {/* Onde, quando e desde quando: só dado que já está no site. */}
            <ul className="car-infos" data-entra>
              <li className="cartao car-info" data-item>
                <span className="pastilha" aria-hidden="true">
                  <MapPin />
                </span>
                <span>
                  <small>Onde fica</small>
                  <strong>{CLINICA.endereco}</strong>
                </span>
              </li>
              <li className="cartao car-info" data-item>
                <span className="pastilha" aria-hidden="true">
                  <Clock3 />
                </span>
                <span>
                  <small>Horário da clínica</small>
                  <strong>{CLINICA.horario}</strong>
                </span>
              </li>
              <li className="cartao car-info" data-item>
                <span className="pastilha" aria-hidden="true">
                  <CalendarDays />
                </span>
                <span>
                  <small>Fundada em</small>
                  <strong>
                    {HISTORIA.fundacao} · {HISTORIA.anos} anos de clínica
                  </strong>
                </span>
              </li>
            </ul>
          </div>
        </section>

        {/* VAGAS */}
        <section
          id="vagas"
          className="secao-curta secao-clara scroll-mt-24"
          aria-labelledby="car-vagas"
        >
          <div className="quadro">
            <div
              className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end"
              data-entra
            >
              <div>
                <p className="sobretitulo" data-item>
                  Vagas
                </p>
                <h2 id="car-vagas" className="text-titulo mt-[var(--ritmo-1)]" data-item>
                  {total === 0 ? "Nenhuma vaga aberta agora." : "Encontre a sua vaga."}
                </h2>
              </div>
              {mostrarBusca ? (
                <p aria-live="polite" className="car-total" data-item>
                  {filtradas.length === 1
                    ? "1 vaga encontrada"
                    : `${filtradas.length} vagas encontradas`}
                  {temFiltro ? ` de ${total}` : ""}
                </p>
              ) : null}
            </div>

            {total === 0 ? (
              /* VAZIO 1 — a clínica não tem nenhuma vaga publicada. Não é erro
                 nem filtro: é o estado normal entre um processo e outro. A seção
                 inteira é este cartão (texto, um único botão, os canais do RH e
                 a foto), sem bloco de contato repetido logo abaixo. */
              <div className="car-vazio" data-entra>
                <div>
                  <h3 className="text-frase" data-item>
                    Entre no banco de talentos.
                  </h3>
                  <p className="mt-[var(--ritmo-2)] max-w-[46ch] text-tinta-suave" data-item>
                    {config.mensagemSemVagas}
                  </p>
                  <div className="mt-[var(--ritmo-3)]" data-item>
                    <a href="/trabalhe-conosco" className="botao botao-acento" data-ima>
                      Entrar no banco de talentos
                      <ArrowUpRight aria-hidden="true" />
                    </a>
                  </div>
                  <CanaisDoRh
                    className="car-vazio-canais"
                    emailRh={emailRh}
                    whatsappRh={whatsappRh}
                    linkRh={linkRh}
                  />
                </div>
                <div className="car-vazio-foto">
                  <MolduraCoroa proporcao={1.05}>
                    <img
                      src={entradaClinicaImg}
                      alt="Portão de entrada da clínica, ao lado da parede verde da fachada"
                      width={665}
                      height={480}
                      loading="lazy"
                      decoding="async"
                    />
                  </MolduraCoroa>
                </div>
              </div>
            ) : (
              <>
                {mostrarBusca ? (
                  <div className="car-filtros">
                    <div className="car-busca">
                      <label htmlFor="busca-vaga">Buscar vaga</label>
                      <Search aria-hidden="true" />
                      <input
                        id="busca-vaga"
                        type="search"
                        value={busca}
                        onChange={(e) => setBusca(e.target.value)}
                        placeholder="Cargo ou palavra-chave"
                      />
                    </div>

                    {/* Os chips são botões com aria-pressed, e não um radiogroup:
                      radiogroup promete navegação por setas do teclado, que não
                      implementamos aqui. O estado ativo aparece no tom, no peso
                      e no ✓ — nunca só na cor. */}
                    {areasPresentes.length > 1 ? (
                      <div className="car-grupo">
                        <span>Área</span>
                        <div role="group" aria-label="Filtrar vagas por área" className="car-chips">
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

                    {mostrarOutrosFiltros && vinculosPresentes.length > 1 ? (
                      <div className="car-grupo">
                        <span>Vínculo</span>
                        <div
                          role="group"
                          aria-label="Filtrar vagas por tipo de vínculo"
                          className="car-chips"
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

                    {mostrarOutrosFiltros && turnosPresentes.length > 1 ? (
                      <div className="car-grupo">
                        <span>Turno</span>
                        <div
                          role="group"
                          aria-label="Filtrar vagas por turno"
                          className="car-chips"
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
                      <div>
                        <button type="button" onClick={limparFiltros} className="botao botao-chao">
                          <X aria-hidden="true" />
                          Limpar filtros
                        </button>
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {filtradas.length === 0 ? (
                  /* VAZIO 2 — há vagas, mas nenhuma casa com o filtro. Tela
                     diferente da anterior de propósito: aqui o caminho é
                     afrouxar a busca, não ir para o banco de talentos. */
                  <div className="car-vazio">
                    <div>
                      <h3 className="text-frase">Nenhuma vaga com esses filtros.</h3>
                      {/* A frase inteira entra no ternário: com uma vaga só, trocar
                          apenas o miolo deixaria "As vaga aberta … continuam". */}
                      <p className="mt-[var(--ritmo-2)] max-w-[46ch] text-tinta-suave">
                        {total === 1
                          ? "A única vaga aberta da clínica continua no ar — só não bate com o que você marcou."
                          : `As ${total} vagas abertas da clínica continuam no ar — só não batem com o que você marcou.`}{" "}
                        Tire um filtro e veja todas.
                      </p>
                      <div className="mt-[var(--ritmo-3)]">
                        <button
                          type="button"
                          onClick={limparFiltros}
                          className="botao botao-acento"
                        >
                          <X aria-hidden="true" />
                          Limpar filtros
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <ul className="car-lista">
                    {filtradas.map((vaga) => (
                      <LinhaDeVaga key={vaga.id} vaga={vaga} agora={agora} />
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>
        </section>

        {/* FALE COM O RH — só com vagas abertas. Sem vaga, os canais já estão no
            cartão da seção anterior, e esta seção repetiria o mesmo botão. */}
        {total > 0 ? (
          <section className="secao-curta" aria-labelledby="car-rh">
            <div className="quadro car-rh">
              <div data-entra>
                <p className="sobretitulo" data-item>
                  Fale com o RH
                </p>
                <h2 id="car-rh" className="text-titulo mt-[var(--ritmo-1)]" data-item>
                  {config.aceitandoEspontanea ? "Não achou a sua vaga?" : "Dúvida sobre uma vaga?"}
                </h2>
                <p className="mt-[var(--ritmo-2)] max-w-[40ch] text-tinta-suave" data-item>
                  {config.aceitandoEspontanea
                    ? "Deixe seu currículo no banco de talentos. A clínica guarda os currículos e chama primeiro quem já se apresentou quando abre uma vaga do perfil."
                    : "Fale com a gente pelos canais ao lado — respondemos em horário comercial, de segunda a sexta."}
                </p>
                {config.aceitandoEspontanea ? (
                  <div className="mt-[var(--ritmo-3)]" data-item>
                    <a href="/trabalhe-conosco" className="botao botao-acento" data-ima>
                      Cadastrar meu currículo
                      <ArrowUpRight aria-hidden="true" />
                    </a>
                  </div>
                ) : null}
              </div>

              <div className="car-rh-canais">
                {emailRh.length > 0 ? (
                  <a
                    href={`mailto:${emailRh}?subject=${encodeURIComponent("Candidatura — site da JP")}`}
                    className="car-rh-canal cartao cartao-vivo"
                  >
                    <span className="pastilha" aria-hidden="true">
                      <Mail />
                    </span>
                    <span className="min-w-0">
                      <small>E-mail do RH</small>
                      <span className="valor">{emailRh}</span>
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
                  className="car-rh-canal cartao cartao-vivo"
                >
                  <span className="pastilha" aria-hidden="true">
                    <MessageCircle />
                  </span>
                  <span className="min-w-0">
                    <small>{linkRh.length > 0 ? "WhatsApp do RH" : "WhatsApp da clínica"}</small>
                    <span className="valor">
                      {linkRh.length > 0 ? whatsappRh : CLINICA.whatsapp}
                    </span>
                  </span>
                </a>

                <p className="car-rh-horario">{CLINICA.horario}</p>
              </div>
            </div>
          </section>
        ) : null}
      </main>

      <Footer />
    </div>
  );
}

/**
 * Os canais do RH em uma linha, para o cartão de "nenhuma vaga". Mesma regra do
 * bloco de contato: com número de RH cadastrado, o link é o dele; sem, é o
 * WhatsApp geral da clínica — e o rótulo diz qual dos dois é.
 */
function CanaisDoRh({
  className,
  emailRh,
  whatsappRh,
  linkRh,
}: {
  className: string;
  emailRh: string;
  whatsappRh: string;
  linkRh: string;
}) {
  return (
    <p className={className}>
      {emailRh.length > 0 ? (
        <a href={`mailto:${emailRh}?subject=${encodeURIComponent("Candidatura — site da JP")}`}>
          <Mail aria-hidden="true" />
          {emailRh}
        </a>
      ) : null}
      <a
        href={linkRh.length > 0 ? linkRh : whatsappLink(MENSAGEM_WHATSAPP)}
        target="_blank"
        rel="noopener noreferrer"
      >
        <MessageCircle aria-hidden="true" />
        {linkRh.length > 0
          ? `WhatsApp do RH: ${whatsappRh}`
          : `WhatsApp da clínica: ${CLINICA.whatsapp}`}
      </a>
    </p>
  );
}

/**
 * Chip de filtro. Botão de verdade, com `aria-pressed` — o ✓ fecha o terceiro
 * sinal não cromático exigido pela WCAG 1.4.1, depois do tom e do peso.
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
      className="car-chip"
    >
      {ativo ? <Check aria-hidden="true" /> : null}
      {rotulo}
    </button>
  );
}
