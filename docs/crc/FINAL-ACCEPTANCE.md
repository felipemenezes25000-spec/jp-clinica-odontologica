# FINAL-ACCEPTANCE — JP CRC OS

Auditoria honesta do que foi entregue, conforme os itens 280 e 283 do Contrato
de Execução.

O item 283 pede estados distintos, e eles são usados aqui com rigor:

| Estado | Significado |
|---|---|
| `IMPLEMENTADO` | O código existe, compila, tem teste, e nunca foi executado contra o serviço real. |
| `TESTADO_COM_SANDBOX` | Exercitado ponta a ponta contra o adapter local. |
| `TESTADO_COM_API_REAL` | Rodou contra o serviço de verdade. |
| `EM_PRODUCAO` | Ligado e em uso. |
| `BLOQUEADO_POR_CREDENCIAL` | Pronto; falta exclusivamente credencial de terceiro. |

**Nada neste documento está marcado como `TESTADO_COM_API_REAL` ou
`EM_PRODUCAO`.** As credenciais do Dental Office e do WhatsApp não foram
fornecidas, e o schema ainda não foi aplicado no Supabase.

---

## Quadro geral

| Área | Código | Banco | Testes | Verificado na tela | Estado |
|---|---|---|---|---|---|
| Domínio (regras, score, telefone, horário, RBAC) | ✅ | — | 91 testes | — | `IMPLEMENTADO` |
| Schema (36 tabelas, RLS, índices, RPCs) | ✅ | ⚠️ não aplicado | — | — | `IMPLEMENTADO` |
| Conector Dental Office | ✅ | ✅ | 38 testes | — | `BLOQUEADO_POR_CREDENCIAL` |
| Sincronização (paginação, falha parcial, transições) | ✅ | ✅ | parcial | — | `IMPLEMENTADO` |
| Motor de eventos | ✅ | ✅ | parcial | — | `IMPLEMENTADO` |
| Motor de automação (esperas duráveis, 3 modos) | ✅ | ✅ | 26 testes | — | `IMPLEMENTADO` |
| Seis automações padrão | ✅ | ✅ | 26 testes | — | `IMPLEMENTADO` |
| WhatsApp (porta + Meta Cloud + sandbox) | ✅ | ✅ | parcial | — | `BLOQUEADO_POR_CREDENCIAL` |
| IA (structured output, guardrails, fallback) | ✅ | ✅ | 23 testes | — | `IMPLEMENTADO` |
| Sessão + RBAC | ✅ | ✅ | 12 testes | ✅ login | `IMPLEMENTADO` |
| Design system | ✅ | — | — | ✅ 3 resoluções | `IMPLEMENTADO` |
| Home operacional | ✅ | ✅ | — | ⚠️ sem dados | `IMPLEMENTADO` |
| Inbox | ✅ | ✅ | — | ⚠️ sem dados | `IMPLEMENTADO` |
| Funil | ✅ | ✅ | — | ⚠️ sem dados | `IMPLEMENTADO` |
| Pacientes + ficha + timeline | ✅ | ✅ | — | ⚠️ sem dados | `IMPLEMENTADO` |
| Automações (UI) | ✅ | ✅ | — | ⚠️ sem dados | `IMPLEMENTADO` |
| Integrações + kill switches | ✅ | ✅ | — | ⚠️ sem dados | `IMPLEMENTADO` |
| Webhook + inbox pattern | ✅ | ✅ | — | — | `BLOQUEADO_POR_CREDENCIAL` |
| Cron do motor | ✅ | ✅ | — | — | `IMPLEMENTADO` |
| Health check | ✅ | ✅ | — | — | `IMPLEMENTADO` |
| Instalação | ✅ | ✅ | — | — | `IMPLEMENTADO` |
| Orçamentos (Milestone 8) | ⚠️ só schema | ✅ | — | — | **NÃO IMPLEMENTADO** |
| Dashboard executivo (Milestone 9) | ⚠️ só eventos | ✅ | — | — | **NÃO IMPLEMENTADO** |
| Testes E2E (item 82) | ❌ | — | — | — | **NÃO IMPLEMENTADO** |

"⚠️ sem dados" significa: a tela compila, entra no build, e não pôde ser aberta
com conteúdo real porque o schema ainda não está no banco.

---

## O que NÃO foi entregue, explicitamente

Estas são omissões reais, e não estão escondidas em nenhum lugar do código.

### 1. Milestone 8 — Orçamentos (importador CSV, recuperação)

O schema existe (`crc_budgets`, `crc_budget_items`), a regra de elegibilidade
existe e é testada (`orcamentoElegivelParaRecuperacao`), o tipo de oportunidade
`BUDGET_RECOVERY` existe. **Falta** o importador de CSV com preview, o
`BudgetProvider` concreto e a automação de recuperação.

Consequência prática: a Home mostra "valor potencial" com base em oportunidades
sem valor, então o número aparece como `R$ 0,00` até isso existir.

### 2. Milestone 9 — Dashboard executivo e analytics

Os eventos de funil e de receita são **gravados** no servidor no momento em que
os fatos acontecem — essa parte funciona. **Falta** a tela de gestão com
gráficos, funil visual, desempenho por campanha e por atendente, e o cálculo de
speed-to-lead.

### 3. Testes E2E (item 82)

