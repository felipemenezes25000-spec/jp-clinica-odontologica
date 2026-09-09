/**
 * A Home operacional — item 15 do Mega Prompt, itens 106 e 181 do contrato.
 *
 * "Não quero dashboard cheio de cards inúteis. Quero uma Home operacional."
 *
 * O QUE MUDOU NESTA REVISÃO, E POR QUÊ
 *
 * Antes esta tela abria com CINCO CARTÕES IGUAIS. É o gesto mais comum de
 * painel e um dos piores: "pacientes esperando por você" ganhava exatamente o
 * mesmo peso de "consultas recuperadas no mês" — e um é trabalho a fazer
 * enquanto o outro é placar do passado. Cinco pesos iguais não são hierarquia;
 * são a ausência dela.
 *
 * Agora a tela é uma FRASE, e a frase tem duas metades:
 *
 *   À ESQUERDA, O TRABALHO. Um número grande, na cor de atenção, e logo abaixo
 *   dele a fila — porque a resposta para "quantos precisam de mim" é inútil
 *   sem o "quem".
 *
 *   À DIREITA, O SOSSEGO. Quantos a máquina está cuidando sozinha, com o pulso
 *   provando que ela roda agora, e a fita do dia mostrando onde estamos na
 *   janela de atendimento. É o que responde "e o resto?" antes de perguntarem.
 *
 * O PORQUÊ DEIXOU DE SER UM CLIQUE. A explicação da nota estava escondida atrás
 * de um botão "Por que 92/100?". Escondida, ela não é usada; e uma fila que
 * ninguém entende é uma fila em que ninguém confia. O primeiro item da lista
 * traz a decomposição aberta, sempre — é o que ensina a ler todos os outros.
 *
 * Doze itens no máximo. O item 15 é literal: "não mostrar 300 coisas de uma
 * vez". A fila completa mora no Funil.
 */
import { useEffect, useState } from "react";

import { carregarHome, type ItemPrioridade, type ResumoHome } from "@/lib/crc/api";
import {
  dinheiro,
  dinheiroCurto,
  frescor,
  plural,
  tempoRelativo,
} from "@/lib/crc/dominio/formatar";

import { FitaDoDia, Porque, Pulso, type RazaoDaNota } from "./assinatura";
import { Aviso, Cartao, Esqueleto, Etiqueta, Kpi, ListaEsqueleto, Vazio } from "./base";

