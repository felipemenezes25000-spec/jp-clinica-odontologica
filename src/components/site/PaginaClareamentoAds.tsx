import { HeartHandshake, ShieldCheck, UserRoundCheck } from "lucide-react";

import consultorio1Img from "@/assets/consultorio-1.webp";
import esterilizacaoImg from "@/assets/esterilizacao.webp";
import fachadaImg from "@/assets/fachada-2026-completa.webp";
import videoClareamento from "@/assets/video-clareamento.mp4?url";
import posterClareamento from "@/assets/video-clareamento-poster.webp";
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
import { DEPOIMENTOS } from "@/lib/jp";

/**
 * LANDING PAGE DE ANÚNCIO — clareamento dental.
 *
 * Mesma lógica da de implantes: a pessoa veio de um anúncio de busca e a página
 * a leva ao WhatsApp da recepção, sem saída para outro assunto. O clareamento é
 * o tratamento em que a promessa de "tom" é mais tentadora, e é justamente a que
 * o CFO e a clínica não fazem: o texto fala de avaliação, sensibilidade e
 * acompanhamento, nunca de resultado, preço ou desconto.
 */

const ASSUNTO = "Clareamento dental";

const BENEFICIOS = [
  {
    icone: ShieldCheck,
    titulo: "Saúde bucal em primeiro lugar",
    texto: "A condição dos dentes e da gengiva é observada antes de definir o protocolo.",
  },
  {
    icone: UserRoundCheck,
    titulo: "Planejamento individual",
    texto: "Sensibilidade, histórico e expectativa entram na conversa para orientar a indicação.",
  },
  {
    icone: HeartHandshake,
    titulo: "Acompanhamento profissional",
    texto: "A equipe orienta os cuidados antes, durante e depois do clareamento.",
  },
] as const;

const ETAPAS = [
  {
    titulo: "Converse com a recepção",
    texto:
      "Você chama no WhatsApp para saber valores, horários e como funciona a avaliação de clareamento.",
  },
  {
    titulo: "Faça a avaliação",
    texto: "A equipe examina sua saúde bucal e entende o que você espera do tratamento.",
  },
  {
    titulo: "Entenda o protocolo",
    texto:
      "Depois da avaliação, o profissional explica a abordagem indicada, os cuidados e o acompanhamento.",
  },
] as const;

const FAQ = [
  {
    pergunta: "Todo mundo pode fazer clareamento dental?",
    resposta:
      "Não necessariamente. A indicação depende da avaliação clínica, da saúde bucal e das características individuais de cada paciente.",
  },
  {
    pergunta: "E se eu tiver sensibilidade nos dentes?",
    resposta:
      "A sensibilidade precisa ser considerada no planejamento. Na avaliação, a equipe verifica seu caso e orienta a abordagem adequada.",
  },
  {
    pergunta: "Quantas sessões são necessárias?",
    resposta:
      "Não existe um número único para todas as pessoas. O protocolo e o acompanhamento são definidos de acordo com o caso e com a resposta ao tratamento.",
  },
  {
    pergunta: "O resultado fica igual para todo mundo?",
    resposta:
      "Não. A resposta ao clareamento varia. O objetivo é trabalhar dentro do que é possível e indicado para cada sorriso, sem prometer um tom específico.",
  },
  {
    pergunta: "Quanto custa o clareamento?",
    resposta:
      "O valor depende do protocolo indicado para o seu caso. Pelo WhatsApp, a recepção explica como funciona a avaliação e pode orientar as condições atuais antes do agendamento.",
  },
] as const;

/** Depoimento real da ficha do Google, curto e sobre o atendimento, para o cartão do topo. */
const DEPOIMENTO_PRINCIPAL = DEPOIMENTOS[4];

