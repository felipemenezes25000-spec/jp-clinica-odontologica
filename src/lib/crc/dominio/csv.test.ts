/**
 * Testes do leitor de CSV.
 *
 * Cada caso aqui é uma armadilha REAL de arquivo exportado do Excel em pt-BR.
 * Nenhum deles é hipotético: são as formas pelas quais um importador
 * silenciosamente lê o valor errado — e valor errado num orçamento vira
 * prioridade errada na fila, e numa cobrança vira mensagem para quem não deve.
 */
import { describe, expect, it } from "vitest";

import {
  detectarSeparador,
  lerCsv,
  lerData,
  lerDinheiro,
  normalizarColuna,
  quebrarLinha,
  valorDaColuna,
} from "./csv";

const BOM = String.fromCharCode(0xfeff);
const NBSP = String.fromCharCode(0x00a0);

/* ========================================================================== */
/* Separador                                                                  */
/* ========================================================================== */

describe("detecção de separador", () => {
  it("acha o ponto e vírgula do Excel brasileiro", () => {
    expect(detectarSeparador("Paciente;Valor;Data")).toBe(";");
  });

  it("acha a vírgula quando o arquivo é internacional", () => {
    expect(detectarSeparador("Patient,Amount,Date")).toBe(",");
  });

  it("NÃO conta separador dentro de aspas", () => {
    // Este é o erro clássico: com a vírgula do cabeçalho entre aspas contando,
    // a vírgula venceria e o arquivo inteiro seria lido com uma coluna só.
    expect(detectarSeparador('"Paciente, nome completo";Valor;Data')).toBe(";");
  });

  it("aceita tabulação", () => {
    expect(detectarSeparador("Paciente\tValor\tData")).toBe("\t");
  });
});

/* ========================================================================== */
/* Quebra de linha                                                            */
/* ========================================================================== */

describe("quebra de linha", () => {
  it("respeita aspas", () => {
    // Sem isso a descrição vira duas colunas e todas as seguintes andam uma
    // casa: o valor acaba no campo de quantidade, e continua sendo número.
    expect(quebrarLinha('"Implante, unitário";1500,00', ";")).toEqual([
      "Implante, unitário",
      "1500,00",
    ]);
  });

  it("entende aspas duplas escapadas", () => {
    expect(quebrarLinha('"Coroa ""provisória""";800', ";")).toEqual(['Coroa "provisória"', "800"]);
  });

  it("preserva campos vazios no meio", () => {
    expect(quebrarLinha("Maria;;1500", ";")).toEqual(["Maria", "", "1500"]);
  });
});

/* ========================================================================== */
/* Leitura completa                                                           */
/* ========================================================================== */

describe("leitura do arquivo", () => {
  it("lê um CSV brasileiro típico", () => {
    const csv =
      "Paciente;Valor Total;Status\nMaria Souza;1.500,00;Aberto\nJoão Lima;800,50;Aprovado";
    const r = lerCsv(csv);

    expect(r.separador).toBe(";");
    expect(r.colunas).toEqual(["Paciente", "Valor Total", "Status"]);
    expect(r.linhas).toHaveLength(2);
    expect(r.linhas[0]?.["Paciente"]).toBe("Maria Souza");
  });

  it("REMOVE o BOM do Excel", () => {
    // Sem isso o primeiro cabeçalho é BOM + "Paciente" — visualmente idêntico,
    // e nenhuma busca por "Paciente" casa.
    const r = lerCsv(`${BOM}Paciente;Valor\nMaria;100`);
    expect(r.colunas[0]).toBe("Paciente");
    expect(valorDaColuna(r.linhas[0] ?? {}, "paciente")).toBe("Maria");
  });

  it("aceita fim de linha do Windows e do Mac antigo", () => {
    expect(lerCsv("A;B\r\n1;2").linhas).toHaveLength(1);
    expect(lerCsv("A;B\r1;2").linhas).toHaveLength(1);
  });

  it("ignora linhas em branco no fim — o caso mais comum de todos", () => {
    const r = lerCsv("Paciente;Valor\nMaria;100\n\n\n");
    expect(r.linhas).toHaveLength(1);
  });

  it("linha com menos campos que o cabeçalho não estoura", () => {
    const r = lerCsv("A;B;C\n1;2");
    expect(r.linhas[0]).toEqual({ A: "1", B: "2", C: "" });
  });

  it("arquivo vazio devolve estrutura vazia, e não erro", () => {
    expect(lerCsv("").linhas).toHaveLength(0);
  });
});

