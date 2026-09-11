# Runbook — JP CRC OS

> Para quem está na clínica às 19h de uma sexta e o agente parou de responder.
>
> Este documento não explica a arquitetura. Ele diz **o que olhar, nessa ordem, e
> o que fazer**. Cada seção começa pelo sintoma que aparece na tela, e não pelo
> nome do componente — porque quem abre este arquivo não sabe qual componente é.

---

## Antes de tudo: os três botões que param tudo

Se a situação é "o sistema está fazendo algo errado com pacientes AGORA", não
investigue primeiro. Pare, e investigue depois.

| Botão | O que ele para | Onde |
|---|---|---|
| `kill_envios` | Nenhuma mensagem sai, por nenhum caminho | Configurações → Interruptores |
| `kill_ia_auto` | A IA para de responder; a recepção continua | Configurações → Interruptores |
| `kill_escritas_do` | Nada é escrito na agenda do Dental Office | Configurações → Interruptores |
| `kill_automacoes` | As jornadas param | Configurações → Interruptores |

**Acionar é barato, e desfazer também.** Um interruptor acionado por engano
custa alguns minutos de atendimento manual. Um incidente que continua rodando
enquanto alguém investiga custa conversas com pacientes reais.

O painel de saúde mostra os interruptores acionados como **atenção**, e não como
erro, exatamente para que alguém lembre de desligá-los depois — o pior desfecho
aqui é o interruptor acionado às pressas numa terça e esquecido por duas semanas,
com todo mundo achando que o agente quebrou.

---

## Sintoma: "o agente parou de responder"

Esta é a pergunta que o painel de saúde (`aplicacao/saude.ts`) existe para
responder. Abra-o antes de qualquer outra coisa: ele distingue cinco causas que
têm exatamente a mesma aparência — nada acontece.

### 1. O painel mostra "provedor cortado"

**O que é.** O disjuntor abriu: o provedor de IA falhou cinco vezes seguidas e as
chamadas estão sendo cortadas na hora, sem esperar o timeout.

**Isso é proteção, e não defeito.** Sem ele, cada turno esperaria o timeout
inteiro antes de falhar, e o worker ficaria ocupado esperando respostas que não
vêm — clínicas cujo provedor está no ar parariam de ser atendidas junto.

**O que fazer:**

1. Se o painel diz **meio-aberto**, não faça nada. Uma chamada de teste está
   passando agora; se funcionar, o atendimento volta sozinho.
2. Se está aberto há mais de dez minutos, confira a página de status do provedor.
3. Se o provedor está no ar e o corte continua, é a chave: uma chave expirada dá
   401, e 401 **não** abre o disjuntor. Se abriu, é queda de verdade.
4. Para restabelecer agora: troque a rota da finalidade `conversa` para outro
   provedor em Configurações → IA → Rotas. Gemini e Anthropic estão implementados.

### 2. O painel mostra "há pacientes esperando há N minutos"

**O que é.** A fila tem trabalho e ninguém a está puxando.

**A primeira coisa a conferir é o cron, e não o código.** Na Vercel Hobby o cron
roda **uma vez por dia** — é limitação do plano, e um cron mais frequente derruba
o deploy inteiro. Se a clínica precisa de resposta em minutos, o plano precisa
mudar.

1. Chame `/api/crc/motor` à mão. Se a fila anda, o problema é agendamento.
2. Se não anda, veja "runs penduradas" abaixo.

### 3. O painel mostra "N turnos começaram e nunca terminaram"

**O que é.** Um worker morreu no meio — deploy, timeout, reinício.

**Isso se recupera sozinho.** O lease expira em três minutos e **duas** coisas
são retomadas: o job, e a run do turno. Espere uma rodada antes de agir.

> A run só passou a se recuperar depois da migração `20-crc-reclaim-da-run.sql`.
> Antes dela o job voltava sozinho, tentava reservar a run, encontrava a linha
> que ele mesmo tinha criado antes de morrer, lia isso como "outro worker está
> cuidando" e **concluía o job**. O paciente ficava sem resposta e a fila ficava
> marcada como resolvida — pior do que não ter recuperação nenhuma. Se você está
> lendo isto num banco onde o 20 não foi aplicado, aplique-o antes de qualquer
> outra coisa.

Para ver quem está travado e em que tentativa:

```sql
select chave_dedupe, tentativa, travado_por, travado_ate, iniciado_em
  from crc_ai_runs
 where resultado = 'RODANDO'
 order by iniciado_em;
```

`travado_por` responde a pergunta operacional: **é o turno que trava, ou é o
worker?** Se todos os travados são do mesmo worker, o problema é ele.

Se não recuperar:

```sql
select public.crc_liberar_agent_jobs_presos();
select public.crc_fechar_ai_runs_abandonadas(30);
```