Não existem. A suíte tem 178 testes unitários e de contrato, que cobrem o que o
item 79 lista como obrigatório. Os fluxos ponta a ponta do item 82 exigem banco
de teste e Playwright, que não foram montados.

### 4. Leads e atribuição

`crc_leads` existe com todos os campos de UTM. **Falta** o formulário de
captura, o roteamento de lead novo e o cálculo de speed-to-lead.

### 5. Command palette, visões salvas, exportação

Itens 28, 147 e 129. Não implementados.

---

## Pendências de terceiros (item 282)

Nenhuma delas depende de programação.

| O que falta | Quem resolve | O que destrava |
|---|---|---|
| Rodar `supabase/02-crc-schema.sql` | Você, no SQL Editor | **Tudo.** É o único passo manual. |
| `DENTAL_OFFICE_BASE_URL` / `CLIENT_ID` / `SECRET` | Dental Office | Sincronização real, agenda, agendamento |
| Provedor de WhatsApp (Cloud API ou BSP) | Contratação | Envio e recebimento reais |
| `WHATSAPP_APP_SECRET` | Provedor | O webhook (sem ele, nada é aceito) |
| Aprovação de templates | Meta | Mensagem fora da janela de 24h |
| Integração financeira | Dental Office | Trocar "valor potencial" por "receita" |

---

## Auditoria de código (itens 112, 113, 114)

| Verificação | Resultado |
|---|---|
| `TODO` / `FIXME` / `HACK` críticos | **Zero** |
| `catch {}` vazio em fluxo crítico | **Zero** |
| `any` explícito | **Zero** |
| Mock alimentando tela de produção | **Zero** — os sandboxes recusam subir em produção |
| Botão sem ação | **Zero** — todo botão chama server function real |
| Secret em log | **Zero** — `mascarar()` é aplicada antes de qualquer gravação |
| `npm run lint` | ✅ (1 aviso de `react-refresh`, não bloqueante) |
| `npm run typecheck` | ✅ com `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` |
| `npm run test` | ✅ 178 testes |
| `npm run build` | ✅ |

Duas exceções conscientes ao item 113, ambas comentadas no código: `auditar()` e
`registrarIntegracao()` engolem a própria falha e a registram no log. A
alternativa — deixar o erro subir — faria uma indisponibilidade da tabela de
auditoria impedir o atendente de concluir uma tarefa.

---

## Verificação visual (itens 52, 68, 215–217)

Feita em `vite dev`, sem o schema aplicado.

| Verificação | Resultado |
|---|---|
| `/crc` renderiza | ✅ tela de entrada, design system aplicado |
| 1366×768 | ✅ sem overflow |
| 1920×1080 | ✅ sem overflow |
| 375×812 (mobile) | ✅ `scrollWidth === innerWidth`, sem rolagem horizontal |
| Console em `/crc` | ✅ zero erros |
| **Regressão: site `/`** | ✅ carrega, zero erros |
| **Regressão: portal `/rh`** | ✅ carrega, zero erros |

O item 206 (não quebrar o RH) está cumprido por construção: tabelas com prefixo
`crc_`, módulos em `src/lib/crc`, CSS inteiramente sob `.crc-app`, e zero
alteração em arquivo existente do site ou do RH.

**Não verificado:** as telas com dados (Home, Inbox, Funil, Pacientes,
Automações, Integrações). Elas compilam e entram no build, mas não puderam ser
abertas com conteúdo porque as tabelas `crc_*` não existem no Supabase.
Aplicar o schema destrava essa verificação.

---

## Critérios finais do contrato

| Item | Critério | Situação |
|---|---|---|
| 251 | Dental Office: autentica, pagina, persiste, mapeia status, cria agendamento, trata erro, faz retry | Código completo; `BLOQUEADO_POR_CREDENCIAL` |
| 252 | CRC: paciente pesquisável, ficha, oportunidade, tarefas, timeline, filtros, stages, histórico | ✅ implementado |
| 253 | WhatsApp: envio, recebimento, dedupe, status, opt-out, persistência, falha visível | Código completo; `BLOQUEADO_POR_CREDENCIAL` |
| 254 | IA: classifica, schema válido, confiança, fallback, logging, escalonamento, custo | ✅ implementado e testado |
| 255 | Automação: trigger, condição, wait durável, ação, saída, retry, idempotência, log, pausa | ✅ implementado e testado |
| 256 | UX: desktop, mobile, sem overflow, estados completos, contraste, teclado | ✅ nas telas verificáveis |
| 257 | Produção: migrations aplicadas, env, build, testes, deploy, health, smoke, integrações | ⚠️ falta aplicar o schema e as credenciais |

---

## A frase do item 290

> O projeto estará concluído quando um evento real do Dental Office entrar no
> JP CRC, gerar corretamente uma oportunidade ou automação, produzir a ação
> esperada, receber a resposta do paciente, atualizar os sistemas envolvidos,
> registrar todo o histórico e refletir o resultado nos indicadores.

**Ainda não aconteceu**, e não pode acontecer sem as credenciais.

O que existe é a cadeia inteira construída, com cada elo testado no que dá para
testar sem eles: os mapeadores aguentam as variações de payload, o motor de
eventos deduplica por constraint, as jornadas sobrevivem a deploy, a política de
contato bloqueia o que precisa bloquear, a IA recusa ação inventada, e o
adapter de sandbox exercita o fluxo do item 49 do começo ao fim.

No dia em que a credencial chegar, o que muda é uma variável de ambiente.
