import { createFileRoute } from "@tanstack/react-router";
import {
  ArrowLeft,
  BriefcaseBusiness,
  Database,
  FileCheck2,
  LockKeyhole,
  MessageCircle,
  ShieldCheck,
  UserRoundCheck,
} from "lucide-react";

import { Footer } from "@/components/site/Footer";
import { Header } from "@/components/site/Header";
import { SkipLink } from "@/components/site/SkipLink";
import { CLINICA, SITE_URL } from "@/lib/jp";

const TITULO = `Política de Privacidade | ${CLINICA.nome}`;
const DESCRICAO =
  "Entenda quais dados a JP Clínica Integrada Odontológica coleta pelo site, para que são usados, por quanto tempo são mantidos e como exercer seus direitos pela LGPD.";
const ATUALIZADA_EM = "8 de setembro de 2026";

type BlocoProps = {
  numero: string;
  titulo: string;
  children: React.ReactNode;
};

function Bloco({ numero, titulo, children }: BlocoProps) {
  return (
    <section className="border-t border-forest/10 py-9 sm:py-11">
      <div className="grid gap-5 md:grid-cols-[90px_1fr] md:gap-8">
        <div className="font-display text-sm font-extrabold tracking-[.14em] text-brand-text">
          {numero}
        </div>
        <div>
          <h2 className="font-display text-2xl font-extrabold tracking-[-.035em] text-forest-2 sm:text-3xl">
            {titulo}
          </h2>
          <div className="mt-5 space-y-4 text-[15px] leading-7 text-ink-soft sm:text-base">
            {children}
          </div>
        </div>
      </div>
    </section>
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
  return (
    <div className="min-h-dvh bg-cream">
      <SkipLink />
      <Header />

      <main id="conteudo">
        <section className="relative isolate overflow-hidden bg-brand-deep py-14 text-white sm:py-18 lg:py-24">
          <div
            aria-hidden="true"
            className="absolute -right-24 -top-24 h-80 w-80 rounded-full border border-lime/15"
          />
          <div
            aria-hidden="true"
            className="absolute -right-8 -top-8 h-60 w-60 rounded-full border border-lime/10"
          />

          <div className="jp-container relative z-10">
            <a
              href="/"
              className="inline-flex items-center gap-2 text-sm font-semibold text-white/75 transition hover:text-lime"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Voltar ao site
            </a>

            <div className="mt-10 max-w-4xl">
              <div className="eyebrow text-lime">
                <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                Privacidade e proteção de dados
              </div>
              <h1 className="mt-6 font-display text-[clamp(3rem,8vw,6.8rem)] font-black leading-[.86] tracking-[-.065em] text-white">
                Seus dados merecem <span className="text-lime">clareza e cuidado.</span>
              </h1>
              <p className="mt-7 max-w-2xl text-base font-medium leading-7 text-white/70 sm:text-lg">
                Esta política explica de forma direta como a {CLINICA.nome} trata os dados enviados
                pelo site, inclusive quando você pede contato, inicia uma conversa no WhatsApp ou se
                candidata a uma vaga.
              </p>
              <p className="mt-5 text-xs font-bold uppercase tracking-[.12em] text-white/50">
                Última atualização: {ATUALIZADA_EM}
              </p>
            </div>
          </div>
        </section>

        <section className="jp-container py-10 sm:py-14 lg:py-18">
          <div className="mx-auto max-w-5xl">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {[
                [UserRoundCheck, "Transparência", "Você sabe o que entra e para quê."],
                [LockKeyhole, "Acesso restrito", "Dados internos não ficam expostos no site."],
                [Database, "Retenção limitada", "Guardamos pelo tempo necessário ou exigido."],
                [FileCheck2, "Direitos LGPD", "Você pode pedir acesso, correção ou exclusão."],
              ].map(([Icon, titulo, texto]) => {
                const C = Icon as typeof ShieldCheck;
                return (
                  <div
                    key={String(titulo)}
                    className="rounded-[22px] border border-forest/10 bg-white p-5 shadow-[0_18px_50px_rgba(3,47,1,.04)]"
                  >
                    <span className="grid h-10 w-10 place-items-center rounded-full bg-mint text-primary-ink">
                      <C className="h-4.5 w-4.5" aria-hidden="true" />
                    </span>
                    <p className="mt-4 font-display text-base font-extrabold text-forest-2">
                      {String(titulo)}
                    </p>
                    <p className="mt-1 text-xs leading-5 text-ink-soft">{String(texto)}</p>
                  </div>
                );
              })}
            </div>

            <div className="mt-10 rounded-[28px] border border-forest/10 bg-white px-6 shadow-[0_24px_70px_rgba(3,47,1,.05)] sm:px-9 lg:px-12">
              <Bloco numero="01" titulo="Quem é responsável pelos dados">
                <p>
                  A controladora dos dados tratados por este site é <strong>{CLINICA.razaoSocial}</strong>,
                  inscrita no CNPJ sob nº <strong>{CLINICA.cnpj}</strong>, com atendimento em {CLINICA.endereco}.
                </p>
                <p>
                  Para assuntos de privacidade e proteção de dados, você pode falar com a clínica pelo
                  WhatsApp <strong>{CLINICA.whatsapp}</strong> ou pelo telefone <strong>{CLINICA.telefone}</strong> e
                  informar que o assunto é “Privacidade/LGPD”.
                </p>
              </Bloco>

              <Bloco numero="02" titulo="Quais dados podemos receber pelo site">
                <p>
                  No formulário de contato, recebemos os dados que você preenche: nome, telefone,
                  forma de contato preferida, assunto de interesse, melhor período e, se você optar por
                  escrever, o conteúdo da mensagem.
                </p>
                <p>
                  Quando o acesso ao site contém parâmetros de campanha, também podemos registrar a
                  página de origem e identificadores de atribuição presentes na URL — por exemplo UTM,
                  gclid ou fbclid — para entender qual divulgação trouxe o contato. Esses parâmetros só
                  são registrados quando já estão presentes no endereço acessado.
                </p>
                <p>
                  No portal de carreiras, são tratados os dados informados na candidatura e os dados
                  constantes do currículo anexado, juntamente com o registro do consentimento apresentado
                  no próprio formulário.
                </p>
              </Bloco>

              <Bloco numero="03" titulo="Para que usamos esses dados">
                <p>Usamos os dados necessários para:</p>
                <ul className="list-disc space-y-2 pl-5 marker:text-brand-text">
                  <li>responder ao seu contato e organizar uma avaliação ou atendimento solicitado;</li>
                  <li>abrir e relacionar corretamente a conversa iniciada pelo site com o WhatsApp;</li>
                  <li>evitar cadastros duplicados e proteger os formulários contra uso automatizado indevido;</li>
                  <li>entender a origem de contatos e a efetividade das divulgações da clínica;</li>
                  <li>conduzir processos seletivos quando você envia uma candidatura.</li>
                </ul>
                <p>
                  O tratamento é realizado com as bases legais aplicáveis previstas na LGPD, de acordo
                  com cada finalidade, como procedimentos preliminares solicitados pelo próprio titular,
                  cumprimento de obrigações, legítimo interesse dentro dos limites legais e consentimento
                  quando ele for necessário.
                </p>
              </Bloco>

              <Bloco numero="04" titulo="Dados de saúde e outras informações sensíveis">
                <p>
                  O campo de mensagem do formulário é livre. Por isso, recomendamos que você não envie
                  exames, diagnósticos, documentos médicos ou detalhes de saúde que não sejam necessários
                  para pedir o primeiro contato.
                </p>
                <p>
                  Se você decidir informar algum dado sensível para explicar sua solicitação, a clínica
                  poderá tratá-lo somente na medida necessária para compreender e responder ao contato,
                  observando as regras específicas da LGPD para dados pessoais sensíveis.
                </p>
              </Bloco>

              <Bloco numero="05" titulo="Com quem os dados podem ser compartilhados">
                <p>
                  A JP pode utilizar fornecedores de tecnologia estritamente necessários para operar seus
                  canais digitais, como serviços de hospedagem, banco de dados, armazenamento, mensageria
                  e comunicação. Esses fornecedores tratam dados conforme a função técnica contratada e
                  os controles aplicáveis a cada serviço.
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
              </Bloco>

              <Bloco numero="06" titulo="Por quanto tempo mantemos os dados">
                <p>
                  Dados de contato são mantidos pelo período necessário para atender à solicitação,
                  preservar o histórico útil do relacionamento e cumprir obrigações legais ou regulatórias
                  aplicáveis. Quando não houver mais uma finalidade legítima para a guarda, os dados são
                  eliminados ou anonimizados, conforme o caso.
                </p>
                <p>
                  Para candidaturas enviadas pelo portal de carreiras, o prazo de retenção informado no
                  processo seletivo é de <strong>24 meses</strong>, salvo necessidade legal específica ou
                  nova autorização do titular.
                </p>
              </Bloco>

              <Bloco numero="07" titulo="Seus direitos pela LGPD">
                <p>
                  Você pode solicitar, conforme a legislação aplicável, confirmação do tratamento,
                  acesso aos dados, correção de dados incompletos ou incorretos, informação sobre
                  compartilhamentos, anonimização, bloqueio ou eliminação quando cabíveis, portabilidade
                  nos termos da regulamentação e revogação do consentimento quando essa for a base usada.
                </p>
                <p>
                  Para exercer um direito, fale com a clínica pelos canais indicados nesta política e
                  informe “Privacidade/LGPD”. Podemos pedir informações adicionais apenas para confirmar
                  sua identidade e evitar que dados sejam entregues ou alterados a pedido de outra pessoa.
                </p>
              </Bloco>

              <Bloco numero="08" titulo="Segurança e acesso interno">
                <p>
                  A clínica adota medidas técnicas e organizacionais para reduzir acesso indevido,
                  alteração, perda ou divulgação não autorizada. As áreas internas de RH e relacionamento
                  com pacientes não são páginas públicas de consulta e utilizam controles de autenticação
                  e autorização.
                </p>
                <p>
                  Nenhum ambiente digital é absolutamente imune a incidentes. Se identificarmos um evento
                  de segurança que exija comunicação nos termos da legislação, serão adotadas as medidas
                  aplicáveis ao caso.
                </p>
              </Bloco>

              <Bloco numero="09" titulo="Atualizações desta política">
                <p>
                  Esta política pode ser atualizada quando o site, os processos da clínica ou a legislação
                  mudarem. A data exibida no topo identifica a versão atualmente publicada.
                </p>
              </Bloco>
            </div>

            <div className="mt-8 grid gap-5 rounded-[28px] bg-brand-deep p-6 text-white sm:p-8 md:grid-cols-[1fr_auto] md:items-center">
              <div>
                <div className="flex items-center gap-2 text-lime">
                  <BriefcaseBusiness className="h-4 w-4" aria-hidden="true" />
                  <span className="text-xs font-bold uppercase tracking-[.12em]">Dúvidas sobre seus dados?</span>
                </div>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-white/70">
                  Fale diretamente com a JP e informe que o assunto é Privacidade/LGPD.
                </p>
              </div>
              <a
                href={CLINICA.whatsappHref}
                target="_blank"
                rel="noopener noreferrer"
                className="button-primary w-full md:w-auto"
              >
                <MessageCircle className="h-4.5 w-4.5" aria-hidden="true" />
                Falar pelo WhatsApp
              </a>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
