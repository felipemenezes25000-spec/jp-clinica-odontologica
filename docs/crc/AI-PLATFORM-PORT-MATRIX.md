# Matriz de porte — DeskcommCRM → JP CRC

O DeskcommCRM (MIT, Rafael Melgaço, 2026) entra como **fonte de engenharia**:
comportamento, contratos, invariantes e algoritmos. Não entra como segundo
produto, segundo frontend nem segundo CRM.

O `lib/agent-engine/PORT-NOTES.md` deles é a doutrina de um porte anterior
(Vendaval → Deskcomm) e vale ler antes de mexer em qualquer módulo: as regras
duras que eles fixaram lá são as mesmas que o CRC precisa manter.

**Legenda:** `PORT` copia adaptando · `ADAPT` reescreve com o mesmo contrato ·
`MERGE` funde no que já existe · `DISCARD` não vem · `KEEP` o CRC já tem melhor.

---

## 1. Agent Engine

| Origem | Tamanho | Responsabilidade | Destino no CRC | Ação | Risco |
| --- | ---: | --- | --- | --- | --- |
| `agent/inbound-turn.ts` | **4.083 l** | Turno inbound inteiro | `ia-platform/runtime/turno-inbound.ts` | **ADAPT** | Alto — arquivo monolítico, não copiar |
| `agent/agent-config.ts` | — | Config/versão do agente | `ia-platform/agentes/` | PORT | Baixo |
| `agent/human-cases.ts` · `human-handoff.ts` | — | Casos humanos | `ia-platform/supervisor/` + `crc_human_cases` | PORT | Médio |
| `agent/operator-turn.ts` | — | Supervisor pós-turno | `ia-platform/supervisor/` | ADAPT | Médio |
| `agent/compaction.ts` · `org-memory.ts` · `lead-notes*.ts` | — | Memória | `ia-platform/memoria/` | ADAPT | Médio |
| `agent/intent-classifier.ts` | — | Classificação | **`aplicacao/ia.ts` já faz** | **MERGE** | Baixo |
| `agent/janela-de-atendimento.ts` | — | Janela comercial | **`dominio/configuracao.ts` já faz** | **KEEP** | — |
| `agent/prune-tool-results.ts` | — | Poda de contexto | `ia-platform/contexto/` | PORT | Baixo |
| `agent/preview.ts` · `preview-fixture.ts` | — | Playground sem efeito | `ia-platform/avaliacoes/` | PORT | Baixo |
| `agent/playbook*.ts` | — | Playbooks | — | DISCARD (por ora) | — |

### `guardrails/` — **o módulo mais valioso do porte**

12 arquivos, 2.854 linhas. `before-send.ts` define `Gate` como
`evaluate(ctx) => GateVerdict` e compõe uma cadeia com veto. É contrato puro,
testável sem banco, e encaixa direto em `dominio/`.

| Origem | Destino | Ação |
| --- | --- | --- |
| `guardrails/before-send.ts` (cadeia de Gates) | `dominio/guardrails.ts` + `ia-platform/guardrails/` | **PORT** |
| `guardrails/lgpd/` · `jailbreak/` · `promise/` · `disclosure/` | `ia-platform/guardrails/` | PORT |
| `guardrails/messaging-window.ts` | **`dominio/configuracao.ts` já faz** | KEEP |
| `guardrails/sinal-de-urgencia.ts` · `vazamento-interno.ts` | `dominio/` (puro) | PORT |

### Infra do runtime

| Origem | Tamanho | Destino | Ação | Observação |
| --- | ---: | --- | --- | --- |
| `queue/` | 598 l | **`automacao/motor.ts`** | **MERGE** | O CRC já reserva com `FOR UPDATE SKIP LOCKED` |
| `cron/` | 552 l | `crc_jobs` existente | MERGE | Vercel Hobby: cron só diário |
| `pacing/` + `spinning/` | 864 l | `ia-platform/policies/` | PORT | Anti-burst; complementa cooldown |
| `edge/llm/` | ~2.000 l | `integracoes/ia/` | **PORT** | Roteador + `run-model-call` |
| `edge/channel/` | — | **`integracoes/whatsapp/porta.ts`** | KEEP | O CRC já tem porta abstrata |
| `edge/crm/` | — | — | DISCARD | CRM genérico; o CRC tem paciente |
| `obs/` | 282 l | `servidor/registro.ts` | MERGE | O CRC já tem registro estruturado |
| `health/` · `flywheel/` | 746 l | `ia-platform/avaliacoes/` | PORT | Fase tardia |
| `db/` | 246 l | — | **DISCARD** | Acesso via `servidor/banco.ts` |

---

## 2. Bibliotecas fora do agent-engine

| Origem | Tamanho | Destino | Ação | Por quê |
| --- | ---: | --- | --- | --- |
| `lib/ai/` | 110 arq · 15.785 l | `ia-platform/` + `integracoes/ia/` | ADAPT | Maior fonte; garimpar, não despejar |
| `lib/mcp/` | 39 arq · 6.381 l | `ia-platform/mcp/` | PORT | Gateway MCP como camada de contrato |
| `lib/followup/` | 57 arq · 15.031 l | **`automacao/`** | MERGE | O CRC já tem jornada durável |
| `lib/agenda/` | 31 arq · 6.175 l | **`aplicacao/agendamento.ts`** | **DISCARD** | O CRC tem agenda real do Dental Office |
| `lib/event-log/` | 4 arq · 509 l | Motor de eventos do CRC | MERGE | — |
| `lib/atendimento/` | 6 arq · 502 l | `ia-platform/supervisor/` | ADAPT | — |
| `workers/agent-worker/main.ts` | 634 l | `workers/crc-agent-worker/` | PORT | Worker residente |
| `supabase/migrations/` | 213 arq | `supabase/09-crc-ia.sql` em diante | ADAPT | Prefixo `crc_` obrigatório |

---

## 3. O que não vem, e por quê

- **Rotas Next.js** — o CRC é TanStack Start com `createServerFn`.
- **Autenticação do Deskcomm** — o CRC tem sessão e RBAC próprios.
- **`contacts` / `leads` / `pipeline`** — o CRC tem paciente e oportunidade, que
  são mais específicos e ganham do genérico.
- **Schema sem prefixo `crc_`** — colidiria com o site e o RH no mesmo banco.
- **Supabase SDK na UI** — o CRC fala PostgREST pelo servidor, e isso é
  deliberado.
- **UI do Deskcomm** — o produto final é o JP CRC.
- **Multi-tenant de plataforma** (tenants, impersonate, platform-admins) — a
  clínica é uma organização; isso é complexidade sem cliente.

---

## 4. Atribuição de licença

Ao trazer porção substancial, registrar em `THIRD_PARTY_NOTICES.md` na raiz:

```
DeskcommCRM — MIT License — Copyright (c) 2026 Rafael Melgaço
https://github.com/melgarafael/DeskcommCRM
```

A MIT exige a manutenção do aviso. Não remover.

---

## 5. Ordem de porte, por dependência

```
1. guardrails/before-send  (puro, testável, sem banco)
2. edge/llm                (roteador + chamada de modelo)
3. queue → motor           (merge, não substituição)
4. contexto + checkpoint
5. tools sobre casos de uso existentes
6. memória
7. supervisor
8. RAG
9. MCP
10. workflow studio
```

O item 1 é o que a primeira fatia precisa, e é o de menor risco: entra em
`dominio/`, não toca em nada que já roda.
