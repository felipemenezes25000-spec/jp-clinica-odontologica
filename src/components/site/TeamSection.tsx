import { EQUIPE, FUNDADORA, RESPONSAVEL_TECNICA } from "@/lib/jp";
import { FormaCoroa, MolduraCoroa } from "@/components/site/sistema/Coroa";
import "./home/equipe.css";

/**
 * A seção pública nunca renderiza pessoa marcada como fictícia ou placeholder.
 * A defesa fica aqui, no ponto de exibição: assim um item temporário usado para
 * acertar layout não consegue virar profissional publicado por acidente.
 *
 * Quem saiu da clínica NÃO se resolve com filtro aqui — sai do cadastro em
 * src/lib/jp.ts, junto com a foto. Esconder o card deixa a foto publicada em
 * /assets/ e o nome dentro do JavaScript servido (ver o comentário de EQUIPE).
 */
const EQUIPE_PUBLICA = EQUIPE.filter((pessoa) => !pessoa.ficticio && !pessoa.placeholder);

/**
 * O título da seção promete "nome e CRO": só entra na grade quem tem registro.
 * Quem não é do conselho (recepção) aparece num bloco próprio e com o rótulo
 * que lhe cabe — jamais sob um título que o chama de dentista.
 */
const COM_REGISTRO = EQUIPE_PUBLICA.filter((pessoa) => pessoa.registro);
const SEM_REGISTRO = EQUIPE_PUBLICA.filter((pessoa) => !pessoa.registro);

const funcaoDe = (pessoa: (typeof EQUIPE)[number]) => pessoa.papel ?? pessoa.especialidade ?? "";

/**
 * Retrato. O `data-obturador` (opcional) vai num `div` próprio e não
 * na moldura: o motor anima o `clip-path` do elemento marcado, e o da moldura é
 * a máscara da coroa — trocá-lo por um `inset()` deixaria a foto retangular
 * para sempre depois da entrada. Só o retrato grande abre em obturador; os
 * pequenos entram em cascata pelo `data-item` do `li`, um efeito por retrato.
 *
 * Os PNG da equipe vêm com fundo transparente; o chapado atrás é o da moldura.
 */
function Retrato({
  foto,
  nome,
  proporcao,
  largura = 600,
  altura = 728,
  obturador = false,
  className = "",
}: {
  foto?: string | undefined;
  nome: string;
  proporcao: number;
  largura?: number;
  altura?: number;
  obturador?: boolean;
  className?: string;
}) {
  return (
    <MolduraCoroa proporcao={proporcao} className={`equipe-moldura ${className}`}>
      {foto ? (
        <div {...(obturador ? { "data-obturador": "" } : {})} className="equipe-foto">
          <img
            src={foto}
            alt={`Retrato de ${nome}`}
            loading="lazy"
            decoding="async"
            width={largura}
            height={altura}
          />
        </div>
      ) : null}
    </MolduraCoroa>
  );
}

export function TeamSection() {
  return (
    <section id="equipe" className="equipe secao-curta" aria-labelledby="equipe-titulo">
      <div className="quadro equipe-painel campo-escuro">
        <div className="equipe-cabeca">
          <h2 id="equipe-titulo" className="text-titulo text-sobre-campo" data-linhas>
            Dentistas com nome e CRO
          </h2>
          <p className="text-corpo">
            Atendimento clínico realizado por cirurgiões-dentistas identificados pelo número de
            registro no Conselho Regional de Odontologia.
          </p>
        </div>

        {/* A responsável técnica. Nome, CRO e papel saem de RESPONSAVEL_TECNICA,
            a mesma fonte da linha obrigatória do rodapé — não existe segunda
            versão desses dados. A identificação vem ANTES do rosto: no celular
            o retrato é alto e a primeira tela nunca mostra uma cara sem nome. */}
        <div className="equipe-retrato" data-entra>
          <div className="equipe-carta" data-item>
            <h3 className="text-frase">{RESPONSAVEL_TECNICA.nome}</h3>
            <p className="equipe-cro text-corpo">{RESPONSAVEL_TECNICA.registro}</p>
            <p className="text-pequeno">{RESPONSAVEL_TECNICA.papel}</p>
            <p className="text-pequeno">{FUNDADORA.formacao}</p>
          </div>
          <div className="equipe-retrato-foto">
            <FormaCoroa proporcao={0.66} className="equipe-eco" />
            <Retrato
              foto={RESPONSAVEL_TECNICA.foto}
              nome={RESPONSAVEL_TECNICA.nome}
              proporcao={0.66}
              largura={560}
              altura={683}
              obturador
            />
          </div>
        </div>

        <div className="equipe-demais">
          <ul className="equipe-lista" data-entra>
            {COM_REGISTRO.map((pessoa) => (
              <li key={pessoa.nome} className="equipe-pessoa" data-item>
                <Retrato foto={pessoa.foto} nome={pessoa.nome} proporcao={0.86} />
                <h3 className="equipe-nome">{pessoa.nome}</h3>
                <p className="equipe-funcao text-pequeno">{funcaoDe(pessoa)}</p>
                <p className="equipe-cro text-pequeno">{pessoa.registro}</p>
              </li>
            ))}
          </ul>

          {SEM_REGISTRO.length > 0 ? (
            <div className="equipe-apoio">
              <h3 className="text-corpo">Recepção e apoio</h3>
              <ul>
                {SEM_REGISTRO.map((pessoa) => (
                  <li key={pessoa.nome}>
                    <Retrato foto={pessoa.foto} nome={pessoa.nome} proporcao={0.86} />
                    <div>
                      <p className="equipe-nome">{pessoa.nome}</p>
                      <p className="equipe-funcao text-pequeno">{funcaoDe(pessoa)}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
