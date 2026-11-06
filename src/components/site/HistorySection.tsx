import { ChevronDown, MapPin, Quote } from "lucide-react";

import fachada from "@/assets/fachada-2026-completa.webp";
import { CLINICA, FUNDADORA, GESTOR, HISTORIA, MISSAO, RESPONSAVEL_TECNICA } from "@/lib/jp";
import { MolduraCoroa } from "@/components/site/sistema/Coroa";
import "./home/historia.css";

/** "R. Rio Verde, 1029" é como o cadastro escreve; na frase, a rua por extenso. */
const RUA = CLINICA.local.logradouro.replace(/^R\.\s/, "Rua ");

/**
 * Os capítulos da linha do tempo. Tudo sai de HISTORIA em src/lib/jp.ts: nenhum
 * motivo, data ou nome é acrescentado aqui além do que a clínica informou.
 *
 * O ano é texto, não número: ano não é quantidade e não pode passar por
 * formatação de milhar ("2.002").
 */
const CAPITULOS: ReadonlyArray<{
  ano: string;
  frase: string;
  nota: string;
}> = [
  {
    ano: String(HISTORIA.fundacao),
    frase: `Nasce a ${HISTORIA.nomeAnterior}, em ${HISTORIA.regiaoAnterior}.`,
    nota: `Aberta em ${HISTORIA.fundacaoData}, na ${HISTORIA.bairroAnterior}.`,
  },
  {
    ano: String(HISTORIA.renomeacao),
    frase: `Em ${HISTORIA.renomeacaoMes}, a mesma casa passa a se chamar JP.`,
    // O motivo é o que a clínica informou em 15/09/2026. Sem ele, quem foi
    // paciente da Sempre Sorrindo lia "JP, desde 2002" e não sabia que é a
    // mesma casa.
    nota: `A marca ${HISTORIA.nomeAnterior} acabou registrada em Ourinhos, no interior de São Paulo, e foi preciso trocar. Mesma clínica, nome novo.`,
  },
  {
    ano: String(HISTORIA.mudanca),
    frase: `Em ${HISTORIA.mudancaMes}, mudamos para a ${RUA}.`,
    nota: `${CLINICA.local.bairro}, na região da ${HISTORIA.regiaoAtual}. Mesmo cuidado, novo endereço.`,
  },
  {
    ano: "Hoje",
    // Os 24 anos já estão no título da seção; aqui a frase diz a quem a casa atende.
    frase: "Cuidamos de crianças, adultos e idosos.",
    nota: "A JP acompanha gerações de pacientes com o mesmo compromisso: escutar com atenção, orientar com clareza e cuidar com responsabilidade.",
  },
];

/**
 * As duas pessoas à frente da clínica — as duas reais, cada uma com o rótulo
 * que lhe cabe. O do gestor é o cargo; o dela vem com o CRO, porque é dentista
 * e o registro é o que o paciente precisa poder conferir.
 *
 * Ela não é redigitada aqui: sai de RESPONSAVEL_TECNICA, a mesma fonte que o
 * rodapé usa para a linha obrigatória. Os textos de apresentação são das
 * próprias pessoas e ficam literais.
 */
const PESSOAS = [
  {
    nome: RESPONSAVEL_TECNICA.nome,
    papel: RESPONSAVEL_TECNICA.papel ?? "",
    registro: RESPONSAVEL_TECNICA.registro,
    foto: RESPONSAVEL_TECNICA.foto,
    ligacao: { href: "#equipe", rotulo: "Ver na equipe" },
    largura: 560,
    altura: 683,
    titulo: FUNDADORA.titulo,
    texto: FUNDADORA.texto,
  },
  {
    nome: GESTOR.nome,
    papel: GESTOR.papel,
    formacao: GESTOR.formacao,
    foto: GESTOR.foto,
    largura: 318,
    altura: 336,
    texto: GESTOR.texto,
  },
];

/**
 * Uma pessoa do bloco: retrato, identificação e a apresentação dela.
 *
 * O primeiro parágrafo fica sempre visível e o resto abre no <details>. As duas
 * apresentações somam doze parágrafos — inteiras e abertas, transformavam o
 * bloco numa parede de texto. Nada fica escondido do buscador: o texto todo
 * está no HTML servido, só recolhido.
 */
