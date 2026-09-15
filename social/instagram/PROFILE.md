# Perfil — @jpclinicaodontologica

> O que muda no cabeçalho do perfil, e por quê. Decisões tomadas; onde houver alternativa, ela está marcada.

---

## 1. Username — **manter**

```text
@jpclinicaodontologica
```

Não trocar. Três motivos concretos:

1. ele já está **impresso na placa da fachada** — trocar o @ transforma a placa em um link quebrado;
2. ele está em `CLINICA.instagram` (`src/lib/jp.ts`), no rodapé do site e no JSON-LD;
3. o handle atual já acumula histórico de busca. Username novo começa do zero em descoberta.

---

## 2. Campo "Nome" — **mudar**

O campo Nome do Instagram é **indexado na busca interna**. Hoje ele provavelmente repete o @ — o que gasta o único campo de SEO do perfil dizendo o que já está escrito uma linha acima.

**Recomendado:**

```text
JP Clínica | Dentista Freguesia do Ó
```

35 caracteres, dentro do limite prático de 30–40 que o Instagram exibe sem truncar em telefone.

Ele cobre, na ordem: marca → categoria → bairro. Quem digita "dentista freguesia do ó" na busca do Instagram encontra o perfil por esse campo, não pelo @.

**Alternativas, se a clínica preferir outra ênfase:**

| Ênfase           | Nome                                        |
| ---------------- | ------------------------------------------- |
| implantes        | `JP Clínica \| Implantes Freguesia do Ó`    |
| família          | `JP Clínica Odontológica \| Freguesia do Ó` |
| zona norte ampla | `JP Clínica \| Dentista Zona Norte SP`      |

Não usar emoji no campo Nome: ele ocupa caractere de busca e não é indexado.

---

## 3. Bio — três versões, e a escolhida

O limite é 150 caracteres. As três abaixo cabem.

### ✅ Versão A — **recomendada** (confiança + local + CTA)

```text
Odontologia para todas as fases da vida.
24 anos de história • Hoje na Freguesia do Ó
Implantes, próteses, ortodontia e odontopediatria
↓ Agende sua avaliação
```

**Por que esta.** Abre pelo que a clínica é (não pelo que vende), entrega a prova de tempo sem mentir sobre o bairro, lista as quatro frentes que trazem busca e termina numa ação. A seta aponta para o botão de link, que é o único elemento clicável da bio.

> ⚠️ **A frase proibida.** Não escreva "24 anos na Freguesia do Ó". A clínica foi fundada em 2002 **em Pirituba** e mudou para a Vila Bruna em 2024 (`HISTORIA` em `src/lib/jp.ts`). A formulação correta separa as duas coisas: _"24 anos de história. Hoje, na Freguesia do Ó."_

### Versão B — prova social primeiro

```text
⭐ 4,6 no Google • 192 avaliações
Odontologia desde 2002 • Vila Bruna, Freguesia do Ó
Implantes • Próteses • Ortodontia • Crianças
↓ Fale com a recepção
```

Mais agressiva em prova social. **Cuidado:** o número fica congelado na bio e o Google atualiza sozinho — alguém precisa revisar a cada trimestre, ou a bio passa a discordar da ficha. Se ninguém for revisar, use a Versão A.

### Versão C — enxuta

```text
Sorrir muda tudo.
Clínica odontológica na Freguesia do Ó, desde 2002.
Implantes • Próteses • Ortodontia • Odontopediatria
↓ WhatsApp
```

Abre pela headline institucional. Bonita, mas entrega menos informação de decisão. Boa se o perfil já for conhecido na região.

### O que a bio NÃO deve ter

- "Transformamos sonhos em sorrisos" e variações;
- lista de 12 procedimentos;
- horário completo (vai nos Destaques);
- endereço completo (vai no campo de endereço e no Destaque "Onde estamos");
- promessa, desconto ou urgência.

---

## 4. Categoria e botões

| Campo            | Valor                                                        |
| ---------------- | ------------------------------------------------------------ |
| Categoria        | **Dentista** (ou "Clínica odontológica", se disponível)      |
| Botão de contato | WhatsApp — `(11) 97616-5117`                                 |
| Telefone         | `(11) 3975-9902`                                             |
| Endereço         | `R. Rio Verde, 1029 — Vila Bruna, São Paulo - SP, 02934-201` |

Preencher o endereço é o que coloca a clínica no **mapa do Instagram** e permite que a localização apareça marcada nos Stories. É de graça e quase ninguém faz.

