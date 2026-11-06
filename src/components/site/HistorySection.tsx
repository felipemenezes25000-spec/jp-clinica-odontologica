import { useEffect, useRef } from "react";
import { ChevronDown } from "lucide-react";

import fachada from "@/assets/fachada-2026-completa.webp";
import { CLINICA, FUNDADORA, GESTOR, HISTORIA, MISSAO, RESPONSAVEL_TECNICA } from "@/lib/jp";
import { FormaCoroa, MarcaCoroa, MolduraCoroa } from "@/components/site/sistema/Coroa";
import { carregarGsap, querMenosMovimento } from "@/components/site/sistema/gsap";
import "./home/historia.css";

/** "R. Rio Verde, 1029" é como o cadastro escreve; na frase, a rua por extenso. */
const RUA = CLINICA.local.logradouro.replace(/^R\.\s/, "Rua ");

/**
 * Os capítulos da linha do tempo. Tudo sai de HISTORIA em src/lib/jp.ts: nenhum
 * motivo, data ou nome é acrescentado aqui além do que a clínica informou.
 *
 * O ano não usa data-numero: o motor formata em pt-BR e o rolo passaria por
 * "1.962", "2.002" — ano não é quantidade. Quem troca o ano é a cena.
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
    nota: `A marca ${HISTORIA.nomeAnterior} acabou registrada em Ourinhos, no interior de São Paulo, e foi preciso trocar. Mesma equipe, mesmos pacientes, nome novo.`,
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
 * rodapé usa para a linha obrigatória. Nome e CRO dela aparecem em 9 rotas —
 * não podem existir em duas versões. Os textos de apresentação são das
 * próprias pessoas e ficam literais.
 */
