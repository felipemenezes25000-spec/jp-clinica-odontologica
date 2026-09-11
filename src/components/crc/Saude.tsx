/**
 * Saúde — a tela de sexta às 19h.
 *
 * A PERGUNTA QUE ELA RESPONDE é uma só: **"o agente parou. É a gente ou é
 * eles?"** Sem ela, provedor fora do ar, teto de gasto estourado, kill switch
 * esquecido ligado e worker morto têm exatamente a mesma aparência — nada
 * acontece — e quem está na recepção não tem como distinguir.
 *
 * A ORDEM DA TELA É A ORDEM DA INVESTIGAÇÃO, e não a do bonito:
 *
 *   1. O VEREDICTO, em uma frase. Se está tudo bem, a pessoa fecha a tela aqui.
 *   2. OS SINAIS, cada um com a próxima ação. Sinal sem ação é ruído.
 *   3. OS NÚMEROS do agente, e o que eles significam em português.
 *
 * Números vêm por último de propósito. Quem abre isto durante um incidente
 * precisa de "o provedor está fora", não de "a taxa de entrega é 62%".
 */
import { useCallback, useEffect, useState } from "react";
import { Activity, RefreshCw } from "lucide-react";

import { carregarSaudeDoSistema, type PainelDeSaudeDto, type SinalDeSaudeDto } from "@/lib/crc/api";

import { Aviso, Botao, Cartao, Etiqueta, Kpi, ListaEsqueleto, Vazio } from "./base";

const TOM: Record<string, "positiva" | "alerta" | "perigo"> = {
  ok: "positiva",
  atencao: "alerta",
  critico: "perigo",
};

