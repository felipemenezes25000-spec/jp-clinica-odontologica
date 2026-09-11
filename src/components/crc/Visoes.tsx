/**
 * A barra de visões salvas — item 147.
 *
 * "Orçamentos quentes", "Faltantes da semana", "Recall implantes": o contrato
 * dá três exemplos e todos são a mesma coisa — um filtro que alguém remonta
 * toda manhã. A barra existe para esse ritual custar um clique.
 *
 * TRÊS COISAS QUE FAZEM DIFERENÇA NO USO DIÁRIO:
 *
 *   O BOTÃO DE SALVAR SÓ APARECE COM FILTRO. Salvar "tudo" com nome não ajuda
 *   ninguém, e um botão que produz uma visão inútil ensina que o recurso é
 *   inútil.
 *
 *   A VISÃO ATIVA FICA MARCADA, e mexer em qualquer filtro a desmarca na hora.
 *   Sem isso, a pessoa ajusta um tipo, continua vendo "Faltantes da semana"
 *   destacado e acha que está olhando a visão salva quando não está.
 *
 *   APAGAR SÓ A PRÓPRIA. A visão compartilhada de outra pessoa aparece com a
 *   etiqueta "Compartilhada" e sem lixeira — o servidor recusaria de qualquer
 *   forma, e um botão que sempre falha é pior que botão nenhum.
 */
import { useCallback, useEffect, useState } from "react";

import {
  apagarVisaoSalva,
  listarVisoesSalvas,
  salvarVisaoSalva,
  type VisaoDto,
} from "@/lib/crc/api";

import { Botao, Campo, Entrada, Etiqueta, Modal } from "./base";
import { FILTRO_VAZIO, filtroVazio, type FiltroFunilUi } from "./filtroFunil";

/** Duas visões são a mesma quando os três campos batem. Ordem de tipo não conta. */
function mesmoFiltro(a: FiltroFunilUi, b: FiltroFunilUi): boolean {
  if (a.etapaChave !== b.etapaChave || a.apenasMinhas !== b.apenasMinhas) return false;
  if (a.tipos.length !== b.tipos.length) return false;
  const ordenados = [...b.tipos].sort();
  return [...a.tipos].sort().every((t, i) => t === ordenados[i]);
}

function paraFiltro(v: VisaoDto): FiltroFunilUi {
  return { tipos: [...v.tipos], etapaChave: v.etapaChave, apenasMinhas: v.apenasMinhas };
}

