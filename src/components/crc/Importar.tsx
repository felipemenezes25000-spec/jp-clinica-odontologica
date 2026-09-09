/**
 * Importação de planilha — itens 55 e 189, e o módulo de cobrança.
 *
 * O IMPORTADOR JÁ EXISTIA COMO FUNÇÃO e não tinha porta. Um importador sem
 * tela é um recurso que só existe para quem lê o código — e o item 4 do
 * contrato ("nada de botão que não faz nada") vale igualmente para o
 * contrário: nada de função que ninguém consegue chamar.
 *
 * O DESENHO É EM DOIS TEMPOS, e é isso que o item 189 pede:
 *
 *   PRIMEIRO O PREVIEW, que não grava nada. Ele diz quantas linhas entram,
 *   quantas atualizam, quantas estão sem paciente e quantas estão erradas —
 *   com o número da linha do arquivo, porque "erro na importação" sem a linha
 *   obriga a pessoa a caçar no Excel.
 *
 *   DEPOIS A CONFIRMAÇÃO, que é um segundo clique consciente. Importar 1.500
 *   orçamentos é uma operação que ninguém quer fazer por acidente.
 *
 * A LEITURA DO ARQUIVO É NO NAVEGADOR. O conteúdo vai como texto para o
 * servidor; não há upload, storage nem arquivo temporário para limpar depois.
 * Para uma planilha de exportação isso é o suficiente e é muito menos coisa
 * para dar errado.
 */
import { useCallback, useRef, useState } from "react";

import {
  confirmarImportacao,
  previewDeImportacao,
  type EscopoImportacao,
  type PreviewDto,
} from "@/lib/crc/api";
import { dinheiro } from "@/lib/crc/dominio/formatar";

import { Aviso, Botao, Cartao, Etiqueta, Vazio } from "./base";

const ESCOPOS: { chave: EscopoImportacao; nome: string; explicacao: string }[] = [
  {
    chave: "orcamentos",
    nome: "Orçamentos",
    explicacao:
      "Exporte os orçamentos do sistema da clínica em CSV. As colunas de paciente, valor e situação são reconhecidas por vários nomes — não precisa renomear nada.",
  },
  {
    chave: "cobrancas",
    nome: "Pagamentos em aberto",
    explicacao:
      "Uma linha por parcela, com vencimento e saldo. Parcelas vencidas há muito tempo entram no sistema, mas ficam fora da automação de cobrança.",
  },
];

/** Acima disso o navegador trava lendo o arquivo antes de mandar. */
const MAX_BYTES = 5 * 1024 * 1024;

