/**
 * Clínicas e escopo — as regras puras.
 *
 * ============================================================================
 *  O TESTE QUE CARREGA ESTE ARQUIVO é o do ADMIN: o escopo dele é DERIVADO das
 *  clínicas que existem, e não das que foram gravadas para ele.
 *
 *  Se fosse gravado, a unidade criada amanhã seria invisível para o
 *  administrador — sem erro, sem log, sem nada. Ele abriria a tela e concluiria
 *  que a unidade não foi criada.
 *
 *  INJEÇÃO DE DEFEITO:
 *    devolver `vinculadas` também para admin  → "a unidade nova" quebra;
 *    trocar `<= 1` por `< 1` em podeDesativar → "a última ativa" quebra;
 *    devolver null quando não há clínica      → "zero unidades" quebra.
 * ============================================================================
 */
import { describe, expect, it } from "vitest";

import {
  avisoDeEscopo,
  escopoEfetivo,
  faltamEssenciais,
  gerarSlug,
  passosDaInstalacao,
  podeDesativarClinica,
  validarNomeDaClinica,
  type EstadoDaInstalacao,
} from "./clinicas";

/* -------------------------------------------------------------------------- */

describe("o slug", () => {
  it("tira acento e guarda a letra", () => {
    expect(gerarSlug("Unidade Jardim Paulista")).toBe("unidade-jardim-paulista");
    expect(gerarSlug("Clínica São João")).toBe("clinica-sao-joao");
  });

  it("o mesmo nome digitado com e sem acento dá o mesmo slug", () => {
    // São a mesma unidade escrita de dois jeitos — e a chave única precisa
    // enxergá-las como a mesma, senão nascem duas.
    expect(gerarSlug("Jardím Paulista")).toBe(gerarSlug("Jardim Paulista"));
  });

  it("não termina em hífen, nem quando o corte cai em cima de um", () => {
    /*
     * O corte de 40 caracteres pode cair exatamente sobre um separador. Um
     * slug terminado em hífen fica feio na URL e, pior, compara diferente de
     * um mesmo nome digitado um caractere mais curto.
     */
    const s = gerarSlug("Unidade Jardim Paulista Zona Sul Extensao Nova");
    expect(s.length).toBeLessThanOrEqual(40);
    expect(s.endsWith("-")).toBe(false);
  });

  it("nome só de pontuação é recusado — e não vira slug vazio", () => {
    /*
     * Dois nomes só de pontuação gerariam o MESMO slug vazio e disputariam a
     * chave única. O erro apareceria como "já existe uma unidade com esse
     * nome", que é confuso e falso.
     */
    expect(gerarSlug("!!! ---")).toBe("");

    const r = validarNomeDaClinica("!!! ---");
    expect(r.ok).toBe(false);
  });

  it("nome curto demais é recusado", () => {
    expect(validarNomeDaClinica("A").ok).toBe(false);
    expect(validarNomeDaClinica("  ").ok).toBe(false);
    expect(validarNomeDaClinica("Norte").ok).toBe(true);
  });
});

/* -------------------------------------------------------------------------- */

describe("desativar", () => {
  it("a última unidade ativa não é desativável", () => {
    const r = podeDesativarClinica({ ativasHoje: 1, estaEstaAtiva: true });

    expect(r.ok).toBe(false);
    // A frase diz a CONSEQUÊNCIA, e não a regra. "Não permitido" não ensina
    // nada; "ficaria sem lugar para receber paciente" ensina.
    if (!r.ok) expect(r.motivo).toContain("sem nenhum lugar");
  });

  it("com duas ativas, pode", () => {
    expect(podeDesativarClinica({ ativasHoje: 2, estaEstaAtiva: true }).ok).toBe(true);
  });

  it("desativar o que já está desativado não é erro", () => {
    // É no-op. Recusar aqui faria a tela mostrar erro para uma ação que não
    // mudaria nada — e a pessoa ficaria procurando o que fez de errado.
    expect(podeDesativarClinica({ ativasHoje: 1, estaEstaAtiva: false }).ok).toBe(true);
  });
});

/* -------------------------------------------------------------------------- */

