# JP CRC OS — Manual completo

> [!NOTE]
> **Este documento é um recorte datado.** Ele descreve o sistema como estava
> quando foi escrito, e vale como registro da decisão daquele momento.
>
> Para o que o CRC faz **hoje**, o mapa é
> [CRC-MAPA-DO-SISTEMA.md](./CRC-MAPA-DO-SISTEMA.md) — gerado do código por
> `node scripts/mapa-do-sistema.mjs`, então não desatualiza sozinho.

Tudo o que o sistema faz, com o que ele conversa, o que se pode configurar e o
que ele se recusa a fazer. É o documento longo: para começar a usar, o caminho
curto é o [RUNBOOK](RUNBOOK.md); para colocar no ar, é
[ATIVACAO-EM-PRODUCAO](ATIVACAO-EM-PRODUCAO.md); para entender o desenho por
dentro, é [ARCHITECTURE](ARCHITECTURE.md).

Conferido contra o código em 08/09/2026.

---

## Índice

1. [O que é, em uma frase](#1-o-que-é-em-uma-frase)
2. [Os módulos do produto](#2-os-módulos-do-produto)
3. [O vocabulário](#3-o-vocabulário)
4. [O que o sistema percebe](#4-o-que-o-sistema-percebe--23-eventos)
5. [As oportunidades](#5-as-oportunidades--9-tipos)
6. [As automações](#6-as-automações--8-jornadas-prontas)
7. [A política de contato](#7-a-política-de-contato--o-guarda-costas)
8. [A fila do dia: como a prioridade é calculada](#8-a-fila-do-dia-como-a-prioridade-é-calculada)
9. [A camada de inteligência artificial](#9-a-camada-de-inteligência-artificial)
10. [Cobrança de parcelas em aberto](#10-cobrança-de-parcelas-em-aberto)
11. [Orçamentos parados](#11-orçamentos-parados)
12. [Leads e tráfego pago](#12-leads-e-tráfego-pago)
13. [Mensagens e templates](#13-mensagens-e-templates)
14. [As telas](#14-as-telas)
15. [Papéis e permissões](#15-papéis-e-permissões)
16. [Relatórios e exportação](#16-relatórios-e-exportação)
17. [As integrações](#17-as-integrações)
18. [Tudo que é configurável](#18-tudo-que-é-configurável)
19. [O modelo de dados](#19-o-modelo-de-dados--38-tabelas)
20. [A superfície de API](#20-a-superfície-de-api)
21. [Segurança, privacidade e lei](#21-segurança-privacidade-e-lei)
22. [Confiabilidade: o que impede duplicar e perder](#22-confiabilidade-o-que-impede-duplicar-e-perder)
23. [Operação do dia a dia](#23-operação-do-dia-a-dia)
24. [Variáveis de ambiente](#24-variáveis-de-ambiente)
25. [Estado atual, honesto](#25-estado-atual-honesto)
26. [O que o sistema se recusa a fazer](#26-o-que-o-sistema-se-recusa-a-fazer)

---

## 1. O que é, em uma frase

> O Dental Office continua sendo o sistema clínico. O JP CRC transforma o que
> acontece lá — faltas, cancelamentos, silêncios longos, orçamentos parados,
> parcelas vencidas — em **oportunidades**, que viram **jornadas**, que viram
> **contato**, que vira **agendamento**.

```
PACIENTE → EVENTO → REGRA → OPORTUNIDADE → JORNADA → AÇÃO → RESULTADO
```

O JP CRC **não substitui** o Dental Office e **não escreve** nele por padrão
(a escrita de volta existe, mas nasce desligada — ver a flag
`dental_office_writeback`). Ele lê, interpreta e age no relacionamento.

---

## 2. Os módulos do produto

O repositório serve quatro coisas, e elas são independentes:

| Módulo                 | Rota                 | O que é                                                                                                                |
| ---------------------- | -------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| **Site da clínica**    | `/`                  | Landing, tratamentos, carreiras. Estático.                                                                             |
| **Portal de RH**       | `/rh`                | Candidaturas, currículo, triagem por IA, kanban, ficha de entrevista.                                                  |
| **JP CRC OS**          | `/crc`               | O sistema de relacionamento. É o assunto deste manual.                                                                 |
| **Tour institucional** | `/crc-institucional` | Apresentação audiovisual de 5:24 sobre o CRC, com narração e legenda. Ver [TOUR-INSTITUCIONAL](TOUR-INSTITUCIONAL.md). |

Os três primeiros dividem o mesmo deploy na Vercel e o mesmo Supabase, com
prefixos de tabela separados (`rh_*`, `crc_*`). O tour é um sub-projeto isolado
que vira arquivo estático.

---

## 3. O vocabulário

Sete conceitos sustentam o sistema inteiro. Vale ler esta seção antes das
outras.

| Conceito         | O que é                                                                                                                  | Onde vive                            |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------ |
| **Paciente**     | Alguém que existe no Dental Office. Nome, telefone normalizado, situação, última e próxima consulta.                     | `crc_patients`                       |
| **Lead**         | Alguém que demonstrou interesse e ainda **não** é paciente. Vira paciente quando aparece na base do Dental Office.       | `crc_leads`                          |
| **Evento**       | Um fato que aconteceu ("o paciente faltou"). Imutável, com impressão digital para não duplicar.                          | `crc_events`                         |
| **Oportunidade** | A unidade de trabalho: alguém que precisa de contato, com tipo, motivo, valor e prioridade. É o **registro permanente**. | `crc_opportunities`                  |
| **Jornada**      | O esforço automatizado sobre uma oportunidade: uma sequência de passos com esperas.                                      | `crc_automation_enrollments`         |
| **Tarefa**       | O que sobra para a pessoa quando a automação não resolve.                                                                | `crc_tasks`                          |
| **Conversa**     | O fio de WhatsApp com um paciente, com todas as mensagens dos dois lados.                                                | `crc_conversations` / `crc_messages` |

A distinção **oportunidade × jornada** é a mais importante: a oportunidade é o
registro que não pode se perder; a jornada é a tentativa. Se a jornada falhar, a
oportunidade continua na fila de alguém — é a diferença entre "a automação não
rodou" e "o paciente foi esquecido".

### Situação do paciente

O Dental Office manda códigos numéricos. Eles são traduzidos na entrada e nunca
circulam pelo sistema:

`PRIMEIRA_CONSULTA` · `EM_TRATAMENTO` · `CONCLUIDO` · `ALTA` · `ABANDONO` ·
`DESCONHECIDO`

### Status de agendamento

`TO_CONFIRM` · `CONFIRMED` · `IN_PROGRESS` · `COMPLETED` · `MISSED` ·
`CANCELLED`

---

## 4. O que o sistema percebe — 23 eventos

Nada disso é digitado por alguém. O sistema lê a agenda e o cadastro e detecta a
**mudança de estado**, não o estado — `appointment.missed` sai quando o
agendamento _passa_ para faltou, não enquanto ele _está_ faltou. Sem isso, a
primeira sincronização emitiria evento para toda falta histórica da base.

**Paciente**
`patient.created` · `patient.updated` · `patient.inactive_detected` ·
`patient.recall_due` · `patient.birthday`

**Agenda**
`appointment.created` · `appointment.confirmed` · `appointment.cancelled` ·
`appointment.missed` · `appointment.completed` · `appointment.upcoming`

**Orçamento**
`budget.created` · `budget.pending` · `budget.approved` · `budget.expired`

**Conversa**
`message.received` · `message.sent`

**Comercial**
`lead.created` · `lead.qualified` · `opportunity.created` ·
`opportunity.stage_changed` · `task.created` · `task.completed`

### Quem reage a quê

| Evento                  | Handler                    | O que acontece                                                                                |
| ----------------------- | -------------------------- | --------------------------------------------------------------------------------------------- |
| `appointment.missed`    | `aoFaltar`                 | Abre oportunidade de falta e inscreve na jornada de recuperação                               |
| `appointment.cancelled` | `aoCancelar`               | Abre oportunidade de cancelamento e oferece novo horário                                      |
| `appointment.completed` | `aoConcluirConsulta`       | Fecha as oportunidades **que já existiam quando a consulta aconteceu** e registra recuperação |
| `appointment.created`   | `aoCriarAgendamento`       | Encerra jornadas de recuperação — o paciente resolveu sozinho                                 |
| `patient.updated`       | `aoMudarSituacao`          | Detecta abandono de tratamento                                                                |
| `message.received`      | `aoResponderSobreCobranca` | Para a cobrança na hora quando o paciente diz que pagou ou pede para negociar                 |

### As varreduras diárias

Além dos eventos, uma varredura roda uma vez por dia (9h UTC ≈ 6h de Brasília,
antes do expediente, para as jornadas nascerem e esperarem a abertura):

| Varredura                  | O que procura                                                         |
| -------------------------- | --------------------------------------------------------------------- |
| **Recall**                 | Quem passou do limite de dias sem consulta e não tem consulta marcada |
| **Confirmação**            | Consultas de amanhã ainda como "a confirmar"                          |
| **Aniversário**            | Quem faz aniversário hoje (29/02 cai no dia 28 em ano comum)          |
| **Orçamentos parados**     | Orçamento aberto há mais que o limite configurado                     |
| **Cobranças**              | Parcelas a vencer e vencidas, por fase                                |
| **Recalcular prioridades** | Refaz o score de toda a fila                                          |
| **Oportunidades paradas**  | Oportunidade aberta sem próxima ação vira tarefa de revisão           |

A última é o detector de "coisa parada": sem ela, uma oportunidade cuja jornada
terminou sem sucesso ficaria no funil para sempre, contando como aberta e não
aparecendo na fila de ninguém.

---

## 5. As oportunidades — 9 tipos

| Tipo                    | Na tela               | Peso base na fila |
| ----------------------- | --------------------- | ----------------- |
| `NEW_LEAD`              | Lead novo             | 30                |
| `MISSED_APPOINTMENT`    | Faltou na consulta    | 26                |
| `BUDGET_RECOVERY`       | Orçamento parado      | 24                |
| `CANCELLED_APPOINTMENT` | Cancelou a consulta   | 22                |
| `MANUAL`                | Criada à mão          | 20                |
| `ABANDONED_TREATMENT`   | Tratamento abandonado | 18                |
| `RECALL`                | Retorno previsto      | 14                |
| `INACTIVE_PATIENT`      | Paciente inativo      | 12                |
| `BIRTHDAY`              | Aniversário           | 5                 |

Um faltante de ontem vale mais que um recall de seis meses porque a janela de
recuperação é curta: quem faltou ainda está no assunto.

### O funil

Cada oportunidade fica numa **etapa**, e cada etapa tem uma categoria:
`ABERTA`, `GANHA` ou `PERDIDA` — é a categoria que define o que conta como
conversão nos relatórios.

**Mudar de etapa sempre gera histórico** (`crc_opportunity_history`). Nunca há
um `update` solto. Sem o histórico não existe a resposta para "onde os pacientes
estão sendo perdidos".

**Fechar como perdida exige o motivo.** O servidor recusa sem ele — não é a tela
que impede, é a regra. Um funil cheio de "perdido" sem motivo não responde nada,
e a única hora em que alguém sabe qual foi o motivo é agora.

---

## 6. As automações — 8 jornadas prontas

Toda automação nasce em **RASCUNHO + SIMULAÇÃO**. Nenhuma manda mensagem antes
de alguém com permissão de gestor decidir o contrário.

### Os três modos

| Modo                   | O que faz                                                                            |
| ---------------------- | ------------------------------------------------------------------------------------ |
| **SHADOW** (simulação) | Calcula tudo e registra "teria enviado este texto para este número". Não envia nada. |
| **RECOMENDAR**         | Executa ações internas — cria tarefa, move etapa. **Não fala com o paciente.**       |
| **EXECUTAR**           | Manda mensagem de verdade.                                                           |

O modo é lido **a cada passo**, não no início da jornada: pausar uma automação
surte efeito nas jornadas que já estão em voo.

### A estrutura de uma jornada

```
GATILHO → CONDIÇÕES DE ENTRADA → PASSOS (com esperas) → CONDIÇÕES DE SAÍDA
```

As **condições de saída são avaliadas antes de cada passo**, e não só na
entrada. O mundo muda durante a espera: a jornada de falta espera duas horas
antes de mandar mensagem, e nesse intervalo o paciente pode ter ligado e
remarcado.

**Tipos de passo disponíveis:** esperar X minutos · esperar até uma hora do dia ·
enviar template · criar tarefa · mover de etapa · definir próxima ação · sair se
uma condição for verdadeira.

**Condições disponíveis:** sem consulta futura · tem consulta futura · paciente
respondeu · paciente não respondeu · paciente ativo · sem opt-out · tem telefone
· situação é X · dias desde a última consulta maior que N · sempre.

O vocabulário é pequeno de propósito. Isto não é um Zapier.

### As oito

#### 1. Recuperação de faltas

- **Gatilho:** o paciente faltou
- **Só entra se:** ativo, com telefone, sem opt-out e **sem outra consulta marcada**
- **Passos:** espera 2h → 1ª mensagem → espera 24h → _sai se respondeu_ → 2ª mensagem → espera 48h → _sai se respondeu_ → **tarefa: ligar** (prazo 24h)
- **Sai se:** o paciente marcou consulta
- _As 2 horas de espera existem para dar tempo de o paciente ligar por conta própria e de a recepção registrar uma remarcação feita no balcão._

#### 2. Confirmação de consulta

- **Gatilho:** varredura diária das consultas de amanhã ainda "a confirmar"
- **Passos:** pede confirmação → espera 5h → _sai se respondeu_ → **tarefa: confirmar por telefone** (prazo 12h)
- **Sem saída por "tem consulta futura"** — aqui ter consulta é a premissa, não o motivo de parar

#### 3. Retorno de rotina (recall)

- **Gatilho:** varredura — sem consulta há mais que o limite configurado (padrão 180 dias)
- **Passos:** convite → espera 3 dias → _sai se respondeu_ → **tarefa: retomar contato** (prazo 48h)

#### 4. Reagendamento de cancelados

- **Gatilho:** o paciente cancelou
- **Passos:** espera 1h → oferece horários → espera 2 dias → _sai se respondeu_ → **tarefa: ligar** (prazo 24h)
- _Uma hora, e não duas: quem cancela já está decidindo a nova data, então a janela útil é mais curta que a da falta._

#### 5. Reativação de inativos

- **Gatilho:** varredura — sem consulta há muito tempo (padrão 240 dias) ou tratamento abandonado
- **Passos:** convite → espera 4 dias → _sai se respondeu_ → reavaliar em 90 dias
- **Sem tarefa humana no fim, de propósito:** a base de inativos é grande, e gerar tarefa para cada um afogaria a equipe

#### 6. Aniversário

- **Gatilho:** varredura diária
- **Passos:** espera até as 10h → felicita
- **Sem saída e sem próximo passo.** Mensagem única, sem cobrança. Uma felicitação que vira funil comercial é exatamente o que não pode acontecer.

#### 7. Recuperação de orçamento

- **Gatilho:** orçamento parado (padrão: 15 dias em aberto)
- **Só entra se:** contatável e **sem consulta marcada**
- **Passos:** pergunta se ficou dúvida → espera 2 dias → _sai se respondeu_ → **tarefa: negociar** (prazo 24h)
- _Orçamento parado é a oportunidade de maior valor do sistema, e por isso ela **sempre** termina em humano: negociação não se resolve por mensagem automática._

#### 8. Cobrança de parcelas em aberto

- **Gatilho:** varredura das cobranças, por fase de vencimento
- **Passos:** 1º contato → espera 3 dias → _sai se respondeu_ → 2º contato → espera 4 dias → _sai se respondeu_ → **tarefa: falar por telefone** (prazo 48h)
- **Para em três contatos.** Não existe terceiro envio automático — ver [a seção de cobrança](#10-cobrança-de-parcelas-em-aberto).

### O que a tela de Automações mostra

Para cada uma: se está ligada, quantos pacientes está tratando agora, **quantos
pacientes agendaram por causa dela**, e o controle de modo.

A métrica exibida é _paciente que agendou_, e não _mensagem enviada_. Mostrar
volume de envio no lugar de resultado treina a equipe a otimizar a métrica
errada — e a métrica errada aqui significa mandar mais mensagem para as mesmas
pessoas.

---

## 7. A política de contato — o guarda-costas

**Toda** mensagem proativa passa por esta verificação. Não existe caminho
alternativo: nem a automação, nem a IA, nem a tela de conversa conseguem
contornar.

A ordem das recusas é deliberada:

| #   | Bloqueio                                            | Tipo       | O que acontece                         |
| --- | --------------------------------------------------- | ---------- | -------------------------------------- |
| 1   | **Opt-out** — o paciente pediu para parar           | Definitivo | A jornada é encerrada                  |
| 2   | **Sem telefone utilizável**                         | Definitivo | A jornada é encerrada                  |
| 3   | **Um atendente assumiu a conversa**                 | Definitivo | A automação cala a boca                |
| 4   | **Outra jornada já está falando com este paciente** | Definitivo | Não duplica                            |
| 5   | **Limite de contatos do dia atingido** (padrão: 1)  | Adiável    | Reagenda para o dia seguinte           |
| 6   | **Cooldown** — contatado há pouco (padrão: 24h)     | Adiável    | Reagenda para quando o cooldown acabar |
| 7   | **Fora do horário de atendimento**                  | Adiável    | Reagenda para a próxima abertura       |

A distinção entre **definitivo** e **adiável** é o que torna isso utilizável.
Fora de horário a jornada não é cancelada nem enviada: ela é **reagendada** para
a abertura seguinte, e o paciente recebe às 8h como se nada tivesse acontecido.

### Horário comercial

Configurável por dia da semana, com feriados e fuso. O padrão:

| Dia             | Janela        |
| --------------- | ------------- |
| Domingo         | não envia     |
| Segunda a sexta | 08:00 – 19:00 |
| Sábado          | 08:00 – 13:00 |

O cálculo do próximo instante útil anda dia a dia, e não por aritmética de fuso:
horário de verão, feriado e sábado com janela curta fazem a aritmética errar.

### Opt-out

Detectado por **regra de texto, antes da IA opinar**. Frases como "pare de me
mandar", "não quero mais receber", "descadastrar", "sair da lista", ou só
"parar".

O motivo de não deixar isso só com a IA é o custo assimétrico dos dois erros: um
falso positivo cala o sistema para quem não pediu (chato, reversível por um
clique); um falso negativo continua mandando mensagem para quem pediu para parar
— quebra de confiança e problema de LGPD.

A IA continua rodando e pode marcar `DESCADASTRO` em frases que a regra não
pega. As duas camadas somam.

Quando o opt-out é registrado, **as jornadas ativas do paciente são encerradas
na mesma hora** — não espera o motor acordar.

---

## 8. A fila do dia: como a prioridade é calculada

O score vai de **0 a 100** e vem acompanhado dos fatores que o formaram. O
número que ordenou a fila e a explicação que a tela mostra são a mesma coisa,
calculada uma vez só.

| Fator                               | Pontos                         |
| ----------------------------------- | ------------------------------ |
| Tipo da oportunidade                | 5 a 30 (ver a tabela de tipos) |
| **Pediu para agendar**              | +25                            |
| Respondeu agora (≤ 1h)              | +22                            |
| Respondeu há poucas horas (≤ 6h)    | +18                            |
| Respondeu hoje (≤ 24h)              | +14                            |
| Respondeu nos últimos 3 dias        | +8                             |
| Conversa quente (IA)                | +12                            |
| Conversa morna (IA)                 | +5                             |
| Valor potencial ≥ R$ 10.000         | +18                            |
| Valor potencial ≥ R$ 4.000          | +12                            |
| Valor potencial ≥ R$ 1.000          | +7                             |
| Tem orçamento aberto                | +3                             |
| **Sem próxima consulta**            | +15                            |
| **Já tem consulta marcada**         | **−20**                        |
| Paciente recorrente (≥ 5 consultas) | +14                            |
| Já se tratou aqui (≥ 2 consultas)   | +8                             |
| Esperando há semanas (≥ 21 dias)    | +10                            |
| Esperando há mais de uma semana     | +6                             |
| Esperando há alguns dias            | +3                             |
| **Contatado nas últimas 24h**       | **−18**                        |

**O que deliberadamente não entra:** gênero, idade, bairro ou qualquer
característica da pessoa. Além de proibido, não prevê nada útil — o que prevê é
comportamento recente.

Os dois pesos negativos são o que sustenta a promessa de a automação não parecer
assédio: quem já tem consulta marcada e quem já foi contatado hoje caem na fila
em vez de serem oferecidos de novo.

---

## 9. A camada de inteligência artificial

A IA aqui **não conversa com o paciente**. Ela organiza a conversa para um
humano: lê a mensagem e responde três perguntas em formato de dado — o que a
pessoa quer, quão quente isso é, e o que fazer agora.

### O que ela devolve

| Campo                       | Valores                 |
| --------------------------- | ----------------------- |
| **Intenção**                | 14 opções (abaixo)      |
| **Temperatura**             | `HOT` · `WARM` · `COLD` |
| **Confiança**               | 0 a 1                   |
| **Exige humano**            | sim/não                 |
| **Motivo do escalonamento** | 9 opções (abaixo)       |
| **Ação sugerida**           | 7 opções (abaixo)       |
| **Resumo**                  | uma frase               |

**As 14 intenções:** agendar · remarcar · cancelar · confirmar · preço · forma de
pagamento · interesse · sem interesse · vai pensar · retornar depois ·
reclamação · dúvida clínica · descadastro · outro.

**As 7 ações que ela pode sugerir:** enviar template · mostrar horários
disponíveis · criar tarefa · atribuir a humano · atualizar oportunidade · marcar
consulta · nenhuma. **O executor recusa qualquer coisa fora desta lista** — não
existe ação inventada pelo modelo.

### Os quatro guardrails

**1. O contexto é mínimo.** O modelo recebe as últimas mensagens, o estado
comercial e as datas de consulta. **Não recebe prontuário, não recebe CPF, não
recebe endereço.**

**2. A saída é validada.** Campo fora do enum não vira ação: vira tarefa humana.

**3. Escalonamento obrigatório não depende da confiança.** Estes nove motivos vão
para humano mesmo que o modelo diga 0,99 de certeza:

`clinical_question` · `complaint` · `legal_issue` · `payment_dispute` ·
`angry_patient` · `uncertain_intent` · `special_discount` ·
`medication_question` · `diagnosis_request`

A decisão é da política da clínica, não do modelo.

**4. Falha da IA não quebra a conversa.** Provedor fora do ar cria tarefa humana
e o atendimento segue. A IA é acelerador, não ponto único de falha.

### Os três patamares de confiança

| Patamar      | Padrão | O que acontece                                  |
| ------------ | ------ | ----------------------------------------------- |
| Automática   | ≥ 0,85 | A ação pode ser executada dentro dos guardrails |
| Sugestão     | ≥ 0,60 | Vira recomendação para o atendente              |
| Abaixo disso | —      | Vai para humano sem sugestão                    |

Os dois números são configuráveis.

### Instruções que o modelo recebe

> Nunca diagnostique, nunca sugira tratamento, nunca fale de medicamento. Nunca
> invente preço, horário disponível, prazo ou promessa de resultado. Na dúvida
> sobre a intenção, use OUTRO com confiança baixa — chutar é pior do que admitir
> incerteza.

Nenhum desses guardrails **depende** de o modelo obedecer: a lista de ações é
validada em código e o escalonamento obrigatório é reavaliado por regra depois
da resposta.

### Custo

Cada chamada é registrada em `crc_ai_calls` com tokens de entrada e saída e uma
**estimativa** de custo em reais. Modelo desconhecido devolve `null` em vez de
inventar número. O câmbio é configurável (`CRC_USD_BRL`).

---

## 10. Cobrança de parcelas em aberto

Este é o módulo com o limite mais rígido do sistema, e o limite é legal.

> **Art. 42 do Código de Defesa do Consumidor** — o consumidor inadimplente
> "não será exposto a ridículo, nem será submetido a qualquer tipo de
> constrangimento ou ameaça".

Isso não é contexto de fundo: é restrição de desenho.

### A granularidade é a parcela, não o contrato

Um tratamento de R$ 4.800 em 6× tem seis vencimentos. Cobrar o contrato inteiro
quando uma parcela atrasa é errado, e é exatamente o tipo de erro que gera
reclamação.

### As quatro fases, e o tom de cada uma

| Fase         | Quando               | O tom                                                                                    |
| ------------ | -------------------- | ---------------------------------------------------------------------------------------- |
| **A vencer** | antes do vencimento  | Lembrete gentil. Ainda não há dívida, há um compromisso.                                 |
| **Recente**  | até 7 dias de atraso | Quase sempre é esquecimento. Tratar como inadimplência ofende quem simplesmente não viu. |
| **Atrasada** | 8 a 60 dias          | A conversa é sobre resolver.                                                             |
| **Antiga**   | mais de 60 dias      | **A automação não fala mais.** Vira tarefa humana — nesse ponto o assunto é negociação.  |

### Os limites

| Limite                                         | Valor                                                                                          |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Contatos automáticos por cobrança              | **3, teto rígido**                                                                             |
| Horas entre dois contatos sobre a mesma dívida | **72** (mais largo que o cooldown geral)                                                       |
| Cobrança a terceiros                           | **Nunca.** Telefone que casa com dois pacientes **bloqueia** a cobrança em vez de escolher um. |
| Negociação humana em andamento                 | Encerra a automação, e ela não volta sozinha                                                   |

### Quando o paciente responde

Duas frases param a automação **na hora**, sem esperar a próxima importação do
financeiro:

- **"Já paguei"** — detectado por regra (`já paguei`, `mandei o pix`,
  `comprovante`, `tá pago`…). Continuar cobrando quem já pagou é o erro que mais
  destrói confiança, e o arquivo do financeiro costuma chegar com um ou dois
  dias de atraso.
- **"Consigo parcelar?"** — detectado por regra (`parcelar`, `negociar`,
  `acordo`, `não consigo pagar`, `desconto`…). Vira tarefa humana.

### A guarda de linguagem

Todo texto de cobrança passa por uma verificação executável — **inclusive quando
alguém edita um template pela tela**, e não só nos testes. Estes termos são
recusados:

| Termo                                                  | Por quê                                                                                       |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| protesto, negativação, SPC, Serasa, cartório, jurídico | ameaça                                                                                        |
| "último aviso", "prazo final"                          | pressão com prazo inventado                                                                   |
| juros, multa                                           | assunto que precisa de humano e do contrato à mão                                             |
| **valor em reais na mensagem**                         | o WhatsApp pode ser lido por outra pessoa na tela de bloqueio. Quem deve já sabe quanto deve. |
| dívida, inadimplente, devedor                          | rótulo. "Parcela em aberto" diz o mesmo sem carimbar ninguém.                                 |

E há uma verificação positiva: o texto precisa **oferecer uma saída**. Cobrança
sem saída é só pressão; o que faz alguém voltar a pagar é a conversa.

### Opt-out não apaga a dívida

Quem pediu para não receber mensagens **exige humano** em vez de encerrar o
assunto. O paciente tem direito de não receber mensagem; a clínica tem direito
de receber. As duas coisas convivem por telefone ou pessoalmente.

### Acordos

Renegociação vira registro próprio (`crc_payment_agreements`), com valor
original, valor acordado, parcelas e status (`ATIVO` · `CUMPRIDO` · `QUEBRADO` ·
`CANCELADO`). Um acordo **substitui** parcelas por outras sem apagar as
originais — o histórico precisa continuar respondendo o que foi combinado antes.

### De onde vêm as cobranças

O financeiro do Dental Office não é exposto pela API pública, então a origem é
**importação de planilha**, com preview obrigatório antes de gravar.

---

## 11. Orçamentos parados

O mesmo problema, a mesma solução: a API pública do Dental Office não expõe
orçamento. Sem valor, o CRC sabe _quem_ precisa de contato mas não sabe _quanto_
está em jogo — e "R$ 4.800 parados há 23 dias" é o que faz alguém ligar hoje em
vez de amanhã.

**A distinção que o sistema faz questão de manter:**

|                        | O que significa                                       | A conversa certa                 |
| ---------------------- | ----------------------------------------------------- | -------------------------------- |
| **Orçamento aberto**   | O paciente ainda não decidiu                          | "Ficou alguma dúvida?"           |
| **Cobrança em aberto** | Ele decidiu, o tratamento aconteceu, a parcela venceu | "Está tudo bem com o pagamento?" |

Um paciente pode ter os dois ao mesmo tempo. Confundi-los produz a pior mensagem
possível.

### A importação

Em **dois tempos**, e isso é regra:

1. **Preview, que não grava nada.** Diz quantas linhas entram, quantas atualizam,
   quantas estão sem paciente e quantas estão erradas — **com o número da linha
   do arquivo**, porque "erro na importação" sem a linha obriga a pessoa a caçar
   no Excel.
2. **Confirmação**, um segundo clique consciente. Importar 1.500 orçamentos é
   uma operação que ninguém quer fazer por acidente.

A leitura do arquivo acontece **no navegador**; o conteúdo vai como texto. Não há
upload, storage nem arquivo temporário para limpar depois. Limite de 5 MB.

**Deduplicação por impressão digital do conteúdo:** importar a mesma planilha
duas vezes — o que acontece, porque ninguém lembra se já importou — não dobra o
valor do funil.

Quando a API privada de orçamentos existir, ela vira mais um provedor e nada
mais muda.

---

## 12. Leads e tráfego pago

Um lead é alguém que demonstrou interesse e ainda não é paciente.

### A captura

`POST /api/crc/lead` é o endpoint que o formulário do site chama. É a **única
rota pública** do CRC — quem preenche formulário não tem sessão. As três
defesas, em ordem de importância:

1. **Deduplicação por telefone + dia.** Mil envios do mesmo número no mesmo dia
   viram um lead. Funciona mesmo contra quem varia o resto do formulário.
2. **Campo-armadilha.** Um campo que humano nenhum preenche porque não o vê. Bot
   que preenche formulário inteiro cai nele.
3. **Teto de tamanho de corpo.**

A resposta é sempre 200 para o navegador, inclusive quando o lead é recusado como
duplicata: dizer "já registramos você hoje" para quem clicou duas vezes faz a
pessoa achar que falhou e tentar por outro canal.

### A atribuição

Gravada **na entrada**, não deduzida depois. UTM, `gclid` e `fbclid` só existem
no momento em que a pessoa chega; perder isso significa nunca conseguir dizer
qual campanha trouxe qual paciente.

A ordem de precedência é deliberada: o identificador de clique (`gclid`,
`fbclid`) vence o UTM, porque ele é o que o anunciante consegue reconciliar com
a plataforma.

### Speed to lead

`primeira_resposta_em` é gravado **uma vez**, no primeiro contato — humano ou
automático — e nunca sobrescrito. Sobrescrever transformaria a métrica em "tempo
até a última mensagem", que não mede nada.

Em tráfego pago essa é a métrica que mais move resultado: responder em cinco
minutos e responder em duas horas são negócios diferentes com o mesmo
investimento de mídia.

O relatório de speed to lead está no painel de Gestão.

---

## 13. Mensagens e templates

### O desenho central: grava antes de mandar

A mensagem é inserida no banco com status `QUEUED` **antes** de o provedor ser
chamado, e a chave de deduplicação tem índice único. Consequência: se duas
execuções concorrentes tentarem o mesmo envio, a segunda falha no insert e nunca
chega a chamar o provedor.

Na ordem inversa — mandar e depois gravar — um timeout entre as duas coisas
produziria mensagem enviada e não registrada, que a jornada seguinte mandaria de
novo.

### Quando o telefone casa com dois pacientes

Irmãos que usam o mesmo celular, mãe e filho, cadastro duplicado. O sistema
**não escolhe**: cria a conversa sem paciente, marca revisão pendente e guarda os
candidatos. Um humano diz de quem é. Escolher por chute significaria gravar a
conversa de uma pessoa no prontuário comercial de outra.

### Os 14 templates padrão

| Chave                    | Quando é usado                             |
| ------------------------ | ------------------------------------------ |
| `falta_primeiro_contato` | 1º contato depois da falta                 |
| `falta_segundo_contato`  | 2º contato depois da falta                 |
| `cancelamento_reagendar` | Oferece novo horário a quem cancelou       |
| `confirmacao_consulta`   | Confirmação da consulta de amanhã          |
| `recall_seis_meses`      | Convite para o retorno de rotina           |
| `reativacao_inativo`     | Convite para quem sumiu                    |
| `abandono_tratamento`    | Para quem parou no meio                    |
| `aniversario`            | Felicitação                                |
| `orcamento_parado`       | Pergunta se ficou dúvida sobre o orçamento |
| `cobranca_lembrete`      | Parcela a vencer                           |
| `cobranca_recente`       | Até 7 dias de atraso                       |
| `cobranca_atrasada`      | 8 a 60 dias                                |
| `cobranca_ja_pago`       | Resposta a quem disse que já pagou         |
| `lead_primeiro_contato`  | 1º contato com quem pediu informação       |

Cada um: diz quem está falando já na primeira linha, tem **um** pedido só e ele é
fácil de responder, não promete nada clínico, não cita preço, não pressiona, e
termina com a saída explícita.

### Versionamento

Editar o texto **cria uma versão nova**; a antiga fica e é desativada. A mensagem
já enviada não pode mudar de conteúdo retroativamente — o banco guarda o texto
renderizado, e o template guarda a receita. O histórico precisa poder responder
"qual texto foi enviado em agosto?".

**Preview antes de ativar:** o gestor vê o texto com dados fictícios (Maria
Souza, Dra. Juliana, quinta-feira 11/09) antes de qualquer paciente receber.

### Variáveis

`{{primeiroNome}}` · `{{nome}}` · `{{clinica}}` · `{{data}}` · `{{hora}}` ·
`{{dentista}}`

Variável não fornecida vira uma **substituição neutra escolhida por campo**, e
nunca a chave crua. Sem nome, "Olá, {{primeiroNome}}" vira "Olá, tudo bem" — e
não "Olá," com vírgula solta, nem `{{primeiroNome}}` chegando no WhatsApp de um
paciente.

---

## 14. As telas

Dez abas, cada uma protegida por permissão. A navegação some por completo para
quem não tem acesso — e o servidor recusa de qualquer forma.

### Início

Uma frase antes dos números: _"17 oportunidades precisam da sua atenção, 82 estão
sendo tratadas automaticamente"_. Depois, cinco KPIs — não quinze — e a fila do
dia com **o porquê de cada prioridade**, no máximo doze itens. A fila completa
mora no Funil.

### Meu trabalho

A fila pessoal, ordenada por prazo. Duas listas, e a segunda importa mais do que
parece: **tarefas sem responsável**. Uma tarefa que a automação criou sem dono
apareceria em nenhuma fila, e o paciente seria esquecido pelo caminho mais
silencioso possível.

### Conversas (Inbox)

Três painéis: lista | conversa | contexto do paciente.

- A **nota interna** é visualmente outra coisa, e usa outro caminho de envio. Se
  parecesse mensagem, alguém escreveria uma achando que o paciente não veria.
- O aviso de **"Fulano está atendendo"** aparece **antes** da caixa de texto, não
  como aviso depois do envio. Descobrir que outra pessoa já respondeu depois de
  escrever é a pior hora possível.

### Funil

Kanban por etapa. Cada cartão mostra **seis** coisas: nome, motivo, valor
potencial, último contato, próxima ação, temperatura. Um kanban só serve se dá
para ler uma coluna inteira de relance.

Mover é um `select` no cartão, e não arrastar: drag-and-drop acessível exige
teclado equivalente, anúncio de posição e área de soltura clara — feito pela
metade, exclui quem usa teclado.

Mover para "Perdido" abre um modal pedindo o motivo.

### Pacientes

Busca por nome ou telefone e a **Central do Paciente**: uma coluna de blocos, e
não uma parede de campos. O cabeçalho responde quem é, como está, quando veio e
quando volta — só depois vêm oportunidades, tarefas e a linha do tempo.

**A linha do tempo é o centro:** junta consulta, mensagem, tarefa, oportunidade e
automação em ordem cronológica — que é como a pessoa lembra do paciente ("ela
faltou, aí mandamos mensagem, aí ela respondeu"), e não separado por tipo de
registro.

### Gestão

Separado da Home de propósito. A Home responde "o que eu faço agora?"; esta tela
responde "quanto essa operação está recuperando?". São duas perguntas de duas
pessoas diferentes.

O número grande se chama **valor potencial** enquanto não houver registro
financeiro confirmado — e a tela diz que é potencial.

Os gráficos são CSS puro, sem biblioteca, e cada valor também aparece como texto
ao lado — um gráfico que só existe como forma é invisível para leitor de tela.

### Importar

Planilha de orçamentos ou de cobranças, em dois tempos (preview → confirmação).

### Automações

O que está ligado, quantos pacientes cada uma está tratando, quantos agendaram, e
o controle de modo. **Ver as jornadas** abre o log passo a passo — inclusive, em
simulação, **o texto integral que teria sido enviado**.

Esse último ponto é o centro do rollout: uma simulação que ninguém consegue ler
não protege ninguém. O que quem decide precisa ver é a frase — se o primeiro nome
saiu certo, se sobrou `{{variavel}}` cru, se o tom está adequado para alguém que
acabou de faltar a uma consulta.

### Integrações

**A tela que não pode mentir.** Três estados, e a diferença importa:

| Estado              | Significa                                                                                                                             |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| **Não configurada** | Falta credencial — e a tela diz **qual variável** falta                                                                               |
| **Sandbox**         | Funcionando com dados de exemplo. Fica em amarelo, porque confundir isso com produção faria a equipe achar que mensagens estão saindo |
| **Conectada**       | Credencial real, chamada real                                                                                                         |

Aqui também ficam os **interruptores de emergência**, porque é onde alguém
procura às três da manhã.

### Equipe

Um login por pessoa. Sem isso, a auditoria registraria "alguém" em cada ação.

- O papel vem **com a explicação do que ele faz**, e não só com o nome — quem
  cadastra a recepcionista tem uma pergunta concreta na cabeça: "ela vai ver
  valor de orçamento?"
- A senha é escolhida por quem cadastra e entregue pessoalmente. Não há e-mail de
  convite porque não há remetente configurado, e um convite que não chega é pior
  do que não existir.
- **Desativar não apaga.** O histórico continua ligado ao nome.
- **Ninguém se desativa**, e o último administrador ativo não pode ser rebaixado
  nem desativado — senão a porta fecha com a chave do lado de dentro.
- Desativar vale **na requisição seguinte**: o cookie guarda só o id, e o usuário
  é relido do banco a cada requisição filtrando por ativo.

### Atalhos e paleta de comandos

| Atalho              | O que faz                                                  |
| ------------------- | ---------------------------------------------------------- |
| `Ctrl/Cmd + K`      | Paleta de comandos: busca paciente, pula para qualquer aba |
| `c`                 | Criar tarefa                                               |
| Setas / Enter / Esc | Navegar, escolher e fechar a paleta                        |

A paleta não dispara quando o foco está num campo de texto — sem essa guarda,
`Ctrl+K` por engano no meio de uma resposta ao paciente engoliria a tecla.

### Visões salvas

"Orçamentos quentes", "Faltantes da semana", "Recall implantes": um filtro que
alguém remonta toda manhã vira um clique.

A visão nasce **pessoal**; compartilhar é explícito. Quem compartilha continua
sendo o dono — só o autor edita e apaga.

O filtro é validado na entrada: uma visão salva com um limite absurdo derrubaria
a tela, e uma com chave inventada viraria um filtro ignorado em silêncio — a
pessoa veria a lista errada achando que é a certa.

---

## 15. Papéis e permissões

Seis papéis, vinte permissões. A tela e o servidor leem a **mesma tabela** — é
isso que impede os dois discordarem sobre o que um recepcionista pode fazer.
Esconder o botão é UX; a permissão é segurança.

| Permissão                     | admin | gestor | crc | recepção | dentista | marketing |
| ----------------------------- | :---: | :----: | :-: | :------: | :------: | :-------: |
| ver_paciente                  |  ✅   |   ✅   | ✅  |    ✅    |    ✅    |     —     |
| editar_paciente               |  ✅   |   ✅   | ✅  |    —     |    —     |     —     |
| ver_oportunidade              |  ✅   |   ✅   | ✅  |    ✅    |    —     |    ✅     |
| editar_oportunidade           |  ✅   |   ✅   | ✅  |    —     |    —     |     —     |
| ver_conversa                  |  ✅   |   ✅   | ✅  |    ✅    |    —     |     —     |
| enviar_mensagem               |  ✅   |   ✅   | ✅  |    ✅    |    —     |     —     |
| ver_tarefa                    |  ✅   |   ✅   | ✅  |    ✅    |    ✅    |     —     |
| editar_tarefa                 |  ✅   |   ✅   | ✅  |    ✅    |    ✅    |     —     |
| ver_automacao                 |  ✅   |   ✅   | ✅  |    —     |    —     |    ✅     |
| gerenciar_automacao           |  ✅   |   ✅   |  —  |    —     |    —     |     —     |
| ver_integracoes               |  ✅   |   ✅   |  —  |    —     |    —     |     —     |
| gerenciar_integracoes         |  ✅   |   —    |  —  |    —     |    —     |     —     |
| **ver_financeiro**            |  ✅   |   ✅   | ✅  |    —     |    —     |     —     |
| ver_analytics_gerencial       |  ✅   |   ✅   |  —  |    —     |    —     |    ✅     |
| gerenciar_usuarios            |  ✅   |   —    |  —  |    —     |    —     |     —     |
| ver_auditoria                 |  ✅   |   ✅   |  —  |    —     |    —     |     —     |
| gerenciar_autopilot           |  ✅   |   ✅   |  —  |    —     |    —     |     —     |
| importar_dados                |  ✅   |   ✅   |  —  |    —     |    —     |     —     |
| exportar_dados                |  ✅   |   ✅   |  —  |    —     |    —     |    ✅     |
| receber_escalonamento_clinico |  ✅   |   —    |  —  |    —     |    ✅    |     —     |

Duas escolhas que valem explicar:

- **O dentista não vê financeiro.** Ele recebe o que é clínico e não precisa da
  operação comercial inteira.
- **Valor de orçamento é permissão separada** (`ver_financeiro`), e não parte de
  "ver paciente".

---

## 16. Relatórios e exportação

### O painel de Gestão

| Relatório                    | O que responde                                            |
| ---------------------------- | --------------------------------------------------------- |
| **Receita por mês**          | Potencial e confirmada, **nunca somadas no mesmo número** |
| **Funil do período**         | Quantos entraram, quantos avançaram, quantos fecharam     |
| **Motivos de perda**         | Por que os pacientes estão sendo perdidos                 |
| **Desempenho por automação** | Quantos pacientes cada uma recuperou                      |
| **Desempenho por atendente** | Produção por pessoa                                       |
| **Speed to lead**            | Tempo até a primeira resposta                             |
| **Panorama do gestor**       | A visão consolidada                                       |

**Três regras que atravessam os relatórios:**

1. **O dashboard não pode mentir.** Enquanto não houver registro financeiro
   confirmado, o número grande se chama "valor potencial" — porque é o que ele é.
2. **Recuperado é o que tem causalidade.** Só conta como recuperação o que passou
   por uma oportunidade de recuperação aberta. Um paciente que marcou consulta
   sozinho não entra — inflaria o número e destruiria a credibilidade do
   relatório na primeira conferência.
3. **Nada é calculado a partir de suposição.** Todo número vem de evento gravado
   no servidor no instante em que o fato aconteceu, e não de tracking do
   navegador — o evento que mais importa (o paciente agendou) acontece num
   worker, sem navegador nenhum.

### Exportação em CSV

Três escopos: **pacientes**, **oportunidades**, **tarefas**. Limite de 5.000
linhas.

**O CSV respeita o RBAC**: o filtro de clínica é o mesmo das telas, e a coluna de
valor só existe quando quem exporta tem `ver_financeiro`. Um CSV que ignora RBAC
é a forma mais fácil de vazar exatamente o que a interface protege — e ninguém
percebe, porque o arquivo sai igual para todo mundo.

**O arquivo é feito para o Excel em português:** separador `;`, decimal com
vírgula, e BOM no começo. Sem os três, "1.500,00" vira duas colunas e "João" vira
"JoÃ£o".

---

## 17. As integrações

Cada sistema externo fica **atrás de uma porta** (uma interface). O domínio não
sabe que existe HTTP do outro lado — é isso que permite trocar de provedor
escrevendo um arquivo novo em vez de reescrever o motor.

### 17.1 Dental Office

**Estado: bloqueado por credencial.** A implementação está completa e testada
contra sandbox; falta exclusivamente a credencial.

**Autenticação:** `POST /v1/auth/tokens` com `client_id` e `secret` devolve um
token. Ele fica em cache **em memória do processo**, é renovado sozinho, e ao
receber 401 o cache é invalidado e um novo é pedido — **uma vez só**, para não
virar laço infinito.

Três regras sobre o secret:

1. Nunca vai para o navegador.
2. Nunca aparece em log — **nem truncado**. Um prefixo de secret é material para
   ataque e não ajuda a depurar nada.
3. Nunca é gravado no banco. Guardá-lo pouparia chamadas e criaria um alvo
   persistente com credencial viva dentro.

**O que a porta oferece:**

| Operação                     | O que faz                                               |
| ---------------------------- | ------------------------------------------------------- |
| `testarConexao`              | Autentica e faz um GET pequeno. **Nunca altera dado.**  |
| `listarClinicas`             | As unidades                                             |
| `listarDentistas`            | Por clínica                                             |
| `listarPacientes`            | Paginado, com filtro por data de atualização            |
| `listarAgendamentos`         | Por período e clínica                                   |
| `obterAgendamento`           | Um específico                                           |
| `horariosDisponiveis`        | Os slots livres reais da agenda                         |
| `criarAgendamento`           | Marca consulta — distingue "slot ocupado" de "recusado" |
| `atualizarStatusAgendamento` | Escrita de volta (atrás de flag, desligada)             |

**Garantias da sincronização:**

- **Pagina até o fim.** Parar na página 1 deixaria pacientes fora do CRC, e a
  operação nunca saberia quais.
- **Falha individual não cancela o lote.** Um paciente com data malformada entre
  5.000 vai para uma tabela de falhas com o id externo; os outros 4.999 entram.
- **É idempotente.** Rodar duas vezes produz o mesmo estado — garantido por
  constraint no banco, não por cuidado do código.
- **Detecta a mudança, não o estado.** É o que separa "o sistema entrou no ar" de
  "o sistema entrou no ar e disparou 4.000 mensagens".

### 17.2 WhatsApp

**Estado: bloqueado por credencial.** Dois adapters prontos, atrás da mesma
porta; a escolha é comercial e ainda não foi feita.

| Provedor           | Situação                                                                  |
| ------------------ | ------------------------------------------------------------------------- |
| **Twilio**         | Manda mensagem no mesmo dia                                               |
| **Meta Cloud API** | Mais barato no volume, exige Business Manager verificado e revisão de app |
| **Sandbox**        | Não envia nada; grava numa lista em memória para a tela de teste          |

Trocar é mudar uma variável de ambiente (`WHATSAPP_PROVEDOR`).

**Canal oficial apenas.** Não existe caminho no código que abra navegador ou fale
com `web.whatsapp.com`.

**O webhook** (`/api/crc/whatsapp`):

- `GET` responde ao handshake de verificação do provedor, com comparação de token
  em **tempo constante**.
- `POST` recebe mensagens e status de entrega.

Três decisões no POST:

1. **A assinatura é conferida antes de tudo**, sobre o corpo **cru**. Sem isso,
   qualquer pessoa que descubra a URL pode inventar "o paciente X disse que quer
   cancelar" — e a automação obedeceria. Usa o corpo cru porque `JSON.parse`
   seguido de `stringify` muda ordem de chave e espaçamento, e a conferência
   falharia sempre.
2. **Inbox pattern:** o payload é gravado **antes** de qualquer processamento,
   com chave única. O provedor reenvia se não receber 200 em poucos segundos, e
   um processamento lento produziria a mesma mensagem três vezes na Inbox, três
   classificações de IA cobradas e três respostas automáticas para o paciente.
3. **Responde 200 mesmo quando o processamento falha.** Um 500 faz o provedor
   reenviar, e reenviar não conserta um bug nosso — só multiplica o efeito. O que
   falhou fica pendente e é repescado.

**Status de entrega rastreados:** `QUEUED` → `SENT` → `DELIVERED` → `READ`, ou
`FAILED`. Falha permanente (número inválido) e transitória (provedor fora do ar)
têm destinos diferentes.

### 17.3 Inteligência artificial (OpenAI)

**Estado: conectada em produção** — é a única das três integrações que já opera
com credencial real. A chave é a mesma do portal de RH; o modelo é configurável
em separado (`OPENAI_MODEL_CRC`), porque a tarefa é outra — o RH lê currículo em
texto longo, o CRC classifica mensagem curta com schema.

- **Structured output com schema.** A resposta não é prosa.
- **Retry controlado:** se o modelo devolver algo fora do schema, tenta **uma**
  vez mais com o erro anexado. Duas tentativas e desiste — insistir queima
  dinheiro sem convergir, e o fallback (tarefa humana) é melhor que uma terceira
  tentativa.
- **Sandbox disponível** (`CRC_IA_SANDBOX`).

### 17.4 Supabase (Postgres + Storage)

Acesso por **REST puro, sem SDK**. Três funções em plpgsql resolvem o que REST
não faz — reserva atômica com `FOR UPDATE SKIP LOCKED`:

`crc_reservar_jobs` · `crc_reservar_eventos` · `crc_reservar_jornadas`

Sem elas, duas execuções sobrepostas do cron pegariam a mesma jornada e mandariam
a mesma mensagem duas vezes.

### 17.5 Vercel

Deploy e **cron**. Hoje declarado em `vercel.json`:

| Rota             | Frequência     |
| ---------------- | -------------- |
| `/api/rh/varrer` | diária, 4h UTC |
| `/api/crc/motor` | diária, 9h UTC |

⚠️ **O plano Hobby só permite cron diário.** Para o faltante receber mensagem no
mesmo dia, o motor precisa ser chamado a cada ~10 minutos — o que hoje exige um
pinger externo (cron-job.org, UptimeRobot) apontando para a rota com o
`CRON_SECRET`. Está descrito na Parte F da
[ATIVACAO-EM-PRODUCAO](ATIVACAO-EM-PRODUCAO.md).

### 17.6 O site da clínica

O formulário do site chama `POST /api/crc/lead` com a atribuição de origem.

---

## 18. Tudo que é configurável

Nada disso exige programador. Os valores efetivos vêm de `crc_settings`; os
padrões abaixo valem para uma clínica recém-instalada.

### Prazos e limites

| Configuração                   | Padrão | O que controla                                            |
| ------------------------------ | ------ | --------------------------------------------------------- |
| `recallDias`                   | 180    | Dias sem consulta para o retorno de rotina disparar       |
| `recallLongoDias`              | 365    | Segundo recall, para quem não respondeu                   |
| `inatividadeDias`              | 240    | Dias sem consulta para o paciente ser considerado inativo |
| `orcamentoParadoDias`          | 15     | Dias com orçamento aberto antes de virar oportunidade     |
| `faltaEsperaHoras`             | 2      | Quanto tempo depois da falta a 1ª mensagem sai            |
| `confirmacaoAntecedenciaHoras` | 24     | Antecedência da mensagem de confirmação                   |
| `contatosPorDia`               | 1      | **Teto de contatos proativos por paciente**               |
| `cooldownHoras`                | 24     | Horas mínimas entre dois contatos ao mesmo paciente       |
| `tentativasPorJornada`         | 3      | Tentativas antes de desistir e chamar humano              |
| `envioPorHora`                 | 120    | Teto de mensagens automáticas por hora                    |
| `iaConfiancaAutomatica`        | 0,85   | Acima disso a IA pode agir                                |
| `iaConfiancaSugestao`          | 0,60   | Acima disso vira sugestão                                 |

### Horário de atendimento

Janela por dia da semana, lista de feriados e fuso — tudo configurável.

### Feature flags — todas nascem desligadas

| Flag                      | O que libera                                |
| ------------------------- | ------------------------------------------- |
| `ai_autopilot`            | A IA agir sozinha dentro dos guardrails     |
| `auto_scheduling`         | A IA marcar consulta sem humano no meio     |
| `budget_integration`      | A leitura de orçamentos                     |
| `automatic_whatsapp`      | **Interruptor-mestre do envio de WhatsApp** |
| `dental_office_writeback` | Escrita de volta no Dental Office           |

### Interruptores de emergência

Separados das flags de propósito: flag é decisão de produto, interruptor é
decisão de incidente — e misturar os dois faz alguém desligar a coisa errada com
pressa.

| Interruptor        | Efeito imediato                    |
| ------------------ | ---------------------------------- |
| `kill_automacoes`  | Para todas as automações           |
| `kill_envios`      | Para todo envio de WhatsApp        |
| `kill_escritas_do` | Para toda escrita no Dental Office |
| `kill_ia_auto`     | Para toda ação automática da IA    |

---

## 19. O modelo de dados — 38 tabelas

Todas com RLS ligado e **zero policies**: só a `service_role` (o servidor)
enxerga. Nenhuma delas é alcançável do navegador.

**Identidade e acesso (4)**
`crc_organizations` · `crc_clinics` · `crc_users` · `crc_user_clinics`

**Pacientes e agenda (4)**
`crc_patients` · `crc_patient_tags` · `crc_appointments` · `crc_leads`

**Comercial (3)**
`crc_opportunity_stages` · `crc_opportunities` · `crc_opportunity_history`

**Trabalho (1)**
`crc_tasks`

**Conversa (3)**
`crc_conversations` · `crc_messages` · `crc_templates`

**Automação (5)**
`crc_events` · `crc_automations` · `crc_automation_versions` ·
`crc_automation_enrollments` · `crc_automation_logs`

**Fila e sincronização (4)**
`crc_jobs` · `crc_sync_jobs` · `crc_sync_falhas` · `crc_sync_state`

**Dinheiro (5)**
`crc_budgets` · `crc_budget_items` · `crc_revenue_events` · `crc_charges` ·
`crc_payment_agreements`

**Medição (2)**
`crc_funnel_events` · `crc_ai_calls`

**Configuração (2)**
`crc_settings` · `crc_feature_flags`

**Observabilidade e segurança (5)**
`crc_audit_logs` · `crc_integration_logs` · `crc_dead_letters` ·
`crc_webhook_inbox` · `crc_saved_views`

Dinheiro é sempre `numeric(12,2)` — **nunca float**.

---

## 20. A superfície de API

### Rotas HTTP (5)

| Rota                | Método   | Proteção               | O que faz                                                         |
| ------------------- | -------- | ---------------------- | ----------------------------------------------------------------- |
| `/api/crc/saude`    | GET      | pública                | Health check: a aplicação e o banco respondem?                    |
| `/api/crc/lead`     | POST     | pública + anti-bot     | Captura de lead do site                                           |
| `/api/crc/motor`    | GET      | `CRON_SECRET`          | **O coração**: processa eventos, avança jornadas, roda varreduras |
| `/api/crc/whatsapp` | GET/POST | assinatura do provedor | Webhook de mensagens e status                                     |
| `/api/crc/instalar` | POST     | `CRON_SECRET`          | Instalação inicial, idempotente                                   |

**O health check deliberadamente não verifica** Dental Office, WhatsApp nem IA.
Nenhum dos três precisa estar de pé para o CRC atender, e um health check que
fica vermelho porque a API de um terceiro caiu treina a equipe a ignorar o
vermelho. Ele também **não conta nada**: nunca versão, nome de tabela ou motivo
técnico — health check aberto que descreve a infraestrutura é reconhecimento de
graça para quem estiver sondando.

**O motor, a cada volta:**

1. Processa até 40 eventos pendentes → oportunidades e jornadas nascem
2. Avança até 30 jornadas vencidas → mensagens saem, tarefas são criadas
3. Na janela da madrugada, roda as sete varreduras diárias

Cada passo tem teto: uma função serverless tem limite de tempo, e uma volta que
estoura no meio deixa metade do trabalho feito sem indicação de onde parou. Com
teto, ela converge em várias voltas.

Sem `CRON_SECRET` configurado a rota responde 503 e não faz nada — **falhar
fechada é o único comportamento aceitável numa rota que manda mensagem para
paciente**.

### Server functions (35)

A fronteira entre a tela e o servidor. Todas passam por `autorizar()`, que produz
o contexto de permissão — e as operações **pedem** esse contexto, então não é
possível escrever um caso de uso que esqueça de verificar: ele não compila.

**Sessão:** `estadoSessaoCrc` · `entrarNoCrc` · `sairDoCrc`

**Operação:** `carregarHome` · `carregarMeuTrabalho` · `buscarPacientes` ·
`carregarFichaPaciente` · `carregarFunil` · `moverOportunidade` ·
`concluirTarefa` · `assumirTarefa` · `criarTarefaManual`

**Conversas:** `carregarInbox` · `abrirConversa` · `responderConversa`

**Automação:** `carregarAutomacoes` · `mudarEstadoAutomacao` ·
`carregarJornadasDaAutomacao` · `carregarHistoricoJornada`

**Gestão:** `carregarPanorama` · `exportarCsv`

**Importação:** `previewDeImportacao` · `confirmarImportacao`

**Equipe:** `carregarEquipe` · `convidarMembroDaEquipe` · `mudarPapelDoMembro` ·
`mudarAtivacaoDoMembro` · `redefinirSenhaDoMembro`

**Visões:** `listarVisoesSalvas` · `salvarVisaoSalva` · `apagarVisaoSalva`

**Integrações:** `carregarIntegracoes` · `testarConexaoDentalOffice` ·
`sincronizarAgora` · `acionarInterruptor`

---

## 21. Segurança, privacidade e lei

### Acesso

- Toda tabela com **RLS ligado e zero policies**. Só o servidor enxerga.
- Toda operação passa por autorização, e o **escopo de clínica entra como filtro
  de consulta**, nunca como conferência depois de ler.
- Secret nunca vai ao navegador, nunca ao log, nem truncado.
- Webhook exige assinatura conferida sobre o corpo cru, em tempo constante.
- Cookie de sessão selado; o usuário é relido do banco a cada requisição, então
  desativar alguém vale na requisição seguinte.

### Auditoria

`crc_audit_logs` registra quem alterou o quê. É por isso que a tela de Equipe
existe: um CRC com um login só não é um CRC com pouca gente — é um CRC sem
auditoria.

### LGPD

- **Opt-out detectado por regra antes da IA**, e encerra as jornadas na hora.
- O contexto enviado à IA é mínimo: sem prontuário, sem CPF, sem endereço.
- Exportação respeita RBAC.

### CDC art. 42

Ver [a seção de cobrança](#10-cobrança-de-parcelas-em-aberto). Em resumo: teto de
três contatos, espaçamento de 72h, nunca a terceiros, negociação humana encerra a
automação, e uma guarda de linguagem executável que recusa ameaça, pressão,
rótulo e exposição de valor.

---

## 22. Confiabilidade: o que impede duplicar e perder

**Toda a idempotência é constraint no banco, não cuidado no código.**

| O quê                  | Chave única                                             |
| ---------------------- | ------------------------------------------------------- |
| Paciente / agendamento | `(organização, fonte, id externo)`                      |
| Evento                 | `(organização, impressão digital)`                      |
| Oportunidade           | `(organização, chave)` **enquanto aberta**              |
| Tarefa                 | `(organização, chave)` **enquanto OPEN ou IN_PROGRESS** |
| Mensagem recebida      | `(organização, id do provedor)`                         |
| Mensagem enviada       | `(organização, chave)`                                  |
| Jornada                | `(organização, automação, chave)`                       |
| Webhook                | `(provedor, id externo)`                                |

**Os índices parciais importam:** uma oportunidade fechada libera a chave, porque
o paciente faltar de novo no mês seguinte é outro fato.

### Padrões aplicados

- **Outbox:** o evento é gravado na mesma passagem em que o fato foi gravado.
  Primeiro o **fato**, depois o **evento** — perder o evento significa uma
  automação que não disparou, e o varredor diário reencontra o caso; a ordem
  inversa produziria automação sobre fato inexistente, que é pior.
- **Inbox:** o webhook é gravado antes de ser interpretado. Se a interpretação
  falhar, o payload cru continua no banco e pode ser reprocessado depois de o
  mapeador ser corrigido.
- **Esperas duráveis:** uma jornada é um ponteiro mais uma data de retorno no
  banco. `setTimeout(24h)` numa função serverless morre junto com a invocação, e
  mesmo num servidor residente um deploy no meio da espera perderia a jornada —
  que aqui é um paciente que não foi contatado, sem ninguém saber.
- **Reserva atômica:** duas execuções sobrepostas do cron nunca pegam a mesma
  jornada.
- **Dead letters:** o que falhou de vez fica registrado, não desaparece.
- **Versionamento de automação:** quem já está na v1 continua lendo a v1 mesmo
  depois de a v2 virar a ativa. Sem isso, editar uma automação mudaria o
  comportamento de jornadas no meio do caminho.

### Testes

**1.081 testes unitários** (`npm run test`, ~6 segundos) e **65 de integração**
contra Postgres real (`npm run test:integracao`). O domínio inteiro é testável
sem banco, sem rede e sem relógio de parede, porque o "agora" sempre entra como
argumento.

> Este número envelhece a cada commit, e já esteve errado neste documento — ele
> dizia 310 quando o repositório tinha mais de mil. Para o valor de agora:
> `npx vitest run | tail -3`.

---

## 23. Operação do dia a dia

### Ordem recomendada para ligar as automações

O rollout é gradual de propósito. Para cada automação: **simulação → ler as
jornadas → recomendar → executar**.

1. Recuperação de faltas
2. Confirmação de consulta
3. Retorno de rotina
4. Reagendamento de cancelados
5. Aniversário
6. Recuperação de orçamento
7. Reativação de inativos
8. Cobrança de parcelas

Antes do primeiro envio real, o passo que não se pula é **abrir "ver jornadas" na
automação em simulação e ler o texto integral** que ela quer mandar.

### Quando algo dá errado

O [RUNBOOK](RUNBOOK.md) tem o diagnóstico de cada caso:

- "A automação não está enviando nada"
- "O Dental Office parou de sincronizar"
- "Um paciente recebeu mensagem depois de pedir para parar"
- "Jobs estão presos"
- "A automação duplicou"
- "A IA está dando erro"

E os interruptores de emergência, e o rollback.

---

## 24. Variáveis de ambiente

### Obrigatórias

| Variável                | O que é                                        |
| ----------------------- | ---------------------------------------------- |
| `SUPABASE_URL`          | O banco                                        |
| `SUPABASE_SERVICE_ROLE` | A chave de servidor                            |
| `CRC_SESSION_SECRET`    | 32+ caracteres aleatórios, para selar o cookie |
| `CRC_ADMIN_EMAIL`       | O primeiro administrador                       |
| `CRC_ADMIN_SENHA`       | Mínimo 10 caracteres                           |
| `CRON_SECRET`           | 32+ caracteres. **Sem ela o motor não roda.**  |

### Dental Office

| Variável                  | Estado                             |
| ------------------------- | ---------------------------------- |
| `DENTAL_OFFICE_BASE_URL`  | ⏳ pendente                        |
| `DENTAL_OFFICE_CLIENT_ID` | ⏳ pendente                        |
| `DENTAL_OFFICE_SECRET`    | ⏳ pendente                        |
| `DENTAL_OFFICE_CLINIC_ID` | opcional                           |
| `DENTAL_OFFICE_SANDBOX`   | `1` para usar o adapter de exemplo |

### WhatsApp

| Variável                                                            | Quando                              |
| ------------------------------------------------------------------- | ----------------------------------- |
| `WHATSAPP_PROVEDOR`                                                 | `twilio` · `meta` · `sandbox`       |
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` / `TWILIO_WHATSAPP_FROM` | se Twilio                           |
| `WHATSAPP_TOKEN` / `WHATSAPP_PHONE_ID` / `WHATSAPP_APP_SECRET`      | se Meta Cloud                       |
| `WHATSAPP_API_VERSAO`                                               | padrão `v21.0`                      |
| `WHATSAPP_VERIFY_TOKEN`                                             | handshake do webhook                |
| `WHATSAPP_WEBHOOK_URL`                                              | fixa a URL quando o proxy reescreve |
| `WHATSAPP_SANDBOX`                                                  | `1` para não enviar nada            |

### IA

| Variável           | O que é                                        |
| ------------------ | ---------------------------------------------- |
| `OPENAI_API_KEY`   | Já existe no ambiente (compartilhada com o RH) |
| `OPENAI_MODEL_CRC` | O modelo do CRC, separado do RH                |
| `CRC_IA_SANDBOX`   | `1` para classificar sem chamar a API          |
| `CRC_USD_BRL`      | Câmbio da estimativa de custo (padrão 5,5)     |

### Opcionais

`CRC_ADMIN_NOME` · `NODE_ENV`

---

## 25. Estado atual, honesto

Verificado em produção em 08/09/2026, pela rota de saúde e pela tela de
Integrações — que é a que não pode mentir.

```
GET /api/crc/saude  →  {"status":"ok","app":"ok","banco":"ok"}
```

| Área                                       | Estado                                                                               |
| ------------------------------------------ | ------------------------------------------------------------------------------------ |
| Site `/` e portal `/rh`                    | ✅ no ar                                                                             |
| CRC em `/crc`                              | ✅ **no ar, instalado e operando**                                                   |
| Tour institucional em `/crc-institucional` | ✅ no ar                                                                             |
| Schema aplicado no Supabase                | ✅ aplicado                                                                          |
| Variáveis mínimas                          | ✅ cadastradas                                                                       |
| Instalação inicial                         | ✅ executada — administrador criado, dez telas acessíveis                            |
| **Leitura automática (IA)**                | ✅ **conectada** — modelo `gpt-5.6-luna`                                             |
| Dental Office                              | ❌ falta `DENTAL_OFFICE_BASE_URL`, `DENTAL_OFFICE_CLIENT_ID`, `DENTAL_OFFICE_SECRET` |
| WhatsApp (provedor: Twilio)                | ❌ falta `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_FROM`           |
| Primeira sincronização                     | ⏳ nada sincronizado ainda                                                           |
| Cron a cada 10 min                         | ⚠️ hoje é diário (limite do plano Hobby)                                             |

**O que isso significa na prática:** o sistema está de pé, autentica, e todas as
telas abrem — com zero em todos os números, porque não há paciente na base. A
leitura de conversas por IA já funciona de verdade; o que falta é o que traz os
dados (Dental Office) e o que fala com o paciente (WhatsApp).

**O caminho crítico agora são as duas credenciais de terceiros**, e nenhuma das
duas depende de código: uma é o Dental Office liberar o acesso, a outra é
contratar Twilio ou Meta. Assim que a primeira chegar, a sincronização traz a
base de pacientes e a agenda; assim que a segunda chegar, as automações saem da
simulação.

Enquanto isso, o que **já dá para fazer sem nenhuma credencial nova**:

- importar orçamentos e cobranças por planilha, e ver o funil com valor real;
- cadastrar a equipe e ajustar horário, limites e templates;
- ler as automações em simulação, com o texto exato que elas querem mandar.

> **Nota sobre os outros documentos:** [FINAL-ACCEPTANCE](FINAL-ACCEPTANCE.md) e
> [ATIVACAO-EM-PRODUCAO](ATIVACAO-EM-PRODUCAO.md) foram escritos quando o schema
> ainda não estava aplicado, e descrevem a Parte A como pendente. Ela foi feita.
> Os dois continuam corretos sobre tudo o mais.

---

## 26. O que o sistema se recusa a fazer

Esta lista é tão parte do produto quanto a lista de funções.

1. **Não promete percentual de receita.** Mostra o mecanismo (mais contato → mais
   resposta → mais agenda) e o valor parado na fila. O que vira caixa depende da
   clínica.
2. **Não soma receita potencial com receita confirmada.** Enquanto não houver
   registro financeiro, o número se chama potencial — e a tela diz isso.
3. **Não conta como recuperação quem se resolveu sozinho.** Sem causalidade, não
   entra no relatório.
4. **Não deixa a IA agir fora da lista de ações.** O executor recusa qualquer
   coisa que o modelo invente.
5. **Não deixa a IA decidir sobre dor, medicamento, reclamação ou dinheiro.** Vai
   para humano, independentemente da confiança.
6. **Não manda mensagem fora do horário.** Adia para a abertura seguinte.
7. **Não manda mais de um contato proativo por paciente por dia.**
8. **Não continua falando quando um atendente assume a conversa.**
9. **Não insiste em cobrança além de três contatos.** Vira telefone.
10. **Não cita valor, juros, multa, protesto, negativação ou "último aviso" em
    mensagem de cobrança.**
11. **Não cobra terceiros.** Telefone ambíguo bloqueia, não escolhe.
12. **Não escolhe de quem é a conversa quando o telefone casa com dois
    pacientes.** Pede revisão humana.
13. **Não usa WhatsApp Web nem automação de navegador.** Só canal oficial.
14. **Não escreve no Dental Office** por padrão.
15. **Não liga automação sozinha.** Toda uma nasce em simulação, e alguém com
    permissão de gestor decide.
16. **Não deixa uma automação desistir em silêncio.** Quando ela desiste, vira
    tarefa humana — "o sistema desistiu" nunca pode significar "o paciente foi
    esquecido".

---

_Documento gerado a partir do código em 08/09/2026. Quando divergir do código, o
código está certo — e este arquivo está desatualizado._
