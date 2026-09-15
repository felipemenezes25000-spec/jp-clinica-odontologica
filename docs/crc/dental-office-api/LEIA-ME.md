# A especificação da API do Dental Office, guardada aqui

Estes arquivos são a **cópia da OpenAPI 3.0.3 publicada** em
<https://apidocs.dentaloffice.com.br/openapi.yml>, baixada em **09/09/2026**.

## Por que uma cópia no repositório

Porque a falta dela custou caro uma vez.

O adapter do Dental Office foi escrito **antes** de a documentação estar em
mãos, contra uma API imaginada: `/v1/clinics`, `/v1/schedules`, `PUT` para
mudar status, `available_hours` com intervalo de datas. Nada disso existe.

E os testes passavam — todos. O sandbox implementava a interface que **nós
inventamos**, então o sistema inteiro ficava verde contra uma API que não era
a real. É o modo mais silencioso de um software estar errado: sem erro, sem
log, e sem funcionar no primeiro dia de produção.

Com a especificação versionada junto do código, a próxima pessoa que mexer no
adapter compara com o arquivo em vez de com a memória.

## O que tem aqui

| Arquivo                                                                 | Recurso                                                         |
| ----------------------------------------------------------------------- | --------------------------------------------------------------- |
| `../openapi-dentaloffice.yml`                                           | o documento raiz: auth, servidores, tags, e a lista de caminhos |
| `auth.yml`                                                              | `POST /auth/tokens`                                             |
| `customers.yml`                                                         | pacientes                                                       |
| `customer-images.yml`, `customer-docs.yml`, `customer-evolutions.yml`   | prontuário                                                      |
| `dentists.yml`                                                          | dentistas                                                       |
| `chairs.yml`                                                            | cadeiras (equipos)                                              |
| `schedules.yml`                                                         | agenda, **incluindo `available_hours`**                         |
| `schedule-types.yml`, `schedule-situations.yml`, `schedule-reasons.yml` | metadados da agenda                                             |
| `disciplines.yml`                                                       | especialidades                                                  |
| `users.yml`                                                             | usuários                                                        |
| `status.yml`                                                            | saúde da API                                                    |

São **59 operações**, sendo **33 de escrita**.

## As quatro coisas que mais importam

**1. A URL base já termina em `/v1`.** Ela é exclusiva por cliente e vem por
e-mail. Concatenar `/v1` no código produz `/v1/v1/...` e 404 em tudo.

> [!WARNING]
> **Esta regra já foi quebrada uma vez, e em silêncio.** `cliente.ts` a
> respeitava; `auth.ts` não, e montava `/v1/v1/auth/tokens`. Como autenticar é a
> PRIMEIRA chamada de qualquer fluxo, a integração inteira morreria no primeiro
> passo, no primeiro dia — sem chegar a tentar nada.
>
> Nenhum teste viu: o bloco que confere `/v1/v1` olha a "última chamada de
> negócio", que exclui `/auth/tokens` por construção, e o teste que olhava a
> autenticação conferia método e corpo, nunca a URL.
>
> A regra agora é **uma função só** — [`base-url.ts`](../../../src/lib/crc/integracoes/dental-office/base-url.ts) —
> usada pelos dois arquivos, porque duas cópias da mesma regra é exatamente como
> uma delas fica para trás. Quem for montar URL nova: chame `raizDaApi()`.

**2. O verbo de atualização varia por recurso.** Conferido um a um:

| `PUT`                                     | `PATCH`                                                         |
| ----------------------------------------- | --------------------------------------------------------------- |
| cadeiras, disciplinas, motivos, situações | pacientes, dentistas, usuários, imagens, documentos, **agenda** |

Não padronize. O CRC escreve só em agenda, e ali é `PATCH`.

**3. `available_hours` não aceita intervalo de datas.** Só `dentist_id` e
`next` (quantidade de dias após hoje, padrão 9). E cada período livre traz o
`chair_id` — que é obrigatório para criar a consulta.

**4. A situação do agendamento deve ser lida pelo `label`, não pelo id.** A API
deixa cada clínica criar situações (`POST /schedule_situations`), então o
número não é estável entre clínicas. O rótulo é.

## O que a API não tem

Sem financeiro, sem odontograma, sem anamnese, sem pagamentos, e **sem
webhooks**. O produto Dental Office tem tudo isso; a API pública v1.0, não.

Existir no produto não é existir no contrato — e nada deve ser implementado
contra um endpoint que não esteja nestes arquivos. Se surgir a necessidade, o
caminho é perguntar a **api@dentaloffice.com.br**, não deduzir.

## O que a especificação não responde

Coisas que a leitura destes arquivos **não** resolve, e que dependem do suporte
deles. As doze estão escritas, com o trecho de código que depende de cada uma,
em [`../EMAIL-DENTAL-OFFICE.md`](../EMAIL-DENTAL-OFFICE.md).

As três que mais custam:

**O período do rate limit.** A introdução diz "limite de **5.000 requisições**
por período" e nunca diz qual é o período. Não há `RateLimit-Reset`. Por hora é
folga larga; por dia cabe apertado; por mês inviabiliza sincronização frequente.

**`per_page` nos dois endpoints que importam.** A introdução manda usar `page` e
`per_page`, mas a lista de parâmetros só declara `per_page` em
`customer-evolutions`, `disciplines`, `schedule-reasons` e `schedule-situations`
— **não** em `/customers` nem em `/clinics/{id}/schedules`, que são os dois que
o CRC pagina em volume. Se ele for ignorado ali, o tamanho de página é o que o
servidor decidir, e a conta de requisições muda.

**Quem lista as situações de paciente e os convênios.** `customer_situation_id`
e `dental_insurance_id` vêm como número, e não há endpoint que traduza nenhum
dos dois.

## Documentação antiga

Existe uma referência histórica, com autenticação por `X-User-Token` /
`X-User-Email` e endpoints em `*.api.stage.dentaloffice.com.br`. **Ela não vale
mais** para autenticação, e alguns dos exemplos dela estão errados (blocos
intitulados "Remover" com `xhr.open("GET", ...)` no código).

Ela serve para entender o modelo de dados por baixo — nunca para copiar
chamada.
