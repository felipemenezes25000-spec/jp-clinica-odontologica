/**
 * Radar de Receita — quanto dinheiro está parado, e qual a chance de voltar.
 *
 * ============================================================================
 *  A DECISÃO DE DESIGN QUE GOVERNA A TELA INTEIRA: os dois números aparecem
 *  JUNTOS, e o esperado vem primeiro.
 *
 *  A tentação óbvia é o número grande. "R$ 1.284.000 em oportunidades" enche a
 *  tela, impressiona na demonstração e é a soma de tudo que aconteceria se
 *  todos os 8.000 pacientes fechassem tudo que já lhes foi proposto.
 *
 *  No fim do primeiro mês alguém confere. Não voltaram R$ 1,2 milhão; voltaram
 *  R$ 31 mil. E aí o problema não é mais o número — é que ninguém mais acredita
 *  em nenhuma tela do sistema.
 *
 *  ENTÃO O DESTAQUE É O VALOR ESPERADO, que já tem a probabilidade dentro, e o
 *  potencial fica ao lado com a etiqueta que diz o que ele é: "se tudo fechar".
 * ============================================================================
 *
 * E A CONFIANÇA APARECE COMO AVISO. Enquanto a clínica não tem histórico
 * próprio, as taxas são estimativas — e a tela DIZ isso, em vez de deixar o
 * número parecer medição.
 */
import { useCallback, useEffect, useState } from "react";
import { TriangleAlert } from "lucide-react";

import { carregarRadar, listarRadar, type ItemDoRadarUI, type RadarUI } from "@/lib/crc/api";

import { Aviso, Botao, Cartao, Etiqueta, Kpi, ListaEsqueleto, Vazio } from "./base";

/**
 * Abaixo disto, a tela avisa que está estimando.
 *
 * 0,4 é o ponto em que a média ponderada de `radar.ts` já deu peso relevante à
 * medição — abaixo dele o número ainda é majoritariamente o palpite inicial, e
 * apresentá-lo sem ressalva seria apresentar uma constante como resultado.
 */
const CONFIANCA_QUE_DISPENSA_AVISO = 0.4;

