/**
 * Primeiros passos — item 58.
 *
 * ============================================================================
 *  ELE SOME SOZINHO, e não tem botão de fechar.
 *
 *  Um checklist com "dispensar" é dispensado no primeiro dia e nunca mais
 *  aparece — inclusive quando a pendência volta a existir, porque alguém
 *  desvinculou a recepcionista de todas as unidades em março.
 *
 *  Aqui ele aparece enquanto faltar passo ESSENCIAL e desaparece quando não
 *  faltar. Nenhum estado guardado, nenhuma preferência: o cartão é uma função
 *  do banco. Se voltar a aparecer, é porque voltou a fazer falta.
 * ============================================================================
 *
 * E NENHUM PASSO É "MARCAR COMO FEITO". Cada um é uma contagem: a clínica
 * existe, o paciente chegou, a política foi escrita. Um checklist com botão de
 * marcar vira, em duas semanas, um checklist todo marcado e nada feito.
 */
import { useEffect, useState } from "react";

import { carregarPrimeirosPassos, type PassoDto } from "@/lib/crc/api";

import { Botao, Cartao, Etiqueta } from "./base";

export function PrimeirosPassos({ aoIrPara }: { aoIrPara: (aba: string) => void }) {
  const [passos, setPassos] = useState<PassoDto[] | null>(null);
  const [faltam, setFaltam] = useState(0);

  useEffect(() => {
    let vivo = true;
    void (async () => {
      try {
        const r = await carregarPrimeirosPassos();
        if (!vivo || !r.ok) return;
        setPassos(r.passos);
        setFaltam(r.faltam);
      } catch {
        /*
         * SILÊNCIO AQUI É A ESCOLHA CERTA, e é a única do arquivo.
         *
         * Este cartão é um acessório no topo de uma tela que funciona sem ele.
         * Um aviso de erro no lugar dele faria a pessoa achar que o CRC está
         * quebrado quando o que falhou foi o checklist de instalação.
         */
      }
    })();
    return () => {
      vivo = false;
    };
  }, []);

  // Enquanto carrega, nada: um esqueleto piscando no topo da Home a cada
  // navegação chama mais atenção do que o conteúdo da página.
  if (passos === null) return null;

  // NADA ESSENCIAL FALTANDO → O CARTÃO SOME. Ver o bloco do topo.
  if (faltam === 0) return null;

  const pendentes = passos.filter((p) => !p.feito);
  const feitos = passos.length - pendentes.length;

  return (
    <Cartao titulo="Para o CRC começar a funcionar">
      <p className="crc-meta" style={{ marginBottom: "var(--crc-e4)" }}>
        {String(feitos)} de {String(passos.length)} prontos. Este quadro some sozinho quando os{" "}
        {faltam === 1 ? "passo essencial estiver" : "passos essenciais estiverem"} feito
        {faltam === 1 ? "" : "s"} — não há nada para marcar.
      </p>

      <ul className="crc-pilha">
        {pendentes.map((p) => (
          <li key={p.chave} className="crc-cartao-compacto">
            <div className="crc-linha" style={{ gap: "var(--crc-e2)", flexWrap: "wrap" }}>
              <strong>{p.titulo}</strong>
              {p.essencial ? (
                <Etiqueta tom="perigo">essencial</Etiqueta>
              ) : (
                <Etiqueta tom="neutra">quando der</Etiqueta>
              )}
              <div className="crc-empurra">
                <Botao
                  pequeno
                  variante={p.essencial ? "primario" : "secundario"}
                  onClick={() => {
                    aoIrPara(p.aba);
                  }}
                >
                  Ir
                </Botao>
              </div>
            </div>
            {/*
              O TEXTO DIZ O QUE MUDA, e não o que fazer. "Configure a
              integração" não ensina nada: a pessoa já sabe que precisa
              configurar, ela só não sabe se vale a pena agora.
            */}
            <small className="crc-meta">{p.porque}</small>
          </li>
        ))}
      </ul>
    </Cartao>
  );
}
