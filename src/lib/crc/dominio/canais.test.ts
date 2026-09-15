/**
 * A abstração de canal — §6, §10, §24.
 *
 * ============================================================================
 *  O QUE ESTES TESTES TRAVAM É UMA COISA SÓ: que o CRC pare de supor que toda
 *  mensagem tem telefone.
 *
 *  O pressuposto vazava por toda a camada de aplicação, e o teste que mais
 *  importa aqui é o mais simples: `montarDestino("instagram", igsid)` produz um
 *  destino cujo tipo NÃO é telefone. Sem essa garantia, o adapter receberia um
 *  IGSID no campo de telefone e a Graph recusaria com `invalid recipient` — ou,
 *  pior, acertaria um número coincidente.
 * ============================================================================
 */
import { describe, expect, it } from "vitest";

import {
  CANAIS_DE_CONVERSA,
  canalDaLinha,
  canalUsaTelefone,
  contatoExternoDoDestino,
  contatoParaTela,
  CONTATO_DO_CANAL,
  ehCanalDeConversa,
  montarDestino,
  NAMESPACE_DO_CANAL,
  rotuloDoCanal,
} from "./canais";

const IGSID = "17841400000000001";

describe("o canal vindo do banco", () => {
  it("aceita os três canais de conversa", () => {
    for (const c of CANAIS_DE_CONVERSA) expect(ehCanalDeConversa(c)).toBe(true);
  });

  it("recusa `lead_ads` como canal de conversa", () => {
    /*
     * É A DECISÃO MAIS IMPORTANTE DE `canais.ts`, e ela é uma AUSÊNCIA.
     *
     * Um Instant Form não tem thread: ninguém está esperando resposta naquele
     * canal, e não existe endereço para responder. Modelá-lo como canal criaria
     * uma conversa na Inbox que nunca recebe nem manda mensagem — visível para
     * sempre, sem nada a fazer.
     */
    expect(ehCanalDeConversa("lead_ads")).toBe(false);
  });

  it("cai em whatsapp quando a coluna traz lixo", () => {
    // `crc_conversations.canal` é `text` com default `'whatsapp'`: linha semeada
    // à mão ou migração pela metade pode trazer qualquer coisa.
    expect(canalDaLinha(null)).toBe("whatsapp");
    expect(canalDaLinha(42)).toBe("whatsapp");
    expect(canalDaLinha("telegram")).toBe("whatsapp");
    expect(canalDaLinha("instagram")).toBe("instagram");
  });
});

describe("o destino não supõe telefone", () => {
  it("instagram produz um identificador que NÃO é telefone", () => {
    const d = montarDestino("instagram", IGSID);
    expect(d).not.toBeNull();
    expect(d?.canal).toBe("instagram");
    expect(d?.contato.tipo).toBe("instagram_scoped_id");
    expect(d?.contato.valor).toBe(IGSID);
  });

  it("messenger produz PSID", () => {
    expect(montarDestino("messenger", "9876")?.contato.tipo).toBe("facebook_psid");
  });

  it("whatsapp continua telefone", () => {
    expect(montarDestino("whatsapp", "5511999990000")?.contato.tipo).toBe("telefone");
  });

  it("cada canal tem UM tipo de contato, e eles são distintos", () => {
    const tipos = new Set(Object.values(CONTATO_DO_CANAL));
    expect(tipos.size).toBe(CANAIS_DE_CONVERSA.length);
  });

  it("contato vazio não vira destino", () => {
    /*
     * FALHA FECHADO — §4.5. Conversa sem contato externo existe de verdade
     * (importação antiga, linha semeada), e mandar "para vazio" é pedir ao
     * provedor que escolha o destinatário.
     */
    expect(montarDestino("instagram", "")).toBeNull();
    expect(montarDestino("instagram", "   ")).toBeNull();
  });

  it("a chave da conversa sai do destino", () => {
    const d = montarDestino("instagram", ` ${IGSID} `);
    expect(d).not.toBeNull();
    // O valor é aparado: um espaço sobrando na chave criaria uma SEGUNDA
    // conversa para a mesma pessoa.
    expect(contatoExternoDoDestino(d!)).toBe(IGSID);
  });

  it("só o whatsapp usa telefone", () => {
    expect(canalUsaTelefone("whatsapp")).toBe(true);
    expect(canalUsaTelefone("instagram")).toBe(false);
    expect(canalUsaTelefone("messenger")).toBe(false);
  });
});

describe("o identificador da Meta não aparece como UX principal — §24", () => {
  it("sem apelido, o Instagram mostra o canal e NUNCA o id", () => {
    const tela = contatoParaTela("instagram", IGSID, null);
    expect(tela).toBe("Direct do Instagram");
    // A GARANTIA É ESTA: os dezessete dígitos não chegam à tela.
    expect(tela).not.toContain(IGSID);
  });

  it("sem apelido, o Messenger mostra o canal", () => {
    expect(contatoParaTela("messenger", "9876", null)).toBe("Messenger do Facebook");
  });

  it("com apelido, o Instagram mostra @usuario — e sem arroba dobrada", () => {
    expect(contatoParaTela("instagram", IGSID, "joao_ig")).toBe("@joao_ig");
    expect(contatoParaTela("instagram", IGSID, "@joao_ig")).toBe("@joao_ig");
  });

  it("apelido em branco é tratado como ausente", () => {
    expect(contatoParaTela("instagram", IGSID, "   ")).toBe("Direct do Instagram");
  });

  it("no whatsapp devolve o contato para quem sabe formatar telefone", () => {
    /*
     * `canais.ts` NÃO formata telefone de propósito: quem sabe é
     * `dominio/telefone.ts`. Duplicar a regra do DDI aqui é como um defeito
     * antigo deste repositório começou.
     */
    expect(contatoParaTela("whatsapp", "5511999990000", null)).toBe("5511999990000");
  });
});

describe("o rótulo do canal não depende de cor — §22", () => {
  it("todo canal tem nome e frase acessível própria", () => {
    const nomes = new Set<string>();
    const acessiveis = new Set<string>();

    for (const c of CANAIS_DE_CONVERSA) {
      const r = rotuloDoCanal(c);
      expect(r.nome.length).toBeGreaterThan(0);
      // A FRASE ACESSÍVEL É UMA FRASE, e não o nome repetido: lida em sequência
      // com o nome do paciente, "Instagram" sozinho soa como parte do nome.
      expect(r.acessivel.length).toBeGreaterThan(r.nome.length);
      nomes.add(r.nome);
      acessiveis.add(r.acessivel);
    }

    expect(nomes.size).toBe(CANAIS_DE_CONVERSA.length);
    expect(acessiveis.size).toBe(CANAIS_DE_CONVERSA.length);
  });

  it("a chave do rótulo é o canal, para o CSS resolver", () => {
    expect(rotuloDoCanal("instagram").chave).toBe("instagram");
  });
});

describe("o namespace de identidade — §10", () => {
  it("cada canal tem namespace próprio, e nenhum é o do prontuário", () => {
    const usados = new Set(Object.values(NAMESPACE_DO_CANAL));
    expect(usados.size).toBe(CANAIS_DE_CONVERSA.length);
    /*
     * A COLISÃO QUE ISTO IMPEDE: `EXTERNAL_ID / 123` do Dental Office e
     * `EXTERNAL_ID / 123` do Instagram (um IGSID) seriam a MESMA linha, e a
     * resolução devolveria `UNICO` para o paciente errado.
     */
    expect(usados.has("dental-office")).toBe(false);
  });
});
