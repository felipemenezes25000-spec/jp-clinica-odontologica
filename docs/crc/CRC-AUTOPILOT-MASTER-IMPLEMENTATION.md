# CRC Autopilot — FASES A a H

Relatório da implementação do Prompt Mestre (Clinic Growth OS) no CRC.

```
Ultimo commit de CODIGO   e6ebba5
Branch                    main
origin/main               25f276d   (18 commits atras)
Estado                    LOCAL — nada empurrado, CI nao rodou nenhuma vez
Schema de producao        39/39 migrations aplicadas, 22 sondas, 0 falhas
Dados de producao         0 pacientes
Data                      2026-09-12
```

> Um relatório não consegue conter o SHA do próprio commit. O que está acima é o
> último commit que mexe em CÓDIGO; este documento é o commit seguinte, e não
> altera comportamento nenhum.

> **Nada aqui diz "CI verde" nem "aplicado em produção" sem evidência.** As
> seções 6 e 7 separam, linha a linha, o que foi observado do que não foi. Onde
> não houve observação, está escrito "não observado" — e não "provavelmente
> funciona".

---

## 0. A regra que governou tudo (§1)

Nada disto virou produto novo. Não há segundo portal, segundo dashboard,
segundo CRM nem segundo repositório. Cada fase entrou **dentro** do CRC que já
existia, e as decisões mais importantes deste trabalho foram as de onde NÃO
criar coisa nova:

| Tentação | O que foi feito |
|---|---|
| Aba "Briefing" separada | Entrou **dentro** da tela de Gestão, acima dos painéis de resultado |
| Tabela `crc_radar_*` | O Radar estende `crc_opportunities` com 17 colunas |
| Tela de "Pré-consulta" | Virou uma seção de **Encaixes**, que já responde "o que está em risco esta semana" |
| Portal de unidades | Virou um cartão de **Configurações** |
| Tela de escopo de acesso | Virou um botão no card que já existia em **Equipe** |

O teste é simples: alguém que abre o CRC hoje vê o mesmo sistema, com mais
coisa dentro. Não vê vinte projetos colados.

---

## 1. As fases, e o que cada uma entregou

### FASE A — Fundação (§2, §7, §8, §10)

Radar de Receita, Próxima Melhor Ação e a escada de autonomia.

- `dominio/radar.ts` — `estadoDoRadar()` deriva 9 estados de fatos datados;
  `estimarChance()` é multiplicativa e pondera contra `AMOSTRA_DE_REFERENCIA`;
  `valorDoRadar()` mistura 70% valor e 30% urgência.
- `dominio/autonomia.ts` — escada de 6 níveis, catálogo de 10 domínios,
  precedência kill switch → flag → nível.
- `dominio/melhor-acao.ts` — 13 ações, decisão em blocos ordenados.
- Migrations **30** e **31**, aplicadas em produção e sondadas.

### FASE B — Agenda (§14, §15, §16)

A cadeira que vagou, a lista de espera e o risco de falta.

- `dominio/encaixe.ts` — convite em levas de 3, no máximo 4 levas. Os bloqueios
  são **duros** (opt-out, horário impossível), e não penalidade de pontos: um
  bloqueio que vira -20 pontos é um bloqueio que some quando o resto pontua bem.
- `dominio/no-show.ts` — o crédito por confirmação é **graduado pelo histórico**.
  A confirmação de quem nunca faltou vale -25; a de quem falta cronicamente vale
  -8, porque ela é evidência fraca.
- Migration **32**, aplicada e sondada (4 sondas).

### FASE C — Receita (§19, §20, §21)

O orçamento que não virou tratamento, e o motivo real.

- `dominio/aceitacao.ts` — consulta marcada **AUMENTA** a chance de aceitação,
  o oposto do Radar. E objeção de PREÇO sem parcelamento disponível vira
  `FALAR_COM_DENTISTA`, nunca uma mensagem: desconto por mensagem é margem
  perdida sem ninguém decidir.
