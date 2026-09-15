# Meta Ads — pacote inicial

> Este documento **segue** [`docs/ANUNCIAR.md`](../../docs/ANUNCIAR.md). Onde os dois discordarem, o `ANUNCIAR.md` vence: ele é a regra do projeto, este é o criativo.

A primeira fase **não depende do CRC**.

---

## 1. O que está pronto

| Tipo                       | Quantidade                     | Onde                                         |
| -------------------------- | ------------------------------ | -------------------------------------------- |
| Vídeo 9:16                 | **18** (6 conceitos × 3 hooks) | `exports/ads/jp_ig_ad_ad0*_hook*.mp4`        |
| Legenda .srt de cada vídeo | 18                             | mesmo diretório                              |
| Estático 4:5               | 4                              | `exports/ads/jp_ig_ad0[7-9]*.png`, `ad10`    |
| Carrossel de anúncio       | 2 (5 slides cada)              | `exports/ads/ad11-*/`, `exports/ads/ad12-*/` |

Todos os vídeos são 1080×1920, H.264, ~21 s, com **faixa de áudio silenciosa** — alguns players do Gerenciador de Anúncios engasgam com arquivo sem trilha de áudio.

> **Sobre música.** Os arquivos saem mudos de propósito: trilha licenciada não pode ser embutida num arquivo que a clínica vai distribuir. Em anúncio, vídeo mudo com texto na tela funciona (85% assiste sem som). Se quiser trilha, use uma faixa com licença comercial verificada — nunca áudio "em alta" do Instagram num anúncio.

---

## 2. Os seis conceitos

| ID       | Conceito                           | Pilar     | Objetivo                                         |
| -------- | ---------------------------------- | --------- | ------------------------------------------------ |
| **AD01** | Implante dói?                      | implantes | educativo — derruba a objeção nº 1               |
| **AD02** | Dentadura é a única possibilidade? | próteses  | abre o leque de reabilitação                     |
| **AD03** | Todo implante precisa de enxerto?  | implantes | objeção — "não tenho osso"                       |
| **AD04** | Conheça a JP                       | clínica   | confiança — reduz incerteza de quem nunca entrou |
| **AD05** | Implantes na Freguesia do Ó        | implantes | local + intenção                                 |
| **AD06** | Prova social                       | marca     | 24 anos + avaliações reais                       |

### Os três hooks de cada conceito

Os três compartilham **exatamente o mesmo corpo e o mesmo CTA**. Se o hook B ganha do A, o que se aprendeu foi sobre o hook — não sobre sorte.

| Conceito | Hook A (pergunta)                        | Hook B (afirmação)                                             | Hook C (local/prova)                                    |
| -------- | ---------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------- |
| AD01     | "Implante dói?"                          | "A dúvida nº 1 antes de um implante."                          | "Implantes na Freguesia do Ó: a dúvida que mais chega." |
| AD02     | "Dentadura é a única opção?"             | "Quando há perda de vários dentes, existe mais de um caminho." | "Reabilitação oral na Freguesia do Ó."                  |
| AD03     | "Todo implante precisa de enxerto?"      | "Nem todo caso precisa de enxerto."                            | "'Não tenho osso.' Será?"                               |
| AD04     | "Conheça a JP por dentro."               | "24 anos de história. Hoje, na Freguesia do Ó."                | "Antes de marcar, veja onde você vai sentar."           |
| AD05     | "Implantes dentários na Freguesia do Ó." | "Procurando implante na Zona Norte de São Paulo?"              | "Avaliação de implantes na Vila Bruna."                 |
| AD06     | "4,6 no Google, com 192 avaliações."     | "24 anos. E a conta que importa é outra."                      | "O que dizem os que já sentaram na nossa cadeira."      |

---

## 3. Nomenclatura e UTM

Padrão do projeto: **minúsculo, sem espaço, sem acento.**

```text
utm_source=meta
utm_medium=cpc
utm_campaign=implante_freguesia_meta
utm_content=<id_do_criativo>
```

### Tabela de `utm_content`

