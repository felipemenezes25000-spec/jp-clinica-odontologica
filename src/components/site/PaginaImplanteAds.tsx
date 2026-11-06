import consultorioImplantes1Img from "@/assets/consultorio-implantes-1.webp";
import equipamentoImg from "@/assets/equipamento.webp";
import esterilizacaoImg from "@/assets/esterilizacao.webp";
import fachadaImg from "@/assets/fachada-2026-completa.webp";
import videoImplante from "@/assets/video-implante.mp4?url";
import posterImplante from "@/assets/video-implante-poster.webp";
import { FloatingCTA } from "@/components/site/FloatingCTA";
import { Header } from "@/components/site/Header";
import {
  Confianca,
  Endereco,
  Escada,
  Etapas,
  Fechamento,
  Linhas,
  Perguntas,
  Rodape,
  SecaoVideo,
} from "@/components/site/lp/Secoes";
import { Topo } from "@/components/site/lp/Topo";
import { SkipLink } from "@/components/site/SkipLink";
import { useContatoWhatsApp } from "@/components/site/useContatoWhatsApp";
import { DEPOIMENTOS, HISTORIA, TRATAMENTOS } from "@/lib/jp";

/**
 * LANDING PAGE DE ANÚNCIO — implantes dentários.
 *
 * Quem chega aqui clicou num anúncio de busca: a página existe para levar essa
 * pessoa ao WhatsApp da recepção, sem saída para outro assunto (o cabeçalho é o
 * enxuto e não há "outros tratamentos"). Nenhuma promessa de resultado, prazo,
 * preço ou desconto: o texto fala de avaliação e de exames, que é o que a
 * clínica pode afirmar.
 */

const ASSUNTO = "Implantes dentários";

// Numa IIFE, e não num `if` solto: o componente é uma `function`, e o
// TypeScript não leva o estreitamento do módulo para dentro dela.
const IMPLANTE = (() => {
  const tratamento = TRATAMENTOS.find((item) => item.slug === "implantes-dentarios");
  if (!tratamento) {
    throw new Error("Tratamento de implantes não encontrado em TRATAMENTOS.");
  }
  return tratamento;
})();

const PONTOS = [
  {
    titulo: "Exames antes da indicação",
    texto:
      "Histórico, condição bucal e exames necessários entram no planejamento antes de indicar qualquer caminho.",
  },
  {
    titulo: "Plano explicado por etapas",
    texto:
      "A equipe conversa sobre possibilidades, sequência do tratamento, cuidados e o que precisa ser confirmado por exames.",
  },
  {
    titulo: "Acompanhamento profissional",
    texto:
      "Cirurgia, fase protética e manutenção fazem parte de um cuidado que continua depois do procedimento.",
  },
] as const;

const DUVIDAS_CHAVE = [
  {
    titulo: "Falta só um dente",
    texto:
      "Um dente isolado também pode ser avaliado para implante. A indicação depende da região, dos dentes vizinhos e das condições clínicas.",
  },
  {
    titulo: "Uso prótese removível",
    texto:
      "Quem usa prótese pode conversar sobre alternativas com implantes para melhorar estabilidade, quando houver indicação.",
  },
  {
    titulo: "Não sei se tenho osso",
    texto:
      "O volume ósseo é analisado por exame. Quando necessário, a equipe explica quais possibilidades podem preparar a região.",
  },
] as const;

/** Depoimento real da ficha do Google, escolhido pelo que diz do cuidado. */
const DEPOIMENTO_PRINCIPAL = DEPOIMENTOS[1];

