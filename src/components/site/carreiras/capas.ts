/**
 * As capas por área da página de vaga: uma foto real da clínica para cada área,
 * e a função que a encontra. Mora separada de `CapaVaga.tsx` porque o Fast
 * Refresh só troca um arquivo que exporta apenas componentes.
 *
 * Só foto sem rosto. A capa de recepção anterior era uma imagem de gerador com
 * uma pessoa sorrindo ao telefone, e a regra do redesenho de 11/2026 é clara:
 * nenhum rosto humano que não seja da equipe real. No lugar entraram os quadros
 * reais da própria clínica (recepção e escritório).
 */
import consultorioImg from "@/assets/consultorio-1.webp";
import consultorioJovemImg from "@/assets/consultorio-2.webp";
import consultorioWideImg from "@/assets/consultorio-wide.webp";
import cantinhoCafeImg from "@/assets/cantinho-cafe-frente.webp";
import escritorioImg from "@/assets/escritorio.webp";
import esterilizacaoImg from "@/assets/esterilizacao.webp";
import recepcaoImg from "@/assets/recepcao.webp";

/**
 * `largura`/`altura` são as dimensões REAIS do arquivo. Não decidem o tamanho
 * na tela (quem manda é o `object-cover` dentro da coroa), mas entregam a
 * proporção antes do download — sem elas o navegador reserva altura zero e a
 * página pula quando a foto entra.
 *
 * `alt` descreve o que a foto mostra, não a vaga: a foto é a mesma para toda
 * vaga da área.
 */
export type Capa = { src: string; largura: number; altura: number; alt: string };

const CAPAS: Record<string, Capa> = {
  dentista: {
    src: consultorioImg,
    largura: 1400,
    altura: 1045,
    alt: "Consultório da JP, com a cadeira e o equipamento prontos para o próximo paciente",
  },
  // Esterilização é literalmente a rotina de ASB/TSB — não é foto de clínica
  // escolhida por ser bonita.
  "asb-tsb": {
    src: esterilizacaoImg,
    largura: 1200,
    altura: 967,
    alt: "Sala de esterilização da JP, com as autoclaves e a bancada organizadas",
  },
  recepcao: {
    // Só existe em 665x480. As "-completa.webp" de 1080x1080 NÃO servem: são
    // posts de Instagram (foto dentro de moldura verde com título e logo), e
    // por dentro da coroa viram uma moldura dentro da moldura. Para não
    // esticar a foto, a coluna da capa na página de vaga é estreita (~470px).
    src: recepcaoImg,
    largura: 665,
    altura: 480,
    alt: "Corredor da recepção da JP, com o balcão e as cadeiras da sala de espera",
  },
  administrativo: {
    src: escritorioImg,
    largura: 665,
    altura: 480,
    alt: "Escritório da JP, com a mesa de trabalho, o computador e as prateleiras de materiais",
  },
  estagio: {
    src: consultorioJovemImg,
    largura: 1200,
    altura: 896,
    alt: "Consultório da JP, com a cadeira odontológica e o armário de apoio",
  },
  outra: {
    src: consultorioWideImg,
    largura: 1500,
    altura: 800,
    alt: "Consultório da JP, com janela grande e luz natural",
  },
};

/**
 * A segunda foto da página de vaga, sempre diferente da capa da mesma área.
 * Mesma regra: só lugar da clínica, nunca rosto.
 */
const SEGUNDAS: Record<string, Capa> = {
  dentista: CAPAS["asb-tsb"] as Capa,
  "asb-tsb": CAPAS["estagio"] as Capa,
  recepcao: CAPAS["outra"] as Capa,
  administrativo: {
    src: cantinhoCafeImg,
    largura: 1200,
    altura: 900,
    alt: "Cantinho do café da clínica, com o purificador de água, a garrafa térmica e a bandeja de café",
  },
  estagio: CAPAS["asb-tsb"] as Capa,
  outra: CAPAS["dentista"] as Capa,
};

export function segundaCapaDaArea(area: string): Capa | null {
  return SEGUNDAS[area] ?? null;
}

/**
 * Área sem capa cadastrada devolve `null`, e quem chama desenha a forma da
 * coroa chapada no lugar. O layout não pode depender de uma imagem que pode
 * não existir.
 */
export function capaDaArea(area: string): Capa | null {
  return CAPAS[area] ?? null;
}
