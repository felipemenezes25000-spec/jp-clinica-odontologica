# Auditoria do CRC — rodada de release candidate

> **Reescrito em 12/09/2026 a partir desta execução.** A versão anterior deste
> arquivo listou provas locais e **não conferiu o CI** — que estava vermelho no
> HEAD que ela declarava pronto. A crítica procede, e a correção está na seção 5:
> nenhuma afirmação aqui é feita sem o comando que a produziu.

## 1. HEAD

| | |
|---|---|
| HEAD entregue | `8e797758` (auditado e com CI observado) |
| Ponto de partida da rodada | `1d5c0da7b1539e4335b2598bd55de44d843cff58` |
| Migrations | até `29-crc-publico-e-ciclo.sql` (31 arquivos em `supabase/`) |

```
add5c29  fix: o lock precisa ser gerado pelo npm que o CI usa
2772fbc  fix: a campanha para de perder gente, e a varredura para de rastejar
a1c0c6e  fix: o webhook de entrada passa a ser roteado por canal, antes de confiar no corpo
8e79775  docs: reescreve a auditoria a partir desta execucao
```

---

## 2. Bugs encontrados nesta rodada

### B-1 · `npm ci` quebrado — CI não reproduzível

| | |
|---|---|
| **Severidade** | Bloqueador de release |
| **Cenário** | Todo workflow morria antes de rodar um teste: `Missing: lru-cache@11.5.2 from lock file` |
| **Causa raiz** | O `npm install -D @playwright/test` rodou aqui com **npm 11** (Node 24); o CI usa Node 22, que traz **npm 10**. Eles resolvem *peer dependency opcional* de forma diferente — `lru-cache@^11.2.6` é peer opcional do `unstorage`, dentro do Nitro. A entrada `node_modules/nitro/node_modules/lru-cache` **existia** no lock verde, e o npm 11 a **removeu** |
| **Arquivo** | `package-lock.json` |
| **Correção** | Lock regenerado a partir do último verde, acrescentando só o que faltava: **+46 linhas, 0 remoções** |
| **Teste** | `npx npm@10.9.2 ci` — apaga `node_modules` e reinstala: 304 pacotes |
| **Mutation** | — (a prova é o próprio `npm ci`, que reproduz o erro exato) |
| **Status** | **CORRIGIDO**, CI verde em `add5c29` |

**A primeira tentativa de correção estava errada, e vale registrar.** Regerei o
lock do zero com `npm@10 --package-lock-only`: −1967 linhas. Fui olhar o que
sumiu — `lightningcss-linux-x64-gnu`, `lightningcss-linux-arm64-musl`,
`fsevents`: os binários opcionais das **outras plataformas**, podados por ter
sido gerado no Windows. Teria passado no `npm ci` local e quebrado o runner
Linux. Um lock gerado numa plataforma só serve a uma plataforma só.

**Por que o local não pegou:** rodei `npm test`, `build`, integração e E2E.
Nenhum deles exercita `npm ci` — o passo que quebrou foi o único que não existe
no fluxo local.

---

### B-2 · Campanha truncava o público em 5.000

| | |
|---|---|
| **Severidade** | P0 de dados — pessoas somem sem rastro |
| **Cenário** | Filtro que casa 8.000 pacientes congela 5.000. As outras 3.000 não existem para ninguém: nem no número da tela, nem num aviso, nem no log |
| **Causa raiz** | `selecionar(..., { limite: MAX_PUBLICO })` e `publico: pessoas.length`. Um `limite` escrito como proteção, lido como resultado |
| **Arquivo** | `aplicacao/campanhas.ts` |
| **Correção** | `contar()` com `count=exact` dá o público real; congelamento por **keyset** em páginas de 500, com `INSERT` em **lote**. Acima do teto (agora 50.000) a operação **recusa e diz o número** |
| **Teste** | `publico-da-campanha.test.ts` — 100 / 964 / 5.000 / 8.000, duplicatas, opt-out, consulta futura, recusa |
| **Mutation** | `limite: MAX_PUBLICO` de volta → `expected 5000 to be 8000` |
| **Status** | **CORRIGIDO** |

É a **terceira** vez que este defeito aparece no sistema: o recall lia 200 e
chamava de base, o aniversário lia 2.000 e chamava de base, a campanha lia 5.000
e chamava de público.

**Efeito colateral corrigido junto:** o congelamento fazia um `INSERT` por
paciente — 8.000 idas ao PostgREST. Agora são dezesseis.

---

### B-3 · O filtro de campanha escondia valores

