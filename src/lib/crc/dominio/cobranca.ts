/**
 * As regras de cobrança.
 *
 * ESTE ARQUIVO TEM UM LIMITE QUE OS OUTROS NÃO TÊM.
 *
 * O art. 42 do Código de Defesa do Consumidor diz que o consumidor inadimplente
 * "não será exposto a ridículo, nem será submetido a qualquer tipo de
 * constrangimento ou ameaça". Isso não é contexto de fundo — é restrição de
 * desenho, e as funções abaixo existem em boa parte para cumpri-la:
 *
 *   TETO RÍGIDO DE TENTATIVAS. Cobrança automatizada para em três contatos e
 *   vira tarefa humana. Insistir além disso é o que a lei chama de
 *   constrangimento, e nenhuma taxa de recuperação justifica.
 *
 *   ESPAÇAMENTO MAIOR QUE O NORMAL. As outras jornadas usam o cooldown padrão;
 *   cobrança usa um próprio, mais largo. Uma mensagem por dia sobre dívida é
 *   assédio mesmo estando dentro do limite geral do sistema.
 *
 *   NUNCA A TERCEIROS. Não há caminho no sistema que mande cobrança para
 *   telefone que não seja o do próprio devedor — e quando o telefone casa com
 *   dois pacientes, a cobrança é BLOQUEADA em vez de escolher um.
 *
 *   NEGOCIAÇÃO HUMANA ENCERRA A AUTOMAÇÃO. Quando o paciente pede para tratar
 *   com a clínica, a automação para e não volta sozinha.
 *
 * O TOM TAMBÉM É REGRA, e `violacoesDeCobranca` no fim do arquivo o transforma
 * em verificação executável — que roda também quando alguém edita um template
 * pela tela, e não só na suíte de testes.
 *
 * Tudo aqui é função pura sobre dados já carregados: o "agora" entra como
 * argumento, como no resto do domínio.
 */

/** Quantos contatos automáticos, no máximo, por cobrança. Ver o cabeçalho. */
export const MAX_CONTATOS_COBRANCA = 3;

/** Horas mínimas entre dois contatos sobre a MESMA dívida. */
export const COOLDOWN_COBRANCA_HORAS = 72;

export type StatusCobranca =
  "ABERTA" | "PAGA" | "PARCIAL" | "RENEGOCIADA" | "CANCELADA" | "INCOBRAVEL";

export type ContextoCobranca = {
  status: StatusCobranca;
  /** `YYYY-MM-DD`. */
  vencimentoEm: string;
  valor: string;
  valorPago: string;
  tentativasContato: number;
  /** ISO, ou `null` se nunca contatamos sobre esta cobrança. */
  ultimoContatoEm: string | null;
  negociacaoHumana: boolean;
  optOut: boolean;
  temTelefone: boolean;
};

/**
 * A fase da cobrança.
 *
 * A distinção existe porque o TOM muda em cada uma, e usar o tom errado é o
 * erro mais caro deste módulo:
 *
 *   A_VENCER  — lembrete gentil. Ainda não há dívida; há um compromisso.
 *   RECENTE   — até 7 dias. Quase sempre é esquecimento, e tratar como
 *               inadimplência ofende quem simplesmente não viu o boleto.
 *   ATRASADA  — 8 a 60 dias. Aqui a conversa é sobre resolver.
 *   ANTIGA    — mais de 60 dias. A automação não fala mais: vira tarefa
 *               humana, porque nesse ponto o assunto é negociação, e
 *               negociação por mensagem automática não funciona nem é justa.
 */
export type FaseCobranca = "A_VENCER" | "RECENTE" | "ATRASADA" | "ANTIGA";

export const DIAS_COBRANCA_RECENTE = 7;
export const DIAS_COBRANCA_ANTIGA = 60;

export function diasDeAtraso(vencimentoEm: string, agora: Date): number {
  const venc = Date.parse(`${vencimentoEm}T12:00:00.000Z`);
  if (!Number.isFinite(venc)) return 0;
  // Meio-dia dos dois lados de propósito: comparar meia-noite com o "agora"
  // faz uma cobrança vencida hoje aparecer como um dia de atraso conforme o
  // fuso, e o tom da mensagem mudaria por causa disso.
  const hoje = Date.parse(`${agora.toISOString().slice(0, 10)}T12:00:00.000Z`);
  return Math.round((hoje - venc) / 86_400_000);
}

