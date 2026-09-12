/**
 * O `globalSetup`: instala uma organização do zero antes do primeiro teste.
 *
 * POR QUE PELA ROTA `/api/crc/instalar`, E NÃO POR INSERT DIRETO.
 *
 * Porque o usuário precisa de senha com hash, e o hash é feito pelo `scrypt` do
 * servidor com os parâmetros dele. Reproduzir isso num script de teste criaria
 * uma segunda implementação do login — que passaria a divergir na primeira vez
 * que alguém mudasse o custo do scrypt, e o E2E reprovaria por um motivo que não
 * tem nada a ver com o que ele testa.
 *
 * Usar a rota real tem outro efeito, e é de graça: a instalação passa a ser
 * exercitada a cada execução do E2E. Ela nunca tinha teste nenhum.
 *
 * A SEGUNDA CLÍNICA É INSERT DIRETO, e isso é deliberado: não existe tela para
 * abrir unidade, e o teste de isolamento precisa de uma. É a lacuna de UI que o
 * relatório registra — motor sem tela.
 */
import { randomUUID } from "node:crypto";

import {
  apagarDoBanco,
  atualizarNoBanco,
  CRON_SECRET,
  exigirBancoDeTeste,
  gravarNoBanco,
  lerDoBanco,
} from "./ambiente";

/** Dados da segunda unidade, usados pelo teste de isolamento. */
export const CLINICA_B = {
  id: "b2b2b2b2-b2b2-4b2b-8b2b-b2b2b2b2b2b2",
  nome: "Unidade Vizinha",
  slug: "vizinha",
  paciente: "Paciente Da Unidade Vizinha",
};

export default async function instalar(): Promise<void> {
  exigirBancoDeTeste();

  const base = `http://127.0.0.1:${String(process.env["E2E_PORTA"] ?? 3210)}`;

  /*
   * O SERVIDOR PODE NÃO ESTAR PRONTO. O Playwright espera a URL responder antes
   * de rodar os testes, mas o `globalSetup` roda ANTES disso — então a espera é
   * daqui. Sessenta tentativas de um segundo cobrem o build frio.
   */
  await esperar(`${base}/crc`);

  /*
   * SEM `?exemplo=1`. O build do Nitro roda com `NODE_ENV=production`, e a
   * semente de desenvolvimento RECUSA em producao — a trava esta dentro da
   * funcao, e nao em quem chama. Isso e o comportamento certo, e significa que
   * os dados de cenario tem que vir daqui.
   */
  const r = await fetch(`${base}/api/crc/instalar`, {
    method: "POST",
    headers: { authorization: `Bearer ${CRON_SECRET}` },
  });

  if (!r.ok) {
    throw new Error(`A instalação falhou (${String(r.status)}): ${(await r.text()).slice(0, 600)}`);
  }

  const corpo = (await r.json()) as { organizationId?: string; clinicId?: string };
  const organizationId = corpo.organizationId ?? "";
  if (organizationId.length === 0) throw new Error("A instalação não devolveu organizationId.");

  const clinicId = corpo.clinicId ?? "";
  await pacienteDaMatriz(organizationId, clinicId);
  await conversaAberta(organizationId, clinicId);
  await segundaUnidade(organizationId);
}

/** Um paciente da matriz — o que o usuário restrito PODE ver. */
async function pacienteDaMatriz(organizationId: string, clinicId: string): Promise<void> {
  const existe = await lerDoBanco(
    `crc_patients?organization_id=eq.${organizationId}&external_id=eq.e2e-matriz&select=id`,
  );
  if (existe.length > 0) return;

  await gravarNoBanco("crc_patients", [
    {
      id: randomUUID(),
      organization_id: organizationId,
      clinic_id: clinicId,
      external_source: "e2e",
      external_id: "e2e-matriz",
      nome: "Paciente De Teste",
      telefone: "5511900000001",
      situacao: "EM_TRATAMENTO",
      opt_out_em: new Date().toISOString(),
    },
  ]);
}

/**
 * Uma conversa não lida, para a Inbox ter o que abrir.
 *
 * ============================================================================
 *  ELA É REPOSTA A CADA EXECUÇÃO, e não só criada na primeira.
 *
 *  O teste da Inbox ASSUME a conversa — e assumir muda a tela: o botão
 *  "Assumir conversa" some. Na segunda execução da suíte contra o mesmo banco,
 *  o teste reprovava esperando um botão que ele mesmo tinha feito desaparecer.
 *
 *  Um E2E que só passa em banco virgem é um E2E que passa uma vez. O cenário é
 *  responsabilidade do setup, e não do acaso.
 * ============================================================================
 */
