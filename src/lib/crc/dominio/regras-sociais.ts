/**
 * As regras de comentário — §16, §43, §66.
 *
 * ============================================================================
 *  O §16 PROÍBE `if (texto.includes("implante"))`, e a proibição tem nome:
 *  "NÃO hardcode toda a lógica para IMPLANTE. Criar modelo de regra
 *  configurável."
 *
 *  A razão não é elegância. A clínica muda de campanha toda semana: `IMPLANTE`
 *  em setembro, `CLAREAMENTO` em outubro, `AVALIAÇÃO GRÁTIS` em novembro. Com a
 *  palavra no código, cada campanha é um deploy — e, na prática, a segunda
 *  campanha nunca ganha regra.
 * ============================================================================
 *
 * ============================================================================
 *  E O §43 PÕE O LIMITE QUE IMPORTA MAIS: NEM TODO COMENTÁRIO É LEAD.
 *
 *      "linda doutora ❤️"
 *
 *  não pode virar oportunidade de implante. Uma regra que casa qualquer
 *  comentário em qualquer post transforma elogio em fila de trabalho — e a
 *  recepção aprende a ignorar a fila.
 *
 *  Três travas, e as três precisam passar:
 *
 *    1. A PALAVRA        `contem`, e `nao_contem` veta.
 *    2. O CONTEÚDO       `exigir_captacao` — só post marcado como captação.
 *    3. A JANELA         o cooldown, que é do §17 e mora em `aplicacao/social.ts`
 *                        porque exige banco.
 * ============================================================================
 *
 * ARQUIVO PURO. É o que permite testar "linda doutora não vira lead de
 * implante" sem banco, sem rede e sem Instagram.
 */

/* -------------------------------------------------------------------------- */
/* Normalização                                                               */
/* -------------------------------------------------------------------------- */

/**
 * O texto pronto para comparar.
 *
 * ============================================================================
 *  OS DOIS LADOS PASSAM POR AQUI, e é isso que faz a comparação funcionar.
 *
 *  Normalizar só o comentário faria "IMPLANTE" cadastrado não casar com
 *  "implante" escrito — o defeito mais previsível possível. Normalizar só a
 *  regra faria o inverso.
 *
 *  O QUE SAI: acento, caixa, pontuação e emoji. O que sobra são letras,
 *  números e espaço único.
 *
 *  EMOJI SAI PORQUE ELE COLA NA PALAVRA. "quero implante🦷" tem o emoji
 *  encostado, e `includes("implante")` casaria — mas "🦷implante" com o emoji
 *  ANTES também precisa casar, e é onde a fronteira de palavra quebra sem a
 *  limpeza.
 * ============================================================================
 */
export function normalizarTextoSocial(bruto: string): string {
  return (
    bruto
      .normalize("NFD")
      // Os diacríticos combinantes: U+0300–U+036F.
      .replace(/[̀-ͯ]/gu, "")
      .toLowerCase()
      // Tudo que não é letra latina básica, dígito ou espaço vira espaço. Emoji,
      // pontuação e símbolo caem aqui.
      .replace(/[^a-z0-9\s]/gu, " ")
      .replace(/\s+/gu, " ")
      .trim()
  );
}

/* -------------------------------------------------------------------------- */
/* A regra                                                                    */
/* -------------------------------------------------------------------------- */

export type RegraSocial = {
  id: string;
  nome: string;
  /** `instagram` | `facebook` */
  canal: string;
  /** `comment.created` | `mention.created` */
  evento: string;
  /** Já normalizadas na gravação. Ver `normalizarTextoSocial`. */
  contem: readonly string[];
  /** Palavras que VETAM. "implante capilar" não é odontologia. */
  naoContem: readonly string[];
  exigirCaptacao: boolean;
  /** Mídias específicas. Vazio = qualquer uma que satisfaça `exigirCaptacao`. */
  midias: readonly string[];
  criarLead: boolean;
  criarOportunidade: boolean;
  enviarPrivateReply: boolean;
  tipoOportunidade: string | null;
  intencao: string | null;
  templateId: string | null;
  copy: string | null;
  cooldownHoras: number;
  ativa: boolean;
  clinicId: string | null;
};

export type ComentarioParaAvaliar = {
  canal: string;
  evento: string;
  texto: string;
  midiaId: string | null;
  /**
   * Este conteúdo foi marcado como CAPTAÇÃO?
   *
   * ========================================================================
   *  MARCAR É DECISÃO DE QUEM PUBLICOU, e não inferência nossa — §43.
   *
   *  A tentação é adivinhar: "tem CTA na legenda", "é um reel", "veio de
   *  anúncio". Todas erram nos dois sentidos, e o erro caro é o falso positivo:
   *  responder em privado quem comentou num post institucional é abordagem não
   *  solicitada, e a pessoa pode denunciar a conta.
   *
   *  Um post de anúncio é marcado porque alguém o marcou. Quando ninguém
   *  marcou, `false` — e a regra com `exigirCaptacao` não age. Falha fechado.
   * ========================================================================
   */
  ehCaptacao: boolean;
};