- Migration **33**, aplicada e sondada (3 sondas).

### FASE D — Comunicação (§24, §25, §27)

A linha do tempo única, a ligação e a identidade.

- `dominio/identidade.ts` — ranking de força de identificador; um telefone
  compartilhado devolve `AMBIGUO` em vez de escolher. Nome **nunca** inicia uma
  suspeita de duplicata.
- `dominio/atendimento.ts` — ligação não atendida é **ausência** de nota, e não
  nota baixa. Cada observação termina numa pergunta, porque a resposta quase
  nunca é "alguém trabalhou mal".
- Migration **36**, aplicada e sondada (3 sondas).

### FASE E — Financeiro (§30, §31, §33)

A política de pagamento e a checagem de pré-consulta.

- `dominio/pagamento.ts` — `POLITICA_PADRAO` nasce toda fechada. Só convênio
  bloqueia atendimento; o resto é pendência, não barreira.
- Migration **37**, aplicada e sondada (3 sondas). `crc_payment_intents` inclui o
  estado `DESCONHECIDO`, porque uma integração de pagamento que cai no meio
  deixa exatamente esse estado, e fingir que ele não existe o transforma em
  "não pago".

### FASE F — Growth (§34, §35, §36, §37)

Reputação, indicação, experimento e aprendizado.

- `dominio/growth.ts` — `destinoDoFeedback()` **roteia**, não filtra quem é
  perguntado: perguntar só a quem provavelmente gostou é fabricar NPS.
  `gerarCodigo()` usa alfabeto ditável (sem 0/O, 1/I). `avaliarAprendizado()`
  nunca devolve `APLICADO` — aplicar é decisão de gente.
- Migration **38**, aplicada e sondada (5 sondas).

### FASE G — Gestão (§38 a §42)

Briefing da manhã, caçador de anomalias, otimizador de capacidade, gêmeo
digital. **Sem migration**: tudo é derivado do que já existe.

- Janelas de 7 dias contra 28 **anteriores**, sem sobreposição. Limiar de 30%,
  alto de propósito — um detector de 10% dispara toda semana, e alerta semanal
  deixa de ser lido em duas.
- Capacidade medida contra a janela **real** de atendimento de cada dia, e não
  contra a grade contratada, que o CRC não conhece.
- O simulador **mede** ocupação e taxa de falta; só o valor da hora de cadeira é
  digitado, porque ele depende do mix de procedimentos. As premissas ficam
  visíveis embaixo do resultado, inclusive a de que nenhum custo novo entrou.

### FASE H — SaaS (§54 a §58)

Unidades, escopo de acesso e primeiros passos. **Sem migration**: as tabelas
existiam desde o `02-crc-schema.sql`.

Esta fase fechou uma incoerência que o CRC carregava desde o começo: ele era
**multi-clínica no schema e mono-clínica no uso**. `crc_clinics` e
`crc_user_clinics` passam em todo filtro de tenant, mas só a instalação criava
unidade e só o convite criava vínculo. Quem abrisse a segunda unidade tinha de
pedir para alguém rodar SQL.

- `escopoEfetivo()` **deriva** o alcance do admin das clínicas que existem. Se
  fosse lido do que está gravado, a unidade criada amanhã seria invisível para
  o administrador — sem erro e sem log.
- `definirEscopo()` **insere antes de apagar**. Na ordem contrária há um instante
  com zero vínculos, e uma requisição que morra ali tranca a pessoa do lado de
  fora do sistema.
- O checklist de instalação é **medido**, sem "marcar como feito", e some sozinho
  quando não falta passo essencial.

---

## 2. Migrations — o estado real, sondado

Saída de `npm run schema:status` contra o Supabase de produção, hoje:

