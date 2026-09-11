/**
 * Estúdio — onde se escreve o que o agente é, e onde se vê o que ele pode.
 *
 * ESTA TELA EXISTE PARA UMA PERGUNTA TER UM LUGAR: "por que o agente não está
 * fazendo X?". Ela tem quatro respostas possíveis — o texto dele não manda,
 * a ferramenta está sem permissão, uma chave está desligada, ou a prova não
 * passou — e procurar as quatro em quatro telas é como ninguém encontra a
 * terceira.
 *
 * O CICLO QUE A TELA IMPÕE, e é de propósito que ele tenha três cliques:
 *
 *   Editar   →  cria um rascunho. Rascunho não fala com paciente nenhum.
 *   Avaliar  →  a prova roda sobre o RASCUNHO, não sobre o que está no ar.
 *   Publicar →  só com a prova do rascunho aprovada e recente.
 *
 * Juntar os três num "Salvar" faria o texto novo responder paciente no segundo
 * seguinte, sem ninguém ter conferido nada.
 */
import { useCallback, useEffect, useState } from "react";
import { Sparkles } from "lucide-react";

import {
  carregarEstudio,
  descartarRascunhoDoAgente,
  publicarVersaoDoAgente,
  salvarRascunhoDoAgente,
  type PainelDoEstudioDto,
} from "@/lib/crc/api";
import { tempoRelativo } from "@/lib/crc/dominio/formatar";

import {
  Area,
  Aviso,
  BarraDeRecado,
  Botao,
  Cartao,
  Etiqueta,
  ListaEsqueleto,
  useAcao,
} from "./base";

const ROTULO_PERMISSAO: Record<string, string> = {
  LEITURA: "só consulta",
  ESCRITA: "muda coisa no CRC",
  SENSIVEL: "mexe na agenda da clínica",
};