export type Casamento =
  { casou: true; regra: RegraSocial; porque: string } | { casou: false; porque: string };

/**
 * Qual regra casa com este comentário?
 *
 * ============================================================================
 *  A PRIMEIRA QUE CASA VENCE, e a ordem é a de chegada da lista.
 *
 *  Não é sorteio nem "a mais específica": é determinismo. Duas regras que casam
 *  o mesmo comentário produziriam dois leads e dois directs se ambas agissem, e
 *  escolher "a melhor" exigiria um critério de especificidade que ninguém
 *  consegue explicar na tela.
 *
 *  Quem ordena é o chamador, e ele ordena por clínica antes de organização —
 *  mesma herança de `crc_autonomia`. A regra da unidade vence a da rede.
 * ============================================================================
 */
export function casarRegra(
  comentario: ComentarioParaAvaliar,
  regras: readonly RegraSocial[],
): Casamento {
  const texto = normalizarTextoSocial(comentario.texto);

  if (texto.length === 0) {
    /*
     * COMENTÁRIO SEM TEXTO — um emoji só, ou uma menção sem conteúdo.
     *
     * Não casa nada, e é o certo: não há intenção legível. Um `❤️` solto não é
     * pedido de orçamento, e a menção chega da Meta literalmente sem texto (ver
     * `daMencao` no normalizador).
     */
    return { casou: false, porque: "O comentário não tem texto legível." };
  }

  const candidatas = regras.filter((r) => r.ativa);
  if (candidatas.length === 0) {
    return { casou: false, porque: "Nenhuma regra social ativa nesta organização." };
  }

  let ultimoPorque = "Nenhuma regra ativa casou com este comentário.";

  for (const regra of candidatas) {
    if (regra.canal !== comentario.canal) continue;
    if (regra.evento !== comentario.evento) continue;

    if (regra.exigirCaptacao && !comentario.ehCaptacao) {
      ultimoPorque =
        "A regra só vale em conteúdo marcado como captação, e este post não está marcado.";
      continue;
    }

    if (regra.midias.length > 0) {
      if (comentario.midiaId === null || !regra.midias.includes(comentario.midiaId)) {
        ultimoPorque = "A regra vale só para mídias específicas, e esta não está na lista.";
        continue;
      }
    }

    const vetada = regra.naoContem.find((p) => contemPalavra(texto, p));
    if (vetada !== undefined) {
      /*
       * O VETO É DITO NO PORQUÊ, e ele é útil de verdade.
       *
       * "implante capilar" é o caso real: a clínica é odontológica, o comentário
       * fala de implante, e a regra de implante dentário NÃO deve casar. Sem o
       * motivo registrado, alguém olharia o comentário na tela e não entenderia
       * por que nada aconteceu — e provavelmente responderia à mão.
       */
      ultimoPorque = `A regra "${regra.nome}" foi vetada pela palavra "${vetada}".`;
      continue;
    }

    if (regra.contem.length === 0) {
      /*
       * REGRA SEM PALAVRA NENHUMA NÃO CASA NADA, e a recusa é deliberada.
       *
       * Uma lista vazia lida como "casa tudo" transformaria uma regra
       * incompleta — criada e ainda sem palavras — num respondedor automático
       * de qualquer comentário. O caminho do esquecimento tem que levar ao
       * seguro; é a mesma regra das flags e da autonomia.
       */
      ultimoPorque = `A regra "${regra.nome}" não tem nenhuma palavra cadastrada.`;
      continue;
    }

    const casada = regra.contem.find((p) => contemPalavra(texto, p));
    if (casada === undefined) {
      ultimoPorque = `A regra "${regra.nome}" não encontrou nenhuma das palavras dela.`;
      continue;
    }

    return {
      casou: true,
      regra,
      porque: `A regra "${regra.nome}" casou pela palavra "${casada}".`,
    };
  }

  return { casou: false, porque: ultimoPorque };
}

/**
 * A palavra (ou expressão) está no texto?
 *
 * ============================================================================
 *  FRONTEIRA DE PALAVRA, E NÃO `includes` — e a diferença tem caso real.
 *
 *  `"implante".includes` casaria dentro de "implantesss" (bom) e dentro de
 *  "reimplantei" (ruim, mas raro). O caso que importa é o inverso, e é comum:
 *
 *      palavra cadastrada:  "dor"
 *      comentário:          "adorei o resultado!"
 *
 *  `includes("dor")` casa em "adorei". Uma regra de urgência disparando em
 *  elogio — e, com private reply ligado, a clínica manda direct perguntando da
 *  dor de quem estava elogiando.
 *
 *  A EXPRESSÃO COM ESPAÇO É COMPARADA INTEIRA: "quero implante" exige as duas
 *  palavras na ordem. É como a clínica escreve a regra, e quebrar em palavras
 *  soltas faria "quero clarear e vi um implante" casar.
 * ============================================================================
 */