| | |
|---|---|
| **Severidade** | P1 — o dado existe e a interface jura que não |
| **Cenário** | `opcoesDoPublico` lia 5.000 pacientes e fazia `Set` em memória. Especialidade que só existe depois dessa linha some da tela; a pessoa conclui que a clínica não tem o recorte e monta a campanha sem ele |
| **Causa raiz** | Distinct em memória sobre uma página |
| **Arquivo** | `aplicacao/campanhas.ts`, `supabase/29` |
| **Correção** | `crc_opcoes_de_publico` faz o distinct no banco, com índice parcial, e respeita `clinic_id` |
| **Teste** | especialidade na linha 5.999 é encontrada; a unidade filtra |
| **Mutation** | não isolada — o teste de 6.000 linhas já reprova a versão antiga por construção |
| **Status** | **CORRIGIDO** |

---

### B-4 · Recall convergia em quarenta dias

| | |
|---|---|
| **Severidade** | P1 de operação |
| **Cenário** | 200 pacientes por volta pesada, uma por dia → 8.000 em **40 dias**. Recall é justamente a rotina que não pode demorar um mês |
| **Causa raiz** | Uma página por execução |
| **Arquivo** | `automacao/handlers.ts` |
| **Correção** | Laço de páginas até o teto (**1.200**) ou o orçamento de tempo (**20s**). **7 dias** para 8.000 |
| **Teste** | 500 numa volta; 8.000 em 6–8 voltas; corte por tempo; empate de data; página que falha |
| **Mutation** | cursor fixo em `null` → `expected 200 to be 500` (rodada anterior, ainda válida) |
| **Status** | **CORRIGIDO** |

**O cursor passou a avançar DEPOIS do trabalho.** Antes avançava antes, e havia
lógica: com uma página por volta, um lote que estourasse o tempo seria relido
para sempre. Com o laço, o corte acontece **entre** páginas — a página ou
termina e o cursor anda, ou a volta morre no meio e ela é relida. Reler é seguro
(a chave de dedupe inclui o ciclo); pular não é.

---

### B-5 · O alerta de varredura não media o que prometia

| | |
|---|---|
| **Severidade** | P1 — alarme cego, criado por mim na rodada anterior |
| **Cenário** | O sinal olhava `crc_scan_state.atualizado_em` e dizia "não completa uma volta há dez dias". Mas `atualizado_em` muda **a cada página**: a varredura do B-4, rastejando 200/dia, tinha o campo sempre fresco. Trinta dias sem fechar ciclo, com o painel verde |
| **Causa raiz** | Uma coluna só não distingue "não anda" de "anda devagar" |
| **Arquivo** | `aplicacao/saude.ts`, `supabase/29` |
| **Correção** | `ciclo_iniciado_em` e `ultimo_ciclo_completo_em`. Três estados: **PARADA** (crítico), **CICLO LENTO** (atenção), **SAUDÁVEL** (silêncio). Parada vence lenta — aumentar o teto não conserta falta de progresso |
| **Teste** | um caso por estado, em `heartbeat.test.ts` |
| **Mutation** | não atualizar `ultimo_ciclo_completo_em` → `expected null not to be null` |
| **Status** | **CORRIGIDO** |

---

### B-6 · Webhook de entrada não era multi-tenant

| | |
|---|---|
| **Severidade** | P0 arquitetural de SaaS |
| **Cenário** | Com dois Meta Apps, o segredo de A não valida a assinatura de B — mensagem legítima recusada. E se só A estiver cadastrado, **qualquer corpo assinado por A passa dizendo ser de quem quiser** |
| **Causa raiz** | `provedorParaWebhook()` monta o adapter do ambiente; a assinatura precisa da credencial *daquele canal*, e descobrir o canal pelo corpo exigiria confiar no corpo |
| **Arquivo** | `routes/api/crc/whatsapp.$canal.tsx`, `integracoes/credenciais.ts`, `.../whatsapp/provedores.ts` |
| **Correção** | Rota `/api/crc/whatsapp/:canal`. O `:canal` é um **id público** que só seleciona a linha; a confiança nasce da assinatura verificada com a credencial dela. E o destinatário do payload precisa **conferir** com o canal |
| **Teste** | `canal-de-entrada.test.ts` — 9 casos |
| **Mutation** | aceitar canal desativado → `expected {…} to be null` |
| **Status** | **CORRIGIDO**; rota antiga mantida com as condições escritas no cabeçalho |

---

### B-7 · Upsert de linha inteira zerava o contador de ciclo

