# ATIVAÇÃO EM PRODUÇÃO — JP CRC OS

Tudo o que falta para o CRC sair do repositório e entrar na operação da
clínica: o que fazer, em que ordem, com que comando, e como saber que
funcionou.

Este documento é o **caminho de ida**. Depois que o sistema estiver operando,
quem cuida do dia a dia usa o [RUNBOOK](RUNBOOK.md). O que existe e o que não
existe está auditado em [FINAL-ACCEPTANCE](FINAL-ACCEPTANCE.md).

---

## Onde estamos agora

**O código está publicado.** `main` foi para produção na Vercel em 08/09/2026, e
`/crc` responde em **https://www.jpclinicaodontologica.com.br/crc**.

Isso não quer dizer que o CRC esteja funcionando — quer dizer que ele está
servido. Hoje:

```bash
curl -sL https://www.jpclinicaodontologica.com.br/api/crc/saude
```

```json
{"status":"ok","app":"ok","banco":"ok"}
```

**Atualizado:** o schema 02 a 04 foi aplicado, as variáveis foram cadastradas e
a instalação rodou — `/api/crc/saude` responde `{"status":"ok"}`. O que falta do
banco são os arquivos **05** e **06**, que chegaram depois: sem eles as telas de
Campanhas e de custo por paciente abrem com erro.

| | Estado |
|---|---|
| Site `/` e portal `/rh` | ✅ no ar, intactos |
| Código do CRC publicado | ✅ |
| Schema 02, 03 e 04 no Supabase | ✅ aplicados |
| **Schema 05 e 06** (investimento e campanhas) | ❌ **pendentes** — as telas abrem com erro até rodar |
| Variáveis de ambiente (A.2) | ✅ cadastradas |
| Instalação inicial (A.3) | ✅ executada |
| Equipe (B) | ⚠️ só o administrador |
| Credenciais Dental Office (C.1) | ❌ aguardando terceiro |
| Provedor de WhatsApp (C.2) | ❌ aguardando contratação |
| Cron a cada 10 min (F) | ⚠️ hoje é diário — ver a Parte F |

**Como publicar de novo**, depois de mexer em variável de ambiente ou em
código:

```bash
npx vercel --prod --yes
```

O projeto já está linkado (`.vercel/project.json`); não precisa de mais nada.

---

## O resumo em uma tela

| Bloco | Depende de quem | Tempo | Sem isso, o que acontece |
|---|---|---|---|
| **A.** Banco, variáveis e instalação | Você | ~40 min | O `/crc` não abre. Nada funciona. |
| **B.** Acesso da equipe | Você, pela tela | ~2 min por pessoa | Só existe o login do administrador. |
| **C.** Credenciais de terceiros | Dental Office e Twilio/Meta | Fora do nosso controle | O CRC abre e fica vazio: sem paciente e sem mensagem. |
| **D.** Horário e política da clínica | Você, via SQL | ~10 min | Vale o padrão: seg–sex 8h–19h, sáb 8h–13h, 1 contato/dia. |
| **E.** Três lacunas de código | Nós | Ver a lista | Nenhuma impede operar. |
| **F.** Cron a cada 10 min | Você | ~5 min | O plano Hobby só dá cron diário; sem um pinger externo o faltante só recebe mensagem no dia seguinte. |

**A próxima ação é rodar o 05 e o 06** — os dois SQL que chegaram depois da
primeira instalação.

**Depois disso, o caminho crítico é o C**, e ele não depende de nós nem de você:
sem as credenciais do Dental Office e de um provedor de WhatsApp, o sistema
sobe, autentica, mostra as telas — e não tem o que mostrar. A e B se resolvem
em uma tarde, pela tela. D é opcional. E não bloqueia nada. F é cinco minutos e
vale muito.

---

## Parte A — Os 40 minutos que só dependem de você

### A.1 Aplicar os SQL

SQL Editor do Supabase, **nesta ordem**, um de cada vez. Os cinco são aditivos
e idempotentes — o 03 ao 06 podem ser aplicados com o sistema no ar:

| Arquivo | O que cria |
|---|---|
| `supabase/02-crc-schema.sql` | As 36 tabelas, os índices, o RLS e as três funções de reserva atômica. |
| `supabase/03-crc-cobranca.sql` | `crc_charges` e `crc_payment_agreements` (cobrança de inadimplência). |
| `supabase/04-crc-visoes.sql` | O índice único das visões salvas. |
| `supabase/05-crc-investimento.sql` | `crc_ad_spend` — o investimento em anúncios, para o custo por paciente. |
| `supabase/06-crc-campanhas.sql` | `crc_campaigns` e `crc_campaign_targets` — as campanhas. |
| `supabase/07-crc-convenio.sql` | A coluna `convenio` em `crc_patients`, para o filtro de campanha. |
| `supabase/08-crc-agendamento.sql` | `crc_dentists` e `crc_scheduling_offers` — **necessário para o CRC marcar consulta**. Sem a primeira não há por quem perguntar horário livre; sem a segunda o sistema não lembra o que ofereceu. |

Rodar de novo não apaga nada. É o único passo manual da instalação, e ele existe
porque a API REST do Supabase não executa DDL.

**Como saber que deu certo:** rode no SQL Editor

```sql
select count(*) from information_schema.tables
where table_schema = 'public' and table_name like 'crc_%';
```

Tem que responder **41** — 36 do 02, duas do 03, uma do 05 e duas do 06. Se
responder menos, algum arquivo não terminou: role a saída do editor procurando
o erro.

### A.2 Cadastrar as variáveis mínimas

Vercel → o projeto → Settings → Environment Variables, ambiente **Production**.

**As duas do Supabase já estão lá** — e isso não é suposição: se faltassem, o
health check responderia `banco: "nao_configurado"`. Ele responde
`"indisponivel"`, que significa "as credenciais funcionam e a consulta falhou"
— ou seja, o schema da A.1.

Faltam **quatro**:

