/**
 * Regras de vaga: slug, visibilidade, ordenação, resumos e validação.
 *
 * Puro de propósito, como `validar.ts` e `formatar.ts`: sem I/O, sem `node:` e
 * sem React. O painel usa para dar retorno enquanto o RH digita e o servidor usa
 * de novo antes de gravar — uma regra só, escrita uma vez.
 */
import { MODELOS_TRABALHO } from "./opcoes";
import { vagaVazia, type Vaga } from "./tipos";

/** Os campos que só o driver de armazenamento sabe preencher ao criar a vaga. */
type IdentidadeVaga = Pick<Vaga, "id" | "slug" | "titulo" | "criadoEm" | "atualizadoEm">;

/**
 * Mesmo deslocamento fixo de `formatar.ts`: a clínica é em São Paulo e o Brasil
 * não tem mais horário de verão desde 2019. Serve para saber que dia é "hoje"
 * para a clínica sem depender do fuso do servidor (que roda em UTC).
 */
const FUSO_BRASIL_MINUTOS = -180;

function hojeIso(agora: Date): string {
  const ms = agora.getTime();
  if (Number.isNaN(ms)) return "";
  const deslocado = new Date(ms + FUSO_BRASIL_MINUTOS * 60_000);
  const mes = String(deslocado.getUTCMonth() + 1).padStart(2, "0");
  const dia = String(deslocado.getUTCDate()).padStart(2, "0");
  return `${deslocado.getUTCFullYear()}-${mes}-${dia}`;
}

/** Reaproveita a checagem de data real (2026-02-31 não passa). */
function dataIsoValida(iso: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!m) return false;
  const ano = Number(m[1] ?? "");
  const mes = Number(m[2] ?? "");
  const dia = Number(m[3] ?? "");
  if (ano < 2000 || ano > 2100 || mes < 1 || mes > 12 || dia < 1 || dia > 31) return false;
  const teste = new Date(Date.UTC(ano, mes - 1, dia));
  return (
    teste.getUTCFullYear() === ano && teste.getUTCMonth() === mes - 1 && teste.getUTCDate() === dia
  );
}

/**
 * Título -> pedaço de URL. O NFD separa o acento da letra e `\p{Mn}` varre as
 * marcas soltas, então "Cirurgião-dentista" vira "cirurgiao-dentista" e não
 * "cirurgi-o-dentista".
 */
