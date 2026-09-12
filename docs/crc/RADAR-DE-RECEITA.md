# Radar de Receita, Next Best Action e Centro de Autonomia

Documento de arquitetura da FASE A do Prompt Mestre (CRC Autopilot / Clinic
Growth OS). Escrito depois de implementar, e não antes — o que está aqui é o que
o código faz.

---

## 1. A decisão que contraria a letra do pedido

O Prompt Mestre (§8) pede uma tabela nova, `crc_revenue_opportunities`, com
paciente, tipo, valor, score, motivo, próxima ação e estado.

**Essa tabela já existe.** Chama-se `crc_opportunities`, nasceu no
`supabase/02`, e já carrega tenant, clínica, paciente, tipo, valor potencial,
score **com os fatores que o formaram**, próxima ação, motivo, dedupe por índice
parcial e histórico de etapa em tabela separada. Trinta e poucos arquivos leem
dela; o Funil, a fila do dia e as jornadas são construídos em cima dela.

Criar a segunda tabela produziria exatamente o que a REGRA ARQUITETURAL ABSOLUTA
do mesmo documento proíbe: dois cadastros de oportunidade, dois lugares para
dedupe, duas respostas para "quanto está parado no funil".

**Então o Radar estende a linha que já existe.** O `supabase/30` acrescenta as
cinco coisas que a tabela não sabia responder:

| Pergunta                | Colunas novas                             |
| ----------------------- | ----------------------------------------- |
| De onde isto veio?      | `source_type`, `source_id`                |
| Quanto vale de fato?    | `confirmed_value` (≠ `potential_value`)   |
| Qual a chance?          | `probability`, `confidence`               |
| Quão urgente?           | `urgency`, `impact`, `expires_at`         |
| O que aconteceu no fim? | `converted_at`, `lost_at`, `dismissed_em` |

Mais `evidence` (jsonb), `next_best_action` (código), `owner_type`, `aguardando`
e `acionada_em`.

---

## 2. Os dois números, e por que os dois aparecem

A tela mostra **receita esperada** em destaque e **"se tudo fechar"** ao lado.

```
valor esperado = Σ (potential_value × probability)     ← pode virar promessa
potencial      = Σ  potential_value                    ← é a soma dos sonhos
```

Numa base de 8.000 pacientes o potencial passa de R$ 1 milhão com facilidade. É
a soma de tudo que aconteceria se todo mundo fechasse tudo que já lhe foi
proposto. No fim do primeiro mês alguém confere, não voltou R$ 1 milhão, e o
problema deixa de ser o número: passa a ser que ninguém acredita em nenhuma tela
do sistema.

A soma é feita **no banco**, linha a linha, pela RPC `crc_radar_resumo`
(`supabase/31`). Não dá para calcular a partir de agregados: multiplicar o total
por uma probabilidade média só daria o valor certo se todas as oportunidades
tivessem a mesma probabilidade — e a diferença entre elas é justamente o que o
Radar existe para enxergar.

### Probabilidade e confiança são coisas diferentes

```
probability  chance de ESTA oportunidade virar dinheiro
confidence   quanto acreditamos na PRÓPRIA probabilidade
```

Um recall com 12% medido sobre 4.000 casos tem probabilidade baixa e confiança
alta. Um implante com 60% estimado sobre três casos tem probabilidade alta e
confiança baixa. Somar as duas num "score de 0 a 100" apaga a diferença — e é a
segunda que decide se o número pode virar decisão automática.

**Hoje a confiança está no piso (0,2) para tudo**, porque não existe medição
desta clínica. As taxas base em `dominio/radar.ts` são palpites declarados como
palpites, e a tela avisa em texto enquanto for assim.

---

## 3. Os nove estados são derivados, não guardados

`estadoDoRadar()` calcula o estado a partir de fatos datados:

```
DISMISSED  → dismissed_em preenchida
CONVERTED  → converted_at preenchida
LOST       → lost_at preenchida
EXPIRED    → expires_at no passado
WAITING_*  → aguardando = 'HUMANO' | 'PACIENTE'
IN_ACTION  → acionada_em preenchida
QUALIFIED  → probability preenchida
DETECTED   → nada disso
```

A tentação era gravar `status` na linha. O problema é que a oportunidade já tem
`stage_id` — a etapa do funil, que uma pessoa arrasta à mão. Duas máquinas de
estado na mesma linha divergem no primeiro dia em que alguém move um card
enquanto a automação escreve.