```
34-crc-metas.sql                    sim      OK (3 sondas)
35-crc-search-path-das-funcoes.sql  sim      sem sonda
36-crc-omnichannel-e-voz.sql        sim      OK (3 sondas)
37-crc-financeiro-e-pre-consulta    sim      OK (3 sondas)
38-crc-growth.sql                   sim      OK (5 sondas)

39 arquivos · 22 sondados · 0 falha(s)
```

**Todas aplicadas.** As 36, 37 e 38 foram rodadas depois da primeira versão deste
relatório, e a sonda confirma — não o registro.

> A sonda vence o registro. Uma linha em `crc_schema_migrations` diz que alguém
> anotou; a sonda diz o que está no banco. Esta distinção não é teórica aqui: a
> 34 passou de "presumida" a provada por causa dela, e as 36/37/38 estiveram
> marcadas como aplicadas **enquanto as tabelas não existiam** — a sonda foi o
> que desmentiu.

### A 35 não tem sonda, mas tem prova

Ela não cria nada: só faz `alter function ... set search_path`. Isso é
propriedade da função no catálogo (`pg_proc.proconfig`), e o PostgREST não
expõe catálogo. Uma função com e sem `search_path` responde **exatamente igual**
a uma chamada — que é justamente o ponto: a migration endurece sem mudar
comportamento. Não há sonda possível.

O que **há** é prova do risco específico dela. A primeira versão da 35 punha
`search_path = ''` em todas as funções e quebrou o pgvector, porque com caminho
vazio o operador `<=>` e o tipo `vector` também deixam de resolver — e não só
tabelas. A versão final dá `search_path = public` às funções que dependem de
vetor. Para verificar que o endurecimento não as quebrou em produção,
`crc_buscar_conhecimento` foi **chamada de verdade**, com um vetor inerte de
1536 posições:

```
POST /rest/v1/rpc/crc_buscar_conhecimento
HTTP 200 · 0 linhas
```

`200` prova que o operador `<=>` resolveu e a função executou. Se o
endurecimento a tivesse quebrado, a resposta seria
`operator does not exist: public.vector <=> public.vector`. As 0 linhas são o
esperado: a base está vazia.

A evidência do endurecimento em si continua externa: o linter do Supabase deve
deixar de listar as funções `crc_*` em `function_search_path_mutable`. Está
anotado como verificação de fora, e não como sonda.

---

## 3. Testes

```
npx vitest run                                  93 arquivos · 1.658 testes · passando
npx tsc --noEmit                                limpo
npx eslint src vite.config.ts eslint.config.js  0 erros · 5 warnings   <- o comando do CI
npx eslint src scripts e2e                      414 arquivos · 0 erros · 5 warnings
```

Os 5 warnings são todos `react-refresh/only-export-components`, em
`Visoes.tsx`, `base.tsx`, `PainelDuvidas.tsx`, `Sanfona.tsx` e `CapaVaga.tsx` —
nenhum deles tocado por este trabalho.

> **O comando está escrito por extenso de propósito.** Uma versão anterior deste
> relatório dizia só "`npx eslint` limpo, 2 warnings", e as duas coisas estavam
> erradas por omissão de escopo: os "2" eram de um lint de três caminhos
> (`src/lib/crc`, `src/components/crc`, `src/routes/crc.tsx`), e não do projeto.
> A linha do CI é a que decide, e é ela que está acima.

### `npm run lint` estava quebrado — e o CI não percebia

O script do repo é `eslint .`, e ele **morria** antes de imprimir qualquer coisa:

```
RangeError: Invalid string length
  at eslint/lib/cli-engine/formatters/stylish.js:84
```

A causa era `.vercel/` fora da lista de `ignores` do `eslint.config.js`: 85
bundles minificados, 21 MB, cada linha de mil colunas virando erro de Prettier.
O formatter monta a saída inteira numa string só e estoura o limite do V8.

