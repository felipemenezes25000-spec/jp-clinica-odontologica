# CRC Autopilot — FASE A

Relatório da implementação da FASE A do Prompt Mestre (Clinic Growth OS).

```
Ultimo commit de CODIGO   6591ca4
Branch                    main
Commits da fase           9fe4304 · 65990ef · ce69330 · dc57796 · 2a4035d · 6591ca4
Estado                    LOCAL — ainda nao empurrado, CI ainda nao rodou
Data                      2026-09-12
```

> Um relatorio nao consegue conter o SHA do proprio commit. O que esta acima e o
> ultimo commit que mexe em CODIGO; este documento e o commit seguinte, e nao
> altera comportamento nenhum.

> **Nada aqui diz "CI verde" ou "em produção" sem evidência.** As seções 6 e 7
> separam o que foi observado do que não foi.

---

## 1. O que a FASE A pedia, e o que foi feito

O Prompt Mestre lista 141 seções. A FASE A (§128) são seis itens:

| # | Item | Resultado |
|---|---|---|
| 1 | Revenue opportunity model | **Feito** — estendendo `crc_opportunities` |
| 2 | Value attribution | **Feito** — `crc_attribution_events` |
| 3 | Next Best Action | **Domínio feito**, não ligado ao motor |
| 4 | Autonomy Center | **Motor e API feitos**, sem tela |
| 5 | Activity timeline | **Tabela e serviço feitos**, ninguém escreve ainda |
| 6 | Home nova | **Não feita** — foi entregue uma aba própria, o Radar |

A arquitetura está em [`RADAR-DE-RECEITA.md`](RADAR-DE-RECEITA.md).

### A decisão que contraria a letra do pedido

§8 pede uma tabela `crc_revenue_opportunities`. Ela já existe com outro nome —
`crc_opportunities`, do `supabase/02` — com tenant, clínica, tipo, valor, score
com fatores, dedupe por índice parcial e histórico de etapa. Trinta e poucos
arquivos leem dela.

Criar a segunda produziria o que a REGRA ARQUITETURAL ABSOLUTA do mesmo
documento proíbe. O Radar estende a linha existente com 17 colunas novas.
Documentado em §139 do processo: entender, preservar invariantes, implementar da
forma correta, documentar a diferença.

---

## 2. Migrations

| Arquivo | Estado no banco |
|---|---|
| `30-crc-radar-de-receita.sql` | **APLICADA** — 4 sondas passam |
| `31-crc-radar-valor-esperado.sql` | **PENDENTE** — sonda falha com `42703` |

Evidência da 30, por `npm run schema:status` contra o banco de produção:

```
30-crc-radar-de-receita.sql      sim      OK (4 sondas)
31-crc-radar-valor-esperado.sql  NÃO      FALHOU — crc_radar_resumo?select=valor_esperado:
                                          HTTP 400 {"code":"42703", ...
                                          "column pgrst_call.valor_esperado does not exist"}
```

As quatro sondas da 30 são `crc_opportunities.probability` (prova que o
`alter table` de 17 colunas rodou), `crc_ai_activity`, `crc_autonomia` e a RPC
`crc_radar_resumo`.

A sonda da 31 precisa pedir `select=valor_esperado` porque a assinatura de
**argumentos** não muda: uma sonda de RPC comum passaria com a versão antiga no
banco. Ela falha agora e vai passar depois — é a prova de que detecta.

### A 25 e a 26

Constavam como `presumido` no registro porque nasceram antes de
`crc_schema_migrations` existir (criada na 27). A correção está **na 31**, e não
editando as duas: migration aplicada não se altera (§106), senão o repositório
diverge do que produção executou de forma invisível. As sondas das duas passam —
a evidência existe, só faltava a anotação.

---

## 3. Testes

```
75 arquivos · 1314 testes · 100% passando
npx vitest run    (local, 2026-09-12 09:46)
```

Arquivos novos desta fase:

| Arquivo | Testes | O que prende |
|---|---|---|
| `dominio/radar.test.ts` | 27 | a honestidade dos números |
| `dominio/melhor-acao.test.ts` | 30 | a ordem das perguntas = a política de contato |
| `dominio/autonomia.test.ts` | 14 | a flag como teto do nível |
| `e2e/radar.spec.ts` | 4 | a tela, com sessão e Postgres de verdade |
| `aplicacao/radar.test.ts` | 31 | tenant, expiração, cursor, ciclo, atribuição |
| `aplicacao/autonomia.test.ts` | 16 | herança por domínio, kill switch por domínio |
| `aplicacao/atividade.test.ts` | 10 | a timeline não derruba quem estava agindo |

### Mutação — quais defeitos foram REALMENTE detectados

Cada mutação reverte uma correção deliberada e roda os testes. §96 exige dizer
quais não foram detectadas.

