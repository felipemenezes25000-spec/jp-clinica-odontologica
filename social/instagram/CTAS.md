# Banco de CTAs

> Por intenção. O erro mais comum de clínica em rede social é pedir alta intenção para quem está em baixa — "agende agora" num post educativo que a pessoa acabou de descobrir.

---

## Baixa intenção

Quem acabou de conhecer. O pedido é de **guardar**, não de agir.

```text
Salve para consultar antes da sua avaliação.
Salve — você vai querer reler isso.
Envie para alguém que está com essa dúvida.
Manda para quem vive dizendo que "não tem osso".
Comenta aqui a sua dúvida que a gente responde.
Segue a gente para entender o resto.
```

**Onde usar:** carrosséis educativos, Reels de mito, dica rápida, posts de prevenção.

---

## Média intenção

Quem já entendeu que tem um problema e está pesquisando. O pedido é de **aprofundar**.

```text
Conheça como funciona a avaliação.
Veja o passo a passo no Destaque "Implantes".
Tem mais sobre isso no nosso site.
Arrasta pra cima e veja a clínica por dentro.
Todas as dúvidas estão no Destaque "Dúvidas".
Quer entender as possibilidades para o seu caso?
```

**Onde usar:** Reels de tratamento, carrosséis de método, posts de estrutura e equipe.

---

## Alta intenção

Quem está decidindo. O pedido é de **conversar**.

```text
Fale com nossa equipe pelo WhatsApp (11) 97616-5117.
Agende sua avaliação — hora marcada, para ninguém esperar.
Chama a gente no WhatsApp que a recepção explica como funciona.
Traga o seu caso para a avaliação.
Vamos olhar o seu caso.
Agende a sua primeira visita.
```

**Onde usar:** último slide de carrossel, card final de Reel, anúncios, Stories de agendamento.

---

## O CTA padrão do kit

Para quando não houver motivo para inventar outro:

```text
Se quiser entender as possibilidades para o seu caso, fale com a equipe da JP.
```

Ele funciona porque **não promete**: não diz que a JP vai resolver, diz que vai explicar. É a formulação que passa em revisão ética e ainda assim move a pessoa.

---

## O que nunca entra

| ❌                                          | Por quê                                            |
| ------------------------------------------- | -------------------------------------------------- |
| "Clique agora e garanta sua vaga"           | urgência artificial                                |
| "Últimas vagas do mês"                      | escassez falsa                                     |
| "Orçamento grátis sem compromisso agora!!!" | varejo, e três exclamações                         |
| "Resultado garantido"                       | promessa — vedada                                  |
| "Não perca essa oportunidade"               | genérico e promocional                             |
| "Link na bio" em **anúncio**                | elemento de interface orgânica; em anúncio é ruído |
| "Arraste" em **anúncio**                    | idem                                               |

---

## Regras de uso

1. **Um CTA por peça.** Dois CTAs competindo produzem zero ações.
2. **No máximo um CTA de WhatsApp por dia nos Stories.** CTA em todo quadro treina a pessoa a pular a sequência inteira.
3. **O CTA nomeia a ação e o canal.** "Fale com a equipe no WhatsApp" bate "saiba mais".
4. **Em anúncio, sem interface orgânica.** Nada de salvar, arrastar, comentar ou link na bio.
5. **O número vem de `src/lib/jp.ts`.** Se você está digitando `(11) 97616-5117` à mão numa arte, pare: use `{{clinica.whatsapp}}`.

---

## Mensagem pré-preenchida do WhatsApp

Quando o CTA levar direto ao WhatsApp, a mensagem já vai escrita. Isso reduz o atrito de "o que eu escrevo agora" — que é onde boa parte do lead se perde.

```text
Olá! Vim pelo Instagram da JP e gostaria de agendar uma avaliação de implantes.
```

Por tratamento:

| Tratamento | Mensagem                                                                                |
| ---------- | --------------------------------------------------------------------------------------- |
| Implantes  | `Olá! Vim pelo Instagram da JP e gostaria de agendar uma avaliação de implantes.`       |
| Próteses   | `Olá! Vim pelo Instagram da JP e gostaria de conversar sobre prótese/reabilitação.`     |
| Ortodontia | `Olá! Vim pelo Instagram da JP e gostaria de agendar uma avaliação ortodôntica.`        |
| Crianças   | `Olá! Vim pelo Instagram da JP e gostaria de agendar a primeira consulta do meu filho.` |
| Geral      | `Olá! Vim pelo Instagram da JP e gostaria de agendar uma avaliação.`                    |

Em campanha paga, acrescente a referência curta — **nunca** `fbclid` ou `gclid`:

```text
Ref.: IMP-M-A01
```

O código de cada conceito está em [`PAID-MEDIA.md`](PAID-MEDIA.md) §3.

O link é montado com `whatsappLink()`, que já existe em `src/lib/jp.ts`.