| | |
|---|---|
| **Severidade** | P1 — defeito que eu introduzi nesta mesma rodada |
| **Cenário** | `gravar` é upsert com `resolution=merge-duplicates`: coluna ausente do corpo volta ao **DEFAULT**, não ao valor anterior. Na página que não fecha o ciclo eu omitia `ciclo` — zerando o contador a cada página |
| **Arquivo** | `automacao/handlers.ts` |
| **Correção** | Toda coluna vai no payload, inclusive as que não mudam |
| **Teste** | o próprio teste de ciclo reprovou com `expected undefined to be +0` |
| **Status** | **CORRIGIDO antes de sair daqui** |

---

## 3. Migrations

| Arquivo | Código presente | Testada local | Aplicada em produção |
|---|:--:|:--:|:--:|
| `25-crc-retry-atomico-e-tenant-no-inbox.sql` | sim | sim | **NÃO** — `PGRST202` em `crc_encerrar_agent_job` |
| `26-crc-varreduras-convergentes.sql` | sim | sim | **NÃO** — `PGRST202` em `crc_aniversariantes` |
| `27-crc-observabilidade.sql` | sim | sim | **NÃO** — `crc_runtime_heartbeats` não existe |
| `28-crc-configuracao-por-clinica.sql` | sim | sim | **NÃO** — `crc_settings_clinica` não existe |
| `29-crc-publico-e-ciclo.sql` | sim | sim | **NÃO** — `PGRST202` em `crc_opcoes_de_publico` |

"Testada local" = aplicada em Postgres 16 limpo pelo `aplicar-schema.mjs`, com
`schema:status` sondando o objeto criado e os 74 testes de integração passando.

### O estado de produção, MEDIDO

Isto deixou de ser suposição. `npm run schema:status` contra o Supabase real:

```
30 arquivos · 14 sondados · 5 falha(s)
Registro: AUSENTE — crc_schema_migrations não existe (rode supabase/27).

02, 09, 14, 17, 20, 21, 22, 23, 24 ....... OK
25, 26, 27, 28, 29 ....................... FALHOU
```

**Produção está exatamente na 24.** As nove sondas que existem para as migrations
anteriores passam; as cinco novas falham, cada uma no objeto que ela cria.

Note que a coluna `registro` está toda em `—`: `crc_schema_migrations` nasce na
27, então em produção ela ainda não existe. É o desenho funcionando — a **sonda**
respondeu sem depender de bookkeeping nenhum.

---

## 4. Testes — comandos e números reais

```
$ npx npm@10.9.2 ci                        added 304 packages in 23s
$ npx eslint src vite.config.ts eslint.config.js
                                           0 erros (5 avisos de fast-refresh, pré-existentes)
$ npm run typecheck                        limpo
$ npm test                                 1187 passed
$ npm run test:integracao                   74 passed   (Postgres 16 + PostgREST, schema do zero)
$ npm run e2e                               10 passed (27.5s)
$ npm run build                            ok
$ npm run schema:status                    30 arquivos · 14 sondados · 0 falhas
```

### Testes novos nesta rodada

| Arquivo | Casos |
|---|---|
| `aplicacao/publico-da-campanha.test.ts` | 12 — escalas 100/964/5.000/8.000, recusa acima do teto, opções do filtro |
| `automacao/varreduras-convergentes.test.ts` | 13 (reescrito) — 500, 2.500, 8.000, teto por tempo, página que falha, ciclo |
| `integracoes/canal-de-entrada.test.ts` | 9 — isolamento de entrada por canal |
| `aplicacao/heartbeat.test.ts` | +1 — os três estados da varredura |

### Mutações verificadas

| Mutação | Detectada por | Sinal |
|---|---|---|
| `limite: MAX_PUBLICO` de volta | público 8.000 | `expected 5000 to be 8000` |
| `ultimo_ciclo_completo_em` não atualizado | ciclo fecha | `expected null not to be null` |
| clínica da conversa → primeira ativa | contexto de agendamento | `expected 'aaaa…' to be 'bbbb…'` |
| override de clínica ignorado | configuração da unidade | `expected '19:00' to be '22:00'` |
| canal desativado aceito | canal de entrada | `expected {…} to be null` |
| `on_conflict` errado em `crc_scan_state` | integração | `42P10` |
| cache de token com chave fixa | credenciais | `expected 'tok-cli-A' to be 'tok-cli-B'` |

**Duas mutações NÃO foram detectadas por um teste que parecia cobri-las**, e
isso está registrado porque muda como os testes foram escritos:

- **retry atômico** — o caso "o job não fica elegível" continua verde com o
  defeito: o estado final é idêntico nas duas versões. Por isso o teste conta
  **escritas**, e o de integração observa a janela contra Postgres real.
