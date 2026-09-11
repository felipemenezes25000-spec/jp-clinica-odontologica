/**
 * Conhecimento — o que a clínica ensina ao agente.
 *
 * ESTA TELA RESOLVE UM PROBLEMA DE CONFIANÇA, e não de cadastro. Escrever
 * material para um agente que busca por significado é escrever no escuro: a
 * pessoa publica um parágrafo claríssimo sobre parcelamento e descobre, três
 * semanas depois numa conversa real, que a pergunta "dá pra dividir?" não
 * achava aquele parágrafo.
 *
 * Por isso a tela tem uma CAIXA DE TESTE no topo, e não no fim. A pergunta que
 * ela responde — "o que o agente acha quando alguém pergunta isso?" — é a mesma
 * que a pessoa teria que esperar semanas para responder de outro jeito.
 *
 * AS TRÊS ETAPAS SÃO SEPARADAS DE PROPÓSITO: escrever, indexar, publicar.
 *
 *   Escrever custa nada e pode ser feito vinte vezes.
 *   Indexar custa dinheiro — é chamada de modelo por pedaço de texto.
 *   Publicar é o momento em que aquilo passa a responder paciente.
 *
 * Juntar as três num botão "Salvar" faria a pessoa pagar vinte indexações para
 * corrigir uma vírgula, e faria o texto responder paciente antes de alguém
 * reler.
 */
import { useCallback, useEffect, useState } from "react";
import { BookOpenText, Search } from "lucide-react";

import {
  arquivarFonteDeConhecimento,
  carregarConhecimento,
  indexarFonteDeConhecimento,
  publicarFonteDeConhecimento,
  salvarFonteDeConhecimento,
  testarBuscaNoConhecimento,
  type FonteDeConhecimentoDto,
  type PainelDeConhecimentoDto,
  type TrechoDeBuscaDto,
} from "@/lib/crc/api";
import { tempoRelativo } from "@/lib/crc/dominio/formatar";

import {
  Area,
  Aviso,
  BarraDeRecado,
  Botao,
  Campo,
  Cartao,
  Entrada,
  Etiqueta,
  ListaEsqueleto,
  useAcao,
  Vazio,
} from "./base";

const ROTULO_STATUS: Record<string, { texto: string; tom: "positiva" | "alerta" | "neutra" }> = {
  PUBLICADA: { texto: "o agente usa", tom: "positiva" },
  RASCUNHO: { texto: "só você vê", tom: "alerta" },
  ARQUIVADA: { texto: "guardado, fora do ar", tom: "neutra" },
};

const TIPOS: readonly { valor: string; rotulo: string }[] = [
  { valor: "faq", rotulo: "Perguntas e respostas" },
  { valor: "procedimento", rotulo: "Como funciona um tratamento" },
  { valor: "politica", rotulo: "Regra da clínica" },
  { valor: "texto", rotulo: "Outro" },
];