function Pessoa({
  nome,
  papel,
  registro,
  formacao,
  ligacao,
  foto,
  largura,
  altura,
  titulo,
  texto,
}: {
  nome: string;
  papel: string;
  registro?: string | undefined;
  formacao?: string;
  /** Atalho para onde a pessoa já está apresentada em outra seção. */
  ligacao?: { href: string; rotulo: string };
  /** Sem foto, a moldura fica lisa e o layout continua íntegro. */
  foto?: string | undefined;
  largura: number;
  altura: number;
  /** Só a apresentação da fundadora veio com um título próprio. */
  titulo?: string;
  texto: readonly string[];
}) {
  const [primeiro, ...resto] = texto;

  return (
    <article className="historia-pessoa cartao" data-item>
      <MolduraCoroa proporcao={0.86} className="historia-retrato">
        {foto ? (
          <img
            src={foto}
            alt={`Retrato de ${nome}`}
            loading="lazy"
            decoding="async"
            width={largura}
            height={altura}
          />
        ) : null}
      </MolduraCoroa>

      <div className="historia-pessoa-corpo">
        <h4 className="text-frase">{nome}</h4>
        <p className="historia-pessoa-papel">{papel}</p>
        {registro ? <p className="historia-pessoa-detalhe text-pequeno">{registro}</p> : null}
        {formacao ? <p className="historia-pessoa-detalhe text-pequeno">{formacao}</p> : null}
        {ligacao ? (
          <a className="link historia-pessoa-ligacao text-pequeno" href={ligacao.href}>
            {ligacao.rotulo}
          </a>
        ) : null}

        {titulo ? <p className="historia-pessoa-titulo">{titulo}</p> : null}
        <p className="historia-pessoa-texto">{primeiro}</p>

        {resto.length > 0 ? (
          <details className="historia-mais">
            <summary>
              Ler a história completa
              <ChevronDown aria-hidden="true" />
            </summary>
            {resto.map((paragrafo, i) => (
              <p key={`${i}-${paragrafo.slice(0, 24)}`}>{paragrafo}</p>
            ))}
          </details>
        ) : null}
      </div>
    </article>
  );
}

/**
 * A HISTÓRIA — compacta. Título, a fachada de hoje e a linha do tempo lado a
 * lado; a missão em destaque; e as duas pessoas à frente da clínica. Sem cena
 * de rolagem: tudo está no lugar desde o primeiro desenho.
 */
export function HistorySection() {
  return (
    <section id="historia" className="historia secao" aria-labelledby="historia-titulo">
      <div className="quadro">
        <header className="historia-cabeca" data-entra>
          <div data-item>
            <p className="sobretitulo">Nossa história</p>
            {/* "cuidando de sorrisos" e não "da Freguesia do Ó": a clínica só
                está neste endereço desde 2024, e os 24 anos são de dois
                bairros. Quem conta o trajeto é a linha do tempo. */}
            <h2 id="historia-titulo" className="historia-titulo text-titulo">
              {HISTORIA.anos} anos cuidando de sorrisos
            </h2>
          </div>
          <p className="historia-lide text-corpo" data-item>
            Da {HISTORIA.nomeAnterior}, em {HISTORIA.regiaoAnterior}, à JP na {HISTORIA.regiaoAtual}
            : a mesma casa e o mesmo jeito de cuidar.
          </p>
        </header>

        <div className="historia-corpo" data-entra>
          <figure className="historia-foto" data-item>
            <MolduraCoroa medir className="historia-moldura">
              <img
                src={fachada}
                alt={`Fachada da ${CLINICA.nome}, na ${RUA}, com o letreiro verde e o portão branco`}
                loading="lazy"
                decoding="async"
                width={1086}
                height={1448}
              />
            </MolduraCoroa>
            <figcaption className="vidro historia-selo text-pequeno">
              <MapPin aria-hidden="true" />
              <span>
                {RUA} · {CLINICA.local.bairro}
              </span>
            </figcaption>
          </figure>

          <ol className="historia-linha" aria-label="Linha do tempo da clínica">
            {CAPITULOS.map((cap) => (
              <li key={cap.ano} className="historia-cap cartao" data-item>
                <p className="historia-ano">{cap.ano}</p>
                <div>
                  <p className="historia-frase">{cap.frase}</p>
                  <p className="historia-nota">{cap.nota}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>

        {/* A missão, transcrita do quadro na parede da clínica: texto literal. */}
        <figure className="historia-missao" data-entra>
          <span className="pastilha historia-aspas" aria-hidden="true" data-item>
            <Quote />
          </span>
          <div data-item>
            <blockquote className="text-frase">{MISSAO}</blockquote>
            <figcaption className="text-pequeno">
              Missão da {CLINICA.nome}, como está no quadro da parede da clínica.
            </figcaption>
          </div>
        </figure>

        {/* "Gestão e fundação" cobre as duas pessoas sem generalizar: fundação é
            ela, gestão é ele. "Nossos fundadores" diria por ele algo que a
            apresentação dele não diz. */}
        <div className="historia-pessoas" data-entra>
          <div className="historia-pessoas-lide" data-item>
            <h3 className="text-frase">Gestão e fundação</h3>
            <p className="text-corpo">
              Pessoas que acreditam no poder do cuidado e nas relações de confiança.
            </p>
          </div>

          <div className="historia-pessoas-grade">
            {PESSOAS.map((pessoa) => (
              <Pessoa key={pessoa.nome} {...pessoa} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
