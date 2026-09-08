/**
 * Testes das definições de automação e dos templates.
 *
 * O que estes testes protegem é diferente do resto da suíte. Não é lógica: é
 * CONFIGURAÇÃO que se comporta como código. Uma automação com a condição de
 * saída errada compila, roda, não estoura em lugar nenhum — e simplesmente não
 * fala com ninguém. O bug aparece semanas depois, como "a automação não
 * funciona", sem nenhum erro para investigar.
 *
 * Três armadilhas concretas que estes testes pegam:
 *   1. Automação de confirmação com `TEM_CONSULTA_FUTURA` na saída: encerraria
 *      no primeiro passo, porque ter consulta é a premissa dela.
 *   2. Passo apontando para template que não existe: o paciente receberia a
 *      frase genérica de fallback.
 *   3. Template com variável que ninguém preenche: `{{primeiroNome}}` cru
 *      chegando no WhatsApp de um paciente.
 */
import { describe, expect, it } from "vitest";

import type { CondicaoAutomacao, PassoAutomacao } from "../dominio/tipos";

import { AUTOMACOES_PADRAO } from "./catalogo";
import { TEMPLATES_PADRAO, aplicarVariaveis, renderizarComExemplo } from "./templates";

/* ========================================================================== */
/* Catálogo                                                                   */
/* ========================================================================== */

