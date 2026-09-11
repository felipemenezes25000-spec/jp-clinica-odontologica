# Matriz de aceite — CRC AI OS

> **Este documento não declara o projeto pronto.** Ele diz, item por item, o que
> está provado e o que não está. Linha sem evidência não recebe `PASS`.

Gerado em 11/09/2026, sobre `b707949`.

## Leitura rápida

| | |
|---|---|
| **FASE A (P0 de schema)** | concluída e provada |
| **FASES B a I** | não iniciadas |
| **Seguro ligar `ai_agente_envio`?** | **NÃO** |

O motivo do "não" mudou de lugar. Antes desta rodada, a resposta era "não porque
nunca foi avaliado". Agora é **"não porque o runtime durável não existe"**: um
turno que morre no meio não tem retomada, e efeitos externos podem duplicar.

---

## O que esta rodada corrigiu

A auditoria apontou três P0. Eram oito, e juntos significavam uma coisa só: **o
runtime agentic nunca funcionou contra o Postgres real.** Todos os testes passavam
porque o banco em memória guarda objetos e não tem schema — teste e código
concordavam em nomes de coluna inventados.

| Bug | Efeito real | Status |
|---|---|---|
| `crc_conversations.telefone` não existe | PostgREST recusa a consulta → turno morre em `falha_segura`. O agente não respondia ninguém. Dois caminhos. | `PASS` |
| `crc_opportunities.etapa` / `valor_potencial` / `status` não existem | Consulta dentro do `Promise.all` do contexto → todo turno de paciente com oportunidade aberta morria | `PASS` |
| `direcao === "IN"` no contexto | Schema é `ENTRADA\|SAIDA`. Mensagem do paciente virava mensagem da clínica: papéis trocados no prompt, janela nunca abria, portão de repetição comparava contra a fala do paciente | `PASS` |
| filtro `direcao = "IN"` na busca da última entrada | Janela de 24h sempre fechada → em provedor oficial, o agente nunca poderia responder | `PASS` |
| `crc_users.foto_url` ausente dos arquivos SQL | **Correção de um erro meu de diagnóstico:** eu afirmei que o botão de trocar foto sempre falhou. Não falhou — a coluna EXISTE no banco de produção (conferido por consulta). Quem estava fora de sincronia era o `supabase/*.sql`, que não a declarava. O efeito real é outro e continua sério: uma instalação nova a partir dos arquivos nasceria sem a coluna | `PASS` — `supabase/16` traz o arquivo para a realidade do banco, e é `if not exists` |
| `crc_opportunities.prioridade` na busca | Coluna é `priority_score` — tela de busca quebrada. Pré-existente | `PASS` |

**Evidência:** `src/lib/crc/testes/schema.test.ts`, `dominio/direcao.test.ts`,
`aplicacao/janela-envio.test.ts`, `ia-platform/turno.test.ts`.
**Comando:** `npx vitest run` → 714 passando.
**Injeção de defeito:** reverter qualquer uma das três correções principais
quebra teste (verificado).

---

## A guarda estrutural (§3, §14 do prompt)

O pedido era impedir que a classe volte, não corrigir as oito.

| Requisito | Status | Evidência |
|---|---|---|
| Detectar coluna inexistente | `PASS` | `testes/schema.test.ts` varre `src/lib/crc/**` contra `supabase/*.sql`. Achou `foto_url` e `prioridade`, que eu não procurava |
| Fake DB deixar de divergir do schema | `PASS` | `banco-memoria.ts` recusa semear/gravar coluna não declarada. Os 700 testes existentes viraram teste de schema sem reescrita; dois seeds mentirosos apareceram na hora |
| Detectar enum incompatível | `PARCIAL` | `dominio/direcao.ts` cobre `direcao`. Outros enums (`status`, `remetente`, `papel`) ainda não têm normalizador nem verificação |
| Detectar RPC inexistente | `FAIL` | Não implementado |
| Detectar FK inválida / migration faltando | `FAIL` | Não implementado |
| Banco real no CI | `FAIL` | §13 não iniciado — ver abaixo |

---

## Definition of Done (§53)

