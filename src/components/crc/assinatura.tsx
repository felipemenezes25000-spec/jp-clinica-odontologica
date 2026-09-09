/**
 * Os componentes que só existem porque ESTE produto existe.
 *
 * Um painel genérico tem cartão, tabela e gráfico. Estes três não cabem em
 * nenhum outro sistema porque descrevem mecanismos que são deste: por que
 * alguém está no topo da fila, em que ponto do dia estamos, e se a máquina
 * está mesmo trabalhando agora.
 *
 * REGRA QUE TODOS SEGUEM: a cor nunca comunica sozinha. Cada barra tem `title`,
 * cada faixa é repetida em texto ao lado, e o pulso diz em palavras se está
 * ativo. Quem usa leitor de tela recebe exatamente a mesma informação — e quem
 * enxerga cor recebe a leitura rápida por cima.
 */
import { useEffect, useState } from "react";

/* -------------------------------------------------------------------------- */
/* O porquê                                                                   */
/* -------------------------------------------------------------------------- */

export type RazaoDaNota = {
  /** "Faltou na consulta", "Disse que quer marcar". */
  rotulo: string;
  /** O peso. Negativo é desconto — quem já tem consulta, quem já foi contatado. */
  peso: number;
};

/**
 * A nota da fila, aberta nas razões que a somam.
 *
 * É O COMPONENTE-ASSINATURA DO SISTEMA. Todo CRM ordena por um número; o que
 * nenhum mostra é de onde o número veio. Aqui a recepcionista deixa de
 * "confiar no sistema" e passa a CONCORDAR com ele — e quando discorda, sabe
 * de qual parcela discorda, que é a única forma de a regra melhorar.
 *
 * OS DESCONTOS APARECEM SEPARADOS, e hachurados. Eles são a promessa do
 * produto ("não incomodamos quem já tem consulta marcada"), e escondê-los
 * porque "não somam" seria esconder justamente a parte que protege o paciente.
 */
