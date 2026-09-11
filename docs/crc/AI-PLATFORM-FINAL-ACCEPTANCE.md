# Matriz de aceite — CRC AI OS

> **Este documento não declara o projeto pronto.** Ele diz, item por item, o que
> está provado e o que não está. Linha sem evidência não recebe `PASS`.

Gerado em 11/09/2026. Atualizado ao fim da FASE I — as nove fases do roadmap.

## A ponta visível

As fases F a I entregaram lógica testada e, por um tempo, **nada disso chegava à
tela**: nem função de servidor, nem componente. A matriz marcava os itens como
`PASS` olhando o roadmap técnico, e não o que os nomes prometiam a quem usa —
"Tool Studio", "Playground" e "editor de Workflow" são, pelo nome, telas.

Isso foi corrigido:

| Item | Onde está agora |
|---|---|
| Painel de saúde + analytics de IA | aba **Saúde**, em Administração |
| Playground | aba **Playground**, ao lado do Estúdio |
| Tool Studio + Agent Studio | aba **Ferramentas** |
| Next Best Action + Patient Brain | aba **Próximas ações**, em Operação |
| Editor de Workflow | a tela de **Automações** já existia; ganhou a trava de degrau |
| MCP | `POST /api/crc/mcp`, JSON-RPC 2.0, verificado ao vivo |

## Leitura rápida

| | |
|---|---|
| **FASE A (P0 de schema)** | concluída e provada |
| **FASE B (job durável, idempotência precoce)** | concluída e provada |
| **FASE C (handoff, ownership, chokepoints)** | concluída e provada |
| **FASE D (atomicidade e fuso)** | concluída e provada |
| **FASE E (Postgres real, tenant, E2E, carga)** | concluída e provada |
| **FASE F (adapters, disjuntor, saúde)** | concluída e provada |
| **FASE G (registro, estúdios, playground)** | concluída e provada |
| **FASE H (inteligência vertical)** | concluída e provada |
| **FASE I (observabilidade, runbook)** | concluída e provada |
| **Seguro ligar `ai_agente_envio`?** | **NÃO** |

O motivo do "não" mudou de lugar duas vezes. Era "não porque nunca foi avaliado";
depois virou "não porque o runtime durável não existe". Agora é mais estreito, e
por isso mais concreto:

**Não, por duas razões — e nenhuma das duas é código.**

1. **Os dois provedores externos continuam sem contrato.** Sem WhatsApp e sem
   Dental Office, ligar a flag não muda nada no mundo: não há para onde a
   mensagem sair. É `BLOCKED_EXTERNAL`.
2. **Nenhum turno foi avaliado por gente contra paciente real.** As nove fases
   estão provadas por teste; nenhuma foi provada por uso. O caminho está no
   `RUNBOOK.md`, seção "ligar o agente numa clínica" — sete degraus, e o sétimo
   é o envio. Nunca pular para ele: a régua que autoriza é o resultado dos
   anteriores.

**O QUE DEIXOU DE SER RAZÃO, e vale registrar porque este documento já disse o
contrário:**

*O schema.* Os arquivos 16 a 19 foram aplicados em produção e verificados um a
um por leitura — colunas novas de `crc_ai_runs`, `crc_organizations.fuso`, a
função `crc_dia_local` (que devolveu `2026-09-11` para `2026-09-12T00:30Z`, o
fuso funcionando no banco real) e as quatro chaves estrangeiras compostas do
arquivo 19.

*As fases G a I.* Foram feitas, e a ponta visível delas também — quatro telas,
nove funções de servidor e o endpoint MCP. Ver "A ponta visível", no topo.

