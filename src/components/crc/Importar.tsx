import { useCallback, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  FileSpreadsheet,
  RotateCcw,
  ShieldCheck,
  UploadCloud,
} from "lucide-react";

import {
  confirmarImportacao,
  previewDeImportacao,
  type EscopoImportacao,
  type PreviewDto,
} from "@/lib/crc/api";
import { dinheiro } from "@/lib/crc/dominio/formatar";

import { Aviso, Botao, Etiqueta, Vazio } from "./base";
import "./crc-import.css";

const ESCOPOS: { chave: EscopoImportacao; nome: string; explicacao: string }[] = [
  {
    chave: "orcamentos",
    nome: "Orçamentos",
    explicacao: "Importe orçamentos exportados do sistema da clínica. O CRC reconhece variações comuns dos nomes das colunas.",
  },
  {
    chave: "cobrancas",
    nome: "Pagamentos em aberto",
    explicacao: "Importe parcelas e saldos em aberto. Registros antigos entram no histórico, mas podem ficar fora da automação de cobrança.",
  },
];

const MAX_BYTES = 5 * 1024 * 1024;

export function Importar() {
  const [escopo, setEscopo] = useState<EscopoImportacao>("orcamentos");
  const [conteudo, setConteudo] = useState<string | null>(null);
  const [nomeArquivo, setNomeArquivo] = useState("");
  const [preview, setPreview] = useState<PreviewDto | null>(null);
  const [resultado, setResultado] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const entrada = useRef<HTMLInputElement>(null);

  const definicao = ESCOPOS.find((e) => e.chave === escopo);
  const etapa = resultado !== null ? 4 : preview !== null ? 3 : conteudo !== null || ocupado ? 2 : 1;

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
        setResultado(`${String(r.criados)} criados, ${String(r.atualizados)} atualizados, ${String(r.semPaciente)} sem paciente identificado, ${String(r.falhados)} com erro.`);
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
    <div className="crc-import-v2">
      <section className="crc-import-passos-v2" aria-label="Etapas da importação">
        <Passo numero={1} rotulo="Escolher" ativo={etapa === 1} concluido={etapa > 1} />
        <Passo numero={2} rotulo="Ler arquivo" ativo={etapa === 2} concluido={etapa > 2} />
        <Passo numero={3} rotulo="Revisar" ativo={etapa === 3} concluido={etapa > 3} />
        <Passo numero={4} rotulo="Concluir" ativo={etapa === 4} concluido={false} />
      </section>

      {erro !== null && <Aviso tom="perigo">{erro}</Aviso>}

      {resultado !== null ? (
        <section className="crc-import-sucesso-v2">
          <span><CheckCircle2 aria-hidden="true" /></span>
          <div>
            <div className="crc-sobretitulo">Importação concluída</div>
            <h2>Os dados foram processados.</h2>
            <p>{resultado} Reimportar o mesmo arquivo atualiza registros existentes — não duplica.</p>
          </div>
          <Botao variante="primario" onClick={limpar}><RotateCcw size={15} aria-hidden="true" /> Importar outro</Botao>
        </section>
      ) : (
        <>
          <section className="crc-import-escolha-v2">
            <div className="crc-import-escolha-topo-v2">
              <div>
                <div className="crc-sobretitulo">1 · O que você está trazendo?</div>
                <h2 className="crc-titulo-secao">Escolha o tipo de dado</h2>
              </div>
              <span className="crc-import-seguranca-v2"><ShieldCheck aria-hidden="true" /> nada é gravado antes da confirmação</span>
            </div>

            <div className="crc-import-escopos-v2" role="group" aria-label="O que importar">
              {ESCOPOS.map((e) => (
                <button
                  key={e.chave}
                  type="button"
                  aria-pressed={e.chave === escopo}
                  onClick={() => {
                    setEscopo(e.chave);
                    limpar();
                  }}
                >
                  <span><FileSpreadsheet aria-hidden="true" /></span>
                  <div><strong>{e.nome}</strong><small>{e.explicacao}</small></div>
                  <ArrowRight aria-hidden="true" />
                </button>
              ))}
            </div>
          </section>

          <section className="crc-import-upload-v2">
            <input
              id="crc-importar-arquivo"
              ref={entrada}
              type="file"
              accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              disabled={ocupado}
              onChange={(e) => void escolher(e.target.files?.[0])}
            />
            <label htmlFor="crc-importar-arquivo">
              <span className="crc-import-upload-icone-v2"><UploadCloud aria-hidden="true" /></span>
              <strong>{ocupado ? "Lendo e validando…" : nomeArquivo.length > 0 ? nomeArquivo : "Escolha um CSV ou XLSX"}</strong>
              <small>{definicao?.explicacao}</small>
              <em>Até 5 MB · primeira aba do XLSX · planilha com senha precisa ser aberta antes</em>
            </label>
          </section>

          {preview !== null && (
            <section className="crc-import-preview-v2">
              <header className="crc-import-preview-topo-v2">
                <div>
                  <div className="crc-sobretitulo">3 · Confira antes de gravar</div>
                  <h2 className="crc-titulo-secao">O que vai entrar no CRC</h2>
                </div>
                <div className="crc-import-preview-valor-v2"><small>Valor válido</small><strong>{dinheiro(preview.valorTotal)}</strong></div>
              </header>

              <div className="crc-import-numeros-v2">
                <Numero rotulo="Linhas válidas" valor={preview.total} />
                <Numero rotulo="Novas" valor={preview.novos} tom="positivo" />
                <Numero rotulo="Atualizam" valor={preview.atualizados} tom="info" />
                <Numero rotulo="Sem paciente" valor={preview.semPaciente} tom="alerta" />
                <Numero rotulo="Com erro" valor={preview.comErro} tom="perigo" />
                {preview.antigas !== null && <Numero rotulo="Antigas demais" valor={preview.antigas} />}
              </div>

              {preview.semPaciente > 0 && (
                <Aviso tom="alerta">As linhas sem paciente identificado <strong>entram</strong>, mas não participam de automação até serem vinculadas a uma pessoa.</Aviso>
              )}

              <div className="crc-import-preview-grid-v2">
                <section className="crc-import-amostra-v2">
                  <h3>Amostra do arquivo</h3>
                  {preview.linhas.length === 0 ? (
                    <Vazio titulo="Nenhuma linha válida." explicacao="Corrija os erros listados ao lado e escolha o arquivo novamente." />
                  ) : (
                    <ul>
                      {preview.linhas.map((l, i) => (
                        <li key={`${l.paciente}-${String(i)}`}>
                          <div><strong>{l.paciente}</strong><span>{dinheiro(l.valor)} · {l.situacao}</span></div>
                          <div>{!l.identificado && <Etiqueta tom="alerta">Não encontrado</Etiqueta>}{l.jaExiste && <Etiqueta tom="info">Atualiza</Etiqueta>}</div>
                        </li>
                      ))}
                    </ul>
                  )}
                  {preview.total > preview.linhas.length && <p>Mostrando {preview.linhas.length} das {preview.total} linhas válidas.</p>}
                </section>

                <section className="crc-import-erros-v2">
                  <h3><AlertTriangle aria-hidden="true" /> Linhas que não entram</h3>
                  {preview.falhas.length === 0 ? (
                    <div className="crc-import-sem-erros-v2"><CheckCircle2 aria-hidden="true" /> Nenhum erro bloqueante.</div>
                  ) : (
                    <ul>
                      {preview.falhas.map((f) => (
                        <li key={`${String(f.linha)}-${f.erro}`}><strong>Linha {f.linha}</strong><span>{f.erro}</span><small>{f.conteudo}</small></li>
                      ))}
                    </ul>
                  )}
                </section>
              </div>

              <footer className="crc-import-acoes-v2">
                <div><strong>{preview.total} linhas prontas</strong><span>Este é o último passo antes de gravar.</span></div>
                <Botao variante="discreto" onClick={limpar}>Cancelar</Botao>
                <Botao variante="primario" carregando={ocupado} disabled={preview.total === 0} onClick={() => void confirmar()}>
                  Confirmar importação <ArrowRight size={15} aria-hidden="true" />
                </Botao>
              </footer>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function Passo({ numero, rotulo, ativo, concluido }: { numero: number; rotulo: string; ativo: boolean; concluido: boolean }) {
  return <div className="crc-import-passo-v2" data-ativo={ativo ? "sim" : "nao"} data-concluido={concluido ? "sim" : "nao"}><span>{concluido ? <CheckCircle2 aria-hidden="true" /> : numero}</span><strong>{rotulo}</strong></div>;
}

function Numero({ rotulo, valor, tom = "neutro" }: { rotulo: string; valor: number; tom?: "neutro" | "positivo" | "info" | "alerta" | "perigo" }) {
  return <article className="crc-import-numero-v2" data-tom={tom}><small>{rotulo}</small><strong>{valor}</strong></article>;
}