| # | Requisito | Status | Evidência / o que falta |
|---|---|---|---|
| 1 | Nenhuma query referencia coluna inexistente | `PASS` | `schema.test.ts` |
| 2 | ENTRADA/SAIDA interpretados corretamente | `PASS` | `direcao.test.ts` |
| 3 | Última entrada do paciente é encontrada | `PASS` | `janela-envio.test.ts` |
| 4 | Janela WhatsApp funciona com dados reais | `PARCIAL` | Prova contra banco em memória com valores reais do schema. Contra Postgres de verdade, não |
| 5 | Destino WhatsApp vem de camada canônica | `PASS` | `aplicacao/conversas.ts` |
| 6 | Agent job é durável | `FAIL` | Hoje o agente roda inline no handler de `message.received`. Sem tabela de job, sem claim, sem lease |
| 7 | Retry existe | `FAIL` | — |
| 8 | Dead letter existe | `FAIL` | Existe para eventos (`crc_dead_letters`), não para turnos do agente |
| 9 | Claim é atômico | `FAIL` | — |
| 10 | Idempotência ANTES dos efeitos | `FAIL` | A dedupe da `crc_ai_runs` só acontece no fim do turno. Um crash depois da chamada de modelo repete a chamada |
| 11-13 | Crash não duplica agenda / mensagem / tool | `FAIL` | Não testado, e sem o item 10 não há como garantir |
| 14 | Handoff não falha em silêncio | `FAIL` | `abrirCasoHumano` tem `catch {}` em `ia-platform/turno.ts`. Falta a cascata para tarefa/dead-letter |
| 15 | Ownership revalidado antes do envio | `PARCIAL` | O portão lê o dono, mas no snapshot do início do turno. Falta revalidar no chokepoint |
| 16 | RAG swap atômico | `FAIL` | `DELETE` + `INSERT` separados. Os embeddings são calculados antes (bom), mas a troca não é transacional |
| 17 | Budget concorrente/atômico | `FAIL` | Lê → avalia → chama → soma. Duas chamadas simultâneas passam do teto |
| 18 | Timezone da organização | `FAIL` | `toISOString().slice(0,10)` define "o dia" em `aplicacao/orcamento.ts` |
| 19 | Publicação do agente atômica | `FAIL` | Arquiva e publica em duas operações |
| 20-21 | Banco real no CI / migrations do zero | `FAIL` | — |
| 22 | Tenant isolation com teste real | `PARCIAL` | `conhecimento.test.ts` prova isolamento de knowledge com o filtro dentro do SQL. Falta memória, oportunidade, paciente, casos, credenciais |
| 23 | WAHA | `FAIL` | Não implementado nem formalmente retirado |
| 24 | MCP | `FAIL` | Documentado no ADR-06, não implementado |
| 25 | Providers previstos | `PARCIAL` | OpenAI e Anthropic implementados. Gemini não |
| 26 | Circuit breakers | `FAIL` | — |
| 27 | Tool registry cobre o domínio | `PARCIAL` | 6 tools. O §20 pede ~20 |
| 28 | Studio usa o mesmo runtime | `PASS` | `turno.ts` lê a versão publicada; teste prova |
| 29 | Workflow Studio usa o motor existente | `NOT_APPLICABLE` | Editor não entregue — recorte declarado no roadmap |
| 30 | Playground dry-run | `FAIL` | Não existe |
| 31 | Eval gate cobre segurança/tenant/handoff/tools | `PARCIAL` | Cobre três das quatro. `tenant` não tem caso |
| 32-34 | E2E / recovery / load | `FAIL` | — |
| 35 | CI completo verde | `PARCIAL` | lint, typecheck, testes e build passam localmente. Não há CI com banco |
| 36 | Flags de produção seguras | `PASS` | Todas nascem desligadas; `ai_agente_envio` ainda travado pelo gate de avaliação |
| 37 | Runbook atualizado | `FAIL` | `RUNBOOK.md` não existe |

---

## Bloqueado por terceiro

| Item | Situação |
|---|---|
| WhatsApp (Meta/Twilio) | `BLOCKED_EXTERNAL` — nenhum provedor contratado. Adapters prontos e testados contra sandbox |
| Dental Office | `BLOCKED_EXTERNAL` — credencial não fornecida |

Enquanto os dois estiverem assim, **nenhuma mensagem chega a paciente nenhum, em
nenhuma configuração.** Isso não é um bug: é o estado declarado do projeto.

---

## Ordem sugerida do que falta

A ordem do prompt (§52) continua válida. O que muda é o ponto de partida: FASE A
está feita.

1. **FASE B — job durável + idempotência precoce.** É o maior risco aberto e o
   que bloqueia os itens 6 a 13 de uma vez.
2. **FASE C — handoff garantido, ownership no chokepoint.** Barato perto do que
   protege.
3. **FASE D — RAG/budget/publicação atômicos, timezone.** Quatro RPCs
   transacionais.
4. **FASE E — banco real no CI.** Depois de B–D, porque senão o CI passa a
   reprovar coisas que já se sabe que faltam.
5. **FASES F a I** — adapters, studios, inteligência vertical, observabilidade.

## Como esta matriz deve ser usada

Ela vale para o commit citado no topo. Toda linha que virar `PASS` precisa
ganhar, junto, o arquivo e o teste que provam — e um comando que qualquer pessoa
possa rodar para conferir. `DONE` sem evidência não existe neste documento.