| Criativo        | Arquivo                                    | `utm_content`               | Destino              |
| --------------- | ------------------------------------------ | --------------------------- | -------------------- |
| AD01 hook A     | `jp_ig_ad_ad01_hooka_v01.mp4`              | `ad01_hooka`                | `/implante-dentario` |
| AD01 hook B     | `jp_ig_ad_ad01_hookb_v01.mp4`              | `ad01_hookb`                | `/implante-dentario` |
| AD01 hook C     | `jp_ig_ad_ad01_hookc_v01.mp4`              | `ad01_hookc`                | `/implante-dentario` |
| AD02 hook A/B/C | `jp_ig_ad_ad02_hook*.mp4`                  | `ad02_hooka` … `ad02_hookc` | `/protese-dentaria`  |
| AD03 hook A/B/C | `jp_ig_ad_ad03_hook*.mp4`                  | `ad03_hooka` … `ad03_hookc` | `/implante-dentario` |
| AD04 hook A/B/C | `jp_ig_ad_ad04_hook*.mp4`                  | `ad04_hooka` … `ad04_hookc` | WhatsApp direto      |
| AD05 hook A/B/C | `jp_ig_ad_ad05_hook*.mp4`                  | `ad05_hooka` … `ad05_hookc` | `/implante-dentario` |
| AD06 hook A/B/C | `jp_ig_ad_ad06_hook*.mp4`                  | `ad06_hooka` … `ad06_hookc` | WhatsApp direto      |
| AD07 estático   | `jp_ig_ad07_implante_planejamento_v01.png` | `ad07_estatico`             | `/implante-dentario` |
| AD08 estático   | `jp_ig_ad08_local_clinica_real_v01.png`    | `ad08_local`                | `/implante-dentario` |
| AD09 estático   | `jp_ig_ad09_prova_google_v01.png`          | `ad09_prova`                | WhatsApp direto      |
| AD10 estático   | `jp_ig_ad10_estrutura_equipe_v01.png`      | `ad10_estrutura`            | `/implante-dentario` |
| AD11 carrossel  | `ad11-implantes-duvidas/`                  | `ad11_carrossel`            | `/implante-dentario` |
| AD12 carrossel  | `ad12-conheca-a-clinica/`                  | `ad12_carrossel`            | WhatsApp direto      |

### URL de exemplo

```text
https://www.jpclinicaodontologica.com.br/implante-dentario?utm_source=meta&utm_medium=cpc&utm_campaign=implante_freguesia_meta&utm_content=ad01_hooka
```

**Regra que não se quebra:** anúncio de implante **não** vai para a home. Vai para `/implante-dentario`, que entra em `modo="anuncio"` — menos distração, H1 com procedimento + região, e canonical apontando para a rota orgânica.

### Referência curta para o WhatsApp

Quando o destino for WhatsApp direto, a mensagem pré-preenchida leva uma referência curta, **nunca `fbclid`**:

```text
Olá! Vim pelo Instagram da JP e gostaria de agendar uma avaliação de implantes.
Ref.: IMP-M-A01
```

| Conceito | Ref.        |
| -------- | ----------- |
| AD01     | `IMP-M-A01` |
| AD02     | `PRO-M-A02` |
| AD03     | `IMP-M-A03` |
| AD04     | `CLI-M-A04` |
| AD05     | `IMP-M-A05` |
| AD06     | `CLI-M-A06` |

---

## 4. Conversão

**`generate_lead` é a única conversão primária desta fase.** Regra absoluta de `docs/ANUNCIAR.md` §5.

| Evento           | No Meta       | Primária? |
| ---------------- | ------------- | --------- |
| `generate_lead`  | `Lead`        | **SIM**   |
| `contact_click`  | `Contact`     | não       |
| `treatment_view` | `ViewContent` | não       |

Não configurar públicos nem conversões com `whatsapp_click`, `schedule_click` ou `treatment_cta_click` — são da semântica antiga.

**Um CTA primário não pode gerar `Lead + Lead` nem `Contact + Lead` como se fossem duas conversões.**

---

## 5. Remarketing — a regra conservadora

Implante é procedimento invasivo. Para mídia, trate o contexto como **saúde/sensível**.

- **Não** transforme visita a `/implante-dentario` em público de remarketing;
- **não** monte Custom Audience baseada em comportamento em página clínica;
- na primeira fase, trabalhe **aquisição local ampla + intenção do anúncio**.

