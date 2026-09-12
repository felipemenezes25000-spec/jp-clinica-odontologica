/**
 * Hub de integrações — §54.
 *
 * ============================================================================
 *  ELE MORA DENTRO DA TELA DE INTEGRAÇÕES QUE JÁ EXISTIA, e não numa aba nova.
 *
 *  A tela antiga responde "como configuro?"; este bloco responde "está
 *  funcionando?". São a mesma pergunta em dois momentos, e separá-las em duas
 *  abas faria a pessoa configurar numa e conferir na outra — descobrindo na
 *  segunda que a primeira não bastava.
 * ============================================================================
 *
 * O ESTADO É MEDIDO, e não declarado: sai de quando a integração funcionou
 * pela última vez, e não de haver credencial salva.
 */
import { useEffect, useState } from "react";

import { carregarHub, type IntegracaoUI } from "@/lib/crc/api";

import { Aviso, Cartao, Etiqueta, ListaEsqueleto } from "./base";

const TOM: Record<string, "positiva" | "alerta" | "perigo" | "neutra"> = {
  CONNECTED: "positiva",
  DEGRADED: "alerta",
  ERROR: "perigo",
  MISSING: "neutra",
};

const ROTULO: Record<string, string> = {
  CONNECTED: "funcionando",
  DEGRADED: "instável",
  ERROR: "com erro",
  MISSING: "não configurada",
};

export function HubDeIntegracoes() {
  const [lista, setLista] = useState<IntegracaoUI[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    void (async () => {
      try {
        const r = await carregarHub();
        if (!vivo) return;
        if (r.ok) setLista(r.integracoes);
        else setErro(r.message);
      } catch {
        if (vivo) setErro("Não conseguimos ler o estado das integrações agora.");
      }
    })();
    return () => {
      vivo = false;
    };
  }, []);

  if (erro !== null) return <Aviso tom="alerta">{erro}</Aviso>;
  if (lista === null) return <ListaEsqueleto linhas={5} />;

  const problemas = lista.filter((i) => i.estado === "ERROR" || i.estado === "DEGRADED");

  return (
    <Cartao titulo="Estado das integrações">
      <p className="crc-meta" style={{ marginBottom: "var(--crc-e4)" }}>
        {/*
          A FRASE DIZ COMO O ESTADO É APURADO, e isso importa: sem ela, alguém
          lê "não configurada" numa integração que tem credencial salva e
          conclui que a tela está errada.
        */}
        Cada estado vem de quando a integração <strong>funcionou pela última vez</strong>, e não de
        haver credencial salva. Uma credencial que nunca foi usada aparece como não configurada.
      </p>

      {problemas.length > 0 && (
        <div style={{ marginBottom: "var(--crc-e4)" }}>
          <Aviso tom="alerta">
            {problemas.length === 1
              ? "1 integração precisa de atenção."
              : `${String(problemas.length)} integrações precisam de atenção.`}{" "}
            “Instável” é a mais fácil de não perceber: nada dá erro, simplesmente parou de
            acontecer.
          </Aviso>
        </div>
      )}

      <ul className="crc-pilha">
        {lista.map((i) => (
          <li key={i.chave} className="crc-cartao-compacto">
            <div className="crc-linha" style={{ gap: "var(--crc-e2)", flexWrap: "wrap" }}>
              <strong>{i.rotulo}</strong>
              <Etiqueta tom={TOM[i.estado] ?? "neutra"}>{ROTULO[i.estado] ?? i.estado}</Etiqueta>
              {i.bloqueadoExterno && (
                /*
                  "SEM PROVEDOR" É DIFERENTE DE "NÃO CONFIGURADA", e a etiqueta
                  separa as duas: a primeira não tem botão para apertar, e sem
                  essa distinção alguém passa a tarde procurando onde configurar
                  voz.
                */
                <Etiqueta tom="info">sem provedor contratado</Etiqueta>
              )}
            </div>

            <small className="crc-meta" style={{ display: "block", marginTop: 4 }}>
              {i.detalhe}
            </small>

            {i.estado !== "CONNECTED" && (
              /*
                O QUE QUEBRA SE FALTAR só aparece quando ela NÃO está
                funcionando. Numa integração saudável isso é ruído; numa
                parada, é o que decide se alguém corre atrás hoje ou na semana
                que vem.
              */
              <small className="crc-meta" style={{ display: "block", marginTop: 4 }}>
                <strong>Sem ela:</strong> {i.seFaltar}
              </small>
            )}
          </li>
        ))}
      </ul>
    </Cartao>
  );
}