export function contemPalavra(textoNormalizado: string, palavraBruta: string): boolean {
  const palavra = normalizarTextoSocial(palavraBruta);
  if (palavra.length === 0) return false;

  // O texto e a palavra já estão normalizados: letras, dígitos e espaço único.
  // Cercar os dois com espaço transforma "contém palavra inteira" numa busca de
  // substring — sem regex, sem escape, e sem custo de compilação por palavra.
  return ` ${textoNormalizado} `.includes(` ${palavra} `);
}

/* -------------------------------------------------------------------------- */
/* A chave de cooldown — §17                                                  */
/* -------------------------------------------------------------------------- */

/**
 * A chave que impede dez directs para quem comentou dez vezes.
 *
 * ============================================================================
 *  A CHAVE NÃO É O ID DO COMENTÁRIO, e essa é a parte que se erra.
 *
 *  Dedupe por comentário deixaria a mesma pessoa receber dez directs
 *  comentando dez vezes no mesmo post: cada comentário tem id próprio, e cada
 *  um passaria pela trava.
 *
 *  A chave é `regra + ator + mídia + janela`:
 *
 *    REGRA    regras diferentes podem falar de coisas diferentes, e é legítimo
 *             a pessoa receber sobre implante e, semanas depois, sobre
 *             clareamento.
 *
 *    ATOR     a pessoa. É o eixo do anti-spam.
 *
 *    MÍDIA    comentar em DOIS posts de captação diferentes é duas intenções.
 *             Sem a mídia na chave, a segunda campanha não alcançaria quem
 *             respondeu à primeira.
 *
 *    JANELA   o número do balde de cooldown. Passado o cooldown, o balde muda e
 *             a pessoa pode ser respondida de novo — que é o comportamento
 *             certo: comentário novo é convite novo.
 * ============================================================================
 *
 * O BALDE É ABSOLUTO E NÃO RELATIVO, e isso é deliberado: `floor(agora /
 * janela)` produz a mesma chave para dois eventos próximos sem precisar ler o
 * evento anterior. Uma janela deslizante — "houve envio nos últimos 7 dias?" —
 * exigiria uma CONSULTA antes de reservar, e consulta antes de escrever é
 * exatamente a corrida que a reserva no banco existe para eliminar.
 *
 * O preço é uma borda: quem comenta no fim de um balde pode ser respondido de
 * novo no começo do seguinte. Com cooldown de 7 dias, isso é uma segunda
 * mensagem em até 7 dias em vez de exatamente 7 — e o custo disso é muito menor
 * que o de uma corrida que manda duas mensagens no mesmo segundo.
 */
export function chaveDeCooldown(p: {
  regraId: string;
  atorId: string;
  midiaId: string | null;
  cooldownHoras: number;
  agora: Date;
}): string {
  const horas = Math.max(0, p.cooldownHoras);

  /*
   * COOLDOWN ZERO = SEM COOLDOWN, e a chave passa a ser única por comentário.
   *
   * Nesse caso a reserva ainda protege contra a reentrega do MESMO webhook —
   * que é o que a Meta faz quando não recebe 200 rápido — mas não impede a
   * pessoa de ser respondida a cada comentário novo. É a configuração que uma
   * clínica escolhe conscientemente, e o campo permite escolher.
   */
  const janela =
    horas === 0 ? p.agora.getTime() : Math.floor(p.agora.getTime() / (horas * 3_600_000));

  return [p.regraId, p.atorId, p.midiaId ?? "sem-midia", String(janela)].join(":");
}

/* -------------------------------------------------------------------------- */
/* A copy padrão — §67                                                        */
/* -------------------------------------------------------------------------- */

/**
 * A copy inicial do private reply, quando a regra não traz uma.
 *
 * ============================================================================
 *  ELA É SEGURA POR CONSTRUÇÃO, e cada ausência é uma decisão:
 *
 *    NÃO DIAGNOSTICA       não menciona condição, sintoma nem tratamento
 *                          indicado. O §29 é absoluto: a IA e a automação não
 *                          dão diagnóstico, e uma copy que diz "vi que você
 *                          precisa de implante" é diagnóstico.
 *
 *    NÃO PROMETE PREÇO     "a partir de R$ X" numa mensagem automática é oferta
 *                          sem avaliação, e o §4.4 proíbe preço clínico
 *                          individual sem regra cadastrada.
 *
 *    NÃO AFIRMA RESULTADO  nada de "você vai amar". É publicidade de resultado
 *                          em saúde, e isso tem regra de conselho.
 *
 *  O QUE ELA FAZ: reconhece o comentário, se oferece para ajudar com
 *  INFORMAÇÃO, e devolve a palavra para a pessoa. É um convite a conversar, e
 *  é isso que abre a janela de 24 horas para uma pessoa de verdade atender.
 * ============================================================================
 *
 * EDITÁVEL É REQUISITO (§67): a clínica troca a copy na tela, e a versionada
 * passa por `crc_templates`. Esta constante é só o ponto de partida.
 */
export const COPY_PADRAO_PRIVATE_REPLY =
  "Oi! Vi seu comentário e posso te ajudar com as informações sobre a avaliação. " +
  "Se quiser, me conta por aqui o que você está buscando 🙂";