const PESSOAS = [
  {
    nome: RESPONSAVEL_TECNICA.nome,
    papel: RESPONSAVEL_TECNICA.papel ?? "",
    registro: RESPONSAVEL_TECNICA.registro,
    // Sem `formacao`: a formação dela já está na seção da equipe, logo acima, e
    // repeti-la aqui era preenchimento. Nome e CRO ficam, porque há retrato.
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
  /** Sem foto, a coroa fica chapada e o layout continua íntegro. */
  foto?: string | undefined;
  largura: number;
  altura: number;
  /** Só a apresentação da fundadora veio com um título próprio. */
  titulo?: string;
  texto: readonly string[];
}) {
  const [primeiro, ...resto] = texto;

  return (
    <article className="historia-pessoa" data-item>
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

      <div>
        <h4 className="text-frase">{nome}</h4>
        <p className="historia-pessoa-papel text-corpo">{papel}</p>
        {registro ? <p className="historia-pessoa-registro text-pequeno">{registro}</p> : null}
        {formacao ? <p className="historia-pessoa-formacao text-pequeno">{formacao}</p> : null}
        {ligacao ? (
          <a className="link historia-pessoa-ligacao text-pequeno" href={ligacao.href}>
            {ligacao.rotulo}
          </a>
        ) : null}

        {titulo ? <p className="historia-pessoa-titulo text-corpo">{titulo}</p> : null}
        <p className="historia-pessoa-texto text-corpo">{primeiro}</p>

        {resto.length > 0 ? (
          <details className="historia-mais text-corpo">
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

export function HistorySection() {
  const cenaRef = useRef<HTMLDivElement>(null);

  // A CENA 2: só desktop, só com movimento. A altura da cena e o primeiro
  // capítulo vêm do CSS (historia.css), já no HTML do servidor — se viessem
  // daqui, tudo abaixo da seção saltaria ~3000px quando o GSAP chegasse. O que
  // este efeito faz é ligar a rolagem: o ano sobe de trás da própria janela, a
  // frase acende, o nome da clínica troca em 2020 e a fachada abre em 2024.
  // Celular e "reduzir movimento" ficam com a lista vertical, que é a
  // composição final e não depende de nada disto.
  useEffect(() => {
    if (querMenosMovimento()) return;
    const cena = cenaRef.current;
    if (!cena) return;

    let desfazer = () => {};
    let vivo = true;

    carregarGsap()
      .then(({ gsap }) => {
        if (!vivo) return;
        const mm = gsap.matchMedia();
        mm.add("(min-width: 1024px)", () => {
          const caps = gsap.utils.toArray<HTMLElement>(".historia-cap", cena);
          const missao = cena.querySelector<HTMLElement>(".historia-missao");
          const marcas = gsap.utils.toArray<HTMLElement>(".historia-marcas > li", cena);
          const nomes = gsap.utils.toArray<HTMLElement>(".historia-nome > span", cena);
          const quadro = cena.querySelector<HTMLElement>(".historia-quadro");
          const imagem = quadro?.querySelector<HTMLElement>("img");
          const eco = cena.querySelector<SVGElement>(".historia-eco");
          if (!missao || !quadro || !imagem || caps.length === 0) return;

          // Cada passo é { li, ano, textos } e a missão entra como o último.
          const passos = [
            ...caps.map((li) => ({
              li,
              ano: li.querySelector<HTMLElement>(".historia-ano > span"),
              textos: Array.from(
                li.querySelectorAll<HTMLElement>(".historia-frase, .historia-nota"),
              ),
            })),
            {
              li: missao,
              ano: null,
              textos: Array.from(missao.querySelectorAll<HTMLElement>("blockquote, figcaption")),
            },
          ];
          const fim = passos.length - 1;

          // Estado inicial (o CSS já o desenha; repetido aqui para o GSAP ser
          // dono dos valores). Opacidade, e não visibility: quem lê por leitor
          // de tela continua alcançando todos os capítulos.
          passos.slice(1).forEach(({ li, ano, textos }) => {
            gsap.set(li, { opacity: 0 });
            gsap.set(textos, { opacity: 0, y: 28 });
            if (ano) gsap.set(ano, { yPercent: 112 });
          });
          gsap.set(quadro, { clipPath: "inset(100% 0% 0% 0%)" });
          gsap.set(imagem, { scale: 1.14 });
          if (nomes[1]) gsap.set(nomes[1], { opacity: 0, yPercent: 30 });

          const tl = gsap.timeline({
            defaults: { ease: "none" },
            scrollTrigger: {
              trigger: cena,
              start: "top top",
              end: "bottom bottom",
              scrub: true,
              invalidateOnRefresh: true,
            },
          });

          // Uma unidade de tempo por passo; a troca acontece em torno de cada
          // fronteira b, e o trecho entre trocas é a pausa de leitura.
          for (let b = 1; b < passos.length; b++) {
            const saindo = passos[b - 1]!;
            const entrando = passos[b]!;

            if (saindo.ano) {
              tl.to(saindo.ano, { yPercent: -112, duration: 0.4, ease: "power3.in" }, b - 0.4);
            }
            tl.to(
              saindo.textos,
              { opacity: 0, y: -28, duration: 0.3, ease: "power2.in", stagger: 0.04 },
              b - 0.4,
            )
              .to(saindo.li, { opacity: 0, duration: 0.01 }, b - 0.02)
              .to(entrando.li, { opacity: 1, duration: 0.01 }, b - 0.1);

            if (entrando.ano) {
              tl.fromTo(
                entrando.ano,
                { yPercent: 112 },
                { yPercent: 0, duration: 0.45, ease: "power3.out" },
                b - 0.1,
              );
            }
            tl.fromTo(
              entrando.textos,
              { opacity: 0, y: 28 },
              { opacity: 1, y: 0, duration: 0.4, ease: "power2.out", stagger: 0.06 },
              b + 0.02,
            );

            // O indicador conta os anos; a missão não é um quinto capítulo.
            if (marcas[b]) {
              tl.to(marcas[b - 1]!, { opacity: 0.5, duration: 0.2 }, b - 0.2).to(
                marcas[b]!,
                { opacity: 1, duration: 0.2 },
                b - 0.2,
              );
            }
          }

          // 2020: a mesma casa troca de nome, e o nome dentro da coroa troca junto.
          if (nomes[0] && nomes[1]) {
            tl.to(nomes[0], { opacity: 0, yPercent: -30, duration: 0.35, ease: "power2.in" }, 0.65);
            tl.to(nomes[1], { opacity: 1, yPercent: 0, duration: 0.45, ease: "power3.out" }, 0.95);
          }
          // 2024: a fachada de hoje abre de baixo para cima dentro da coroa e
          // assenta; depois deriva devagar até o fim da cena. Antes de 2024 a
          // coroa fica chapada — esta casa não é a de 2002 nem a de 2020.
          tl.to(
            quadro,
            { clipPath: "inset(0% 0% 0% 0%)", duration: 0.9, ease: "power4.inOut" },
            1.7,
          );
          tl.to(imagem, { scale: 1, duration: 1.1, ease: "power2.out" }, 1.7);
          tl.to(imagem, { scale: 1.06, duration: fim - 3 + 0.6 }, 3);
          if (eco) tl.fromTo(eco, { y: 0 }, { y: -28, duration: fim + 0.6 }, 0);

          // Pausa final: a missão fica lida antes de a cena soltar a rolagem.
          tl.to({}, { duration: 0.6 }, fim);
        });
        desfazer = () => mm.revert();
      })
      .catch(() => {
        // O GSAP não chegou: volta para a lista vertical, que já é a página
        // inteira. Sem isto a cena ficaria alta, parada no primeiro capítulo.
        cena.removeAttribute("data-cena");
      });

    return () => {
      vivo = false;
      desfazer();
    };
  }, []);

  return (
    <section id="historia" className="historia campo-escuro" aria-labelledby="historia-titulo">
      {/* data-cena já vai no HTML do servidor: é ele que reserva a altura da
          cena (só em desktop e com movimento, ver historia.css). */}
      <div ref={cenaRef} className="historia-cena" data-cena="">
        <div className="historia-palco">
          <div className="quadro historia-grade">
            {/* "cuidando de sorrisos" e não "da Freguesia do Ó": a clínica só
                está neste endereço desde 2024, e os 24 anos são de dois
                bairros. Quem conta o trajeto é a linha do tempo logo abaixo. */}
            <h2 id="historia-titulo" className="historia-titulo text-titulo" data-linhas>
              {HISTORIA.anos} anos cuidando de sorrisos
            </h2>

            <div className="historia-foto">
              <FormaCoroa proporcao={0.75} className="historia-eco" />
              <MolduraCoroa medir proporcao={0.75} className="historia-moldura">
                {/* Só existem na cena: o nome que a clínica tinha em cada
                    momento, dentro da coroa ainda vazia. A lista ao lado já diz
                    o mesmo em texto. */}
                <p className="historia-nome" aria-hidden="true">
                  <span className="text-titulo">{HISTORIA.nomeAnterior}</span>
                  <span>JP</span>
                </p>
                <div className="historia-quadro">
                  <img
                    src={fachada}
                    alt={`Fachada da ${CLINICA.nome}, na ${RUA}, com o letreiro verde e o portão branco`}
                    loading="lazy"
                    decoding="async"
                    width={1086}
                    height={1448}
                  />
                </div>
              </MolduraCoroa>
            </div>

            <div className="historia-caps">
              <ol className="historia-lista" aria-label="Linha do tempo da clínica">
                {CAPITULOS.map((cap) => (
                  <li key={cap.ano} className="historia-cap">
                    <p className="historia-ano">
                      <span>{cap.ano}</span>
                    </p>
                    <p className="historia-frase text-frase">{cap.frase}</p>
                    <p className="historia-nota text-corpo">{cap.nota}</p>
                  </li>
                ))}
              </ol>

              {/* A missão, transcrita do quadro na parede da clínica: texto
                  literal. Fecha a cena. */}
              <figure className="historia-missao">
                <blockquote className="text-frase">{MISSAO}</blockquote>
                <figcaption className="text-pequeno">
                  Missão da {CLINICA.nome}, como está no quadro da parede da clínica.
                </figcaption>
              </figure>

              <ol className="historia-marcas text-pequeno" aria-hidden="true">
                {CAPITULOS.map((cap) => (
                  <li key={cap.ano}>
                    <MarcaCoroa />
                    {cap.ano}
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </div>
      </div>

      {/* Depois da cena: as duas pessoas à frente da clínica. "Gestão e
          fundação" cobre as duas sem generalizar: fundação é ela, gestão é ele.
          "Nossos fundadores" diria por ele algo que a apresentação dele não diz. */}
      <div className="quadro historia-pessoas" data-entra>
        <div className="historia-pessoas-lide">
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
    </section>
  );
}