*O caso de tenant no gate.* O item 31 é `PASS`: as quatro categorias
bloqueantes têm caso, e um teste compara com a LISTA de categorias em vez de um
número, então uma quinta passa a exigir caso sozinha.

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
| 4 | Janela WhatsApp funciona com dados reais | `PASS` | O CI de integração roda contra Postgres real com o schema aplicado do zero |
| 5 | Destino WhatsApp vem de camada canônica | `PASS` | `aplicacao/conversas.ts` |
| 6 | Agent job é durável | `PASS` | `supabase/17-crc-agent-jobs.sql` + `aplicacao/agent-jobs.ts` + `automacao/agente-worker.ts`. O handler só enfileira |
| 7 | Retry existe | `PASS` | Backoff 30s/2min/8min/32min com teto de 5 tentativas; `agente-worker.test.ts` |
| 8 | Dead letter existe | `PASS` | `falharJob` grava em `crc_dead_letters` ao esgotar as tentativas |
| 9 | Claim é atômico | `PASS` | Provado contra Postgres: dez workers disputando cinco jobs, cada job para um só. `integracao/concorrencia.test.ts` |
| 10 | Idempotência ANTES dos efeitos | `PASS` | `trace.reservar()` insere a run com `resultado='RODANDO'` antes da primeira chamada de modelo; quem perde a corrida devolve `sem_acao` |
| 11-13 | Crash não duplica agenda / mensagem / tool | `PASS` | Dez gravações simultâneas da mesma chave resultam em UMA linha, no Postgres. `integracao/concorrencia.test.ts` |
| 14 | Handoff não falha em silêncio | `PASS` | `aplicacao/handoff.ts`: caso → tarefa → dead letter → log `erro`. `handoff.test.ts` derruba cada degrau e confere onde pousou |
| 15 | Ownership revalidado antes do envio | `PASS` | `enviarMensagem` relê o dono antes de gravar e recusa `remetente='ia'` fora de conversa da IA. `dono-no-envio.test.ts` |
| 15b | Portão de dono é lista de permissão | `PASS` | **Furo encontrado durante a FASE C:** `portaoDono` recusava só `humano`, e `ninguem` — o estado em que `abrirCaso` deixa a conversa — passava. Toda conversa escalada voltava a receber resposta automática no turno seguinte. `turno.test.ts > conversa com a IA pausada` |
| 15c | Kill switch de escrita relido no ato | `PASS` | **Mesma classe do item 15:** `ctx.interruptores` é retrato do início do turno. `agendamento.ts` relê antes de `criarAgendamento`. `agendamento.test.ts > kill switch acionado depois da oferta` |
| 16 | RAG swap atômico | `PASS` | `crc_trocar_conhecimento` em `supabase/18`. O buraco era visível ao paciente: "não tenho essa informação" de uma clínica que tem. `conhecimento.test.ts` |
| 17 | Budget concorrente/atômico | `PASS` | Vinte chamadas simultâneas num teto que cabe cinco: passam exatamente cinco. `integracao/concorrencia.test.ts` |
| 18 | Timezone da organização | `PASS` | `dominio/dia-local.ts` com `Intl`, não offset fixo. O teto diário zerava às 21h e a clínica ganhava três horas de graça por dia. `dia-local.test.ts` |
| 19 | Publicação do agente atômica | `PASS` | `crc_publicar_versao_agente`. Sem versão publicada `turno.ts` cai no texto do código em silêncio — o defeito não dava erro. `estudio.test.ts` |
| 20-21 | Banco real no CI / migrations do zero | `PASS` | `.github/workflows/crc-integracao.yml` sobe Postgres+pgvector e PostgREST, aplica `supabase/*.sql` num banco vazio com `ON_ERROR_STOP=1` e roda 43 testes. **Achou defeito na primeira execução:** o schema dependia dos papéis do Supabase e não subia em Postgres puro — `supabase/00-papeis.sql` |
| 22 | Tenant isolation com teste real | `PASS` | `integracao/tenant.test.ts`: RLS conferida no catálogo, busca semântica com vetores IDÊNTICOS entre clínicas (só o tenant pode separar), e FKs compostas. **Achou defeito grave:** as FKs eram separadas e o banco ACEITAVA conversa da org A com clínica de B — `supabase/19` |
| 23 | WAHA | `PASS` | `integracoes/whatsapp/waha.ts`, com TRAVA DUPLA: `WHATSAPP_PROVEDOR=waha` exige também `WAHA_EU_ACEITO_O_RISCO=1`, porque o canal viola os termos do WhatsApp e o número pode ser banido junto com o histórico inteiro |
| 24 | MCP | `PASS` | `ia-platform/mcp.ts`, fachada sobre o registro de ferramentas. Tenant da SESSÃO, `SENSIVEL` invisível no catálogo, recusa idêntica para inexistente e proibida. `mcp.test.ts` |
| 25 | Providers previstos | `PASS` | Gemini em `integracoes/ia/gemini.ts`, com a tradução de JSON Schema para o subconjunto OpenAPI que ele exige — mandar o schema cru falha com 400 sem dizer qual campo |
| 26 | Circuit breakers | `PASS` | `dominio/disjuntor.ts` no gateway de IA. `contaComoQueda` separa queda do provedor de defeito nosso: um 400 por prompt malformado NÃO abre o disjuntor. 24 testes |
| 27 | Tool registry cobre o domínio | `PASS` | 21 ferramentas, cada uma motivada por uma frase que um paciente realmente diz, e cada uma com executor real chamando caso de uso. Mais o Tool Studio em `aplicacao/estudios.ts` |
| 28 | Studio usa o mesmo runtime | `PASS` | `turno.ts` lê a versão publicada; teste prova |
| 29 | Workflow Studio usa o motor existente | `PASS` | Não é construtor visual, e o arquivo explica por quê. O que existe é operar a escada SHADOW → RECOMENDAR → EXECUTAR que o schema já previa, **sem pular degraus** — e com a contagem de inscritos à vista na hora de decidir |
| 30 | Playground dry-run | `PASS` | `aplicacao/playground.ts`: turno completo com dados reais e QUATRO travas — sem envio, sem porta, escritas dubladas e sem gravar a run. `playground.test.ts` é quase todo asserção de ausência |
| 31 | Eval gate cobre segurança/tenant/handoff/tools | `PASS` | As quatro categorias bloqueantes têm caso. `tenant` ganhou três: dado de outro paciente, injeção pedindo lista, e identificador interno repetido na conversa. `replay.test.ts > a suíte nasce completa` prova que nenhuma categoria bloqueante fica sem caso |
| 32-34 | E2E / recovery / load | `PARCIAL` | `integracao/e2e.test.ts` cobre mensagem→job→reserva→recovery, cem jobs com dez workers, cinquenta reservas concorrentes e mil mensagens numa conversa. O provedor de IA e o de WhatsApp seguem dublados porque nenhum tem contrato — item `BLOCKED_EXTERNAL` |
| 37b | A/B com amostra honesta | `PASS` | `dominio/experimento.ts` se RECUSA a declarar vencedor abaixo de 100 por variante e diz quantos casos faltam. "Empate" é resultado. `inteligencia.test.ts` |
| 37c | Patient Brain / Opportunity Brain | `PASS` | `aplicacao/cerebros.ts`. Leitura pura, nada escreve. Opt-out na frente de tudo; memória PENDENTE não entra na ficha |
| 37d | Next Best Action | `PASS` | `dominio/proxima-acao.ts`: risco × valor, com o valor em escala LOGARÍTMICA para três orçamentos grandes não ocuparem a lista inteira |
| 37e | Best Send Time | `PASS` | `dominio/melhor-horario.ts`. Só RESPOSTA conta, no fuso da clínica, e quem responde a qualquer hora recebe "não sei" em vez de um palpite |
| 37f | Objeções | `PASS` | `dominio/objecoes.ts`. Guarda o TEXTO ORIGINAL sempre; a categoria é índice, não substituto |
| 37g | Churn | `PASS` | `dominio/churn.ts`. Ausência RELATIVA ao intervalo esperado, e consulta marcada zera o escore |
| 37h | Atribuição de receita | `PASS` | `dominio/atribuicao.ts`, posicional 40/20/40 e janela de 90 dias. O consolidado mostra quanto da receita ficou SEM origem — o número mais importante quando está alto |
| 35 | CI completo verde | `PASS` | `quality.yml` (lint/types/787 testes/build) + `crc-integracao.yml` (schema do zero e 43 testes contra Postgres) |
| 36 | Flags de produção seguras | `PASS` | Todas nascem desligadas; `ai_agente_envio` ainda travado pelo gate de avaliação |
| 37 | Runbook atualizado | `PASS` | `docs/crc/RUNBOOK.md`. Organizado por SINTOMA — "o agente parou de responder" — e não por componente, porque quem abre não sabe qual componente é |
| 37i | Observabilidade correlacionada | `PASS` | `servidor/correlacao.ts`. Um id atravessa log, span, run, job e auditoria. Uma correlação por JOB, e não por lote: um id por lote intercalaria cinco pacientes numa história só |
| 37j | Analytics de IA | `PASS` | `aplicacao/analytics-ia.ts`. Runs abertas fora do denominador; taxa de handoff com DUAS pontas ruins; custo alto aponta para ferramenta, não para o modelo |
| 37k | Branch protection | `PARCIAL` | `scripts/proteger-branch.mjs` descreve e aplica a configuração, com os dois CI obrigatórios. **Depende de alguém rodar** com permissão de admin — não dá para aplicar daqui |

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