| | Mutação | Veredito |
|---|---|---|
| M1 | `ciclo` omitido do upsert de linha inteira (defeito B-7) | **DETECTADA** |
| M2 | cursor não volta ao começo quando o ciclo fecha | **DETECTADA** |
| M3 | tentativas sem resposta contadas mesmo havendo resposta | **DETECTADA** |
| M4 | oportunidade vencida volta a contar no resumo | **DETECTADA** |
| M5 | guarda `clinicIds.length === 0` removida | **NÃO DETECTADA** |
| M5b | filtro de clínica removido inteiro | **DETECTADA** |
| M6 | elo de ação passa a poder carregar valor | **DETECTADA** |
| M7 | opt-out deixa de ser a primeira pergunta | **DETECTADA** |
| M8 | flag deixa de ser teto do nível de autonomia | **DETECTADA** |
| M9 | risco ALTO passa a bastar nível 4 | **DETECTADA** |

**Sobre a M5, que não foi detectada.** A guarda que devolve vazio para uma lista
vazia de clínicas é redundante: sem ela o filtro vira `clinic_id=in.()`, e o
PostgREST responde `200 []` a isso — conferido contra o banco real:

```
curl .../crc_opportunities?select=id&clinic_id=in.()   →  HTTP 200  []
```

O comportamento seguro vem do banco, não da guarda. A guarda fica porque torna a
intenção explícita e evita uma ida ao banco já sabidamente vazia. **Quem protege
o isolamento de verdade é a M5b, que é detectada.** O comentário do teste foi
corrigido para não prometer o que ele não prova.

---

### E2E — a cadeia inteira

`e2e/radar.spec.ts`, 4 testes, contra Postgres + PostgREST locais com as
migrations 30 e 31 aplicadas:

```
14 passed (33.1s)     10 que já existiam + 4 do Radar
```

O que só o E2E prova, e nenhum teste de unidade alcança:

```
sessão → permissão → server function → ctx.clinicIds → RPC no Postgres
→ resumo → React → o número na coluna
```

Os testes de unidade rodam contra o banco em memória. Ele valida nomes de coluna
contra o SQL — o que é muito — e não prova que `crc_radar_resumo` existe no
Postgres com esta assinatura, nem que o `numeric` volta como string e sobrevive
à conversão, nem que a tela sabe desenhar zero.

A asserção central é a **separação dos dois números**. Se algum dia a tela passar
a mostrar só o potencial — o número grande, o que impressiona — este teste cai.

### As migrations 30 e 31, aplicadas num Postgres real

Aplicadas no banco de teste local por `psql` e sondadas:

```
30-crc-radar-de-receita.sql      sim      OK (4 sondas)
31-crc-radar-valor-esperado.sql  sim      OK

32 arquivos · 16 sondados · 0 falha(s)
```

A sonda da 31 saiu de `FALHOU (42703)` para `OK` exatamente quando o SQL rodou —
é a prova de que ela detecta, e não decora. E a correção de bookkeeping da 31
funcionou: `crc_schema_migrations` do banco de teste passou a ter a 25 e a 26
com `presumido = false`.

---

## 4. Verificação local

| Comando | Resultado |
|---|---|
| `npx tsc --noEmit` | limpo |
| `npx eslint` nos 20 arquivos tocados | limpo, `--max-warnings=0` |
| `npx vitest run` | 75 arquivos, 1314 testes, 0 falhas |
| `npx playwright test` | 14 E2E, 0 falhas |
| `npm run build` | `✔ built`, preset Vercel |
| `npm run schema:status` (teste) | 0 falhas |
| `npm run schema:status` (produção) | 1 falha, esperada — a 31 |

`npm run lint` no repositório inteiro levou mais de 10 minutos e não foi
esperado até o fim. Os 20 arquivos tocados foram linteados individualmente com
`--max-warnings=0` e passaram. **O lint completo é responsabilidade do CI, e o
CI ainda não rodou neste HEAD.**

---

## 5. O que NÃO foi feito, e por quê

Nada aqui é placeholder (§131): o que existe funciona, o que não existe está
listado.

| Item | Estado | Motivo |
|---|---|---|
| Home nova (§7) | **Não feito** | A Home atual responde à recepção ("quem precisa de você"); o Radar responde ao dono. São perguntas diferentes, e sobrepor a segunda na primeira estragaria a que já funciona. O Radar virou aba própria. |
| Tela do Centro de Autonomia (§14) | **Não feito** | O motor, a API (`carregarAutonomia`, `ajustarAutonomia`) e os testes existem. Falta a tela. |
| NBA ligado ao motor (§11) | **Não feito** | `decidir()` está pronto e testado, mas nenhum caminho de automação o chama ainda. Ligá-lo muda o comportamento de envio, e isso precisa de turno de sombra antes. |
| Escrita na timeline (§43) | **Não feito** | `registrarAtividade()` existe; nenhum ponto do runtime a chama. A tabela está vazia. |
| Amostra real na probabilidade | **Não feito** | `estimarChance` recebe `amostra: null` sempre. Medir conversão exige a cadeia de atribuição povoada, e ela começa a existir agora. Até lá a confiança fica no piso — e a tela **diz** isso. |
| §15 a §127 (Smart Schedule, Voz, Financeiro, Growth, Learning…) | **Não iniciados** | São as FASES B a H. |