A ordem das perguntas é a regra de negócio. `DISMISSED` vem antes de `CONVERTED`
porque quem descarta é uma pessoa dizendo "o Radar errou aqui" — e o descarte
precisa continuar visível mesmo que um sync marque conversão depois, porque é
ele que mede se o Radar merece confiança.

---

## 4. Next Best Action — a política, não a escolha

`dominio/melhor-acao.ts` decide, para uma oportunidade, qual é o próximo
movimento. A ordem das perguntas **é** a política de contato da clínica:

```
1. proibições   opt-out · expirada · pergunta clínica
2. desistência  teto de tentativas sem resposta
3. esperas      sem canal · dado faltante · consulta marcada ·
                cooldown · teto diário · fora do horário
4. a ação       intenção declarada → objeção → valor → canal
```

Trocar dois blocos de lugar não é refatoração: é mudar quem pode ser contatado.

### A regra que não se relaxa

> **O modelo nunca decide política de segurança.**

Opt-out, cooldown, janela de horário, teto de contatos e consentimento são
decididos em código determinístico e testado. O modelo escreve o **texto** da
mensagem depois que esta função já disse que pode haver mensagem. A inversão —
perguntar ao modelo "devo contatar?" — é a forma mais comum de furar opt-out em
produção, porque basta uma conversa persuasiva para o modelo concluir que desta
vez faz sentido.

### Duas perguntas que parecem uma

```
temEfeitoExterno(acao)    a ação CHEGA no paciente?         CALL → sim
podeSairSozinho(decisao)  o CRC executa sem pessoa?         CALL → NÃO
```

`CALL` toca o paciente e exige gente: não há provedor de voz ligado, então quem
disca é a recepção. Confundir as duas leva a um de dois erros — ou a ligação
nunca é recomendada, ou o motor tenta "executar" uma ligação que ninguém pode
executar. (Esta distinção nasceu de um teste que falhou.)

---

## 5. Centro de Autonomia — a flag continua sendo o teto

`crc_autonomia` guarda um nível 0–5 por domínio, por clínica, com a linha de
`clinic_id` nulo valendo como padrão da organização.

```
0 OFF                   não faz nada, nem observa
1 OBSERVE               registra o que teria feito
2 RECOMMEND             sugere e espera aprovação
3 EXECUTE_LOW_RISK      faz o reversível sozinho
4 EXECUTE_AND_ESCALATE  faz sozinho e chama gente no que foge do padrão
5 AUTOPILOT             opera o domínio dentro dos limites
```

**As flags não foram substituídas: elas são o teto.** Nível 5 em `recall` com
`automatic_whatsapp` desligada continua não enviando nada. A conta é
`min(teto, nível)`, e está em `podeAgir()`.

Sem essa regra, o Centro de Autonomia seria um **segundo caminho** para ligar
envio automático — e o kill switch de madrugada deixaria de ser confiável,
porque alguém precisaria lembrar de desligar os dois lugares.

### A precedência das recusas

```
1. kill switch   decisão de incidente. Ganha de tudo.
2. flag          decisão de produto. Ganha do nível.
3. nível         decisão de operação.
```

Invertida, uma clínica com kill switch ligado leria "aumente o nível de
autonomia" — e alguém aumentaria, às três da manhã, no meio do incidente que
motivou o kill switch.

### Risco ALTO exige 5, e não 4

O nível 4 é "executa e escala": age sozinho e chama gente quando vê algo
estranho. Mas "estranho" é julgamento nosso, e para o que é caro de desfazer o
critério não pode ser o nosso julgamento: ou a clínica assinou embaixo do
autopilot, ou uma pessoa aprova caso a caso.

### Herança por domínio

Uma rede configura o padrão com `recall: 4` e `agenda: 2`. A unidade nova sobe
só `agenda` para 4. O resultado é `recall: 4` (herdado) e `agenda: 4` (próprio)
— e **não** "a unidade tem configuração própria, logo ignore o padrão inteiro".
O sintoma do erro oposto é uma unidade perdendo silenciosamente a configuração
de nove domínios ao ajustar um.

`voltarAHerdar()` existe porque "voltar ao padrão" não é o mesmo que "definir 0":
o primeiro segue o padrão quando ele mudar, o segundo congela no zero.

---

## 6. A cadeia de atribuição

`crc_attribution_events` guarda a cadeia, e não um valor:

```
ACAO → RESPOSTA → CONSULTA_CRIADA → COMPARECEU → PRODUCAO
```

Cada elo é um fato datado, com o anterior apontado. Espremer isso na tabela de
valor daria uma linha com cinco datas nuláveis, e a primeira pergunta séria —
"quantas ações viraram resposta?" — não teria denominador, porque a ação que não
virou nada nunca criaria linha.

