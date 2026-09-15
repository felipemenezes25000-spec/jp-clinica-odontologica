/**
 * O tipo `Aba` e a lista `ABAS` não podem divergir.
 *
 * ============================================================================
 *  O DEFEITO QUE ISTO IMPEDE É SILENCIOSO, e chega em produção.
 *
 *  `Aba` é um tipo — some na compilação. `ABAS` é um array — é o que valida o
 *  que veio na barra de endereço. Quem adicionar uma tela nova vai mexer no
 *  tipo, porque é o tipo que o compilador cobra; o array não reclama de nada.
 *
 *  O resultado seria uma tela que existe no menu, abre pelo clique, e devolve
 *  a Home quando alguém recarrega a página ou manda o link para um colega —
 *  porque `ehAba()` não reconheceria o nome. Nada quebra, nada avisa, e o
 *  sintoma ("às vezes volta para o início") é dos mais difíceis de reproduzir.
 *
 *  O `satisfies readonly Aba[]` na declaração já impede o array de conter um
 *  nome que o tipo não tem. Falta o outro lado: o tipo ter um nome que o array
 *  não tem. É disso que este arquivo cuida.
 * ============================================================================
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { ABAS, PERMISSAO_DA_TELA, abaDoCaminho, caminhoDaAba, ehAba, type Aba } from "./rotas";

describe("a lista de abas cobre o tipo inteiro", () => {
  it("toda aba do tipo está no array", () => {
    /*
     * COMO ISTO FUNCIONA: o objeto abaixo é `Record<Aba, true>`, então o
     * compilador exige uma chave para CADA membro do tipo — esquecer uma é
     * erro de compilação, e o `npm run typecheck` pega antes do teste rodar.
     *
     * Em tempo de execução, comparamos as chaves com o array. As duas metades
     * juntas fecham o cerco nas duas direções.
     */
    const todas: Record<Aba, true> = {
      home: true,
      radar: true,
      encaixes: true,
      tratamentos: true,
      recepcao: true,
      trabalho: true,
      inbox: true,
      agenda: true,
      funil: true,
      pacientes: true,
      gestao: true,
      metas: true,
      autonomia: true,
      importar: true,
      automacoes: true,
      campanhas: true,
      inteligencia: true,
      conhecimento: true,
      modelos: true,
      avaliacao: true,
      estudio: true,
      playground: true,
      ferramentas: true,
      proximas: true,
      saude: true,
      integracoes: true,
      configuracoes: true,
      equipe: true,
    };

    expect([...ABAS].sort()).toEqual(Object.keys(todas).sort());
  });

  it("não há nome repetido", () => {
    expect(new Set(ABAS).size).toBe(ABAS.length);
  });
});

describe("o endereço de cada tela", () => {
  it("a Home é a raiz, e não /crc/home", () => {
    expect(caminhoDaAba("home")).toBe("/crc");
  });

  it("as demais ficam sob /crc", () => {
    expect(caminhoDaAba("radar")).toBe("/crc/radar");
    expect(caminhoDaAba("configuracoes")).toBe("/crc/configuracoes");
  });

  it("ida e volta: todo caminho gerado volta na mesma aba", () => {
    // A propriedade que importa de verdade. Sem ela, um menu aponta para um
    // lugar e o shell destaca outro item — e ninguém entende por quê.
    for (const aba of ABAS) {
      expect(abaDoCaminho(caminhoDaAba(aba))).toBe(aba);
    }
  });
});

describe("endereço desconhecido não quebra a tela", () => {
  it("nome que não existe cai na Home", () => {
    expect(abaDoCaminho("/crc/rdar")).toBe("home");
    expect(abaDoCaminho("/crc/../etc")).toBe("home");
  });

  it("barra no fim não muda nada", () => {
    expect(abaDoCaminho("/crc/radar/")).toBe("radar");
    expect(abaDoCaminho("/crc/")).toBe("home");
  });

  it("segmento a mais mantém a aba do primeiro nível", () => {
    // `/crc/pacientes/123` continua sendo a tela de pacientes.
    expect(abaDoCaminho("/crc/pacientes/123")).toBe("pacientes");
  });

  it("`ehAba` recusa o que não é texto", () => {
    expect(ehAba(null)).toBe(false);
    expect(ehAba(42)).toBe(false);
    expect(ehAba("Home")).toBe(false); // maiúscula não vale: a URL é minúscula
  });
});

/**
 * ============================================================================
 *  O MENU E A ROTA PRECISAM EXIGIR A MESMA PERMISSÃO.
 *
 *  Esconder o item do menu não impede ninguém de digitar `/crc/equipe` na
 *  barra de endereço — então a rota confere de novo. Duas conferências da
 *  mesma regra é o começo de duas regras diferentes: o dia em que alguém
 *  afrouxar o menu e esquecer da rota, a tela some do menu e continua
 *  acessível pela URL. O contrário é pior de perceber: o item aparece no
 *  menu e a tela recusa quem clica nele.
 *
 *  O teste lê a definição do menu direto da fonte, porque importar
 *  `routes/crc.tsx` traria o router, o CSS e trinta telas junto.
 * ============================================================================
 */
describe("a permissão da rota é a mesma do item de menu", () => {
  const fonte = readFileSync("src/routes/crc.tsx", "utf8");
  const bloco = fonte.slice(
    fonte.indexOf("const GRUPOS_NAVEGACAO"),
    fonte.indexOf("const NAVEGACAO"),
  );

  /*
   * FATIA POR ITEM, e não por distância. A primeira versão disto procurava
   * `permissao:` dentro de uma janela de N caracteres depois de `aba:` — e leu
   * 26 dos 28, porque alguns itens do menu têm o corpo mais longo que a janela.
   *
   * O controle positivo logo abaixo foi o que denunciou. Contar é mais honesto
   * do que escolher um N e torcer.
   */
  const doMenu = new Map<string, string>();
  const pedacos = bloco.split(/(?=aba:\s*")/u);
  for (const pedaco of pedacos) {
    const aba = /^aba:\s*"([a-z]+)"/u.exec(pedaco)?.[1];
    const permissao = /permissao:\s*"([a-z_]+)"/u.exec(pedaco)?.[1];
    if (aba !== undefined && permissao !== undefined) doMenu.set(aba, permissao);
  }

  it("o menu foi lido — senão este bloco passa por vazio", () => {
    // Controle positivo: se o formato mudar, a varredura devolve pouco e todo
    // o resto passaria sem comparar nada.
    expect(doMenu.size).toBe(ABAS.length);
  });

  it("nenhuma tela exige na rota algo diferente do que exige no menu", () => {
    const divergentes = [...doMenu]
      .filter(([aba]) => aba !== "home")
      .filter(([aba, permissao]) => PERMISSAO_DA_TELA[aba as Exclude<Aba, "home">] !== permissao)
      .map(([aba, permissao]) => `${aba}: menu="${permissao}"`);

    expect(divergentes).toEqual([]);
  });
});