A primeira marca como `FALHOU` os jobs que estouraram as cinco tentativas
enquanto estavam travados. Sem isso, esses jobs ficam invisíveis nas duas filas —
a de trabalho e a de falhas —, que é o pior estado possível.

A segunda fecha as runs cujo job já saiu da fila de vez: ninguém vai retomá-las,
e deixá-las abertas faz este mesmo alerta contar incidentes antigos para sempre,
até virar ruído. **Rode nesta ordem** — a primeira é o que torna as runs órfãs.

O worker já chama as duas a cada rodada; rodar à mão só adianta o relógio.

### 4. O painel mostra "N turnos esgotaram as tentativas"

**Cada um destes é um paciente que escreveu e não foi respondido.**

```sql
select criado_em, erro, payload
  from crc_dead_letters
 where origem = 'agent_job' and status = 'PENDENTE'
 order by criado_em desc;
```

O `payload` traz o `conversationId`. Abra cada conversa na Inbox e responda à
mão. Só então investigue a causa comum no campo `erro`.

### 5. O painel mostra "o teto de gasto foi atingido"

Comportamento correto do sistema, e mesmo assim **crítico**: do lado do paciente,
ninguém está respondendo.

- Para voltar hoje: Configurações → IA → Orçamento, aumente o teto.
- Para entender: veja "o custo por turno subiu", abaixo.

O teto zera na virada do dia **da clínica** — no fuso configurado, não em UTC.

---

## Sintoma: "o agente respondeu uma coisa que não devia"

**Pare primeiro.** `kill_ia_auto`. Depois investigue.

1. Abra a conversa na Inbox e encontre a mensagem.
2. Em Estúdio → Runs, procure a run daquela conversa. Ela mostra o turno inteiro:
   contexto, ferramentas usadas, portões avaliados, resposta.
3. Se um portão barrou e a mensagem saiu mesmo assim, é defeito grave — abra
   incidente. Não deveria ser possível.
4. Se nenhum portão barrou, a pergunta é qual portão **deveria** ter barrado. Isso
   vira caso de avaliação (Estúdio → Avaliação), e o gate de publicação passa a
   exigir que a versão nova acerte esse caso.

**Não corrija editando o texto do agente direto em produção.** Use o Playground
(Estúdio → Playground): ele roda o turno completo com os dados reais e o texto
novo, sem enviar nada e sem gravar nada.

---

## Sintoma: "o custo por turno subiu"

Em Analytics → IA, veja o custo por turno comparado ao período anterior.

**Quase nunca é o preço do modelo.** É o agente usando mais ferramentas por
turno, e cada ferramenta é uma chamada a mais — um turno com quatro ferramentas
custa cinco chamadas.

1. Veja quais ferramentas aparecem mais nas runs do período.
2. Aperte o teto de passos em Estúdio → Agente → Parâmetros.
3. Se uma ferramenta específica está sendo usada demais sem necessidade,
   desligue-a no Tool Studio e observe uma semana.

Trocar de modelo é a última alternativa, e não a primeira.

---

## Sintoma: "a taxa de handoff está estranha"

Não existe "quanto menor, melhor" aqui. **As duas pontas são ruins:**

| Taxa | O que significa | O que fazer |
|---|---|---|
| Abaixo de 2% | O agente está respondendo o que não devia | Revise conversas sobre sintoma, remédio e reclamação |
| Entre 2% e 50% | Saudável | Nada |
| Acima de 50% | A recepção ganhou trabalho, não perdeu | Veja qual portão barra mais — costuma ser falta de material escrito |

Taxa de handoff alta quase nunca é defeito do agente: é a clínica não ter
cadastrado o conhecimento que as pessoas perguntam. Estúdio → Conhecimento.

---

## Sintoma: "uma clínica está vendo dados de outra"

**Isto é incidente de segurança.** Acione `kill_envios` e `kill_ia_auto`
imediatamente, e só depois investigue.

O banco recusa a combinação errada desde `supabase/19`:

```sql
-- Deve devolver zero linhas. Qualquer linha aqui é vazamento.
select c.id, c.organization_id, k.organization_id as org_da_clinica
  from crc_conversations c
  join crc_clinics k on k.id = c.clinic_id
 where k.organization_id <> c.organization_id;
```

Se devolver linhas, a migração 19 não foi aplicada neste banco. Aplique-a — ela
falha de propósito quando encontra dados inconsistentes, com a lista do que
investigar.

---

## Sintoma: "o paciente escreveu e o agente demorou horas"

**Primeiro, entenda o desenho.** O CRC tem DUAS cadências, e elas são coisas
diferentes:

