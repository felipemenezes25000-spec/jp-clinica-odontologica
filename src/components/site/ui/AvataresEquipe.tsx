import { AVATAR_POR_NOME, DENTISTAS } from "./avatares";

/**
 * Pilha de rostos sobrepostos — "gente de verdade atende aqui". Decorativa:
 * o texto ao lado diz quantos são e o que significa.
 */
export function AvataresEquipe({
  max = 4,
  tamanho = 44,
  className = "",
}: {
  max?: number;
  tamanho?: number;
  className?: string;
}) {
  const comFoto = DENTISTAS.filter((d) => AVATAR_POR_NOME[d.nome] !== undefined);
  const visiveis = comFoto.slice(0, max);
  const resto = DENTISTAS.length - visiveis.length;

  return (
    <span className={`flex items-center ${className}`} aria-hidden="true">
      {visiveis.map((d, i) => (
        <img
          key={d.nome}
          src={AVATAR_POR_NOME[d.nome]}
          alt=""
          width={tamanho}
          height={tamanho}
          loading="lazy"
          decoding="async"
          className="rounded-full object-cover ring-[3px] ring-[var(--branco)]"
          style={{
            width: tamanho,
            height: tamanho,
            marginLeft: i === 0 ? 0 : -tamanho * 0.3,
            zIndex: visiveis.length - i,
          }}
        />
      ))}
      {resto > 0 && (
        <span
          className="grid place-items-center rounded-full bg-[var(--menta)] text-[0.8rem] font-semibold text-[var(--acento-texto)] ring-[3px] ring-[var(--branco)]"
          style={{ width: tamanho, height: tamanho, marginLeft: -tamanho * 0.3 }}
        >
          +{resto}
        </span>
      )}
    </span>
  );
}