export function Conhecimento() {
  const [painel, setPainel] = useState<PainelDeConhecimentoDto | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [editando, setEditando] = useState<FonteDeConhecimentoDto | null>(null);
  const acao = useAcao();

  const recarregar = useCallback(async (): Promise<void> => {
    try {
      const r = await carregarConhecimento();
      if (r.ok) {
        setPainel(r.painel);
        setErro(null);
      } else {
        setErro(r.message);
      }
    } catch {
      setErro("Não conseguimos carregar o material da clínica.");
    }
  }, []);

  useEffect(() => {
    void recarregar();
  }, [recarregar]);

  if (erro !== null && painel === null) return <Aviso tom="perigo">{erro}</Aviso>;
  if (painel === null) return <ListaEsqueleto linhas={4} />;

  return (
    <>
      <BarraDeRecado recado={acao.recado} aoFechar={acao.limpar} />

      {/*
        O ESTADO DO PROVEDOR VEM ANTES DE TUDO. Uma tela que aceita escrever e
        indexar sem dizer que a busca não está configurada produz a pior versão
        do problema: trabalho feito, material publicado, e o agente sem usar
        nada disso.
      */}
      {!painel.buscaConfigurada && (
        <div style={{ marginBottom: "var(--crc-e5)" }}>
          <Aviso tom="alerta">
            <strong>A busca por significado ainda não está ligada.</strong> {painel.motivo} Você
            pode escrever os textos agora; eles só começam a responder depois disso.
          </Aviso>
        </div>
      )}

      {painel.buscaConfigurada && painel.provedor === "sandbox" && (
        <div style={{ marginBottom: "var(--crc-e5)" }}>
          <Aviso tom="alerta">
            <strong>Modo de teste.</strong> A busca está usando o provedor de exemplo, que compara
            PALAVRAS e não significado: “dá pra dividir?” não vai achar “parcelamos em 12x”. Serve
            para conferir o fluxo, não para atender paciente.
          </Aviso>
        </div>
      )}

      <CaixaDeTeste ativa={painel.buscaConfigurada} />

      <Cartao titulo="O que a clínica já escreveu">
        <p className="crc-corpo" style={{ marginTop: "var(--crc-e2)" }}>
          Cada texto aqui é material que o agente pode consultar para responder. Ele responde{" "}
          <strong>só com o que estiver escrito</strong>: quando não acha, diz que vai confirmar com
          a equipe — em vez de inventar. Três passos para um texto entrar no ar: escrever, indexar
          (isso ensina o agente a achar o texto) e publicar.
        </p>

        {painel.fontes.length === 0 ? (
          <div style={{ marginTop: "var(--crc-e4)" }}>
            <Vazio
              titulo="Nenhum texto escrito ainda."
              explicacao="Comece pelo que a recepção mais repete no telefone: formas de pagamento, convênios aceitos, o que fazer antes de uma extração. Uma pergunta por texto funciona melhor do que um documento gigante."
              acao={
                <Botao
                  onClick={() => {
                    setEditando(vazia());
                  }}
                >
                  Escrever o primeiro
                </Botao>
              }
            />
          </div>
        ) : (
          <>
            <div className="crc-linha" style={{ marginTop: "var(--crc-e4)" }}>
              <Botao
                onClick={() => {
                  setEditando(vazia());
                }}
              >
                Escrever um texto novo
              </Botao>
            </div>

            <ul className="crc-pilha" style={{ marginTop: "var(--crc-e4)" }}>
              {painel.fontes.map((f) => (
                <LinhaDeFonte
                  key={f.id}
                  fonte={f}
                  rodando={acao.rodando}
                  aoEditar={() => {
                    setEditando(f);
                  }}
                  aoIndexar={() => {
                    void acao.executar(
                      () => indexarFonteDeConhecimento({ data: { sourceId: f.id } }),
                      (r) => {
                        void recarregar();
                        acao.avisar(
                          `Indexado em ${String(r.pedacos)} ${r.pedacos === 1 ? "pedaço" : "pedaços"}. Agora falta publicar.`,
                        );
                      },
                    );
                  }}
                  aoPublicar={() => {
                    void acao.executar(
                      () => publicarFonteDeConhecimento({ data: { sourceId: f.id } }),
                      () => {
                        void recarregar();
                      },
                      "Publicado. O agente já pode responder com este texto.",
                    );
                  }}
                  aoArquivar={() => {
                    void acao.executar(
                      () => arquivarFonteDeConhecimento({ data: { sourceId: f.id } }),
                      () => {
                        void recarregar();
                      },
                      "Guardado. Sai da busca e o texto continua aqui.",
                    );
                  }}
                />
              ))}
            </ul>
          </>
        )}
      </Cartao>

      {editando !== null && (
        <Editor
          fonte={editando}
          aoFechar={() => {
            setEditando(null);
          }}
          aoSalvar={(dados) => {
            void acao.executar(
              () => salvarFonteDeConhecimento({ data: dados }),
              () => {
                setEditando(null);
                void recarregar();
              },
              "Salvo. Agora clique em “Indexar” para o agente conseguir achar este texto.",
            );
          }}
          rodando={acao.rodando}
        />
      )}
    </>
  );
}

const vazia = (): FonteDeConhecimentoDto => ({
  id: "",
  titulo: "",
  tipo: "faq",
  corpo: "",
  status: "RASCUNHO",
  versao: 0,
  pedacos: 0,
  atualizadoEm: "",
});

/* -------------------------------------------------------------------------- */
/* A caixa de teste                                                           */
/* -------------------------------------------------------------------------- */

