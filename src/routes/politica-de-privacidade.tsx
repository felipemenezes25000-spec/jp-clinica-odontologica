import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { Check, MessageCircle } from "lucide-react";

import { Footer } from "@/components/site/Footer";
import { Header } from "@/components/site/Header";
import { SkipLink } from "@/components/site/SkipLink";
import { MarcaCoroa } from "@/components/site/sistema/Coroa";
import { TOPO_DA_POLITICA } from "@/components/site/global/estilo-politica";
import { CLINICA, SITE_URL } from "@/lib/jp";
import { descricaoLocal } from "@/lib/seo";

/*
 * A descrição passa pelo `seo.ts` — ela tinha 164 caracteres, e o Google corta
 * perto de 155. `descricaoLocal` junta só as frases que cabem inteiras, então o
 * corte nunca cai no meio de uma palavra.
 *
 * O título fica escrito à mão, e aqui é deliberado: "Política de Privacidade" é
 * o termo que a pessoa procura, e `tituloLocal` acrescentaria "na Freguesia do
 * Ó" — que faz sentido para um procedimento e nenhum para um documento legal.
 * Ele mede 59 caracteres, dentro do limite.
 */
const TITULO = `Política de Privacidade | ${CLINICA.nome}`;
const DESCRICAO = descricaoLocal(
  "Quais dados a JP Clínica Integrada Odontológica recebe pelo site, para que são usados e por quanto tempo.",
  "Saiba como exercer seus direitos pela LGPD.",
);
const ATUALIZADA_EM = "8 de setembro de 2026";

/*
 * Os títulos moram numa lista só: o sumário e as seções leem dela, então um
 * título renomeado muda nos dois lugares. As âncoras são nomes (#cookies), não
 * números — a numeração 01/02 saiu com o redesenho, e um link que sobrevive a
 * uma seção nova no meio do texto vale mais do que a ordem.
 */
const SECOES = [
  { id: "responsavel", titulo: "Quem é responsável pelos dados" },
  { id: "dados-recebidos", titulo: "Quais dados podemos receber pelo site" },
  { id: "cookies", titulo: "Cookies e medição de campanhas" },
  { id: "finalidades", titulo: "Para que usamos esses dados" },
  { id: "dados-sensiveis", titulo: "Dados de saúde e outras informações sensíveis" },
  { id: "compartilhamento", titulo: "Com quem os dados podem ser compartilhados" },
  { id: "retencao", titulo: "Por quanto tempo mantemos os dados" },
  { id: "direitos", titulo: "Seus direitos pela LGPD" },
  { id: "seguranca", titulo: "Segurança e acesso interno" },
  { id: "atualizacoes", titulo: "Atualizações desta política" },
] as const;

type IdSecao = (typeof SECOES)[number]["id"];

function Secao({ id, children }: { id: IdSecao; children: ReactNode }) {
  const titulo = SECOES.find((s) => s.id === id)?.titulo;
  return (
    <section id={id} aria-labelledby={`${id}-titulo`} className="politica-secao">
      <h2 id={`${id}-titulo`} className="text-frase">
        {titulo}
      </h2>
      <div className="politica-texto mt-5 space-y-4">{children}</div>
    </section>
  );
}

/** A seção que está na altura da leitura, para acender o item do sumário. */
function useSecaoAtiva(): string | null {
  const [ativa, setAtiva] = useState<string | null>(null);
  useEffect(() => {
    if (!("IntersectionObserver" in window)) return;
    const io = new IntersectionObserver(
      (entradas) => {
        for (const e of entradas) if (e.isIntersecting) setAtiva(e.target.id);
      },
      // Faixa fina no alto da tela: só a seção que cruza a linha de leitura vale.
      { rootMargin: "-18% 0px -72% 0px" },
    );
    SECOES.forEach((s) => {
      const el = document.getElementById(s.id);
      if (el) io.observe(el);
    });
    return () => io.disconnect();
  }, []);
  return ativa;
}

