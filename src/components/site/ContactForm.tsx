import { ChangeEvent, FormEvent, useId, useMemo, useRef, useState } from "react";
import { ArrowUpRight, MessageCircle } from "lucide-react";

import { CONVENIOS, TRATAMENTOS, whatsappLink } from "@/lib/jp";
import { useReferenciaDeCampanha } from "@/components/site/useContatoWhatsApp";
import { rastrearEnvioDeFormulario } from "@/lib/analytics/formulario";
import "@/components/site/home/contato.css";

const PERIODOS = ["Manhã", "Tarde", "Qualquer horário"];
const TRATAMENTO_INDEFINIDO = "Ainda não sei";
const CONVENIO_INDEFINIDO = "Não sei";
const OPCOES_TRATAMENTO = [...TRATAMENTOS.map((t) => t.titulo), TRATAMENTO_INDEFINIDO];
const OPCOES_CONVENIO = [...CONVENIOS.map((c) => c.nome), "Particular", CONVENIO_INDEFINIDO];

/**
 * Registra o lead no CRC antes de abrir o WhatsApp.
 *
 * POR QUE ANTES, E POR QUE SEM ESPERAR RESPOSTA
 * Antes, porque depois de `window.open` a aba perde o foco e uma requisição
 * pendente pode ser cancelada pelo navegador. Sem esperar, porque o lead é
 * nosso problema e a conversa é do visitante: se o servidor estiver fora, ele
 * ainda assim precisa conseguir falar com a clínica.
 *
 * `keepalive` é o que faz a requisição sobreviver à troca de contexto. Toda
 * falha é engolida de propósito: um erro nosso não pode virar mensagem de erro
 * para quem só queria marcar uma avaliação.
 */
function registrarLead(dados: {
  nome: string;
  telefone: string;
  assunto: string;
  contato: string;
  periodo: string;
  convenio: string;
  obs: string;
}): void {
  try {
    void fetch("/api/crc/lead", {
      method: "POST",
      headers: { "content-type": "application/json" },
      keepalive: true,
      body: JSON.stringify({
        nome: dados.nome,
        telefone: dados.telefone,
        mensagem: [
          `Assunto: ${dados.assunto}`,
          `Prefere contato por: ${dados.contato}`,
          `Melhor período: ${dados.periodo}`,
          `Convênio: ${dados.convenio}`,
          dados.obs.trim().length > 0 ? `Mensagem: ${dados.obs.trim()}` : "",
        ]
          .filter((l) => l.length > 0)
          .join(" · "),
        url: typeof window === "undefined" ? "" : window.location.href,
        empresa: "",
      }),
    }).catch(() => undefined);
  } catch {
    // Falha interna nunca deve impedir o visitante de abrir o WhatsApp.
  }
}

