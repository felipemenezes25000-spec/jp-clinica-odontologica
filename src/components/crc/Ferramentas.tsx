/**
 * Ferramentas — o que o agente pode fazer, e com quanta autonomia.
 *
 * A REGRA QUE GOVERNA A TELA INTEIRA, e que precisa estar visível para quem
 * mexe: **a configuração pode APERTAR o que o código permite, nunca AFROUXAR.**
 *
 * Uma clínica consegue exigir aprovação humana para oferecer horário. Nenhuma
 * consegue dispensar a aprovação de cancelar consulta — e a trava não depende
 * desta tela: ela é aplicada na LEITURA, em `aplicacao/estudios.ts`, então nem
 * gravar direto no banco a contorna.
 *
 * POR QUE A TELA MOSTRA O QUE NÃO DÁ PARA MUDAR. Um controle desabilitado sem
 * explicação vira chamado de suporte. Um controle desabilitado dizendo "esta
 * ferramenta exige aprovação humana por definição do sistema" vira compreensão.
 */
import { useCallback, useEffect, useState } from "react";
import { Wrench } from "lucide-react";

import {
  ajustarFerramentaDoAgente,
  carregarFerramentasDoAgente,
  salvarParametrosDoAgente,
  type FerramentaConfiguravelDto,
  type ParametrosDoAgenteDto,
} from "@/lib/crc/api";

import {
  Aviso,
  BarraDeRecado,
  Botao,
  Campo,
  Cartao,
  Entrada,
  Etiqueta,
  Interruptor,
  ListaEsqueleto,
  useAcao,
} from "./base";

const ROTULO_APROVACAO: Record<string, string> = {
  NENHUMA: "direto",
  CONFIRMACAO_PACIENTE: "o paciente confirma",
  HUMANO: "uma pessoa aprova",
};

const ROTULO_PERMISSAO: Record<string, string> = {
  LEITURA: "só consulta",
  ESCRITA: "muda dado no CRC",
  SENSIVEL: "mexe na agenda real",
};