| Variável | Valor |
|---|---|
| `CRC_SESSION_SECRET` | 32+ caracteres aleatórios (comando abaixo) |
| `CRC_ADMIN_EMAIL` | o e-mail do primeiro administrador — o seu |
| `CRC_ADMIN_SENHA` | mínimo 10 caracteres |
| `CRON_SECRET` | 32+ caracteres aleatórios (mesmo comando) |

Gere os dois segredos assim, uma vez para cada:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

> **Sobre o `CRON_SECRET`:** cadastre-o você. A Vercel não inventa o valor — ela
> lê a variável e passa a mandar `Authorization: Bearer <CRON_SECRET>` nas
> chamadas de cron. Se o projeto já tiver uma cadastrada, use a que está lá em
> vez de criar outra: trocar o valor quebraria o cron do portal de RH, que usa o
> mesmo segredo. **Sem ela, `/api/crc/motor` responde 503 e o CRC nunca faz
> nada sozinho** — falhar fechada é o único comportamento aceitável numa rota que
> manda mensagem para paciente.

Se você **já sabe** o id da clínica no Dental Office, cadastre junto agora — a
instalação o usa e você economiza uma volta:

```
DENTAL_OFFICE_CLINIC_ID=
```

Se ainda não sabe, tudo bem: rode a instalação de novo depois de cadastrá-lo. A
rota é idempotente e atualiza o campo.

> **Nenhuma variável do CRC pode ganhar o prefixo `VITE_`.** Esse prefixo faz o
> Vite embutir o valor no JavaScript que o navegador baixa — qualquer visitante
> do site leria a chave.

**Variável nova só entra em vigor no próximo build.** Depois de cadastrar as
quatro, publique de novo:

```bash
npx vercel --prod --yes
```

### A.3 Rodar a instalação

```bash
curl -X POST https://www.jpclinicaodontologica.com.br/api/crc/instalar \
  -H "Authorization: Bearer SEU_CRON_SECRET"
```

Ela cria a organização, a clínica, as etapas do funil, os templates e as **oito
automações — todas em rascunho e modo simulação**. Nada é enviado a ninguém.

A resposta traz `proximosPassos` e um campo `avisos`. **Leia os avisos.** É lá
que aparece "nenhum usuário administrador foi criado" se `CRC_ADMIN_EMAIL` ou
`CRC_ADMIN_SENHA` faltaram.

### A.4 Conferir a saúde

```bash
curl https://www.jpclinicaodontologica.com.br/api/crc/saude
```

`{"status":"ok","app":"ok","banco":"ok"}` é o que você quer ver.

`banco: "nao_configurado"` → falta `SUPABASE_URL` ou `SUPABASE_SERVICE_ROLE`.
`banco: "indisponivel"` → as variáveis existem mas a consulta falhou; quase
sempre é o schema não aplicado (Parte A.1) ou a service_role errada.

A rota é pública e **não conta nada além disso** de propósito: um health check
aberto que descreve a infraestrutura é reconhecimento de graça para quem
estiver sondando.

### A.5 Entrar

`https://www.jpclinicaodontologica.com.br/crc`, com o e-mail e a senha do passo A.2.

Você vai ver o sistema inteiro **vazio**. Isso é o esperado: sem as credenciais
da Parte C não existe paciente para sincronizar.

---

## Parte B — Dar acesso à equipe

`/crc` → **Equipe** → **Cadastrar pessoa**. Aba visível só para quem tem o papel
de administração.

Você escolhe nome, e-mail, senha e papel. **Não há e-mail de convite** — não há
remetente configurado, e um convite que não chega é pior do que não existir:
entregue a senha pessoalmente e peça para a pessoa trocá-la com você depois.

**Por que dar um login por pessoa, e não um da clínica:** o item 74 exige saber
QUEM alterou o quê. Com um login compartilhado, cada tarefa concluída, cada
mensagem enviada e cada oportunidade movida fica assinada por "alguém" — e o
histórico, que é metade do valor do sistema, para de responder a única pergunta
que importa quando algo dá errado.

### Os seis papéis

| Papel | O que alcança |
|---|---|
| **Administração** | Tudo, incluindo cadastrar e desativar gente. |
| **Gestão** | A operação inteira, os números e as automações. Não mexe em usuários. |
| **CRC** | A fila, as conversas e as oportunidades. Vê valor de orçamento. |
| **Recepção** | A fila e as conversas do dia. Não vê valor de orçamento. |
| **Dentista** | Pacientes e tarefas clínicas. Não vê a operação comercial. |
| **Marketing** | Campanhas, funil e números. Não abre conversa de paciente. |

A tela mostra a explicação de cada papel embaixo do campo, porque a pergunta
real de quem cadastra é "esta pessoa vai poder ver orçamento?".

### Duas coisas que a tela recusa, e por quê

**Você não desativa a própria conta**, e **o último administrador ativo não pode
ser rebaixado nem desativado**. As duas fecham a porta com a chave do lado de
dentro: não sobraria ninguém para reabrir. A recusa é do servidor, e não da
tela — esconder o botão não impede uma requisição direta.

### Tirar acesso vs. trocar senha

**Tirar acesso** vale na requisição seguinte: o cookie guarda só o id, e o
usuário é relido do banco a cada chamada. Mudar o papel funciona igual — um
rebaixamento não espera o próximo login.

**Trocar a senha NÃO derruba quem já está dentro**, porque o cookie não depende
do hash. A troca serve para quem PERDEU o acesso. Para cortar o acesso de
alguém que saiu da clínica, o botão certo é **Tirar acesso**.

Desativar não apaga: o histórico da pessoa continua assinado com o nome dela.
Apagar o usuário deixaria meses de tarefas e mensagens órfãs.

---

## Parte C — As credenciais de terceiros

Nenhuma delas depende de programação nossa. Enquanto não chegam, a tela de
Integrações mostra "não configurada" e **diz o nome exato da variável que
falta** — em vez de fingir que está funcionando.

### C.1 Dental Office

**A API existe, é pública e está documentada.** Isto foi confirmado lendo a
especificação OpenAPI 3.0.3 deles, e não um blog:

