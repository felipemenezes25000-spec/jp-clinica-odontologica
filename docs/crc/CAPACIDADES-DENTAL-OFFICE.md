# O que o CRC consegue fazer com o Dental Office

> [!NOTE]
> **Este documento é um recorte datado.** Ele descreve o sistema como estava
> quando foi escrito, e vale como registro da decisão daquele momento.
>
> Para o que o CRC faz **hoje**, o mapa é
> [CRC-MAPA-DO-SISTEMA.md](./CRC-MAPA-DO-SISTEMA.md) — gerado do código por
> `node scripts/mapa-do-sistema.mjs`, então não desatualiza sozinho.

Levantado lendo a especificação OpenAPI 3.0.3 deles inteira — 59 operações em
14 recursos, guardada em [`dental-office-api/`](dental-office-api/).

**Este documento existe para uma coisa:** separar o que o sistema faz do que
ele parece fazer. Toda linha aqui foi conferida contra a especificação, e não
contra o site do produto — o Dental Office tem muito mais funções do que a API
expõe, e confundir os dois é como um projeto inteiro é construído sobre nada.

---

## Resumo em uma tela

|                           |                                                                                                                  |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| **Funciona por completo** | falta, cancelamento, confirmação, retorno de rotina, reativação de inativos, aniversário, agendamento automático |
| **Funciona pela metade**  | situação do paciente, especialidade, convênio                                                                    |
| **Não funciona pela API** | orçamento parado, cobrança de parcelas, receita confirmada                                                       |
| **Não existe**            | webhooks, sincronização incremental de pacientes                                                                 |

---

## 1. O que funciona por completo

Estas automações dependem só de **pacientes, dentistas e agenda** — e os três
estão inteiros na API.

### Recuperação de faltas

`GET /clinics/{id}/schedules` traz a situação de cada consulta, e o rótulo
`absence` identifica quem faltou. A automação abre oportunidade, espera duas
horas e conversa.

### Reagendamento de cancelados

Mesmo caminho, rótulo `cancelled`.

### Confirmação de consulta

Rótulo `to_confirm` na véspera. A confirmação pode ser **escrita de volta**:
`PATCH /clinics/{id}/schedules/{id}` muda a situação.

### Retorno de rotina e reativação de inativos

Calculados a partir de `ultima_consulta_em`, que vem da agenda. Não dependem
de nenhum campo que a API não tenha.

### Aniversário

`birth_date` vem no paciente.

### Agendamento automático — o fluxo completo

Este é o mais dependente da API, e ela **sustenta o caminho inteiro**:

| Passo                     | Endpoint                                      |
| ------------------------- | --------------------------------------------- |
| oferecer horários reais   | `GET /clinics/{id}/schedules/available_hours` |
| revalidar antes de gravar | o mesmo, de novo                              |
| criar a consulta          | `POST /clinics/{id}/schedules`                |
| cancelar / remarcar       | `PATCH /clinics/{id}/schedules/{id}`          |

**Duas particularidades que moldaram o código:**

`available_hours` **não aceita intervalo de datas** — só `dentist_id` e `next`
(quantidade de dias após hoje, padrão 9). Por isso a revalidação pede a janela
até o dia da consulta e procura o instante exato na resposta.

Cada horário livre traz o **`chair_id`**, e criar a consulta exige a cadeira.
A cadeira não é escolha do CRC: é parte do horário. Horário sem cadeira é
descartado, porque oferecê-lo produziria uma promessa que quebra ao confirmar.

---

## 2. O que funciona pela metade

Três campos do paciente vêm como **número sem tradução**. O CRC lê os três,
mas com ressalvas que precisam estar escritas.

### Situação do paciente — funciona, com uma suposição

`GET /customers` devolve `customer_situation_id`, e **não há endpoint que liste
as situações de paciente**. O CRC interpreta pela tabela padrão:

| id  | situação          |
| --- | ----------------- |
| 1   | primeira consulta |
| 2   | em tratamento     |
| 3   | concluído         |
| 4   | alta              |
| 7   | abandono          |

**A suposição:** que a clínica use os ids de fábrica. Se ela criou situações
próprias, a leitura sai errada. Como `schedule_situations` é configurável por
clínica, é razoável supor que `customer_situations` também seja.

_Pergunta 10 da lista para o Dental Office._

### Especialidade — funciona, resolvida em dois passos

O paciente traz `specialty_ids` — um **array de números**. O CRC pega o
primeiro e traduz consultando `GET /disciplines` **uma vez por sincronização**.