export function Ferramentas() {
  const [ferramentas, setFerramentas] = useState<FerramentaConfiguravelDto[] | null>(null);
  const [parametros, setParametros] = useState<ParametrosDoAgenteDto | null>(null);
  const [teto, setTeto] = useState(4);
  const [erro, setErro] = useState<string | null>(null);
  const acao = useAcao();

  const recarregar = useCallback(async (): Promise<void> => {
    try {
      const r = await carregarFerramentasDoAgente();
      if (r.ok) {
        setFerramentas(r.ferramentas);
        setParametros(r.parametros);
        setTeto(r.tetoDeFerramentas);
        setErro(null);
      } else {
        setErro(r.message);
      }
    } catch {
      setErro("Não conseguimos carregar as ferramentas.");
    }
  }, []);

  useEffect(() => {
    void recarregar();
  }, [recarregar]);

  const alternar = useCallback(
    (f: FerramentaConfiguravelDto, ligada: boolean): void => {
      void acao.executar(
        () =>
          ajustarFerramentaDoAgente({
            data: {
              chave: f.chave,
              ligada,
              // Preserva o aperto da clínica ao ligar/desligar: mandar `null`
              // aqui apagaria em silêncio uma exigência que alguém configurou.
              aprovacaoExigida:
                f.aprovacaoEfetiva === f.aprovacaoDoCodigo ? null : f.aprovacaoEfetiva,
            },
          }),
        () => {
          void recarregar();
        },
        ligada ? "Ferramenta ligada." : "Ferramenta desligada.",
      );
    },
    [acao, recarregar],
  );

  const apertar = useCallback(
    (f: FerramentaConfiguravelDto, aprovacao: string): void => {
      void acao.executar(
        () =>
          ajustarFerramentaDoAgente({
            data: {
              chave: f.chave,
              ligada: f.ligada,
              aprovacaoExigida: aprovacao === f.aprovacaoDoCodigo ? null : aprovacao,
            },
          }),
        () => {
          void recarregar();
        },
        "Exigência atualizada.",
      );
    },
    [acao, recarregar],
  );

  if (erro !== null && ferramentas === null) return <Aviso tom="perigo">{erro}</Aviso>;
  if (ferramentas === null || parametros === null) return <ListaEsqueleto linhas={5} />;

  const desligadas = ferramentas.filter((f) => !f.ligada).length;

  return (
    <>
      <BarraDeRecado recado={acao.recado} aoFechar={acao.limpar} />

      <div style={{ marginBottom: "var(--crc-e5)" }}>
        <Aviso tom="info">
          Aqui dá para <strong>reduzir</strong> o que o agente faz, nunca aumentar. Uma ferramenta
          que já exige aprovação de uma pessoa continua exigindo, escolha o que escolher.
        </Aviso>
      </div>

      {/* Agent Studio: os parâmetros ------------------------------------ */}
      <Cartao titulo="Quanto o agente pode fazer por conversa">
        <ParametrosDoAgente
          parametros={parametros}
          teto={teto}
          rodando={acao.rodando}
          aoSalvar={(p) => {
            void acao.executar(
              () => salvarParametrosDoAgente({ data: p }),
              () => {
                void recarregar();
              },
              "Parâmetros salvos.",
            );
          }}
        />
      </Cartao>

      {/* Tool Studio: o catálogo ---------------------------------------- */}
      <Cartao
        titulo="As ferramentas"
        acao={
          desligadas > 0 ? (
            <Etiqueta tom="alerta">{desligadas} desligada(s)</Etiqueta>
          ) : (
            <Etiqueta tom="positiva">todas ligadas</Etiqueta>
          )
        }
      >
        <ul className="crc-pilha">
          {ferramentas.map((f) => (
            <li key={f.chave} className="crc-cartao-compacto" data-status={f.ligada ? "ok" : "off"}>
              <div className="crc-linha" style={{ gap: "var(--crc-e2)", flexWrap: "wrap" }}>
                <Wrench size={14} />
                <strong>{f.chave}</strong>
                <Etiqueta tom={f.permissao === "SENSIVEL" ? "perigo" : "neutra"}>
                  {ROTULO_PERMISSAO[f.permissao] ?? f.permissao}
                </Etiqueta>
                {f.essencial && (
                  /*
                    "ESSENCIAL" PRECISA APARECER, e não só desabilitar o
                    interruptor. Sem o rótulo, quem tenta desligar acha que a
                    tela travou; com ele, entende que existe uma razão — e a
                    razão está na dica logo abaixo.
                  */
                  <Etiqueta tom="info">essencial</Etiqueta>
                )}
                {f.apertadaPelaClinica && <Etiqueta tom="alerta">apertada por vocês</Etiqueta>}

                <span className="crc-empurra">
                  <Interruptor
                    rotulo={f.ligada ? "ligada" : "desligada"}
                    ligado={f.ligada}
                    desabilitado={acao.rodando || f.essencial}
                    aoMudar={(v) => {
                      alternar(f, v);
                    }}
                  />
                </span>
              </div>

              <p className="crc-corpo" style={{ marginTop: "var(--crc-e1)" }}>
                {f.descricao}
              </p>

              {f.essencial ? (
                <small className="crc-meta">
                  Não dá para desligar: sem ela o agente fica sem como passar a conversa para uma
                  pessoa, ou sem como registrar quem pediu para não ser mais contatado.
                </small>
              ) : (
                <div
                  className="crc-linha"
                  style={{ gap: "var(--crc-e2)", marginTop: "var(--crc-e2)", flexWrap: "wrap" }}
                >
                  <small className="crc-meta">Antes de executar:</small>
                  {(["NENHUMA", "CONFIRMACAO_PACIENTE", "HUMANO"] as const).map((nivel) => {
                    // O QUE O CÓDIGO EXIGE É O PISO. Níveis abaixo dele nem
                    // aparecem como opção — a recusa acontece no servidor de
                    // qualquer forma, e oferecer o que vai ser negado é convidar
                    // a pessoa a tentar.
                    const abaixoDoPiso =
                      rigor(nivel) < rigor(f.aprovacaoDoCodigo as keyof typeof RIGOR);
                    if (abaixoDoPiso) return null;

                    return (
                      <Botao
                        key={nivel}
                        variante={f.aprovacaoEfetiva === nivel ? "primario" : "discreto"}
                        disabled={acao.rodando}
                        onClick={() => {
                          apertar(f, nivel);
                        }}
                      >
                        {ROTULO_APROVACAO[nivel] ?? nivel}
                      </Botao>
                    );
                  })}
                </div>
              )}
            </li>
          ))}
        </ul>
      </Cartao>
    </>
  );
}

