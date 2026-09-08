/**
 * O motor de sinais determinístico.
 *
 * O dono da clínica pediu que a IA "sinalizasse tudo". Este arquivo é a parte do
 * "tudo" que dá para PROVAR: cada sinal daqui sai de um número que o código
 * calculou ou de um campo que o documento traz (ou não traz). Nada aqui depende
 * de o modelo estar de bom humor — e é por isso que estes sinais são os que a
 * clínica pode levar para uma conversa difícil sem medo.
 *
 * O que o modelo acrescenta por cima (origem "ia") é interpretação: se a
 * experiência serve, se a trajetória convence, o que perguntar. Interpretação é
 * o trabalho dele; conta de data é o nosso.
 *
 * Puro de propósito: `agora` entra por parâmetro e não há I/O nenhum, porque
 * este arquivo é importado tanto pelo servidor quanto pelas telas do painel.
 */
import { apenasDigitos } from "../formatar";
import type { AreaVaga } from "../tipos";
import { emAnosMeses, paraMes } from "./metricas";
import { classificarProximidade } from "./proximidade";
import { tetoPorDeslocamento, tetoPorGraduacaoEmSaude, tetoPorRotatividade } from "./rubricas";
import type { ExtracaoCurriculo, MetricasPermanencia, SeveridadeSinal, Sinal } from "./tipos";
import { severidadePor } from "./tipos";

/**
 * Minúsculo, sem acento, sem espaço duplo, sem pontuação.
 *
 * É o que permite reconhecer "Maria José da Silva" e "MARIA JOSE DA SILVA"
 * como a mesma pessoa quando o RH importa a mesma pasta de currículos duas
 * vezes — que é exatamente como o acervo da clínica costuma chegar.
 */
