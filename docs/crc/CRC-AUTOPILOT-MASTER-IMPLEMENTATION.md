# CRC Autopilot — FASES A a H

Relatório da implementação do Prompt Mestre (Clinic Growth OS) no CRC.

```
Ultimo commit de CODIGO   6dd5183
Branch                    main
origin/main               25f276d   (16 commits atras)
Estado                    LOCAL — nada empurrado, CI nao rodou nenhuma vez
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
- Migration **36** — escrita, **não aplicada**.

### FASE E — Financeiro (§30, §31, §33)

A política de pagamento e a checagem de pré-consulta.

- `dominio/pagamento.ts` — `POLITICA_PADRAO` nasce toda fechada. Só convênio
  bloqueia atendimento; o resto é pendência, não barreira.
- Migration **37** — escrita, **não aplicada**. `crc_payment_intents` inclui o
  estado `DESCONHECIDO`, porque uma integração de pagamento que cai no meio
  deixa exatamente esse estado, e fingir que ele não existe o transforma em
  "não pago".

### FASE F — Growth (§34, §35, §36, §37)

Reputação, indicação, experimento e aprendizado.

- `dominio/growth.ts` — `destinoDoFeedback()` **roteia**, não filtra quem é
  perguntado: perguntar só a quem provavelmente gostou é fabricar NPS.
  `gerarCodigo()` usa alfabeto ditável (sem 0/O, 1/I). `avaliarAprendizado()`
  nunca devolve `APLICADO` — aplicar é decisão de gente.
- Migration **38** — escrita, **não aplicada**.

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
35-crc-search-path-das-funcoes.sql  NÃO      sem sonda
36-crc-omnichannel-e-voz.sql        NÃO      FALHOU — crc_calls: PGRST205
37-crc-financeiro-e-pre-consulta    NÃO      FALHOU — crc_payment_policies: PGRST205
38-crc-growth.sql                   NÃO      FALHOU — crc_feedback: PGRST205

39 arquivos · 22 sondados · 3 falha(s)
```

**Aplicadas e provadas em produção:** 25 a 34.
**Escritas e NÃO aplicadas:** 35, 36, 37, 38.

> A sonda vence o registro. Uma linha em `crc_schema_migrations` diz que alguém
> anotou; a sonda diz o que está no banco. Foi assim que a 34 passou de
> "presumida" a provada — e as 36/37/38, de "achei que tinham rodado" a
> reprovadas.

### Por que a 35 não tem sonda

Ela não cria nada: só faz `alter function ... set search_path`. Isso é
propriedade da função no catálogo (`pg_proc.proconfig`), e o PostgREST não
expõe catálogo. Uma função com e sem `search_path` responde **exatamente igual**
a uma chamada — que é justamente o ponto: a migration endurece sem mudar
comportamento.

A evidência dela é externa: o linter do Supabase deve deixar de listar as
funções `crc_*` em `function_search_path_mutable`. Está anotado como verificação
de fora, e não como sonda.

---

## 3. Testes

```
93 arquivos · 1.658 testes · todos passando
npx tsc --noEmit    limpo
npx eslint          limpo (2 warnings pre-existentes de react-refresh)
```

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
| Lint limpo | `npx eslint`, 0 erros |
| Migrations 25–34 em produção | `npm run schema:status`, 22 sondas |
| Migrations 35–38 **não** aplicadas | mesma saída, 3 falhas + 1 sem sonda |
| **CI** | **NÃO OBSERVADO** — nada foi empurrado; o CI não rodou nenhuma vez nesta sequência |
| **Produção** | **NÃO OBSERVADA** — roda `7c0c692`, código pré-auditoria, com base vazia |
| E2E | 14 testes passando **em ambiente local** com `node-server`; nunca contra produção |

### Três leituras que precisam ser ditas em voz alta

1. **A base de produção está vazia** (0 pacientes). Nenhum número deste sistema
   significa nada até o Dental Office sincronizar. Um Radar sobre base vazia
   mostra R$ 0,00 e está correto.
2. **Produção está 16 commits atrás.** Tudo descrito aqui existe apenas no
   repositório local.
3. **Quatro migrations não rodaram.** As FASES D, E e F têm código, testes e
   telas — e nenhuma tabela no banco de produção. Elas quebram na primeira
   gravação real.

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
| Call Intelligence | `PARTIAL` | Domínio pronto; **migration 36 não aplicada** |
| Financial Concierge | `BLOCKED_EXTERNAL` | `crc_payment_intents` desenhado; **37 não aplicada** |
| Reputation | `PARTIAL` | Domínio + serviço; **migration 38 não aplicada** |
| Referral | `PARTIAL` | Idem |
| Attribution | `DONE` | Cadeia, funil e gravação de elo |
| Autonomous Marketing | `NOT_STARTED` | — |
| Experiments | `PARTIAL` | Domínio + serviço; **38 não aplicada** |
| Learning Engine | `PARTIAL` | Idem |
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
| Omnichannel / linha do tempo | **NO-GO até a 36 rodar** | Quebra na primeira gravação |
| Financeiro / pré-consulta | **NO-GO até a 37 rodar** | Idem |
| Reputação / indicação / experimento | **NO-GO até a 38 rodar** | Idem |
| Endurecimento de `search_path` | **NO-GO até a 35 rodar** | Não muda comportamento; é dívida de segurança |
| Voz | **BLOCKED_EXTERNAL** | Sem provedor |
| Pagamentos | **BLOCKED_EXTERNAL** | Sem provedor |
| AI resposta / escrita / auto-scheduling | **NO-GO** | Sem avaliação contra modelo real |
| Marketing autônomo | **NO-GO** | Não implementado |
| Benchmarking | **NO-GO** | Não implementado |

---

## 9. Os próximos passos, em ordem

1. **Rodar `supabase/35`, `36`, `37` e `38`** no SQL Editor, cada uma seguida de
   `notify pgrst, 'reload schema';`. Depois: `npm run schema:status` precisa
   fechar com **0 falhas**. Enquanto isso não acontecer, três fases inteiras têm
   código e nenhuma tabela.
2. **Conferir o linter do Supabase** — `function_search_path_mutable` deve parar
   de listar funções `crc_*`. É a única evidência possível da 35.
3. **Empurrar os 16 commits** e **observar o CI** antes de qualquer outra coisa.
   Nada neste documento afirma que o CI passa.
4. **Deploy.** Produção roda `7c0c692`, de antes da auditoria.
5. **Sincronizar o Dental Office.** A base tem 0 pacientes.
6. Só então: telas de Metas e do Centro de Autonomia, e ligar o NBA em sombra.

O passo 5 é o que separa "um sistema testado" de "um sistema em uso".