const RIGOR = { NENHUMA: 0, CONFIRMACAO_PACIENTE: 1, HUMANO: 2 } as const;
const rigor = (n: keyof typeof RIGOR): number => RIGOR[n];

/**
 * Os três números do Agent Studio.
 *
 * ESTADO LOCAL, e não salvo a cada tecla: quem está ajustando um teto digita
 * `1`, depois `2` para chegar em `12`. Salvar no primeiro dígito aplicaria o
 * teto `1` por um instante — e num sistema com fila, um instante é um lote.
 */
function ParametrosDoAgente({
  parametros,
  teto,
  rodando,
  aoSalvar,
}: {
  parametros: ParametrosDoAgenteDto;
  teto: number;
  rodando: boolean;
  aoSalvar: (p: ParametrosDoAgenteDto) => void;
}) {
  const [local, setLocal] = useState(parametros);

  useEffect(() => {
    setLocal(parametros);
  }, [parametros]);

  const mudou =
    local.maxFerramentas !== parametros.maxFerramentas ||
    local.maxCaracteres !== parametros.maxCaracteres ||
    local.temperatura !== parametros.temperatura;

  return (
    <>
      <div className="crc-grade">
        <Campo
          rotulo="Ferramentas por conversa"
          dica={`No máximo ${String(teto)}. Cada ferramenta é uma chamada de modelo a mais — é aqui que o custo por turno sobe.`}
        >
          {(id) => (
            <Entrada
              id={id}
              type="number"
              min={1}
              max={teto}
              value={local.maxFerramentas}
              onChange={(e) => {
                setLocal({ ...local, maxFerramentas: Number(e.target.value) });
              }}
            />
          )}
        </Campo>

        <Campo
          rotulo="Tamanho da resposta"
          dica="Em caracteres. Mensagem de clínica é curta: um agente que escreve parágrafos soa como folheto, e ninguém lê folheto no WhatsApp."
        >
          {(id) => (
            <Entrada
              id={id}
              type="number"
              min={100}
              max={2000}
              value={local.maxCaracteres}
              onChange={(e) => {
                setLocal({ ...local, maxCaracteres: Number(e.target.value) });
              }}
            />
          )}
        </Campo>

        <Campo
          rotulo="Criatividade"
          // O NOME "TEMPERATURA" NÃO APARECE para quem usa. E a dica diz o que
          // ela significa AQUI: num agente de clínica, criatividade alta tem
          // outro nome, e é invenção.
          dica="De 0 a 1. Baixo é o certo: este agente responde sobre horário, convênio e orçamento. Criatividade aqui vira invenção."
        >
          {(id) => (
            <Entrada
              id={id}
              type="number"
              min={0}
              max={1}
              step={0.1}
              value={local.temperatura}
              onChange={(e) => {
                setLocal({ ...local, temperatura: Number(e.target.value) });
              }}
            />
          )}
        </Campo>
      </div>

      <Botao
        onClick={() => {
          aoSalvar(local);
        }}
        disabled={rodando || !mudou}
      >
        Salvar
      </Botao>
    </>
  );
}