describe("o escopo", () => {
  it("o admin enxerga a unidade criada DEPOIS do vínculo dele", () => {
    /*
     * ============================================================================
     *  ESTE É O TESTE QUE JUSTIFICA A FUNÇÃO EXISTIR.
     *
     *  O admin está vinculado só à Centro. A Sul nasceu hoje. Se o escopo
     *  saísse do vínculo gravado, ele abriria o CRC, não veria a Sul e
     *  concluiria que a criação falhou — sem nenhum erro na tela.
     * ============================================================================
     */
    const escopo = escopoEfetivo("admin", ["centro"], ["centro", "norte", "sul"]);

    expect(escopo).toEqual(["centro", "norte", "sul"]);
  });

  it("quem não é admin fica com o que foi vinculado — e só", () => {
    expect(escopoEfetivo("recepcao", ["centro"], ["centro", "norte", "sul"])).toEqual(["centro"]);
  });

  it("zero unidades num não-admin é PERIGO, e não informação", () => {
    /*
     * Sem unidade, a pessoa entra, a sessão abre, as permissões conferem — e
     * todas as listas vêm vazias. Não dá erro: `clinic_id in ()` é uma
     * consulta válida que não casa com nada.
     */
    const a = avisoDeEscopo("crc", 0);

    expect(a?.tom).toBe("perigo");
    expect(a?.texto).toContain("vazias");
  });

  it("o admin é avisado de que a seleção não muda nada para ele", () => {
    const a = avisoDeEscopo("admin", 0);

    // Informação, e não perigo: o admin com zero vínculos está correto — ele
    // alcança tudo por papel.
    expect(a?.tom).toBe("info");
  });

  it("não-admin com unidade não recebe aviso nenhum", () => {
    expect(avisoDeEscopo("crc", 2)).toBeNull();
  });
});

/* -------------------------------------------------------------------------- */

describe("os primeiros passos", () => {
  const zerado: EstadoDaInstalacao = {
    clinicasAtivas: 0,
    usuarios: 1,
    usuariosSemClinica: 0,
    integracaoLigada: false,
    pacientes: 0,
    canalDeMensagemLigado: false,
    automacoesAtivas: 0,
    politicaDePagamento: false,
  };

  it("numa instalação zerada, os essenciais são os que travam o uso", () => {
    const passos = passosDaInstalacao(zerado);

    // Clínica, integração e pacientes. Escopo está OK porque ninguém ficou de
    // fora ainda — o checklist não inventa pendência.
    expect(faltamEssenciais(passos)).toBe(3);
  });

  it("alguém trancado do lado de fora vira passo ESSENCIAL", () => {
    /*
     * Esta é a única entrada do checklist que não é "ainda não fiz", e sim
     * "fiz errado": ela só aparece quando já existe gente sem unidade.
     */
    const passos = passosDaInstalacao({ ...zerado, usuariosSemClinica: 1 });
    const escopo = passos.find((p) => p.chave === "escopo");

    expect(escopo?.feito).toBe(false);
    expect(escopo?.essencial).toBe(true);
  });

  it("com tudo pronto, não sobra essencial", () => {
    const passos = passosDaInstalacao({
      clinicasAtivas: 2,
      usuarios: 4,
      usuariosSemClinica: 0,
      integracaoLigada: true,
      pacientes: 900,
      canalDeMensagemLigado: true,
      automacoesAtivas: 3,
      politicaDePagamento: true,
    });

    expect(faltamEssenciais(passos)).toBe(0);
    expect(passos.every((p) => p.feito)).toBe(true);
  });

  it("cada passo diz O QUE MUDA, e não o que fazer", () => {
    /*
     * ============================================================================
     *  "Configure a integração" não ensina nada: a pessoa já sabe que precisa
     *  configurar, ela só não sabe se vale a pena agora.
     *
     *  Este teste não julga o texto — ele garante que o texto EXISTE e tem
     *  tamanho de explicação, não de rótulo. Um `porque` de oito caracteres
     *  passaria por qualquer revisão e não explicaria nada.
     * ============================================================================
     */
    for (const p of passosDaInstalacao(zerado)) {
      expect(p.porque.length).toBeGreaterThan(60);
      expect(p.aba.length).toBeGreaterThan(0);
    }
  });

  it("a ordem é a da dependência: clínica antes de integração, integração antes de paciente", () => {
    // Pedir para ligar o canal antes de existir paciente faria a automação não
    // ter para quem escrever — e a pessoa concluiria que não funciona.
    const chaves = passosDaInstalacao(zerado).map((p) => p.chave);

    expect(chaves.indexOf("clinica")).toBeLessThan(chaves.indexOf("integracao"));
    expect(chaves.indexOf("integracao")).toBeLessThan(chaves.indexOf("pacientes"));
    expect(chaves.indexOf("pacientes")).toBeLessThan(chaves.indexOf("canal"));
  });
});
