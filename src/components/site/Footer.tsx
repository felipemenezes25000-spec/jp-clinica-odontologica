import { useLocation } from "@tanstack/react-router";
import {
  ArrowUp,
  ArrowUpRight,
  Clock,
  Facebook,
  Instagram,
  MapPin,
  MessageCircle,
  Phone,
} from "lucide-react";
import { Logo } from "@/components/site/Logo";
import { CLINICA, HISTORIA, NAV_RODAPE, RESPONSAVEL_TECNICA } from "@/lib/jp";
import { useContatoWhatsApp } from "@/components/site/useContatoWhatsApp";
import { BotaoRevisarConsentimento } from "@/components/site/AvisoDeCookies";
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

/**
 * `chamada={false}` tira o convite final do topo do rodapé. A home usa: ela já
 * termina numa faixa verde de contato logo acima, e duas chamadas seguidas
 * pareciam repetição. As landings e as outras páginas ficam com o convite.
 */
export function Footer({ chamada = true }: { chamada?: boolean }) {
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
      <div className="quadro rodape-quadro">
        {/* A última chamada da página. Nas landings não há faixa de contato
            antes dele, então é este o convite final. */}
        {chamada && (
          <div className="rodape-topo" data-entra>
            <p className="rodape-assinatura" data-item>
              {CLINICA.assinatura}
            </p>
            <div className="rodape-acoes" data-item>
              <a
                href={waAgendar}
                target="_blank"
                rel="noopener noreferrer"
                data-ima
                className="botao botao-acento"
              >
                <MessageCircle aria-hidden="true" />
                Agendar avaliação
                <ArrowUpRight aria-hidden="true" />
              </a>
              <a href={CLINICA.telefoneHref} className="botao botao-claro">
                <Phone aria-hidden="true" />
                {CLINICA.telefone}
              </a>
            </div>
          </div>
        )}

        <div data-entra className="rodape-grade">
          <div data-item className="rodape-marca">
            {/* Com alt, diferente das outras telas: aqui a marca não vem dentro
                de um link nomeado nem ao lado do nome escrito, então ela é a
                única coisa que apresenta o bloco de contato. */}
            {/* A logo original numa placa branca: a versão "clara" deixava o
                nome em verde sobre o verde do rodapé, quase ilegível. */}
            <span className="rodape-logo-placa">
              <Logo
                variante="lockup"
                fundo="claro"
                altura={64}
                alt={CLINICA.nome}
                className="h-[52px] w-auto"
              />
            </span>
            <address className="rodape-endereco text-pequeno not-italic">
              <a
                href={CLINICA.mapsHref}
                target="_blank"
                rel="noopener noreferrer"
                className="rodape-link rodape-link-linha"
              >
                <MapPin aria-hidden="true" />
                <span>{CLINICA.endereco}</span>
              </a>
              <a href={CLINICA.telefoneHref} className="rodape-link rodape-link-linha">
                <Phone aria-hidden="true" />
                <span>{CLINICA.telefone}</span>
              </a>
              <a
                href={waAgendar}
                target="_blank"
                rel="noopener noreferrer"
                className="rodape-link rodape-link-linha"
              >
                <MessageCircle aria-hidden="true" />
                <span>WhatsApp {CLINICA.whatsapp}</span>
              </a>
              <p className="rodape-horario">
                <Clock aria-hidden="true" />
                <span>{CLINICA.horario}</span>
              </p>
            </address>
            <div className="rodape-redes">
              <a
                href={CLINICA.instagram}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Instagram da JP Clínica"
                className="rodape-rede"
              >
                <Instagram aria-hidden="true" />
              </a>
              <a
                href={CLINICA.facebook}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Facebook da JP Clínica"
                className="rodape-rede"
              >
                <Facebook aria-hidden="true" />
              </a>
            </div>
          </div>

          <nav aria-label="Navegação do rodapé" className="rodape-nav">
            {COLUNAS_DE_LINKS.map((coluna, i) => (
              <div key={coluna.titulo} data-item>
                <h2 className="rodape-titulo">{coluna.titulo}</h2>
                <ul>
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
              <h2 className="rodape-titulo">A casa</h2>
              <ul>
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
              </ul>
            </div>
          </nav>
        </div>

        <div className="rodape-legal text-pequeno">
          <div className="rodape-legal-texto">
            {/* Fonte explícita, não mais EQUIPE[0]: esta linha é exigida pela
                Resolução CFO 196/2019 e não pode depender da ordem de uma
                lista que a clínica edita. */}
            <p className="font-semibold text-sobre-campo">
              Responsável técnica: {RESPONSAVEL_TECNICA.nome} — {RESPONSAVEL_TECNICA.registro}
            </p>
            <p>
              {CLINICA.razaoSocial} • CNPJ {CLINICA.cnpj} • Inscrição {CLINICA.inscricaoCro}
            </p>
            <p>
              Conteúdo informativo. Indicações e resultados dependem de avaliação profissional
              individual.
            </p>
            <p>© {HISTORIA.anoCopyright} JP Clínica Odontológica. Todos os direitos reservados.</p>
          </div>
          <button type="button" onClick={subir} className="botao botao-claro rodape-topo-botao">
            <ArrowUp aria-hidden="true" />
            Voltar ao topo
          </button>
        </div>
      </div>
    </footer>
  );
}