export function faseDaCobranca(vencimentoEm: string, agora: Date): FaseCobranca {
  const dias = diasDeAtraso(vencimentoEm, agora);
  if (dias < 0) return "A_VENCER";
  if (dias <= DIAS_COBRANCA_RECENTE) return "RECENTE";
  if (dias <= DIAS_COBRANCA_ANTIGA) return "ATRASADA";
  return "ANTIGA";
}

/** Quanto ainda falta. Em centavos inteiros, para não perder no float. */
export function saldoDevedor(valor: string, valorPago: string): string {
  const centavos =
    Math.round((Number.parseFloat(valor) || 0) * 100) -
    Math.round((Number.parseFloat(valorPago) || 0) * 100);
  return (Math.max(0, centavos) / 100).toFixed(2);
}

export type VeredictoCobranca =
  | { pode: true; fase: FaseCobranca; diasAtraso: number; saldo: string }
  | { pode: false; motivo: string; exigeHumano: boolean };

/**
 * A automação pode falar sobre esta cobrança agora?
 *
 * A ORDEM DAS RECUSAS é deliberada: primeiro o que encerra o assunto (paga,
 * cancelada), depois o que exige humano (negociação, teto de tentativas,
 * atraso antigo), por último o que só adia (cooldown).
 *
 * `exigeHumano` importa mais que `pode`. Ele distingue "não fale agora" de
 * "isto não é mais trabalho de automação" — e é o que garante que uma dívida
 * antiga não seja simplesmente esquecida por ninguém poder mandar mensagem
 * sobre ela.
 */
export function podeCobrar(ctx: ContextoCobranca, agora: Date): VeredictoCobranca {
  if (ctx.status === "PAGA") {
    return { pode: false, motivo: "Cobrança já quitada.", exigeHumano: false };
  }
  if (ctx.status === "CANCELADA" || ctx.status === "RENEGOCIADA") {
    return {
      pode: false,
      motivo: "Cobrança encerrada por acordo ou cancelamento.",
      exigeHumano: false,
    };
  }
  if (ctx.status === "INCOBRAVEL") {
    return { pode: false, motivo: "Cobrança marcada como incobrável.", exigeHumano: false };
  }

  const saldo = saldoDevedor(ctx.valor, ctx.valorPago);
  if (Number.parseFloat(saldo) <= 0) {
    // O status pode estar desatualizado em relação ao valor pago — o arquivo
    // do financeiro nem sempre chega junto. O saldo manda, porque continuar
    // cobrando quem já pagou é o erro que mais destrói confiança.
    return { pode: false, motivo: "Não há saldo em aberto.", exigeHumano: false };
  }

  if (ctx.negociacaoHumana) {
    return { pode: false, motivo: "Um atendente está negociando esta dívida.", exigeHumano: false };
  }

  if (!ctx.temTelefone) {
    return { pode: false, motivo: "Paciente sem telefone.", exigeHumano: true };
  }

  // OPT-OUT NÃO APAGA A DÍVIDA, e por isso aqui ele exige humano em vez de
  // encerrar. O paciente tem direito de não receber mensagem; a clínica tem
  // direito de receber. As duas coisas convivem por telefone ou pessoalmente.
  if (ctx.optOut) {
    return {
      pode: false,
      motivo: "Paciente pediu para não receber mensagens; cobre por outro canal.",
      exigeHumano: true,
    };
  }

  const fase = faseDaCobranca(ctx.vencimentoEm, agora);

  if (fase === "ANTIGA") {
    return {
      pode: false,
      motivo: "Atraso longo demais para mensagem automática; isto é negociação.",
      exigeHumano: true,
    };
  }

  if (ctx.tentativasContato >= MAX_CONTATOS_COBRANCA) {
    // O teto do art. 42. Não é preferência de produto.
    return {
      pode: false,
      motivo: `Já foram ${String(ctx.tentativasContato)} contatos automáticos sobre esta cobrança.`,
      exigeHumano: true,
    };
  }

  if (ctx.ultimoContatoEm !== null) {
    const t = Date.parse(ctx.ultimoContatoEm);
    if (Number.isFinite(t)) {
      const horas = (agora.getTime() - t) / 3_600_000;
      if (horas < COOLDOWN_COBRANCA_HORAS) {
        return {
          pode: false,
          motivo: "Falamos sobre esta cobrança há pouco tempo.",
          exigeHumano: false,
        };
      }
    }
  }

  return { pode: true, fase, diasAtraso: diasDeAtraso(ctx.vencimentoEm, agora), saldo };
}