Isso passou despercebido porque **o CI não roda `npm run lint`**: o `quality.yml`
roda `npx eslint src vite.config.ts eslint.config.js`, escopado, que nunca
encosta em `.vercel`. O script da máquina do desenvolvedor estava quebrado e o CI
seguia verde — a pior combinação, porque ninguém desconfia do CI.

Corrigido acrescentando `.vercel`, `.tanstack` e `.data` aos `ignores`, alinhando
a lista com o que o `.gitignore` já trata como artefato de build.

**Esse primeiro conserto estava incompleto,** e só se soube disso porque o run
foi medido de novo em vez de declarado pronto: ele continuou sem terminar. O que
sobrava era `public/crc-tour/assets/index-WVEd94Q-.js` — **512 KB em 17 linhas**,
a build do `apresentacao/` (`outDir: "../public/crc-tour"`). Ela é o caso raro de
saída de ferramenta que vai **rastreada pelo git**, de propósito, para ser servida
sem exigir a build do sub-projeto no CI. Ignorar a fonte e lintar a saída dela era
incoerente, e foi acrescentada à lista com nome próprio.

Depois dos dois:

```
npm run lint
  ✖ 5 problems (0 errors, 5 warnings)
  exit=0   duracao=18s
```

De dez minutos e um crash para **18 segundos e zero erros**.

### O mesmo buraco no Prettier — esse valia mais que o do eslint

`npm run format` é `prettier --write .`, e ele **acusava** o bundle do tour:

```
[warn] public/crc-tour/assets/index-WVEd94Q-.js
[warn] Code style issues found in the above file.
```

Ou seja: quem rodasse `npm run format` reescreveria 512 KB de bundle minificado
**versionado**, produzindo um diff que ninguém pediu e ninguém consegue revisar.
Pior que o problema do eslint, porque aquele só quebrava a ferramenta; este
sujava o repositório. `public/crc-tour` entrou no `.prettierignore`.

**O que NÃO precisou de conserto:** suspeitei que o mesmo valeria para `.vercel`,
que também não está no `.prettierignore`. Testado com um arquivo propositalmente
mal formatado dentro e fora do diretório: o de fora é acusado, o de dentro passa.
O Prettier ignora `.vercel` por conta própria. Mexer ali teria sido conserto de
problema inexistente — e a diferença entre os dois casos só apareceu porque cada
um foi testado, e não deduzido do primeiro.

### Uma condição pré-existente que ficou como está

`npx prettier --check .` acusa **71 arquivos**: 30 `.md`, 23 `.css`, 15 `.yml`,
1 `.yaml`, 1 `.json`, 1 `.html`. Nenhum `.ts` ou `.tsx` — o código-fonte está
formatado, porque o `eslint-plugin-prettier` cobre TypeScript e o lint passa.

Dos 71, **exatamente um era deste trabalho**: este relatório. Formatá-lo mudaria
162 linhas de alinhamento de tabela, sem alterar uma palavra de conteúdo, e o
deixaria como o único dos 30 markdowns em outro estilo. Ficou como está, e a
pendência está anotada aqui em vez de meio-resolvida.

### Injeção de defeito (§96)

O invariante mais caro desta leva é a ordem das escritas em `definirEscopo`.
Inverti-la — apagar antes de inserir — e rodar a suíte:

```
× o escopo > nunca fica sem nada no meio da troca: insere antes de apagar
  → expected [] to have a length of 1 but got +0

16 passaram · 1 falhou
```

Exatamente um teste quebrou, e foi o que existe para isso. Revertido e
reconfirmado 17/17.

### Dois defeitos que os testes acharam em mim, e não no código

1. **`melhor-acao.test.ts`** falhou num invariante que eu mesmo escrevi errado:
   eu havia confundido "a ação chega ao paciente" com "a ação dispara sozinha".
   O código estava certo; a asserção é que era preguiçosa. Virou
   `podeSairSozinho(d) = temEfeitoExterno(d.acao) && !d.exigeHumano`.

