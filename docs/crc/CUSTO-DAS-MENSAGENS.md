# Quanto o WhatsApp custa

O CRC não cobra por mensagem. A **Meta** cobra, por mensagem entregue, e o
preço depende da categoria. Este documento é a régua que o sistema usa —
`src/lib/crc/dominio/custo.ts`.

---

## As três categorias que a clínica usa

| Categoria     | Por mensagem  | O que é                                                            |
| ------------- | ------------- | ------------------------------------------------------------------ |
| **Utilidade** | **R$ 0,034**  | Algo já em andamento: consulta marcada, falta, parcela, orçamento  |
| **Marketing** | **R$ 0,3125** | Convite sem nada em andamento: reativação, recall, aniversário     |
| **Serviço**   | **R$ 0,034**  | Resposta a quem escreveu primeiro, dentro de 24h                   |

> **Marketing custa 9 vezes utilidade.** Essa única linha explica quase toda a
> fatura: uma campanha de reativação de 500 pessoas custa R$ 156, mais que todas
> as automações de rotina de um mês somadas.

Mensagem **recebida nunca custa**.

---

## A virada de 01/10/2026

Até **30/09/2026**, responder paciente dentro da janela de 24 horas é gratuito e
ilimitado. A partir de **01/10/2026** passa a ser cobrado como utilidade, com as
**primeiras 1.000 por número por mês** liberadas.

A data está no código (`INICIO_COBRANCA_SERVICO`) e não só aqui, porque a conta
muda sozinha quando ela chegar — uma estimativa que ignorasse a virada mostraria
"grátis" em outubro para quem já estaria pagando.

**Na prática, isso quase sempre continua custando zero.** 200 conversas no mês
com 6 respostas cada dão 1.200 mensagens: 200 cobradas, **R$ 6,80**. Ninguém
deve deixar de conversar com paciente por medo da conta.

---

## Um mês típico da clínica

| O quê                                        | Categoria | Quanto           |
| -------------------------------------------- | --------- | ---------------- |
| 550 confirmações, faltas, cancelamentos      | utilidade | R$ 18,70         |
| 45 aniversários                              | marketing | R$ 14,07         |
| 500 pessoas numa campanha de reativação      | marketing | **R$ 156,25**    |
| Recepção conversando o dia todo              | serviço   | R$ 0 (até 09/26) |
| **Total**                                    |           | **≈ R$ 190**     |

**83% da conta é uma única campanha.** É exatamente por isso que o número
aparece na tela antes do botão de enviar.

---

## Onde isso aparece no sistema

**Montar campanha** — ao lado de "entram nesse filtro", o custo estimado. O
mesmo bloco, os dois números do mesmo tamanho: 964 pessoas e R$ 301,25 são as
duas metades da mesma decisão.

**Lista de campanhas** — o gasto acumulado colado no número de enviadas. É o
dado que decide pausar uma campanha que está entregando pouco.

**Automações** — abaixo de cada jornada, o teto por paciente e a composição
("2 de utilidade e 1 de marketing"). Fica ao lado do botão **Ativar**, porque é
ali que a decisão é tomada.

Diz **"até"**, e não "custa": quem responde a primeira mensagem sai da jornada
antes da segunda, e esse é o caso de sucesso. O número é o caminho mais longo.

---

## Duas regras que não podem ser esquecidas

### Quem decide a categoria é a Meta

A categoria é declarada no cadastro do modelo e confirmada na aprovação. O que
o CRC guarda é a **intenção** de cada texto — por isso a tela escreve
"estimado". Se a Meta aprovar em categoria diferente, a conta real muda.

### Reclassificar para baixo não economiza

Tentador chamar recall de utilidade — "é o retorno de rotina dele". A Meta
reprova ou reclassifica, e repetir isso **penaliza o número**. Recall,
reativação e aniversário são marketing, e é assim que estão no código.

Quando o CRC não conhece um modelo, ele chuta **marketing** — o lado caro. Uma
estimativa que subestima faz alguém apertar enviar achando que custa R$ 30
quando custa R$ 300.

---

## O que ainda não está resolvido

**Mensagem proativa precisa ser template aprovado, e o CRC ainda manda texto
livre.** `enviarMensagem` sempre chama `enviarTexto`; `enviarTemplate` existe
nos três provedores e na porta, e nada o chama. Fora da janela de 24 horas a
Meta recusa texto livre — o que atinge campanhas e todas as automações.

A coluna `crc_templates.provider_nome` já existe para guardar o nome aprovado.
Falta ligar os dois, e isso depende de a Meta aprovar os 12 modelos proativos
na conta da clínica.