/** Os links do sumário: a mesma lista serve ao desktop (grudada) e ao celular (recolhida). */
function ListaDoSumario({ ativa }: { ativa: string | null }) {
  return (
    <ul>
      {SECOES.map((secao) => (
        <li key={secao.id}>
          <a
            href={`#${secao.id}`}
            aria-current={ativa === secao.id ? "location" : undefined}
            className="politica-sumario-link text-pequeno"
          >
            <MarcaCoroa className="politica-sumario-marca" />
            {secao.titulo}
          </a>
        </li>
      ))}
    </ul>
  );
}

export const Route = createFileRoute("/politica-de-privacidade")({
  head: () => ({
    meta: [
      { title: TITULO },
      { name: "description", content: DESCRICAO },
      { property: "og:title", content: TITULO },
      { property: "og:description", content: DESCRICAO },
      { property: "og:type", content: "website" },
      { property: "og:locale", content: "pt_BR" },
      { property: "og:url", content: `${SITE_URL}/politica-de-privacidade` },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: `${SITE_URL}/politica-de-privacidade` }],
  }),
  component: PoliticaDePrivacidade,
});

function PoliticaDePrivacidade() {
  const ativa = useSecaoAtiva();

  return (
    <div className="site min-h-dvh">
      <SkipLink />
      <Header />

      <main id="conteudo">
        <section className={`${TOPO_DA_POLITICA} fundo-brilho`} aria-labelledby="politica-titulo">
          <div data-entra className="quadro politica-topo-grade">
            <div>
              <p data-item className="sobretitulo">
                Privacidade e LGPD
              </p>
              <h1 id="politica-titulo" data-item className="politica-titulo">
                Política de Privacidade
              </h1>
              <p data-item className="text-corpo mt-6 max-w-[52ch] text-tinta-suave">
                Esta política explica de forma direta como a {CLINICA.nome} trata os dados enviados
                pelo site, inclusive quando você pede contato, inicia uma conversa no WhatsApp ou se
                candidata a uma vaga.
              </p>
              <p data-item className="selo mt-6">
                Última atualização: {ATUALIZADA_EM}
              </p>
            </div>

            <section data-item aria-labelledby="resumo-titulo" className="cartao politica-resumo">
              <h2 id="resumo-titulo" className="text-frase">
                Em resumo
              </h2>
              <ul className="mt-5 grid gap-3">
                {[
                  ["Transparência", "Você sabe o que entra e para quê."],
                  ["Acesso restrito", "Dados internos não ficam expostos no site."],
                  ["Retenção limitada", "Guardamos pelo tempo necessário ou exigido."],
                  ["Direitos LGPD", "Você pode pedir acesso, correção ou exclusão."],
                ].map(([titulo, texto]) => (
                  <li key={titulo} className="flex items-start gap-3">
                    <span className="politica-check" aria-hidden="true">
                      <Check />
                    </span>
                    <span>
                      <strong className="font-semibold">{titulo}.</strong> {texto}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </section>

        <div className="quadro grid gap-12 pt-[clamp(1rem,0.5rem+2vw,2.5rem)] pb-[clamp(5rem,3rem+6vw,9rem)] lg:grid-cols-[17rem_minmax(0,68ch)] lg:justify-between lg:gap-16">
          {/* Dois sumários, um por largura: no celular ele é um <details> fechado
              (dez itens de 44px empurrariam o texto para uma tela abaixo); no
              desktop é a lista aberta e grudada. O conteúdo é o mesmo. */}
          <details className="politica-sumario-recolhido lg:hidden">
            <summary className="text-pequeno font-semibold">Nesta política</summary>
            <nav aria-label="Nesta política (celular)" className="mt-2">
              <ListaDoSumario ativa={ativa} />
            </nav>
          </details>
          <nav
            aria-label="Nesta política"
            className="politica-sumario hidden lg:block lg:self-start"
          >
            <p className="text-pequeno font-semibold text-tinta-suave">Nesta política</p>
            <div className="mt-3">
              <ListaDoSumario ativa={ativa} />
            </div>
          </nav>

          <div className="min-w-0">
            <Secao id="responsavel">
              <p>
                A controladora dos dados tratados por este site é{" "}
                <strong>{CLINICA.razaoSocial}</strong>, inscrita no CNPJ sob nº{" "}
                <strong>{CLINICA.cnpj}</strong>, com atendimento em {CLINICA.endereco}.
              </p>
              <p>
                Para assuntos de privacidade e proteção de dados, você pode falar com a clínica pelo
                WhatsApp <strong>{CLINICA.whatsapp}</strong> ou pelo telefone{" "}
                <strong>{CLINICA.telefone}</strong> e informar que o assunto é “Privacidade/LGPD”.
              </p>
            </Secao>

            <Secao id="dados-recebidos">
              <p>
                No formulário de contato, recebemos os dados que você preenche: nome, telefone,
                forma de contato preferida, assunto de interesse, melhor período e, se você optar
                por escrever, o conteúdo da mensagem.
              </p>
              <p>
                Quando o acesso ao site contém parâmetros de campanha, também podemos registrar a
                página de origem e identificadores de atribuição presentes na URL — por exemplo UTM,
                gclid ou fbclid — para entender qual divulgação trouxe o contato. Esses parâmetros
                só são registrados quando já estão presentes no endereço acessado.
              </p>
              <p>
                No portal de carreiras, são tratados os dados informados na candidatura e os dados
                constantes do currículo anexado, juntamente com o registro do consentimento
                apresentado no próprio formulário.
              </p>
            </Secao>

            <Secao id="cookies">
              <p>
                O site usa cookies e tecnologias semelhantes para medir o desempenho das divulgações
                da clínica. Eles <strong>não são necessários</strong> para navegar, ver os
                tratamentos, ligar para a clínica ou iniciar uma conversa no WhatsApp — tudo isso
                funciona igual com a medição ligada ou desligada.
              </p>
              <p>
                Na primeira visita, um aviso pergunta se você aceita. Até a resposta, os sinais de
                publicidade e de análise ficam <strong>desativados por padrão</strong> (Google
                Consent Mode). Se você recusar, eles permanecem desativados. A sua escolha fica
                guardada no seu próprio navegador.
              </p>
              <p>
                Para rever a decisão a qualquer momento, use o link <strong>“Rever cookies”</strong>{" "}
                no rodapé de qualquer página — ele apaga a escolha guardada e o aviso volta a
                perguntar.
              </p>
              <p>
                Independentemente de cookies, quando o endereço acessado já contém parâmetros de
                campanha (UTM, <em>gclid</em>, <em>fbclid</em> e equivalentes), o site registra
                esses parâmetros durante a sessão para saber qual divulgação trouxe o contato. São
                identificadores de campanha, não de pessoa: nome, telefone, e-mail e qualquer
                conteúdo que você escreva <strong>não entram</strong> nesse registro nem são
                enviados às ferramentas de análise ou de anúncios.
              </p>
            </Secao>

            <Secao id="finalidades">
              <p>Usamos os dados necessários para:</p>
              <ul className="list-disc space-y-2 pl-5 marker:text-tinta-suave">
                <li>
                  responder ao seu contato e organizar uma avaliação ou atendimento solicitado;
                </li>
                <li>
                  abrir e relacionar corretamente a conversa iniciada pelo site com o WhatsApp;
                </li>
                <li>
                  evitar cadastros duplicados e proteger os formulários contra uso automatizado
                  indevido;
                </li>
                <li>entender a origem de contatos e a efetividade das divulgações da clínica;</li>
                <li>conduzir processos seletivos quando você envia uma candidatura.</li>
              </ul>
              <p>
                O tratamento é realizado com as bases legais aplicáveis previstas na LGPD, de acordo
                com cada finalidade, como procedimentos preliminares solicitados pelo próprio
                titular, cumprimento de obrigações, legítimo interesse dentro dos limites legais e
                consentimento quando ele for necessário.
              </p>
            </Secao>

            <Secao id="dados-sensiveis">
              <p>
                O campo de mensagem do formulário é livre. Por isso, recomendamos que você não envie
                exames, diagnósticos, documentos médicos ou detalhes de saúde que não sejam
                necessários para pedir o primeiro contato.
              </p>
              <p>
                Se você decidir informar algum dado sensível para explicar sua solicitação, a
                clínica poderá tratá-lo somente na medida necessária para compreender e responder ao
                contato, observando as regras específicas da LGPD para dados pessoais sensíveis.
              </p>
            </Secao>

            <Secao id="compartilhamento">
              <p>
                A JP pode utilizar fornecedores de tecnologia estritamente necessários para operar
                seus canais digitais, como serviços de hospedagem, banco de dados, armazenamento,
                mensageria e comunicação. Esses fornecedores tratam dados conforme a função técnica
                contratada e os controles aplicáveis a cada serviço.
              </p>
              <p>
                Ao escolher continuar a conversa pelo WhatsApp ou acessar conteúdos incorporados de
                terceiros, como mapas, passam a valer também os termos e políticas do respectivo
                fornecedor. A JP não vende dados pessoais a terceiros.
              </p>
              <p>
                Dados também poderão ser apresentados quando houver obrigação legal, regulatória,
                ordem de autoridade competente ou necessidade de exercício regular de direitos.
              </p>
            </Secao>

            <Secao id="retencao">
              <p>
                Dados de contato são mantidos pelo período necessário para atender à solicitação,
                preservar o histórico útil do relacionamento e cumprir obrigações legais ou
                regulatórias aplicáveis. Quando não houver mais uma finalidade legítima para a
                guarda, os dados são eliminados ou anonimizados, conforme o caso.
              </p>
              <p>
                Para candidaturas enviadas pelo portal de carreiras, o prazo de retenção informado
                no processo seletivo é de <strong>24 meses</strong>, salvo necessidade legal
                específica ou nova autorização do titular.
              </p>
            </Secao>

            <Secao id="direitos">
              <p>
                Você pode solicitar, conforme a legislação aplicável, confirmação do tratamento,
                acesso aos dados, correção de dados incompletos ou incorretos, informação sobre
                compartilhamentos, anonimização, bloqueio ou eliminação quando cabíveis,
                portabilidade nos termos da regulamentação e revogação do consentimento quando essa
                for a base usada.
              </p>
              <p>
                Para exercer um direito, fale com a clínica pelos canais indicados nesta política e
                informe “Privacidade/LGPD”. Podemos pedir informações adicionais apenas para
                confirmar sua identidade e evitar que dados sejam entregues ou alterados a pedido de
                outra pessoa.
              </p>
            </Secao>

            <Secao id="seguranca">
              <p>
                A clínica adota medidas técnicas e organizacionais para reduzir acesso indevido,
                alteração, perda ou divulgação não autorizada. As áreas internas de RH e
                relacionamento com pacientes não são páginas públicas de consulta e utilizam
                controles de autenticação e autorização.
              </p>
              <p>
                Nenhum ambiente digital é absolutamente imune a incidentes. Se identificarmos um
                evento de segurança que exija comunicação nos termos da legislação, serão adotadas
                as medidas aplicáveis ao caso.
              </p>
            </Secao>

            <Secao id="atualizacoes">
              <p>
                Esta política pode ser atualizada quando o site, os processos da clínica ou a
                legislação mudarem. A data exibida no topo identifica a versão atualmente publicada.
              </p>
            </Secao>

            <section aria-labelledby="duvidas-titulo" className="cartao politica-fecho">
              <h2 id="duvidas-titulo" className="text-frase">
                Dúvidas sobre seus dados?
              </h2>
              <p className="text-corpo mt-3">
                Fale diretamente com a JP e informe que o assunto é Privacidade/LGPD.
              </p>
              <a
                href={CLINICA.whatsappHref}
                target="_blank"
                rel="noopener noreferrer"
                className="botao botao-acento mt-6"
              >
                <MessageCircle aria-hidden="true" />
                Falar pelo WhatsApp
              </a>
            </section>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
