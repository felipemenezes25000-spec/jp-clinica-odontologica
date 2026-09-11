/**
 * Avaliação — o teste que o agente tem que passar antes de falar com paciente.
 *
 * A PRIMEIRA COISA DA TELA É O VEREDICTO, e não a lista de casos: quem abre isto
 * quer saber se pode ligar o envio. A lista é o que explica a resposta.
 *
 * O QUE DIFERENCIA ESTA TELA DE UM RELATÓRIO: o resultado não é informativo. Com
 * a avaliação reprovada ou vencida, o botão que liga o envio do agente RECUSA, em
 * Configurações, com o motivo daqui. Um número que alguém olha e ignora não muda
 * comportamento nenhum.
 *
 * E NADA QUE RODA AQUI TOCA EM PACIENTE. Os casos rodam em replay: contexto
 * montado do próprio caso, ferramentas servidas pelo caso, nenhuma linha gravada,
 * nenhuma mensagem enviada.
 */
import { useCallback, useEffect, useState } from "react";
import { ClipboardCheck, Play } from "lucide-react";

import {
  carregarAvaliacao,
  instalarCasosDeAvaliacao,
  removerCasoDeAvaliacao,
  rodarAvaliacaoAgora,
  type PainelDeAvaliacaoDto,
} from "@/lib/crc/api";
import { tempoRelativo } from "@/lib/crc/dominio/formatar";

import {
  Aviso,
  BarraDeRecado,
  Botao,
  Cartao,
  Etiqueta,
  Kpi,
  ListaEsqueleto,
  useAcao,
  Vazio,
} from "./base";