Qualquer estratégia de público que dependa desse sinal precisa ser validada contra a política vigente da Meta antes de ser ativada. Ver `docs/ANUNCIAR.md` §12.

---

## 6. Segmentação

Começar local e apertado.

| Camada                | Configuração                                              |
| --------------------- | --------------------------------------------------------- |
| Geografia             | raio de **4–6 km** da R. Rio Verde, 1029                  |
| Bairros de prioridade | Freguesia do Ó, Vila Bruna, Pirituba, Limão, Brasilândia  |
| Idade                 | 25–65+                                                    |
| Gênero                | todos                                                     |
| Interesses            | **nenhum na primeira fase** — deixe o criativo qualificar |
| Posicionamento        | Reels, Stories e Feed do Instagram; Feed do Facebook      |

Não abrir São Paulo inteiro no início. O criativo AD05 fala o nome do bairro: quem está a 20 km não se reconhece nele, e o clique dele é o clique mais caro da conta.

---

## 7. Estrutura de campanha sugerida

```text
Campanha: implante_freguesia_meta   (objetivo: Leads)
│
├── Conjunto A — raio 5 km, amplo
│   ├── AD01 hook A
│   ├── AD01 hook B
│   └── AD01 hook C
│
├── Conjunto B — raio 5 km, amplo
│   ├── AD05 hook A
│   ├── AD05 hook B
│   └── AD05 hook C
│
└── Conjunto C — confiança (raio 6 km)
    ├── AD04 hook A
    └── AD06 hook A
```

**Comece com dois conjuntos, não seis.** Orçamento pequeno espalhado em seis conjuntos nunca sai da fase de aprendizagem — e conjunto que não sai do aprendizado não ensina nada.

### Ordem de entrada

| Semana | O que sobe                                                    |
| ------ | ------------------------------------------------------------- |
| 1      | AD01 (3 hooks) + AD05 (3 hooks)                               |
| 2      | mantém o vencedor de cada, entra AD03                         |
| 3      | entra AD04 ou AD06 (confiança), conforme o custo por conversa |
| 4      | estáticos AD07–AD10 como reforço de frequência                |

### Os 6 criativos que devem entrar primeiro

1. `jp_ig_ad_ad01_hooka_v01.mp4` — a objeção nº 1, pergunta direta
2. `jp_ig_ad_ad01_hookc_v01.mp4` — a mesma, com o bairro no gancho
3. `jp_ig_ad_ad05_hooka_v01.mp4` — local + intenção
4. `jp_ig_ad_ad05_hookb_v01.mp4` — local, formulado como busca
5. `jp_ig_ad_ad03_hooka_v01.mp4` — a objeção do enxerto
6. `jp_ig_ad_ad04_hooka_v01.mp4` — confiança, para quem nunca entrou

---

## 8. Copy de anúncio

Duas copies principais e duas headlines por conceito. **Nenhuma atribui condição de saúde a quem está vendo.**

### AD01 / AD03 — implantes, educativo

**Copy 1**

```text
"Implante dói?" é a pergunta que mais chega na nossa recepção — quase sempre antes do "quanto custa".

A cirurgia é feita com anestesia local. O pós-operatório varia de caso para caso, e a equipe orienta cuidados, prescrição e retornos.

Se o implante é indicado para você, só a avaliação responde: depende de exame de imagem, histórico de saúde e exame clínico.

JP Clínica Odontológica — 24 anos de história, hoje na Freguesia do Ó.
```

**Copy 2**

```text
Quando há perda de dentes, existem diferentes possibilidades de reabilitação. A indicação depende de avaliação individual.

Na JP, a avaliação vem antes do orçamento: histórico de saúde, exame clínico, exame de imagem quando indicado, e as possibilidades explicadas com clareza.

Converse com a nossa equipe para entender como funciona a consulta.
```

**Headlines**

- `Implantes com planejamento individual`
- `Avaliação de implantes na Freguesia do Ó`

### AD02 — reabilitação

**Copy 1**

```text
Quem perdeu vários dentes costuma achar que só existe um caminho.

Existem pelo menos três: prótese removível, prótese fixa sobre implantes e prótese protocolo, quando indicada. Cada um tem indicação, vantagem e limite.

Qual deles cabe no seu caso depende de exame de imagem, condição óssea e saúde geral — e isso não se decide por catálogo.
```