- **cadência de campanha** — o total do dia continua 100 com o defeito. A
  asserção que discrimina é sobre a **forma** do dia, não sobre o total.

---

## 5. CI

**Observado em `8e79775`** — o HEAD entregue, e não um commit anterior:

| Workflow | SHA | Resultado |
|---|---|---|
| Quality | `8e79775` | **success** |
| CRC Integração | `8e79775` | **success** |
| CRC Smoke | `8e79775` | **success** |
| CRC Pulso | `8e79775` | **failure** — `CRON_SECRET` ausente (ver seção 6) |

Os números que o CI imprimiu, e não os que rodei aqui:

```
Testes de integração    Test Files  5 passed (5)
Testes de integração          Tests 74 passed (74)
E2E de navegador        10 passed (26.2s)
```

O Playwright **rodou de verdade** no runner — a linha acima vem do log do
workflow, e não de uma execução local.

---

## 6. Produção

| | Estado | Por quê |
|---|---|---|
| **Supabase** | `FAIL` | **medido**: produção está na migration 24; as cinco novas não estão aplicadas. Ver seção 3 |
| **GitHub Pulso** | `FAIL` | `gh secret list` volta **vazio**: `CRON_SECRET` não existe no repositório |
| **WhatsApp** | `BLOCKED_EXTERNAL` | nenhum contrato. Adapters prontos; entrada e saída roteadas por canal |
| **Dental Office** | `BLOCKED_EXTERNAL` | credenciais não cadastradas. Adapter completo, `INCERTO` + reconciliação preservados |
| **IA** | `BLOCKED_EXTERNAL` | sem chave cadastrada. Gateway, orçamento, disjuntor e gate de avaliação prontos |

**Por que eu não apliquei as migrations.** O `.env` local tem `SUPABASE_URL` e
`SUPABASE_SERVICE_ROLE` — que falam com o **PostgREST**, e PostgREST não executa
DDL. A função `crc_teste_sql`, que executa SQL arbitrário, existe só no banco de
teste, e o `supabase/99` explica em letras garrafais por quê.

Para aplicar faltaria um destes, e nenhum está presente:

- `DATABASE_URL` (a *connection string* do painel do Supabase) — com ela eu rodo
  os cinco arquivos por `psql`;
- `SUPABASE_ACCESS_TOKEN` + senha do banco, para o `supabase` CLI.

**Sobre o `CRON_SECRET`:** não o criei. O valor precisa ser **o mesmo** na Vercel
e no GitHub — gerar um aqui faria o workflow autenticar contra um segredo que a
Vercel não conhece, e o sintoma seria 401 em vez de "não configurado", que é pior
de diagnosticar. É ação externa:

```bash
gh secret set CRON_SECRET       # o mesmo valor que está na Vercel
```

---

## 7. Escala — respostas diretas

**Campanha de 8.000 perde alguém?**
Não. Teste com 8.000 congela 8.000, com 8.000 `patient_id` distintos. Acima de
50.000 a operação recusa e informa o número — nunca corta.

**Quanto demora um ciclo de recall com 8.000?**
Sete dias. Teto de 1.200 por volta pesada (uma por dia), medido: 6 a 8 voltas
para fechar o ciclo no teste.

**Qual é o throughput esperado?**
Recall: 1.200 pacientes/dia, ou o que couber em 20s — o que vier primeiro.
Campanha: `porDia` da campanha, distribuído pela janela comercial com cota
acumulada, teto de 10 por volta do pulso.
Congelamento: páginas de 500, `INSERT` em lote.

**Existe truncamento silencioso?**
Não encontrei nenhum restante nos caminhos de escala. Os `limite:` que sobram são
de UI (listas de 40–500 numa tela) ou de diagnóstico. Os três que representavam
"toda a base" — recall 200, aniversário 2.000, campanha 5.000 — foram corrigidos.

**Existe query limitada que represente "toda a base"?**
Uma, conhecida e documentada: o fallback de `opcoesDoPublico` quando o banco
ainda não tem o `supabase/29`. Ele é o comportamento antigo, existe só para a
janela entre deploy e SQL, e o sinal `schema_atrasado` denuncia a janela.

---

## 8. Multi-tenant — respostas diretas