/* ========================================================================== */
/* Nomes de coluna                                                            */
/* ========================================================================== */

describe("normalização de coluna", () => {
  it("iguala as formas que a mesma coluna assume", () => {
    for (const nome of ["Valor Total", "valor_total", "VALOR TOTAL", " Valor  Total "]) {
      expect(normalizarColuna(nome), nome).toBe("valortotal");
    }
  });

  it("tira acento", () => {
    expect(normalizarColuna("Situação")).toBe("situacao");
    expect(normalizarColuna("Emissão")).toBe("emissao");
  });

  it("acha a coluna por qualquer sinônimo", () => {
    const linha = { "Vlr Total": "1500", Paciente: "Maria" };
    expect(valorDaColuna(linha, "valor total", "vlr total", "total")).toBe("1500");
    expect(valorDaColuna(linha, "inexistente")).toBeNull();
  });

  it("coluna presente mas vazia conta como ausente", () => {
    // Uma célula em branco não é um valor: tratar como "" faria o importador
    // aceitar orçamento sem valor.
    expect(valorDaColuna({ Valor: "   " }, "valor")).toBeNull();
  });
});

/* ========================================================================== */
/* Dinheiro                                                                   */
/* ========================================================================== */

describe("leitura de dinheiro", () => {
  it("lê o formato brasileiro", () => {
    expect(lerDinheiro("R$ 1.234,56")).toBe("1234.56");
    expect(lerDinheiro("1.234,56")).toBe("1234.56");
    expect(lerDinheiro("4800,00")).toBe("4800.00");
    expect(lerDinheiro("0,50")).toBe("0.50");
  });

  it("lê o formato americano", () => {
    expect(lerDinheiro("1,234.56")).toBe("1234.56");
    expect(lerDinheiro("4800.00")).toBe("4800.00");
  });

  it("decide a ambiguidade de '1.234' para o lado que salta aos olhos", () => {
    // Errar para milhar vira R$ 1.234 no lugar de R$ 1,23 — visível na
    // conferência. Errar para decimal vira R$ 1,23 no lugar de R$ 1.234 —
    // silencioso, e some do relatório.
    expect(lerDinheiro("1.234")).toBe("1234.00");
    // Com duas casas, é decimal americano e não milhar.
    expect(lerDinheiro("1.23")).toBe("1.23");
  });

  it("aceita o espaço não-quebrável que o Excel usa como milhar", () => {
    expect(lerDinheiro(`1${NBSP}234,56`)).toBe("1234.56");
  });

  it("entende negativo em parênteses, como a contabilidade escreve", () => {
    expect(lerDinheiro("(150,00)")).toBe("-150.00");
    expect(lerDinheiro("-150,00")).toBe("-150.00");
  });

  it("recusa o que não é número em vez de virar zero", () => {
    // Virar zero seria pior: um orçamento de valor desconhecido entraria no
    // funil valendo nada, e ninguém notaria.
    expect(lerDinheiro("a combinar")).toBeNull();
    expect(lerDinheiro("")).toBeNull();
    expect(lerDinheiro(null)).toBeNull();
  });
});

/* ========================================================================== */
/* Datas                                                                      */
/* ========================================================================== */

describe("leitura de data", () => {
  it("lê o formato brasileiro", () => {
    expect(lerData("08/09/2026")).toBe("2026-09-08");
    expect(lerData("8/9/2026")).toBe("2026-09-08");
    expect(lerData("08-09-2026")).toBe("2026-09-08");
  });

  it("lê ISO", () => {
    expect(lerData("2026-09-08")).toBe("2026-09-08");
    expect(lerData("2026-09-08T14:30:00Z")).toBe("2026-09-08");
  });

  it("resolve ano de dois dígitos pelo corte em 70", () => {
    expect(lerData("08/09/26")).toBe("2026-09-08");
    expect(lerData("08/09/85")).toBe("1985-09-08");
  });

  it("RECUSA data impossível em vez de chutar", () => {
    // Data errada coloca o orçamento na janela errada de recuperação, e numa
    // cobrança muda o tom da mensagem.
    expect(lerData("32/09/2026")).toBeNull();
    expect(lerData("08/13/2026")).toBeNull();
    expect(lerData("ontem")).toBeNull();
    expect(lerData("")).toBeNull();
    expect(lerData(null)).toBeNull();
  });
});