| | O quê | Quem chama | Com que frequência |
|---|---|---|---|
| **Pulso** | eventos, turnos do agente, jornadas vencidas | GitHub Actions + o webhook | ~5 min, e segundos quando a mensagem chega |
| **Volta diária** | sincronização, campanhas, varreduras | cron da Vercel | 1×/dia, 9h UTC |

> Até setembro/2026 **não existia pulso**: tudo rodava na volta diária. Uma
> mensagem das 14h era respondida às 9h do dia seguinte. A fila sempre foi boa;
> o consumidor é que era chamado como batch noturno.

**O cron da Vercel não resolve isso.** Este projeto está no plano Hobby, onde
cron é no máximo 1×/dia — tentar agendar mais denso derruba o deploy inteiro.
Por isso o agendador do pulso mora no GitHub Actions.

Na ordem, o que conferir:

```bash
gh run list --workflow=crc-pulso.yml --limit 5
```

1. **O workflow está rodando?** Se todas as execuções falham, quase sempre é o
   secret: `gh secret set CRON_SECRET` com o mesmo valor da Vercel.
2. **O toque do webhook está ligado?** Falta `CRC_URL_PUBLICA` no ambiente da
   Vercel → o toque não acontece e tudo espera os 5 minutos do agendador. Não dá
   erro em lugar nenhum, de propósito.
3. **A fila está andando?**

```bash
curl -sS -X POST https://www.jpclinicaodontologica.com.br/api/crc/pulso \
  -H "Authorization: Bearer $CRON_SECRET"
```

Ele devolve quantos eventos, turnos e jornadas a volta pegou. Rodar à mão é
seguro: a reserva é atômica e todo passo é idempotente.

> O `schedule` do GitHub é **best-effort**: sob carga, 5 minutos viram 15. Isso é
> aceitável para a rede de recuperação — quem dá a resposta rápida é o toque do
> webhook. Se o toque parar, a latência sobe para a cadência do agendador sem
> nada quebrar, e é exatamente por isso que os dois existem.

---

## Procedimentos

### Aplicar o schema num banco novo

```bash
DATABASE_URL=postgres://... node scripts/aplicar-schema.mjs
```

Os arquivos `9x-` ficam de fora por padrão. **`99-teste-apenas.sql` cria uma
função que executa SQL arbitrário** — ela é necessária para os testes de
integração e é veneno em produção. Só entra com `--com-teste`, e só em banco
efêmero.

### Rodar os testes de integração localmente

```bash
docker run -d --name crc-pg -e POSTGRES_PASSWORD=postgres -p 5432:5432 pgvector/pgvector:pg16
node scripts/aplicar-schema.mjs --com-teste
# e um PostgREST apontado para ele — ver .github/workflows/crc-integracao.yml
SUPABASE_URL=http://localhost:3001 SUPABASE_SERVICE_ROLE="$(node scripts/jwt-de-teste.mjs)" npm run test:integracao
```

### Ligar o agente numa clínica

A ordem importa, e cada degrau existe para o anterior ter sido conferido.

1. `ai_agente_sombra` — o agente roda e **não envia**. As respostas ficam nas
   runs. Deixe uma semana e leia vinte delas.
2. `ai_supervisor` — a segunda leitura começa a avaliar cada turno.
3. Cadastre o conhecimento da clínica (Estúdio → Conhecimento). Sem isso, a taxa
   de handoff sobe e o agente parece pior do que é.
4. Rode a avaliação (Estúdio → Avaliação). O gate exige aprovação recente para
   publicar texto novo.
5. `ai_agente_escrita` — libera as ferramentas que mudam estado no CRC.
6. `auto_scheduling` e `dental_office_writeback` — só depois de os passos 1 a 5
   estarem estáveis. Estes escrevem na agenda real da clínica.
7. `ai_agente_envio` — **por último.** É o que faz o paciente receber a mensagem.

**Nunca pule para o passo 7.** A régua que autoriza é o resultado dos passos 1 a
4, e nenhum deles pode ser encurtado sem tirar o sentido dos outros.

### Reverter o texto do agente

Publicar não apaga a versão anterior: ela fica `ARQUIVADA`. Em Estúdio → Agente →
Histórico, abra a versão antiga e publique de novo. A troca é atômica desde
`supabase/18` — não existe o estado intermediário em que a clínica fica sem
versão publicada.

---

## O que este runbook não cobre

- **WhatsApp e Dental Office sem contrato.** Enquanto nenhum provedor estiver
  contratado, nenhuma mensagem chega a paciente nenhum, em nenhuma configuração.
  Isso não é defeito: é o estado declarado do projeto.
- **Incidentes do Supabase.** Se o banco está fora, tudo aqui está fora. A página
  de status do Supabase é o primeiro lugar a olhar quando *nada* funciona.
- **Restauração de backup.** É procedimento do Supabase, não deste sistema.
