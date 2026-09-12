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

## Documentação antiga

Existe uma referência histórica, com autenticação por `X-User-Token` /
`X-User-Email` e endpoints em `*.api.stage.dentaloffice.com.br`. **Ela não vale
mais** para autenticação, e alguns dos exemplos dela estão errados (blocos
intitulados "Remover" com `xhr.open("GET", ...)` no código).

Ela serve para entender o modelo de dados por baixo — nunca para copiar
chamada.
