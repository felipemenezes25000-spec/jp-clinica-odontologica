/**
 * Templates de mensagem — itens 103, 104, 105.
 *
 * TRÊS REGRAS QUE O ARQUIVO SUSTENTA:
 *
 *   Versionar (103). Editar o texto cria uma versão nova; a antiga fica. Isso
 *   existe porque a mensagem JÁ ENVIADA não pode mudar de conteúdo
 *   retroativamente — `crc_messages.conteudo` guarda o texto renderizado, e o
 *   template guarda a receita.
 *
 *   Preview antes de ativar (104). `renderizarComExemplo` produz o texto com
 *   dados fictícios, para o gestor ver o que o paciente vai receber.
 *
 *   Nunca deixar `{{firstName}}` vazar. Variável não fornecida vira uma
 *   substituição neutra, e não a chave crua. "Olá, {{primeiroNome}}!" chegando
 *   num WhatsApp de paciente é o tipo de erro que destrói a confiança na
 *   automação inteira.
 */
import { atualizar, gravar, selecionar, selecionarUm, type Linha } from "../servidor/banco";

export type VariaveisTemplate = Record<string, string | null | undefined>;

/**
 * Substitui `{{variavel}}`.
 *
 * A substituição neutra por variável ausente é escolhida por campo: sem nome,
 * "Olá, {{primeiroNome}}" viraria "Olá," com vírgula solta. Por isso o
 * fallback de `primeiroNome` é "tudo bem" e não string vazia — o texto
 * continua fazendo sentido em português.
 */
const NEUTROS: Readonly<Record<string, string>> = {
  primeiroNome: "tudo bem",
  nome: "tudo bem",
  clinica: "a clínica",
  data: "a data combinada",
  hora: "o horário combinado",
  dentista: "o profissional",
};

export function aplicarVariaveis(modelo: string, variaveis: VariaveisTemplate): string {
  return modelo.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/gu, (_todo, chave: string) => {
    const valor = variaveis[chave];
    if (typeof valor === "string" && valor.trim().length > 0) return valor.trim();
    return NEUTROS[chave] ?? "";
  });
}

/** Deixa a frase apresentável depois de uma substituição neutra. */
function limpar(texto: string): string {
  return texto
    .replace(/\s{2,}/gu, " ")
    .replace(/\s+([,.!?])/gu, "$1")
    .replace(/,\s*,/gu, ",")
    .trim();
}

/**
 * Busca o template ATIVO da chave e renderiza.
 *
 * Sem template cadastrado, cai no catálogo embutido — que é o que faz o sistema
 * funcionar no primeiro dia, antes de alguém abrir a tela de templates. Se nem
 * lá existir, devolve uma frase genérica em vez de estourar: uma automação não
 * pode morrer porque um template foi apagado.
 */
export async function renderizarTemplate(
  organizationId: string,
  chave: string,
  variaveis: VariaveisTemplate,
): Promise<string> {
  const linha = await selecionarUm("crc_templates", {
    filtros: [
      { coluna: "organization_id", op: "eq", valor: organizationId },
      { coluna: "chave", op: "eq", valor: chave },
      { coluna: "ativo", op: "eq", valor: true },
    ],
    ordenar: [{ coluna: "versao", ascendente: false }],
  });

  const modelo =
    (typeof linha?.["conteudo"] === "string" ? linha["conteudo"] : null) ??
    TEMPLATES_PADRAO[chave] ??
    "Olá, {{primeiroNome}}! Somos da {{clinica}} e gostaríamos de falar com você.";

  return limpar(aplicarVariaveis(modelo, variaveis));
}

/** Item 104: o preview com dados fictícios. Nenhum dado real sai daqui. */
export function renderizarComExemplo(modelo: string): string {
  return limpar(
    aplicarVariaveis(modelo, {
      primeiroNome: "Maria",
      nome: "Maria Souza",
      clinica: "JP Clínica Integrada Odontológica",
      data: "quinta-feira, 11/09",
      hora: "14:30",
      dentista: "Dra. Juliana",
    }),
  );
}

/* -------------------------------------------------------------------------- */
/* Catálogo embutido                                                          */
/* -------------------------------------------------------------------------- */

/**
 * As mensagens iniciais.
 *
 * ESCRITAS SEGUINDO O ITEM 279 ("a automação nunca deve parecer spam") e o item
 * 46 (linguagem humana). Cada uma:
 *   - diz quem está falando, já na primeira linha;
 *   - tem UM pedido só, e ele é fácil de responder;
 *   - não promete nada clínico, não cita preço, não pressiona;
 *   - termina com a saída explícita, porque esconder o opt-out é o que
 *     transforma automação em incômodo.
 */
