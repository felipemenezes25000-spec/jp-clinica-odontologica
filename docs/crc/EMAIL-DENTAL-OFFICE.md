# O e-mail para o Dental Office

**Para:** api@dentaloffice.com.br
**Assunto:** Habilitação da API v1.0 e credenciais de integração — JP Clínica Odontológica
**Anexo:** [`Perguntas-Dental-Office.pdf`](Perguntas-Dental-Office.pdf)

---

## O corpo do e-mail, para copiar

> Prezados,
>
> Sou **Jeferson**, responsável pela **JP Clínica Odontológica**, cliente do
> Dental Office.
>
> Contratamos o desenvolvimento de um sistema próprio de relacionamento com
> pacientes, que consome a API pública v1.0 de vocês. A implementação já está
> concluída e testada contra a especificação publicada em
> apidocs.dentaloffice.com.br — o que falta não é desenvolvimento, são as
> credenciais.
>
> **O pedido principal:** solicito a habilitação da API para a nossa conta e o
> envio da URL base, do `client_id`, do `secret` e do **`clinic_id` da nossa
> clínica**. Este último costuma ser esquecido, e sem ele toda a camada de agenda
> fica inoperante — não há endpoint que liste as clínicas da conta, então não há
> como descobri-lo do nosso lado.
>
> Gostaria de saber também se existe requisito de plano para liberar a API, e
> qual o prazo típico entre a solicitação e a entrega.
>
> **Em anexo**, um documento preparado pela nossa equipe técnica, com 17
> perguntas organizadas por prioridade. Ele parece longo, mas está separado de
> propósito: a **Parte 1 sozinha já nos destrava**, e as Partes 2 e 3 são
> confirmações de contrato que evitam que implementemos sobre suposição. Uma
> resposta numerada e curta já é suficiente.
>
> Fico à disposição, e posso colocar vocês em contato direto com a equipe técnica
> se for mais prático para o lado de vocês.
>
> Atenciosamente,
>
> Jeferson
> JP Clínica Odontológica

---

## Por que o anexo existe

Porque o código já apontava para ele. [`mapeadores.ts:93`](../../src/lib/crc/integracoes/dental-office/mapeadores.ts:93)
dizia, sobre as situações de paciente:

> …e é por isso que "qual endpoint lista as situações de paciente?" está na
> lista de perguntas ao Dental Office.

Essa lista **não existia**. O PDF é ela.

Nenhuma pergunta é genérica. Cada uma saiu de uma decisão que já está escrita no
adapter e que muda se a resposta for diferente do que supomos.

> [!IMPORTANT]
> Este projeto já pagou o preço de deduzir. O adapter nasceu falando com uma API
> imaginada (`/v1/clinics`, `PUT` para mudar status, `available_hours` com
> intervalo de datas) e **passou em 378 testes fazendo isso**, porque o sandbox
> implementava a interface que nós mesmos inventamos. Perguntar é mais barato.

## De onde saiu cada pergunta

Para quem for conferir — ou para quando a resposta chegar e alguém precisar
saber o que muda. A numeração é a do PDF.

| #   | Onde está no nosso código                                                                 | O que muda com a resposta                               |
| --- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| 3   | [`cliente.ts` — `anotarCota`](../../src/lib/crc/integracoes/dental-office/cliente.ts:200) | a frequência do motor de sincronização                  |
| 4   | `listarPacientes` e `listarAgendamentos` mandam `per_page` hoje                           | quantas requisições custa uma varredura completa        |
| 5   | [`listarPacientes`](../../src/lib/crc/integracoes/dental-office/cliente.ts:444)           | `atualizadosDesde` está na assinatura e não é enviado   |
| 6   | [`mapeadores.ts:93`](../../src/lib/crc/integracoes/dental-office/mapeadores.ts:93)        | hoje a situação desconhecida vira `DESCONHECIDO`        |
| 7   | [`mapeadores.ts:140`](../../src/lib/crc/integracoes/dental-office/mapeadores.ts:140)      | hoje mostramos o número do convênio quando falta o nome |
| 8   | [`status.ts`](../../src/lib/crc/dominio/status.ts) e `atualizarStatusAgendamento`         | ler por `label` é a decisão que depende disto           |
| 9   | [`criarAgendamento`](../../src/lib/crc/integracoes/dental-office/cliente.ts:577)          | escrever nos dois campos deixa de ser necessário        |
| 10  | [`horariosDisponiveis`](../../src/lib/crc/integracoes/dental-office/cliente.ts:546)       | confirma o desenho do agendamento automático            |

As perguntas **15, 16 e 17** não saem do código, e é por isso que quase não
foram feitas: custo, proteção de dado e política de mudança não aparecem em
nenhum `grep`.

São as três que só doem depois. Custo descoberto na fatura; cláusula de LGPD
descoberta quando alguém pergunta quem autorizou exportar dado de paciente; e
política de depreciação descoberta no dia em que a integração para sozinha,
porque a especificação que temos versionada é um retrato de **09/09/2026** e
ninguém nos avisa quando ele deixa de valer.

## Se precisar editar o PDF

O conteúdo dele não é gerado deste arquivo — foi escrito direto. Para mudar,
edite e regere; o texto-fonte está no histórico do commit que o criou.

---

## Quando a resposta chegar

Os quatro valores vão para variáveis de ambiente **no servidor** — nunca no
código, nunca com prefixo `VITE_`, nunca em log:

| Variável                  | O que é                                            |
| ------------------------- | -------------------------------------------------- |
| `DENTAL_OFFICE_BASE_URL`  | a URL exclusiva (com ou sem `/v1`; as duas servem) |
| `DENTAL_OFFICE_CLIENT_ID` | o `client_id`                                      |
| `DENTAL_OFFICE_SECRET`    | o `secret`                                         |
| `DENTAL_OFFICE_CLINIC_ID` | o id da unidade — **não é opcional**               |

Depois: **CRC → Integrações → Testar conexão**, que autentica e faz um
`GET /status` — não altera nada. Só então **Sincronizar agora**.

> [!IMPORTANT]
> Não me mande o `secret` por aqui, nem cole em nenhuma tela de conversa. Ele vai
> direto de você para a variável de ambiente na Vercel.

## O que este e-mail NÃO resolve

O Dental Office é **uma** das três frentes. Respondido tudo, o CRC passa a
_saber_ quem faltou, cancelou ou sumiu — e ainda não _fala_ com ninguém.

| Falta                           | Quem resolve                      | Destrava                        |
| ------------------------------- | --------------------------------- | ------------------------------- |
| WhatsApp — Twilio ou Meta Cloud | contratação sua, outro fornecedor | o CRC mandar mensagem           |
| Aprovação de template           | Meta (mesmo via Twilio)           | falar fora da janela de 24h     |
| CSV de orçamentos e parcelas    | você, no sistema da clínica       | Radar de Receita com valor real |

Conferido em 14/09/2026 com `npx vercel env ls production`: das 15 variáveis em
produção, **nenhuma** é `DENTAL_OFFICE_*` e **nenhuma** é `WHATSAPP_*`/`TWILIO_*`.