export function BarraDeVisoes({
  filtro,
  aoAplicar,
}: {
  filtro: FiltroFunilUi;
  aoAplicar: (f: FiltroFunilUi) => void;
}) {
  const [visoes, setVisoes] = useState<VisaoDto[]>([]);
  const [salvando, setSalvando] = useState(false);
  const [nome, setNome] = useState("");
  const [compartilhar, setCompartilhar] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const recarregar = useCallback(async (): Promise<void> => {
    try {
      const r = await listarVisoesSalvas();
      if (r.ok) setVisoes(r.visoes);
    } catch {
      // Uma barra de atalhos que falha não merece tela de erro: o funil
      // continua inteiro sem ela, e insistir seria transformar um conforto
      // em um obstáculo.
      setVisoes([]);
    }
  }, []);

  useEffect(() => {
    void recarregar();
  }, [recarregar]);

  const ativa = visoes.find((v) => mesmoFiltro(paraFiltro(v), filtro));

  const salvar = useCallback(async (): Promise<void> => {
    setOcupado(true);
    setErro(null);
    try {
      const r = await salvarVisaoSalva({
        data: { nome, compartilhada: compartilhar, filtros: filtro },
      });
      if (r.ok) {
        setSalvando(false);
        setNome("");
        setCompartilhar(false);
        await recarregar();
      } else {
        setErro(r.message);
      }
    } catch {
      setErro("Não conseguimos salvar a visão. Tente de novo.");
    } finally {
      setOcupado(false);
    }
  }, [compartilhar, filtro, nome, recarregar]);

  const apagar = useCallback(
    async (v: VisaoDto): Promise<void> => {
      setOcupado(true);
      try {
        await apagarVisaoSalva({ data: { id: v.id } });
        // Se a visão apagada era a que estava na tela, o filtro volta ao
        // neutro: continuar com um filtro cuja origem sumiu confunde mais do
        // que recomeçar.
        if (ativa?.id === v.id) aoAplicar({ ...FILTRO_VAZIO });
        await recarregar();
      } catch {
        setErro("Não conseguimos apagar a visão.");
      } finally {
        setOcupado(false);
      }
    },
    [aoAplicar, ativa, recarregar],
  );

  const temFiltro = !filtroVazio(filtro);

  if (visoes.length === 0 && !temFiltro) return null;

  return (
    <div className="crc-linha crc-visoes" role="group" aria-label="Visões salvas">
      {visoes.map((v) => {
        const selecionada = ativa?.id === v.id;
        return (
          <span key={v.id} className="crc-visao">
            <button
              type="button"
              className={`crc-botao crc-botao-pequeno ${selecionada ? "crc-botao-primario" : ""}`}
              aria-pressed={selecionada}
              onClick={() => {
                aoAplicar(paraFiltro(v));
              }}
            >
              {v.nome}
            </button>
            {v.compartilhada && !v.minha && <Etiqueta tom="info">Compartilhada</Etiqueta>}
            {v.minha && (
              <button
                type="button"
                className="crc-botao crc-botao-pequeno crc-botao-discreto"
                disabled={ocupado}
                aria-label={`Apagar a visão ${v.nome}`}
                title={`Apagar a visão ${v.nome}`}
                onClick={() => {
                  void apagar(v);
                }}
              >
                ×
              </button>
            )}
          </span>
        );
      })}

      {temFiltro && ativa === undefined && (
        <Botao
          pequeno
          onClick={() => {
            setSalvando(true);
          }}
        >
          Salvar esta visão
        </Botao>
      )}

      {temFiltro && (
        <Botao
          pequeno
          variante="discreto"
          onClick={() => {
            aoAplicar({ ...FILTRO_VAZIO });
          }}
        >
          Limpar filtros
        </Botao>
      )}

      <Modal
        titulo="Salvar visão"
        aberto={salvando}
        aoFechar={() => {
          setSalvando(false);
          setErro(null);
        }}
        rodape={
          <>
            <Botao
              onClick={() => {
                setSalvando(false);
              }}
            >
              Cancelar
            </Botao>
            <Botao
              variante="primario"
              carregando={ocupado}
              onClick={() => {
                void salvar();
              }}
            >
              Salvar
            </Botao>
          </>
        }
      >
        <Campo
          rotulo="Nome da visão"
          dica="Salvar com um nome que já existe atualiza aquela visão."
        >
          {(id) => (
            <Entrada
              id={id}
              value={nome}
              maxLength={40}
              placeholder="Faltantes da semana"
              onChange={(e) => {
                setNome(e.target.value);
              }}
            />
          )}
        </Campo>

        <label className="crc-linha" style={{ marginTop: "var(--crc-e3)" }}>
          <input
            type="checkbox"
            checked={compartilhar}
            onChange={(e) => {
              setCompartilhar(e.target.checked);
            }}
          />
          <span className="crc-corpo">Deixar visível para a equipe</span>
        </label>
        <p className="crc-meta" style={{ marginTop: "var(--crc-e2)" }}>
          Compartilhada, a visão aparece para todo mundo da clínica. Só você pode alterá-la ou
          apagá-la.
        </p>

        {erro !== null && (
          <p className="crc-meta" role="alert" style={{ marginTop: "var(--crc-e3)" }}>
            {erro}
          </p>
        )}
      </Modal>
    </div>
  );
}
