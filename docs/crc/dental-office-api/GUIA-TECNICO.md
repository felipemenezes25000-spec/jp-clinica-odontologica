# Dental Office — Guia Técnico Completo de API

> **Documento de referência técnica**
>
> Compilado em: **09/09/2026**
>
> Escopo: documentação pública atual da API do Dental Office + documentação histórica/legada do Dental Office Cloud.
>
> **Importante:** este documento separa explicitamente o que pertence à API pública atual (v1.0) do que pertence à API histórica/legada. Não reutilize autenticação, hosts, payloads ou verbos do legado sem validação contra a API atual.

---

## Sumário

1. [Visão geral](#1-visão-geral)
2. [Fontes consultadas](#2-fontes-consultadas)
3. [O que mudou entre a API atual e a API legada](#3-o-que-mudou-entre-a-api-atual-e-a-api-legada)
4. [API pública atual — v1.0](#4-api-pública-atual--v10)
5. [Autenticação atual](#5-autenticação-atual)
6. [Recursos expostos na API atual](#6-recursos-expostos-na-api-atual)
7. [Usuários](#7-usuários)
8. [Pacientes](#8-pacientes)
9. [Imagens de pacientes](#9-imagens-de-pacientes)
10. [Documentos de pacientes](#10-documentos-de-pacientes)
11. [Dentistas](#11-dentistas)
12. [Cadeiras](#12-cadeiras)
13. [Agendamentos](#13-agendamentos)
14. [Tipos, situações e motivos de agendamento](#14-tipos-situações-e-motivos-de-agendamento)
15. [Paginação e pesquisa](#15-paginação-e-pesquisa)
16. [Tratamento de erros](#16-tratamento-de-erros)
17. [API histórica / Dental Office Cloud](#17-api-histórica--dental-office-cloud)
18. [Autenticação legada](#18-autenticação-legada)
19. [Usuários — legado](#19-usuários--legado)
20. [Dentistas — legado](#20-dentistas--legado)
21. [Pacientes — legado](#21-pacientes--legado)
22. [Agenda — legado](#22-agenda--legado)
23. [Horários disponíveis — legado](#23-horários-disponíveis--legado)
24. [Imagens — legado](#24-imagens--legado)
25. [Entidades auxiliares](#25-entidades-auxiliares)
26. [Grupos de usuários](#26-grupos-de-usuários)
27. [SSO — legado](#27-sso--legado)
28. [Campos e modelos de dados importantes](#28-campos-e-modelos-de-dados-importantes)
29. [Inconsistências conhecidas da documentação antiga](#29-inconsistências-conhecidas-da-documentação-antiga)
30. [O que o Dental Office possui, mas não deve ser presumido como API pública](#30-o-que-o-dental-office-possui-mas-não-deve-ser-presumido-como-api-pública)
31. [Arquitetura recomendada para integração](#31-arquitetura-recomendada-para-integração)
32. [Estratégia de sincronização](#32-estratégia-de-sincronização)
33. [Boas práticas de segurança](#33-boas-práticas-de-segurança)
34. [Checklist de implementação](#34-checklist-de-implementação)
35. [Mapa rápido de endpoints](#35-mapa-rápido-de-endpoints)
36. [Exemplos de código](#36-exemplos-de-código)
37. [Conclusões](#37-conclusões)

---

# 1. Visão geral

O Dental Office disponibiliza uma API REST para integração de sistemas externos com dados e operações do software odontológico.

A página pública atual declara:

- API pública;
- versão **v1.0**;
- status **Operacional**;
- arquitetura REST;
- uso para pacientes, agendamentos e outros recursos;
- suporte específico por e-mail para integração.

A API histórica do Dental Office Cloud também era REST e trabalhava predominantemente com JSON.

A maior preocupação para qualquer implementação hoje é **não misturar a documentação antiga com a atual**.

---

# 2. Fontes consultadas

## 2.1 Documentação oficial atual

- Página principal:
  - https://apidocs.dentaloffice.com.br/
- Referência oficial:
  - https://apidocs.dentaloffice.com.br/reference.html
- Suporte da API:
  - api@dentaloffice.com.br

## 2.2 Documentação histórica / legado

- Referência antiga:
  - https://rhcloud1.com.br/dental/docs/

Essa documentação histórica contém aproximadamente 2 mil linhas de referência e é extremamente útil para entender:

- modelos internos;
- campos;
- relacionamentos;
- estrutura da agenda;
- tipos de pacientes;
- disponibilidade;
- SSO;
- formato de erros;
- payloads antigos.

**Mas ela não deve ser usada como contrato atual sem validação.**

---

# 3. O que mudou entre a API atual e a API legada

## Atual

Características encontradas na API pública v1.0:

- autenticação moderna baseada em credenciais de integração;
- uso de `client_id`;
- uso de `secret`;
- emissão de token;
- uso de `Authorization: Bearer ...`;
- endpoints sem necessidade de `.json` aparente na referência atual;
- documentação atual hospedada em `apidocs.dentaloffice.com.br`;
- URL/base de API fornecida ao cliente.

## Legado

A documentação antiga usa:

```text
https://no.api.stage.dentaloffice.com.br
```

e um endpoint individualizado:

```text
https://{client_key}.api.stage.dentaloffice.com.br
```

A autenticação histórica dependia de:

```http
X-User-Token: ...
X-User-Email: ...
X-Device-Register: ...
```

Além disso, quase todas as rotas antigas terminavam em:

```text
.json
```

Exemplo:

```text
GET /customers.json
```

**Conclusão:** não copie código de autenticação ou hosts do legado para a API atual.

---

# 4. API pública atual — v1.0

Status publicado:

```text
v1.0 — Operacional
```

A API é apresentada como uma API RESTful para integração com o Dental Office.

## Recursos identificados na referência atual

A referência atual expõe ou organiza recursos relacionados a:

- autenticação;
- usuários;
- pacientes;
- imagens do paciente;
- documentos do paciente;
- dentistas;
- clínicas/cadeiras;
- agendamentos;
- tipos de agendamento;
- situações de agendamento;
- motivos de agendamento;
- status/saúde da API.

---

# 5. Autenticação atual

A autenticação pública atual utiliza emissão de token.

Endpoint identificado:

```http
POST /auth/tokens
```

As credenciais fornecidas pelo Dental Office incluem:

```text
client_id
secret
```

A documentação indica que cada integração/cliente recebe dados próprios de acesso.

Após autenticação, as demais chamadas utilizam um Bearer Token:

```http
Authorization: Bearer SEU_TOKEN
```

## Fluxo recomendado

```text
Aplicação
   |
   v
POST /auth/tokens
   |
   v
Recebe token
   |
   v
Armazena token com segurança
   |
   v
Authorization: Bearer <token>
   |
   v
Chamadas aos demais endpoints
```

## Cuidados

Não colocar:

- `client_id`;
- `secret`;
- token;

diretamente no frontend web ou aplicativo móvel.

O ideal é:

```text
Frontend / App
      |
      v
Seu Backend
      |
      v
Dental Office API
```

---

# 6. Recursos expostos na API atual

Mapa conceitual:

```text
Dental Office API
│
├── Auth
│   └── Tokens
│
├── Users
│
├── Customers / Patients
│   ├── Images
│   └── Docs
│
├── Dentists
│
├── Clinics
│   └── Chairs
│
└── Scheduling
    ├── Appointments / Schedules
    ├── Types
    ├── Situations
    └── Reasons
```

> A nomenclatura exata de algumas rotas deve sempre ser confirmada na referência v1.0 no momento da implementação.

---

# 7. Usuários

A referência atual apresenta CRUD de usuários.

Rotas identificadas:

```http
GET    /users
POST   /users
GET    /users/{id}
PATCH  /users/{id}
DELETE /users/{id}
```

## Operações

### Listar usuários

```http
GET /users
```

Objetivo:

- listar usuários;
- construir sincronização;
- relacionar usuário com clínica/permissões quando disponível.

### Criar usuário

```http
POST /users
```

### Consultar usuário

```http
GET /users/{id}
```

### Atualizar usuário

```http
PATCH /users/{id}
```

### Excluir usuário

```http
DELETE /users/{id}
```

---

# 8. Pacientes

No Dental Office, o recurso historicamente chamado `customers` corresponde aos pacientes/clientes da clínica.

Rotas atuais identificadas:

```http
GET    /customers
POST   /customers
GET    /customers/{id}
PATCH  /customers/{id}
DELETE /customers/{id}
```

## Dados historicamente associados ao paciente

Embora os schemas atuais devam ser validados na v1.0, a estrutura histórica mostra dados como:

```text
id
name
title
record_number
record_date
gender
birth_date
birth_place
marital_status
dentist_id
photo
addresses
contacts
documents
customer_group
customer_situation
specialties
holder / sponsor
company
profession
parents/responsáveis
```

### Atenção

Não envie automaticamente todos esses campos na API atual.

Use esta lista como **modelo conceitual**, não como payload garantido da v1.0.

---

# 9. Imagens de pacientes

Rotas atuais identificadas no padrão:

```http
GET    /customers/{customer_id}/images
POST   /customers/{customer_id}/images
GET    /customers/{customer_id}/images/{id}
PATCH  /customers/{customer_id}/images/{id}
DELETE /customers/{customer_id}/images/{id}
```

A API histórica permitia:

- título;
- descrição;
- arquivo;
- tags;
- múltiplas URLs/tamanhos.

Campos históricos:

```text
id
customer_id
name
description
tag_list
file
file_url.original
file_url.medium
file_url.thumb
file_url.full
created_at
updated_at
deleted_at
```

Upload histórico usava imagem em Base64.

Exemplo conceitual:

```json
{
  "customer_image": {
    "name": "Radiografia panorâmica",
    "description": "Exame inicial",
    "file": "data:image/png;base64,...",
    "tag_list": "radiografia,panoramica"
  }
}
```

**Valide o formato de upload atual antes de implementar.**

---

# 10. Documentos de pacientes

A referência v1.0 atual apresenta documentos de pacientes separadamente das imagens.

Padrão identificado:

```text
/customers/{customer_id}/docs
```

Possíveis operações incluem listagem, inclusão, leitura, edição e exclusão, conforme o recurso exibido na referência atual.

Não confundir:

```text
/images
```

com:

```text
/docs
```

Isso permite modelar separadamente:

- radiografias;
- fotografias;
- anexos visuais;

e:

- PDFs;
- documentos;
- arquivos clínicos/administrativos.

---

# 11. Dentistas

A referência atual expõe dentistas como recurso próprio.

A API histórica tinha:

```http
GET    /dentists.json
POST   /dentists.json
GET    /dentists/{id}.json
PUT    /dentists/{id}.json
DELETE /dentists/{id}.json
```

Na API atual, os verbos e paths devem seguir a referência v1.0.

## Modelo histórico de dentista

Campos encontrados:

```text
id
name
specialty_id
duration
birth_date
rg
cpf
cr_type
cr_number
cr_uf
commission_type
commission_percent
commission_prosthetic
commission_prosthetic_percent
semester
register_number
dentist_type
chair_ids
created_at
updated_at
deleted_at
contacts_attributes
addresses_attributes
vacations_attributes
work_schedules_attributes
```

Tipos históricos:

```text
dentist
student
teacher
```

Isso mostra que o Dental Office historicamente também suportava contextos de clínica-escola.

---

# 12. Cadeiras

Na API pública atual, cadeiras são relacionadas à clínica.

Rotas identificadas:

```http
GET    /clinics/{clinic_id}/chairs
POST   /clinics/{clinic_id}/chairs
GET    /clinics/{clinic_id}/chairs/{id}
PUT    /clinics/{clinic_id}/chairs/{id}
DELETE /clinics/{clinic_id}/chairs/{id}
```

Observação importante:

- a referência atual usa `PUT` para atualização de cadeiras;
- outros recursos atuais podem usar `PATCH`.

Não padronize o verbo de atualização por conta própria.

Modelo histórico:

```text
id
name
created_at
updated_at
deleted_at
```

Dentistas também podiam possuir:

```text
chair_ids
```

---

# 13. Agendamentos

A agenda é uma das partes mais ricas da API.

O modelo histórico demonstra que um agendamento pode relacionar:

```text
clinic
chair
dentist
customer
schedule_type
schedule_reason
schedule_situation
```

Além de informações do próprio evento.

## Campos históricos de agendamento

```text
id
clinic_id
chair_id
dentist_id
customer_id
personal
description
schedule_start
schedule_end
duration
phone
cellphone
email
notes
periodic
schedule_type_id
schedule_reason_id
schedule_situation_id
integration_attributes
```

## Exemplo conceitual

```json
{
  "schedule": {
    "chair_id": 1,
    "dentist_id": 1,
    "customer_id": 123,
    "schedule_start": "2026-09-10 10:00:00",
    "duration": 30
  }
}
```

## Relações importantes

```text
Agendamento
├── Clínica
├── Cadeira
├── Dentista
├── Paciente
├── Tipo
├── Motivo
└── Situação
```

---

# 14. Tipos, situações e motivos de agendamento

A API atual separa metadados da agenda.

## Tipo de agendamento

Exemplos conceituais:

```text
Consulta
Avaliação
Retorno
Procedimento
Urgência
```

A documentação histórica apresenta objeto como:

```json
{
  "id": 1,
  "name": "Consulta"
}
```

## Situação do agendamento

Exemplo histórico:

```json
{
  "id": 1,
  "name": "Confirmar",
  "color": "#c86088",
  "font_color": "#ffffff",
  "label": "to_confirm"
}
```

Isso demonstra que a situação não era apenas texto: ela também podia controlar aparência/estado do calendário.

## Motivo de agendamento

A agenda histórica possuía:

```text
schedule_reason_id
```

A referência atual continua tratando motivos como recurso específico.

---

# 15. Paginação e pesquisa

Na API histórica, recursos de listagem utilizavam:

```text
q
page
```

Exemplo:

```http
GET /customers.json?q=felipe&page=2
```

Resposta histórica típica:

```json
{
  "total_pages": 1,
  "count": 1,
  "from": 1,
  "to": 1,
  "current_page": 1,
  "results": []
}
```

Portanto, a integração deve ser preparada para:

- paginação;
- busca textual;
- coleta de todas as páginas;
- deduplicação por ID.

**Não presuma que a paginação atual é idêntica; valide a v1.0.**

---

# 16. Tratamento de erros

Formato histórico:

```json
{
  "errors": {
    "format_error": ["The request must be json."]
  }
}
```

Erros históricos de autenticação:

| HTTP | Código                       | Significado                 |
| ---- | ---------------------------- | --------------------------- |
| 401  | `format_error`               | requisição deveria ser JSON |
| 401  | `request_login_and_password` | login/senha não enviados    |
| 401  | `request_device_register`    | device register ausente     |
| 401  | `request_device_platform`    | plataforma ausente          |
| 401  | `invalid_login`              | e-mail inválido/inexistente |
| 401  | `invalid_password`           | senha inválida              |

Para a API atual, trate genericamente:

```text
2xx -> sucesso
400 -> payload inválido
401 -> autenticação/token
403 -> acesso/permissão
404 -> recurso inexistente
409 -> conflito, se aplicável
422 -> validação, se aplicável
429 -> rate limit, se aplicável
5xx -> falha interna/provedor
```

Não presuma códigos não publicados; registre o corpo real retornado.

---

# 17. API histórica / Dental Office Cloud

A API histórica é útil para entender a arquitetura interna.

Características:

- REST;
- JSON;
- autenticação baseada em usuário;
- device registration;
- `client_key`;
- endpoints individualizados por cliente;
- uso extensivo de `.json`;
- estrutura com Rails-style nested attributes;
- URLs de stage.

Host padrão histórico:

```text
https://no.api.stage.dentaloffice.com.br
```

Host do cliente:

```text
https://{client_key}.api.stage.dentaloffice.com.br
```

---

# 18. Autenticação legada

Endpoint:

```http
POST /auth/tokens.json
```

Payload histórico:

```json
{
  "email": "email@example.com.br",
  "password": "password1234",
  "register": "asdasdads",
  "platform": "web"
}
```

Resposta histórica continha:

```text
expiration_date
trial_period
client_key
device_id
token
socket_token
user
```

Headers usados depois:

```http
X-User-Token: TOKEN
X-User-Email: EMAIL
X-Device-Register: DEVICE
```

**Não usar isso em uma integração nova sem autorização explícita do Dental Office.**

---

# 19. Usuários — legado

## Listar

```http
GET /users.json
```

Query:

```text
q
page
```

## Criar

```http
POST /users.json
```

Payload:

```json
{
  "user": {
    "user_group_id": 1,
    "name": "Nome",
    "email": "email@example.com",
    "password": "opcional"
  }
}
```

Campos:

| Campo                | Obrigatório |
| -------------------- | ----------- |
| `user`               | sim         |
| `user.name`          | sim         |
| `user.user_group_id` | sim         |
| `user.email`         | sim         |
| `user.password`      | não         |

Com senha:

- usuário era cadastrado diretamente.

Sem senha:

- usuário recebia convite para definir senha.

## Buscar por ID

```http
GET /users/{id}.json
```

## Atualizar

```http
PUT /users/{id}.json
```

## Excluir

Contrato declarado:

```http
DELETE /users/{id}.json
```

Atenção: exemplo JavaScript antigo apresenta incorretamente `GET`.

---

# 20. Dentistas — legado

## Listar

```http
GET /dentists.json
```

Query:

```text
q
page
```

## Criar

```http
POST /dentists.json
```

Payload mínimo:

```json
{
  "dentist": {
    "name": "Dentista",
    "duration": 30,
    "dentist_type": "dentist"
  }
}
```

Campos:

| Campo                     | Obrigatório |
| ------------------------- | ----------- |
| `dentist`                 | sim         |
| `dentist.name`            | sim         |
| `dentist.dentist_type`    | sim         |
| `dentist.duration`        | não         |
| `dentist.semester`        | não         |
| `dentist.register_number` | não         |

## Buscar por ID

```http
GET /dentists/{id}.json
```

## Atualizar

```http
PUT /dentists/{id}.json
```

## Excluir

```http
DELETE /dentists/{id}.json
```

---

# 21. Pacientes — legado

## Listar

```http
GET /customers.json
```

Query:

```text
q
page
```

## Criar

```http
POST /customers.json
```

Exemplo mínimo:

```json
{
  "customer": {
    "name": "Paciente",
    "record_date": "2026-09-09",
    "record_number": 5
  }
}
```

## Campos documentados

| Campo                             | Obrigatório |
| --------------------------------- | ----------- |
| `customer`                        | sim         |
| `customer.title`                  | não         |
| `customer.name`                   | sim         |
| `customer.record_number`          | não         |
| `customer.record_date`            | não         |
| `customer.photo`                  | não         |
| `customer.gender`                 | não         |
| `customer.birth_date`             | não         |
| `customer.birth_place`            | não         |
| `customer.marital_status`         | não         |
| `customer.dentist_id`             | não         |
| `customer.addresses_attributes[]` | não         |
| `customer.contacts_attributes[]`  | não         |
| `customer.document_attributes`    | não         |

## Buscar

```http
GET /customers/{id}.json
```

## Atualizar

```http
PUT /customers/{id}.json
```

## Excluir

```http
DELETE /customers/{id}.json
```

---

# 22. Agenda — legado

## Listar agendamentos

```http
GET /clinics/{clinic_id}/schedules.json
```

Query parameters:

| Campo        | Descrição                |
| ------------ | ------------------------ |
| `q`          | pesquisa                 |
| `page`       | página                   |
| `clinic_id`  | clínica                  |
| `chair_id`   | cadeira                  |
| `dentist_id` | dentista                 |
| `start`      | período inicial          |
| `end`        | período final            |
| `web`        | tratamento do retorno    |
| `calendar`   | formato calendário/lista |

Observação histórica:

```text
calendar=1
```

retornava dados preparados para calendário e sem paginação.

## Criar

```http
POST /clinics/{clinic_id}/schedules.json
```

Exemplo histórico:

```json
{
  "schedule": {
    "chair_id": 1,
    "dentist_id": 1,
    "customer_id": 1,
    "schedule_start": "2017-12-30 12:00:00",
    "duration": 30,
    "integration_attributes": {
      "name": "Parceiro X",
      "color": "#ff0000"
    }
  }
}
```

## Buscar por ID

```http
GET /clinics/{clinic_id}/schedules/{id}.json
```

## Atualizar

```http
PUT /clinics/{clinic_id}/schedules/{id}.json
```

Campos documentados:

| Campo                            | Obrigatório histórico |
| -------------------------------- | --------------------- |
| `id`                             | sim                   |
| `schedule`                       | sim                   |
| `schedule.chair_id`              | sim                   |
| `schedule.dentist_id`            | sim                   |
| `schedule.customer_id`           | não                   |
| `schedule.personal`              | não                   |
| `schedule.description`           | não                   |
| `schedule.schedule_start`        | sim                   |
| `schedule.phone`                 | não                   |
| `schedule.cellphone`             | não                   |
| `schedule.email`                 | documentado como sim  |
| `schedule.duration`              | sim                   |
| `schedule.notes`                 | não                   |
| `schedule.schedule_type_id`      | não                   |
| `schedule.schedule_reason_id`    | não                   |
| `schedule.schedule_situation_id` | não                   |

## Excluir

```http
DELETE /clinics/{clinic_id}/schedules/{id}.json
```

---

# 23. Horários disponíveis — legado

Endpoint histórico:

```http
GET /clinics/{clinic_id}/schedules/available_hours.json
```

Query:

| Campo        | Padrão    | Descrição       |
| ------------ | --------- | --------------- |
| `date`       | dia atual | data consultada |
| `dentist_id` | vazio     | dentista        |

Resposta:

```json
{
  "date": "2018-06-18",
  "periods": [
    {
      "start_time": "2018-06-18T08:00:00.000Z",
      "end_time": "2018-06-18T08:30:00.000Z"
    }
  ]
}
```

Esse endpoint é especialmente relevante para:

- agendamento online;
- chatbot;
- WhatsApp;
- recepcionista virtual;
- busca automática de encaixe.

Antes de usar hoje, valide se existe equivalente oficial na v1.0.

---

# 24. Imagens — legado

## Listar

```http
GET /customers/{customer_id}/images.json
```

Query:

```text
q
page
```

## Criar

```http
POST /customers/{customer_id}/images.json
```

Campos:

| Campo                        | Obrigatório |
| ---------------------------- | ----------- |
| `customer_id`                | sim         |
| `customer_image`             | sim         |
| `customer_image.name`        | sim         |
| `customer_image.file`        | sim         |
| `customer_image.description` | não         |
| `customer_image.tag_list`    | não         |

Arquivo histórico:

```text
data:image/png;base64,...
```

## Buscar por ID

```http
GET /customers/{customer_id}/images/{id}.json
```

## Atualizar

```http
PUT /customers/{customer_id}/images/{id}.json
```

## Excluir

```http
DELETE /customers/{customer_id}/images/{id}.json
```

---

# 25. Entidades auxiliares

A documentação histórica detalha algumas entidades aninhadas.

## Address

```text
id
street
number
complement
neighborhood
city
state
zipcode
```

Exemplo:

```json
{
  "street": "Rua Exemplo",
  "number": "100",
  "complement": "Sala 2",
  "neighborhood": "Centro",
  "city": "São Paulo",
  "state": "SP",
  "zipcode": "01000-000"
}
```

## Contact

```text
id
email
phone
cellphone
fax
homepage
message_contact
message_phone
```

## Document

Na entidade histórica de cadastro:

```text
id
cpf
rg
emitter
dental_insurance_id
plan_id
card_number
card_validate
```

Esse `Document` histórico parece representar principalmente **documentos cadastrais/convênio**, não o mesmo conceito de arquivo em `/docs` da API pública atual.

## Integration

```text
name
color
```

Campos históricos obrigatórios:

```text
name
color
```

Exemplo:

```json
{
  "integration_attributes": {
    "name": "Parceiro X",
    "color": "#ff0000"
  }
}
```

---

# 26. Grupos de usuários

Tabela histórica:

|  ID | Grupo              |
| --: | ------------------ |
|   1 | Administrador      |
|   2 | Atendente          |
|   3 | Cirurgião Dentista |
|   4 | Recepcionista      |
|   5 | Secretária         |
|   6 | Gerente Financeiro |
|   7 | Gerente Geral      |
|   8 | Aluno              |
|   9 | Professor          |

Esses IDs são históricos.

**Nunca codifique os IDs atuais sem confirmar no ambiente real.**

---

# 27. SSO — legado

A documentação histórica também tinha fluxo SSO.

Objetivo:

> permitir que um usuário acessasse o Dental Office através de outro sistema sem realizar login manual no Dental Office.

Era necessário solicitar ao desenvolvimento:

```text
Integration Token
Secret Access
```

## Solicitar access token

```http
POST /users/access_token
```

Payload:

```json
{
  "email": "usuario@example.com"
}
```

Autenticação histórica:

```http
Authorization: Basic ...
```

Resposta continha:

```text
id
name
email
client_key
access_token
```

Depois era criado formulário direcionado a:

```text
/auth/access
```

com:

```text
integration_token
access_token
```

**Este fluxo é legado e não deve ser considerado automaticamente disponível na API atual.**

---

# 28. Campos e modelos de dados importantes

## Patient / Customer

Modelo conceitual consolidado:

```text
Customer
├── id
├── name
├── title
├── record_number
├── record_date
├── gender
├── birth_date
├── birth_place
├── marital_status
├── dentist_id
├── photo
├── contacts[]
├── addresses[]
├── documents
├── group
├── situation
├── specialties[]
├── holder
├── sponsor
└── metadata
```

## Dentist

```text
Dentist
├── id
├── name
├── specialty
├── duration
├── CRO/registro
├── CPF/RG
├── type
├── chairs[]
├── contacts[]
├── addresses[]
├── vacations[]
└── work_schedules[]
```

## Appointment

```text
Schedule
├── id
├── clinic_id
├── chair_id
├── dentist_id
├── customer_id
├── start
├── end
├── duration
├── type
├── situation
├── reason
├── notes
├── contact
├── personal
└── integration
```

## Image

```text
CustomerImage
├── id
├── customer_id
├── name
├── description
├── tags
├── file
├── original
├── medium
├── thumb
└── full
```

---

# 29. Inconsistências conhecidas da documentação antiga

A documentação antiga contém erros editoriais que podem gerar bugs.

## DELETE documentado, exemplo usando GET

Em recursos como usuários, dentistas, pacientes e agenda, existem trechos em que:

- a rota declarada é `DELETE`;
- o exemplo JavaScript usa `xhr.open("GET", ...)`.

O contrato textual deve ser preferido ao exemplo nesses casos.

## Descrição copiada incorretamente

Na tabela do paciente, campos como:

```text
birth_date
birth_place
marital_status
dentist_id
```

aparecem com descrição indevida equivalente a:

```text
Sexo (M/F)
```

claramente resultado de copy/paste.

## Hosts de stage

Os exemplos usam:

```text
api.stage.dentaloffice.com.br
```

Isso indica ambiente histórico de stage/desenvolvimento.

Não use essas URLs em produção.

## HTTP em links antigos

Algumas URLs históricas de imagens/SSO usam `http://`.

Para uma integração moderna:

```text
HTTPS obrigatório.
```

---

# 30. O que o Dental Office possui, mas não deve ser presumido como API pública

O produto Dental Office possui recursos comerciais como:

- prontuário eletrônico;
- agenda;
- financeiro;
- relatórios;
- CRM;
- odontograma;
- meios de pagamento;
- comissionamento;
- confirmação de consulta;
- WhatsApp;
- aplicativo;
- prescrições digitais;
- gestão clínica.

Porém:

> **existir no produto não significa existir na API pública.**

Não invente rotas como:

```http
GET /financial
GET /odontogram
GET /anamnesis
GET /payments
GET /prescriptions
GET /reports
```

sem que elas estejam presentes na referência oficial ou sejam fornecidas diretamente pelo Dental Office.

---

# 31. Arquitetura recomendada para integração

Estrutura recomendada:

```text
┌─────────────────────────┐
│ Frontend / Mobile / Bot │
└────────────┬────────────┘
             │
             ▼
┌─────────────────────────┐
│      Seu Backend        │
│                         │
│ Auth                    │
│ DentalOfficeClient      │
│ Sync Service            │
│ Scheduler Service       │
│ Webhook/Polling Worker  │
│ Audit Log               │
└────────────┬────────────┘
             │
             ▼
┌─────────────────────────┐
│   Dental Office API     │
└─────────────────────────┘
```

## Nunca

```text
Browser -> Dental Office API usando secret
```

## Sempre preferir

```text
Browser -> Seu backend -> Dental Office API
```

---

# 32. Estratégia de sincronização

Para integrar dois sistemas, use IDs externos.

Exemplo:

```sql
dental_office_customer_id
dental_office_dentist_id
dental_office_schedule_id
dental_office_image_id
```

## Tabela de vínculo

Exemplo:

```text
integration_links

id
entity_type
local_id
remote_id
last_synced_at
remote_updated_at
sync_status
last_error
```

## Fluxo de paciente

```text
Paciente criado localmente
        |
        v
Procura vínculo Dental Office
        |
        +---- existe ----> PATCH/PUT
        |
        +---- não ----> POST
                         |
                         v
                  grava remote_id
```

## Agenda

Antes de criar um evento:

1. identificar clínica;
2. identificar dentista;
3. identificar cadeira;
4. identificar paciente;
5. validar horário;
6. validar duração;
7. criar;
8. salvar ID remoto;
9. registrar auditoria.

---

# 33. Boas práticas de segurança

## Segredos

Guardar em:

```text
AWS Secrets Manager
GCP Secret Manager
Azure Key Vault
Vercel Environment Variables
Vault
```

Nunca em:

```text
Git
JavaScript do browser
APK hardcoded
arquivo público
localStorage
```

## Logs

Nunca logar integralmente:

```text
Authorization
client_secret
token
CPF
RG
dados clínicos
documentos
arquivos
```

## LGPD

A integração lida com:

- dados pessoais;
- dados de identificação;
- contatos;
- potencialmente dados de saúde;
- arquivos/documentos clínicos.

Portanto, deve possuir:

- controle de acesso;
- princípio de menor privilégio;
- logs de auditoria;
- criptografia em trânsito;
- retenção adequada;
- rastreabilidade;
- segregação por clínica;
- política para dados sensíveis.

---

# 34. Checklist de implementação

## Credenciais

- [ ] Solicitar habilitação da API
- [ ] Receber URL/base específica
- [ ] Receber `client_id`
- [ ] Receber `secret`
- [ ] Confirmar ambiente produção/homologação
- [ ] Confirmar validade do token
- [ ] Confirmar rate limits

## Auth

- [ ] Implementar `POST /auth/tokens`
- [ ] Armazenar token no backend
- [ ] Implementar renovação automática
- [ ] Tratar 401
- [ ] Nunca expor secret ao frontend

## Pacientes

- [ ] GET pacientes
- [ ] POST paciente
- [ ] GET paciente por ID
- [ ] PATCH paciente
- [ ] DELETE paciente
- [ ] Mapear campos atuais
- [ ] Mapear paginação
- [ ] Implementar external ID

## Dentistas

- [ ] Listar dentistas
- [ ] Buscar dentista
- [ ] Criar/editar se necessário
- [ ] Relacionar cadeira
- [ ] Relacionar agenda

## Cadeiras

- [ ] Listar cadeiras da clínica
- [ ] Registrar `chair_id`
- [ ] Validar atualização via `PUT`

## Agenda

- [ ] Listar agenda
- [ ] Criar evento
- [ ] Buscar evento
- [ ] Atualizar
- [ ] Cancelar/remover
- [ ] Tipo
- [ ] Situação
- [ ] Motivo
- [ ] Clínica
- [ ] Cadeira
- [ ] Dentista
- [ ] Paciente
- [ ] Datas e timezone

## Arquivos

- [ ] Listar imagens
- [ ] Upload imagem
- [ ] Download/URL
- [ ] Atualizar metadados
- [ ] Remover
- [ ] Listar documentos
- [ ] Upload documento
- [ ] Validar limite de tamanho
- [ ] Validar formatos MIME

## Resiliência

- [ ] Retry somente quando seguro
- [ ] Backoff exponencial
- [ ] Timeout
- [ ] Idempotência
- [ ] Dead-letter/error queue
- [ ] Auditoria
- [ ] Observabilidade
- [ ] Alertas de falha

---

# 35. Mapa rápido de endpoints

## API atual — confirmados/identificados na referência pública

### Auth

```http
POST /auth/tokens
```

### Users

```http
GET    /users
POST   /users
GET    /users/{id}
PATCH  /users/{id}
DELETE /users/{id}
```

### Customers

```http
GET    /customers
POST   /customers
GET    /customers/{id}
PATCH  /customers/{id}
DELETE /customers/{id}
```

### Customer Images

```http
GET    /customers/{customer_id}/images
POST   /customers/{customer_id}/images
GET    /customers/{customer_id}/images/{id}
PATCH  /customers/{customer_id}/images/{id}
DELETE /customers/{customer_id}/images/{id}
```

### Customer Docs

Base atual identificada:

```text
/customers/{customer_id}/docs
```

### Dentists

Recurso atual exposto:

```text
/dentists
```

### Chairs

```http
GET    /clinics/{clinic_id}/chairs
POST   /clinics/{clinic_id}/chairs
GET    /clinics/{clinic_id}/chairs/{id}
PUT    /clinics/{clinic_id}/chairs/{id}
DELETE /clinics/{clinic_id}/chairs/{id}
```

### Scheduling metadata

A referência atual possui recursos separados para:

```text
agendamentos
tipos de agendamento
situações de agendamento
motivos de agendamento
```

> Para estes grupos, valide na referência atual o path e verbo exatos antes de implementação, pois a documentação pública é renderizada dinamicamente.

---

## API histórica

### Auth

```http
POST /auth/tokens.json
```

### Users

```http
GET    /users.json
POST   /users.json
GET    /users/{id}.json
PUT    /users/{id}.json
DELETE /users/{id}.json
```

### Dentists

```http
GET    /dentists.json
POST   /dentists.json
GET    /dentists/{id}.json
PUT    /dentists/{id}.json
DELETE /dentists/{id}.json
```

### Customers

```http
GET    /customers.json
POST   /customers.json
GET    /customers/{id}.json
PUT    /customers/{id}.json
DELETE /customers/{id}.json
```

### Schedules

```http
GET    /clinics/{clinic_id}/schedules.json
POST   /clinics/{clinic_id}/schedules.json
GET    /clinics/{clinic_id}/schedules/{id}.json
PUT    /clinics/{clinic_id}/schedules/{id}.json
DELETE /clinics/{clinic_id}/schedules/{id}.json
```

### Availability

```http
GET /clinics/{clinic_id}/schedules/available_hours.json
```

### Images

```http
GET    /customers/{customer_id}/images.json
POST   /customers/{customer_id}/images.json
GET    /customers/{customer_id}/images/{id}.json
PUT    /customers/{customer_id}/images/{id}.json
DELETE /customers/{customer_id}/images/{id}.json
```

### SSO

```http
POST /users/access_token
POST /auth/access
```

---

# 36. Exemplos de código

> Os exemplos abaixo são estruturais. Ajuste base URL e payload exatos conforme as credenciais e schemas da API atual fornecidos pelo Dental Office.

## JavaScript / TypeScript — cliente base

```ts
export class DentalOfficeClient {
  constructor(
    private readonly baseUrl: string,
    private readonly clientId: string,
    private readonly secret: string,
  ) {}

  private token: string | null = null;

  async authenticate() {
    const response = await fetch(`${this.baseUrl}/auth/tokens`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        client_id: this.clientId,
        secret: this.secret,
      }),
    });

    if (!response.ok) {
      throw new Error(`Dental Office auth failed: ${response.status}`);
    }

    const data = await response.json();

    this.token = data.token ?? data.access_token;

    if (!this.token) {
      throw new Error("Dental Office não retornou token reconhecido.");
    }

    return data;
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    if (!this.token) {
      await this.authenticate();
    }

    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.token}`,
        ...init.headers,
      },
    });

    if (response.status === 401) {
      this.token = null;
      await this.authenticate();

      return this.request<T>(path, init);
    }

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Dental Office ${response.status}: ${text}`);
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return response.json();
  }

  listCustomers() {
    return this.request("/customers");
  }

  getCustomer(id: number | string) {
    return this.request(`/customers/${id}`);
  }

  createCustomer(payload: unknown) {
    return this.request("/customers", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  updateCustomer(id: number | string, payload: unknown) {
    return this.request(`/customers/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  }

  deleteCustomer(id: number | string) {
    return this.request(`/customers/${id}`, {
      method: "DELETE",
    });
  }
}
```

## cURL — autenticação estrutural

```bash
curl -X POST "$DENTAL_OFFICE_BASE_URL/auth/tokens" \
  -H "Content-Type: application/json" \
  -d '{
    "client_id": "SEU_CLIENT_ID",
    "secret": "SEU_SECRET"
  }'
```

## cURL — listar pacientes

```bash
curl "$DENTAL_OFFICE_BASE_URL/customers" \
  -H "Authorization: Bearer SEU_TOKEN"
```

## cURL — paciente por ID

```bash
curl "$DENTAL_OFFICE_BASE_URL/customers/123" \
  -H "Authorization: Bearer SEU_TOKEN"
```

---

# 37. Conclusões

A API do Dental Office possui uma base suficientemente rica para integrações relevantes envolvendo principalmente:

- pacientes;
- usuários;
- dentistas;
- agenda;
- cadeiras;
- documentos;
- imagens;
- metadados de agendamento.

A documentação histórica mostra que o sistema já possuía uma modelagem de agenda bastante completa, incluindo:

- clínica;
- cadeira;
- dentista;
- paciente;
- situação;
- tipo;
- motivo;
- disponibilidade de horários;
- campos para integração de parceiros.

Por outro lado, a API pública atual é uma evolução do contrato histórico e utiliza uma abordagem de autenticação diferente.

## Regra de ouro

```text
API pública atual = fonte de verdade.
API histórica = referência de comportamento/modelagem.
```

Nunca considerar um endpoint legado válido hoje sem verificar a referência atual ou confirmar diretamente com o suporte do Dental Office.

---

# Apêndice A — Referência rápida de diferenças

| Item                | Atual                         | Legado                            |
| ------------------- | ----------------------------- | --------------------------------- |
| Status              | v1.0 operacional              | histórico                         |
| Auth                | client credentials/token      | email/senha/device                |
| Header              | Bearer                        | X-User-Token + Email + Device     |
| Host                | fornecido ao cliente          | `*.api.stage.dentaloffice.com.br` |
| Sufixo `.json`      | não presumir                  | comum                             |
| Update              | PATCH/PUT depende do recurso  | PUT predominante                  |
| Docs                | `apidocs.dentaloffice.com.br` | `rhcloud1.com.br/dental/docs`     |
| Uso em novo projeto | sim                           | não sem validação                 |

---

# Apêndice B — Perguntas que devem ser feitas ao Dental Office antes de produção

1. Qual é a base URL de produção?
2. Existe ambiente sandbox/homologação?
3. Qual é o payload exato de `POST /auth/tokens`?
4. Qual é a validade real do token?
5. Existe refresh token?
6. Existe rate limit?
7. Há limite de requisições por minuto?
8. Quais endpoints suportam paginação?
9. Qual é o page size?
10. Existe filtro por `updated_at`?
11. Existe webhook?
12. Existem eventos de paciente?
13. Existem eventos de agenda?
14. Existe webhook de cancelamento?
15. Existe endpoint atual de horários disponíveis?
16. Existe endpoint para agenda por intervalo?
17. Existe idempotency key?
18. Existe soft delete?
19. O DELETE de paciente remove ou apenas inativa?
20. Quais MIME types são aceitos em imagens?
21. Quais MIME types são aceitos em documentos?
22. Qual tamanho máximo de arquivo?
23. Arquivo é Base64 ou multipart?
24. URLs de arquivo são temporárias ou permanentes?
25. Existe expiração de URL assinada?
26. Existem permissões/scopes de token?
27. Existe segregação por clínica?
28. Um token pode acessar várias clínicas?
29. Como identificar `clinic_id`?
30. Como listar tipos/situações/motivos?
31. Há restrições LGPD específicas da integração?
32. Existe SLA?
33. Existe versionamento via header ou URL?
34. Como são anunciadas breaking changes?
35. Existe coleção Postman/OpenAPI para download?

---

# Apêndice C — Estrutura ideal de um módulo de integração

```text
src/
└── integrations/
    └── dental-office/
        ├── dental-office.client.ts
        ├── dental-office.auth.ts
        ├── dental-office.types.ts
        ├── dental-office.errors.ts
        ├── dental-office.mapper.ts
        ├── dental-office.sync.ts
        ├── resources/
        │   ├── users.ts
        │   ├── customers.ts
        │   ├── dentists.ts
        │   ├── chairs.ts
        │   ├── schedules.ts
        │   ├── schedule-types.ts
        │   ├── schedule-reasons.ts
        │   ├── schedule-situations.ts
        │   ├── images.ts
        │   └── docs.ts
        └── tests/
            ├── auth.spec.ts
            ├── customers.spec.ts
            ├── schedules.spec.ts
            └── integration.spec.ts
```

---

# Apêndice D — Status de confiabilidade das informações

## Alta confiança / fonte atual

- existência da API pública;
- v1.0;
- status operacional;
- natureza REST;
- suporte oficial;
- autenticação por token;
- recursos atuais expostos na referência pública;
- existência de usuários, pacientes, dentistas, cadeiras, imagens, docs e agenda.

## Alta confiança / histórico

- estrutura detalhada do Dental Office Cloud;
- rotas `.json`;
- headers antigos;
- `client_key`;
- schemas históricos;
- agenda histórica;
- disponibilidade histórica;
- SSO histórico;
- entidades auxiliares.

## Exige validação na v1.0 antes de codificar

- schemas completos de request atual;
- schemas completos de response atual;
- campos obrigatórios atuais;
- paginação atual;
- rate limit;
- webhook;
- formato atual de upload;
- endpoint atual equivalente a `available_hours`;
- comportamento de DELETE;
- filtros de `updated_at`;
- idempotência;
- limites de arquivo.

---

**Fim do documento.**