export function Estudio() {
  const [painel, setPainel] = useState<PainelDoEstudioDto | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [texto, setTexto] = useState<string | null>(null);
  const acao = useAcao();

  const recarregar = useCallback(async (): Promise<void> => {
    try {
      const r = await carregarEstudio();
      if (r.ok) {
        setPainel(r.painel);
        // A caixa começa no rascunho quando existe um, e no texto em uso quando
        // não. Nunca no padrão do código: quem tem versão publicada não quer
        // achar que o texto dela desapareceu.
        setTexto((atual) => atual ?? r.painel.rascunho ?? r.painel.emUso);
        setErro(null);
      } else {
        setErro(r.message);
      }
    } catch {
      setErro("Não conseguimos carregar o Estúdio.");
    }
  }, []);

  useEffect(() => {
    void recarregar();
  }, [recarregar]);

  if (erro !== null && painel === null) return <Aviso tom="perigo">{erro}</Aviso>;
  if (painel === null || texto === null) return <ListaEsqueleto linhas={5} />;

  const mudou = texto.trim() !== (painel.rascunho ?? painel.emUso).trim();

  return (
    <>
      <BarraDeRecado recado={acao.recado} aoFechar={acao.limpar} />

      <div style={{ marginBottom: "var(--crc-e5)" }}>
        <Aviso tom={painel.gate.liberado ? "info" : "alerta"}>
          {painel.gate.liberado ? (
            <>
              <strong>O agente está aprovado para responder pacientes.</strong> O texto em uso é{" "}
              {painel.versaoEmUso === null
                ? "o que vem de fábrica."
                : `a versão ${String(painel.versaoEmUso)}.`}
            </>
          ) : (
            <>
              <strong>O agente ainda não responde pacientes.</strong> {painel.gate.motivo}
            </>
          )}
        </Aviso>
      </div>

      <Cartao titulo="O que o agente é">
        <p className="crc-corpo" style={{ marginTop: "var(--crc-e2)" }}>
          Este é o texto que a IA lê antes de cada resposta: como falar, o que pode dizer e o que
          nunca pode. Editar aqui <strong>não muda nada na hora</strong> — cria um rascunho. O
          rascunho passa pela prova em Avaliação e só depois pode ir ao ar.
        </p>
        <p className="crc-corpo" style={{ marginTop: "var(--crc-e2)" }}>
          Uma coisa que este texto <strong>não</strong> controla: as proibições duras. Falar de
          remédio, prometer que alguém vai ligar, citar preço e inventar horário são barrados pelo
          sistema, não por este texto — apagar a frase daqui não libera nada disso.
        </p>

        <div style={{ marginTop: "var(--crc-e4)" }}>
          <Area
            rows={18}
            value={texto}
            onChange={(e) => {
              setTexto(e.target.value);
            }}
            aria-label="Texto do agente"
          />
        </div>

        <div
          className="crc-linha"
          style={{ marginTop: "var(--crc-e4)", gap: "var(--crc-e3)", flexWrap: "wrap" }}
        >
          <Botao
            disabled={acao.rodando || !mudou}
            onClick={() => {
              void acao.executar(
                () => salvarRascunhoDoAgente({ data: { instrucoes: texto } }),
                (r) => {
                  void recarregar();
                  acao.avisar(
                    `Rascunho da versão ${String(r.versao)} salvo. Agora rode a prova em Avaliação.`,
                  );
                },
              );
            }}
          >
            Salvar rascunho
          </Botao>

          <Botao
            variante="primario"
            disabled={acao.rodando || !painel.podePublicar}
            title={painel.motivoPublicacao}
            onClick={() => {
              void acao.executar(
                () => publicarVersaoDoAgente({ data: undefined }),
                () => {
                  setTexto(null);
                  void recarregar();
                },
                "Publicado. A partir da próxima mensagem, é este o texto que o agente usa.",
              );
            }}
          >
            Publicar
          </Botao>

          {painel.rascunho !== null && (
            <Botao
              variante="discreto"
              disabled={acao.rodando}
              onClick={() => {
                void acao.executar(
                  () => descartarRascunhoDoAgente({ data: undefined }),
                  () => {
                    setTexto(null);
                    void recarregar();
                  },
                  "Rascunho descartado. O texto no ar continua o mesmo.",
                );
              }}
            >
              Descartar rascunho
            </Botao>
          )}

          <Botao
            variante="discreto"
            disabled={acao.rodando}
            onClick={() => {
              setTexto(painel.padraoDoCodigo);
            }}
          >
            Voltar ao texto de fábrica
          </Botao>
        </div>

        {!painel.podePublicar && painel.motivoPublicacao.length > 0 && (
          <p className="crc-meta" style={{ marginTop: "var(--crc-e3)" }}>
            {painel.motivoPublicacao}
          </p>
        )}
      </Cartao>

      {painel.versoes.length > 0 && (
        <Cartao titulo="Histórico">
          <p className="crc-corpo" style={{ marginTop: "var(--crc-e2)" }}>
            Versão publicada não se apaga nem se edita por cima. É o que permite responder, meses
            depois, “o que estava no ar quando aquela conversa aconteceu?”.
          </p>
          <ul className="crc-pilha" style={{ marginTop: "var(--crc-e4)" }}>
            {painel.versoes.map((v) => (
              <li key={v.id} className="crc-cartao-compacto" data-status={v.status}>
                <div className="crc-linha" style={{ gap: "var(--crc-e2)", flexWrap: "wrap" }}>
                  <strong>Versão {v.versao}</strong>
                  <Etiqueta
                    tom={
                      v.status === "PUBLICADA"
                        ? "positiva"
                        : v.status === "RASCUNHO"
                          ? "alerta"
                          : "neutra"
                    }
                  >
                    {v.status === "PUBLICADA"
                      ? "no ar"
                      : v.status === "RASCUNHO"
                        ? "rascunho"
                        : "guardada"}
                  </Etiqueta>
                  <span className="crc-meta crc-empurra">
                    {v.publicadoEm === null
                      ? `criada ${tempoRelativo(v.criadoEm)}`
                      : `publicada ${tempoRelativo(v.publicadoEm)}`}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </Cartao>
      )}

      <Cartao titulo="O que o agente pode fazer agora">
        <p className="crc-corpo" style={{ marginTop: "var(--crc-e2)" }}>
          Cada linha é uma coisa que a IA consegue consultar ou fazer. O que está{" "}
          <strong>bloqueado</strong> não depende do texto acima: depende de uma chave em
          Configurações, e a coluna da direita diz qual.
        </p>

        <ul className="crc-pilha" style={{ marginTop: "var(--crc-e4)" }}>
          {painel.ferramentas.map((f) => (
            <li
              key={f.chave}
              className="crc-cartao-compacto"
              data-status={f.liberada ? "ok" : "off"}
            >
              <div className="crc-linha" style={{ gap: "var(--crc-e2)", flexWrap: "wrap" }}>
                <strong>{f.chave}</strong>
                <Etiqueta tom={f.liberada ? "positiva" : "neutra"}>
                  {f.liberada ? "liberada" : "bloqueada"}
                </Etiqueta>
                <span className="crc-meta">{ROTULO_PERMISSAO[f.permissao] ?? f.permissao}</span>
              </div>
              <p className="crc-corpo" style={{ marginTop: "var(--crc-e1)" }}>
                {f.descricao}
              </p>
              {!f.liberada && (
                <p className="crc-meta" style={{ marginTop: "var(--crc-e1)" }}>
                  Bloqueada porque: {f.exigencia}
                </p>
              )}
            </li>
          ))}
        </ul>
      </Cartao>
    </>
  );
}

/** Só para o shell saber que existe sem importar o resto. */
export const ICONE_ESTUDIO = Sparkles;