> O WhatsApp aqui é o de `src/lib/jp.ts`. A placa da fachada traz um número diferente — ver [`ASSET-MANIFEST.md`](ASSET-MANIFEST.md), seção "Pendência aberta".

---

## 5. Link — **o site, direto**

```text
https://www.jpclinicaodontologica.com.br
```

Não usar Linktree. O site da JP já tem as rotas certas, é rápido, é da clínica e carrega a atribuição de campanha (`utm_*`) que o projeto implementou — um encurtador de terceiros quebra isso.

Se a clínica quiser mais de um destino, o Instagram já permite **até 5 links nativos** no perfil. Ordem sugerida:

| #   | Rótulo                | Destino                                                      |
| --- | --------------------- | ------------------------------------------------------------ |
| 1   | Agendar pelo WhatsApp | `https://wa.me/5511976165117`                                |
| 2   | Implantes dentários   | `https://www.jpclinicaodontologica.com.br/implante-dentario` |
| 3   | Todos os tratamentos  | `https://www.jpclinicaodontologica.com.br`                   |
| 4   | Como chegar           | o link do Maps em `CLINICA.mapsHref`                         |

**Regra:** quando houver campanha ativa, o link nº 1 da bio acompanha a campanha. Anúncio de implante que cai na home queima verba — é a regra do `docs/ANUNCIAR.md`, e vale para o orgânico também.

---

## 6. Foto de perfil

Use o **símbolo**, não o lockup. O avatar é exibido em 110 px no perfil e em **32 px** no feed; nesse tamanho o nome desenhado vira borrão e o dente continua reconhecível.

Arquivo: `src/assets/marca/marca-jp.svg`.

As quatro prévias estão em `exports/avatar/`:

| Arquivo                                | O que é                               |
| -------------------------------------- | ------------------------------------- |
| `jp_ig_avatar_a_papel_v01.png`         | símbolo sobre papel — **recomendado** |
| `jp_ig_avatar_b_menta_v01.png`         | símbolo sobre menta                   |
| `jp_ig_avatar_c_verde_v01.png`         | símbolo claro sobre verde profundo    |
| `jp_ig_avatar_d_pequeno_teste_v01.png` | o teste de 32 px — é este que decide  |

**Recomendação: a versão A.** Fundo quase branco, símbolo em tamanho cheio. A versão verde (C) é bonita em tamanho grande e vira uma bolha escura indistinta no feed.

O que **não** fazer: não acrescentar disco, moldura, sombra ou borda ao símbolo para "destacar". A marca tem o vão do sorriso vazado — qualquer fundo arbitrário atravessa esse vão e descaracteriza o desenho.

---

## 7. Destaques — ordem e rótulos

Doze capas estão prontas em `exports/highlights/`. O Instagram mostra **cerca de 5 sem rolagem** no celular, então a ordem é decisão comercial.

Ordem recomendada:

| #   | Rótulo           | Por que nesta posição                                        |
| --- | ---------------- | ------------------------------------------------------------ |
| 1   | **Implantes**    | é o produto de aquisição desta fase                          |
| 2   | **A clínica**    | responde "como é lá dentro", que é o que trava o agendamento |
| 3   | **Avaliações**   | prova social logo depois da estrutura                        |
| 4   | **Equipe**       | gente com nome e CRO                                         |
| 5   | **Onde estamos** | fecha a dúvida de deslocamento                               |
| 6   | Próteses         |                                                              |
| 7   | Dúvidas          |                                                              |
| 8   | Ortodontia       |                                                              |
| 9   | Crianças         |                                                              |
| 10  | Estética         |                                                              |
| 11  | Estrutura        |                                                              |
| 12  | 24 anos          | opcional — entra se a clínica quiser a narrativa em destaque |

Se doze parecer demais, corte **Estrutura** e **24 anos** (o conteúdo deles já vive dentro de "A clínica" e "Avaliações") e fique com dez.

---

## 8. Ordem de execução da Fase 1

1. trocar o campo Nome;
2. publicar a bio (Versão A);
3. trocar o avatar pela versão A;
4. preencher categoria, endereço, telefone e botão de WhatsApp;
5. configurar os links da bio;
6. subir os 12 Destaques, na ordem acima, **com o conteúdo dentro** (os cartões estão em `exports/highlights/<nome>/`, numerados na ordem de publicação);
7. só então começar a publicar o feed.

O passo 6 é o que a maioria pula. Capa de Destaque sem conteúdo dentro é uma bolinha bonita que não responde nada — e o segundo toque, o de abrir o Destaque, é onde a decisão de agendar realmente acontece.
