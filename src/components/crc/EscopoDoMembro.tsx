/**
 * Escopo — em quais unidades esta pessoa trabalha.
 *
 * ============================================================================
 *  O DEFEITO QUE ESTA TELA EXISTE PARA IMPEDIR é o mais confuso que o CRC
 *  consegue produzir: alguém salvo sem nenhuma unidade.
 *
 *  Não dá erro. A pessoa entra, a sessão abre, as permissões conferem — e TODAS
 *  as listas vêm vazias, porque `clinic_id in ()` não casa com nada. Quem está
 *  do outro lado conclui que o sistema perdeu os dados e liga para o suporte.
 *
 *  Por isso o aviso de zero unidades é vermelho e não cinza: é a diferença
 *  entre uma escolha e um engano.
 * ============================================================================
 *
 * O MODAL É POR PESSOA, e não uma matriz de todos contra todas. A matriz cabe
 * na tela com três pessoas e duas unidades, e vira ilegível com doze e cinco —
 * e é justamente na organização grande que o escopo importa.
 */
import { useCallback, useEffect, useState } from "react";

import {
  carregarClinicas,
  carregarEscopoDoMembro,
  salvarEscopoDoMembro,
  type ClinicaDto,
  type EscopoDto,
} from "@/lib/crc/api";
import { avisoDeEscopo } from "@/lib/crc/dominio/clinicas";
import type { Papel } from "@/lib/crc/dominio/tipos";

import { Aviso, Botao, Etiqueta, ListaEsqueleto, Modal, useAcao } from "./base";

export function EscopoDoMembro({
  userId,
  nome,
  aberto,
  aoFechar,
}: {
  userId: string;
  nome: string;
  aberto: boolean;
  aoFechar: () => void;
}) {
  const [clinicas, setClinicas] = useState<ClinicaDto[] | null>(null);
  const [escopo, setEscopo] = useState<EscopoDto | null>(null);
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set());
  const [erro, setErro] = useState<string | null>(null);
  const acao = useAcao();

  useEffect(() => {
    if (!aberto) return;

    let vivo = true;
    void (async () => {
      try {
        const [lista, e] = await Promise.all([
          carregarClinicas(),
          carregarEscopoDoMembro({ data: { userId } }),
        ]);
        if (!vivo) return;

        if (!lista.ok) {
          setErro(lista.message);
          return;
        }
        if (!e.ok) {
          setErro(e.message);
          return;
        }

        setClinicas(lista.clinicas);
        setEscopo(e.escopo);
        setMarcadas(new Set(e.escopo.vinculadas));
        setErro(null);
      } catch {
        if (vivo) setErro("Não conseguimos ler o acesso desta pessoa agora.");
      }
    })();

    return () => {
      vivo = false;
    };
  }, [aberto, userId]);

  const alternar = useCallback((clinicId: string): void => {
    setMarcadas((antes) => {
      const novo = new Set(antes);
      if (novo.has(clinicId)) novo.delete(clinicId);
      else novo.add(clinicId);
      return novo;
    });
  }, []);

  const salvar = useCallback(async (): Promise<void> => {
    await acao.executar(
      () => salvarEscopoDoMembro({ data: { userId, clinicIds: [...marcadas] } }),
      () => {
        aoFechar();
      },
      marcadas.size === 0
        ? `${nome} ficou sem nenhuma unidade e vai ver todas as telas vazias.`
        : `${nome} agora atende ${String(marcadas.size)} ${marcadas.size === 1 ? "unidade" : "unidades"}.`,
    );
  }, [acao, aoFechar, marcadas, nome, userId]);

  const ehAdmin = escopo?.papel === "admin";

  return (
    <Modal
      titulo={`Unidades de ${nome}`}
      aberto={aberto}
      aoFechar={aoFechar}
      rodape={
        <>
          <Botao onClick={aoFechar}>Cancelar</Botao>
          <Botao
            variante="primario"
            carregando={acao.rodando}
            /*
              PARA O ADMIN O BOTÃO FICA DESABILITADO, e não escondido: a pessoa
              precisa entender que a seleção existe e não tem efeito, e não
              procurar o botão que sumiu.
            */
            disabled={ehAdmin || clinicas === null}
            onClick={() => void salvar()}
          >
            Salvar
          </Botao>
        </>
      }
    >
      {erro !== null && <Aviso tom="perigo">{erro}</Aviso>}

      {erro === null && (clinicas === null || escopo === null) && <ListaEsqueleto linhas={3} />}

      {erro === null && clinicas !== null && escopo !== null && (
        <>
          {/*
            ============================================================================
              O AVISO É RECALCULADO A CADA CLIQUE, e sai da MESMA função que o
              servidor usa.

              Se ele viesse pronto do servidor, refletiria o escopo SALVO: a
              pessoa desmarcaria a última unidade, nada mudaria na tela, e ela
              clicaria em Salvar sem ter sido avisada de nada. O momento de
              alertar é o de desmarcar, não o depois.

              E a regra de QUANDO alertar continua no domínio — reescrevê-la
              aqui criaria uma segunda versão que divergiria no dia em que uma
              das duas mudasse.
            ============================================================================
          */}
          {(() => {
            const a = avisoDeEscopo(escopo.papel as Papel, marcadas.size);
            if (a === null) return null;
            return <Aviso tom={a.tom}>{a.texto}</Aviso>;
          })()}

          <ul className="crc-pilha" style={{ marginTop: "var(--crc-e3)" }}>
            {clinicas.map((c) => (
              <li key={c.id} className="crc-linha" style={{ gap: "var(--crc-e2)" }}>
                <label className="crc-linha" style={{ gap: "var(--crc-e2)" }}>
                  <input
                    type="checkbox"
                    checked={ehAdmin || marcadas.has(c.id)}
                    disabled={ehAdmin}
                    onChange={() => {
                      alternar(c.id);
                    }}
                  />
                  <span>{c.nome}</span>
                </label>
                {!c.ativa && (
                  /*
                    A UNIDADE FECHADA CONTINUA NA LISTA, marcável.

                    Ela reabre em março, e quem atendia nela volta a atender —
                    em vez de a organização ter de redescobrir, pessoa por
                    pessoa, quem estava onde.
                  */
                  <Etiqueta tom="neutra">fechada</Etiqueta>
                )}
              </li>
            ))}
          </ul>

          {clinicas.length === 0 && (
            <Aviso tom="alerta">
              Não há nenhuma unidade cadastrada. Crie a primeira em Configurações — sem unidade,
              ninguém enxerga nada no CRC.
            </Aviso>
          )}
        </>
      )}
    </Modal>
  );
}