export function gerarSlug(titulo: string): string {
  return (
    titulo
      .normalize("NFD")
      .replace(/\p{Mn}/gu, "")
      .replace(/[^A-Za-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase()
      .slice(0, 80)
      .replace(/-+$/g, "") || "vaga"
  );
}

/**
 * Duas vagas podem ter o mesmo título ("Recepcionista" abre todo ano), mas o
 * slug é a URL — precisa ser único, senão a segunda vaga sequestraria a página
 * da primeira. `existentes` são os slugs das OUTRAS vagas: quem chama tira a
 * própria da lista, para que salvar sem mudar o título não vire "recepcionista-2".
 */
export function slugUnico(base: string, existentes: string[]): string {
  const usados = new Set(existentes);
  if (!usados.has(base)) return base;
  // Começa em 2 porque o primeiro já é o slug sem sufixo.
  let n = 2;
  while (usados.has(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}

/**
 * Uma vaga só aparece no site se o RH publicou E o prazo não passou. O prazo é
 * conferido aqui, e não só na hora de listar, porque a vaga vence sozinha: sem
 * isso, um anúncio esquecido continuaria recebendo currículo indefinidamente.
 */
export function vagaAberta(v: Vaga, agora: Date): boolean {
  if (v.status !== "aberta") return false;
  const prazo = v.encerraEm.trim();
  if (prazo.length === 0) return true;
  // Prazo com formato estranho não pode esconder uma vaga válida: trata como
  // "sem prazo" em vez de derrubar a vaga do ar por causa de um dado ruim.
  if (!dataIsoValida(prazo)) return true;
  return prazo >= hojeIso(agora);
}

/**
 * Destaque primeiro, depois a mais recém-publicada. Copia antes de ordenar:
 * `sort` mexe no array original, e o chamador costuma ser a lista que veio do
 * disco (ou do cache do roteador).
 */
export function ordenarVagas(vs: Vaga[]): Vaga[] {
  return [...vs].sort((a, b) => {
    if (a.destaque !== b.destaque) return a.destaque ? -1 : 1;
    const porData = b.publicadoEm.localeCompare(a.publicadoEm);
    if (porData !== 0) return porData;
    // Desempate estável para rascunhos, que ainda não têm data de publicação.
    return a.titulo.localeCompare(b.titulo, "pt-BR");
  });
}

/**
 * Faixa salarial pronta para a tela. Devolve string vazia quando o RH escolheu
 * não divulgar — quem renderiza esconde a linha inteira, em vez de mostrar
 * "Salário: a combinar" onde não há informação nenhuma.
 */
export function faixaSalarial(v: Vaga): string {
  if (!v.mostrarSalario) return "";
  const min = v.salarioMin.trim();
  const max = v.salarioMax.trim();
  if (min.length > 0 && max.length > 0) return min === max ? min : `${min} a ${max}`;
  if (min.length > 0) return `A partir de ${min}`;
  if (max.length > 0) return `Até ${max}`;
  return "";
}

/** Jornada e modelo em uma linha só ("40h semanais · Presencial"). */
export function resumoJornada(v: Vaga): string {
  const modelo = MODELOS_TRABALHO.find((m) => m.valor === v.modelo);
  const partes = [v.jornada.trim(), modelo?.rotulo ?? ""].filter((p) => p.length > 0);
  return partes.join(" · ");
}

/**
 * Campo -> mensagem, no mesmo formato de `ErrosPasso`. A ordem de inserção
 * importa: o servidor devolve a primeira mensagem como motivo da recusa, então
 * o campo mais acima no formulário vem primeiro.
 */
export function validarVaga(v: Vaga): Record<string, string> {
  const erros: Record<string, string> = {};

  if (v.titulo.trim().length === 0) erros["titulo"] = "Dê um título à vaga.";
  if (v.resumo.trim().length === 0) {
    erros["resumo"] = "Escreva um resumo curto — é ele que aparece no card da vaga.";
  }
  if (!v.area) erros["area"] = "Escolha a área da vaga.";
  if (!v.vinculo) erros["vinculo"] = "Escolha o tipo de vínculo.";

  if (!Number.isInteger(v.quantidade) || v.quantidade < 1) {
    erros["quantidade"] = "A vaga precisa ter ao menos uma posição.";
  }

  const prazo = v.encerraEm.trim();
  if (prazo.length > 0 && !dataIsoValida(prazo)) {
    erros["encerraEm"] = "Informe uma data de encerramento válida ou deixe em branco.";
  }

  return erros;
}

/* -------------------------------------------------------------------------- */
/* Sementes                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Mora aqui, e não no driver de armazenamento, porque os dois drivers (disco e
 * Supabase) semeiam as mesmas vagas. Deixá-la privada num deles obrigaria o
 * outro a importar o módulo de disco inteiro — com `node:fs` junto — só para
 * ler três objetos que não têm nada de I/O.
 *
 * `novoId` entra por parâmetro: gerar identificador é trabalho do driver (um usa
 * `node:crypto`, o outro a Web Crypto), e este módulo é puro.
 */

/**
 * As três vagas de exemplo nascem em "rascunho" de propósito: o painel abre com
 * conteúdo de verdade para o RH editar (é bem mais fácil ajustar um texto do que
 * escrever do zero), mas nada disso aparece no site enquanto a clínica não
 * publicar. Semear como "aberta" colocaria no ar vaga que ninguém conferiu.
 */
export function vagasSemente(agoraIso: string, novoId: () => string): Vaga[] {
  const identidade = (titulo: string): IdentidadeVaga => ({
    id: novoId(),
    slug: gerarSlug(titulo),
    titulo,
    criadoEm: agoraIso,
    atualizadoEm: agoraIso,
  });

  // O que a clínica oferece a qualquer pessoa que trabalhe aqui, independente
  // do contrato.
  const beneficiosComuns = [
    "Tratamento odontológico gratuito para você e desconto para a família",
    "Uniforme e EPIs fornecidos pela clínica",
  ];

  // Verbas trabalhistas: só existem em CLT. A lista era uma só e ia igual para
  // as três sementes, então a vaga PJ subia prometendo "registro em carteira" —
  // no site, no resumo da vaga e no `jobBenefits` do JSON-LD, ao lado de
  // `employmentType: CONTRACTOR`. Como a semente nasce em rascunho, bastava um
  // clique em "Publicar" para o anúncio ir ao ar assim.
  const beneficiosClt = [
    "Registro em carteira desde o primeiro dia",
    "Vale-transporte",
    "Vale-refeição ou refeição no local",
    ...beneficiosComuns,
  ];

  // Nada de verba trabalhista aqui, e nada inventado sobre remuneração: o que
  // entra é estrutura, que a clínica oferece de fato e já está no resumo da
  // vaga. Condições comerciais quem escreve é a clínica, ao revisar o rascunho.
  const beneficiosPj = [
    "Consultório completo, com auxiliar em todos os procedimentos",
    "Agenda organizada pela recepção, com confirmação de consulta",
    ...beneficiosComuns,
  ];

  return [
    {
      ...vagaVazia(),
      ...identidade("Cirurgião-dentista clínico geral"),
      area: "dentista",
      vinculo: "pj",
      destaque: true,
      resumo:
        "Atendimento clínico geral em consultório completo, com auxiliar em todos os procedimentos e agenda organizada pela recepção.",
      descricao:
        "Você vai atender pacientes de todas as idades em uma clínica de bairro onde as pessoas voltam e trazem a família. O plano de tratamento é explicado com calma, sem empurrar procedimento, e nenhum atendimento acontece sem apoio na cadeira.",
      responsabilidades: [
        "Realizar anamnese, avaliação clínica e plano de tratamento",
        "Executar procedimentos de dentística, periodontia básica e exodontias simples",
        "Explicar tratamento e orçamento ao paciente com clareza",
        "Registrar evolução e imagens no prontuário",
        "Zelar pelo protocolo de biossegurança da clínica",
      ],
      requisitos: [
        "Graduação em Odontologia com CRO ativo",
        "Experiência em atendimento clínico geral",
        "Boa comunicação com o paciente e com a equipe",
        // "Disponibilidade para escala fixa" descrevia subordinação e jornada
        // controlada — exatamente o que um contrato PJ não pode exigir. A
        // agenda é combinada, não imposta.
        "Disponibilidade para atender de segunda a sexta, em agenda combinada com a clínica",
      ],
      diferenciais: [
        "Especialização ou cursos em dentística e endodontia",
        "Experiência com convênios odontológicos",
        "Domínio de prontuário eletrônico",
      ],
      beneficios: beneficiosPj,
      especialidades: ["Clínica geral", "Dentística", "Periodontia"],
      jornada: "Agenda de segunda a sexta, combinada com a clínica",
      turnos: ["manha", "tarde"],
      local: "Vila Bruna — São Paulo/SP",
      modelo: "presencial",
      quantidade: 1,
    },
    {
      ...vagaVazia(),
      ...identidade("Auxiliar de Saúde Bucal (ASB)"),
      area: "asb-tsb",
      vinculo: "clt",
      resumo:
        "Trabalho a quatro mãos, esterilização e preparo dos consultórios ao lado de uma equipe que ensina.",
      descricao:
        "Procuramos alguém cuidadoso com o material e atencioso com o paciente. Aqui a ASB não fica sozinha: há protocolo escrito, treinamento interno e um time que se apoia.",
      responsabilidades: [
        "Instrumentar o dentista durante os atendimentos",
        "Preparar, limpar e organizar os consultórios entre pacientes",
        "Executar o ciclo de esterilização e o controle dos indicadores",
        "Controlar o estoque de materiais e avisar a reposição",
        "Acolher o paciente na cadeira e orientar sobre os cuidados",
      ],
      requisitos: [
        "Curso de Auxiliar em Saúde Bucal concluído",
        "Registro ativo no CRO como ASB",
        "Ensino médio completo",
        "Cuidado com biossegurança e organização",
      ],
      diferenciais: [
        "Experiência prévia em clínica odontológica",
        "Curso de radiologia odontológica",
        "Morar na região da Freguesia do Ó",
      ],
      beneficios: beneficiosClt,
      jornada: "44h semanais, de segunda a sexta",
      turnos: ["manha", "tarde"],
      local: "Vila Bruna — São Paulo/SP",
      modelo: "presencial",
      quantidade: 1,
    },
    {
      ...vagaVazia(),
      ...identidade("Recepcionista de clínica"),
      area: "recepcao",
      vinculo: "clt",
      resumo:
        "A primeira pessoa que o paciente encontra: acolhimento, agenda, confirmação e retorno de quem ficou para trás.",
      descricao:
        "A recepção é o cartão de visita da JP. Queremos alguém que atenda o telefone com paciência, saiba resolver o encaixe difícil e não deixe paciente sem resposta.",
      responsabilidades: [
        "Receber pacientes e organizar a sala de espera",
        "Agendar, confirmar e remarcar consultas",
        "Atender telefone e WhatsApp da clínica",
        "Emitir recibos e controlar o caixa do dia",
        "Fazer o recall de pacientes com tratamento em aberto",
      ],
      requisitos: [
        "Ensino médio completo",
        "Experiência com atendimento ao público",
        "Boa escrita para o atendimento por WhatsApp",
        "Familiaridade com computador e agenda eletrônica",
      ],
      diferenciais: [
        "Experiência em clínica ou consultório de saúde",
        "Noções de faturamento de convênios",
        "Vivência com redes sociais da empresa",
      ],
      beneficios: beneficiosClt,
      jornada: "44h semanais, de segunda a sexta",
      turnos: ["manha", "tarde"],
      local: "Vila Bruna — São Paulo/SP",
      modelo: "presencial",
      quantidade: 1,
    },
  ];
}