describe("catálogo de automações", () => {
  it("cobre as seis automações que o item 48 do Mega Prompt pede, e as duas de receita", () => {
    const chaves = AUTOMACOES_PADRAO.map((a) => a.chave);
    expect(chaves).toContain("recuperacao_faltas");
    expect(chaves).toContain("confirmacao_consulta");
    expect(chaves).toContain("recall_seis_meses");
    expect(chaves).toContain("cancelamento_reagendamento");
    expect(chaves).toContain("reativacao_inativos");
    expect(chaves).toContain("aniversario");
    // As duas que vieram depois: orçamento parado e cobrança de parcelas.
    expect(chaves).toContain("recuperacao_orcamento");
    expect(chaves).toContain("cobranca_parcelas");
  });

  it("não tem chave repetida", () => {
    const chaves = AUTOMACOES_PADRAO.map((a) => a.chave);
    expect(new Set(chaves).size).toBe(chaves.length);
  });

  it("toda automação tem nome e descrição em português para a tela", () => {
    // Item 225: a UI não mostra jargão. `recuperacao_faltas` é chave interna;
    // "Recuperação de faltas" é o que a pessoa lê.
    for (const a of AUTOMACOES_PADRAO) {
      expect(a.nome.length, a.chave).toBeGreaterThan(3);
      expect(a.descricao.length, a.chave).toBeGreaterThan(20);
      expect(a.nome).not.toBe(a.chave);
    }
  });

  it("toda automação tem pelo menos um passo", () => {
    for (const a of AUTOMACOES_PADRAO) {
      expect(a.definicao.passos.length, a.chave).toBeGreaterThan(0);
    }
  });

  it("toda automação que fala com o paciente exige telefone e sem opt-out", () => {
    // Sem isso, a jornada nasceria, gastaria passos e morreria no envio — e o
    // log diria "falhou" para uma coisa que nunca deveria ter começado.
    for (const a of AUTOMACOES_PADRAO) {
      const envia = a.definicao.passos.some((p) => p.tipo === "ENVIAR_TEMPLATE");
      if (!envia) continue;

      const tipos = a.definicao.condicoes.map((c) => c.tipo);
      expect(tipos, `${a.chave} precisa exigir telefone`).toContain("TEM_TELEFONE");
      expect(tipos, `${a.chave} precisa exigir sem opt-out`).toContain("SEM_OPT_OUT");
      expect(tipos, `${a.chave} precisa exigir paciente ativo`).toContain("PACIENTE_ATIVO");
    }
  });

  it("a automação de confirmação NÃO sai por 'tem consulta futura'", () => {
    // A armadilha número 1. Ter consulta é a PREMISSA desta jornada; usá-la
    // como saída encerraria todas elas no primeiro passo.
    const confirmacao = AUTOMACOES_PADRAO.find((a) => a.chave === "confirmacao_consulta");
    expect(confirmacao).toBeDefined();
    const saidas = confirmacao?.definicao.saidas.map((s) => s.condicao.tipo) ?? [];
    expect(saidas).not.toContain("TEM_CONSULTA_FUTURA");
  });

  it("as jornadas de recuperação SAEM quando o paciente agenda", () => {
    // O oposto do teste anterior, e a saída mais importante do sistema: é ela
    // que impede "sentimos sua falta, quer remarcar?" chegar para quem já
    // remarcou.
    for (const chave of [
      "recuperacao_faltas",
      "cancelamento_reagendamento",
      "recall_seis_meses",
      "reativacao_inativos",
    ]) {
      const a = AUTOMACOES_PADRAO.find((x) => x.chave === chave);
      const saidas = a?.definicao.saidas.map((s) => s.condicao.tipo) ?? [];
      expect(saidas, `${chave} precisa sair quando o paciente agenda`).toContain(
        "TEM_CONSULTA_FUTURA",
      );
    }
  });

  it("as jornadas de recuperação exigem que NÃO haja consulta futura para começar", () => {
    for (const chave of [
      "recuperacao_faltas",
      "cancelamento_reagendamento",
      "recall_seis_meses",
      "reativacao_inativos",
    ]) {
      const a = AUTOMACOES_PADRAO.find((x) => x.chave === chave);
      const tipos = a?.definicao.condicoes.map((c) => c.tipo) ?? [];
      expect(tipos, chave).toContain("SEM_CONSULTA_FUTURA");
    }
  });

  it("nenhuma saída tem motivo vazio — ele aparece no debugger da jornada", () => {
    for (const a of AUTOMACOES_PADRAO) {
      for (const s of a.definicao.saidas) {
        expect(s.motivo.trim().length, `${a.chave}: motivo de saída vazio`).toBeGreaterThan(0);
      }
    }
  });

  it("todo passo aponta para um template que existe", () => {
    // A armadilha número 2.
    for (const a of AUTOMACOES_PADRAO) {
      for (const passo of a.definicao.passos) {
        if (passo.tipo !== "ENVIAR_TEMPLATE") continue;
        expect(
          Object.keys(TEMPLATES_PADRAO),
          `${a.chave} usa template inexistente: ${passo.template}`,
        ).toContain(passo.template);
      }
    }
  });

  it("nenhuma espera é absurda — nem instantânea, nem de meses", () => {
    for (const a of AUTOMACOES_PADRAO) {
      for (const passo of a.definicao.passos) {
        if (passo.tipo !== "ESPERAR") continue;
        expect(passo.minutos, `${a.chave}: espera não positiva`).toBeGreaterThan(0);
        // 30 dias. Uma espera maior que isso numa jornada de recuperação
        // significa que o contexto já se perdeu para o paciente.
        expect(passo.minutos, `${a.chave}: espera longa demais`).toBeLessThanOrEqual(60 * 24 * 30);
      }
    }
  });

  it("`ESPERAR_ATE` usa hora no formato HH:mm e dentro do dia", () => {
    for (const a of AUTOMACOES_PADRAO) {
      for (const passo of a.definicao.passos) {
        if (passo.tipo !== "ESPERAR_ATE") continue;
        expect(passo.hora, a.chave).toMatch(/^\d{2}:\d{2}$/u);
        const [h, m] = passo.hora.split(":").map((x) => Number.parseInt(x, 10));
        expect(h ?? -1).toBeGreaterThanOrEqual(0);
        expect(h ?? 99).toBeLessThan(24);
        expect(m ?? 99).toBeLessThan(60);
      }
    }
  });

  it("toda jornada que manda mais de uma mensagem verifica resposta entre elas", () => {
    // Item 279: a automação não pode parecer spam. Mandar duas mensagens sem
    // checar se a pessoa respondeu no meio é a definição de insistir sem
    // ouvir.
    for (const a of AUTOMACOES_PADRAO) {
      const passos = a.definicao.passos;
      const envios = passos.map((p, i) => ({ p, i })).filter((x) => x.p.tipo === "ENVIAR_TEMPLATE");
      if (envios.length < 2) continue;

      for (let n = 1; n < envios.length; n += 1) {
        const de = envios[n - 1]?.i ?? 0;
        const ate = envios[n]?.i ?? 0;
        const entre = passos.slice(de + 1, ate);
        const verifica = entre.some(
          (p) => p.tipo === "SAIR_SE" && p.condicao.tipo === "PACIENTE_RESPONDEU",
        );
        expect(verifica, `${a.chave}: dois envios sem checar resposta no meio`).toBe(true);
      }
    }
  });

  it("toda jornada com envio espera antes de cobrar de novo", () => {
    const passos = (chave: string): readonly PassoAutomacao[] =>
      AUTOMACOES_PADRAO.find((a) => a.chave === chave)?.definicao.passos ?? [];

    for (const a of AUTOMACOES_PADRAO) {
      const p = passos(a.chave);
      for (let i = 1; i < p.length; i += 1) {
        if (p[i]?.tipo !== "ENVIAR_TEMPLATE") continue;
        const anteriores = p.slice(0, i);
        const jaEnviou = anteriores.some((x) => x.tipo === "ENVIAR_TEMPLATE");
        if (!jaEnviou) continue;
        const esperou = anteriores.some((x) => x.tipo === "ESPERAR" || x.tipo === "ESPERAR_ATE");
        expect(esperou, `${a.chave}: dois envios sem espera entre eles`).toBe(true);
      }
    }
  });

  it("as jornadas de faltas e cancelados terminam em tarefa humana", () => {
    // Critério de sucesso do item 53 do Mega Prompt: "não perde follow-up". A
    // automação pode desistir; o sistema não.
    for (const chave of ["recuperacao_faltas", "cancelamento_reagendamento"]) {
      const a = AUTOMACOES_PADRAO.find((x) => x.chave === chave);
      const criaTarefa = a?.definicao.passos.some((p) => p.tipo === "CRIAR_TAREFA") ?? false;
      expect(criaTarefa, `${chave} precisa terminar em tarefa humana`).toBe(true);
    }
  });

  it("a felicitação de aniversário não cobra nada nem vira funil", () => {
    // Item 286: não buscar receita sacrificando a confiança do paciente.
    const a = AUTOMACOES_PADRAO.find((x) => x.chave === "aniversario");
    const tipos = a?.definicao.passos.map((p) => p.tipo) ?? [];
    expect(tipos).not.toContain("CRIAR_TAREFA");
    expect(tipos).not.toContain("MOVER_ETAPA");
    expect(tipos.filter((t) => t === "ENVIAR_TEMPLATE")).toHaveLength(1);
  });

  it("as condições usadas existem no vocabulário do domínio", () => {
    const permitidas: CondicaoAutomacao["tipo"][] = [
      "SEM_CONSULTA_FUTURA",
      "TEM_CONSULTA_FUTURA",
      "PACIENTE_RESPONDEU",
      "PACIENTE_NAO_RESPONDEU",
      "PACIENTE_ATIVO",
      "SEM_OPT_OUT",
      "TEM_TELEFONE",
      "SITUACAO_E",
      "DIAS_DESDE_ULTIMA_CONSULTA_MAIOR_QUE",
      "SEMPRE",
    ];

    for (const a of AUTOMACOES_PADRAO) {
      for (const c of a.definicao.condicoes) expect(permitidas).toContain(c.tipo);
      for (const s of a.definicao.saidas) expect(permitidas).toContain(s.condicao.tipo);
      for (const p of a.definicao.passos) {
        if (p.tipo === "SAIR_SE") expect(permitidas).toContain(p.condicao.tipo);
      }
    }
  });
});

