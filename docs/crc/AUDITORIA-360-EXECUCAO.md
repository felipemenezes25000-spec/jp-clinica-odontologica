# Auditoria 360º — o que foi executado, com a prova de cada item

> **13/09/2026.** Cada linha desta página tem um comando que a produziu. Onde
> não houve medição, está escrito `NÃO OBSERVADO` ou `BLOQUEADO_EXTERNO` — e
> nunca "ok".

## A regra que organiza o documento

Ausência de evidência não vira aprovação. Um item só é `feito` quando existe um
comando reexecutável que o demonstra; um item medido mas não corrigido é
`aberto`; um item que depende de acesso que esta sessão não tem é
`BLOQUEADO_EXTERNO`.

---

## Matriz

| Capacidade                          | Antes                                                     | Depois                                      | Prova                                                       | Risco remanescente                                                         |
| ----------------------------------- | --------------------------------------------------------- | ------------------------------------------- | ----------------------------------------------------------- | -------------------------------------------------------------------------- |
| **HEAD da `main`**                  | `Quality` vermelho em `1362da1` (prettier)                | verde                                       | `npx eslint src` → 0 erros; 1961 testes                     | —                                                                          |
| **Portão de release**               | check exigido com nome que ninguém reporta                | teste compara workflow × lista versionada   | injeção: renomear o job reprova o caso dele                 | `enforce_admins` continua `false` — **não alterei**, ver `RELEASE-GATE.md` |
| **Analítica truncada**              | 3.000 linhas em 4 leituras; mediana sobre o começo do mês | agregado no Postgres                        | 18 testes unitários + 14 de integração contra Postgres real | —                                                                          |
| **Custo de IA**                     | 5.000 chamadas; conta **menor** que a real                | `crc_gasto_de_ia`                           | 11 testes; soma em `numeric`, medida contra `float8`        | —                                                                          |
| **Custo por lead**                  | 5.000 leads; custo por lead **maior** que o real          | `crc_leads_por_campanha`                    | 4 grafias de campanha colapsando numa só, nos dois lados    | —                                                                          |
| **Métricas de IA**                  | 1.000 runs; taxas medindo a 1ª semana do mês              | `crc_metricas_de_ia`                        | fake + wiring; 1961 testes verdes                           | —                                                                          |
| **Invariantes arquiteturais**       | nenhuma                                                   | 4 classes viram CI vermelho                 | injeção 4/4                                                 | 3 tetos marcados `PENDENTE DE CORREÇÃO` na lista auditada                  |
| **Segredo no bundle**               | nunca verificado                                          | varredura no CI depois do build             | 122 arquivos, 0 achados; JWT falso injetado → detectado     | cobre formato conhecido de credencial, não segredo em formato novo         |
| **Prompt injection**                | **funcionava** — paciente forjava seção do sistema        | neutralização + `portaoHorario`             | 46 casos adversariais; injeção 6/6                          | injeção não tem lista fechada; a garantia é o portão, não o filtro         |
| **Pacote antes do login**           | 65 arquivos, 789 kB crus, 12 telas                        | 34 arquivos, 523 kB crus, 1 tela            | medidor validado contra o navegador em produção             | —                                                                          |
| **Navegação com telas sob demanda** | regressão foi ao ar em `158c77d`                          | 4 casos E2E em navegador real               | 18/18 specs Playwright verdes                               | —                                                                          |
| **Cadeia de suprimentos**           | nada                                                      | CodeQL, audit, SBOM, dependency-review, bot | `npm audit`: 1 `high` corrigido                             | 2 `moderate` no vitest — dev-only, exigiriam major; portão para em `high`  |
| **Mapa do sistema**                 | 12/09, desatualizado                                      | regerado do HEAD                            | `node scripts/mapa-do-sistema.mjs`                          | —                                                                          |

---

## Sondas contra o banco de produção

Rodadas com `npm run schema:status`, que pergunta ao PostgREST de produção pelo
objeto que cada migração cria. **A sonda vence o registro**: uma linha em
`crc_schema_migrations` diz que alguém anotou; a sonda diz o que está no banco.

| Migração                  | Sonda             | Registro em `crc_schema_migrations` |
| ------------------------- | ----------------- | ----------------------------------- |
| `39` índices de ordenação | **NÃO OBSERVADO** | pendente                            |
| `40` resumo da Home       | **OK**            | pendente                            |
| `41` analítica agregada   | **OK** (2 sondas) | pendente                            |
| `42` analítica sem teto   | **OK** (3 sondas) | pendente                            |
| `43` custo e campanha     | **OK** (2 sondas) | pendente                            |
| `44` métricas de IA       | **OK**            | pendente                            |