export function Radar() {
  const [radar, setRadar] = useState<RadarUI | null>(null);
  const [itens, setItens] = useState<ItemDoRadarUI[] | null>(null);
  const [tipo, setTipo] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const recarregar = useCallback(async (): Promise<void> => {
    try {
      const [resumo, lista] = await Promise.all([
        carregarRadar(),
        listarRadar({ data: tipo === null ? {} : { tipo } }),
      ]);

      if (resumo.ok) setRadar(resumo.radar);
      else setErro(resumo.message);

      if (lista.ok) setItens(lista.itens);
      else setErro(lista.message);
    } catch {
      setErro("Não conseguimos ler o Radar agora.");
    }
  }, [tipo]);

  useEffect(() => {
    void recarregar();
  }, [recarregar]);

  if (erro !== null && radar === null) return <Aviso tom="perigo">{erro}</Aviso>;
  if (radar === null) return <ListaEsqueleto linhas={6} />;

  const estimando = radar.confiancaMedia < CONFIANCA_QUE_DISPENSA_AVISO;

  return (
    <>
      <div className="crc-grade" style={{ marginBottom: "var(--crc-e6)" }}>
        <Kpi
          rotulo="Receita esperada"
          valor={reais(radar.totalEsperado)}
          destaque={radar.totalEsperado > 0 ? "foco" : "calmo"}
          /*
            A NOTA É PARTE DO NÚMERO, e não enfeite. Sem ela, "R$ 47.900" é uma
            promessa; com ela, é uma estimativa que alguém pode conferir.
          */
          nota="valor × chance de fechar"
        />
        <Kpi
          rotulo="Se tudo fechar"
          valor={reais(radar.totalPotencial)}
          nota={`${String(radar.totalAbertas)} oportunidades abertas`}
        />
        <Kpi
          rotulo="Já confirmado"
          valor={reais(radar.totalConfirmado)}
          nota="com evento financeiro"
        />
        <Kpi
          rotulo="Esperando você"
          valor={String(radar.aguardandoHumano)}
          destaque={radar.aguardandoHumano > 0 ? "foco" : "calmo"}
          nota="paradas até alguém decidir"
        />
      </div>

      {estimando && (
        <Aviso tom="alerta">
          <strong>Estes números são estimativas.</strong> A clínica ainda não tem desfechos
          suficientes para o Radar medir a própria taxa de conversão — as chances vêm de valores de
          referência. Conforme as oportunidades forem se resolvendo, os números passam a ser
          medidos, e este aviso sai sozinho.
        </Aviso>
      )}

      {radar.naoAvaliadas > 0 && (
        <Aviso tom="info">
          {radar.naoAvaliadas === 1
            ? "Uma oportunidade ainda não foi pontuada"
            : `${String(radar.naoAvaliadas)} oportunidades ainda não foram pontuadas`}{" "}
          e por isso contam zero na receita esperada. A varredura pontua algumas centenas por volta
          — é a diferença que você vê entre os dois primeiros números.
        </Aviso>
      )}

      <Cartao titulo="Por onde o dinheiro está parado">
        {radar.linhas.length === 0 ? (
          <Vazio
            titulo="Nenhuma oportunidade aberta"
            explicacao="Quando a sincronização encontrar faltas, orçamentos parados ou pacientes em retorno, elas aparecem aqui."
          />
        ) : (
          <div className="crc-tabela-caixa">
            <table className="crc-tabela">
              <thead>
                <tr>
                  <th scope="col">Tipo</th>
                  <th scope="col" style={{ textAlign: "right" }}>
                    Abertas
                  </th>
                  <th scope="col" style={{ textAlign: "right" }}>
                    Esperado
                  </th>
                  <th scope="col" style={{ textAlign: "right" }}>
                    Se tudo fechar
                  </th>
                </tr>
              </thead>
              <tbody>
                {radar.linhas.map((l) => (
                  <tr
                    key={l.tipo}
                    onClick={() => {
                      setTipo(tipo === l.tipo ? null : l.tipo);
                    }}
                    style={{ cursor: "pointer" }}
                    aria-selected={tipo === l.tipo}
                  >
                    <td>
                      {l.tipoRotulo}
                      {tipo === l.tipo && (
                        <>
                          {" "}
                          <Etiqueta tom="info">filtrando</Etiqueta>
                        </>
                      )}
                    </td>
                    <td style={{ textAlign: "right" }}>{l.abertas}</td>
                    <td style={{ textAlign: "right", fontWeight: 600 }}>
                      {reais(l.valorEsperado)}
                    </td>
                    <td style={{ textAlign: "right", color: "var(--crc-texto-3)" }}>
                      {reais(l.valorPotencial)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Cartao>

      <Cartao
        titulo={tipo === null ? "As maiores oportunidades" : "Filtrado por tipo"}
        acao={
          tipo === null ? undefined : (
            <Botao
              variante="discreto"
              onClick={() => {
                setTipo(null);
              }}
            >
              limpar filtro
            </Botao>
          )
        }
      >
        {itens === null ? (
          <ListaEsqueleto linhas={4} />
        ) : itens.length === 0 ? (
          <Vazio
            titulo="Nada nesta faixa"
            explicacao="Nenhuma oportunidade aberta corresponde a este filtro."
          />
        ) : (
          <ul className="crc-pilha">
            {itens.map((i) => (
              <ItemDoRadar key={i.id} item={i} />
            ))}
          </ul>
        )}
      </Cartao>
    </>
  );
}

function ItemDoRadar({ item }: { item: ItemDoRadarUI }) {
  return (
    <li className="crc-cartao-compacto">
      <div className="crc-linha" style={{ gap: "var(--crc-e2)", flexWrap: "wrap" }}>
        <strong>{item.nome}</strong>
        <Etiqueta tom={tomDoEstado(item.estado)}>{rotuloDoEstado(item.estado)}</Etiqueta>
        <Etiqueta tom="neutra">{item.tipoRotulo}</Etiqueta>
        {item.expiraEm !== null && (
          <Etiqueta tom="perigo">
            <TriangleAlert size={12} aria-hidden="true" /> vence {quando(item.expiraEm)}
          </Etiqueta>
        )}
      </div>

      <p className="crc-corpo">{item.motivo}</p>

      <small className="crc-meta">
        {/*
          A LINHA QUE EXPLICA O NÚMERO. "R$ 1.440 esperado" sozinho não permite
          discordar; "R$ 12.000 × 12%" permite — e discordar é como o critério
          melhora.
        */}
        {reais(item.valorEsperado)} esperado
        {item.probabilidade !== null && (
          <>
            {" · "}
            {reais(item.valorPotencial)} × {porcento(item.probabilidade)}
          </>
        )}
        {item.confianca !== null && item.confianca < CONFIANCA_QUE_DISPENSA_AVISO && (
          <> · chance estimada, ainda não medida</>
        )}
        {item.proximaAcao !== null && <> · {item.proximaAcao}</>}
      </small>
    </li>
  );
}

/* -------------------------------------------------------------------------- */

function rotuloDoEstado(estado: string): string {
  const MAPA: Readonly<Record<string, string>> = {
    DETECTED: "Detectada",
    QUALIFIED: "Avaliada",
    IN_ACTION: "Em contato",
    WAITING_PATIENT: "Esperando o paciente",
    WAITING_HUMAN: "Esperando você",
  };
  return MAPA[estado] ?? estado;
}

function tomDoEstado(estado: string): "neutra" | "positiva" | "alerta" | "perigo" | "info" {
  // "Esperando você" é o único que pede ação agora — e por isso é o único em
  // alerta. Se todos fossem coloridos, nenhum chamaria atenção.
  if (estado === "WAITING_HUMAN") return "alerta";
  if (estado === "IN_ACTION") return "info";
  return "neutra";
}

const reais = (v: number): string =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

const porcento = (v: number): string => `${String(Math.round(v * 100))}%`;

/** "hoje", "amanhã" ou a data. Um ISO cru numa etiqueta não diz urgência. */
function quando(iso: string): string {
  const alvo = new Date(iso);
  const hoje = new Date();
  const dias = Math.round((alvo.getTime() - hoje.getTime()) / 86_400_000);

  if (dias <= 0) return "hoje";
  if (dias === 1) return "amanhã";
  if (dias <= 7) return `em ${String(dias)} dias`;
  return alvo.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}
