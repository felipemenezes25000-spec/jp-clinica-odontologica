/**
 * Patient 360 preditivo — o bloco da ficha.
 *
 * ============================================================================
 *  ELE EXISTE PARA UMA SITUAÇÃO ESPECÍFICA: o paciente está na linha, e quem
 *  atendeu tem dez segundos para saber com quem está falando.
 *
 *  Os treze números que este bloco mostra já existiam — espalhados por seis
 *  telas. Espalhados, eles não respondem nada: ninguém abre a tela de
 *  orçamentos, a de risco de falta e a de oportunidades com alguém esperando
 *  no telefone.
 *
 *  Por isso a ordem aqui é a da pergunta, e não a do banco: quem é (valor),
 *  está indo embora? (abandono), o que está aberto (tratamentos), e como
 *  falar (canal e horário).
 * ============================================================================
 *
 * O QUE ELE NÃO FAZ: não age. Nenhum botão daqui manda mensagem. A ficha é
 * para SABER; agir é nas telas do assunto.
 */
import { useEffect, useState } from "react";

import {
  carregarCanaisDoPaciente,
  carregarFicha360,
  type CanalDoPacienteDto,
  type Ficha360UI,
} from "@/lib/crc/api";
import { rotuloDoCanal } from "@/lib/crc/dominio/canais";

import { Aviso, Cartao, Etiqueta, ListaEsqueleto } from "./base";
import "./crc-omnichannel.css";

function reais(v: number): string {
  return v.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  });
}

function quando(iso: string | null): string {
  if (iso === null) return "nunca";
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) ? d.toLocaleDateString("pt-BR") : "—";
}

const ROTULO_DE_VALOR: Record<string, string> = {
  ALTO: "valor alto",
  MEDIO: "valor médio",
  BAIXO: "valor baixo",
  SEM_HISTORICO: "sem histórico",
};