- Documentação: <https://apidocs.dentaloffice.com.br/>
- Especificação: <https://apidocs.dentaloffice.com.br/openapi.yml>
- Suporte de integração: **api@dentaloffice.com.br**

#### O que pedir a eles

> **O acesso à API está disponível apenas para clientes do plano Avançado ou
> Completo.** É a primeira coisa a confirmar — sem o plano, nada do que vem
> abaixo acontece.

Aprovado o acesso, eles enviam **por e-mail** três dados:

| Variável | O que é |
|---|---|
| `DENTAL_OFFICE_BASE_URL` | a URL exclusiva do cliente. Vem **já terminada em `/v1`** |
| `DENTAL_OFFICE_CLIENT_ID` | o identificador |
| `DENTAL_OFFICE_SECRET` | a chave secreta |

E falta uma quarta, que **não** vem no e-mail:

| `DENTAL_OFFICE_CLINIC_ID` | o id numérico da unidade |

**Por que ela é obrigatória:** a API **não tem endpoint de listagem de
clínicas**. O `clinic_id` é parâmetro de caminho na agenda e nas cadeiras, e
precisa ser configurado. Ele aparece em qualquer agendamento devolvido por
`GET /clinics/{clinic_id}/schedules` — peça ao suporte deles, ou leia de um
agendamento existente.

#### Como o CRC autentica

`POST /auth/tokens` com `{client_id, secret}` devolve um Bearer válido por
**24 horas**. O CRC guarda esse token em memória do processo, renova sozinho e
**nunca o grava no banco** — token em tabela é alvo persistente para um ganho
de milissegundos.

#### O que o CRC usa da API

| Operação | Para quê |
|---|---|
| `GET /customers` | sincronizar pacientes |
| `GET /dentists` | sincronizar dentistas — **na raiz**, não sob a clínica |
| `GET /clinics/{id}/schedules` | a agenda, filtrando por `start` e `end` |
| `GET /clinics/{id}/schedules/available_hours` | horários livres |
| `POST /clinics/{id}/schedules` | criar consulta |
| `PATCH /clinics/{id}/schedules/{id}` | remarcar e cancelar |
| `GET /status` | o teste de conexão da tela de Integrações |

#### Três limites que mudam a operação, e não são detalhe

**1. Não existe sincronização incremental de pacientes.**
`GET /customers` aceita `q`, `page`, `clinic_id`, `active` e filtros de
exclusão — e nada de "atualizado desde". Toda varredura de pacientes é
completa.

**2. O teto é de 5.000 requisições — e o PERÍODO NÃO É DOCUMENTADO.**

A especificação diz literalmente "por período" e nunca define qual. Não existe
`RateLimit-Reset` publicado: só `RateLimit-Limit` e `RateLimit-Remaining`. E a
diferença decide a arquitetura:

| Se a janela for | Precisamos de | Situação |
|---|---|---|
| por hora | ~129 | folga enorme |
| **por dia** | ~3.100 | **cabe, com 38% de sobra** |
| por mês | ~93.000 | impossível |

*(base: motor a cada 1 minuto = 1.440 voltas/dia, 2 requisições por volta, mais
200 de varredura completa de pacientes)*

**O sistema mede isso sozinho.** O adapter lê `RateLimit-Remaining` em toda
resposta e registra no diário quando o número SOBE — o instante da virada é a
janela, e o log traz `minutosDesdeAUltimaLeitura`. Também avisa quando o
consumo passa de 80%, o que dá tempo de reagir antes do 429.

Então, no primeiro dia de integração, procure no diário:

```
A cota da API do Dental Office virou — a janela recomeçou.
```

**Confirme com eles mesmo assim** (`api@dentaloffice.com.br`): medir dá a
resposta prática, mas só eles dão a garantia.

Enquanto a janela for desconhecida, a estratégia segura é a mesma:
**pacientes uma vez ao dia, agenda com frequência**. A agenda pode ser
frequente porque ela, sim, filtra por `start`/`end` — cada volta do motor lê
só a janela que interessa.

**3. Não há webhooks.**
O Dental Office não avisa quando algo muda. É por isso que o CRC é construído
sobre um motor que varre, e não sobre eventos empurrados. Não foi preguiça de
arquitetura: é o que a API permite.

#### O que a API NÃO expõe

O Dental Office como produto tem financeiro, odontograma, anamnese, pagamentos
e um CRM próprio. **Nada disso está na API pública v1.0.** Existir no produto
não é existir no contrato.

Consequência prática para o CRC: **o módulo de orçamento parado não pode ser
automatizado** — ele continua dependendo de importação por planilha, e é isso
que a tela de Importar faz hoje.

#### Duas armadilhas conferidas na especificação

**A URL base já vem com `/v1`.** Concatenar `/v1/...` no código produz
`/v1/v1/customers` e 404 em toda chamada. O adapter tolera as duas grafias, mas
o valor certo da variável é o que eles enviarem, sem mexer.

**O verbo de atualização varia por recurso**, e não é engano deles:

| `PUT` | `PATCH` |
|---|---|
| cadeiras, disciplinas, motivos, situações | pacientes, dentistas, usuários, imagens, documentos, **agenda** |

O CRC só escreve em agenda, então usa `PATCH`. Padronizar o verbo "para ficar
igual" apagaria os campos que o CRC não conhece — cadeira, motivo, observação
da recepção.

#### Uma decisão de leitura que evita erro caro

A situação do agendamento é lida pelo **rótulo** (`schedule_situation.label`),
e não pelo id numérico. A API permite cada clínica **criar** situações
(`POST /schedule_situations`), então o id não é estável entre clínicas — o "4"
de uma pode ser "Faltou" e o de outra, "Atendido". Os rótulos, esses são fixos:

| Rótulo do Dental Office | Status no CRC |
|---|---|
| `to_confirm` | TO_CONFIRM |
| `confirmed` | CONFIRMED |
| `client_arrived`, `in_service` | IN_PROGRESS |
| `fulfilled` | COMPLETED |
| `absence` | MISSED |
| `cancelled` | CANCELLED |

#### Como saber que funcionou