/**
 * O template certo para a fase.
 *
 * Separado da decisão de PODER cobrar de propósito: são duas perguntas
 * diferentes, e misturá-las faria um refinamento no tom acabar mudando quem
 * recebe mensagem.
 */
export function templateDaFase(fase: FaseCobranca): string {
  switch (fase) {
    case "A_VENCER":
      return "cobranca_lembrete";
    case "RECENTE":
      return "cobranca_recente";
    case "ATRASADA":
      return "cobranca_atrasada";
    case "ANTIGA":
      // Não deveria chegar aqui — `podeCobrar` bloqueia antes. O retorno existe
      // para o switch ser exaustivo, e aponta para a mensagem mais cuidadosa.
      return "cobranca_atrasada";
    default: {
      const exaustivo: never = fase;
      void exaustivo;
      return "cobranca_recente";
    }
  }
}

/* -------------------------------------------------------------------------- */
/* Normalização                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Tira acento e caixa. Toda comparação de texto deste arquivo passa por aqui.
 *
 * DUAS RAZÕES, e a segunda custou caro para ser descoberta:
 *
 *   1. ROBUSTEZ REAL. No WhatsApp as pessoas escrevem "divida", "juridico",
 *      "nao consigo" e "ultimo aviso" sem acento o tempo todo. Um padrão que só
 *      pega a forma acentuada deixa passar justamente o texto mais provável.
 *
 *   2. COMPOSIÇÃO UNICODE. "í" pode ser um caractere (U+00ED) ou dois (i +
 *      acento combinante). As duas formas são visualmente idênticas e NÃO casam
 *      entre si num regex — inclusive dentro de uma classe como `[íi]`.
 *      Normalizar a entrada elimina a classe inteira do problema; tratar acento
 *      a acento nos padrões produz uma guarda que parece funcionar e não
 *      funciona, que é pior do que não ter guarda nenhuma.
 *
 * Com a entrada normalizada, TODO padrão abaixo é ASCII puro e não precisa dos
 * flags `i` nem `u`.
 */