export function Porque({
  total,
  razoes,
  compacto = false,
}: {
  total: number;
  razoes: readonly RazaoDaNota[];
  /** Sem a lista escrita — para caber dentro de uma linha da fila. */
  compacto?: boolean;
}) {
  const positivas = razoes.filter((r) => r.peso > 0);
  const descontos = razoes.filter((r) => r.peso < 0);

  // A soma dos POSITIVOS é o denominador, e não o total: o total já vem com os
  // descontos aplicados, e usar ele faria as fatias somarem mais de 100% da
  // barra — o tipo de erro que ninguém vê e que deixa a última fatia cortada.
  const somaPositiva = positivas.reduce((n, r) => n + r.peso, 0);
  if (somaPositiva <= 0) return null;

  return (
    <div className="crc-porque">
      <div
        className="crc-porque-barra"
        role="img"
        aria-label={`Nota ${String(total)}, formada por: ${razoes
          .map((r) => `${r.rotulo} ${r.peso > 0 ? "+" : ""}${String(r.peso)}`)
          .join(", ")}.`}
      >
        {positivas.map((r, i) => (
          <span
            key={r.rotulo}
            className={`crc-porque-fatia crc-porque-f${String(Math.min(5, i + 1))}`}
            style={{ width: `${String((r.peso / somaPositiva) * 100)}%` }}
            title={`${r.rotulo}: +${String(r.peso)}`}
          />
        ))}
      </div>

      {!compacto && (
        <ul className="crc-porque-lista">
          {positivas.map((r, i) => (
            <li key={r.rotulo}>
              <span
                className={`crc-porque-ponto crc-porque-f${String(Math.min(5, i + 1))}`}
                aria-hidden="true"
              />
              <span>{r.rotulo}</span>
              <span className="crc-porque-peso">+{r.peso}</span>
            </li>
          ))}
          {descontos.map((r) => (
            <li key={r.rotulo}>
              <span className="crc-porque-ponto crc-porque-fatia-desconta" aria-hidden="true" />
              <span>{r.rotulo}</span>
              <span className="crc-porque-peso">{r.peso}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* A fita do dia                                                              */
/* -------------------------------------------------------------------------- */

function minutosDe(hhmm: string): number {
  const [h, m] = hhmm.split(":");
  return Number.parseInt(h ?? "0", 10) * 60 + Number.parseInt(m ?? "0", 10);
}

/**
 * A janela de atendimento, com o agora marcado.
 *
 * TEMPO É A MATÉRIA DESTE SISTEMA: a espera de duas horas depois da falta, o
 * intervalo mínimo entre contatos, a mensagem que é ADIADA e não cancelada
 * quando o expediente fecha. Um painel comum esconde isso numa linha de texto
 * ("horário comercial: 08:00–19:00"); esta fita mostra onde estamos no dia e,
 * quando há envio agendado, em que ponto ele vai cair.
 *
 * É a explicação visual de por que a mensagem de alguém "ainda não saiu".
 *
 * A FITA COBRE DAS 6h ÀS 22h, e não as 24 horas. Madrugada em branco ocuparia
 * um terço da largura para dizer que nada acontece — e comprimiria justamente
 * as horas em que tudo acontece.
 */
export function FitaDoDia({
  inicio,
  fim,
  marcas = [],
  agora,
}: {
  /** "08:00" — abertura. `null` quando a clínica não atende hoje. */
  inicio: string | null;
  fim: string | null;
  /** Envios agendados para hoje, em "HH:MM". */
  marcas?: readonly string[];
  /** Injetável para teste; no uso normal é o relógio de parede. */
  agora?: Date;
}) {
  const [instante, setInstante] = useState(() => agora ?? new Date());

  useEffect(() => {
    if (agora !== undefined) return;
    // Um minuto: o marcador precisa acompanhar o dia, e mais frequente que
    // isso é bateria gasta para mover dois pixels.
    const t = setInterval(() => {
      setInstante(new Date());
    }, 60_000);
    return () => {
      clearInterval(t);
    };
  }, [agora]);

  const INICIO_FITA = 6 * 60;
  const FIM_FITA = 22 * 60;
  const largura = FIM_FITA - INICIO_FITA;
  const posicao = (min: number): number =>
    Math.max(0, Math.min(100, ((min - INICIO_FITA) / largura) * 100));

  const minutosAgora = instante.getHours() * 60 + instante.getMinutes();
  const fechada = inicio === null || fim === null;

  return (
    <div>
      <div className="crc-fita">
        {!fechada && (
          <div
            className="crc-fita-janela"
            style={{
              left: `${String(posicao(minutosDe(inicio)))}%`,
              right: `${String(100 - posicao(minutosDe(fim)))}%`,
            }}
          />
        )}

        {marcas.map((m) => (
          <span
            key={m}
            className="crc-fita-marca"
            style={{ left: `${String(posicao(minutosDe(m)))}%` }}
            title={`Envio previsto para ${m}`}
          />
        ))}

        <div
          className="crc-fita-agora"
          style={{ left: `${String(posicao(minutosAgora))}%` }}
          role="img"
          aria-label={`Agora são ${String(instante.getHours()).padStart(2, "0")}:${String(
            instante.getMinutes(),
          ).padStart(2, "0")}. ${
            fechada ? "A clínica não atende hoje." : `O atendimento vai das ${inicio} às ${fim}.`
          }`}
        />
      </div>

      <div className="crc-fita-horas" aria-hidden="true">
        <span>06h</span>
        <span>10h</span>
        <span>14h</span>
        <span>18h</span>
        <span>22h</span>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* O pulso                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * O sinal de que a máquina está trabalhando.
 *
 * Uma tela que diz "82 pacientes estão sendo cuidados automaticamente" precisa
 * PROVAR que isso é verdade agora, e não ser uma frase escrita no HTML. O
 * pulso é essa prova.
 *
 * Deliberadamente pequeno: indicador de status que chama atenção compete com o
 * trabalho. Este só é notado por quem procura.
 */
export function Pulso({ ativo, texto }: { ativo: boolean; texto: string }) {
  return (
    <span className="crc-pulso" data-ativo={ativo ? "sim" : "nao"}>
      <span className="crc-pulso-ponto" aria-hidden="true" />
      <span>{texto}</span>
    </span>
  );
}
