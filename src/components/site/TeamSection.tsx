import { GraduationCap } from "lucide-react";

import { EQUIPE, FUNDADORA, RESPONSAVEL_TECNICA } from "@/lib/jp";
import { MolduraCoroa } from "@/components/site/sistema/Coroa";
import { AvataresEquipe } from "@/components/site/ui/AvataresEquipe";
import { DENTISTAS } from "@/components/site/ui/avatares";
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
 * Quem não é do conselho (recepção) aparece numa linha própria e com o rótulo
 * que lhe cabe — jamais sob um título que o chama de dentista.
 */
const COM_REGISTRO = EQUIPE_PUBLICA.filter((pessoa) => pessoa.registro);
const SEM_REGISTRO = EQUIPE_PUBLICA.filter((pessoa) => !pessoa.registro);

const funcaoDe = (pessoa: (typeof EQUIPE)[number]) => pessoa.papel ?? pessoa.especialidade ?? "";

/** Os PNG da equipe vêm com fundo transparente; o chapado atrás é o da moldura. */
function Retrato({
  foto,
  nome,
  proporcao,
  largura = 600,
  altura = 728,
  className = "",
}: {
  foto?: string | undefined;
  nome: string;
  proporcao: number;
  largura?: number;
  altura?: number;
  className?: string;
}) {
  return (
    <MolduraCoroa proporcao={proporcao} className={`equipe-moldura ${className}`}>
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
  );
}

export function TeamSection() {
  return (
    <section
      id="equipe"
      className="equipe secao bg-chao text-tinta"
      aria-labelledby="equipe-titulo"
    >
      <div className="quadro">
        <div className="equipe-cabeca" data-entra>
          <div data-item>
            <p className="sobretitulo">Quem atende você</p>
            <h2 id="equipe-titulo" className="text-titulo mt-4">
              Dentistas com nome e CRO
            </h2>
          </div>
          <p className="text-corpo equipe-intro" data-item>
            Atendimento clínico realizado por cirurgiões-dentistas identificados pelo número de
            registro no Conselho Regional de Odontologia.
          </p>
        </div>

        {/* A responsável técnica. Nome, CRO e papel saem de RESPONSAVEL_TECNICA,
            a mesma fonte da linha obrigatória do rodapé — não existe segunda
            versão desses dados. */}
        <article className="equipe-destaque cartao" data-entra>
          <div className="equipe-destaque-foto" data-item>
            <Retrato
              foto={RESPONSAVEL_TECNICA.foto}
              nome={RESPONSAVEL_TECNICA.nome}
              proporcao={560 / 683}
              largura={560}
              altura={683}
            />
          </div>
          <div className="equipe-destaque-texto" data-item>
            <p className="selo equipe-selo">Responsável técnica</p>
            <h3 className="text-frase">{RESPONSAVEL_TECNICA.nome}</h3>
            <p className="equipe-cro equipe-cro-grande">{RESPONSAVEL_TECNICA.registro}</p>
            <p className="text-corpo equipe-papel">{RESPONSAVEL_TECNICA.papel}</p>
            <p className="equipe-formacao text-pequeno">
              <span className="pastilha" aria-hidden="true">
                <GraduationCap />
              </span>
              <span>{FUNDADORA.formacao}</span>
            </p>
            <p className="equipe-time text-pequeno">
              <AvataresEquipe max={5} tamanho={44} />
              <span>
                <strong>{DENTISTAS.length} dentistas</strong> com registro no CRO atendem na clínica
              </span>
            </p>
          </div>
        </article>

        <ul className="equipe-lista" data-entra>
          {COM_REGISTRO.map((pessoa) => (
            <li key={pessoa.nome} className="equipe-pessoa cartao cartao-vivo" data-item>
              <Retrato foto={pessoa.foto} nome={pessoa.nome} proporcao={600 / 728} />
              <div className="equipe-pessoa-texto">
                <h3 className="equipe-nome">{pessoa.nome}</h3>
                <p className="equipe-funcao text-pequeno">{funcaoDe(pessoa)}</p>
                <p className="equipe-cro text-pequeno">{pessoa.registro}</p>
              </div>
            </li>
          ))}
        </ul>

        {SEM_REGISTRO.length > 0 ? (
          <div className="equipe-apoio" data-entra>
            <h3 className="equipe-apoio-titulo text-pequeno" data-item>
              Recepção e apoio
            </h3>
            <ul>
              {SEM_REGISTRO.map((pessoa) => (
                <li key={pessoa.nome} data-item>
                  <Retrato
                    foto={pessoa.foto}
                    nome={pessoa.nome}
                    proporcao={1}
                    className="equipe-apoio-foto"
                  />
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
    </section>
  );
}
