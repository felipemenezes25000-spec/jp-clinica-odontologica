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

> O WhatsApp é o de `src/lib/jp.ts`, confirmado pela clínica em 18/09/2026. A placa da fachada ainda traz um número antigo — ver [`ASSET-MANIFEST.md`](ASSET-MANIFEST.md) §1.2.

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

Use a **logo inteira**: JP, "Clínica Odontológica" e a onda. É decisão da clínica (18/09/2026), e vale para tudo, sem exceção: nunca o símbolo sozinho.

O avatar aparece com 110 px no perfil e 32 px no feed. Nesses tamanhos, o nome desenhado não se lê; o que reconhece a clínica é a forma da logo, o JP e a onda. Por isso a logo ocupa 80% do diâmetro: grande o bastante, e inteira dentro do círculo que o Instagram recorta.

Arquivo: `src/assets/marca/logo-jp.svg` (em fundo escuro, `logo-jp-claro.svg`).

As quatro prévias estão em `exports/avatar/`:

| Arquivo                                | O que é                              |
| -------------------------------------- | ------------------------------------ |
| `jp_ig_avatar_a_papel_v01.png`         | logo sobre papel — **a escolhida**   |
| `jp_ig_avatar_b_menta_v01.png`         | logo sobre menta                     |
| `jp_ig_avatar_c_verde_v01.png`         | logo (versão escura) sobre verde     |
| `jp_ig_avatar_d_pequeno_teste_v01.png` | o teste de 32 px — é este que decide |

**A escolhida é a versão A.** Fundo quase branco, logo nas cores originais. A versão verde (C) é bonita em tamanho grande e vira uma bolha escura indistinta no feed.

O que **não** fazer: não acrescentar disco, moldura, sombra ou borda à logo para "destacar". A marca tem o vão do sorriso vazado — qualquer fundo arbitrário atravessa esse vão e descaracteriza o desenho.

---

## 7. Destaques — ordem e rótulos

**Decisão da clínica (18/09/2026, [`ORDEM_DE_PUBLICACAO_JP.md`](ORDEM_DE_PUBLICACAO_JP.md) §5 e §6): dez Destaques, nesta ordem no perfil.**

| #   | Pasta             | Rótulo       | Stories dentro |
| --- | ----------------- | ------------ | -------------- |
| 1   | `01_A-Clinica`    | A Clínica    | 9              |
| 2   | `02_Implantes`    | Implantes    | 13             |
| 3   | `03_Proteses`     | Próteses     | 8              |
| 4   | `04_Ortodontia`   | Ortodontia   | 7              |
| 5   | `05_Estetica`     | Estética     | 7              |
| 6   | `06_Criancas`     | Crianças     | 7              |
| 7   | `07_Avaliacoes`   | Avaliações   | 7              |
| 8   | `08_Equipe`       | Equipe       | 9              |
| 9   | `09_Duvidas`      | Dúvidas      | 13             |
| 10  | `10_Onde-estamos` | Onde estamos | 5              |

Cada pasta tem também a `CAPA.png`, a capa da bolinha, escolhida em **Editar capa** e nunca publicada. Implantes e Dúvidas passam de 10 imagens porque o documento da clínica pede assim.

O cartão de abertura de cada Destaque (`*_01_capa.png` em `exports/highlights/`, o "Entre antes de entrar." da Clínica) ficou fora da entrega: o documento não tem posição para ele. Se a clínica quiser, ele entra como primeiro Story.

**Crie na ordem inversa**, do 10 para o 01: o Instagram joga o Destaque atualizado por último para a frente. As capas de **Estrutura** e **24 anos** existem em `exports/highlights/`, mas ficaram fora do plano.

---

## 8. Ordem de execução da Fase 1

1. trocar o campo Nome;
2. publicar a bio (Versão A);
3. trocar o avatar pela versão A;
4. preencher categoria, endereço, telefone e botão de WhatsApp;
5. configurar os links da bio;
6. subir os 10 Destaques, **do 10 para o 01**, **com o conteúdo dentro** (os cartões estão em `ENTREGA/DESTAQUES`, numerados na ordem de publicação, com a `CAPA.png` de cada um);
7. só então começar a publicar o feed.

O passo 6 é o que a maioria pula. Capa de Destaque sem conteúdo dentro é uma bolinha bonita que não responde nada — e o segundo toque, o de abrir o Destaque, é onde a decisão de agendar realmente acontece.