Na tela de **Integrações**, "Testar conexão" chama `GET /status`. Depois,
**Sincronizar agora** deve trazer pacientes, dentistas e agenda — nesta ordem,
porque o agendamento precisa do paciente para ligar `patient_id`, e a oferta de
horário precisa do dentista para saber a quem perguntar.

---

### C.2 WhatsApp

Escolha um provedor. Os dois adapters estão prontos atrás da mesma porta;
trocar depois é mudar uma linha.

```
WHATSAPP_PROVEDOR=twilio    # ou meta
```

| | Twilio | Meta Cloud API |
|---|---|---|
| Começa a enviar | Hoje, no sandbox | Depois da verificação do Business Manager (semanas) |
| Exige BM verificado | Não, para testar | Sim |
| Custo | Preço da Meta + taxa da Twilio | Só o preço da Meta |
| Suporte | Humano | Documentação |

**A recomendação é começar pela Twilio** e migrar para a Meta se e quando o
volume justificar. Sair de um mês parado esperando verificação para começar a
recuperar faltante não vale a economia por mensagem.

#### Twilio

```
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_WHATSAPP_FROM=      # no sandbox, +1 415 523 8886
WHATSAPP_WEBHOOK_URL=https://www.jpclinicaodontologica.com.br/api/crc/whatsapp
```

No console da Twilio, em Messaging, aponte o webhook de mensagem recebida para
`https://www.jpclinicaodontologica.com.br/api/crc/whatsapp` (método POST).

> **`WHATSAPP_WEBHOOK_URL` não é opcional, e é a causa nº 1 de webhook
> recusado.** A Twilio assina a URL, não só o corpo. Atrás de um proxy — e a
> Vercel é um — a URL pode chegar ao código como `http` mesmo a chamada tendo
> sido `https`, e aí **todo** webhook é recusado sem pista melhor. Esta variável
> fixa o valor. Ela precisa bater **caractere por caractere** com o que você
> cadastrou no console.

#### Meta Cloud API

```
WHATSAPP_TOKEN=
WHATSAPP_PHONE_ID=
WHATSAPP_APP_SECRET=
WHATSAPP_VERIFY_TOKEN=      # você inventa e repete no painel da Meta
WHATSAPP_API_VERSAO=v21.0
```

Sem `WHATSAPP_APP_SECRET` nenhum webhook é aceito, e isso é proposital: webhook
anônimo permitiria qualquer pessoa inventar "o paciente quer cancelar" — e a
automação obedeceria.

**Verificação (qualquer provedor):**

1. Integrações → o cartão do WhatsApp deve dizer "Twilio configurado" ou "Meta
   Cloud API configurada".
2. Mande uma mensagem **do seu celular** para o número da clínica.
3. Ela tem que aparecer em **Conversas** em segundos. Se não aparecer, veja o
   log da função na Vercel: "assinatura inválida" é a `WHATSAPP_WEBHOOK_URL` ou
   o `APP_SECRET`; "não configurado" é variável faltando.

#### Aprovação de templates

Fora da janela de 24 horas desde a última mensagem do paciente, o WhatsApp só
aceita **template aprovado**. Vale para os dois provedores — a Twilio
intermedia, mas quem aprova é a Meta.

Os textos que precisam ser submetidos estão em
`src/lib/crc/automacao/templates.ts`. São quatorze:

```
falta_primeiro_contato   falta_segundo_contato    cancelamento_reagendar
confirmacao_consulta     recall_seis_meses        reativacao_inativo
abandono_tratamento      aniversario              orcamento_parado
cobranca_lembrete        cobranca_recente         cobranca_atrasada
cobranca_ja_pago         lead_primeiro_contato
```

Submeta na categoria **Utility** (não Marketing): a categoria muda o preço e a
tolerância da revisão, e todos estes são utilitários — confirmação, lembrete,
retorno.

**Enquanto os templates não estiverem aprovados**, a automação ainda funciona
para quem escreveu para a clínica nas últimas 24 horas. Para os outros, o envio
falha no provedor e a jornada registra a falha — nada se perde em silêncio.

### C.3 IA (opcional)

Reaproveita a `OPENAI_API_KEY` que o portal de RH já usa. Sem ela o CRC funciona
inteiro — só não pré-lê as conversas, e cada uma vira tarefa humana. A IA é
acelerador, nunca ponto único de falha.

```
OPENAI_MODEL_CRC=gpt-5.6-luna
CRC_USD_BRL=5.5
```

---

## Parte D — Ajustar a clínica

**Isto se faz na tela de Configurações**, dentro do próprio CRC — não precisa
mais de SQL nem da gente. Todo ajuste fica auditado, com quem mudou e quando.

O SQL abaixo continua documentado porque é o caminho de emergência: serve
quando ninguém consegue entrar na tela, e serve para conferir o que está
gravado.

Se o padrão serve, pule esta parte. O padrão é:

| Configuração | Padrão |
|---|---|
| Horário | seg–sex 08:00–19:00, sáb 08:00–13:00, dom fechado |
| Fuso | America/Sao_Paulo |
| Contatos proativos por paciente por dia | 1 |
| Intervalo mínimo entre contatos | 24h |
| Tentativas por jornada | 3 |
| Retorno de rotina | 180 dias |
| Paciente inativo | 240 dias |
| Espera antes de falar com quem faltou | 2h |
| Antecedência da confirmação | 24h |

### Mudar o horário comercial

O índice do vetor `dias` é o dia da semana começando no **domingo**. `null`
fecha o dia. O horário malformado é recusado **inteiro** e o padrão continua
valendo — aceitar pela metade produziria uma clínica com três dias configurados
e quatro fechados sem ninguém ter pedido, e o sintoma seria "a automação parou
de mandar mensagem às quintas".