function paraComparacao(texto: string): string {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/* -------------------------------------------------------------------------- */
/* Leitura da resposta do paciente                                            */
/* -------------------------------------------------------------------------- */

/**
 * O paciente está pedindo para negociar?
 *
 * Detectado por regra, ANTES da IA, pelo mesmo motivo do opt-out: o custo dos
 * erros é assimétrico. Continuar a automação com alguém que já pediu para
 * conversar é exatamente o comportamento que o art. 42 proíbe.
 */
const PADROES_NEGOCIACAO: readonly RegExp[] = [
  /parcel|dividir|negoci|acordo|renegoci/,
  /nao\s+(tenho|posso|consigo)(\s+\w+)?\s+pagar/,
  /sem\s+condicoes|apertado|desempregad|dificil\s+agora/,
  /pagar\s+(depois|semana que vem|mes que vem|no mes que vem)/,
  /posso\s+pagar\s+(semana|mes|dia)/,
  /fal(ar|o)\s+com\s+(voces|a\s+clinica)/,
  /desconto|abatimento/,
];

export function pedeNegociacao(texto: string): boolean {
  const limpo = paraComparacao(texto).trim();
  if (limpo.length === 0) return false;
  return PADROES_NEGOCIACAO.some((p) => p.test(limpo));
}

/**
 * O paciente diz que já pagou?
 *
 * Este caso é urgente e tem tratamento próprio: continuar cobrando quem já
 * pagou é o erro que mais destrói confiança, e o arquivo do financeiro
 * frequentemente chega ao CRC com um ou dois dias de atraso. Quando isto
 * dispara, a automação para NA HORA e alguém confere — em vez de esperar a
 * próxima importação.
 */
const PADROES_JA_PAGUEI: readonly RegExp[] = [
  /ja\s+(paguei|foi\s+pago|quitei|pago|esta\s+pago)/,
  /paguei\s+(ontem|hoje|semana passada|no\s+dia|essa semana)/,
  /comprovante|comprovei|mandei\s+o\s+pix|enviei\s+o\s+pix/,
  /ta\s+pago|esta\s+pago/,
];

export function afirmaQueJaPagou(texto: string): boolean {
  const limpo = paraComparacao(texto).trim();
  if (limpo.length === 0) return false;
  return PADROES_JA_PAGUEI.some((p) => p.test(limpo));
}

/* -------------------------------------------------------------------------- */
/* Guarda de linguagem (art. 42 do CDC)                                       */
/* -------------------------------------------------------------------------- */

/**
 * Termos que transformam cobrança em constrangimento ou ameaça.
 *
 * Cada linha é uma forma comum de violar o art. 42 — e nenhuma delas ajuda a
 * receber:
 *
 *   PROTESTO, NEGATIVAÇÃO, SPC, SERASA, CARTÓRIO, JURÍDICO → ameaça.
 *   ÚLTIMO AVISO, PRAZO FINAL → pressão com prazo inventado.
 *   JUROS, MULTA → discussão que precisa de humano e do contrato à mão.
 *   VALOR EM REAIS → o WhatsApp pode ser lido por outra pessoa na tela de
 *     bloqueio. Dizer quanto alguém deve ali é exposição, e não acrescenta
 *     nada: quem deve já sabe quanto deve.
 *   DÍVIDA, INADIMPLENTE, DEVEDOR → rótulo. "Parcela em aberto" diz a mesma
 *     coisa sem carimbar ninguém.
 *
 * Os padrões são ASCII porque a entrada é normalizada. Ver `paraComparacao`.
 */
const TERMOS_PROIBIDOS: readonly { padrao: RegExp; motivo: string }[] = [
  { padrao: /protesto/, motivo: "menciona protesto (ameaça)" },
  { padrao: /negativa(r|cao|do|da)/, motivo: "menciona negativação (ameaça)" },
  { padrao: /serasa/, motivo: "menciona Serasa (ameaça)" },
  { padrao: /\bspc\b/, motivo: "menciona SPC (ameaça)" },
  { padrao: /cartorio/, motivo: "menciona cartório (ameaça)" },
  { padrao: /juridic/, motivo: "menciona setor jurídico (ameaça)" },
  { padrao: /juros/, motivo: "menciona juros (assunto para humano)" },
  { padrao: /multa/, motivo: "menciona multa (assunto para humano)" },
  { padrao: /ultimo\s+aviso/, motivo: 'usa "último aviso" (pressão)' },
  { padrao: /prazo\s+final/, motivo: 'usa "prazo final" (pressão)' },
  { padrao: /divida/, motivo: 'usa a palavra "dívida" (rótulo)' },
  { padrao: /inadimpl/, motivo: 'usa "inadimplente" (rótulo)' },
  { padrao: /devedor/, motivo: 'usa "devedor" (rótulo)' },
  { padrao: /r\$\s*\d/, motivo: "expõe o valor devido na mensagem" },
];

/**
 * Confere um texto de cobrança contra o art. 42.
 *
 * NÃO É SÓ TESTE. Ela roda quando alguém salva um template pela tela: o item
 * 228 pede aprovação de template, e o mínimo que uma aprovação precisa fazer é
 * recusar o que a lei proíbe. Uma verificação que só existisse na suíte
 * deixaria passar tudo que fosse escrito depois do deploy.
 *
 * Devolve a lista de motivos — vazia quando o texto está limpo. Lista, e não
 * booleano, porque quem escreveu precisa saber O QUE corrigir.
 */
export function violacoesDeCobranca(texto: string): string[] {
  const normalizado = paraComparacao(texto);
  const encontradas: string[] = [];
  for (const termo of TERMOS_PROIBIDOS) {
    if (termo.padrao.test(normalizado)) encontradas.push(termo.motivo);
  }
  return encontradas;
}

/**
 * O texto oferece um caminho de resposta ao paciente?
 *
 * Cobrança sem saída é só pressão. O que faz alguém voltar a pagar é a
 * conversa — e é também o que separa cobrança legítima de constrangimento.
 */
export function ofereceSaida(texto: string): boolean {
  const normalizado = paraComparacao(texto);
  return /me\s+(avisa|avise|diga|chama|chamar)|podemos\s+conversar|conversar|so\s+avisar|organizar\s+junto|entrar\s+em\s+contato/.test(
    normalizado,
  );
}
