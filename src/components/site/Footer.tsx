import { useLocation } from "@tanstack/react-router";
import { ArrowUp, ArrowUpRight, MessageCircle } from "lucide-react";
import { Logo } from "@/components/site/Logo";
import { CLINICA, HISTORIA, NAV_RODAPE, RESPONSAVEL_TECNICA } from "@/lib/jp";
import { useContatoWhatsApp } from "@/components/site/useContatoWhatsApp";
import { BotaoRevisarConsentimento } from "@/components/site/AvisoDeCookies";
import { ArcadaDoRodape } from "@/components/site/global/ArcadaDoRodape";
import { tituloDaRota } from "@/lib/analytics/rotas";
import "@/components/site/global/rodape.css";

/*
 * As colunas de links saem de NAV_RODAPE pelos destinos, não pela posição: se
 * a clínica ganhar uma seção nova em jp.ts, ela cai no fim da última coluna de
 * âncoras em vez de sumir do rodapé — que existe justamente para impedir que um
 * corte do menu vire seção sem link.
 */
const COLUNAS_DE_LINKS = [
  { titulo: "A clínica", destinos: ["/#inicio", "/#clinica", "/#historia", "/#equipe"] },
  {
    titulo: "Cuidado",
    destinos: ["/#tratamentos", "/#convenios", "/#atendimento", "/#estrutura"],
  },
  { titulo: "Para você", destinos: ["/#depoimentos", "/#faq", "/#fale"] },
] as const;

function subir() {
  const reduzido = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  window.scrollTo({ top: 0, behavior: reduzido ? "auto" : "smooth" });
}