```sql
insert into public.crc_settings (organization_id, chave, valor)
select id, 'horarioComercial', '{
  "dias": [
    null,
    {"inicio":"09:00","fim":"18:00"},
    {"inicio":"09:00","fim":"18:00"},
    {"inicio":"09:00","fim":"18:00"},
    {"inicio":"09:00","fim":"18:00"},
    {"inicio":"09:00","fim":"18:00"},
    {"inicio":"09:00","fim":"12:00"}
  ],
  "feriados": ["2026-12-25", "2027-01-01"],
  "fuso": "America/Sao_Paulo"
}'::jsonb
from public.crc_organizations where slug = 'jp'
on conflict (organization_id, chave) do update set valor = excluded.valor;
```

Feriado é `AAAA-MM-DD` na data local da clínica. Nenhuma mensagem proativa sai
num dia listado.

### Mudar um número qualquer

```sql
insert into public.crc_settings (organization_id, chave, valor)
select id, 'cooldownHoras', '48'::jsonb
from public.crc_organizations where slug = 'jp'
on conflict (organization_id, chave) do update set valor = excluded.valor;
```

Chaves aceitas: `recallDias`, `recallLongoDias`, `inatividadeDias`,
`orcamentoParadoDias`, `faltaEsperaHoras`, `confirmacaoAntecedenciaHoras`,
`contatosPorDia`, `cooldownHoras`, `tentativasPorJornada`, `envioPorHora`,
`iaConfiancaAutomatica` e `iaConfiancaSugestao` (estas duas de 0 a 1).

Chave desconhecida é **ignorada**, e não é erro: ela pode ser de uma versão
futura. Mas confira a grafia — errar `cooldownHoras` para `cooldownhoras` faz o
ajuste não ter efeito nenhum, em silêncio.

A configuração é cacheada por alguns minutos no servidor. Depois do SQL,
espere a próxima volta do motor ou force um redeploy se precisar do efeito
imediato.

---

## Parte E — O que ainda depende de código nosso

**As três lacunas desta seção foram fechadas em 09/09/2026.** O que resta aqui
é o que sobrou depois delas — e nada impede a operação de começar.

### Fechado: tela de configuração da clínica

Existe em **Configurações**. Horário semanal dia a dia (com "fechado" como
estado próprio, e não como campo vazio), prazos das automações, limites de
contato e os limiares de confiança da IA. Cada campo diz o que muda no mundo se
o número mudar, e o intervalo permitido é validado nos dois lados — a tela
mostra, o servidor recusa.

Trocar o horário de atendimento deixou de exigir SQL. **Incluir feriado ainda
exige**: a lista existe em `horarioComercial.feriados` e é respeitada pelo
motor, mas não tem campo na tela. Esforço pequeno, e o impacto é um dia por
ano.

### Fechado: as feature flags agora fazem coisa

As cinco aparecem em **Configurações → Recursos**, e três delas gatilham
comportamento de verdade:

| Flag | O que muda quando liga |
|---|---|
| `auto_scheduling` | O CRC passa a oferecer horários reais quando o paciente pede para marcar. |
| `dental_office_writeback` | A reserva é gravada no Dental Office. Desligada, o aceite do paciente vira tarefa para a recepção digitar. |
| `ai_autopilot` | A leitura automática pode agir, e não só classificar e sugerir. |

`ai_autopilot` é a linha que separa **a IA ler** de **a IA falar**. Desligada,
a conversa continua sendo classificada — resumo, temperatura e escalonamento
seguem alimentando a Inbox — e nenhuma mensagem sai, nem consulta é gravada,
nem quando já existe oferta aberta esperando resposta.

`automatic_whatsapp` e `budget_integration` **não gatilham nada**, e por isso
aparecem na tela **desabilitadas**, dizendo isso. Esconder faria alguém
encontrá-las depois no banco sem saber o que são; deixá-las clicáveis daria um
interruptor que não faz nada — pior, porque quem o liga acredita ter ligado
alguma coisa. Quem controla o envio hoje é o modo da automação e o interruptor
de emergência.

Só admin e gestor mexem em flag (`gerenciar_autopilot`). Toda uma nasce
desligada.

### Fechado: agendar pelo CRC

O fluxo inteiro existe e tem teste ponta a ponta contra o sandbox do Dental
Office:

1. O paciente diz que quer marcar; a IA classifica a intenção.
2. O CRC busca horários **reais** na agenda, filtra pelo horário comercial e
   oferece no máximo três — um por dia.
3. O paciente responde ("10:40 tá ótimo", "a segunda", "quinta de manhã").
4. Antes de gravar, o horário é **revalidado**. Se a recepção ocupou nesse
   meio-tempo, o sistema não marca em cima: encerra a oferta e faz outra.
5. A consulta é criada no Dental Office e espelhada aqui.

**Três travas antes de qualquer escrita**, todas desligadas por padrão:
`dental_office_writeback`, `auto_scheduling` e o kill switch
`kill_escritas_do`. Qualquer uma delas barrando, o desfecho é uma tarefa
humana — nunca silêncio.

**O que ainda falta para isso rodar em produção:** a credencial de **escrita**
do Dental Office, que é diferente da de leitura, e rodar o
`08-crc-agendamento.sql`. Sem eles o sistema continua encaminhando para um
humano remarcar, que é o comportamento de hoje.

### O que continua faltando

*Teste de navegador (Playwright), segment engine componível do item 146, estado
na URL do item 148, multisseleção de tipo no funil, e o campo de feriados
citado acima. Todos detalhados no FINAL-ACCEPTANCE.*

---

## Parte F — O motor precisa bater mais de uma vez por dia

> **A regra que governa o sistema inteiro:**
> **nada automático acontece entre uma batida do motor e a seguinte.**
> A frequência do motor **é** o tempo de resposta do CRC. Não existe outro
> gatilho — nem fila, nem worker, nem processamento no recebimento.

Vale a pena entender por quê, porque é contraintuitivo: quando o paciente
manda uma mensagem, o webhook do WhatsApp **grava** a mensagem e emite um
evento com status `PENDENTE`. Ele não responde, não chama a IA, não faz nada
além de guardar. Quem lê os eventos pendentes é `processarEventos`, e ela é
chamada **num lugar só** — a rota `/api/crc/motor`.

### O que isso significa na prática