export function Avaliacao() {
  const [painel, setPainel] = useState<PainelDeAvaliacaoDto | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const acao = useAcao();

  const recarregar = useCallback(async (): Promise<void> => {
    try {
      const r = await carregarAvaliacao();
      if (r.ok) {
        setPainel(r.painel);
        setErro(null);
      } else {
        setErro(r.message);
      }
    } catch {
      setErro("Não conseguimos carregar a avaliação.");
    }
  }, []);

  useEffect(() => {
    void recarregar();
  }, [recarregar]);

  if (erro !== null && painel === null) return <Aviso tom="perigo">{erro}</Aviso>;
  if (painel === null) return <ListaEsqueleto linhas={4} />;

  const u = painel.ultima;

  return (
    <>
      <BarraDeRecado recado={acao.recado} aoFechar={acao.limpar} />

      {/*
        O VEREDICTO ANTES DE TUDO. E ele fala do que a pessoa quer fazer — ligar o
        envio — e não do resultado abstrato de uma suíte.
      */}
      <div style={{ marginBottom: "var(--crc-e5)" }}>
        {painel.gate.liberado ? (
          <Aviso tom="info">
            <strong>O agente está aprovado para responder pacientes.</strong> A última avaliação
            passou em todos os casos que impedem publicação. A aprovação vale por 72 horas — depois
            disso é preciso rodar de novo.
          </Aviso>
        ) : (
          <Aviso tom="alerta">
            <strong>O envio do agente não pode ser ligado agora.</strong> {painel.gate.motivo}
          </Aviso>
        )}
      </div>

      {!painel.provedorConfigurado && (
        <div style={{ marginBottom: "var(--crc-e5)" }}>
          <Aviso tom="perigo">
            <strong>Sem provedor de IA configurado, a avaliação não roda.</strong>{" "}
            {painel.motivoProvedor}
          </Aviso>
        </div>
      )}

      {u !== null && (
        <div className="crc-grade" style={{ marginBottom: "var(--crc-e6)" }}>
          <Kpi
            rotulo="Casos avaliados"
            valor={String(u.total)}
            nota={`última vez: ${tempoRelativo(u.criadoEm)}`}
          />
          <Kpi
            rotulo="Passaram"
            valor={`${String(u.passaram)} de ${String(u.total)}`}
            nota={u.modelo === null ? "" : `modelo ${u.modelo}`}
          />
          <Kpi
            rotulo="Impedem publicar"
            valor={String(u.bloqueios.length)}
            nota="segurança, permissão, isolamento, passar para pessoa"
          />
          <Kpi
            rotulo="Só avisam"
            valor={String(u.avisos.length)}
            nota="utilidade e jeito de falar não bloqueiam"
          />
        </div>
      )}

      <Cartao titulo="Rodar a avaliação">
        <p className="crc-corpo" style={{ marginTop: "var(--crc-e2)" }}>
          Cada caso é uma conversa de mentira que o agente tem que resolver do jeito certo. Nada
          disso chega a paciente: a conversa é montada aqui, a agenda e o material vêm escritos no
          próprio caso, e nenhuma mensagem sai. <strong>Custa uma consulta de IA por caso</strong> —
          rodar {painel.casos.length === 1 ? "1 caso" : `${String(painel.casos.length)} casos`} são{" "}
          {painel.casos.length === 1 ? "1 consulta" : `${String(painel.casos.length)} consultas`}.
        </p>

        <div className="crc-linha" style={{ marginTop: "var(--crc-e4)", gap: "var(--crc-e3)" }}>
          <Botao
            disabled={acao.rodando || !painel.provedorConfigurado || painel.casos.length === 0}
            onClick={() => {
              void acao.executar(
                () => rodarAvaliacaoAgora({ data: {} }),
                (r) => {
                  void recarregar();
                  acao.avisar(
                    r.liberado
                      ? `Passou em ${String(r.passaram)} de ${String(r.total)}. O envio do agente está liberado.`
                      : `Passou em ${String(r.passaram)} de ${String(r.total)}, mas há falhas que impedem publicar. Veja abaixo.`,
                    r.liberado ? "info" : "perigo",
                  );
                },
              );
            }}
          >
            <Play size={14} /> Rodar agora
          </Botao>

          {painel.casos.length === 0 && (
            <Botao
              variante="secundario"
              disabled={acao.rodando}
              onClick={() => {
                void acao.executar(
                  () => instalarCasosDeAvaliacao({ data: undefined }),
                  (r) => {
                    void recarregar();
                    acao.avisar(`${String(r.criados)} casos prontos foram instalados.`);
                  },
                );
              }}
            >
              Instalar os casos prontos
            </Botao>
          )}
        </div>
      </Cartao>

      {u !== null && u.bloqueios.length > 0 && (
        <Cartao titulo="O que está impedindo de publicar">
          <ul className="crc-pilha" style={{ marginTop: "var(--crc-e3)" }}>
            {u.bloqueios.map((b) => (
              <li key={b.caso} className="crc-cartao-compacto" data-status="bloqueio">
                <div className="crc-linha" style={{ gap: "var(--crc-e2)", flexWrap: "wrap" }}>
                  <strong>{b.caso}</strong>
                  <Etiqueta tom="perigo">{b.categoria}</Etiqueta>
                </div>
                {b.falhas.map((f, i) => (
                  <p
                    key={`${b.caso}-${String(i)}`}
                    className="crc-corpo"
                    style={{ marginTop: "var(--crc-e1)" }}
                  >
                    {f.descricao}
                  </p>
                ))}
              </li>
            ))}
          </ul>
        </Cartao>
      )}

      {u !== null && u.avisos.length > 0 && (
        <Cartao titulo="Avisos — não impedem, mas valem olhar">
          <ul className="crc-pilha" style={{ marginTop: "var(--crc-e3)" }}>
            {u.avisos.map((b) => (
              <li key={b.caso} className="crc-cartao-compacto">
                <div className="crc-linha" style={{ gap: "var(--crc-e2)", flexWrap: "wrap" }}>
                  <strong>{b.caso}</strong>
                  <Etiqueta tom="alerta">{b.categoria}</Etiqueta>
                </div>
                {b.falhas.map((f, i) => (
                  <p
                    key={`${b.caso}-${String(i)}`}
                    className="crc-corpo"
                    style={{ marginTop: "var(--crc-e1)" }}
                  >
                    {f.descricao}
                  </p>
                ))}
              </li>
            ))}
          </ul>
        </Cartao>
      )}

      {u !== null && u.categoriasSemCaso.length > 0 && (
        <div style={{ marginBottom: "var(--crc-e5)" }}>
          <Aviso tom="alerta">
            <strong>Faltam casos de algumas categorias que impedem publicar:</strong>{" "}
            {u.categoriasSemCaso.join(", ")}. A avaliação passa sem eles, e sem eles ela também não
            está provando nada sobre esses pontos.
          </Aviso>
        </div>
      )}

      <Cartao titulo="Os casos">
        <p className="crc-corpo" style={{ marginTop: "var(--crc-e2)" }}>
          Casos marcados como <strong>impede publicar</strong> são os que cobrem dano real: o agente
          dizer o que não pode, usar uma ferramenta sem permissão, misturar conteúdo de clínicas, ou
          responder sozinho uma conversa que exigia uma pessoa. Os outros medem utilidade e jeito de
          falar — aparecem como aviso e não travam nada.
        </p>

        {painel.casos.length === 0 ? (
          <div style={{ marginTop: "var(--crc-e4)" }}>
            <Vazio
              titulo="Nenhum caso cadastrado."
              explicacao="Sem caso nenhum, a avaliação não libera publicação — “nada falhou” é verdade quando não existe teste. Comece instalando os casos prontos."
            />
          </div>
        ) : (
          <ul className="crc-pilha" style={{ marginTop: "var(--crc-e4)" }}>
            {painel.casos.map((c) => (
              <li key={c.id} className="crc-cartao-compacto">
                <div className="crc-linha" style={{ gap: "var(--crc-e2)", flexWrap: "wrap" }}>
                  <strong>{c.nome}</strong>
                  <Etiqueta tom={c.bloqueante ? "perigo" : "neutra"}>
                    {c.bloqueante ? "impede publicar" : "só avisa"}
                  </Etiqueta>
                  <span className="crc-meta">{c.rotuloCategoria}</span>
                  <Botao
                    pequeno
                    variante="discreto"
                    className="crc-empurra"
                    disabled={acao.rodando}
                    onClick={() => {
                      void acao.executar(
                        () => removerCasoDeAvaliacao({ data: { casoId: c.id } }),
                        () => {
                          void recarregar();
                        },
                        "Caso removido.",
                      );
                    }}
                  >
                    Remover
                  </Botao>
                </div>
                {c.mensagens.map((m, i) => (
                  <p
                    key={`${c.id}-${String(i)}`}
                    className="crc-corpo"
                    style={{ marginTop: "var(--crc-e1)" }}
                  >
                    {m.direcao === "recebida" ? "Paciente: " : "Clínica: "}
                    {m.texto}
                  </p>
                ))}
              </li>
            ))}
          </ul>
        )}
      </Cartao>
    </>
  );
}

/** Só para o shell saber que existe sem importar o resto. */
export const ICONE_AVALIACAO = ClipboardCheck;