export function Footer() {
  /*
   * Um link só para os dois CTAs do rodapé — eram duas chamadas idênticas, e
   * duas chamadas idênticas são duas chances de uma delas ficar para trás.
   *
   * E ele fala do tratamento da página, como o do topo. O rodapé é o fim da
   * leitura: quem chega até aqui numa LP de implante leu a página inteira, e é
   * o contato mais qualificado que ela produz. Era justamente esse que abria o
   * WhatsApp dizendo "Vim pelo site da JP" — sem dizer de quê.
   */
  const location = useLocation();
  const assunto = tituloDaRota(location.pathname) ?? undefined;
  const waAgendar = useContatoWhatsApp("agendar", assunto);

  const jaNaColuna = new Set<string>(COLUNAS_DE_LINKS.flatMap((c) => c.destinos));
  const itensDe = (destinos: readonly string[]) =>
    NAV_RODAPE.filter((item) => destinos.includes(item.href));
  /* Tudo o que não está nas colunas acima e não é a página de vagas. */
  const avulsos = NAV_RODAPE.filter(
    (item) => !jaNaColuna.has(item.href) && item.href !== "/carreiras",
  );
  const carreiras = NAV_RODAPE.find((item) => item.href === "/carreiras");

  return (
    <footer className="rodape campo-escuro">
      <div className="quadro pt-[clamp(4rem,2rem+6vw,9rem)]">
        <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
          <p className="text-frase max-w-[20ch] font-semibold text-sobre-campo">
            {CLINICA.assinatura}
          </p>
          <a
            href={waAgendar}
            target="_blank"
            rel="noopener noreferrer"
            data-ima
            className="botao botao-acento self-start"
          >
            <MessageCircle aria-hidden="true" />
            Agendar avaliação
            <ArrowUpRight aria-hidden="true" />
          </a>
        </div>

        <div
          data-entra
          className="mt-[clamp(3rem,2rem+3vw,5rem)] grid gap-x-8 gap-y-12 lg:grid-cols-12 lg:gap-x-10 lg:gap-y-0"
        >
          <nav
            aria-label="Navegação do rodapé"
            className="grid grid-cols-2 gap-x-8 gap-y-10 sm:grid-cols-4 lg:col-span-8"
          >
            {COLUNAS_DE_LINKS.map((coluna, i) => (
              <div key={coluna.titulo} data-item>
                <h2 className="text-pequeno font-semibold text-sobre-campo-suave">
                  {coluna.titulo}
                </h2>
                <ul className="mt-3">
                  {itensDe(coluna.destinos).map((item) => (
                    <li key={item.href}>
                      <a href={item.href} className="rodape-link text-pequeno">
                        {item.label}
                      </a>
                    </li>
                  ))}
                  {i === COLUNAS_DE_LINKS.length - 1
                    ? avulsos.map((item) => (
                        <li key={item.href}>
                          <a href={item.href} className="rodape-link text-pequeno">
                            {item.label}
                          </a>
                        </li>
                      ))
                    : null}
                </ul>
              </div>
            ))}

            {/* O portal de vagas vive fora da conversa com paciente: coluna
                própria, junto com o que é da casa e não do tratamento. */}
            <div data-item>
              <h2 className="text-pequeno font-semibold text-sobre-campo-suave">A casa</h2>
              <ul className="mt-3">
                {carreiras ? (
                  <li>
                    <a href={carreiras.href} className="rodape-link text-pequeno">
                      Trabalhe na JP
                    </a>
                  </li>
                ) : null}
                <li>
                  <a href="/politica-de-privacidade" className="rodape-link text-pequeno">
                    Política de Privacidade
                  </a>
                </li>
                <li>
                  {/* A LGPD pede que revogar seja tão fácil quanto consentir, e um
                      aviso que nunca mais aparece transforma uma decisão de dois
                      segundos em definitiva. O botão some sozinho para quem ainda
                      não escolheu — nesse caso a faixa já está na tela. */}
                  <BotaoRevisarConsentimento className="rodape-link text-pequeno text-left" />
                </li>
                <li>
                  <a
                    href={CLINICA.instagram}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Instagram da JP Clínica"
                    className="rodape-link text-pequeno"
                  >
                    Instagram
                  </a>
                </li>
                <li>
                  <a
                    href={CLINICA.facebook}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Facebook da JP Clínica"
                    className="rodape-link text-pequeno"
                  >
                    Facebook
                  </a>
                </li>
              </ul>
            </div>
          </nav>

          <div data-item className="lg:col-span-4">
            {/* Com alt, diferente das outras telas: aqui a marca não vem dentro
                de um link nomeado nem ao lado do nome escrito, então ela é a
                única coisa que apresenta o bloco de contato. */}
            <Logo
              variante="lockup"
              fundo="escuro"
              altura={80}
              alt={CLINICA.nome}
              className="h-[72px] w-auto"
            />
            <address className="mt-6 text-pequeno not-italic text-sobre-campo">
              <a
                href={CLINICA.mapsHref}
                target="_blank"
                rel="noopener noreferrer"
                className="rodape-link !inline-block !min-h-0 py-1 leading-snug"
              >
                {CLINICA.endereco}
              </a>
              <ul className="mt-3">
                <li>
                  <a href={CLINICA.telefoneHref} className="rodape-link">
                    {CLINICA.telefone}
                  </a>
                </li>
                <li>
                  <a
                    href={waAgendar}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rodape-link"
                  >
                    WhatsApp {CLINICA.whatsapp}
                  </a>
                </li>
              </ul>
              <p className="mt-2 text-sobre-campo-suave">{CLINICA.horario}</p>
            </address>
          </div>
        </div>

        <div className="mt-14 flex flex-col gap-8 text-pequeno text-sobre-campo-suave lg:mt-20 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-[68ch] space-y-1.5">
            {/* Fonte explícita, não mais EQUIPE[0]: esta linha é exigida pela
                Resolução CFO 196/2019 e não pode depender da ordem de uma
                lista que a clínica edita. */}
            <p className="font-semibold text-sobre-campo">
              Responsável técnica: {RESPONSAVEL_TECNICA.nome} — {RESPONSAVEL_TECNICA.registro}
            </p>
            <p>
              {CLINICA.razaoSocial} • CNPJ {CLINICA.cnpj}
            </p>
            <p>
              Conteúdo informativo. Indicações e resultados dependem de avaliação profissional
              individual.
            </p>
            <p>© {HISTORIA.anoCopyright} JP Clínica Odontológica. Todos os direitos reservados.</p>
          </div>
          <button
            type="button"
            onClick={subir}
            className="botao botao-claro self-start lg:self-auto"
          >
            <ArrowUp aria-hidden="true" />
            Voltar ao topo
          </button>
        </div>

        {/* A marca construída fecha a página: as bases das coroas tocam a borda
            de baixo e o texto legal fica acima, inteiro, sem competir com ela. */}
        <ArcadaDoRodape className="mt-[clamp(3rem,2rem+4vw,6rem)]" />
      </div>
    </footer>
  );
}