| Acontece | Quando o paciente percebe |
|---|---|
| Mensagem chega | **Na hora.** Ela aparece na Inbox imediatamente, e qualquer atendente responde 24h por dia. |
| Leitura pela IA, resumo, temperatura | Na batida seguinte do motor |
| Resposta automática | Na batida seguinte do motor |
| Oferta de horário e agendamento | Na batida seguinte do motor |
| Mensagem de jornada (falta, retorno, cobrança) | Na batida seguinte do motor |

**Com o cron diário de hoje, "a batida seguinte" pode ser daqui a 23 horas.**
Uma pessoa que escreve às 14h só recebe resposta automática às 9h do dia
seguinte — e todas as mensagens do dia saem empilhadas no mesmo minuto.

**A conta da Vercel é Hobby, e o plano Hobby só aceita cron diário.** O deploy
foi recusado com `*/10 * * * *` e `vercel.json` foi ajustado para `0 9 * * *`
(6h em São Paulo) — senão nada subia.

O que isso custa: as varreduras diárias (retorno, confirmação, aniversário,
orçamento, cobrança) continuam certas, porque elas são diárias por natureza. Mas
**o fluxo do faltante deixa de funcionar como foi desenhado**: a falta vira
oportunidade, a jornada espera duas horas — e aí espera até a próxima batida do
motor, no dia seguinte. Uma mensagem que deveria sair às 11h sai às 6h do outro
dia, quando o paciente já remarcou em outro lugar.

### O horário comercial NÃO atrapalha a resposta

Uma dúvida que aparece sempre: "se alguém escrever às 23h, o sistema vai
esperar até as 8h para responder?" **Não.**

Responder a quem acabou de escrever é envio `proativo: false`, e envio não
proativo **não passa pela política de horário**. A regra existe para não
incomodar quem está em silêncio — não para calar quem perguntou. Com o motor
batendo de minuto em minuto, uma mensagem da meia-noite é respondida à
meia-noite e um minuto.

Quem respeita o horário comercial são as mensagens **proativas** (falta,
retorno, aniversário, cobrança). E mesmo elas são **adiadas, nunca canceladas**:
a jornada é reagendada para a abertura seguinte e o paciente recebe às 8h.

**Duas saídas, e as duas funcionam:**

| Saída | Custo | O que fazer |
|---|---|---|
| **Pinger externo** (recomendado) | Grátis | Um serviço de cron gratuito (cron-job.org, EasyCron, ou um workflow agendado do GitHub Actions) chamando a URL abaixo a cada 10 minutos. |
| **Vercel Pro** | Mensalidade | Devolver `*/10 * * * *` ao `vercel.json` e publicar. |

A chamada do pinger externo é esta — GET, com o header:

```
GET https://www.jpclinicaodontologica.com.br/api/crc/motor
Authorization: Bearer SEU_CRON_SECRET
```

O `CRON_SECRET` é o mesmo do passo A.2. A rota falha fechada: sem o header, ela
responde 401 e não faz nada — expô-la não abre porta nenhuma, mas o segredo é
segredo.

#### O caminho mais curto: GitHub Actions

O repositório já está no GitHub, então isto não exige criar conta em lugar
nenhum. Em **Settings → Secrets and variables → Actions**, crie o secret
`CRON_SECRET` com o mesmo valor da Vercel. Depois, o arquivo:

`.github/workflows/motor-crc.yml`

```yaml
name: Motor do CRC
on:
  schedule:
    # A cada 10 minutos. O agendador do GitHub costuma atrasar alguns minutos
    # em horário de pico — e tudo bem: o motor é idempotente e o que ele não
    # pegou nesta volta ele pega na próxima.
    - cron: "*/10 * * * *"
  workflow_dispatch: {}

jobs:
  bater:
    runs-on: ubuntu-latest
    steps:
      - name: Chamar o motor
        run: |
          curl -sS -f -X GET             "https://www.jpclinicaodontologica.com.br/api/crc/motor"             -H "Authorization: Bearer ${{ secrets.CRON_SECRET }}"
```

`workflow_dispatch` deixa você disparar uma volta à mão pela aba Actions, que é
útil no dia da ativação. O `-f` no curl faz o job falhar quando a rota devolve
erro — sem ele, um 401 por segredo errado passaria despercebido por semanas.

Se preferir precisão no horário, o **cron-job.org** é gratuito e dispara mais
pontualmente que o GitHub. Os dois resolvem.

**O cron diário de `vercel.json` não atrapalha o pinger**: os dois chamam a
mesma rota, e a reserva atômica (`FOR UPDATE SKIP LOCKED`) garante que duas
chamadas sobrepostas nunca peguem a mesma linha. Deixe os dois.

### Quer resposta em 1 minuto?

| Caminho | Custo | Frequência possível |
|---|---|---|
| **cron-job.org** | Grátis | Até **1 minuto** |
| **GitHub Actions** | Grátis | Mínimo **5 minutos** (limite do agendador do GitHub, e ele ainda atrasa em horário de pico) |
| **Vercel Pro** | US$ 20/mês | 1 minuto, trocando `0 9 * * *` por `* * * * *` |

Para conversa em tempo real, **1 minuto é o alvo** — é a diferença entre o
paciente sentir que falou com a clínica e sentir que caiu num robô lento.
O caminho gratuito (cron-job.org) chega lá; o Pro é conveniência, não
necessidade.

> **Não troque o cron do `vercel.json` antes de assinar o Pro.** Frequência
> maior que diária no Hobby não é um aviso: **o deploy inteiro é recusado**, e o
> site sai do ar até alguém reverter.

### Dois riscos que só aparecem quando a base real entrar

Nenhum dos dois se manifesta hoje, com o banco vazio. Os dois aparecem na
primeira sincronização de verdade, e é melhor conhecê-los antes.

**1. O tempo máximo da função não está configurado.**
`.vercel/output/functions/__server.func/.vc-config.json` não traz
`maxDuration`, então vale o padrão do plano — poucos segundos. E o motor faz
tudo numa invocação só: sincroniza pacientes, dentistas e agenda, processa até
40 eventos, roda as varreduras, avança as jornadas e despacha as campanhas.