Uma consulta por paciente traduziria a mesma palavra milhares de vezes e
consumiria a cota inteira da API.

Quando a tradução falha, o **id fica gravado no lugar do nome**. É pior que o
nome e melhor que `null`: ainda agrupa pacientes da mesma especialidade, e a
tradução acontece sozinha na próxima sincronização.

### Convênio — só o número, e às vezes o nome

`GET /customers` devolve `dental_insurance_id`, e **não existe endpoint que
liste convênios**. O nome (`dental_insurance_name`) aparece apenas dentro do
paciente aninhado na resposta da **agenda**.

O CRC guarda o nome quando ele vem e o id quando não vem. O filtro de campanha
por convênio funciona, mas pode mostrar números em vez de nomes.

_Pergunta 9 da lista._

---

## 3. O que NÃO funciona pela API

**A API v1.0 não expõe nada de financeiro.** Sem orçamento, sem parcela, sem
pagamento, sem recebimento. O produto Dental Office tem tudo isso; o contrato
público, não.

Isso afeta três coisas, e a decisão foi **manter o mecanismo e trocar a
entrada de dados** — não apagar o trabalho:

### Recuperação de orçamento parado

A automação existe e funciona. O que não existe é o gatilho automático: nada
avisa o CRC de que um orçamento ficou parado.

**Como usar hoje:** a tela **Importar** aceita a planilha de orçamentos
exportada do Dental Office. A partir dela, a automação roda normalmente.

A flag `budget_integration` nasce desligada e continua desligada — ela existe
para o dia em que a API tiver o endpoint.

### Cobrança de parcelas

Idêntico. A régua de cobrança dentro do art. 42 do CDC está implementada e
testada; a lista de parcelas vencidas entra por planilha.

### Receita confirmada

Sem integração financeira, o sistema **nunca diz "receita"** — diz **"valor
potencial"**, e a tela escreve isso. Chamar potencial de receita seria a
mentira mais fácil e mais cara de um painel.

---

## 4. O que a API não tem, e muda a arquitetura

### Sem webhooks

O Dental Office não avisa quando algo muda. Por isso o CRC é construído sobre
um **motor que varre**, e não sobre eventos empurrados. Não é preguiça de
arquitetura: é o que a API permite.

**Consequência direta:** a frequência do motor **é** o tempo de resposta do
sistema. Ver a Parte F do documento de ativação.

### Sem sincronização incremental de pacientes

`GET /customers` aceita `q`, `page`, `clinic_id`, `active` e filtros de
exclusão — e nada como `updated_since`. **Toda varredura de pacientes é
completa.**

A agenda, essa sim, filtra por `start`/`end`.

**A estratégia que isso impõe:** pacientes uma vez ao dia, agenda com
frequência.

_Pergunta 6 da lista — e é a que mais mudaria as contas se a resposta for
positiva._

### O limite de 5.000 requisições, sem período definido

A especificação diz "por período" e não define qual. O adapter **mede sozinho**
— registra `RateLimit-Remaining` e avisa no diário quando o número sobe, que é
o instante em que a janela virou.

---

## 5. O que a API permite e o CRC ainda não usa

Levantado para não reinventar depois:

| Recurso                            | O que daria para fazer                                               |
| ---------------------------------- | -------------------------------------------------------------------- |
| `POST /customers`                  | cadastrar no Dental Office o lead que virou paciente, sem digitação  |
| `/customers/{id}/images` e `/docs` | anexar documento enviado pelo paciente no WhatsApp                   |
| `/customers/{id}/evolutions`       | registrar evolução — **provavelmente não deveríamos**: é ato clínico |
| `/clinics/{id}/chairs`             | ler as cadeiras para relatório de ocupação                           |
| `/schedule_reasons`                | classificar o motivo da consulta ao agendar                          |
| `/users`                           | espelhar a equipe do Dental Office na equipe do CRC                  |

O primeiro é o mais valioso: hoje o lead que fecha vira paciente **na mão**, e
a API permite criar direto.

---

## 6. A regra que não pode ser esquecida

> **Existir no produto Dental Office não é existir na API.**

Financeiro, odontograma, anamnese, CRM e pagamentos aparecem no site deles e
**não estão** no contrato público v1.0.

Nada deve ser implementado contra um endpoint que não esteja nos arquivos de
[`dental-office-api/`](dental-office-api/). Se surgir a necessidade, o caminho
é perguntar a **api@dentaloffice.com.br** — não deduzir.

Foi exatamente por deduzir que o adapter nasceu falando com uma API que não
existe, e passou em 378 testes fazendo isso.
