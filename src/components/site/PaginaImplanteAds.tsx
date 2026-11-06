import { Bone, ClipboardList, FileSearch, HeartHandshake, Puzzle, Smile } from "lucide-react";

import consultorioImplantes1Img from "@/assets/consultorio-implantes-1.webp";
import fachadaImg from "@/assets/fachada-2026-completa.webp";
import videoImplante from "@/assets/video-implante.mp4?url";
import posterImplante from "@/assets/video-implante-poster.webp";
import { FloatingCTA } from "@/components/site/FloatingCTA";
import { Header } from "@/components/site/Header";
import {
  Avaliacoes,
  Convenios,
  Endereco,
  Equipe,
  Fechamento,
  Passos,
  Perguntas,
  PorQue,
  Rodape,
  SecaoVideo,
} from "@/components/site/lp/Secoes";
import { Topo } from "@/components/site/lp/Topo";
import { SkipLink } from "@/components/site/SkipLink";
import { useContatoWhatsApp } from "@/components/site/useContatoWhatsApp";
import { fotoDoTratamento } from "@/components/site/tratamento/fotos-dos-tratamentos";
import { DEPOIMENTOS, TRATAMENTOS } from "@/lib/jp";

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
    icone: FileSearch,
    titulo: "Exames antes da indicação",
    texto:
      "Histórico, condição bucal e exames necessários entram no planejamento antes de indicar qualquer caminho.",
  },
  {
    icone: ClipboardList,
    titulo: "Plano explicado por etapas",
    texto:
      "A equipe conversa sobre possibilidades, sequência do tratamento, cuidados e o que precisa ser confirmado por exames.",
  },
  {
    icone: HeartHandshake,
    titulo: "Acompanhamento profissional",
    texto:
      "Cirurgia, fase protética e manutenção fazem parte de um cuidado que continua depois do procedimento.",
  },
] as const;

const DUVIDAS_CHAVE = [
  {
    icone: Smile,
    titulo: "Falta só um dente",
    texto:
      "Um dente isolado também pode ser avaliado para implante. A indicação depende da região, dos dentes vizinhos e das condições clínicas.",
  },
  {
    icone: Puzzle,
    titulo: "Uso prótese removível",
    texto:
      "Quem usa prótese pode conversar sobre alternativas com implantes para melhorar estabilidade, quando houver indicação.",
  },
  {
    icone: Bone,
    titulo: "Não sei se tenho osso",
    texto:
      "O volume ósseo é analisado por exame. Quando necessário, a equipe explica quais possibilidades podem preparar a região.",
  },
] as const;

/** Depoimento real da ficha do Google, curto e sobre o cuidado, para o cartão do topo. */
const DEPOIMENTO_PRINCIPAL = DEPOIMENTOS[1];

/** A foto do implante, a mesma do cartão da home, no "Como funciona". */
const FOTO_IMPLANTE = fotoDoTratamento("implantes-dentarios");

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
          depoimento={DEPOIMENTO_PRINCIPAL}
          provaId="prova-social-implante"
          conveniosId="convenios-implante"
        />

        <Convenios id="convenios-implante" rotulo="Perguntar pelo meu convênio" href={wa} />

        <PorQue
          id="planejamento-implante"
          sobre="Por que fazer na JP"
          titulo="Implante começa pelo diagnóstico"
          intro="A decisão depende da condição bucal, da região a ser reabilitada, dos exames e dos objetivos de cada paciente. O tratamento só faz sentido quando essas peças se encaixam."
          itens={PONTOS}
          rotulo="Quero entender meu caso"
          href={wa}
          apoio="Sem compromisso: a conversa começa pelo WhatsApp."
        />

        <SecaoVideo
          id="video-implante"
          sobre="Entenda o conceito"
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

        <PorQue
          id="duvidas-implante"
          sobre="Seu caso"
          titulo="Não sabe se é caso de implante?"
          intro="A avaliação existe justamente para entender o que está faltando, quais exames ajudam e quais alternativas precisam ser consideradas."
          itens={DUVIDAS_CHAVE}
          rotulo="Tirar minha dúvida"
          href={wa}
          layout="lista"
        />

        <Passos
          id="como-funciona-implante"
          sobre="Como funciona"
          titulo="Um passo de cada vez"
          texto="O cronograma muda conforme o caso. A lógica do cuidado, porém, continua sendo avaliação, planejamento, tratamento e acompanhamento."
          etapas={IMPLANTE.etapas}
          foto={FOTO_IMPLANTE}
          legendaFoto="Implante dentário com a coroa"
          rotulo="Começar pela avaliação"
          href={wa}
          invertido
        />

        <Equipe
          id="equipe-implante"
          titulo="Dentistas identificados pelo CRO"
          texto="Cada profissional aparece com o registro no conselho. A responsável técnica da clínica responde pelo atendimento."
          rotulo="Falar com a recepção"
          href={wa}
        />

        <Avaliacoes
          id="prova-social-implante"
          titulo="O que pacientes dizem da JP"
          rotulo="Quero conversar com a recepção"
          href={wa}
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
          rotulo="Perguntar no WhatsApp"
          href={wa}
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