export function Home({
  nomeUsuario,
  aoAbrirPaciente,
}: {
  nomeUsuario: string;
  aoAbrirPaciente: (patientId: string) => void;
}) {
  const [resumo, setResumo] = useState<ResumoHome | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    void (async () => {
      try {
        const r = await carregarHome();
        if (!vivo) return;
        if (r.ok) setResumo(r.resumo);
        else setErro(r.message);
      } catch {
        if (vivo) {
          setErro("Não conseguimos carregar sua fila agora. Tente atualizar a página.");
        }
      }
    })();
    return () => {
      vivo = false;
    };
  }, []);

  if (erro !== null) {
    return <Aviso tom="perigo">{erro}</Aviso>;
  }

  if (resumo === null) {
    return (
      <>
        <div style={{ marginBottom: "var(--crc-e6)" }}>
          <Esqueleto altura={38} largura="52%" />
          <div style={{ height: "var(--crc-e3)" }} />
          <Esqueleto altura={16} largura="70%" />
        </div>
        <div className="crc-grade" style={{ marginBottom: "var(--crc-e6)" }}>
          {[0, 1, 2].map((i) => (
            <div key={i} className="crc-kpi">
              <Esqueleto altura={12} largura="60%" />
              <div style={{ height: "var(--crc-e2)" }} />
              <Esqueleto altura={30} largura="45%" />
            </div>
          ))}
        </div>
        <ListaEsqueleto linhas={5} />
      </>
    );
  }

  const primeiroNome = nomeUsuario.trim().split(/\s+/u)[0] ?? "";
  const temTrabalho = resumo.precisamDeAtencao > 0;

  return (
    <>
      <header style={{ marginBottom: "var(--crc-e6)" }}>
        <h1 className="crc-titulo-pagina">
          {resumo.saudacao}
          {primeiroNome.length > 0 ? `, ${primeiroNome}` : ""}.
        </h1>

        {/* A frase que resume o dia. É ela que faz o funcionário sentir que o
            sistema está trabalhando por ele (item 50 do Mega Prompt). */}
        <p
          className="crc-corpo"
          style={{ marginTop: "var(--crc-e2)", fontSize: "1.0625rem", maxWidth: "62ch" }}
        >
          {temTrabalho ? (
            <>
              <strong style={{ color: "var(--crc-texto)" }}>
                {plural(resumo.precisamDeAtencao, "paciente precisa", "pacientes precisam")}
              </strong>{" "}
              da sua atenção agora.{" "}
            </>
          ) : (
            <>Nenhum paciente está esperando você agora. </>
          )}
          {resumo.emAutomacao > 0 && (
            <>
              Outros {resumo.emAutomacao.toLocaleString("pt-BR")} estão sendo trabalhados
              automaticamente.
            </>
          )}
        </p>

        <div className="crc-linha" style={{ marginTop: "var(--crc-e3)", gap: "var(--crc-e4)" }}>
          <Pulso
            ativo={resumo.dentroDoHorario}
            texto={
              resumo.dentroDoHorario
                ? "Automação ativa — dentro do horário de atendimento"
                : "Fora do horário: o que estiver na fila sai na abertura"
            }
          />
          {/* Item 136: quando os dados são velhos, a tela avisa. Um CRC
              operando sobre uma sincronização de ontem decide errado em
              silêncio. */}
          {resumo.frescorDados !== null && (
            <span className="crc-meta">{frescor(resumo.frescorDados)}</span>
          )}
        </div>
      </header>

      {/*
        DUAS COLUNAS, E ELAS NÃO SÃO IGUAIS.
        A da esquerda é o trabalho e ocupa o dobro; a da direita é contexto. Um
        layout meio a meio diria que as duas pedem a mesma atenção, e não pedem.
      */}
      <div className="crc-painel-duplo" style={{ marginBottom: "var(--crc-e8)" }}>
        <div className="crc-grade">
          <Kpi
            rotulo="Precisam de você"
            valor={resumo.precisamDeAtencao.toLocaleString("pt-BR")}
            nota="Sem automação cuidando"
            destaque={temTrabalho ? "foco" : "calmo"}
          />
          <Kpi
            rotulo="Suas tarefas"
            valor={resumo.tarefasHoje.toLocaleString("pt-BR")}
            nota="Abertas e em andamento"
          />
          <Kpi
            rotulo="Conversas esperando"
            valor={resumo.conversasEsperando.toLocaleString("pt-BR")}
            nota="Com mensagem não lida"
          />
        </div>

        <Cartao>
          <h2 className="crc-titulo-cartao" style={{ marginBottom: "var(--crc-e3)" }}>
            O dia da clínica
          </h2>
          <FitaDoDia inicio={resumo.janelaDeHoje.inicio} fim={resumo.janelaDeHoje.fim} />

          <hr className="crc-separador" />

          <div className="crc-grade" style={{ gap: "var(--crc-e3)" }}>
            <div>
              <div className="crc-kpi-rotulo">Recuperadas</div>
              <div className="crc-kpi-valor" style={{ fontSize: "1.5rem" }}>
                {resumo.consultasRecuperadas.toLocaleString("pt-BR")}
              </div>
              <div className="crc-kpi-nota">consultas neste mês</div>
            </div>
            <div>
              {/*
                Item 63: potencial e confirmado NUNCA no mesmo número. Sem
                integração financeira este número é POTENCIAL — e o rótulo diz
                isso, em vez de chamar de "receita" e o painel mentir.
              */}
              <div className="crc-kpi-rotulo">
                {Number.parseFloat(resumo.receitaConfirmada) > 0 ? "Receita" : "Potencial"}
              </div>
              <div className="crc-kpi-valor" style={{ fontSize: "1.5rem" }}>
                {dinheiroCurto(
                  Number.parseFloat(resumo.receitaConfirmada) > 0
                    ? resumo.receitaConfirmada
                    : resumo.valorPotencialRecuperado,
                )}
              </div>
              <div className="crc-kpi-nota">
                {Number.parseFloat(resumo.receitaConfirmada) > 0
                  ? "confirmada neste mês"
                  : "ainda sem confirmação"}
              </div>
            </div>
          </div>
        </Cartao>
      </div>

      <div
        className="crc-linha"
        style={{ marginBottom: "var(--crc-e3)", justifyContent: "space-between" }}
      >
        <h2 className="crc-titulo-secao">Prioridades de hoje</h2>
        {resumo.prioridades.length > 0 && (
          <span className="crc-meta">
            {plural(resumo.prioridades.length, "item na fila", "itens na fila")}
          </span>
        )}
      </div>

      {resumo.prioridades.length === 0 ? (
        <Cartao>
          <Vazio
            titulo="Nenhuma oportunidade esperando você agora."
            explicacao="As automações continuam monitorando a base. Quando um paciente precisar de contato humano, ele aparece aqui."
          />
        </Cartao>
      ) : (
        <div className="crc-fila">
          {resumo.prioridades.map((item, indice) => (
            <LinhaPrioridade
              key={item.opportunityId}
              item={item}
              /* O PRIMEIRO ABRE EXPLICADO. Ele é o que ensina a ler a fila
                 inteira: quem entende por que ela está no topo passa a
                 entender a ordem toda. Abrir todos seria uma parede de
                 barras — a explicação viraria ruído em vez de leitura. */
              explicadoDeSaida={indice === 0}
              aoAbrir={aoAbrirPaciente}
            />
          ))}
        </div>
      )}
    </>
  );
}