**Valor só no elo `PRODUCAO`.** Gravar o valor do orçamento já na `ACAO` é
tentador, e faria a soma da tabela incluir dinheiro que ninguém recebeu. A recusa
é uma exceção, não um silêncio.

**Confiança é parte do dado:**

```
CONFIRMADO     agendou pela nossa mensagem, no mesmo dia
PROVAVEL       apareceu três dias depois, sem responder
DESCONHECIDO   a clínica marcou por telefone e não nos contou
```

O padrão é `DESCONHECIDO`. Nada vira crédito nosso por omissão. `"R$ 28.450
recuperados"` só pode usar `producaoConfirmada`.

---

## 7. A varredura

`varrerRadar()` pontua a base em páginas de 200, com cursor em `crc_scan_state`
sob `varredura = 'radar'`, teto de 3.000 por volta e orçamento de 20 s. Roda na
**volta pesada**, depois de tudo que cria oportunidade — pontuar antes deixaria a
safra do dia sem probabilidade, e oportunidade sem `probability` conta zero na
receita esperada.

Duas armadilhas que já custaram caro antes, e que estão testadas aqui:

**O cursor só anda depois que a página foi processada.** Invertido, uma falha no
meio avança o cursor mesmo assim, e aquelas 200 oportunidades ficam sem pontuação
permanentemente — a Home simplesmente mostra menos dinheiro do que existe.

**A gravação escreve todas as colunas.** `gravar` usa `resolution=merge-duplicates`,
que no PostgREST é upsert de **linha inteira**: coluna omitida volta ao DEFAULT.
Omitir `ciclo` o zeraria a cada página, e o painel de Saúde leria "nunca fechou
uma volta" numa varredura saudável. Foi exatamente o que aconteceu na varredura
de recall (achado B-7 da auditoria anterior).

**O cursor volta ao começo quando o ciclo fecha.** Sem isso, a segunda volta
leria zero para sempre: o cursor ficaria além do último id, e nada novo nasce com
id menor. A varredura pareceria saudável — rodando, sem erro — e não pontuaria
mais nada.

---

## 8. Isolamento de tenant

A tela **nunca** passa `null` como clínica. `null` significa "a organização
inteira" na camada de aplicação, e numa rede um usuário que alcança só a unidade
do centro veria o dinheiro das três.

```
carregarRadar()  → resumoDasClinicas(org, ctx.clinicIds)
listarRadar()    → listarDoRadar(org, ctx.clinicIds, …)
```

`clinicIds` vazio devolve vazio — e não tudo. É a diferença entre fail-closed e o
pior fail-open deste sistema.

---

## 9. O que está ligado, e o que não está

|                                    | Estado                                                       |
| ---------------------------------- | ------------------------------------------------------------ |
| Migrations 30 e 31                 | 30 aplicada e sondada; **31 pendente**                       |
| Varredura do Radar                 | ligada na volta pesada (1×/dia)                              |
| Tela do Radar                      | em `/crc`, aba "Radar"                                       |
| Centro de Autonomia                | motor e API prontos; **sem tela**                            |
| Timeline `crc_ai_activity`         | tabela, escrita e leitura prontas; **ninguém escreve ainda** |
| Next Best Action                   | domínio pronto e testado; **não ligado ao motor**            |
| Amostra por tipo (`estimarChance`) | sempre `null` — a confiança fica no piso                     |

Os três "não ligados" são deliberados e estão no relatório
`CRC-AUTOPILOT-MASTER-IMPLEMENTATION.md` como parciais, não como concluídos.

---

## 10. Arquivos

```
supabase/30-crc-radar-de-receita.sql     colunas, 3 tabelas, RPC, RLS
supabase/31-crc-radar-valor-esperado.sql valor esperado no resumo

src/lib/crc/dominio/radar.ts             estado, chance, urgência, valor  (puro)
src/lib/crc/dominio/autonomia.ts         escada, domínios, podeAgir       (puro)
src/lib/crc/dominio/melhor-acao.ts       Next Best Action                 (puro)

src/lib/crc/aplicacao/radar.ts           resumo, qualificação, varredura, atribuição
src/lib/crc/aplicacao/autonomia.ts       níveis, autorizar, painel
src/lib/crc/aplicacao/atividade.ts       timeline

src/lib/crc/api.ts                       carregarRadar, listarRadar,
                                         carregarAtividade, carregarAutonomia,
                                         ajustarAutonomia
src/components/crc/Radar.tsx             a tela
```