| Pergunta | Resposta |
|---|---|
| Outbound tenant-safe? | **Sim.** Credencial por clínica → organização → ambiente; o ambiente se desliga sozinho quando há mais de um tenant. Cache de token por credencial |
| Inbound tenant-safe? | **Sim, pela rota `/:canal`.** A rota antiga continua válida sob condição escrita: um Meta App só, e nenhum canal com credencial própria |
| Dental Office tenant-safe? | **Sim.** `crc_integracoes_clinica`, com recusa explícita quando ambíguo |
| Configuração por clínica? | **Sim.** `crc_settings_clinica`, mesclado por campo sobre a configuração da organização |
| Criação de nova organização? | **Sim**, `criarOrganizacao()`, idempotente por slug |
| Criação de segunda unidade? | **Motor sim, tela não.** `criarClinica()` existe e é testada; nenhuma interface a chama |
| Usuário restrito a uma clínica? | **RBAC sim, tela não.** `alcancaClinica` é testado e exercitado no E2E; o convite herda as clínicas de quem convida, e o admin alcança todas — então todo convidado nasce com acesso total |

As duas lacunas são **telas faltando para um motor que existe**, e o E2E as
contorna por insert direto, dizendo isso no comentário.

---

## 9. GO / NO-GO

| Capacidade | Veredito | Condição |
|---|---|---|
| **CRC manual** (Inbox, funil, agenda, pacientes) | **GO** | depois das migrations 25–29 |
| **Shadow AI** (`ai_agente_sombra`) | **GO** | precisa de chave de IA. Não fala com ninguém |
| **AI responder** (`ai_agente_envio`) | **NO-GO** | a suíte de avaliação nunca rodou contra o modelo real |
| **AI escrever Dental Office** | **NO-GO** | depende do anterior e do Dental Office em escrita |
| **Auto scheduling** | **NO-GO** | depende dos dois anteriores |
| **SaaS multi-cliente** | **NO-GO parcial** | o motor está pronto; faltam as duas telas da seção 8 |

---

## 10. Critério de aceite

| | |
|:--:|---|
| ☑ | `npm ci` em clone limpo — `npx npm@10.9.2 ci`, 304 pacotes |
| ☑ | lint verde |
| ☑ | typecheck verde |
| ☑ | unit verde — 1187 |
| ☑ | integração verde — 74 |
| ☑ | build verde |
| ☑ | E2E verde — 10 |
| ☑ | **CI verde NO HEAD entregue** — Quality, Integração e Smoke em `8e79775` |
| ☑ | nenhuma campanha trunca silenciosamente |
| ☑ | campanha de 8.000 testada |
| ☑ | recall de 8.000 testado |
| ☑ | health diferencia sem progresso de ciclo lento |
| ☑ | outbound tenant-safe |
| ☑ | inbound tenant-safe |
| ☑ | migrations novas testadas (local) |
| ☑ | schema esperado explícito — `schema:status` + sinal `schema_atrasado` |
| ☑ | nenhum segredo commitado |
| ☑ | nenhuma regressão nos P0 já corrigidos — mutações da rodada anterior rerodadas |

**RELEASE CANDIDATE**, com uma ressalva que não é do código.

Os dezessete itens da lista estão marcados. O que sustenta a palavra é a seção 5:
os três workflows verdes no SHA entregue, com os números vindo do log do runner.

**A ressalva:** o `CRC Pulso` continua vermelho, e ele é o único workflow que
depende de um segredo que só você pode criar. Ele não bloqueia o release do
código — bloqueia a OPERAÇÃO, porque sem ele a fila não anda. É a primeira das
duas ações externas da seção 6.

E **RELEASE CANDIDATE não é GO para a IA**: os três NO-GO da seção 9 seguem de
pé, e o gate de avaliação contra o modelo real continua sendo a condição.

---

## 11. Riscos remanescentes

| Risco | Mitigação |
|---|---|
| As cinco migrations não rodarem antes do próximo deploy | `schema:status` no deploy; sinal `schema_atrasado`; os caminhos novos degradam em vez de parar — exceto recall e aniversário, que **param** sem o `26` |
| `@playwright/test` é `^1.62.1` e resolveu 1.63.0 | O lock pina a versão, então `npm ci` é determinístico. O que varia é o binário do navegador, baixado por `playwright install` na mesma versão |
| Assinatura do Twilio é por conta, e a rota antiga a lê do ambiente | Para a Meta a rota nova resolve; para o Twilio multi-tenant, use a rota `/:canal` com `accountSid` no `config` |
| Rate limit de login é em memória, por instância | Documentado no módulo: **não é defesa distribuída**. A defesa real é na borda |
| Teto de recall de 1.200 nunca foi medido contra Postgres real com 8.000 linhas | O número vem da aritmética e do teste no fake. O orçamento de 20s protege o caso em que a conta estiver otimista |
| Nenhuma tela para abrir a segunda unidade nem para escopar usuário | Registrado na seção 8. É trabalho de UI sobre motor pronto |
