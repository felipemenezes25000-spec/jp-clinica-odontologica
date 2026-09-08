/**
 * Command palette — item 28, e o item 149 (atalhos de teclado).
 *
 * Ctrl/Cmd+K abre; digitar busca; setas navegam; Enter escolhe; Escape fecha.
 *
 * POR QUE ISTO VALE A PENA NUMA FERRAMENTA INTERNA
 * Porque o CRC é usado oito horas por dia pelas mesmas pessoas, e a operação
 * mais frequente — "abrir o paciente que acabou de ligar" — hoje custa três
 * cliques e uma mudança de aba. Com a paleta, custa Ctrl+K e o nome.
 *
 * TRÊS DECISÕES DE ACESSIBILIDADE que fazem diferença aqui:
 *
 *   O atalho NÃO dispara quando o foco está num campo de texto. Sem essa
 *   guarda, digitar "k" com Ctrl pressionado por engano no meio de uma resposta
 *   ao paciente abriria a paleta e engoliria a tecla.
 *
 *   A lista é `role="listbox"` com `aria-activedescendant`, e não foco real nos
 *   itens. Mover o foco a cada seta faria o leitor de tela reanunciar o campo
 *   de busca a cada tecla; assim ele anuncia só a opção destacada.
 *
 *   O `Escape` fecha e devolve o foco a quem o tinha. Uma paleta que rouba o
 *   foco e não devolve deixa quem navega por teclado perdido no topo da página.
 *
 * A BUSCA TEM DEBOUNCE porque cada tecla vira consulta ao banco. 220ms é
 * imperceptível para quem digita e corta a maioria das chamadas.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { buscarPacientes } from "@/lib/crc/api";
import type { Paciente } from "@/lib/crc/dominio/tipos";
import { ROTULO_SITUACAO } from "@/lib/crc/dominio/rotulos";
import { telefoneParaTela } from "@/lib/crc/dominio/telefone";

export type AcaoPaleta = { id: string; rotulo: string; dica: string; executar: () => void };

export function Paleta({
  acoes,
  aoAbrirPaciente,
}: {
  /** Navegação e comandos, montados por quem conhece as permissões. */
  acoes: readonly AcaoPaleta[];
  aoAbrirPaciente: (patientId: string) => void;
}) {
  const [aberta, setAberta] = useState(false);
  const [termo, setTermo] = useState("");
  const [pacientes, setPacientes] = useState<Paciente[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [destaque, setDestaque] = useState(0);

  const entrada = useRef<HTMLInputElement>(null);
  const focoAnterior = useRef<HTMLElement | null>(null);
  const relogio = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* ---- Abertura pelo teclado -------------------------------------------- */

  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent): void => {
      if (!(e.key === "k" || e.key === "K") || !(e.metaKey || e.ctrlKey)) return;

      // A guarda que evita engolir a tecla no meio de uma resposta ao paciente.
      const alvo = e.target as HTMLElement | null;
      const editando =
        alvo !== null &&
        (alvo.tagName === "INPUT" ||
          alvo.tagName === "TEXTAREA" ||
          alvo.isContentEditable === true);
      if (editando && !aberta) return;

      e.preventDefault();
      focoAnterior.current = document.activeElement as HTMLElement | null;
      setAberta((v) => !v);
    };

    document.addEventListener("keydown", aoTeclar);
    return () => {
      document.removeEventListener("keydown", aoTeclar);
    };
  }, [aberta]);

  useEffect(() => {
    if (aberta) {
      entrada.current?.focus();
      return;
    }
    // Devolve o foco a quem o tinha. Sem isso, quem navega por teclado
    // recomeça do topo da página a cada vez que abre e fecha a paleta.
    focoAnterior.current?.focus();
    setTermo("");
    setPacientes([]);
    setDestaque(0);
  }, [aberta]);

  /* ---- Busca ------------------------------------------------------------ */

  useEffect(() => {
    if (relogio.current !== null) clearTimeout(relogio.current);

    const limpo = termo.trim();
    if (limpo.length < 2) {
      setPacientes([]);
      setBuscando(false);
      return;
    }

    setBuscando(true);
    relogio.current = setTimeout(() => {
      void (async () => {
        try {
          const r = await buscarPacientes({ data: { termo: limpo } });
          if (r.ok) setPacientes(r.itens.slice(0, 6));
        } catch {
          // Busca que falha na paleta não merece tela de erro: a lista fica
          // vazia e a pessoa tenta de novo ou usa a aba Pacientes.
          setPacientes([]);
        } finally {
          setBuscando(false);
        }
      })();
    }, 220);

    return () => {
      if (relogio.current !== null) clearTimeout(relogio.current);
    };
  }, [termo]);

  /* ---- Itens ------------------------------------------------------------ */

  const acoesFiltradas = useMemo(() => {
    const limpo = termo.trim().toLowerCase();
    if (limpo.length === 0) return acoes;
    return acoes.filter(
      (a) => a.rotulo.toLowerCase().includes(limpo) || a.dica.toLowerCase().includes(limpo),
    );
  }, [acoes, termo]);

  type Item =
    | { tipo: "acao"; chave: string; acao: AcaoPaleta }
    | { tipo: "paciente"; chave: string; paciente: Paciente };

  const itens = useMemo<Item[]>(
    () => [
      // Pacientes primeiro quando há busca: é a operação mais frequente, e
      // deixar os comandos na frente faria a pessoa passar por eles toda vez.
      ...pacientes.map((p): Item => ({ tipo: "paciente", chave: `p-${p.id}`, paciente: p })),
      ...acoesFiltradas.map((a): Item => ({ tipo: "acao", chave: `a-${a.id}`, acao: a })),
    ],
    [pacientes, acoesFiltradas],
  );

  useEffect(() => {
    setDestaque(0);
  }, [termo]);

  const escolher = useCallback(
    (item: Item | undefined) => {
      if (item === undefined) return;
      setAberta(false);
      if (item.tipo === "paciente") aoAbrirPaciente(item.paciente.id);
      else item.acao.executar();
    },
    [aoAbrirPaciente],
  );

  if (!aberta) return null;

  return (
    <div
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) setAberta(false);
      }}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(22, 36, 26, 0.35)",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        // 12vh: alto o bastante para não cobrir o conteúdo, baixo o bastante
        // para o olho já estar ali quando a paleta aparece.
        paddingTop: "12vh",
        paddingInline: "var(--crc-e4)",
        zIndex: 70,
      }}
    >
      <div
        className="crc-cartao"
        style={{
          width: "min(560px, 100%)",
          padding: 0,
          overflow: "hidden",
          borderRadius: "var(--crc-r-modal)",
          boxShadow: "var(--crc-sombra-flutuante)",
        }}
      >
        <label className="crc-so-leitor" htmlFor="crc-paleta">
          Buscar paciente ou comando
        </label>
        <input
          id="crc-paleta"
          ref={entrada}
          className="crc-entrada"
          style={{ border: 0, borderRadius: 0, height: 52, fontSize: "1rem" }}
          placeholder="Buscar paciente ou comando…"
          value={termo}
          autoComplete="off"
          role="combobox"
          aria-expanded
          aria-controls="crc-paleta-lista"
          aria-activedescendant={itens[destaque]?.chave}
          onChange={(e) => {
            setTermo(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              setAberta(false);
              return;
            }
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setDestaque((d) => (itens.length === 0 ? 0 : (d + 1) % itens.length));
              return;
            }
            if (e.key === "ArrowUp") {
              e.preventDefault();
              setDestaque((d) => (itens.length === 0 ? 0 : (d - 1 + itens.length) % itens.length));
              return;
            }
            if (e.key === "Enter") {
              e.preventDefault();
              escolher(itens[destaque]);
            }
          }}
        />

        <div
          id="crc-paleta-lista"
          role="listbox"
          aria-label="Resultados"
          style={{ maxHeight: "50vh", overflowY: "auto", borderTop: "1px solid var(--crc-borda)" }}
        >
          {itens.length === 0 ? (
            <p className="crc-meta" style={{ padding: "var(--crc-e5)", textAlign: "center" }}>
              {buscando
                ? "Buscando…"
                : termo.trim().length < 2
                  ? "Digite para buscar um paciente, ou escolha um comando."
                  : "Nada encontrado."}
            </p>
          ) : (
            itens.map((item, i) => (
              <button
                key={item.chave}
                id={item.chave}
                type="button"
                role="option"
                aria-selected={i === destaque}
                className="crc-conversa-item"
                style={{
                  background: i === destaque ? "var(--crc-primaria-suave)" : "transparent",
                }}
                onMouseEnter={() => {
                  setDestaque(i);
                }}
                onClick={() => {
                  escolher(item);
                }}
              >
                {item.tipo === "paciente" ? (
                  <>
                    <strong style={{ fontSize: "0.9375rem" }}>{item.paciente.nome}</strong>
                    <span className="crc-meta" style={{ display: "block" }}>
                      {ROTULO_SITUACAO[item.paciente.situacao]}
                      {item.paciente.telefone !== null &&
                        ` · ${telefoneParaTela(item.paciente.telefone)}`}
                    </span>
                  </>
                ) : (
                  <>
                    <strong style={{ fontSize: "0.9375rem" }}>{item.acao.rotulo}</strong>
                    <span className="crc-meta" style={{ display: "block" }}>
                      {item.acao.dica}
                    </span>
                  </>
                )}
              </button>
            ))
          )}
        </div>

        <div
          className="crc-painel-rodape crc-meta"
          style={{ display: "flex", gap: "var(--crc-e4)" }}
        >
          <span>↑↓ navegar</span>
          <span>Enter abrir</span>
          <span>Esc fechar</span>
        </div>
      </div>
    </div>
  );
}
