import { MapPin, Phone, Quote, ShieldCheck } from "lucide-react";

import { BotaoWhatsApp } from "@/components/site/lp/BotaoWhatsApp";
import { CONVENIOS_SITE } from "@/components/site/convenios-do-site";
import { MolduraCoroa } from "@/components/site/sistema/Coroa";
import {
  DIAS_DO_EXPEDIENTE_CURTO,
  FAIXA_DO_EXPEDIENTE,
  useSituacao,
} from "@/components/site/sistema/horario";
import { AvataresEquipe } from "@/components/site/ui/AvataresEquipe";
import { AVATAR_POR_NOME, DENTISTAS } from "@/components/site/ui/avatares";
import { Estrelas } from "@/components/site/ui/Estrelas";
import { AVALIACOES, CLINICA, RESPONSAVEL_TECNICA, notaBR, type Depoimento } from "@/lib/jp";
import "./lp.css";

export type Foto = {
  src: string;
  largura: number;
  altura: number;
  alt: string;
  /** `object-position` quando o recorte pede outro enquadramento. */
  posicao?: string;
};

/**
 * O TOPO DAS LANDINGS PAGAS — a mesma primeira dobra da home, com a oferta na frente.
 *
 * Quem chega por anúncio decidiu a busca antes de abrir a página, então a
 * primeira tela responde só ao que ela precisa: é disso? é perto? dá para
 * confiar? como falo com eles? — selo da nota do Google, H1 com procedimento e
 * bairro, uma frase, o botão de WhatsApp e o telefone, uma faixa com os rostos
 * da equipe, os convênios e o horário, e a foto real do consultório com dois
 * cartões de vidro por cima (um depoimento do Google e a responsável técnica).
 *
 * Tudo isso está desenhado desde o primeiro quadro: num anúncio pago, esperar
 * uma animação para ler a oferta é perder visita. Nada de contador nesta dobra
 * (a nota e o total saem como texto), e o que se mexe é pouco: os cartões
 * respiram e somem com "reduzir movimento".
 *
 * O CTA é o primeiro `a.button-primary` do `main` e fica dentro da seção com o
 * `id` do topo: é esse `id` que o rastreio grava como origem do lead.
 */
export function Topo({
  id,
  linhas,
  frase,
  rotulo,
  href,
  foto,
  depoimento,
  provaId,
  conveniosId,
}: {
  id: string;
  /** As duas linhas do H1: procedimento, depois o bairro. */
  linhas: readonly [string, string];
  frase: string;
  rotulo: string;
  href: string;
  foto: Foto;
  /** Um depoimento real da ficha do Google, curto o bastante para o cartão. */
  depoimento: Depoimento;
  /** `id` da seção de avaliações, para o selo da nota levar até ela. */
  provaId: string;
  /** `id` da faixa de convênios, para o "ver quais". */
  conveniosId: string;
}) {
  const situacao = useSituacao();
  const responsavelFoto = AVATAR_POR_NOME[RESPONSAVEL_TECNICA.nome];

  return (
    <section id={id} className="lp-topo fundo-brilho" aria-labelledby={`${id}-titulo`}>
      <div className="quadro lp-topo-grade">
        <div className="lp-topo-texto">
          <a href={`#${provaId}`} className="selo lp-selo">
            <span className="lp-selo-estrelas">
              <Estrelas tamanho="0.95rem" />
            </span>
            <span>
              <strong>{notaBR}</strong> no Google · {AVALIACOES.total} avaliações
            </span>
          </a>

          <h1 id={`${id}-titulo`} className="lp-h1">
            <span className="lp-h1-proc">{linhas[0]}</span>{" "}
            <span className="lp-h1-local">{linhas[1]}</span>
          </h1>

          <p className="lp-frase">{frase}</p>

          <p className="lp-endereco">
            <MapPin aria-hidden="true" />
            <span>
              {CLINICA.local.logradouro.replace(/^R\.\s/, "Rua ")} · {CLINICA.bairro}
            </span>
          </p>

          <div className="lp-acoes">
            <BotaoWhatsApp href={href} principal grande ima>
              {rotulo}
            </BotaoWhatsApp>
            <a href={CLINICA.telefoneHref} className="botao botao-chao botao-grande lp-telefone">
              <Phone aria-hidden="true" />
              {CLINICA.telefone}
            </a>
          </div>

          <ul className="lp-confianca">
            <li>
              <AvataresEquipe max={4} tamanho={40} />
              <span>
                <strong>{DENTISTAS.length} dentistas</strong>
                <span>com registro no CRO</span>
              </span>
            </li>
            <li>
              <span className="pastilha" aria-hidden="true">
                <ShieldCheck />
              </span>
              <span>
                <strong>{CONVENIOS_SITE.length} convênios</strong>
                <a href={`#${conveniosId}`} className="link lp-link-curto">
                  ver quais
                </a>
              </span>
            </li>
            <li>
              <span
                className="lp-ponto"
                data-aberto={situacao?.aberto ? "" : undefined}
                aria-hidden="true"
              />
              <span>
                <strong>{situacao?.aberto ? "Aberto agora" : DIAS_DO_EXPEDIENTE_CURTO}</strong>
                <span>
                  {situacao === null
                    ? FAIXA_DO_EXPEDIENTE
                    : situacao.aberto
                      ? situacao.texto.replace(/^Aberto agora · /, "")
                      : situacao.texto.replace(/^Fechado · /, "")}
                </span>
              </span>
            </li>
          </ul>
        </div>

        <div className="lp-midia">
          <MolduraCoroa medir className="lp-foto-topo">
            <img
              src={foto.src}
              width={foto.largura}
              height={foto.altura}
              sizes="(min-width: 1024px) 40vw, 92vw"
              alt={foto.alt}
              style={foto.posicao ? { objectPosition: foto.posicao } : undefined}
              fetchPriority="high"
              decoding="sync"
            />
          </MolduraCoroa>

          <figure className="vidro flutua lp-vidro-depoimento">
            <Quote aria-hidden="true" />
            <blockquote>“{depoimento.texto}”</blockquote>
            <figcaption>
              {depoimento.autor} · <span>avaliação no Google</span>
            </figcaption>
          </figure>

          <div className="vidro flutua-2 lp-vidro-rt">
            {responsavelFoto && (
              <img src={responsavelFoto} alt="" width={48} height={48} decoding="async" />
            )}
            <span>
              <span className="lp-vidro-papel">Responsável técnica</span>
              <strong>{RESPONSAVEL_TECNICA.nome}</strong>
              <span className="lp-vidro-cro">{RESPONSAVEL_TECNICA.registro}</span>
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