export function PaginaClareamentoAds() {
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
          id="hero-clareamento"
          linhas={["Clareamento dental", "na Freguesia do Ó"]}
          frase="Descubra valores, horários e como funciona a avaliação antes de decidir. A conversa começa direto com a recepção da JP."
          rotulo="Valores e horários do clareamento"
          href={wa}
          foto={{
            src: consultorio1Img,
            largura: 1400,
            altura: 1045,
            alt: "Consultório da JP Clínica Odontológica, com a cadeira de atendimento junto à janela",
            posicao: "64% 50%",
          }}
          depoimento={DEPOIMENTO_PRINCIPAL}
          provaId="prova-social"
          conveniosId="convenios"
        />

        <Convenios id="convenios" rotulo="Perguntar pelo meu convênio" href={wa} />

        <PorQue
          id="beneficios"
          sobre="Por que fazer na JP"
          titulo="O plano começa pelo seu sorriso"
          intro="Antes de falar em técnica, a equipe considera sua saúde bucal, sensibilidade, histórico e expectativa. É isso que transforma uma escolha estética em um planejamento individual."
          itens={BENEFICIOS}
          rotulo="Valores e horários do clareamento"
          href={wa}
          apoio="Sem compromisso: a conversa começa pelo WhatsApp."
        />

        <SecaoVideo
          id="video-clareamento"
          sobre="Entenda o processo"
          titulo="Veja como funciona"
          texto="A animação mostra, de forma geral, como o gel e a moldeira são usados, para você visualizar o tratamento antes da conversa com a equipe. Ela ajuda a entender o processo, mas não substitui o exame clínico nem define qual protocolo será indicado."
          itens={[
            "A indicação é individual",
            "Sensibilidade entra no planejamento",
            "A equipe explica cuidados e acompanhamento",
          ]}
          video={{
            src: videoClareamento,
            poster: posterClareamento,
            descricao:
              "Seringa de gel clareador e a moldeira usada para aplicar o produto nos dentes.",
          }}
          legenda="Animação ilustrativa. A técnica e a indicação dependem da avaliação de cada paciente."
          rotulo="Valores e horários do clareamento"
          href={wa}
          invertido
        />

        <Passos
          id="como-funciona"
          sobre="Como funciona"
          titulo="Simples para começar"
          texto="Você não precisa chegar sabendo qual técnica quer. A jornada começa com informação e avança para a avaliação individual."
          etapas={ETAPAS}
          foto={{
            src: esterilizacaoImg,
            largura: 1200,
            altura: 967,
            alt: "Sala de esterilização da JP, com a bancada, a autoclave, as pias e os armários",
            posicao: "35% 50%",
          }}
          legendaFoto="Sala de esterilização da JP"
          rotulo="Começar pela conversa"
          href={wa}
        />

        <Equipe
          id="equipe-clareamento"
          titulo="Dentistas identificados pelo CRO"
          texto="Cada profissional aparece com o registro no conselho. A responsável técnica da clínica responde pelo atendimento."
          rotulo="Falar com a recepção"
          href={wa}
        />

        <Avaliacoes
          id="prova-social"
          titulo="O que pacientes dizem da JP"
          rotulo="Quero conversar com a recepção"
          href={wa}
        />

        <Endereco
          id="estrutura"
          titulo="Perto de você, para conhecer"
          foto={{
            src: fachadaImg,
            largura: 1086,
            altura: 1448,
            alt: "Fachada verde da JP Clínica Odontológica na Rua Rio Verde, número 1029",
          }}
          rotulo="Consultar valores e horários"
          href={wa}
          invertido
        />

        <Perguntas
          id="duvidas"
          titulo="Dúvidas antes de chamar"
          texto="Aqui você encontra o que é geral. A indicação do seu caso depende de avaliação profissional individual."
          itens={FAQ}
          rotulo="Perguntar no WhatsApp"
          href={wa}
        />

        <Fechamento
          id="cta-final"
          titulo="Primeiro, entenda. Depois, decida"
          texto="Chame a recepção da JP no WhatsApp para saber valores, horários e como funciona a avaliação de clareamento."
          rotulo="Chamar no WhatsApp"
          href={wa}
        />
      </main>

      <Rodape aviso="Conteúdo informativo. Indicações, técnica e resultados dependem de avaliação profissional individual." />

      <FloatingCTA
        assunto={ASSUNTO}
        intencao="informacoes"
        titulo="Pensando em clareamento?"
        subtitulo="Veja valores, horários e como funciona a avaliação antes de decidir."
        rotulo="Falar no WhatsApp"
        mostrarNoMobileDesdeInicio
      />
    </div>
  );
}