**2. O cursor de sincronização só avança no fim.**
Em `sincronizacao.ts`, o cursor (`crc_sync_state`) é gravado apenas quando o
recurso termina **com sucesso**. Se a função for morta por timeout no meio, o
cursor não avança e a execução seguinte **recomeça da página 1**.

Os dois juntos têm uma consequência concreta: numa base grande, a primeira
sincronização pode nunca concluir — ela reprocessa as mesmas páginas para
sempre, gravando pacientes (os `upsert` acontecem) mas sem nunca marcar o
ponto de parada.

**Como perceber:** na tela de Integrações, o histórico de sincronização mostra
execuções repetidas do recurso `patients` com o mesmo número de processados e
sem nunca concluir. Ou, no banco:

```sql
select recurso, status, processados, ultimo_erro, terminado_em
from crc_sync_jobs
order by id desc
limit 10;
```

Se aparecer `A sincronização parou no teto de 200 páginas`, é este caso.

**Como resolver, se acontecer:** as duas correções são pequenas — fixar
`maxDuration` na função e fatiar o sync em pedaços que caibam nele. Elas não
foram feitas ainda porque só fazem sentido depois de conhecer o tamanho real da
base do Dental Office: fatiar em pedaços pequenos demais desperdiça execução, e
grandes demais não resolve.

---

## Parte F.1 — O que o CRC escreve de volta no Dental Office

Uma expectativa comum, e que **não** corresponde ao que existe: o CRC não
espelha a conversa nem as anotações no Dental Office.

**O que ele escreve — as duas únicas escritas que existem:**

| Ação | Método | Quando |
|---|---|---|
| Criar consulta | `POST` | Quando o paciente aceita um horário oferecido |
| Mudar status / cancelar | `PUT` | Quando a consulta é cancelada pelo CRC |

**O que ele NÃO escreve:**

- O histórico de WhatsApp. As conversas vivem no CRC, e só nele.
- Anotação, observação ou resumo da IA no prontuário.
- Cadastro do paciente. O Dental Office continua sendo a fonte da verdade dos
  dados cadastrais; o CRC lê e nunca corrige.
- Orçamento, pagamento ou qualquer dado financeiro.

Isso é desenho, e não pendência. O Dental Office é o sistema clínico da
clínica; escrever nele mais do que o necessário transforma um erro do CRC num
erro no prontuário. A única escrita que compensa esse risco é a que a operação
não consegue fazer sozinha em tempo real: ocupar um horário.

E mesmo ela passa por **três travas desligadas por padrão** — a flag
`dental_office_writeback`, a flag `auto_scheduling` e o kill switch
`kill_escritas_do`. Qualquer uma delas barrando, o aceite do paciente vira
**tarefa para a recepção digitar**, nunca silêncio.

---

## Parte G — A ordem de ativação

Nada aqui é opinião: cada passo depende do anterior ter dado certo.

### Dia 1 — tirar o CRC do "degradado"

O código já está publicado; falta o banco. Parte A inteira (os SQL, as
quatro variáveis que faltam, a instalação), mais a Parte F, que é rápida e evita
uma surpresa desagradável lá na frente.

Ao final, você entra em `/crc` e vê as telas vazias — o que é o esperado, porque
ainda não há paciente nenhum.

**Verificação:** `/api/crc/saude` responde `{"status":"ok"}` e o login funciona.

Aproveite e faça a **Parte B** no mesmo dia: cadastre a equipe enquanto o
sistema está vazio e ninguém depende dele. Cada pessoa com o próprio login desde
o primeiro dia é o que faz o histórico valer alguma coisa depois.

### Dia 2 — a base real entra

Assim que as credenciais do Dental Office chegarem: Parte C.1, e
**Sincronizar agora**.

Depois disso, confira à mão, na tela de Pacientes:
- os nomes vieram completos e sem caractere estranho;
- os telefones estão em formato brasileiro e com DDD (quem não tem DDD é
  recusado de propósito — o sistema não adivinha);
- quem tem consulta futura aparece com ela.

**As automações continuam em simulação.** Não mude ainda.

### Dias 3 a 7 — o WhatsApp conectado, e a simulação observada

Parte C.2, incluindo a submissão dos templates (a aprovação leva dias — comece
por ela).

Com o WhatsApp conectado e as automações **ainda em simulação**, o motor roda a
cada dez minutos e registra o que teria enviado.

**Leia esse registro:** `/crc` → Automações → **Ver o que ela fez** → clique numa
jornada. O passo a passo abre com o TEXTO INTEGRAL da mensagem que teria saído,
com as variáveis já substituídas.

O que você está procurando: nome errado, saudação estranha, mensagem indo para
quem não devia, horário fora do expediente. É mais barato descobrir aqui.

### Semana 2 — a primeira automação de verdade

Só a **Recuperação de faltas**, e só ela. É a de menor volume e maior conversão:
poucos pacientes por dia, cada um com motivo claro para responder.

Antes de virar a chave, o checklist do item 258:

- [ ] Sincronização rodando sem falha há pelo menos 3 dias
- [ ] Telefones conferidos por amostragem em Pacientes
- [ ] Textos das mensagens revisados em Automações → Ver o que ela fez
- [ ] Horário comercial conferido (Parte D)
- [ ] Interruptores testados: acione e libere em Integrações
- [ ] Uma mensagem real recebida apareceu em Conversas
- [ ] Alguém de plantão no primeiro dia

Caminho da automação: **Simulação → Só recomenda → Executa**, com pelo menos
alguns dias em cada estágio.

### Semanas 3 em diante — uma automação por vez

```
2. Confirmação de consulta   (volume previsível, resposta imediata)
3. Retorno de rotina         (volume alto — só com as duas acima calibradas)
4. Reagendamento de cancelados
5. Reativação de inativos
6. Aniversário
7. Orçamento parado          (depois de importar a planilha, aba Importar)
8. Cobrança de parcelas      (por último — leia abaixo)
```

**Uma por semana, no máximo.** Duas automações novas ao mesmo tempo tornam
impossível saber qual delas causou o que você está vendo.

