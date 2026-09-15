import { useCallback, useEffect, useMemo, useState } from "react";
import { BarChart3, RefreshCw } from "lucide-react";

import { Aviso, Botao, Etiqueta, ListaEsqueleto } from "./base";

type LinhaConversa = { canal: string; conversas: number; entradas: number; saidas: number };
type LinhaLead = { canal: string; leads: number; primeiraRespostaSegundos: number | null };
type LinhaOportunidade = {
  canal: string;
  oportunidades: number;
  ganhas: number;
  perdidas: number;
  abertas: number;
  potencial: number;
  receitaConfirmada: number;
};
type LinhaGasto = { canal: string; valor: number };
type LinhaCampanha = { canal: string; campanha: string; leads: number };
type Painel = {
  periodoDias: number;
  geradoEm: string;
  conversas: LinhaConversa[];
  leads: LinhaLead[];
  oportunidades: LinhaOportunidade[];
  gasto: LinhaGasto[];
  campanhas: LinhaCampanha[];
};

type Resposta = { ok: true; painel: Painel } | { ok: false; message?: string };

const ROTULOS: Readonly<Record<string, string>> = {
  meta: "Meta Ads",
  instagram: "Instagram",
  messenger: "Messenger",
  whatsapp: "WhatsApp",
  google: "Google",
  facebook: "Facebook",
  desconhecido: "Sem origem",
};

function n(valor: unknown): number {
  return typeof valor === "number" && Number.isFinite(valor) ? valor : Number(valor) || 0;
}

function dinheiro(valor: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(valor);
}

function duracao(segundos: number | null): string {
  if (segundos === null || !Number.isFinite(segundos)) return "—";
  if (segundos < 60) return `${Math.round(segundos)} s`;
  if (segundos < 3600) return `${Math.round(segundos / 60)} min`;
  return `${(segundos / 3600).toFixed(1).replace(".", ",")} h`;
}

function rotulo(canal: string): string {
  return ROTULOS[canal] ?? canal;
}