export const TEMPLATES_PADRAO: Readonly<Record<string, string>> = {
  falta_primeiro_contato:
    "Olá, {{primeiroNome}}! Aqui é da {{clinica}}. Notamos que você não conseguiu comparecer à sua consulta e queremos ajudar a remarcar. Qual período fica melhor para você: manhã ou tarde?",

  falta_segundo_contato:
    "Oi, {{primeiroNome}}! Passando para saber se você ainda gostaria de remarcar sua consulta na {{clinica}}. Se preferir, responda esta mensagem com o melhor dia para você. Se não quiser mais receber mensagens, é só dizer.",

  cancelamento_reagendar:
    "Olá, {{primeiroNome}}! Recebemos o cancelamento da sua consulta na {{clinica}}. Quer que a gente veja um novo horário? Me diga qual dia funciona melhor.",

  confirmacao_consulta:
    "Olá, {{primeiroNome}}! Sua consulta na {{clinica}} está marcada para {{data}}, às {{hora}}. Você confirma? Responda SIM para confirmar ou me avise se precisar remarcar.",

  recall_seis_meses:
    "Oi, {{primeiroNome}}! Aqui é da {{clinica}}. Já faz um tempinho desde sua última consulta e está na época da avaliação de rotina. Quer que eu veja um horário para você?",

  reativacao_inativo:
    "Olá, {{primeiroNome}}! Sentimos sua falta na {{clinica}}. Se quiser retomar seu acompanhamento, me diga e eu vejo os horários disponíveis. Se preferir não receber mais mensagens, é só avisar.",

  abandono_tratamento:
    "Oi, {{primeiroNome}}! Aqui é da {{clinica}}. Vimos que seu tratamento ficou pela metade e queremos entender como podemos ajudar a retomar. Podemos conversar?",

  aniversario:
    "Feliz aniversário, {{primeiroNome}}! 🎉 A equipe da {{clinica}} deseja um ótimo dia para você.",

  orcamento_parado:
    "Olá, {{primeiroNome}}! Aqui é da {{clinica}}. Ficou alguma dúvida sobre o orçamento que preparamos para você? Estou à disposição para explicar as opções.",

  lead_primeiro_contato:
    "Olá, {{primeiroNome}}! Aqui é da {{clinica}}, recebemos seu contato. Como podemos ajudar? Se quiser agendar uma avaliação, me diga qual período é melhor para você.",
};

/**
 * Instala o catálogo no banco, sem sobrescrever o que já foi editado.
 *
 * `versao: 1` fixa no upsert é intencional: rodar a semeadura de novo não pode
 * apagar a v2 que o gestor escreveu. Se a v1 existir, o upsert a reescreve com
 * o mesmo conteúdo padrão — inofensivo, porque a v2 continua sendo a ativa.
 */
export async function semearTemplates(organizationId: string): Promise<number> {
  const linhas: Linha[] = Object.entries(TEMPLATES_PADRAO).map(([chave, conteudo]) => ({
    organization_id: organizationId,
    chave,
    versao: 1,
    canal: "whatsapp",
    nome: chave.replace(/_/gu, " "),
    conteudo,
    ativo: true,
  }));

  await gravar("crc_templates", linhas, "organization_id,chave,versao");
  return linhas.length;
}

export async function listarTemplates(organizationId: string): Promise<Linha[]> {
  return selecionar("crc_templates", {
    filtros: [{ coluna: "organization_id", op: "eq", valor: organizationId }],
    ordenar: [
      { coluna: "chave", ascendente: true },
      { coluna: "versao", ascendente: false },
    ],
    limite: 200,
  });
}

/**
 * Cria uma versão nova. Nunca edita a existente (item 103).
 *
 * A versão anterior é desativada em vez de apagada: o histórico precisa poder
 * responder "qual texto foi enviado em agosto?".
 */
export async function novaVersaoDeTemplate(
  organizationId: string,
  chave: string,
  conteudo: string,
  aprovadoPor: string | null,
): Promise<number> {
  const ultima = await selecionar("crc_templates", {
    colunas: "versao",
    filtros: [
      { coluna: "organization_id", op: "eq", valor: organizationId },
      { coluna: "chave", op: "eq", valor: chave },
    ],
    ordenar: [{ coluna: "versao", ascendente: false }],
    limite: 1,
  });

  const anterior = ultima[0]?.["versao"];
  const proxima = (typeof anterior === "number" ? anterior : 0) + 1;

  await gravar(
    "crc_templates",
    {
      organization_id: organizationId,
      chave,
      versao: proxima,
      canal: "whatsapp",
      nome: chave.replace(/_/gu, " "),
      conteudo,
      ativo: true,
      aprovado_por: aprovadoPor,
      aprovado_em: new Date().toISOString(),
    },
    "organization_id,chave,versao",
  );

  // Desativa as anteriores com UPDATE, e não com upsert parcial: um upsert sem
  // `conteudo` tentaria gravar nulo numa coluna NOT NULL e falharia — deixando
  // duas versões ativas da mesma chave, que é o pior estado possível aqui.
  await atualizar(
    "crc_templates",
    [
      { coluna: "organization_id", op: "eq", valor: organizationId },
      { coluna: "chave", op: "eq", valor: chave },
      { coluna: "versao", op: "neq", valor: proxima },
    ],
    { ativo: false },
  );

  return proxima;
}