### A cobrança fica por último, e não é detalhe

É a única automação que fala de dinheiro que o paciente deve. O **art. 42 do
Código de Defesa do Consumidor** proíbe expor a ridículo e constranger na
cobrança de dívida.

O código já impõe o limite de três contatos, o intervalo de 72 horas entre eles
e a recusa de texto com ameaça ou constrangimento — e uma parcela em negociação
sai da automação e vira assunto de humano. Mas a primeira semana dela merece
alguém lendo cada mensagem que sai.

---

## Parte H — Como saber que está funcionando

| O que | Onde olhar | O que é normal |
|---|---|---|
| O app está de pé | `GET /api/crc/saude` | `{"status":"ok"}`. Hoje responde `degradado` — ver "Onde estamos agora". |
| O motor está batendo | Vercel → Logs, filtrando `/api/crc/motor` | Uma execução a cada 10 min com o pinger da Parte F; **uma por dia sem ele**. Sempre 200, nunca 5xx. |
| A sincronização está viva | `/crc` → Integrações | "Última sincronização" recente, sem erro |
| As jornadas estão andando | `/crc` → Automações | "Em jornada" > 0 quando há faltantes |
| As mensagens estão saindo | `/crc` → Conversas | Mensagens de saída com status de entrega |
| A recuperação está acontecendo | `/crc` → Gestão | "Saídas por conversão" > 0 |

As varreduras diárias (retorno, confirmação, aniversário, orçamento, cobrança)
rodam só na volta das 9h UTC — ≈6h em São Paulo, para as jornadas nascerem antes
do expediente e esperarem a abertura para falar com alguém.

Para forçar uma varredura fora de hora, em teste:

```bash
curl "https://www.jpclinicaodontologica.com.br/api/crc/motor?varrer=1" \
  -H "Authorization: Bearer SEU_CRON_SECRET"
```

---

## Parte I — Como desligar em dez segundos

`/crc` → **Integrações** → Interruptores. São quatro, e o efeito é imediato — a
próxima volta do motor já respeita:

| Interruptor | Quando usar |
|---|---|
| **Pausar envios de WhatsApp** | Mensagem errada saindo. As jornadas continuam avançando e registram o que teriam enviado. |
| **Pausar todas as automações** | Algo sistêmico está errado e você não sabe o quê. Nenhuma jornada avança. |
| **Pausar escritas no Dental Office** | Suspeita de que estamos gravando coisa errada lá. |
| **Pausar ações automáticas da IA** | A IA está classificando mal. As conversas viram tarefa humana. |

Nenhum deles perde trabalho: jornada pausada retoma de onde parou quando você
liberar.

Se precisar parar **tudo, inclusive o cron**, remova a entrada
`/api/crc/motor` de `vercel.json` e faça deploy. Mas os interruptores são mais
rápidos e mais cirúrgicos — prefira-os.

---

## Anexo — todas as variáveis

| Variável | Obrigatória? | Sem ela |
|---|---|---|
| `SUPABASE_URL` | **Sim** | O CRC não abre |
| `SUPABASE_SERVICE_ROLE` | **Sim** | O CRC não abre |
| `CRC_SESSION_SECRET` | **Sim** ¹ | Login indisponível |
| `CRC_ADMIN_EMAIL` | **Sim** | Nenhum usuário é criado |
| `CRC_ADMIN_SENHA` | **Sim** | Nenhum usuário é criado (mín. 10 caracteres) |
| `CRON_SECRET` | **Sim** | O motor responde 503 e a instalação é bloqueada |
| `CRC_ADMIN_NOME` | Não | Vale "Administração" |
| `DENTAL_OFFICE_BASE_URL` | Para sincronizar | Integrações mostra "não configurada" |
| `DENTAL_OFFICE_CLIENT_ID` | Para sincronizar | idem |
| `DENTAL_OFFICE_SECRET` | Para sincronizar | idem |
| `DENTAL_OFFICE_CLINIC_ID` | Para a agenda | A sincronização de agenda não sabe qual unidade consultar |
| `WHATSAPP_PROVEDOR` | Não | Vale `twilio` |
| `TWILIO_ACCOUNT_SID` | Se Twilio | Nada é enviado nem recebido |
| `TWILIO_AUTH_TOKEN` | Se Twilio | idem |
| `TWILIO_WHATSAPP_FROM` | Se Twilio | idem |
| `WHATSAPP_WEBHOOK_URL` | **Se Twilio** | Todo webhook recusado por assinatura |
| `WHATSAPP_TOKEN` | Se Meta | Nada é enviado |
| `WHATSAPP_PHONE_ID` | Se Meta | idem |
| `WHATSAPP_APP_SECRET` | **Se Meta** | Nenhum webhook é aceito |
| `WHATSAPP_VERIFY_TOKEN` | Se Meta | O handshake de verificação falha |
| `WHATSAPP_API_VERSAO` | Não | Vale `v21.0` |
| `OPENAI_API_KEY` | Não | Conversas não são pré-lidas; viram tarefa humana |
| `OPENAI_MODEL_CRC` | Não | Vale `gpt-5.6-luna` |
| `CRC_USD_BRL` | Não | Vale 5.5 (só afeta o custo exibido) |
| `DENTAL_OFFICE_SANDBOX` | Não | **Ignorada em produção**, por trava de código |
| `WHATSAPP_SANDBOX` | Não | **Ignorada em produção**, por trava de código |
| `CRC_IA_SANDBOX` | Não | **Ignorada em produção**, por trava de código |

¹ Se ausente, o CRC cai na `RH_SESSION_SECRET`. Isso é conveniência de
instalação, não recomendação: com chaves separadas, trocar a do RH não desloga o
CRC, e vazar uma não compromete a outra.

**As três variáveis de sandbox são ignoradas em produção por decisão de
código, não por disciplina de apagá-las.** Um Dental Office de mentira em
produção seria pior do que nenhum, porque a operação acharia que os dados são
reais; um WhatsApp de mentira seria pior ainda, porque ela acharia que as
mensagens saíram.