export function Saude() {
  const [painel, setPainel] = useState<PainelDeSaudeDto | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);

  const recarregar = useCallback(async (): Promise<void> => {
    setCarregando(true);
    try {
      const r = await carregarSaudeDoSistema();
      if (r.ok) {
        setPainel(r.painel);
        setErro(null);
      } else {
        setErro(r.message);
      }
    } catch {
      setErro("Não conseguimos ler o estado do sistema.");
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    void recarregar();
  }, [recarregar]);

  if (erro !== null && painel === null) return <Aviso tom="perigo">{erro}</Aviso>;
  if (painel === null) return <ListaEsqueleto linhas={4} />;

  const m = painel.metricas;

  return (
    <>
      {/* 1. O VEREDICTO ------------------------------------------------- */}
      <Cartao
        titulo="Como o agente está agora"
        acao={
          <Botao variante="discreto" onClick={() => void recarregar()} disabled={carregando}>
            <RefreshCw size={14} /> Atualizar
          </Botao>
        }
      >
        <div className="crc-linha" style={{ gap: "var(--crc-e3)", alignItems: "center" }}>
          <Activity size={18} />
          <Etiqueta tom={TOM[painel.severidade] ?? "neutra"}>
            {painel.severidade === "ok"
              ? "Tudo funcionando"
              : painel.severidade === "atencao"
                ? "Precisa de atenção"
                : "Precisa de você agora"}
          </Etiqueta>
          <span className="crc-meta">
            {/*
              O HORÁRIO IMPORTA numa tela que alguém deixa aberta. Sem ele, um
              painel verde de vinte minutos atrás parece um painel verde de
              agora — e é durante um incidente que a diferença decide o que a
              pessoa faz a seguir.
            */}
            leitura de {new Date(painel.em).toLocaleTimeString("pt-BR")}
          </span>
        </div>
      </Cartao>

      {/* 2. OS SINAIS ---------------------------------------------------- */}
      <Cartao titulo="O que está acontecendo">
        {painel.sinais.length === 0 ? (
          <Vazio
            titulo="Nada para resolver"
            explicacao="Nenhum provedor cortado, nenhum paciente esperando, nenhum interruptor de emergência acionado."
          />
        ) : (
          <ul className="crc-pilha">
            {painel.sinais.map((s) => (
              <SinalNaLista key={`${s.codigo}-${s.titulo}`} sinal={s} />
            ))}
          </ul>
        )}
      </Cartao>

      {/* 3. OS NÚMEROS --------------------------------------------------- */}
      <Cartao titulo="O agente nos últimos 30 dias">
        <div className="crc-grade">
          <Kpi rotulo="Turnos" valor={String(m.turnos)} nota="conversas que o agente atendeu" />
          <Kpi
            rotulo="Respondeu"
            valor={pct(m.taxaDeEntrega)}
            nota={`${String(m.entregues)} viraram mensagem`}
          />
          <Kpi
            rotulo="Passou para pessoa"
            valor={pct(m.taxaDeHandoff)}
            // SEM `destaque` DE PROPÓSITO: não existe "quanto menor melhor"
            // aqui, e pintar de verde ou vermelho ensinaria a coisa errada.
            nota={`${String(m.humanos)} casos`}
          />
          <Kpi
            rotulo="Custo por turno"
            valor={reais(m.custoPorTurno)}
            nota={`${reais(m.custoTotal)} no período`}
          />
        </div>

        {painel.leituras.length > 0 && (
          <ul className="crc-pilha" style={{ marginTop: "var(--crc-e4)" }}>
            {painel.leituras.map((l) => (
              <SinalNaLista key={l.titulo} sinal={l} />
            ))}
          </ul>
        )}
      </Cartao>

      {/* Comparação e portões ------------------------------------------- */}
      <Cartao titulo="Comparado com os 30 dias anteriores">
        <ul className="crc-pilha">
          {painel.comparacoes.map((c) => (
            <li key={c.metrica} className="crc-linha">
              <strong>{c.metrica}</strong>
              <span className="crc-empurra">
                {c.significativa ? (
                  <Etiqueta tom={c.variacao >= 0 ? "positiva" : "alerta"}>
                    {c.variacao >= 0 ? "+" : ""}
                    {c.metrica.includes("Custo")
                      ? reais(c.variacao)
                      : `${String(Math.round(c.variacao * 10) / 10)}pp`}
                  </Etiqueta>
                ) : (
                  /*
                    "SEM MUDANÇA CLARA" É UMA RESPOSTA, e a mais honesta que
                    esta linha pode dar. Mostrar "+8pp" em verde com trinta
                    turnos de base ensina a clínica a comemorar sorte — e a não
                    confiar no painel quando o número voltar ao normal.
                  */
                  <span className="crc-meta">sem mudança clara</span>
                )}
              </span>
            </li>
          ))}
        </ul>
      </Cartao>

      {m.portoes.length > 0 && (
        <Cartao titulo="O que barrou o agente">
          <ul className="crc-pilha">
            {m.portoes.slice(0, 6).map((p) => (
              <li key={p.codigo} className="crc-linha">
                <code>{p.codigo}</code>
                <span className="crc-empurra">
                  <Etiqueta tom="neutra">{p.vezes}×</Etiqueta>
                </span>
              </li>
            ))}
          </ul>
        </Cartao>
      )}
    </>
  );
}

/**
 * Um sinal na lista.
 *
 * A AÇÃO VEM SEMPRE JUNTO, e é o que separa esta tela de um relatório. "O
 * provedor está fora" sem "aguarde a próxima tentativa ou troque a rota" deixa
 * quem lê no mesmo lugar em que estava.
 */
function SinalNaLista({ sinal }: { sinal: SinalDeSaudeDto }) {
  return (
    <li className="crc-cartao-compacto">
      <div className="crc-linha">
        <Etiqueta tom={TOM[sinal.severidade] ?? "neutra"}>
          {sinal.severidade === "critico" ? "crítico" : sinal.severidade}
        </Etiqueta>
        <strong>{sinal.titulo}</strong>
      </div>
      <p className="crc-corpo" style={{ marginTop: "var(--crc-e1)" }}>
        {sinal.acao}
      </p>
      {sinal.detalhe.length > 0 && <small className="crc-meta">{sinal.detalhe}</small>}
    </li>
  );
}

const pct = (v: number): string => `${String(Math.round(v * 100))}%`;
const reais = (v: number): string =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