export function PaginaImplanteAds() {
  const wa = useContatoWhatsApp("informacoes", ASSUNTO);

  if (!DEPOIMENTO_PRINCIPAL) {
    throw new Error("Depoimento esperado não encontrado em DEPOIMENTOS.");
  }

  return (
    <div className="site min-h-dvh overflow-x-clip">
      <SkipLink />
      <Header enxuto />

      <main id="conteudo">
        <Topo
          id="hero-implantes"
          linhas={["Implantes dentários", "na Freguesia do Ó"]}
          frase="O plano começa na avaliação. Converse com a recepção da JP para entender os exames, as etapas, os valores e os horários antes de decidir."
          rotulo="Valores e horários de implante"
          href={wa}
          foto={{
            src: consultorioImplantes1Img,
            largura: 1200,
            altura: 1500,
            alt: "Consultório da JP Clínica Odontológica preparado para o atendimento, com a cadeira e o equipamento",
          }}
        />

        <Escada
          id="planejamento-implante"
          titulo="Implante começa pelo diagnóstico"
          intro="A decisão depende da condição bucal, da região a ser reabilitada, dos exames e dos objetivos de cada paciente. O tratamento só faz sentido quando essas peças se encaixam."
          pontos={PONTOS}
          foto={{
            src: equipamentoImg,
            largura: 1200,
            altura: 967,
            alt: "Painel do equipamento odontológico da JP, com as canetas e os comandos organizados",
            posicao: "50% 38%",
          }}
          rotulo="Quero entender meu caso"
          href={wa}
        />

        <SecaoVideo
          id="video-implante"
          titulo="Implante, pilar e coroa"
          texto="A animação ajuda a visualizar como as partes da reabilitação se relacionam. Ela explica o conceito, mas não determina o procedimento do seu caso nem substitui exames ou avaliação clínica."
          itens={[
            "O implante fica na região óssea",
            "A fase protética vem depois do planejamento cirúrgico",
            "Tempo e etapas variam conforme o caso",
          ]}
          video={{
            src: videoImplante,
            poster: posterImplante,
            descricao:
              "Implante fixado no osso recebendo o pilar e a coroa até formar a reabilitação protética.",
          }}
          legenda="Animação ilustrativa. Etapas, técnica e indicação dependem da avaliação individual."
          rotulo="Consultar avaliação e horários"
          href={wa}
        />

        <Linhas
          id="duvidas-implante"
          titulo="Não sabe se é caso de implante?"
          intro="A avaliação existe justamente para entender o que está faltando, quais exames ajudam e quais alternativas precisam ser consideradas."
          itens={DUVIDAS_CHAVE}
        />

        <Etapas
          id="como-funciona-implante"
          titulo="Um passo de cada vez"
          texto="O cronograma muda conforme o caso. A lógica do cuidado, porém, continua sendo avaliação, planejamento, tratamento e acompanhamento."
          etapas={IMPLANTE.etapas}
          foto={{
            src: esterilizacaoImg,
            largura: 1200,
            altura: 967,
            alt: "Sala de esterilização da JP, com a bancada, a autoclave, as pias e os armários",
            posicao: "35% 50%",
          }}
          invertido
        />

        <Confianca
          id="prova-social-implante"
          titulo={`Há ${String(HISTORIA.anos)} anos na Freguesia do Ó`}
          texto="A JP atende na região da Freguesia do Ó. Você pode conhecer a estrutura e conversar com a equipe antes de decidir."
          principal={DEPOIMENTO_PRINCIPAL}
          invertido
        />

        <Endereco
          id="estrutura-implante"
          titulo="Venha conhecer antes de decidir"
          foto={{
            src: fachadaImg,
            largura: 1086,
            altura: 1448,
            alt: "Fachada verde da JP Clínica Odontológica na Rua Rio Verde, número 1029",
          }}
          rotulo="Ver valores e horários"
          href={wa}
        />

        <Perguntas
          id="faq-implante"
          titulo="Perguntas sobre implantes"
          texto="As respostas são gerais. Exames, indicação, técnica e cronograma dependem da avaliação profissional individual."
          itens={IMPLANTE.faq.map((item) => ({ pergunta: item.q, resposta: item.a }))}
        />

        <Fechamento
          id="cta-final-implante"
          titulo="Primeiro, entenda o seu caso"
          texto="Chame a recepção da JP para saber como funciona a avaliação de implantes, os valores e os horários disponíveis."
          rotulo="Chamar no WhatsApp"
          href={wa}
        />
      </main>

      <Rodape aviso="Conteúdo informativo. Indicação, técnica, exames, etapas e resultados dependem de avaliação profissional individual." />

      <FloatingCTA
        assunto={ASSUNTO}
        intencao="informacoes"
        titulo="Pensando em implante?"
        subtitulo="Veja avaliação, valores, horários e como funcionam as etapas antes de decidir."
        rotulo="Falar no WhatsApp"
        mostrarNoMobileDesdeInicio
      />
    </div>
  );
}
