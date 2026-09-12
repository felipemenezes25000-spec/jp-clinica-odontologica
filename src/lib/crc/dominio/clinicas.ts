/**
 * Clínicas e escopo de acesso — as regras puras.
 *
 * ============================================================================
 *  O QUE ESTE ARQUIVO EXISTE PARA IMPEDIR: que alguém fique trancado do lado
 *  de fora, ou que alguém veja o que não é da unidade dela.
 *
 *  São os dois erros opostos do multi-clínica, e os dois são caros:
 *
 *    - escopo largo demais → a recepcionista da unidade Centro lê o paciente
 *      da unidade Norte. Ninguém percebe, porque a tela funciona.
 *
 *    - escopo estreito demais → a pessoa entra e vê um CRC vazio. Ela acha que
 *      o sistema quebrou, e liga para o suporte dizendo "sumiu tudo".
 *
 *  O segundo é mais comum e menos notado, porque não dá erro: uma lista vazia
 *  é uma resposta válida. Por isso `avisoDeEscopo` existe — para a tela dizer
 *  em voz alta quando alguém foi salvo sem nenhuma clínica.
 * ============================================================================
 *
 * NADA AQUI TOCA O BANCO. As funções recebem o que já foi lido e devolvem
 * decisão. É o que permite testar a regra do "último admin" sem subir Postgres.
 */
import type { Papel } from "./tipos";

/* -------------------------------------------------------------------------- */
/* Slug                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * O nome vira um identificador estável na URL e na chave única.
 *
 * ============================================================================
 *  O SLUG É DERIVADO UMA VEZ E NUNCA MAIS MUDA, mesmo que o nome mude.
 *
 *  "Unidade Centro" vira `unidade-centro`. Se amanhã ela virar "Unidade
 *  Paulista", o slug continua `unidade-centro` — porque ele já entrou em link
 *  compartilhado, em `external_id` de integração e em log de auditoria.
 *  Regerar o slug a cada renome quebraria tudo isso em silêncio.
 *
 *  Quem chama é que precisa respeitar isso: esta função só sabe derivar.
 * ============================================================================
 */
export function gerarSlug(nome: string): string {
  return (
    nome
      .normalize("NFD")
      // Tira o acento, mas guarda a letra: "Jardim Paulista" e "Jardím
      // Paulista" produzem o mesmo slug, o que é o desejado — são a mesma
      // unidade digitada de dois jeitos.
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40)
      // O corte de 40 pode terminar em hífen ("unidade-jardim-paulista-zona-"),
      // e um slug terminado em hífen fica feio na URL e confunde a comparação.
      .replace(/-+$/g, "")
  );
}

export const MIN_NOME_CLINICA = 2;
export const MAX_NOME_CLINICA = 80;

export type Critica = { ok: true } | { ok: false; motivo: string };

export function validarNomeDaClinica(nome: string): Critica {
  const limpo = nome.trim();

  if (limpo.length < MIN_NOME_CLINICA) {
    return { ok: false, motivo: "O nome da unidade precisa de pelo menos duas letras." };
  }
  if (limpo.length > MAX_NOME_CLINICA) {
    return { ok: false, motivo: "O nome da unidade ficou longo demais." };
  }

  /*
   * UM NOME SÓ DE PONTUAÇÃO GERA SLUG VAZIO, e um slug vazio colidiria com o
   * próximo nome só de pontuação — duas unidades diferentes disputando a mesma
   * chave única. O erro apareceria como "já existe uma unidade com esse nome",
   * que é uma mentira confusa.
   */
  if (gerarSlug(limpo).length === 0) {
    return { ok: false, motivo: "O nome precisa ter letras ou números, e não só símbolos." };
  }

  return { ok: true };
}

/* -------------------------------------------------------------------------- */
/* Desativar                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Desativar a última unidade ativa deixa a organização sem lugar nenhum.
 *
 * ============================================================================
 *  É O MESMO BECO DO "ÚLTIMO ADMINISTRADOR", aplicado a clínica.
 *
 *  Sem nenhuma clínica ativa, a sincronização não tem onde gravar, o lead que
 *  chega pelo formulário não tem onde cair, e a tela de todo mundo fica vazia.
 *  E não há botão para desfazer, porque a tela de clínicas também fica vazia.
 *
 *  A recusa é do servidor, e não da tela: esconder o botão não impede uma
 *  requisição direta.
 * ============================================================================
 */