export function normalizarNome(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Preposições que não ajudam a identificar ninguém: "de", "da", "dos"... */
const PARTICULAS = new Set(["de", "da", "do", "das", "dos", "e", "di", "del", "van", "von"]);

/**
 * Primeiro nome + último sobrenome, ignorando partículas e nomes do meio.
 *
 * O nome do meio é o que mais varia entre um currículo e um formulário do site
 * ("Ana Paula Souza Lima" x "Ana Lima"), então comparar as pontas pega o
 * duplicado real sem transformar duas Anas diferentes na mesma pessoa.
 */
function pontasDoNome(nome: string): string {
  const partes = normalizarNome(nome)
    .split(" ")
    .filter((p) => p.length > 1 && !PARTICULAS.has(p));
  const primeiro = partes[0] ?? "";
  const ultimo = partes.length > 1 ? (partes[partes.length - 1] ?? "") : "";
  return ultimo ? `${primeiro} ${ultimo}` : primeiro;
}

/**
 * Idade em anos a partir do que o documento trouxer.
 *
 * Aceita "AAAA-MM-DD", "AAAA-MM" e "AAAA" porque currículo escrito à mão traz
 * as três formas. Quando só há o ano, `paraMes` assume janeiro e a idade sai um
 * pouco MAIOR — o que é o lado seguro: idade maior torna o alerta de
 * incoerência menos provável, e este é um alerta que não pode disparar à toa.
 */
function idadeEmAnos(extracao: ExtracaoCurriculo, agora: Date): number | null {
  if (extracao.idadeDeclarada != null && extracao.idadeDeclarada > 0) {
    return extracao.idadeDeclarada;
  }
  const nascimento = paraMes(extracao.nascimento, false);
  if (nascimento == null) return null;
  const mesAgora = agora.getUTCFullYear() * 12 + agora.getUTCMonth();
  const anos = Math.floor((mesAgora - nascimento) / 12);
  return anos > 0 && anos < 110 ? anos : null;
}

type EntradaSinais = {
  extracao: ExtracaoCurriculo;
  metricas: MetricasPermanencia;
  area: AreaVaga;
  agora: Date;
  /** Candidaturas já no acervo, para detectar reenvio da mesma pessoa. */
  nomesJaExistentes?: { nome: string; telefone: string; id: string }[];
};

/* Só nível de CURSO, nunca "medio": ensino médio marcado como em andamento
   quase sempre quer dizer ensino médio INCOMPLETO de quem parou de estudar há
   anos — não alguém em aula hoje. Sem este recorte o alerta disparava para quem
   não estuda, que é o oposto do que ele existe para avisar. */
const NIVEIS_DE_CURSO = ["superior", "tecnico", "pos"];

/** As formações que a pessoa está cursando AGORA. Vira evidência do sinal. */
function formacoesEmCurso(e: ExtracaoCurriculo): ExtracaoCurriculo["formacoes"] {
  return e.formacoes.filter(
    (f) => f.emAndamento && f.curso.trim() !== "" && NIVEIS_DE_CURSO.includes(f.nivel),
  );
}

/**
 * "Esta pessoa está cursando faculdade ou técnico?" — a regra, em um lugar só.
 *
 * Existe exportada porque o FILTRO do painel precisa da mesma resposta que o
 * sinal, e não podia lê-la do sinal gravado: `analise.sinais` é um retrato do
 * dia em que a leitura rodou. Quando a regra mudou (ensino médio deixou de
 * contar), os retratos antigos não mudaram junto — e o filtro, se olhasse para
 * eles, diria "2 estudando" onde a extração mostra 15. A extração é dado bruto
 * do currículo e não envelhece; a regra, aplicada por cima dela, sempre
 * responde pelo critério de hoje.
 *
 * `area` entra porque em vaga de estágio estar cursando é pré-requisito, não
 * alerta — e vale a área ATUAL da ficha, inclusive se o RH reclassificou.
 */
export function cursandoAgora(e: ExtracaoCurriculo, area: AreaVaga): boolean {
  if (area === "estagio") return false;
  return formacoesEmCurso(e).length > 0;
}

export function sinaisDeCalculo(entrada: EntradaSinais): Sinal[] {
  const { extracao: e, metricas: m, area, agora } = entrada;
  const sinais: Sinal[] = [];
  const ehEstagio = area === "estagio";

  /* ---------------------------------------------------------------------- */
  /* Estudo em andamento                                                    */
  /* ---------------------------------------------------------------------- */

  /*
   * Faculdade ou curso técnico em curso é ALERTA AMARELO, nunca reprovação, e
   * NUNCA pesa na nota (contaNaNota: false).
   *
   * O que a clínica precisa saber é se o horário da aula bate com o expediente
   * de 8h às 18h — e isso o currículo não diz: ele traz o curso, quase nunca o
   * turno. Descontar pontos aqui seria punir quem estuda por uma informação que
   * ninguém escreveu, e numa vaga de recepção isso elimina justamente a
   * candidata jovem e em formação.
   *
   * Por isso o sinal existe para VIRAR PERGUNTA. A resposta só aparece na
   * conversa, e é lá que ela vale.
   *
   * Estágio fica de fora: ali estar cursando é pré-requisito, não alerta.
   */
  const emCurso = formacoesEmCurso(e);
  if (!ehEstagio && emCurso.length > 0) {
    sinais.push({
      chave: "estudo-em-andamento",
      origem: "calculo",
      severidade: "medio",
      categoria: "coerencia",
      titulo:
        emCurso.length === 1
          ? "Está estudando"
          : `Está estudando (${String(emCurso.length)} cursos)`,
      detalhe:
        "O currículo traz formação em andamento. Não é problema por si — mas a clínica atende das 8h às 18h, e o currículo não informa o turno das aulas. Confirme o horário antes de seguir; se for noturno ou a distância, não há conflito nenhum.",
      evidencias: emCurso.map((f) =>
        [f.curso, f.instituicao].filter((x) => x.trim() !== "").join(" — "),
      ),
      perguntar:
        "Você está cursando algo agora? Qual curso, em que semestre e em que horário são as aulas?",
      contaNaNota: false,
    });
  }

  /* ---------------------------------------------------------------------- */
  /* Documento                                                              */
  /* ---------------------------------------------------------------------- */

  if (!e.documentoValido) {
    sinais.push({
      chave: "documento-invalido",
      origem: "documento",
      severidade: "critico",
      categoria: "documento",
      titulo: "Isto não parece ser um currículo",
      detalhe: `A leitura identificou o arquivo como "${e.tipoDocumento || "documento não identificado"}". Nenhuma nota abaixo deve ser levada a sério antes de conferir o arquivo original.`,
      evidencias: [`Tipo identificado: ${e.tipoDocumento || "desconhecido"}`],
      perguntar: "Confirmar com a pessoa se ela enviou o arquivo certo.",
      contaNaNota: true,
    });
  }

  if (e.legibilidade < 50) {
    sinais.push({
      chave: "ilegivel",
      origem: "documento",
      severidade: "alto",
      categoria: "documento",
      titulo: "Documento difícil de ler",
      detalhe: `A legibilidade ficou em ${e.legibilidade}/100. Parte do que está escrito pode não ter sido capturada, então a ausência de uma informação aqui não prova que ela não está no currículo.`,
      evidencias: e.observacoesDoLeitor.length
        ? e.observacoesDoLeitor
        : [`Legibilidade ${e.legibilidade}/100`],
      perguntar: "Pedir o currículo em PDF ou uma foto mais nítida antes de descartar.",
      contaNaNota: true,
    });
  }

  /* ---------------------------------------------------------------------- */
  /* Permanência                                                            */
  /* ---------------------------------------------------------------------- */

  if (m.totalEmpregos === 0) {
    sinais.push({
      chave: "sem-experiencia",
      origem: "calculo",
      severidade: ehEstagio ? "medio" : "alto",
      categoria: "permanencia",
      titulo: "Nenhum emprego listado",
      detalhe: ehEstagio
        ? "O currículo não lista experiência profissional — o que é esperado em vaga de estágio. Vale perguntar por trabalho informal, negócio da família ou voluntariado."
        : "O currículo não lista nenhum emprego. Pode ser primeiro emprego, pode ser página faltando: os dois casos se resolvem com uma pergunta.",
      evidencias: ["Nenhum vínculo profissional encontrado no documento"],
      perguntar: "Você já trabalhou antes, mesmo sem registro em carteira? Conte como foi.",
      contaNaNota: true,
    });
  }

  if (m.empregosSemData > 0) {
    const plural = m.empregosSemData > 1;
    sinais.push({
      chave: "sem-datas",
      origem: "calculo",
      severidade: "alto",
      categoria: "permanencia",
      titulo: `${m.empregosSemData} ${plural ? "empregos sem período" : "emprego sem período"}`,
      detalhe: `${plural ? "Esses vínculos ficaram" : "Esse vínculo ficou"} de fora de toda a conta de permanência, porque o currículo não informa quando começou nem quando terminou. Isso NÃO é sinal de rotatividade nem de estabilidade — é informação que falta.`,
      evidencias: m.linhaDoTempo
        .filter((t) => !t.de)
        .map(
          (t) => `${t.cargo || "cargo não informado"} — ${t.empresa || "empresa não informada"}`,
        ),
      perguntar: "De que mês a que mês você ficou em cada um desses empregos?",
      contaNaNota: true,
    });
  }

  if (m.mesesUltimoEmprego != null && m.mesesUltimoEmprego < 12) {
    const meses = m.mesesUltimoEmprego;
    const ultimo = m.ultimoEmprego;
    const onde = ultimo
      ? `${ultimo.cargo || "cargo não informado"} — ${ultimo.empresa || "empresa não informada"}`
      : "último vínculo";
    // A gravidade sobe conforme o tempo cai, mas em vaga de estágio ela desce
    // um degrau inteiro: passagem curta aos 19 anos é o normal da idade, e a
    // rubrica de estágio manda dizer isso com todas as letras. Continuar
    // marcando como "crítico" faria a tela contradizer o próprio prompt.
    const severidade = ehEstagio ? "baixo" : meses < 4 ? "critico" : meses < 6 ? "alto" : "medio";
    sinais.push({
      chave: "ultimo-curto",
      origem: "calculo",
      severidade,
      categoria: "permanencia",
      titulo: `Último emprego durou ${emAnosMeses(meses)}`,
      detalhe: ehEstagio
        ? `Ficou ${emAnosMeses(meses)} no último vínculo. Em vaga de estágio isso é esperado: contrato temporário, jovem aprendiz e emprego largado para voltar a estudar são trajetória normal nessa faixa de idade.`
        : `Ficou ${emAnosMeses(meses)} em ${onde}. Contrato temporário, empresa que fechou e experiência que não deu certo explicam permanência curta — mas é o primeiro assunto da entrevista.`,
      evidencias: [
        `${onde}: ${emAnosMeses(meses)}`,
        `Média por emprego: ${emAnosMeses(m.mediaMesesPorEmprego)}`,
      ],
      perguntar: `Por que você saiu de ${ultimo?.empresa || "seu último emprego"}?`,
      contaNaNota: true,
    });
  }

  /* A CONDIÇÃO INCLUI O TETO, e isso não é redundância.
     O alerta nascia com três vínculos curtos ou três inícios em 24 meses; o
     teto de nota entra com 25% dos vínculos datados abaixo de um ano — dois
     empregos curtos em três já bastam. Sem esta terceira condição existia o
     pior caso possível: a nota caía para 45 e a ficha não dizia por quê. Número
     limitado sem explicação ao lado é pior que número não limitado. */
  if (m.empregosCurtos >= 3 || m.inicios24Meses >= 3 || tetoPorRotatividade(m) !== null) {
    /* O TETO ENTRA NO TEXTO DO SINAL, e não numa nota de rodapé: quem lê "57"
       na ficha precisa saber, na mesma frase, que aquele número foi limitado e
       por quê. Sem isso o RH compara um 57 com teto contra um 57 sem teto como
       se fossem a mesma coisa. */
    const limite = tetoPorRotatividade(m);
    sinais.push({
      chave: "rotatividade",
      origem: "calculo",
      severidade: limite !== null && limite.teto <= 60 ? "alto" : "medio",
      categoria: "permanencia",
      titulo:
        limite === null
          ? "Padrão de vínculos curtos"
          : /* "não passa de", e não "foi limitada a": o sinal é calculado sem
               saber a nota final, e em quem já tirou 35 numa régua de teto 45 a
               segunda frase seria mentira. O teto é um limite superior — dizer
               isso é verdade tenha ele mordido ou não. */
            `Vínculos curtos: nota não passa de ${String(limite.teto)}`,
      detalhe:
        `${String(m.empregosCurtos)} de ${String(m.empregosDatados)} ${m.empregosDatados === 1 ? "vínculo datado durou" : "vínculos datados duraram"} menos de um ano${m.inicios24Meses > 0 ? `, e ${String(m.inicios24Meses)} ${m.inicios24Meses === 1 ? "começou" : "começaram"} nos últimos 24 meses` : ""}. Treinar alguém para a rotina da clínica leva cerca de dois meses, então o padrão importa — mas veja antes se não é uma sequência de contratos temporários.` +
        (limite === null
          ? ""
          : ` Por causa disso a nota desta ficha não passa de ${String(limite.teto)}: ${limite.motivo} O limite vale sobre a média dos seis critérios e não pode ser compensado por nota alta nos outros.`),
      evidencias: [
        `Empregos com menos de 1 ano: ${String(m.empregosCurtos)}${m.proporcaoCurtos != null ? ` (${String(m.proporcaoCurtos)}% dos datados)` : ""}`,
      ],
      perguntar: "Me conta a sequência dos seus últimos empregos: o que levou a cada saída?",
      contaNaNota: true,
    });
  }

  if (m.sobreposicoes.length) {
    sinais.push({
      chave: "datas-sobrepostas",
      origem: "calculo",
      severidade: "alto",
      categoria: "coerencia",
      titulo: "Períodos que se sobrepõem",
      detalhe:
        "Dois ou mais vínculos aparecem acontecendo ao mesmo tempo. Na maioria das vezes é data digitada errada; às vezes é acúmulo real de dois meios-períodos. Uma pergunta resolve, e ela precisa ser feita antes de somar a experiência total.",
      evidencias: m.sobreposicoes.map(
        (s) => `${s.a} × ${s.b}: ${emAnosMeses(s.meses)} em paralelo`,
      ),
      perguntar: "Você trabalhou nesses dois lugares ao mesmo tempo, ou alguma data ficou trocada?",
      contaNaNota: true,
    });
  }

  // Uma lacuna por sinal: juntar todas em um alerta só faria a de sete meses e
  // a de quatro anos parecerem o mesmo assunto. A `chave` se repete de
  // propósito — quem renderizar a lista deve indexar por posição.
  for (const lacuna of m.lacunas) {
    if (lacuna.meses < 6) continue;
    sinais.push({
      chave: "lacuna",
      origem: "calculo",
      severidade: "medio",
      categoria: "permanencia",
      titulo: `Intervalo de ${emAnosMeses(lacuna.meses)} entre empregos`,
      detalhe: `Entre ${lacuna.de} e ${lacuna.ate} não há vínculo listado. Estudo, filho pequeno, cuidado de familiar, doença e desemprego são todos motivos legítimos — a clínica só precisa saber, e nenhum deles pode virar critério de descarte.`,
      evidencias: [`${lacuna.de} → ${lacuna.ate} (${emAnosMeses(lacuna.meses)})`],
      perguntar: `O que você estava fazendo entre ${lacuna.de} e ${lacuna.ate}?`,
      contaNaNota: true,
    });
  }

  if (m.empregadaAtualmente === false) {
    sinais.push({
      chave: "desempregada",
      origem: "calculo",
      severidade: "info",
      categoria: "permanencia",
      titulo: "Não consta emprego em andamento",
      detalhe:
        "Nenhum vínculo do currículo está marcado como atual. Costuma significar disponibilidade imediata — é informação de agenda, não demérito.",
      evidencias: m.ultimoEmprego
        ? [
            `Último vínculo: ${m.ultimoEmprego.cargo || "cargo não informado"} — ${m.ultimoEmprego.empresa || "empresa não informada"}`,
          ]
        : [],
      perguntar: "A partir de quando você poderia começar?",
      contaNaNota: false,
    });
  }

  /* ---------------------------------------------------------------------- */
  /* Contato                                                                */
  /* ---------------------------------------------------------------------- */

  const temTelefone = apenasDigitos(e.telefone).length >= 10;
  const temEmail = e.email.trim().length > 0;

  if (!temTelefone && !temEmail) {
    sinais.push({
      chave: "sem-contato",
      origem: "documento",
      severidade: "alto",
      categoria: "contato",
      titulo: "Sem telefone e sem e-mail",
      detalhe:
        "Não há como chamar esta pessoa para entrevista. Confira o arquivo original: contato costuma ficar no cabeçalho, que é justamente a parte que some quando a foto corta a página.",
      evidencias: ["Nenhum telefone ou e-mail legível no documento"],
      perguntar: "",
      contaNaNota: false,
    });
  } else if (!temTelefone) {
    // Só quando há e-mail: sem os dois, `sem-contato` já cobriu o assunto e
    // repetir o alerta faria a lista parecer duas vezes pior do que é.
    sinais.push({
      chave: "sem-telefone",
      origem: "documento",
      severidade: "medio",
      categoria: "contato",
      titulo: "Sem telefone",
      detalhe:
        "Só há e-mail. A clínica marca entrevista por WhatsApp; sem número, a resposta demora ou não vem.",
      evidencias: [`E-mail: ${e.email.trim()}`],
      perguntar: "",
      contaNaNota: false,
    });
  }

  /* ---------------------------------------------------------------------- */
  /* Conformidade profissional e aderência                                  */
  /* ---------------------------------------------------------------------- */

  const exigeRegistro = area === "dentista" || area === "asb-tsb";
  if (exigeRegistro && !e.registroProfissional.trim()) {
    sinais.push({
      chave: "sem-registro",
      origem: "documento",
      severidade: "critico",
      categoria: "conformidade",
      titulo: "Sem registro no conselho",
      detalhe:
        "A vaga exige registro no CRO e o currículo não traz nenhum número. É pré-requisito legal para atuar: sem ele a pessoa não pode assumir a função, por melhor que seja o resto do histórico.",
      evidencias: ["Nenhum registro profissional (CRO) encontrado no documento"],
      perguntar: "Qual é o seu número de CRO e ele está ativo?",
      contaNaNota: true,
    });
  }

  const idade = idadeEmAnos(e, agora);
  if (idade != null && m.mesesExperienciaTotal != null) {
    const anosPossiveis = Math.max(0, idade - 13);
    // Margem de um ano porque a nossa própria regra de "ano sem mês vira
    // janeiro/dezembro" infla a soma, e vínculos sobrepostos são contados duas
    // vezes de propósito no total. Sem essa folga, o alerta dispararia em
    // currículo honesto — e um alerta que erra é um alerta que ninguém lê.
    if (m.mesesExperienciaTotal / 12 > anosPossiveis + 1) {
      sinais.push({
        chave: "idade-incoerente",
        origem: "calculo",
        severidade: "alto",
        categoria: "coerencia",
        titulo: "Experiência não fecha com a idade",
        detalhe: `A soma dos períodos dá ${emAnosMeses(m.mesesExperienciaTotal)} de trabalho, mais do que caberia em uma trajetória iniciada aos 14 anos para alguém de ${idade}. Costuma ser data digitada errada ou vínculos que aconteceram em paralelo — vale conferir antes de qualquer julgamento.`,
        evidencias: [
          `Idade considerada: ${idade} anos`,
          `Experiência somada: ${emAnosMeses(m.mesesExperienciaTotal)}`,
          `Máximo plausível a partir dos 14 anos: cerca de ${anosPossiveis} anos`,
        ],
        perguntar: "Podemos revisar as datas dos seus empregos? Algumas parecem se cruzar.",
        contaNaNota: true,
      });
    }
  }

  if (m.totalEmpregos > 0 && m.mesesEmOdontologia === 0 && m.mesesEmSaude === 0 && !ehEstagio) {
    sinais.push({
      chave: "experiencia-fora-da-area",
      origem: "calculo",
      severidade: "medio",
      categoria: "coerencia",
      titulo: "Nenhuma passagem por odontologia ou saúde",
      detalhe:
        "Toda a experiência veio de outros setores. Não elimina ninguém — a JP já formou boa recepção vinda do varejo —, mas significa treinamento de rotina clínica desde o começo: prontuário, convênio, biossegurança e a linguagem do consultório.",
      evidencias: m.linhaDoTempo
        .filter((t) => t.setor)
        .map((t) => `${t.cargo || "cargo não informado"} — setor ${t.setor}`)
        .slice(0, 5),
      perguntar: "O que te fez procurar uma clínica odontológica agora?",
      contaNaNota: true,
    });
  }

  if (area === "recepcao" && m.totalEmpregos > 0 && m.mesesAtendimentoPublico === 0) {
    sinais.push({
      chave: "sem-atendimento",
      origem: "calculo",
      severidade: "medio",
      categoria: "coerencia",
      titulo: "Sem atendimento ao público no histórico",
      detalhe:
        "Nenhum dos vínculos aparece com contato direto com cliente ou paciente, e a recepção da clínica é atendimento o dia inteiro — no balcão, no telefone e no WhatsApp.",
      evidencias: m.linhaDoTempo
        .map((t) => `${t.cargo || "cargo não informado"} — ${t.empresa || "empresa não informada"}`)
        .slice(0, 5),
      perguntar: "Em qual desses trabalhos você lidava direto com o público? Como era o dia a dia?",
      contaNaNota: true,
    });
  }

  if (
    (area === "recepcao" || area === "administrativo") &&
    m.totalEmpregos > 0 &&
    m.mesesAdministrativo === 0
  ) {
    sinais.push({
      chave: "sem-administrativo",
      origem: "calculo",
      severidade: "medio",
      categoria: "coerencia",
      titulo: "Sem rotina administrativa no histórico",
      detalhe:
        "Não aparece agenda, sistema, planilha, caixa ou confirmação em nenhum emprego. É metade do trabalho na JP: quem atende também organiza a agenda e fecha o caixa do dia.",
      evidencias: e.softwares.length
        ? [`Sistemas citados no currículo: ${e.softwares.join(", ")}`]
        : ["Nenhum sistema, planilha ou rotina de agenda citada"],
      perguntar: "Que sistema ou planilha você usava no dia a dia? Chegou a mexer com caixa?",
      contaNaNota: true,
    });
  }

  /* ---------------------------------------------------------------------- */
  /* Acervo                                                                 */
  /* ---------------------------------------------------------------------- */

  const jaExistentes = entrada.nomesJaExistentes ?? [];
  if (jaExistentes.length) {
    const pontasAtual = pontasDoNome(e.nome);
    const telefoneAtual = apenasDigitos(e.telefone);
    const iguais = jaExistentes.filter((outro) => {
      const mesmoTelefone =
        telefoneAtual.length >= 10 && apenasDigitos(outro.telefone) === telefoneAtual;
      const mesmoNome = pontasAtual.length > 3 && pontasDoNome(outro.nome) === pontasAtual;
      return mesmoTelefone || mesmoNome;
    });

    if (iguais.length) {
      sinais.push({
        chave: "possivel-duplicado",
        origem: "calculo",
        severidade: "alto",
        categoria: "documento",
        titulo: "Pode ser alguém que já está no acervo",
        detalhe:
          "Nome muito parecido ou o mesmo telefone de outra candidatura já registrada. Antes de analisar de novo, vale abrir a ficha antiga: pode ser reenvio do mesmo currículo, e pode ser que a clínica já tenha conversado com essa pessoa.",
        evidencias: iguais.map((o) => `${o.nome || "sem nome"} (ficha ${o.id})`),
        perguntar: "",
        contaNaNota: false,
      });
    }
  }

  /* ---------------------------------------------------------------------- */
  /* Logística                                                              */
  /* ---------------------------------------------------------------------- */

  /**
   * PROXIMIDADE — pedido do cliente, e com um cuidado.
   *
   * "Se morar muito longe também fica inviável para a clínica e para a pessoa"
   * é logística de verdade: quem atravessa São Paulo duas vezes por dia num
   * horário de recepção (abre cedo) desiste em três meses, e aí a clínica
   * recomeça o processo. Saber disso ANTES de marcar a entrevista é o ponto.
   *
   * Quem calcula é `classificarProximidade`, código determinístico sobre o CEP
   * e o bairro que o modelo LEU do currículo — modelo nenhum estima distância
   * sem inventar quilômetro. E nada disto entra na nota (`contaNaNota: false`):
   * distância é fato a combinar, não defeito da pessoa. Há quem faça uma hora e
   * meia de trajeto por anos, e essa escolha é dela.
   *
   * "desconhecida" não vira sinal: o currículo que não diz onde a pessoa mora
   * não autoriza palpite nenhum sobre isso.
   */
  const proximidade = classificarProximidade({
    cep: e.cep,
    bairro: e.bairro,
    cidade: e.cidade,
    uf: e.uf,
  });

  if (proximidade.banda === "perto") {
    sinais.push({
      chave: "mora-perto",
      origem: "documento",
      severidade: "info",
      categoria: "contato",
      titulo: "Mora na região da clínica",
      detalhe: `${proximidade.base}. É a mesma região da clínica: trajeto curto costuma ser o que segura gente boa numa vaga presencial de horário fixo.`,
      evidencias: [proximidade.base],
      perguntar: "",
      contaNaNota: false,
    });
  } else if (proximidade.banda === "longe" || proximidade.banda === "fora") {
    const foraDaGrande = proximidade.banda === "fora";
    /* Sem minutos aqui de proposito: este motor nao conhece o trajeto medido,
       que vive na ficha. Quando ele existe, quem manda e o calculo da nota em
       `analise.ts` — e la o tempo real derruba este teto se for curto. */
    const limiteTrajeto = tetoPorDeslocamento(proximidade.banda, null);
    sinais.push({
      chave: "trajeto-longo",
      origem: "documento",
      severidade: foraDaGrande ? "alto" : "medio",
      categoria: "contato",
      titulo:
        limiteTrajeto === null
          ? foraDaGrande
            ? "Endereço fora da Grande São Paulo"
            : "Mora do outro lado da cidade"
          : `${foraDaGrande ? "Fora da Grande São Paulo" : "Outro lado da cidade"}: nota não passa de ${String(limiteTrajeto.teto)}`,
      detalhe:
        `${proximidade.base}. ` +
        (foraDaGrande
          ? "A vaga é presencial na Vila Bruna, zona norte: vale confirmar se a pessoa já mudou, pretende mudar ou faz o trajeto todo dia."
          : "A clínica fica na Vila Bruna, zona norte, e o trajeto atravessa a cidade — o que pesa em turno que abre de manhã.") +
        (limiteTrajeto === null
          ? " Distância não desqualifica ninguém — só precisa ser combinada antes."
          : ` Por causa disso a nota não passa de ${String(limiteTrajeto.teto)}. O limite cai sozinho se o trajeto medido ficar em até 40 minutos: quando há rota calculada, é o tempo dela que vale, não a região.`),
      evidencias: [proximidade.base],
      perguntar:
        "Você mora hoje em qual região? Quanto tempo leva o trajeto até a Vila Bruna e como você viria?",
      contaNaNota: false,
    });
  }

  /* ---------------------------------------------------------------------- */
  /* Conformidade — o único sinal que nunca pesa na nota                    */
  /* ---------------------------------------------------------------------- */

  // Este é o único sinal do motor com `contaNaNota: false` por motivo de
  // PRINCÍPIO, e não por ser mero aviso de logística. Estado civil, filhos,
  // foto, religião e idade aparecem em currículo brasileiro o tempo todo, e a
  // clínica não pode usar nada disso para decidir — nem a favor, nem contra.
  // Mostrar o alerta serve para duas coisas: lembrar quem vai ler que aquilo
  // ali não entra na conversa, e deixar registrado, na própria ficha, que o
  // sistema não considerou. É proteção da clínica, não julgamento da candidata.
  if (e.dadosSensiveisPresentes.length) {
    sinais.push({
      chave: "dado-sensivel",
      origem: "documento",
      severidade: "info",
      categoria: "conformidade",
      titulo: "O currículo traz dados que não podem pesar na decisão",
      detalhe: `Foram encontrados no documento: ${e.dadosSensiveisPresentes.join(", ")}. Nada disso entrou na nota, e nada disso pode ser usado para decidir nem comentado na entrevista — estado civil, filhos, foto, religião e idade não são critério de contratação.`,
      evidencias: e.dadosSensiveisPresentes,
      perguntar: "",
      contaNaNota: false,
    });
  }

  return ordenarSinais(sinais);
}

/** Do crítico ao informativo. Empate mantém a ordem em que o motor gerou. */
export function ordenarSinais(sinais: Sinal[]): Sinal[] {
  return [...sinais].sort(
    (a, b) => severidadePor(b.severidade).peso - severidadePor(a.severidade).peso,
  );
}

/**
 * Sempre com as cinco chaves preenchidas — inclusive as zeradas.
 *
 * A tela precisa poder escrever "0 críticos" sem checar existência de chave, e
 * um `Record` construído só com o que apareceu obrigaria cada leitura a tratar
 * `undefined` por causa do `noUncheckedIndexedAccess`.
 */
export function contarPorSeveridade(sinais: Sinal[]): Record<SeveridadeSinal, number> {
  const contagem: Record<SeveridadeSinal, number> = {
    critico: 0,
    alto: 0,
    medio: 0,
    baixo: 0,
    info: 0,
  };
  for (const s of sinais) contagem[s.severidade] += 1;
  return contagem;
}