export function Ficha360({ patientId }: { patientId: string }) {
  const [ficha, setFicha] = useState<Ficha360UI | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    setFicha(null);
    setErro(null);

    void (async () => {
      try {
        const r = await carregarFicha360({ data: { patientId } });
        if (!vivo) return;
        if (r.ok) setFicha(r.ficha);
        else setErro(r.message);
      } catch {
        if (vivo) setErro("Não conseguimos montar a leitura preditiva agora.");
      }
    })();

    return () => {
      vivo = false;
    };
  }, [patientId]);

  if (erro !== null) return <Aviso tom="alerta">{erro}</Aviso>;
  if (ficha === null) return <ListaEsqueleto linhas={3} />;

  const r = ficha.riscoDeAbandono;

  return (
    <Cartao titulo="Leitura do paciente">
      {ficha.optOut && (
        /*
          O OPT-OUT VEM PRIMEIRO E EM VERMELHO, acima de qualquer número.

          É a única informação desta tela que muda o que é PERMITIDO fazer, e
          não só o que é aconselhável. Enterrá-la entre métricas é como alguém
          manda mensagem para quem pediu para não receber.
        */
        <div style={{ marginBottom: "var(--crc-e4)" }}>
          <Aviso tom="perigo">
            Esta pessoa pediu para não ser contatada. Nenhuma automação fala com ela, e nenhuma
            mensagem deve sair daqui.
          </Aviso>
        </div>
      )}

      <div className="crc-linha" style={{ gap: "var(--crc-e2)", flexWrap: "wrap" }}>
        <Etiqueta tom={ficha.faixaDeValor === "ALTO" ? "positiva" : "neutra"}>
          {ROTULO_DE_VALOR[ficha.faixaDeValor] ?? ficha.faixaDeValor}
        </Etiqueta>

        <Etiqueta tom={r.faixa === "ALTO" ? "perigo" : r.faixa === "MEDIO" ? "alerta" : "positiva"}>
          risco de abandono {r.faixa.toLowerCase()}
        </Etiqueta>

        {ficha.riscoDeFalta === "ALTO" && <Etiqueta tom="perigo">risco de faltar</Etiqueta>}
        {ficha.objecaoAtual !== null && (
          <Etiqueta tom="alerta">objeção: {ficha.objecaoAtual.toLowerCase()}</Etiqueta>
        )}
      </div>

      <div className="crc-grade" style={{ marginTop: "var(--crc-e4)" }}>
        <Numero
          rotulo="Já produziu"
          valor={reais(ficha.ltv)}
          /*
            "COM O CRC" SEPARADO DO TOTAL, sempre. É o item 63 na ficha: o que
            a clínica faturou com a pessoa não é o que o CRC recuperou, e juntar
            os dois transformaria o painel num vendedor do próprio trabalho.
          */
          nota={
            ficha.receitaAtribuida > 0
              ? `${reais(ficha.receitaAtribuida)} vieram de ação do CRC`
              : "nada atribuído ao CRC ainda"
          }
        />
        <Numero
          rotulo="Em aberto"
          valor={reais(ficha.valorEmTratamento)}
          nota={`${String(ficha.tratamentosPendentes)} orçamento(s) sem desfecho`}
        />
        <Numero
          rotulo="Potencial no Radar"
          valor={reais(ficha.valorPotencial)}
          nota={`${String(ficha.oportunidadesAbertas)} oportunidade(s) · já com a chance dentro`}
        />
        <Numero
          rotulo="Última consulta"
          valor={quando(ficha.ultimaConsultaEm)}
          nota={`${String(ficha.acoesDoCrc)} ação(ões) do CRC no histórico`}
        />
      </div>

      {/*
        O RISCO VEM COM OS FATORES E COM A SUGESTÃO.

        Um score sozinho é um número que ninguém pode contestar; com os motivos
        na frente, a recepção pode discordar — e discordar é como o critério
        melhora. A sugestão existe porque "risco alto" não diz o que fazer, e
        a ação certa para quem não responde é o OPOSTO da ação certa para quem
        só está atrasado.
      */}
      {r.score > 0 && (
        <div style={{ marginTop: "var(--crc-e5)" }}>
          <p className="crc-rotulo">Por que este risco</p>
          <ul className="crc-pilha" style={{ gap: "var(--crc-e1)" }}>
            {r.fatores.map((f) => (
              <li key={f.rotulo} className="crc-meta">
                {f.rotulo} <span style={{ opacity: 0.6 }}>(+{String(f.pontos)})</span>
              </li>
            ))}
          </ul>
          <p style={{ marginTop: "var(--crc-e3)" }}>
            <strong>O que fazer:</strong> {r.sugestao}
          </p>
        </div>
      )}

      {(ficha.canaisPreferidos.length > 0 || ficha.horariosPreferidos.length > 0) && (
        <div style={{ marginTop: "var(--crc-e5)" }}>
          <p className="crc-rotulo">Como falar</p>
          <p className="crc-meta">
            {ficha.canaisPreferidos.length > 0 && (
              <>
                {/*
                  CANAL É O QUE ELA USA; HORÁRIO É O QUE ELA DECLAROU. A frase
                  diz a diferença porque as duas têm confiabilidade diferente.
                */}
                Costuma falar por <strong>{ficha.canaisPreferidos[0]}</strong>.{" "}
              </>
            )}
            {ficha.horariosPreferidos.length > 0 && (
              <>Disse preferir: {ficha.horariosPreferidos.join(" · ")}.</>
            )}
          </p>
        </div>
      )}

      {/*
        OS CANAIS CONHECIDOS — §24.

        ======================================================================
         ELE RESPONDE UMA PERGUNTA QUE NENHUM OUTRO BLOCO RESPONDE: "por onde
         esta pessoa fala com a gente?".

         "Costuma falar por WhatsApp" logo acima é PREFERÊNCIA inferida do
         volume. Isto é FATO: existe uma conversa de Instagram aberta, com
         data, e a recepção pode abrir.

         E é o que o §23 pede junto: as conversas NÃO são fundidas — uma por
         canal, com janelas e políticas diferentes —, mas todas aparecem na
         MESMA ficha. Juntá-las numa thread visual faria alguém responder no
         canal errado, e no Instagram fora das 24 horas a mensagem não sai.
        ======================================================================
      */}
      <CanaisConhecidos patientId={patientId} />

      {ficha.household.length > 0 && (
        <div style={{ marginTop: "var(--crc-e5)" }}>
          <p className="crc-rotulo">Possivelmente da mesma casa</p>
          <ul className="crc-pilha" style={{ gap: "var(--crc-e1)" }}>
            {ficha.household.map((f) => (
              <li key={f.patientId} className="crc-linha" style={{ gap: "var(--crc-e2)" }}>
                <span>{f.nome}</span>
                <Etiqueta tom="neutra">{f.porque}</Etiqueta>
                {/*
                  "SUSPEITA" APARECE EM TODA LINHA NÃO CONFIRMADA.

                  Dois irmãos que dividem telefone aparecem aqui — e também o
                  casal que se separou e ninguém atualizou o cadastro. Uma
                  suspeita apresentada como fato é como um sistema começa a
                  dizer à recepção coisas que ela sabe que são falsas.
                */}
                {!f.confirmado && <Etiqueta tom="alerta">suspeita, não confirmada</Etiqueta>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Cartao>
  );
}

/**
 * Os canais por onde esta pessoa já falou — §24.
 *
 * ============================================================================
 *  CARREGA SEPARADO DA FICHA, e a separação é deliberada.
 *
 *  `carregarFicha360` já faz treze contas. Somar os canais a ela atrasaria o
 *  bloco inteiro — que é o bloco lido com alguém esperando no telefone — por
 *  causa de uma informação secundária.
 *
 *  E a falha é isolada: se esta consulta quebrar, a ficha continua inteira e
 *  este pedaço simplesmente não aparece. O inverso — a ficha não abrir porque
 *  a lista de canais falhou — seria trocar o essencial pelo complementar.
 * ============================================================================
 *
 * NÃO MOSTRA O ID TÉCNICO. `canaisDoPaciente` devolve o contato já pronto para
 * a tela: telefone formatado, ou `@usuario`, ou o rótulo do canal. Ver
 * `contatoParaTela` — e o §24, que proíbe identificador da Meta como UX.
 */
function CanaisConhecidos({ patientId }: { patientId: string }) {
  const [canais, setCanais] = useState<CanalDoPacienteDto[] | null>(null);

  useEffect(() => {
    let vivo = true;
    setCanais(null);

    void (async () => {
      try {
        const r = await carregarCanaisDoPaciente({ data: { patientId } });
        if (vivo) setCanais(r.ok ? r.canais : []);
      } catch {
        if (vivo) setCanais([]);
      }
    })();

    return () => {
      vivo = false;
    };
  }, [patientId]);

  // NADA NA TELA ENQUANTO CARREGA, e nada quando não há canal. Um esqueleto
  // para uma lista de duas linhas pisca mais do que informa.
  if (canais === null || canais.length === 0) return null;

  return (
    <div style={{ marginTop: "var(--crc-e5)" }}>
      <p className="crc-rotulo">Canais conhecidos</p>
      <ul className="crc-canais-do-paciente">
        {canais.map((c) => {
          const rotulo = rotuloDoCanal(c.canal);
          return (
            <li key={c.conversationId} className="crc-canal-linha">
              <span className="crc-canal-selo" data-canal={c.canal} aria-label={rotulo.acessivel}>
                <span>{rotulo.nome}</span>
              </span>
              <div>
                <strong>{c.contato}</strong>
                <small>
                  {c.primeiroContatoEm === null
                    ? "sem primeiro contato registrado"
                    : `primeiro contato em ${quando(c.primeiroContatoEm)}`}
                  {c.ultimoContatoEm !== null && ` · último em ${quando(c.ultimoContatoEm)}`}
                </small>
              </div>
              {c.naoLidas > 0 && (
                <Etiqueta tom="positiva">
                  {c.naoLidas} {c.naoLidas === 1 ? "nova" : "novas"}
                </Etiqueta>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Numero({ rotulo, valor, nota }: { rotulo: string; valor: string; nota: string }) {
  return (
    <div>
      <span className="crc-rotulo">{rotulo}</span>
      <div style={{ fontSize: "1.3rem", fontWeight: 600 }}>{valor}</div>
      <small className="crc-meta">{nota}</small>
    </div>
  );
}