export function podeDesativarClinica(p: { ativasHoje: number; estaEstaAtiva: boolean }): Critica {
  // Desativar o que já está desativado é no-op, não erro.
  if (!p.estaEstaAtiva) return { ok: true };

  if (p.ativasHoje <= 1) {
    return {
      ok: false,
      motivo:
        "Esta é a última unidade ativa. Desativá-la deixaria a organização sem nenhum lugar para receber paciente, lead ou sincronização — e sem tela para reativar.",
    };
  }

  return { ok: true };
}

/* -------------------------------------------------------------------------- */
/* Escopo do usuário                                                          */
/* -------------------------------------------------------------------------- */

/**
 * O administrador alcança TODAS as unidades, sempre.
 *
 * ============================================================================
 *  E O VÍNCULO DELE NÃO É GRAVADO, é derivado.
 *
 *  Gravar "admin vê Centro e Norte" cria uma verdade que envelhece: a unidade
 *  Sul nasce amanhã e o admin não a enxerga, sem nenhum erro na tela. Ele
 *  abriria o CRC e concluiria que a unidade nova não foi criada.
 *
 *  `servidor/sessao.ts` já faz exatamente isto ao montar o contexto. Esta
 *  função é a mesma regra escrita onde dá para testar — e o dia em que as duas
 *  divergirem, o teste desta pega.
 * ============================================================================
 */
export function escopoEfetivo(
  papel: Papel,
  vinculadas: readonly string[],
  todasDaOrganizacao: readonly string[],
): string[] {
  if (papel === "admin") return [...todasDaOrganizacao];
  return [...vinculadas];
}

export type AvisoDeEscopo = { tom: "perigo" | "info"; texto: string } | null;

/**
 * O que a tela precisa dizer em voz alta sobre um escopo.
 *
 * ============================================================================
 *  O CASO QUE ESTA FUNÇÃO EXISTE PARA PEGAR: salvar alguém com ZERO clínicas.
 *
 *  Não dá erro. A pessoa entra, a sessão abre, as permissões conferem — e todas
 *  as listas vêm vazias, porque `clinic_id in ()` não casa com nada. Quem está
 *  do outro lado conclui que o sistema perdeu os dados.
 *
 *  Por isso o aviso é "perigo" e não "info": é a diferença entre uma escolha e
 *  um engano.
 * ============================================================================
 */
export function avisoDeEscopo(papel: Papel, quantasClinicas: number): AvisoDeEscopo {
  if (papel === "admin") {
    return {
      tom: "info",
      texto:
        "Administradores alcançam todas as unidades, inclusive as criadas depois. A seleção abaixo não muda o que esta pessoa vê.",
    };
  }

  if (quantasClinicas === 0) {
    return {
      tom: "perigo",
      texto:
        "Sem nenhuma unidade, esta pessoa entra no CRC e vê todas as listas vazias — sem mensagem de erro. Ela vai concluir que o sistema perdeu os dados.",
    };
  }

  return null;
}

/* -------------------------------------------------------------------------- */
/* Primeiros passos                                                           */
/* -------------------------------------------------------------------------- */

/**
 * O que a organização já tem, medido — não declarado.
 *
 * Cada campo é uma contagem real do banco. Nenhum deles é um "marcar como
 * concluído": um checklist com botão de marcar vira um checklist todo marcado
 * e nenhuma etapa feita.
 */
export type EstadoDaInstalacao = {
  clinicasAtivas: number;
  usuarios: number;
  /** Quantos usuários NÃO-admin ficaram sem nenhuma unidade. */
  usuariosSemClinica: number;
  integracaoLigada: boolean;
  pacientes: number;
  canalDeMensagemLigado: boolean;
  automacoesAtivas: number;
  politicaDePagamento: boolean;
};

export type Passo = {
  chave: string;
  titulo: string;
  /** O que muda quando ele estiver feito. Nunca "configure X". */
  porque: string;
  feito: boolean;
  /**
   * Bloqueia o uso de verdade, ou só melhora?
   *
   * A distinção existe para o checklist não virar uma parede de sete itens
   * obrigatórios. Só o que impede o CRC de funcionar é `true`.
   */
  essencial: boolean;
  /** Onde se resolve. A aba, para a tela poder levar a pessoa até lá. */
  aba: string;
};