2. **Um teste-bomba-relógio** em `pulso.test.ts` começou a falhar às 14:00 UTC
   sem ninguém tocar nele: `organizacoesAtivas()` usava `new Date()` enquanto o
   teste semeava `resume_at` com o relógio do adaptador. Corrigido para usar
   `agoraIso()` — e isso é um **bug de produção**, não de teste: qualquer coisa
   que leia a hora do processo em vez do adaptador diverge do resto do sistema.

### Um bug do próprio banco-fake, que teria validado código errado

`String(20000).localeCompare(String(400))` é negativo, então `order by valor
desc` devolvia R$ 400 antes de R$ 20.000 no fake. Qualquer teste de ordenação
numérica teria **concordado com código errado**. Corrigido com comparação
numérica quando os dois lados são números; datas ISO continuam em comparação de
texto, que para elas é correto.

---

## 4. Segurança — o que o linter do Supabase apontou, e o que foi feito

| Achado | Severidade | Decisão |
|---|---|---|
| `function_search_path_mutable` (28 funções) | WARN | **Corrigido** na migration 35 (pendente de aplicação) |
| `rls_enabled_no_policy` (~76 tabelas) | INFO | **Não é para corrigir.** Ver abaixo |
| `extension_in_public` (`pg_trgm`, `vector`) | WARN | **Não é para corrigir.** Ver abaixo |
| `anon/authenticated_security_definer_function_executable` em `public.rh_proximo_protocolo` | WARN | **Fora do escopo do CRC.** Ver abaixo |

**`rls_enabled_no_policy` não é um buraco aqui.** Todas as 73 tabelas que o
código usa têm RLS **habilitada**, e nenhuma tem policy — que é exatamente a
configuração correta para este sistema: o acesso é 100% via `service_role`, que
ignora RLS por definição, e o `anon` não deve poder nada. Verificado: requisição
sem autenticação devolve 401. Criar policies para o `anon` seria abrir o que
hoje está fechado.

**`extension_in_public` não se mexe depois de instalado.** Mover `vector` de
schema quebra toda coluna que a usa como tipo, e mover `pg_trgm` quebra os
índices que dependem dele. O ganho é organizacional; o risco é indisponibilidade.

**`rh_proximo_protocolo` é do portal de RH**, não do CRC. Nenhuma função `crc_*`
é `SECURITY DEFINER` — conferido uma a uma. Fica registrado aqui como achado
real para a pessoa dona daquele módulo decidir, e não como algo que este trabalho
silenciosamente ignorou.

### A armadilha do `search_path` vazio

A primeira versão da 35 punha `search_path = ''` em todas as funções e **quebrou
o pgvector**: `operator does not exist: public.vector <=> public.vector` e
`type "vector" does not exist`. Com caminho vazio, operadores e tipos também
param de resolver, e não só tabelas. A versão final detecta funções que dependem
de vetor (`prosrc like '%vector%' or '%<=>%'`) e dá a elas `search_path = public`.

---

## 5. Decisões que contrariam a letra do prompt (§139)

| O prompt pedia | O que foi feito | Por quê |
|---|---|---|
| §13: cinco tabelas de metas | Três (`crc_goals`, `crc_goal_actions`, `crc_goal_metrics`) | As outras duas seriam projeções do que essas três já respondem. Uma tabela que só existe para ser lida de outro jeito é uma segunda verdade esperando divergir |
| Tela de Radar como produto | Aba dentro do CRC | §1 |
| Painel gerencial "completo" | Painel que **não age** | Um painel que age é um painel que vai agir sobre a própria métrica |
| Aviso de escopo vindo do servidor | Recalculado no cliente, pela mesma função do domínio | O aviso do servidor refletiria o escopo **salvo**: a pessoa desmarcaria a última unidade e nada mudaria na tela |
| §58: wizard de onboarding | Checklist **medido**, sem "marcar como feito" | Um checklist com botão de marcar vira, em duas semanas, um checklist todo marcado e nada feito |