export function MetaAnalytics() {
  const [dias, setDias] = useState(30);
  const [painel, setPainel] = useState<Painel | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [oculto, setOculto] = useState(false);
  const [carregando, setCarregando] = useState(false);

  const carregar = useCallback(async (): Promise<void> => {
    setCarregando(true);
    try {
      const r = await fetch(`/api/crc/meta/analytics?dias=${String(dias)}`, {
        headers: { accept: "application/json" },
      });

      if (r.status === 401 || r.status === 403) {
        setOculto(true);
        setPainel(null);
        setErro(null);
        return;
      }

      const corpo = (await r.json().catch(() => null)) as Resposta | null;
      if (!r.ok || corpo === null || !corpo.ok) {
        setErro(
          corpo !== null && !corpo.ok && corpo.message
            ? corpo.message
            : "Não foi possível carregar a analítica por canal.",
        );
        return;
      }

      setOculto(false);
      setPainel(corpo.painel);
      setErro(null);
    } catch {
      setErro("Não foi possível carregar a analítica por canal.");
    } finally {
      setCarregando(false);
    }
  }, [dias]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const linhas = useMemo(() => {
    if (painel === null) return [];

    const canais = new Set<string>();
    for (const x of painel.conversas) canais.add(x.canal);
    for (const x of painel.leads) canais.add(x.canal);
    for (const x of painel.oportunidades) canais.add(x.canal);
    for (const x of painel.gasto) canais.add(x.canal);

    return [...canais]
      .map((canal) => {
        const conversa = painel.conversas.find((x) => x.canal === canal);
        const lead = painel.leads.find((x) => x.canal === canal);
        const oportunidade = painel.oportunidades.find((x) => x.canal === canal);
        const gasto = painel.gasto.find((x) => x.canal === canal);
        const leads = n(lead?.leads);
        const gastoValor = n(gasto?.valor);

        return {
          canal,
          conversas: n(conversa?.conversas),
          entradas: n(conversa?.entradas),
          saidas: n(conversa?.saidas),
          leads,
          primeiraResposta: lead?.primeiraRespostaSegundos ?? null,
          ganhas: n(oportunidade?.ganhas),
          abertas: n(oportunidade?.abertas),
          gasto: gastoValor,
          cac: gastoValor > 0 && leads > 0 ? gastoValor / leads : null,
          receita: n(oportunidade?.receitaConfirmada),
        };
      })
      .sort((a, b) => b.leads + b.conversas - (a.leads + a.conversas));
  }, [painel]);

  if (oculto) return null;

  return (
    <section className="crc-painel" aria-label="Analítica por canal">
      <div className="crc-inbox-lista-topo">
        <div>
          <div className="crc-sobretitulo">
            <BarChart3 size={13} aria-hidden="true" /> Aquisição · conversa · conversão
          </div>
          <h2 className="crc-titulo-cartao">Desempenho por canal</h2>
        </div>
        <div className="crc-linha" style={{ gap: 4, flexWrap: "wrap" }}>
          {[7, 30, 90].map((periodo) => (
            <Botao
              key={periodo}
              pequeno
              variante={dias === periodo ? "primario" : "discreto"}
              onClick={() => setDias(periodo)}
            >
              {periodo}d
            </Botao>
          ))}
          <Botao
            pequeno
            variante="discreto"
            carregando={carregando}
            onClick={() => void carregar()}
          >
            <RefreshCw size={13} aria-hidden="true" /> Atualizar
          </Botao>
        </div>
      </div>

      <div className="crc-painel-corpo">
        {erro !== null && <Aviso tom="perigo">{erro}</Aviso>}
        {painel === null && erro === null ? (
          <ListaEsqueleto linhas={3} />
        ) : painel !== null && linhas.length === 0 ? (
          <p className="crc-meta">Ainda não há fatos observados neste período.</p>
        ) : (
          <div className="crc-pilha" style={{ gap: "var(--crc-e2)" }}>
            {linhas.map((x) => (
              <article key={x.canal} className="crc-meta-canal">
                <div className="crc-meta-canal-copy" style={{ minWidth: 150 }}>
                  <strong>{rotulo(x.canal)}</strong>
                  <small className="crc-meta">
                    {x.conversas > 0 ? `${x.conversas} conversa(s)` : `${x.leads} lead(s)`}
                  </small>
                </div>
                <div className="crc-meta-sinais" style={{ flex: 1, margin: 0 }}>
                  <div className="crc-meta-sinal" data-alerta="nao">
                    <small>Leads</small>
                    <strong>{x.leads}</strong>
                  </div>
                  <div className="crc-meta-sinal" data-alerta="nao">
                    <small>Mensagens</small>
                    <strong>
                      {x.entradas} ↓ · {x.saidas} ↑
                    </strong>
                  </div>
                  <div className="crc-meta-sinal" data-alerta="nao">
                    <small>1ª resposta</small>
                    <strong>{duracao(x.primeiraResposta)}</strong>
                  </div>
                  <div className="crc-meta-sinal" data-alerta="nao">
                    <small>Ganhas / abertas</small>
                    <strong>
                      {x.ganhas} / {x.abertas}
                    </strong>
                  </div>
                  <div className="crc-meta-sinal" data-alerta="nao">
                    <small>Gasto / CAC</small>
                    <strong>
                      {x.gasto > 0 ? dinheiro(x.gasto) : "—"} ·{" "}
                      {x.cac === null ? "—" : dinheiro(x.cac)}
                    </strong>
                  </div>
                  <div className="crc-meta-sinal" data-alerta="nao">
                    <small>Receita confirmada</small>
                    <strong>{x.receita > 0 ? dinheiro(x.receita) : "—"}</strong>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}

        {painel !== null && painel.campanhas.length > 0 && (
          <div style={{ marginTop: "var(--crc-e4)" }}>
            <p className="crc-rotulo">Campanhas que trouxeram leads</p>
            <div className="crc-meta-produtos">
              {painel.campanhas.slice(0, 8).map((c) => (
                <Etiqueta key={`${c.canal}:${c.campanha}`} tom="neutra">
                  {c.campanha} · {c.leads}
                </Etiqueta>
              ))}
            </div>
          </div>
        )}

        <p className="crc-meta" style={{ marginTop: "var(--crc-e3)" }}>
          Só entram fatos observados no CRC. Gasto é o lançamento mensal de mídia; receita é somente
          a natureza CONFIRMADA. Potencial e receita não são somados no mesmo número.
        </p>
      </div>
    </section>
  );
}