/**
 * O checklist da primeira semana.
 *
 * ============================================================================
 *  A ORDEM É A DA DEPENDÊNCIA REAL, e não a da importância.
 *
 *  Não adianta pedir para ligar o canal de mensagem antes de existir paciente:
 *  a automação não teria para quem escrever, a pessoa ligaria o canal, não
 *  veria nada acontecer e concluiria que não funciona.
 *
 *  Cada passo também diz O QUE MUDA quando ele estiver feito, e não o que
 *  fazer. "Configure a integração" não explica nada; "sem ela, todo paciente
 *  precisa ser digitado à mão" explica.
 * ============================================================================
 */
export function passosDaInstalacao(e: EstadoDaInstalacao): Passo[] {
  return [
    {
      chave: "clinica",
      titulo: "Ter pelo menos uma unidade ativa",
      porque:
        "Tudo no CRC pendura em uma unidade: paciente, consulta, conversa, lead. Sem nenhuma ativa, não há onde nada cair.",
      feito: e.clinicasAtivas > 0,
      essencial: true,
      aba: "configuracoes",
    },
    {
      chave: "integracao",
      titulo: "Ligar o Dental Office",
      porque:
        "É de onde vêm paciente e agenda. Sem a integração, cada um precisa ser digitado à mão — e a agenda do CRC começa a divergir da agenda real no mesmo dia.",
      feito: e.integracaoLigada,
      essencial: true,
      aba: "integracoes",
    },
    {
      chave: "pacientes",
      titulo: "Trazer os pacientes",
      porque:
        "Antes da primeira sincronização, todas as telas mostram estado vazio — o que é correto, mas indistinguível de um sistema quebrado.",
      feito: e.pacientes > 0,
      essencial: true,
      aba: "importar",
    },
    {
      chave: "equipe",
      titulo: "Criar o segundo usuário",
      porque:
        "Com um login só, toda ação fica assinada por “o login da clínica” e a auditoria não responde quem fez o quê. Não é sobre tamanho da equipe — é sobre saber de quem foi a decisão.",
      feito: e.usuarios > 1,
      essencial: false,
      aba: "equipe",
    },
    {
      chave: "escopo",
      titulo: "Dar unidade a quem ficou sem",
      porque:
        "Quem não tem nenhuma unidade vinculada entra no CRC e vê tudo vazio, sem mensagem de erro. É o defeito mais confuso que este sistema consegue produzir.",
      // Esta é a única entrada que NÃO é "ainda não fiz": é "fiz errado". Ela
      // só aparece como pendente quando alguém já está trancado do lado de
      // fora, e por isso é essencial mesmo vindo depois das opcionais.
      feito: e.usuariosSemClinica === 0,
      essencial: true,
      aba: "equipe",
    },
    {
      chave: "canal",
      titulo: "Ligar um canal de mensagem",
      porque:
        "É o que transforma o CRC de painel em operação: sem canal, ele mostra quem precisa de contato e alguém copia o telefone na mão.",
      feito: e.canalDeMensagemLigado,
      essencial: false,
      aba: "integracoes",
    },
    {
      chave: "automacao",
      titulo: "Deixar a primeira automação sair da simulação",
      porque:
        "As automações nascem simulando: elas decidem e registram, mas não enviam. Até alguém aprová-las, o CRC observa e não age.",
      feito: e.automacoesAtivas > 0,
      essencial: false,
      aba: "automacoes",
    },
    {
      chave: "pagamento",
      titulo: "Escrever a política de desconto e parcelamento",
      porque:
        "Sem ela, o teto de desconto vive na cabeça de cada pessoa — e a negociação vira “quanto você consegue”, que é como uma clínica perde margem sem perceber.",
      feito: e.politicaDePagamento,
      essencial: false,
      aba: "tratamentos",
    },
  ];
}

/** Quantos passos essenciais ainda faltam. É o número que a tela mostra. */
export function faltamEssenciais(passos: readonly Passo[]): number {
  return passos.filter((p) => p.essencial && !p.feito).length;
}