/* ========================================================================== */
/* Templates                                                                  */
/* ========================================================================== */

describe("templates", () => {
  it("substitui as variáveis", () => {
    expect(aplicarVariaveis("Olá, {{primeiroNome}}!", { primeiroNome: "Maria" })).toBe(
      "Olá, Maria!",
    );
    expect(aplicarVariaveis("Olá, {{ primeiroNome }}!", { primeiroNome: "Ana" })).toBe("Olá, Ana!");
  });

  it("NUNCA deixa a chave crua vazar para o paciente", () => {
    // A armadilha número 3. `{{primeiroNome}}` chegando num WhatsApp real
    // destrói a confiança na automação inteira.
    const semDados = aplicarVariaveis("Olá, {{primeiroNome}}! Aqui é da {{clinica}}.", {});
    expect(semDados).not.toContain("{{");
    expect(semDados).not.toContain("}}");
  });

  it("variável ausente vira substituição que faz sentido em português", () => {
    const texto = aplicarVariaveis("Olá, {{primeiroNome}}!", { primeiroNome: null });
    expect(texto).toBe("Olá, tudo bem!");
    // E não "Olá, !", que é o que uma string vazia produziria.
    expect(texto).not.toMatch(/,\s*!/u);
  });

  it("variável desconhecida some sem deixar chave", () => {
    expect(aplicarVariaveis("Teste {{inexistente}} fim", {})).not.toContain("{{");
  });

  it("todo template do catálogo renderiza limpo com dados de exemplo", () => {
    for (const [chave, modelo] of Object.entries(TEMPLATES_PADRAO)) {
      const texto = renderizarComExemplo(modelo);
      expect(texto, chave).not.toContain("{{");
      expect(texto, chave).not.toContain("}}");
      expect(texto.trim().length, chave).toBeGreaterThan(20);
      // Sem espaço duplo nem vírgula solta: a limpeza depois da substituição
      // é o que separa "mensagem de sistema" de "mensagem de gente".
      expect(texto, chave).not.toMatch(/\s{2,}/u);
      expect(texto, chave).not.toMatch(/\s[,.]/u);
    }
  });

  it("todo template renderiza limpo TAMBÉM sem nenhuma variável", () => {
    // O caso real: paciente cadastrado sem nome completo.
    for (const [chave, modelo] of Object.entries(TEMPLATES_PADRAO)) {
      const texto = aplicarVariaveis(modelo, {});
      expect(texto, chave).not.toContain("{{");
    }
  });

  it("todo template que INICIA contato diz de quem é a mensagem", () => {
    // Mensagem de número desconhecido sem identificação é indistinguível de
    // golpe — e o paciente bloqueia o número da clínica.
    //
    // A regra vale para quem começa a conversa. Template de RESPOSTA dentro de
    // uma conversa já aberta não reapresenta a clínica: o paciente acabou de
    // escrever para ela, e repetir "aqui é da JP" soa robótico.
    const respostas = new Set(["cobranca_ja_pago"]);

    for (const [chave, modelo] of Object.entries(TEMPLATES_PADRAO)) {
      if (respostas.has(chave)) continue;
      expect(modelo, `${chave} precisa identificar a clínica`).toContain("{{clinica}}");
    }
  });

  it("todo template de cobrança oferece uma saída ao paciente", () => {
    // Cobrança sem caminho de resposta é só pressão. O que faz alguém voltar a
    // pagar é a conversa, não a insistência.
    for (const [chave, modelo] of Object.entries(TEMPLATES_PADRAO)) {
      if (!chave.startsWith("cobranca_") || chave === "cobranca_ja_pago") continue;
      expect(
        /me\s+(avisa|diga|chamar)|podemos\s+conversar|conversar|é só avisar|organizar junto/iu.test(
          modelo,
        ),
        `${chave} precisa oferecer uma saída`,
      ).toBe(true);
    }
  });

  it("nenhum template promete resultado clínico, cita preço ou pressiona", () => {
    // Item 14 do Mega Prompt (guardrails) aplicado ao texto que a clínica
    // manda por conta própria, e não só ao que a IA gera.
    const proibidos = [
      /R\$/u,
      /\bdesconto\b/iu,
      /\bpromo(ção|cao)\b/iu,
      /\bgr[áa]tis\b/iu,
      /\b(cura|garantimos|garantia de resultado)\b/iu,
      /\b(urgente|últimas vagas|ultimas vagas)\b/iu,
      /\bmedicament/iu,
    ];
    for (const [chave, modelo] of Object.entries(TEMPLATES_PADRAO)) {
      for (const padrao of proibidos) {
        expect(padrao.test(modelo), `${chave} contém termo proibido: ${String(padrao)}`).toBe(
          false,
        );
      }
    }
  });

  it("os templates de cobrança oferecem saída explícita", () => {
    // Esconder o opt-out é o que transforma automação em incômodo.
    for (const chave of ["falta_segundo_contato", "reativacao_inativo"]) {
      const modelo = TEMPLATES_PADRAO[chave] ?? "";
      expect(modelo.toLowerCase(), chave).toMatch(/n[ãa]o (quiser|receber)|é só (avisar|dizer)/u);
    }
  });
});