**Copy 2**

```text
Quem já usa prótese removível pode avaliar implantes. Existem alternativas que usam implantes para dar mais estabilidade à prótese.

O que é possível depende do caso e das condições ósseas. Na JP, a avaliação explica as possibilidades antes de qualquer decisão.
```

**Headlines**

- `Reabilitação oral com planejamento`
- `Próteses planejadas caso a caso`

### AD04 / AD06 — confiança e local

**Copy 1**

```text
24 anos de história. Hoje, na Freguesia do Ó.

A JP nasceu em Pirituba, em 2002, e desde 2024 está na Vila Bruna. Estrutura própria, equipe com nome e registro, e 4,6 no Google com 192 avaliações públicas.

R. Rio Verde, 1029. Segunda a sexta, 08:00 às 18:00.
```

**Copy 2**

```text
Antes de marcar, veja onde você vai sentar.

Recepção, consultórios e a sala de esterilização — aquela que ninguém mostra e onde a segurança do atendimento começa.

Converse com a equipe da JP para entender como funciona a avaliação.
```

**Headlines**

- `Clínica odontológica na Freguesia do Ó`
- `24 anos cuidando de sorrisos`

---

## 9. Copy segura — o que nunca entra

| ❌ Proibido                      | ✅ Substituto                                                  |
| -------------------------------- | -------------------------------------------------------------- |
| "Você está sem dentes?"          | "Quando há perda de dentes..."                                 |
| "Sua dentadura está machucando?" | "Quem já usa prótese removível pode avaliar implantes."        |
| "Você tem vergonha de sorrir?"   | "Cada caso pede um planejamento diferente."                    |
| "Implante sem dor"               | "A cirurgia é feita com anestesia local."                      |
| "Resultado garantido"            | "A indicação depende de avaliação individual."                 |
| "Últimas vagas", "só hoje"       | "Avaliação com hora marcada."                                  |
| "O melhor implante de SP"        | "Implantes com planejamento individual."                       |
| "Especialista em implantes"      | **não usar** — a titulação não está documentada no repositório |

O último é o mais importante e o mais tentador. Nenhum profissional em `src/lib/jp.ts` traz especialidade em implantodontia registrada. Até existir essa documentação, a JP anuncia **o procedimento e o método**, não um título.

---

## 10. Métricas — o que se olha, e em que ordem

```text
retenção 3 s → retenção 50% → conclusão → cliques → conversas → generate_lead
→ agendamentos → comparecimentos → tratamentos fechados → CAC → receita
```

**O objetivo final não é CPC baixo.** Um criativo com CPC de R$ 0,40 e zero conversa é mais caro que um com CPC de R$ 1,80 e seis agendamentos.

| Métrica            | Onde olhar          | O que dispara ação                        |
| ------------------ | ------------------- | ----------------------------------------- |
| retenção 3 s       | Meta                | < 25% → o hook está errado, troque o hook |
| retenção 50%       | Meta                | < 15% → o corpo está longo, corte 4 s     |
| custo por conversa | Meta                | comparar entre hooks do mesmo conceito    |
| `generate_lead`    | GA4 / Meta          | a conversão primária                      |
| comparecimento     | operação da clínica | o número que diz se o lead era real       |

O funil só fecha com o dado da recepção. Lead que não comparece não é lead — é custo.

---

## 11. Checklist antes de subir cada anúncio

- [ ] não atribui condição de saúde ao usuário
- [ ] não contém promessa de resultado
- [ ] não usa escassez falsa
- [ ] não contém dado sensível
- [ ] CTA natural, que nomeia a ação
- [ ] tratamento correto na peça e na campanha
- [ ] rota de destino correta (não é a home)
- [ ] UTM completa e minúscula
- [ ] `utm_content` único e igual ao da tabela
- [ ] versão 9:16 conferida no celular
- [ ] versão 4:5 quando aplicável
- [ ] legenda revisada (o `.srt` acompanha o `.mp4`)
- [ ] responsável técnica identificável na conta
- [ ] nenhum elemento de interface orgânica ("salve", "arraste", "link na bio")