---

## 6. O que foi observado, e o que NÃO foi

| Afirmação | Evidência |
|---|---|
| 1.658 testes passam | `npx vitest run`, saída colada acima |
| Typecheck limpo | `npx tsc --noEmit`, sem saída |
| Lint limpo no escopo do CI | `npx eslint src vite.config.ts eslint.config.js` — 0 erros, 5 warnings pré-existentes |
| Lint limpo em todo o código-fonte | `npx eslint src scripts e2e` — 414 arquivos, 0 erros |
| `npm run lint` inteiro volta a funcionar | 0 erros, 5 warnings, **18s** — antes: 10+ min e `RangeError` |
| `npm run format` não suja mais o repo | `prettier --check` no bundle do tour passou de "code style issues" a ignorado |
| 71 arquivos fora do padrão do Prettier | Pré-existentes (md/css/yml). Nenhum `.ts`/`.tsx`. Não corrigidos — ver seção 3 |
| Schema de produção completo | `npm run schema:status` — 39 arquivos, 22 sondas, **0 falhas** |
| pgvector intacto após a 35 | `POST /rpc/crc_buscar_conhecimento` com vetor de 1536 → `HTTP 200` |
| **CI** | **NÃO OBSERVADO** — nada foi empurrado; o CI não rodou nenhuma vez nesta sequência |
| **Produção (código)** | **NÃO OBSERVADA** — roda `7c0c692`, pré-auditoria, 18 commits atrás |
| **Produção (dados)** | 0 pacientes — o schema está pronto e vazio |
| E2E | 14 testes passando **em ambiente local** com `node-server`; nunca contra produção |

### Duas leituras que precisam ser ditas em voz alta

O schema deixou de ser o gargalo: as 39 migrations estão aplicadas e sondadas.
Sobraram duas coisas, e nenhuma delas é banco.

1. **Produção roda código de 18 commits atrás.** O banco já tem as tabelas das
   FASES B a F; o código que as usa não está lá. Tudo descrito aqui existe
   apenas no repositório local, e o CI nunca rodou nesta sequência.
2. **A base tem 0 pacientes.** Nenhum número deste sistema significa nada até o
   Dental Office sincronizar. Um Radar sobre base vazia mostra R$ 0,00 e está
   correto — o que é diferente de estar funcionando.

---

## 7. Matriz de capacidades (§137)

| Capacidade | Status | Observação |
|---|---|---|
| Revenue Radar | `DONE` | Schema, domínio, serviço, tela, E2E. Base vazia |
| Next Best Action | `PARTIAL` | Domínio completo e testado; não ligado à automação |
| Goal Autopilot | `PARTIAL` | Domínio + migration 34 aplicada; sem tela |
| Autonomy Center | `PARTIAL` | Motor + API; sem tela |
| Smart Schedule | `DONE` | Migration 32 aplicada; tela Encaixes |
| Waitlist | `DONE` | `crc_waitlist_preferences`, convite em levas |
| No-show risk | `DONE` | Calculado na volta pesada; mostrado em Encaixes |
| Treatment Acceptance | `DONE` | Migration 33 aplicada; tela Tratamentos |
| Objection Intelligence | `DONE` | `crc_objections` + RPC de analítica |
| Voice AI | `BLOCKED_EXTERNAL` | Arquitetura pronta (`crc_calls`); sem provedor |
| Call Intelligence | `DONE` | Migration 36 aplicada; domínio + linha do tempo |
| Financial Concierge | `BLOCKED_EXTERNAL` | 37 aplicada; arquitetura pronta. Falta o PROVEDOR, não a tabela |
| Reputation | `DONE` | Migration 38 aplicada; pesquisa, NPS e roteamento |
| Referral | `DONE` | Idem — código de indicação ditável, derivado do id |
| Attribution | `DONE` | Cadeia, funil e gravação de elo |
| Autonomous Marketing | `NOT_STARTED` | — |
| Experiments | `DONE` | Migration 38 aplicada; leitura só com amostra suficiente |
| Learning Engine | `DONE` | Idem — `avaliarAprendizado()` nunca devolve APLICADO |
| Morning Briefing | `DONE` | Dentro da tela de Gestão |
| Anomaly Hunter | `DONE` | 4 séries, limiar de 30% |
| Capacity Optimizer | `DONE` | Por dentista, janela real |
| Digital Twin | `DONE` | Simulador com premissas visíveis |
| Benchmarking | `NOT_STARTED` | Exige dado de fora de uma clínica só |
| Multi-clínica (§55) | `DONE` | Criar, renomear, fechar — com auditoria |
| Escopo por usuário (§56) | `DONE` | Por pessoa, com aviso de "zero unidades" |
| Onboarding (§58) | `DONE` | Checklist medido, no topo da Home |
| Integration Hub (§54) | `PARTIAL` | Tela de Integrações já existia; sem hub unificado |