/**
 * A pergunta de teste, e o que o agente acharia com ela.
 *
 * MOSTRA A NOTA E QUANTAS PALAVRAS BATERAM. Um número sozinho ("0,78") não
 * ensina; ao lado de "3 palavras da pergunta", ele explica por que aquele trecho
 * subiu — e o que reescrever quando o trecho certo não sobe.
 */
function CaixaDeTeste({ ativa }: { ativa: boolean }) {
  const [pergunta, setPergunta] = useState("");
  const [trechos, setTrechos] = useState<TrechoDeBuscaDto[] | null>(null);
  const acao = useAcao();

  return (
    <Cartao titulo="Testar o que o agente acha">
      <p className="crc-corpo" style={{ marginTop: "var(--crc-e2)" }}>
        Escreva uma pergunta como um paciente escreveria. A lista mostra exatamente os trechos que o
        agente veria — e nada mais do que isso. Se o trecho certo não aparecer, o texto precisa ser
        reescrito com as palavras que as pessoas usam de verdade.
      </p>

      <BarraDeRecado recado={acao.recado} aoFechar={acao.limpar} />

      <div className="crc-linha" style={{ marginTop: "var(--crc-e3)", gap: "var(--crc-e3)" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Campo rotulo="Pergunta de teste">
            {(id) => (
              <Entrada
                id={id}
                value={pergunta}
                placeholder="dá pra dividir o valor no cartão?"
                disabled={!ativa}
                onChange={(e) => {
                  setPergunta(e.target.value);
                }}
              />
            )}
          </Campo>
        </div>
      </div>

      <Botao
        variante="secundario"
        disabled={!ativa || acao.rodando || pergunta.trim().length < 3}
        onClick={() => {
          void acao.executar(
            () => testarBuscaNoConhecimento({ data: { pergunta: pergunta.trim() } }),
            (r) => {
              setTrechos(r.trechos);
            },
          );
        }}
      >
        <Search size={14} /> Ver o que o agente acha
      </Botao>

      {trechos !== null && trechos.length === 0 && (
        <div style={{ marginTop: "var(--crc-e4)" }}>
          <Aviso tom="alerta">
            <strong>Nada foi encontrado.</strong> Com esta pergunta, o agente diria que vai
            confirmar com a equipe — o que está correto, e é melhor do que inventar. Se existe texto
            sobre isso, ele precisa estar publicado e usar as palavras da pergunta.
          </Aviso>
        </div>
      )}

      {trechos !== null && trechos.length > 0 && (
        <ul className="crc-pilha" style={{ marginTop: "var(--crc-e4)" }}>
          {trechos.map((t, i) => (
            <li key={`${t.titulo}-${String(i)}`} className="crc-cartao-compacto">
              <div className="crc-linha" style={{ gap: "var(--crc-e2)", flexWrap: "wrap" }}>
                <strong>
                  {i + 1}º · {t.titulo}
                </strong>
                <Etiqueta tom={t.nota >= 0.6 ? "positiva" : "alerta"}>
                  parecido {Math.round(t.nota * 100)}%
                </Etiqueta>
                <span className="crc-meta">
                  {t.termosEncontrados === 1
                    ? "1 palavra da pergunta"
                    : `${String(t.termosEncontrados)} palavras da pergunta`}
                </span>
              </div>
              <p className="crc-corpo" style={{ marginTop: "var(--crc-e1)" }}>
                {t.conteudo}
              </p>
            </li>
          ))}
        </ul>
      )}
    </Cartao>
  );
}

/* -------------------------------------------------------------------------- */
/* A lista e o editor                                                         */
/* -------------------------------------------------------------------------- */

function LinhaDeFonte({
  fonte,
  rodando,
  aoEditar,
  aoIndexar,
  aoPublicar,
  aoArquivar,
}: {
  fonte: FonteDeConhecimentoDto;
  rodando: boolean;
  aoEditar: () => void;
  aoIndexar: () => void;
  aoPublicar: () => void;
  aoArquivar: () => void;
}) {
  const status = ROTULO_STATUS[fonte.status] ?? { texto: fonte.status, tom: "neutra" as const };
  const precisaIndexar = fonte.pedacos === 0;

  return (
    <li className="crc-cartao-compacto" data-status={fonte.status}>
      <div className="crc-linha" style={{ gap: "var(--crc-e2)", flexWrap: "wrap" }}>
        <strong>{fonte.titulo}</strong>
        <Etiqueta tom={status.tom}>{status.texto}</Etiqueta>
        {precisaIndexar && <Etiqueta tom="perigo">falta indexar</Etiqueta>}
        <span className="crc-meta crc-empurra">{tempoRelativo(fonte.atualizadoEm)}</span>
      </div>

      <p className="crc-corpo" style={{ marginTop: "var(--crc-e1)" }}>
        {fonte.corpo.slice(0, 180)}
        {fonte.corpo.length > 180 ? "…" : ""}
      </p>

      <div
        className="crc-linha"
        style={{ marginTop: "var(--crc-e2)", gap: "var(--crc-e3)", flexWrap: "wrap" }}
      >
        <span className="crc-meta">
          {fonte.pedacos === 0
            ? "nenhum pedaço indexado"
            : fonte.pedacos === 1
              ? "1 pedaço indexado"
              : `${String(fonte.pedacos)} pedaços indexados`}
        </span>
        <span className="crc-meta">versão {fonte.versao}</span>

        <Botao pequeno variante="discreto" disabled={rodando} onClick={aoEditar}>
          Editar
        </Botao>
        <Botao pequeno variante="secundario" disabled={rodando} onClick={aoIndexar}>
          Indexar
        </Botao>
        {fonte.status !== "PUBLICADA" && (
          <Botao pequeno disabled={rodando} onClick={aoPublicar}>
            Publicar
          </Botao>
        )}
        {fonte.status === "PUBLICADA" && (
          <Botao pequeno variante="perigo" disabled={rodando} onClick={aoArquivar}>
            Tirar do ar
          </Botao>
        )}
      </div>
    </li>
  );
}

function Editor({
  fonte,
  rodando,
  aoFechar,
  aoSalvar,
}: {
  fonte: FonteDeConhecimentoDto;
  rodando: boolean;
  aoFechar: () => void;
  aoSalvar: (dados: { titulo: string; tipo: string; corpo: string }) => void;
}) {
  const [titulo, setTitulo] = useState(fonte.titulo);
  const [tipo, setTipo] = useState(fonte.tipo);
  const [corpo, setCorpo] = useState(fonte.corpo);

  return (
    <Cartao titulo={fonte.id === "" ? "Texto novo" : `Editando: ${fonte.titulo}`}>
      <div className="crc-pilha" style={{ marginTop: "var(--crc-e3)" }}>
        <Campo
          rotulo="Título"
          dica="É a etiqueta que aparece junto do trecho. “Formas de pagamento” funciona melhor do que “Documento 3”."
        >
          {(id) => (
            <Entrada
              id={id}
              value={titulo}
              maxLength={160}
              onChange={(e) => {
                setTitulo(e.target.value);
              }}
            />
          )}
        </Campo>

        <Campo rotulo="Tipo">
          {(id) => (
            <select
              id={id}
              className="crc-entrada"
              value={tipo}
              onChange={(e) => {
                setTipo(e.target.value);
              }}
            >
              {TIPOS.map((t) => (
                <option key={t.valor} value={t.valor}>
                  {t.rotulo}
                </option>
              ))}
            </select>
          )}
        </Campo>

        <Campo
          rotulo="Conteúdo"
          dica="Separe assuntos diferentes com uma linha em branco: é assim que o sistema corta o texto em pedaços, e cada pedaço responde uma pergunta. Escreva como você explicaria no telefone."
        >
          {(id) => (
            <Area
              id={id}
              rows={12}
              value={corpo}
              onChange={(e) => {
                setCorpo(e.target.value);
              }}
            />
          )}
        </Campo>
      </div>

      <div className="crc-linha" style={{ marginTop: "var(--crc-e4)", gap: "var(--crc-e3)" }}>
        <Botao
          disabled={rodando}
          onClick={() => {
            aoSalvar({ titulo, tipo, corpo });
          }}
        >
          Salvar
        </Botao>
        <Botao variante="discreto" disabled={rodando} onClick={aoFechar}>
          Cancelar
        </Botao>
      </div>
    </Cartao>
  );
}

/** Só para o shell saber que existe sem importar o resto. */
export const ICONE_CONHECIMENTO = BookOpenText;