/** Um grupo de escolhas: botões de rádio vestidos de etiqueta, com teclado nativo. */
function Escolhas({
  legenda,
  nome,
  opcoes,
  valor,
  aoMudar,
}: {
  legenda: string;
  nome: string;
  opcoes: string[];
  valor: string;
  aoMudar: (v: string) => void;
}) {
  return (
    <fieldset className="cupom-grupo">
      <legend className="text-corpo">{legenda}</legend>
      <div className="cupom-opcoes">
        {opcoes.map((opcao) => (
          <label key={opcao} className="cupom-opcao">
            <input
              type="radio"
              name={nome}
              value={opcao}
              checked={valor === opcao}
              onChange={() => aoMudar(opcao)}
            />
            <span className="text-pequeno">{opcao}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** O fio de furos entre o canhoto e o cupom: bolinhas num padrão, não um filete. */
function Picote({ eixo }: { eixo: "v" | "h" }) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  return (
    <svg className={`cupom-picote cupom-picote-${eixo}`} aria-hidden="true" focusable="false">
      <defs>
        <pattern id={`picote-${id}`} width="14" height="14" patternUnits="userSpaceOnUse">
          <circle cx="7" cy="7" r="2.6" fill="currentColor" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#picote-${id})`} />
    </svg>
  );
}

/**
 * O CUPOM — o formulário de contato da home.
 *
 * Um cupom em verde-maçã, com entalhes e picote: no canhoto, o título; do outro
 * lado, as escolhas. A PRÉVIA mostra, ao vivo, a mesma mensagem que o botão vai
 * abrir no WhatsApp — é só texto na tela, não envia dado a lugar nenhum.
 *
 * Nome e telefone seguem obrigatórios: o lead do CRC exige nome e um contato, e
 * o fluxo de tráfego pago depende disso (E2E `trafego-pago`). O restante vira
 * texto da mensagem.
 */
export function ContactForm() {
  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [tratamento, setTratamento] = useState(TRATAMENTO_INDEFINIDO);
  const [periodo, setPeriodo] = useState("Qualquer horário");
  const [convenio, setConvenio] = useState(CONVENIO_INDEFINIDO);
  const [obs, setObs] = useState("");
  const nomeRef = useRef<HTMLInputElement>(null);
  const telefoneRef = useRef<HTMLInputElement>(null);

  /** O `required` do navegador aceita "   "; o aviso nativo é o mesmo, com texto nosso. */
  const limparAviso = (e: ChangeEvent<HTMLInputElement>) => e.target.setCustomValidity("");

  /* A campanha entra na mensagem do formulário pelo mesmo motivo que entra na
     dos CTAs: sem CRC operacional, é a única ponte entre o anúncio pago e a
     conversa que a recepção atende. `null` quando a visita é orgânica. */
  const referencia = useReferenciaDeCampanha();

  const mensagem = useMemo(() => {
    const linhas = [
      `Olá! Meu nome é ${nome.trim() || "[nome]"}. Vim pelo site da JP Clínica Integrada Odontológica.`,
      tratamento === TRATAMENTO_INDEFINIDO
        ? "Gostaria de agendar uma avaliação; ainda não sei qual tratamento preciso."
        : `Gostaria de falar sobre: ${tratamento}.`,
      `Melhor período para mim: ${periodo}.`,
      `Convênio: ${convenio}.`,
    ];
    if (obs.trim()) linhas.push(`Mensagem: ${obs.trim()}`);
    const corpo = linhas.join("\n");
    return referencia === null ? corpo : `${corpo}\n\nRef.: ${referencia}`;
  }, [nome, tratamento, periodo, convenio, obs, referencia]);

  /**
   * O CRC NÃO É CONDIÇÃO PARA O PACIENTE FALAR COM A CLÍNICA.
   *
   * `registrarLead` é disparado sem `await` e com toda falha engolida. Com o
   * CRC desligado, sem banco ou com o endpoint fora, esta função continua
   * abrindo o WhatsApp: o `window.open` não está atrás de nenhum `await`, de
   * nenhum `then` e de nenhum `catch`.
   *
   * O E2E de tráfego pago roda contra um servidor SEM CRC nenhum configurado,
   * justamente para que isso pare de ser promessa e vire regressão vermelha.
   */
  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    // Só espaços, ou telefone sem DDD+número: avisa e leva o foco ao campo,
    // em vez de um clique que não faz nada. O mínimo espelha o que o CRC exige.
    const invalido = (campo: HTMLInputElement | null, texto: string) => {
      campo?.setCustomValidity(texto);
      campo?.reportValidity();
      return true;
    };
    if (nome.trim().length < 2) return void invalido(nomeRef.current, "Informe seu nome.");
    if (telefone.replace(/\D/g, "").length < 10)
      return void invalido(telefoneRef.current, "Informe um telefone com DDD.");
    // A conversão só conta aqui, depois de validar (o form tem
    // `data-rastreio-proprio`, então o ouvinte global não conta a tentativa).
    rastrearEnvioDeFormulario(event.currentTarget);
    registrarLead({
      nome: nome.trim(),
      telefone: telefone.trim(),
      assunto: tratamento === TRATAMENTO_INDEFINIDO ? "Avaliação geral" : tratamento,
      // O formulário sempre abre o WhatsApp; o campo continua no registro do lead.
      contato: "WhatsApp",
      periodo,
      convenio,
      obs,
    });
    window.open(whatsappLink(mensagem), "_blank", "noopener,noreferrer");
  };

  return (
    <form onSubmit={onSubmit} className="cupom" data-rastreio-proprio>
      <div className="cupom-esq">
        <div className="cupom-cab">
          <h2 id="fale-titulo" className="text-titulo" data-linhas>
            Monte sua mensagem
          </h2>
          <p className="text-corpo">
            Escolha o que você procura e abra o WhatsApp com a mensagem pronta. A recepção responde
            no horário de atendimento.
          </p>
        </div>

        <div className="cupom-previa">
          <p className="text-corpo cupom-previa-rotulo">Prévia do que vai ser enviado</p>
          <p className="cupom-bolha text-pequeno" data-testid="previa-mensagem">
            {mensagem}
          </p>
        </div>

        <div className="cupom-rodape">
          <button type="submit" className="botao botao-tinta" data-ima>
            <MessageCircle aria-hidden="true" />
            Abrir conversa no WhatsApp
            <ArrowUpRight aria-hidden="true" />
          </button>
          <p className="text-pequeno">
            Ao enviar, seus dados serão usados para responder ao contato, organizar sua avaliação e,
            quando houver parâmetros de campanha no endereço acessado, registrar a origem da
            solicitação. Evite inserir informações de saúde desnecessárias no campo de mensagem.
            Veja os detalhes na{" "}
            <a href="/politica-de-privacidade" className="link">
              Política de Privacidade
            </a>
            .
          </p>
        </div>
      </div>

      <div className="cupom-perfura" aria-hidden="true">
        <Picote eixo="v" />
        <Picote eixo="h" />
      </div>

      <div className="cupom-campos">
        <div className="cupom-dados">
          <label className="cupom-campo">
            <span className="text-corpo">Seu nome</span>
            <input
              ref={nomeRef}
              required
              minLength={2}
              name="name"
              autoComplete="name"
              maxLength={120}
              value={nome}
              onChange={(e) => {
                limparAviso(e);
                setNome(e.target.value);
              }}
              placeholder="Como podemos te chamar?"
              className="campo-cupom"
            />
          </label>
          <label className="cupom-campo">
            <span className="text-corpo">Telefone com DDD</span>
            <input
              ref={telefoneRef}
              required
              minLength={10}
              name="tel"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              maxLength={30}
              value={telefone}
              onChange={(e) => {
                limparAviso(e);
                setTelefone(e.target.value);
              }}
              placeholder="(11) 90000-0000"
              className="campo-cupom"
            />
          </label>
        </div>

        <Escolhas
          legenda="O que você procura?"
          nome="subject"
          opcoes={OPCOES_TRATAMENTO}
          valor={tratamento}
          aoMudar={setTratamento}
        />
        <Escolhas
          legenda="Melhor período"
          nome="preferred-period"
          opcoes={PERIODOS}
          valor={periodo}
          aoMudar={setPeriodo}
        />
        <Escolhas
          legenda="Convênio"
          nome="insurance"
          opcoes={OPCOES_CONVENIO}
          valor={convenio}
          aoMudar={setConvenio}
        />

        <label className="cupom-campo">
          <span className="text-corpo">Quer contar mais alguma coisa? (opcional)</span>
          <textarea
            name="message"
            rows={2}
            maxLength={700}
            value={obs}
            onChange={(e) => setObs(e.target.value)}
            placeholder="Uma dúvida, uma queixa, um horário que ajude."
            className="campo-cupom"
          />
        </label>
      </div>
    </form>
  );
}
