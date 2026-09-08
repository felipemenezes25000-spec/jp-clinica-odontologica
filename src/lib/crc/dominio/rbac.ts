/**
 * Quem pode o quê.
 *
 * O item 70 do contrato é o que dá sentido a este arquivo: "toda rota de backend
 * deve verificar permissão; não confiar apenas em esconder botão". Esconder o
 * botão é UX; a permissão é segurança. As duas leem a MESMA tabela — é isso que
 * impede a tela e o servidor discordarem sobre o que um recepcionista pode
 * fazer.
 *
 * A tabela é literal e fechada. Um `Record` completo obriga o TypeScript a
 * quebrar quando alguém cria uma permissão nova e esquece de decidir o que cada
 * papel faz com ela — que é exatamente quando um furo entra sem ninguém ver.
 */
import type { Papel } from "./tipos";

export const PERMISSOES = [
  "ver_paciente",
  "editar_paciente",
  "ver_oportunidade",
  "editar_oportunidade",
  "ver_conversa",
  "enviar_mensagem",
  "ver_tarefa",
  "editar_tarefa",
  "ver_automacao",
  "gerenciar_automacao",
  "ver_integracoes",
  "gerenciar_integracoes",
  /** Item 229: valor de orçamento é permissão separada. */
  "ver_financeiro",
  "ver_analytics_gerencial",
  "gerenciar_usuarios",
  "ver_auditoria",
  /** Item 227: só Admin/Gestor mexem no nível de Autopilot. */
  "gerenciar_autopilot",
  "importar_dados",
  "exportar_dados",
  /** Item 231: o dentista recebe escalonamento clínico. */
  "receber_escalonamento_clinico",
] as const;

export type Permissao = (typeof PERMISSOES)[number];

const TODAS = new Set<Permissao>(PERMISSOES);

/**
 * O mapa. Cada papel recebe o conjunto exato do que precisa — item 37: "cada um
 * deve enxergar somente o necessário".
 */
const POR_PAPEL: Readonly<Record<Papel, ReadonlySet<Permissao>>> = {
  admin: TODAS,

  gestor: new Set<Permissao>([
    "ver_paciente",
    "editar_paciente",
    "ver_oportunidade",
    "editar_oportunidade",
    "ver_conversa",
    "enviar_mensagem",
    "ver_tarefa",
    "editar_tarefa",
    "ver_automacao",
    "gerenciar_automacao",
    "ver_integracoes",
    "ver_financeiro",
    "ver_analytics_gerencial",
    "ver_auditoria",
    "gerenciar_autopilot",
    "importar_dados",
    "exportar_dados",
  ]),

  // O papel operacional do dia a dia. Vê tudo do paciente que precisa para
  // converter, e nada de configuração. Item 83 testa exatamente isto.
  crc: new Set<Permissao>([
    "ver_paciente",
    "editar_paciente",
    "ver_oportunidade",
    "editar_oportunidade",
    "ver_conversa",
    "enviar_mensagem",
    "ver_tarefa",
    "editar_tarefa",
    "ver_automacao",
    "ver_financeiro",
  ]),

  recepcao: new Set<Permissao>([
    "ver_paciente",
    "ver_oportunidade",
    "ver_conversa",
    "enviar_mensagem",
    "ver_tarefa",
    "editar_tarefa",
  ]),

  // Item 230/231: o dentista recebe o que é clínico e não precisa da operação
  // comercial inteira. Sem `ver_financeiro` de propósito.
  dentista: new Set<Permissao>([
    "ver_paciente",
    "ver_tarefa",
    "editar_tarefa",
    "receber_escalonamento_clinico",
  ]),

  marketing: new Set<Permissao>([
    "ver_oportunidade",
    "ver_automacao",
    "ver_analytics_gerencial",
    "exportar_dados",
  ]),
};

export function pode(papel: Papel, permissao: Permissao): boolean {
  return POR_PAPEL[papel].has(permissao);
}

export function permissoesDe(papel: Papel): Permissao[] {
  return [...POR_PAPEL[papel]];
}

/**
 * O usuário alcança esta clínica?
 *
 * Separado das permissões porque são eixos independentes: um CRC pode ter
 * `ver_paciente` e ainda assim não poder ver o paciente de OUTRA unidade. Os
 * dois testes acontecem juntos em toda leitura — é o item 71 (tenant isolation).
 * Admin passa direto: quem administra a organização administra as unidades dela.
 */
export function alcancaClinica(
  usuario: { papel: Papel; clinicas: readonly string[] },
  clinicId: string,
): boolean {
  if (usuario.papel === "admin") return true;
  return usuario.clinicas.includes(clinicId);
}

export const ROTULO_PAPEL: Readonly<Record<Papel, string>> = {
  admin: "Administrador",
  gestor: "Gestor",
  crc: "CRC",
  recepcao: "Recepção",
  dentista: "Dentista",
  marketing: "Marketing",
};