/* -------------------------------------------------------------------------- */

const ROTULO_FAIXA: Readonly<Record<ItemPrioridade["faixa"], string>> = {
  ALTA: "Prioridade alta",
  MEDIA: "Prioridade média",
  BAIXA: "Prioridade baixa",
};

const TOM_FAIXA: Readonly<Record<ItemPrioridade["faixa"], "perigo" | "alerta" | "neutra">> = {
  ALTA: "perigo",
  MEDIA: "alerta",
  BAIXA: "neutra",
};

/** Os fatores vêm do servidor no formato do domínio; a barra fala outro. */
function paraRazoes(fatores: ItemPrioridade["fatores"]): RazaoDaNota[] {
  return fatores.map((f) => ({ rotulo: f.rotulo, peso: f.pontos }));
}

function LinhaPrioridade({
  item,
  explicadoDeSaida,
  aoAbrir,
}: {
  item: ItemPrioridade;
  explicadoDeSaida: boolean;
  aoAbrir: (patientId: string) => void;
}) {
  const [explicando, setExplicando] = useState(explicadoDeSaida);

  return (
    <div className="crc-entra" data-urgencia={item.faixa}>
      <div className="crc-fila-item" data-urgencia={item.faixa} style={{ cursor: "default" }}>
        {/*
          A NOTA EM DISCO, e não em texto solto: é por ela que a fila está
          ordenada, e ela precisa ser lida de longe. A largura é fixa para que
          "7" e "92" não desalinhem os nomes ao lado.
        */}
        <span
          className="crc-fila-nota"
          title={`Nota de prioridade: ${String(item.score)} de 100`}
          aria-hidden="true"
        >
          {item.score}
        </span>

        <div className="crc-fila-corpo">
          <div className="crc-linha" style={{ gap: "var(--crc-e2)" }}>
            <span className="crc-fila-nome">{item.nome}</span>
            {/* A etiqueta repete a informação da faixa colorida de propósito —
                item 65: nenhuma ação pode depender só de cor. */}
            <Etiqueta tom={TOM_FAIXA[item.faixa]}>{ROTULO_FAIXA[item.faixa]}</Etiqueta>
            <Etiqueta>{item.tipoRotulo}</Etiqueta>
            {item.temJornadaAtiva && <Etiqueta tom="info">Automação cuidando</Etiqueta>}
          </div>

          <p className="crc-fila-motivo" title={item.motivo}>
            {item.motivo}
          </p>

          <div className="crc-linha" style={{ marginTop: "var(--crc-e2)", gap: "var(--crc-e4)" }}>
            {item.valorPotencial !== null && (
              <span className="crc-meta">
                Valor potencial:{" "}
                <strong style={{ color: "var(--crc-texto-2)" }}>
                  {dinheiro(item.valorPotencial)}
                </strong>
              </span>
            )}
            {item.proximaAcao !== null && (
              <span className="crc-meta">Ação sugerida: {item.proximaAcao}</span>
            )}
            {item.ultimoContatoEm !== null && (
              <span className="crc-meta">Último contato {tempoRelativo(item.ultimoContatoEm)}</span>
            )}
          </div>

          {/*
            ITEM 173 — "Por que prioridade alta?".
            Os fatores exibidos são os MESMOS que ordenaram a fila; eles vêm
            gravados junto do score, e não são recalculados aqui. Se fossem, a
            explicação poderia divergir da ordem, que é pior do que não
            explicar nada.
          */}
          {item.fatores.length > 0 && explicando && (
            <div style={{ marginTop: "var(--crc-e3)" }}>
              <Porque total={item.score} razoes={paraRazoes(item.fatores)} />
            </div>
          )}
        </div>

        <div className="crc-linha" style={{ gap: "var(--crc-e2)", flexShrink: 0 }}>
          {item.fatores.length > 0 && (
            <button
              type="button"
              className="crc-botao crc-botao-discreto crc-botao-pequeno"
              aria-expanded={explicando}
              onClick={() => {
                setExplicando((v) => !v);
              }}
            >
              {explicando ? "Ocultar" : "Por quê?"}
            </button>
          )}

          {/* Item 4: o botão faz coisa de verdade — abre a central do paciente. */}
          {item.patientId !== null && (
            <button
              type="button"
              className="crc-botao crc-botao-secundario crc-botao-pequeno"
              onClick={() => {
                if (item.patientId !== null) aoAbrir(item.patientId);
              }}
            >
              Abrir
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