async function conversaAberta(organizationId: string, clinicId: string): Promise<void> {
  const existe = await lerDoBanco<{ id: string }>(
    `crc_conversations?organization_id=eq.${organizationId}&contato_externo=eq.5511900000001&select=id`,
  );

  const primeira = existe[0];
  if (primeira !== undefined) {
    await zerarConversa(primeira.id);
    return;
  }

  await gravarNoBanco("crc_conversations", [
    {
      id: randomUUID(),
      organization_id: organizationId,
      clinic_id: clinicId,
      canal: "whatsapp",
      contato_externo: "5511900000001",
      status: "ABERTA",
      nao_lidas: 1,
      ultima_mensagem_trecho: "Oi, quero remarcar",
      ultima_mensagem_em: new Date().toISOString(),
    },
  ]);
}

/**
 * A unidade vizinha, com um paciente só dela.
 *
 * É o cenário do teste de isolamento: o admin instalado tem acesso apenas à
 * matriz (`crc_user_clinics` recebe só ela), e a vizinha existe para provar que
 * o que ele NÃO alcança realmente não aparece.
 */
async function segundaUnidade(organizationId: string): Promise<void> {
  const existentes = await lerDoBanco(
    `crc_clinics?organization_id=eq.${organizationId}&slug=eq.${CLINICA_B.slug}&select=id`,
  );
  if (existentes.length === 0) {
    await gravarNoBanco("crc_clinics", [
      {
        id: CLINICA_B.id,
        organization_id: organizationId,
        nome: CLINICA_B.nome,
        slug: CLINICA_B.slug,
        ativa: true,
      },
    ]);
  }

  const paciente = await lerDoBanco(
    `crc_patients?organization_id=eq.${organizationId}&external_id=eq.e2e-vizinha&select=id`,
  );
  if (paciente.length === 0) {
    await gravarNoBanco("crc_patients", [
      {
        id: randomUUID(),
        organization_id: organizationId,
        clinic_id: CLINICA_B.id,
        external_source: "e2e",
        external_id: "e2e-vizinha",
        nome: CLINICA_B.paciente,
        telefone: "5511900000999",
        situacao: "EM_TRATAMENTO",
        // OPT-OUT EM TODOS OS FICTÍCIOS, como a semente de desenvolvimento faz:
        // nenhuma automação pode contatá-los nem por engano.
        opt_out_em: new Date().toISOString(),
      },
    ]);
  }
}

/**
 * Devolve a conversa ao estado inicial.
 *
 * ============================================================================
 *  "ASSUMIDA" NÃO É UMA COLUNA, e descobrir isso custou duas tentativas.
 *
 *  A primeira versão deste reset zerava `assigned_to` — e a tela continuava
 *  dizendo "Você está respondendo". A segunda apagou também `crc_human_cases`,
 *  e nada mudou.
 *
 *  O que a Inbox lê é `crc_conversations.dono` ('ia' | 'humano' | 'ninguem'),
 *  acrescentada pelo `supabase/10`. `assigned_to` é QUEM, `dono` é DE QUEM É A
 *  VEZ — e são campos diferentes, atualizados juntos, que respondem perguntas
 *  diferentes.
 *
 *  Fica registrado porque é informação sobre o sistema, e não sobre o teste:
 *  quem for mexer no fluxo de handoff precisa mexer nos três lugares.
 * ============================================================================
 */
async function zerarConversa(id: string): Promise<void> {
  await apagarDoBanco(`crc_human_cases?conversation_id=eq.${id}`);

  await atualizarNoBanco(`crc_conversations?id=eq.${id}`, {
    dono: "ia",
    dono_user_id: null,
    dono_desde: null,
    assigned_to: null,
    bloqueada_por: null,
    bloqueada_ate: null,
    status: "ABERTA",
    nao_lidas: 1,
    ultima_mensagem_trecho: "Oi, quero remarcar",
    ultima_mensagem_em: new Date().toISOString(),
  });
}

async function esperar(url: string): Promise<void> {
  for (let i = 0; i < 90; i += 1) {
    try {
      const r = await fetch(url);
      if (r.ok) return;
    } catch {
      // ainda subindo
    }
    await new Promise((ok) => setTimeout(ok, 1000));
  }
  throw new Error(`O servidor de teste não respondeu em ${url}.`);
}