export function Importar() {
  const [escopo, setEscopo] = useState<EscopoImportacao>("orcamentos");
  const [conteudo, setConteudo] = useState<string | null>(null);
  const [nomeArquivo, setNomeArquivo] = useState<string>("");
  const [preview, setPreview] = useState<PreviewDto | null>(null);
  const [resultado, setResultado] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const entrada = useRef<HTMLInputElement>(null);

  const definicao = ESCOPOS.find((e) => e.chave === escopo);

  const limpar = useCallback((): void => {
    setConteudo(null);
    setNomeArquivo("");
    setPreview(null);
    setResultado(null);
    setErro(null);
    if (entrada.current !== null) entrada.current.value = "";
  }, []);

  const escolher = useCallback(
    async (arquivo: File | undefined): Promise<void> => {
      if (arquivo === undefined) return;
      setPreview(null);
      setResultado(null);
      setErro(null);

      if (arquivo.size > MAX_BYTES) {
        setErro("O arquivo passa de 5 MB. Divida a exportação em partes menores.");
        return;
      }

      setOcupado(true);
      try {
        // Planilha do Excel vira CSV aqui mesmo. Do preview em diante os dois
        // formatos são o mesmo caminho — mesma validação, mesma deduplicação.
        const ehPlanilha = /\.xlsx$/iu.test(arquivo.name);
        let texto: string;

        if (ehPlanilha) {
          const { xlsxParaCsv } = await import("@/lib/crc/dominio/xlsx");
          const lido = await xlsxParaCsv(await arquivo.arrayBuffer());
          if (!lido.ok) {
            setErro(lido.motivo);
            return;
          }
          texto = lido.csv;
        } else {
          texto = await arquivo.text();
        }

        setConteudo(texto);
        setNomeArquivo(arquivo.name);

        const r = await previewDeImportacao({ data: { escopo, conteudo: texto } });
        if (r.ok) setPreview(r.preview);
        else setErro(r.message);
      } catch {
        setErro("Não conseguimos ler o arquivo. Confira se é um CSV ou uma planilha .xlsx.");
      } finally {
        setOcupado(false);
      }
    },
    [escopo],
  );

  const confirmar = useCallback(async (): Promise<void> => {
    if (conteudo === null) return;
    setOcupado(true);
    setErro(null);
    try {
      const r = await confirmarImportacao({ data: { escopo, conteudo } });
      if (r.ok) {
        setResultado(
          `${String(r.criados)} criados, ${String(r.atualizados)} atualizados, ` +
            `${String(r.semPaciente)} sem paciente identificado, ${String(r.falhados)} com erro.`,
        );
        setPreview(null);
        setConteudo(null);
        if (entrada.current !== null) entrada.current.value = "";
      } else {
        setErro(r.message);
      }
    } catch {
      setErro("A importação falhou. Nada foi gravado pela metade: cada linha é independente.");
    } finally {
      setOcupado(false);
    }
  }, [conteudo, escopo]);

  return (
    <div className="crc-pilha">
      <Cartao titulo="Importar planilha">
        <div className="crc-linha" role="group" aria-label="O que importar">
          {ESCOPOS.map((e) => (
            <Botao
              key={e.chave}
              variante={e.chave === escopo ? "primario" : "secundario"}
              aria-pressed={e.chave === escopo}
              onClick={() => {
                setEscopo(e.chave);
                limpar();
              }}
            >
              {e.nome}
            </Botao>
          ))}
        </div>

        <p className="crc-corpo" style={{ marginTop: "var(--crc-e3)" }}>
          {definicao?.explicacao}
        </p>

        <div className="crc-linha" style={{ marginTop: "var(--crc-e4)" }}>
          <label className="crc-rotulo" htmlFor="crc-importar-arquivo">
            Arquivo CSV ou planilha
          </label>
          <input
            id="crc-importar-arquivo"
            ref={entrada}
            className="crc-entrada"
            type="file"
            accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            disabled={ocupado}
            onChange={(e) => {
              void escolher(e.target.files?.[0]);
            }}
          />
        </div>

        {nomeArquivo.length > 0 && (
          <p className="crc-meta" style={{ marginTop: "var(--crc-e2)" }}>
            {nomeArquivo}
          </p>
        )}

        <p className="crc-meta" style={{ marginTop: "var(--crc-e2)" }}>
          Aceita .csv e .xlsx. De uma planilha, é lida a primeira aba — exportação de sistema tem
          uma só, e adivinhar entre várias importaria dado errado sem ninguém perceber. Planilha com
          senha precisa ser aberta antes.
        </p>
      </Cartao>

      {erro !== null && <Aviso tom="perigo">{erro}</Aviso>}

      {resultado !== null && (
        <Aviso tom="info">
          Pronto. {resultado} Reimportar a mesma planilha atualiza — nunca duplica.
        </Aviso>
      )}

      {preview !== null && (
        <Cartao titulo="Confira antes de gravar">
          <div className="crc-grade">
            <Numero rotulo="Linhas válidas" valor={preview.total} />
            <Numero rotulo="Novas" valor={preview.novos} />
            <Numero rotulo="Atualizam uma existente" valor={preview.atualizados} />
            <Numero rotulo="Sem paciente identificado" valor={preview.semPaciente} tom="alerta" />
            <Numero rotulo="Com erro (não entram)" valor={preview.comErro} tom="perigo" />
            {preview.antigas !== null && (
              <Numero rotulo="Vencidas demais para a automação" valor={preview.antigas} />
            )}
          </div>

          <p className="crc-corpo" style={{ marginTop: "var(--crc-e3)" }}>
            Valor total das linhas válidas: <strong>{dinheiro(preview.valorTotal)}</strong>.
          </p>

          {preview.semPaciente > 0 && (
            <Aviso tom="alerta">
              As linhas sem paciente identificado <strong>entram assim mesmo</strong>. O registro
              existe e fica visível; só não aparece na ficha de ninguém até alguém vinculá-lo. A
              automação não fala com quem não tem paciente.
            </Aviso>
          )}

          {preview.falhas.length > 0 && (
            <>
              <h3 className="crc-titulo-cartao" style={{ marginTop: "var(--crc-e4)" }}>
                Linhas com erro
              </h3>
              <p className="crc-meta">
                Estas não entram. O número é a linha do arquivo, para achar no Excel.
              </p>
              <ul className="crc-pilha" style={{ marginTop: "var(--crc-e2)" }}>
                {preview.falhas.map((f) => (
                  <li key={`${String(f.linha)}-${f.erro}`} className="crc-cartao-compacto">
                    <strong>Linha {f.linha}:</strong> {f.erro}
                    <span className="crc-meta" style={{ display: "block" }}>
                      {f.conteudo}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}

          {preview.linhas.length > 0 && (
            <>
              <h3 className="crc-titulo-cartao" style={{ marginTop: "var(--crc-e4)" }}>
                Amostra do que vai entrar
              </h3>
              <ul className="crc-pilha" style={{ marginTop: "var(--crc-e2)" }}>
                {preview.linhas.map((l, i) => (
                  <li key={`${l.paciente}-${String(i)}`} className="crc-cartao-compacto">
                    <div className="crc-linha">
                      <strong>{l.paciente}</strong>
                      {!l.identificado && <Etiqueta tom="alerta">Paciente não encontrado</Etiqueta>}
                      {l.jaExiste && <Etiqueta tom="info">Atualiza</Etiqueta>}
                    </div>
                    <span className="crc-meta" style={{ display: "block" }}>
                      {dinheiro(l.valor)} · {l.situacao}
                      {l.aviso !== null && ` · ${l.aviso}`}
                    </span>
                  </li>
                ))}
              </ul>
              {preview.total > preview.linhas.length && (
                <p className="crc-meta" style={{ marginTop: "var(--crc-e2)" }}>
                  Mostrando {preview.linhas.length} das {preview.total} linhas válidas. Os números
                  acima contam todas.
                </p>
              )}
            </>
          )}

          <div className="crc-linha" style={{ marginTop: "var(--crc-e4)" }}>
            <Botao variante="primario" carregando={ocupado} onClick={() => void confirmar()}>
              Importar {preview.total} linhas
            </Botao>
            <Botao variante="discreto" onClick={limpar}>
              Cancelar
            </Botao>
          </div>
        </Cartao>
      )}

      {preview === null && resultado === null && conteudo === null && (
        <Vazio
          titulo="Nenhum arquivo escolhido."
          explicacao="Escolha um CSV acima. Nada é gravado até você conferir o resumo e confirmar."
        />
      )}
    </div>
  );
}

function Numero({
  rotulo,
  valor,
  tom,
}: {
  rotulo: string;
  valor: number;
  tom?: "alerta" | "perigo";
}) {
  return (
    <div className="crc-kpi">
      <span className="crc-kpi-rotulo">{rotulo}</span>
      <span
        className="crc-kpi-valor"
        style={
          tom !== undefined && valor > 0
            ? { color: tom === "perigo" ? "var(--crc-perigo)" : "var(--crc-alerta)" }
            : undefined
        }
      >
        {valor}
      </span>
    </div>
  );
}