O `insert` de registro foi acrescentado aos seis arquivos, mas **as linhas ainda
não existem no banco** — elas só aparecem quando o `insert` rodar lá. Enquanto
isso, o relatório mostra sonda `OK` com registro `NÃO`, que é a discordância
certa: o objeto está no banco e o caderninho não sabe.

45 arquivos · 27 sondados · **0 falhas** (13/09/2026).

A `39` continua sem sonda pelo mesmo motivo da `35`, e vale dizer em voz alta em
vez de inventar uma: ela cria índices, índice é objeto de catálogo, e o
PostgREST não expõe catálogo. Pior — uma consulta responde **exatamente igual**
com e sem índice, só mais devagar. A evidência dela é `explain` no editor do
Supabase, e é verificação de fora.

### Duas coisas que esta rodada revelou

**O `schema-status` não sondava nada depois da `38`.** Seis migrações — todas as
da onda de analítica — passavam pelo relatório como "sem sonda". Agora cada
função tem sonda própria, e não uma por arquivo: as três da `42` nascem juntas,
mas nada garante que continuem juntas quando alguém cola metade do arquivo no
editor.

**Seis migrações tinham parado de se registrar.** Da `30` à `38`, todo arquivo
terminava com um `insert into crc_schema_migrations`. Da `39` à `44` o hábito se
perdeu — e três dessas são minhas. Corrigido nos seis arquivos.

---

## O que NÃO foi feito, e por quê

Nenhum destes foi iniciado pela metade: ou está inteiro, ou não está.

| Fase                            | Estado    | Observação                                                                                                                                                                         |
| ------------------------------- | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 3 — decompor `api.ts`           | não feito | Refactor mecânico grande num arquivo de ~245 kB que toda tela importa. Alto risco para fazer no fim de uma sessão, e zero ganho de comportamento.                                  |
| 5 — AI Evaluation OS            | não feito | Já existe base (`crc_eval_casos`, `avaliacao.ts`, replay). O que falta é o **corpus real anonimizado**, que depende de decisão de dado clínico — não é trabalho de código sozinho. |
| 6 — promotion gates             | não feito | Depende do 5: um portão sem corpus é um formulário.                                                                                                                                |
| 8 — credenciais por organização | não feito | Exige decisão de criptografia em repouso e migração de schema com segredo em trânsito. Não faço isso sem desenho aprovado.                                                         |
| 9 — SLOs e alertas              | não feito | —                                                                                                                                                                                  |
| 10 — scheduler durável          | não feito | —                                                                                                                                                                                  |
| 11 — Home como Mission Control  | não feito | Redesenho de tela; precisa de verificação visual com a Home logada.                                                                                                                |

---

## Achados abertos que valem anotar

**`crc_user_clinics` devolve 400 no E2E.** Apareceu no log do servidor durante o
E2E (`Contagem de crc_user_clinics falhou (400)`). Os 18 specs passam, então não
bloqueia — mas é um 400 que ninguém está vendo. Não investiguei.

**Três tetos ainda marcados pendentes** em `invariantes-arquiteturais.test.ts`,
por ordem de probabilidade:

1. `campanhas.ts` — lê 5.000 pacientes para montar o seletor de especialidade e
   convênio. Numa base maior, uma especialidade inteira some do filtro e o
   segmento fica inalcançável em campanha. **5.000 pacientes é uma clínica
   comum.**
2. `agent-jobs.ts` — painel da fila com teto de 500. Fila cheia é exatamente
   quando o número importa.
3. `metas.ts` — 1.000 ações; acima disso uma meta perde ações na tela.

---

## Como reexecutar tudo

```bash
npm run check                                  # lint, typecheck, 1961 testes, build
node scripts/conferir-bundle.mjs               # segredo e servidor no bundle
node scripts/medir-entrada-do-crc.mjs          # bytes antes da senha
node scripts/injetar-defeitos-analytics.mjs    # 6/6
node scripts/injetar-defeitos-arquitetura.mjs  # 4/4
node scripts/injetar-defeitos-injecao.mjs      # 6/6
```

Integração e E2E precisam de Postgres e PostgREST — o passo a passo está em
`.github/workflows/crc-integracao.yml`, e foi exatamente assim que os 50 testes
de integração e os 18 specs de navegador foram rodados para esta página.
