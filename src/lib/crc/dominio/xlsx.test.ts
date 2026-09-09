/**
 * Leitura de .xlsx.
 *
 * OS TESTES MONTAM UM ZIP DE VERDADE, byte a byte, em vez de exercitar as
 * funções internas com XML solto. É deliberado: metade dos defeitos possíveis
 * neste arquivo não está no XML — está no deslocamento do cabeçalho local, no
 * diretório central, no CRC. Um teste que pula o ZIP não veria nenhum deles.
 *
 * As entradas são gravadas SEM compressão (método 0), que é ZIP válido e o
 * Excel também usa para partes pequenas. O caminho comprimido é o mesmo daí
 * para frente — muda só quem entrega os bytes.
 */
import { describe, expect, it } from "vitest";

import { xlsxParaCsv } from "./xlsx";

/* -------------------------------------------------------------------------- */
/* Um ZIP mínimo, escrito à mão                                               */
/* -------------------------------------------------------------------------- */

const CRC_TABELA = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = (c & 1) === 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(dados: Uint8Array): number {
  let c = 0xffffffff;
  for (const byte of dados) c = (CRC_TABELA[(c ^ byte) & 0xff] ?? 0) ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function montarZip(arquivos: readonly { nome: string; texto: string }[]): ArrayBuffer {
  const codificador = new TextEncoder();
  const locais: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let deslocamento = 0;

  for (const arquivo of arquivos) {
    const nome = codificador.encode(arquivo.nome);
    const dados = codificador.encode(arquivo.texto);
    const soma = crc32(dados);

    const local = new Uint8Array(30 + nome.length + dados.length);
    const vl = new DataView(local.buffer);
    vl.setUint32(0, 0x04034b50, true);
    vl.setUint16(4, 20, true); // versão
    vl.setUint16(8, 0, true); // método: armazenado
    vl.setUint32(14, soma, true);
    vl.setUint32(18, dados.length, true);
    vl.setUint32(22, dados.length, true);
    vl.setUint16(26, nome.length, true);
    local.set(nome, 30);
    local.set(dados, 30 + nome.length);
    locais.push(local);

    const dir = new Uint8Array(46 + nome.length);
    const vd = new DataView(dir.buffer);
    vd.setUint32(0, 0x02014b50, true);
    vd.setUint16(4, 20, true);
    vd.setUint16(6, 20, true);
    vd.setUint16(10, 0, true);
    vd.setUint32(16, soma, true);
    vd.setUint32(20, dados.length, true);
    vd.setUint32(24, dados.length, true);
    vd.setUint16(28, nome.length, true);
    vd.setUint32(42, deslocamento, true);
    dir.set(nome, 46);
    central.push(dir);

    deslocamento += local.length;
  }

  const corpoCentral = central.reduce((n, c) => n + c.length, 0);
  const fim = new Uint8Array(22);
  const vf = new DataView(fim.buffer);
  vf.setUint32(0, 0x06054b50, true);
  vf.setUint16(8, arquivos.length, true);
  vf.setUint16(10, arquivos.length, true);
  vf.setUint32(12, corpoCentral, true);
  vf.setUint32(16, deslocamento, true);

  const partes = [...locais, ...central, fim];
  const total = partes.reduce((n, p) => n + p.length, 0);
  const saida = new Uint8Array(total);
  let p = 0;
  for (const parte of partes) {
    saida.set(parte, p);
    p += parte.length;
  }
  return saida.buffer;
}

/** Monta uma pasta de trabalho com a planilha, os textos e os estilos dados. */
function pasta(planilha: string, compartilhados?: string, estilos?: string): ArrayBuffer {
  const arquivos = [{ nome: "xl/worksheets/sheet1.xml", texto: planilha }];
  if (compartilhados !== undefined) {
    arquivos.push({ nome: "xl/sharedStrings.xml", texto: compartilhados });
  }
  if (estilos !== undefined) arquivos.push({ nome: "xl/styles.xml", texto: estilos });
  return montarZip(arquivos);
}

const COMPARTILHADOS = `<sst><si><t>Nome</t></si><si><t>Telefone</t></si><si><t>Maria Souza</t></si><si><t>João &amp; Cia</t></si></sst>`;

/* ========================================================================== */

describe("lê o que interessa", () => {
  it("converte texto compartilhado e número em CSV", async () => {
    const r = await xlsxParaCsv(
      pasta(
        `<worksheet><sheetData>
          <row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row>
          <row r="2"><c r="A2" t="s"><v>2</v></c><c r="B2"><v>11988887777</v></c></row>
        </sheetData></worksheet>`,
        COMPARTILHADOS,
      ),
    );

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.csv).toBe("Nome;Telefone\nMaria Souza;11988887777");
    expect(r.linhas).toBe(2);
  });

  it("desescapa entidades sem corromper texto com &", async () => {
    const r = await xlsxParaCsv(
      pasta(
        `<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>3</v></c></row></sheetData></worksheet>`,
        COMPARTILHADOS,
      ),
    );
    if (!r.ok) throw new Error(r.motivo);
    expect(r.csv).toBe("João & Cia");
  });

  it("preserva coluna vazia no meio da linha", async () => {
    // O caso que quebra importação em silêncio: sem ler `r="C2"`, o "SP" subiria
    // para a coluna do telefone e o dado entraria trocado.
    const r = await xlsxParaCsv(
      pasta(
        `<worksheet><sheetData>
          <row r="1"><c r="A1" t="inlineStr"><is><t>Maria</t></is></c><c r="C1" t="inlineStr"><is><t>SP</t></is></c></row>
        </sheetData></worksheet>`,
      ),
    );
    if (!r.ok) throw new Error(r.motivo);
    expect(r.csv).toBe("Maria;;SP");
  });

  it("junta os pedaços de um texto formatado numa célula só", async () => {
    // "**Maria** Souza" no Excel vira dois `<t>` dentro do mesmo `<si>`.
    const r = await xlsxParaCsv(
      pasta(
        `<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c></row></sheetData></worksheet>`,
        `<sst><si><r><t>Maria </t></r><r><t>Souza</t></r></si></sst>`,
      ),
    );
    if (!r.ok) throw new Error(r.motivo);
    expect(r.csv).toBe("Maria Souza");
  });

  it("converte data pela época correta do Excel", async () => {
    // 45900 = 2025-08-31 pela época 1899-12-30. Com 1900-01-01 daria dois dias
    // de diferença — um defeito que some no preview e aparece num relatório.
    const r = await xlsxParaCsv(
      pasta(
        `<worksheet><sheetData><row r="1"><c r="A1" s="1"><v>45900</v></c></row></sheetData></worksheet>`,
        undefined,
        `<styleSheet><cellXfs count="2"><xf numFmtId="0"/><xf numFmtId="14"/></cellXfs></styleSheet>`,
      ),
    );
    if (!r.ok) throw new Error(r.motivo);
    expect(r.csv).toBe("2025-08-31");
  });

  it("número sem formato de data continua número", async () => {
    const r = await xlsxParaCsv(
      pasta(
        `<worksheet><sheetData><row r="1"><c r="A1" s="0"><v>45900</v></c></row></sheetData></worksheet>`,
        undefined,
        `<styleSheet><cellXfs count="1"><xf numFmtId="0"/></cellXfs></styleSheet>`,
      ),
    );
    if (!r.ok) throw new Error(r.motivo);
    expect(r.csv).toBe("45900");
  });

  it("aspa só a célula que precisa", async () => {
    const r = await xlsxParaCsv(
      pasta(
        `<worksheet><sheetData><row r="1">` +
          `<c r="A1" t="inlineStr"><is><t>Rua A; 10</t></is></c>` +
          `<c r="B1" t="inlineStr"><is><t>simples</t></is></c>` +
          `</row></sheetData></worksheet>`,
      ),
    );
    if (!r.ok) throw new Error(r.motivo);
    expect(r.csv).toBe('"Rua A; 10";simples');
  });

  it("ignora linha totalmente em branco", async () => {
    const r = await xlsxParaCsv(
      pasta(
        `<worksheet><sheetData>
          <row r="1"><c r="A1" t="inlineStr"><is><t>Maria</t></is></c></row>
          <row r="2"><c r="A2" t="inlineStr"><is><t> </t></is></c></row>
          <row r="3"><c r="A3" t="inlineStr"><is><t>João</t></is></c></row>
        </sheetData></worksheet>`,
      ),
    );
    if (!r.ok) throw new Error(r.motivo);
    expect(r.linhas).toBe(2);
    expect(r.csv).toBe("Maria\nJoão");
  });
});

describe("falha alto, nunca em silêncio", () => {
  it("arquivo que não é ZIP", async () => {
    const r = await xlsxParaCsv(new TextEncoder().encode("nome,telefone\nMaria,11").buffer);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.motivo).toContain(".xls");
  });

  it("planilha protegida por senha diz o que fazer", async () => {
    const r = await xlsxParaCsv(montarZip([{ nome: "EncryptedPackage", texto: "..." }]));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.motivo).toContain("senha");
  });

  it("pasta sem planilha", async () => {
    const r = await xlsxParaCsv(montarZip([{ nome: "xl/workbook.xml", texto: "<workbook/>" }]));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.motivo).toContain("nenhuma planilha");
  });

  it("planilha vazia NÃO vira importação de zero linha", async () => {
    // O pior desfecho possível: "importado com sucesso, 0 registros".
    const r = await xlsxParaCsv(pasta(`<worksheet><sheetData/></worksheet>`));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.motivo).toContain("vazia");
  });
});