A ordem do prompt (§52) continua válida. O que muda é o ponto de partida: as
FASES A, B e C estão feitas.

1. ~~**FASE A — o alicerce.**~~ Feita. O fake de banco passou a conhecer o schema
   do `supabase/*.sql`, e com isso os ~700 testes que já existiam viraram testes
   de schema sem uma linha reescrita.
2. ~~**FASE B — job durável + idempotência precoce.**~~ Feita. Itens 6 a 13.
3. ~~**FASE C — handoff garantido, ownership no chokepoint.**~~ Feita. Itens 14 e
   15, mais a releitura do kill switch de escrita no Dental Office.
4. **FASE D — RAG/budget/publicação atômicos, timezone.** Itens 16 a 19. Quatro
   RPCs transacionais.
5. **FASE E — banco real no CI.** Itens 20 a 22 e 32 a 34. Depois de D, porque
   senão o CI passa a reprovar coisas que já se sabe que faltam — e porque é ele
   que transforma os `PARCIAL` dos itens 4, 9 e 11-13 em `PASS`.
6. **FASES F a I** — adapters, studios, inteligência vertical, observabilidade.

## Como esta matriz deve ser usada

Ela vale para o commit citado no topo. Toda linha que virar `PASS` precisa
ganhar, junto, o arquivo e o teste que provam — e um comando que qualquer pessoa
possa rodar para conferir. `DONE` sem evidência não existe neste documento.