---

## 8. GO / NO-GO (§138)

| Capacidade | Veredito | Por quê |
|---|---|---|
| CRC manual | **GO** | Testado. Produção precisa de deploy e de dados |
| Radar de Receita | **GO** | 30 e 31 aplicadas e sondadas |
| Agenda inteligente / encaixe | **GO** | 32 aplicada e sondada |
| Risco de falta | **GO** | Deriva de dado que já existe |
| Aceitação de tratamento | **GO** | 33 aplicada e sondada |
| Metas | **NO-GO** | 34 aplicada, mas sem tela: não há como criar meta |
| Gestão (briefing, anomalia, capacidade, simulador) | **GO** | Derivado; sem migration |
| Multi-clínica e escopo | **GO** | Tabelas já existiam; testado com injeção de defeito |
| Onboarding | **GO** | Só leitura |
| Omnichannel / linha do tempo | **GO** | 36 aplicada e sondada |
| Financeiro / pré-consulta | **GO** para política e pré-consulta | 37 aplicada e sondada. O pagamento em si segue BLOCKED_EXTERNAL |
| Reputação / indicação / experimento | **GO** | 38 aplicada e sondada |
| Endurecimento de `search_path` | **GO** | 35 aplicada; pgvector verificado intacto por chamada real |
| Voz | **BLOCKED_EXTERNAL** | Sem provedor |
| Pagamentos | **BLOCKED_EXTERNAL** | Sem provedor |
| AI resposta / escrita / auto-scheduling | **NO-GO** | Sem avaliação contra modelo real |
| Marketing autônomo | **NO-GO** | Não implementado |
| Benchmarking | **NO-GO** | Não implementado |

---

## 9. Os próximos passos, em ordem

~~1. Rodar `supabase/35`, `36`, `37` e `38`.~~ **Feito.** `npm run schema:status`
fecha com 0 falhas, e o pgvector foi verificado intacto por chamada real.

1. **Empurrar os 18 commits** e **observar o CI** antes de qualquer outra coisa.
   Nada neste documento afirma que o CI passa — ele nunca rodou nesta sequência.
2. **Deploy.** Produção roda `7c0c692`, de antes da auditoria. Hoje o banco está
   à frente do código: as tabelas das FASES B a F existem, e o código que as usa
   não está lá.
3. **Sincronizar o Dental Office.** A base tem 0 pacientes.
4. **Conferir o linter do Supabase** — `function_search_path_mutable` deve ter
   parado de listar funções `crc_*`. É a única evidência possível do
   endurecimento da 35, e é verificação de fora.
5. Só então: telas de Metas e do Centro de Autonomia, e ligar o NBA em sombra.

O passo 3 é o que separa "um sistema testado" de "um sistema em uso".
