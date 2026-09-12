/**
 * Primeiros passos — o item 58, medido.
 *
 * ============================================================================
 *  NADA AQUI É "MARCAR COMO CONCLUÍDO". Cada passo é uma contagem do banco.
 *
 *  Um checklist com botão de marcar vira, em duas semanas, um checklist todo
 *  marcado e nenhuma etapa feita — porque a pessoa marca para tirar o aviso da
 *  frente, não porque fez. Aqui o único jeito de um item ficar verde é o fato
 *  existir: a clínica existe, o paciente chegou, a política foi escrita.
 *
 *  O preço disso é que não dá para "dispensar" um passo. E é o preço certo: um
 *  passo essencial que dá para dispensar não era essencial.
 * ============================================================================
 *
 * ISTO É DE LEITURA. Nenhuma função deste arquivo escreve.
 */
import { passosDaInstalacao, type EstadoDaInstalacao, type Passo } from "../dominio/clinicas";
import { contar, selecionar } from "../servidor/banco";

/**
 * Conta quantos usuários NÃO-admin ficaram sem nenhuma unidade.
 *
 * ============================================================================
 *  O ADMIN É EXCLUÍDO DA CONTA, e essa é a parte fácil de errar.
 *
 *  Ele alcança tudo por papel, sem vínculo gravado — é assim que
 *  `servidor/sessao.ts` monta o contexto. Contá-lo como "sem unidade" faria o
 *  checklist mostrar uma pendência permanente que ninguém consegue resolver:
 *  a pessoa vincularia o admin a todas as unidades, o aviso sumiria, e a
 *  unidade criada no mês seguinte o traria de volta.
 * ============================================================================
 */
async function contarTrancadosDoLadoDeFora(organizationId: string): Promise<number> {
  const usuarios = await selecionar<{ id: string; papel: string }>("crc_users", {
    colunas: "id,papel",
    filtros: [
      { coluna: "organization_id", op: "eq", valor: organizationId },
      { coluna: "ativo", op: "eq", valor: true },
      { coluna: "papel", op: "neq", valor: "admin" },
    ],
    limite: 200,
  });

  if (usuarios.length === 0) return 0;

  const vinculos = await selecionar<{ user_id: string }>("crc_user_clinics", {
    colunas: "user_id",
    filtros: [{ coluna: "user_id", op: "in", valor: usuarios.map((u) => u.id) }],
    limite: 1000,
  });

  const comUnidade = new Set(vinculos.map((v) => v.user_id));
  return usuarios.filter((u) => !comUnidade.has(u.id)).length;
}

export async function lerEstadoDaInstalacao(organizationId: string): Promise<EstadoDaInstalacao> {
  const org: { coluna: string; op: "eq"; valor: string } = {
    coluna: "organization_id",
    op: "eq",
    valor: organizationId,
  };

  const [
    clinicasAtivas,
    usuarios,
    usuariosSemClinica,
    integracoes,
    pacientes,
    canais,
    automacoesAtivas,
    politicas,
  ] = await Promise.all([
    contar("crc_clinics", [org, { coluna: "ativa", op: "eq", valor: true }]),
    contar("crc_users", [org, { coluna: "ativo", op: "eq", valor: true }]),
    contarTrancadosDoLadoDeFora(organizationId),
    contar("crc_integracoes_clinica", [org, { coluna: "ativo", op: "eq", valor: true }]),
    contar("crc_patients", [org]),
    contar("crc_canais_whatsapp", [org, { coluna: "ativo", op: "eq", valor: true }]),
    /*
     * "ATIVA" É STATUS **E** MODO, e não só status.
     *
     * Uma automação com `status = ATIVA` e `modo = SHADOW` calcula tudo e não
     * envia nada — é exatamente como toda automação nasce (item 96). Contá-la
     * como pronta diria à pessoa que o CRC está agindo enquanto ele só observa,
     * que é o pior erro que este checklist poderia cometer: ele existe para
     * dizer o que ainda não está funcionando.
     */
    contar("crc_automations", [
      org,
      { coluna: "status", op: "eq", valor: "ATIVA" },
      { coluna: "modo", op: "neq", valor: "SHADOW" },
    ]),
    contar("crc_payment_policies", [org]),
  ]);

  return {
    clinicasAtivas,
    usuarios,
    usuariosSemClinica,
    integracaoLigada: integracoes > 0,
    pacientes,
    canalDeMensagemLigado: canais > 0,
    automacoesAtivas,
    politicaDePagamento: politicas > 0,
  };
}

export async function primeirosPassos(organizationId: string): Promise<Passo[]> {
  return passosDaInstalacao(await lerEstadoDaInstalacao(organizationId));
}