---

## 6. CI

```
Último CI observado:  25f276d  (o HEAD ANTERIOR)
  Quality           success
  CRC Smoke         success
  CRC Integração    success
  CRC Pulso         success
```

**O CI NÃO rodou em `dc57796`.** Os quatro commits desta fase estão só no
repositório local. Não há como afirmar CI verde neste HEAD, e este relatório não
afirma.

---

## 7. Produção — o que foi medido, agora

Consultado via PostgREST com a service role, 2026-09-12.

| | |
|---|---|
| Deploy em produção | `ersgevhfk`, **7 horas atrás** |
| Código em produção | `7c0c692` — **anterior à auditoria passada inteira** |
| Organização | `jp` — existe |
| Clínica | `matriz` — existe, ativa |
| Flags ligadas | **só** `ai_agente_sombra` |
| `crc_patients` | **0 linhas** |
| `crc_opportunities` | 0 linhas |
| `crc_conversations` | 0 linhas |
| `crc_campaigns` | 0 linhas |
| `crc_runtime_heartbeats` | **0 linhas** |

### Três leituras que precisam ser ditas em voz alta

**A base está vazia.** Zero pacientes. A sincronização com o Dental Office nunca
populou nada. Todo o trabalho de escala — campanhas de 8.000, recall convergente,
Radar sobre a base — está testado contra o banco em memória e contra o Postgres
dos testes de integração, e **nunca viu um paciente real**.

**Produção roda código de antes da auditoria passada.** `7c0c692` é anterior a
todas as correções de tenant, campanha, varredura e webhook por canal. O
heartbeat vazio é consistente com isso: `comBatimento` nem existe naquele commit.

**O Radar em produção mostrará zero.** Não porque está quebrado — porque não há
oportunidade nenhuma para medir.

---

## 8. Matriz de capacidades (§137)

| Capacidade | Status |
|---|---|
| Revenue Radar | `PARTIAL` — mede e mostra; migration 31 pendente; base vazia |
| Next Best Action | `PARTIAL` — domínio pronto e testado, não ligado |
| Goal Autopilot | `NOT_STARTED` |
| Autonomy Center | `PARTIAL` — motor + API; sem tela |
| Smart Schedule | `NOT_STARTED` |
| Waitlist | `NOT_STARTED` |
| No-show risk | `NOT_STARTED` |
| Treatment Acceptance | `NOT_STARTED` |
| Objection Intelligence | `PARTIAL` — `dominio/objecoes.ts` já existia |
| Voice AI | `BLOCKED_EXTERNAL` — sem provedor |
| Call Intelligence | `BLOCKED_EXTERNAL` |
| Financial Concierge | `BLOCKED_EXTERNAL` — sem provedor de pagamento |
| Reputation | `NOT_STARTED` |
| Referral | `NOT_STARTED` |
| Attribution | `PARTIAL` — cadeia e funil prontos; ninguém grava elo ainda |
| Autonomous Marketing | `NOT_STARTED` |
| Experiments | `PARTIAL` — `dominio/experimento.ts` já existia |
| Learning Engine | `NOT_STARTED` |
| Morning Briefing | `NOT_STARTED` |
| Anomaly Hunter | `NOT_STARTED` |
| Capacity Optimizer | `NOT_STARTED` |
| Digital Twin | `NOT_STARTED` |
| Benchmarking | `NOT_STARTED` |

---

## 9. GO / NO-GO (§138)

| Capacidade | Veredito | Por quê |
|---|---|---|
| CRC manual | **GO** | Testado; produção precisa de deploy e de dados |
| Radar de Receita | **NO-GO até a 31 rodar em produção** | O resumo depende de `valor_esperado`. Já validado num Postgres real (banco de teste). |
| Automação (jornadas, campanhas) | **NO-GO até o deploy** | Produção roda código pré-auditoria |
| AI shadow | **GO** | `ai_agente_sombra` já ligada |
| AI resposta | **NO-GO** | Sem avaliação contra modelo real |
| AI escrita | **NO-GO** | Idem, mais writeback desligado |
| Auto scheduling | **NO-GO** | Idem |
| Voz | **BLOCKED_EXTERNAL** | Sem provedor |
| Pagamentos | **BLOCKED_EXTERNAL** | Sem provedor |
| Marketing autônomo | **NO-GO** | Não implementado |

---

## 10. Os próximos passos, em ordem

1. **Rodar `supabase/31`** e `notify pgrst, 'reload schema';`
   Depois: `npm run schema:status` deve fechar com 0 falhas.
2. **Empurrar `dc57796`** e observar o CI antes de qualquer outra coisa.
3. **Deploy** — produção está 7h atrás e roda código pré-auditoria.
4. **Sincronizar o Dental Office.** A base está vazia; nenhuma métrica deste
   sistema significa nada até existir paciente.
5. Só então: ligar a escrita da timeline, ligar o NBA em sombra, e a tela do
   Centro de Autonomia.

O passo 4 é o que separa "um sistema testado" de "um sistema em uso".
