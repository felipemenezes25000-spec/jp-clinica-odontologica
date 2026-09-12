# JP Clínica Odontológica

Site institucional da **JP Clínica Integrada Odontológica** — Rua Rio Verde, 1029, Vila Bruna, região da Freguesia do Ó, São Paulo.

🔗 **[www.jpclinicaodontologica.com.br](https://www.jpclinicaodontologica.com.br)**

O objetivo do site é um só: fazer a pessoa agendar pelo WhatsApp. Toda decisão de conteúdo, peso e acessibilidade foi tomada com esse funil em vista.

---

## Rodando

```bash
npm install
npm run dev
```

Sobe em `http://localhost:8080`.

| Comando           | O que faz                                    |
| ----------------- | -------------------------------------------- |
| `npm run dev`     | Servidor de desenvolvimento com HMR          |
| `npm run build`   | Build de produção (Nitro → `.vercel/output`) |
| `npm run preview` | Serve o build localmente                     |
| `npm run lint`    | ESLint + Prettier                            |
| `npm run format`  | Aplica a formatação                          |

---

## Stack

- **React 19** + **TanStack Start** — SSR de verdade, não hidratação de casca vazia
- **TanStack Router** — rotas por arquivo em `src/routes/`
- **Tailwind CSS v4** via `@tailwindcss/vite`
- **Vite 8** + **Nitro** para o build do servidor
- `lucide-react` para ícones de interface

Sem biblioteca de componentes. Os componentes são próprios, em `src/components/site/`.

---

## Onde as coisas ficam

```
src/
├── lib/
│   ├── jp.ts                    ← FONTE ÚNICA DE VERDADE (contato, avaliação, tratamentos, equipe)
│   ├── seo.ts                   título e descrição dentro do que o Google mostra
│   ├── dadosEstruturados.ts     o JSON-LD, montado a partir de jp.ts
│   └── analytics.ts             eventos de conversão, um ouvinte só
├── routes/
│   ├── __root.tsx               shell, metatags globais, 404 e erro
│   ├── index.tsx                home (9 seções)
│   └── tratamentos/$slug.tsx    as 8 páginas de tratamento
├── components/site/             componentes próprios
├── assets/
│   ├── fontes/                  Inter e Manrope, hospedadas aqui
│   └── …                        fotos e vídeos
└── styles.css                   tokens e classes de sistema — ver DESIGN.md
```

**O sistema visual tem documento próprio: [DESIGN.md](DESIGN.md)** — paleta com
razões de contraste medidas, escala tipográfica, calha, raio, botões, hierarquia
de CTA, regras de acessibilidade e as armadilhas que custaram iteração.

### Os três sistemas que moram neste repo

| Rota   | O que é                                              | Documentação                           |
| ------ | ---------------------------------------------------- | -------------------------------------- |
| `/`    | O site institucional. É o que este README descreve.  | aqui                                   |
| `/rh`  | Portal de RH: vagas, candidaturas, triagem por IA.   | [docs/PORTAL-RH.md](docs/PORTAL-RH.md) |
| `/crc` | JP CRC OS: CRM, automação de recuperação e cobrança. | [docs/crc/](docs/crc/)                 |

**Para anunciar** (Google Ads e Meta), comece por
[docs/ANUNCIAR.md](docs/ANUNCIAR.md) — para onde mandar cada campanha, os
eventos que o site já dispara, o que ainda falta instalar e o que a publicidade
odontológica não permite.

As sete rotas curtas de anúncio (`/implante-dentario`, `/ortodontia`, …) são a
**mesma página** do tratamento correspondente, sob a URL que casa com o termo
pesquisado, com `canonical` apontando para a orgânica. O conteúdo vive em
`components/site/PaginaDeTratamento.tsx`, e as rotas são finas — uma correção
vale para as oito URLs de uma vez.

Os três compartilham build, domínio e Supabase, e nada mais: as tabelas do CRC
têm prefixo `crc_`, o CSS dele vive inteiro sob `.crc-app`, e nenhum arquivo do
site foi alterado para ele existir.

**Para colocar o CRC no ar**, comece por
[docs/crc/ATIVACAO-EM-PRODUCAO.md](docs/crc/ATIVACAO-EM-PRODUCAO.md) — o passo a
passo de SQL, variáveis, credenciais e ordem de ativação. Os outros
documentos são
[ROTEIRO-DA-EQUIPE](docs/crc/ROTEIRO-DA-EQUIPE.md) (**a rotina de quem opera** —
cinco minutos, para a recepção ler no primeiro dia),
[CUSTO-DAS-MENSAGENS](docs/crc/CUSTO-DAS-MENSAGENS.md) (**quanto a Meta cobra e
por quê** — marketing custa 9× utilidade, e é isso que decide a fatura),
[CAPACIDADES-DENTAL-OFFICE](docs/crc/CAPACIDADES-DENTAL-OFFICE.md) (**o que dá e
o que não dá para fazer com a API deles** — leia antes de planejar qualquer
funcionalidade nova), [ARCHITECTURE](docs/crc/ARCHITECTURE.md) (como funciona),
[RUNBOOK](docs/crc/RUNBOOK.md) (quando algo dá errado) e
[FINAL-ACCEPTANCE](docs/crc/FINAL-ACCEPTANCE.md) (o que existe e o que não
existe).

### `src/lib/jp.ts` é o arquivo que importa

Telefone, WhatsApp, endereço, horário, avaliação do Google, tratamentos, FAQ, equipe e depoimentos vivem **só ali**. Trocar o telefone nesse arquivo atualiza o cabeçalho, o rodapé, os 8 links de WhatsApp, o formulário, os cards de contato e o JSON-LD de uma vez.

Nada de dado de contato está escrito direto no JSX. Se você encontrar algum, é bug.

---

## Decisões que não são óbvias

Cada uma dessas custou tempo para descobrir. Estão documentadas no código também, mas ficam aqui para quem chega agora.

### O ano é um número fixo, não `new Date()`

`HISTORIA.anos` e `HISTORIA.anoCopyright` são literais. Calcular a partir da data atual faria o **servidor e o navegador renderizarem valores diferentes na virada do ano** — erro de hidratação do React. Custo: uma edição por ano.

### Tailwind v4 não passa por PostCSS aqui

`vite.config.ts` fixa `css: { postcss: {} }` de propósito. Sem isso, o Vite **sobe a árvore de diretórios procurando um `postcss.config.js`** — e um arquivo perdido numa pasta pai (por exemplo, na pasta do usuário) carrega o plugin PostCSS do Tailwind v3 em cima do v4 e quebra o build com uma mensagem que não aponta para lugar nenhum.

### O preset do Nitro

`nitro({ defaultPreset: "vercel" })` é **fallback**, não trava. O Nitro detecta a plataforma por variável de ambiente (`VERCEL=1`). Para outro alvo:

```bash
NITRO_PRESET=node-server npm run build
```

### O verde da marca não serve como texto sobre fundo claro

`--primary` / `--lime` (#7BD51C) mede **1,73:1 sobre o creme da página**. Isso reprova até para texto grande, que exige apenas 3:1 — não é margem apertada, é o dobro do permitido.

A revisão de contraste criou dois tokens para resolver isso de uma vez:

| Token          | Valor     | Sobre creme | Sobre branco | Para quê                                     |
| -------------- | --------- | ----------- | ------------ | -------------------------------------------- |
| `--brand-text` | `#41761c` | 5,13:1      | 5,48:1       | verde da marca **como texto** em fundo claro |
| `--ink-soft`   | `#5a6b5c` | 5,33:1      | 5,69:1       | texto secundário em fundo claro              |

Regras que decorrem daí:

- **`--lime` como texto só sobre fundo escuro**, onde mede 8,2:1. Em fundo claro, use `--brand-text`.
- **Nunca `--forest` com opacidade para texto.** A faixa que existia (40% a 70%) ia de 1,87:1 a 3,31:1 — toda ela reprovava. Use `--ink-soft` sólido.
- **Sobre o lime**, texto tem de ser `--forest-2` (8,2:1). `--ink-soft` ali dá 3,08:1.

### Piso de 12px na tipografia

`--text-micro` (0.75rem) é o menor tamanho do site. Havia **44 valores escritos à mão** — `text-[11px]` em 43 lugares e um `text-[10px]` — espalhados por nove arquivos: valor mágico repetido **e** abaixo do confortável de ler no celular. Rótulo discreto fica discreto por caixa-alta, peso e espaçamento entre letras, não por encolher abaixo do legível.

O site usa duas famílias, **hospedadas neste repositório** (`src/assets/fontes/`): **Manrope** nos títulos (`font-display`) e **Inter** no resto. Vinham do Google e bloqueavam 835 ms de renderização no celular — além de mandar o IP de cada visitante a um terceiro. Detalhes em [DESIGN.md](DESIGN.md).

### O menu mobile é a navegação do celular

A nav horizontal só aparece em `xl` (≥1280px). Abaixo disso, **o painel do menu é o único caminho** para telefone e WhatsApp. Ele é um painel de revelação (não um modal): `aria-expanded` + `aria-controls`, Escape fecha e devolve o foco ao botão, `overflow-y-auto` para caber em tela baixa. Mexer nisso sem cuidado derruba a conversão no celular inteiro.

Fechado, ele leva **`invisible`** junto com `max-h-0`. Só altura zero não basta: o conteúdo continua no fluxo de foco e a pessoa que navega por Tab passa por nove links que não consegue ver.

### A calha é uma variável, não uma classe por seção

`--jp-gutter` muda em dois breakpoints (20px → 32px → 40px) e as duas larguras globais acompanham:

| Classe                              | Largura                                                         |
| ----------------------------------- | --------------------------------------------------------------- |
| `.jp-container`                     | `min(1320px, 100% - calha × 2)` — o padrão do site              |
| `.jp-container-wide`                | `min(1400px, 100% - calha × 2)` — só o cabeçalho                |
| `.jp-section` / `.jp-section-large` | espaçamento vertical (4,5rem / 6rem, reduzindo nos breakpoints) |

Nenhuma seção repete `mx-auto max-w-[1320px] px-5 md:px-8 xl:px-10`. Se alguma repetir, é regressão: mudar a calha do site passa a exigir uma edição por arquivo.

### `calc()` sem espaço não gera classe nenhuma

`w-[calc(50%-10px)]` é **CSS inválido** — dentro de `calc()` o operador precisa
de espaço dos dois lados. O Tailwind simplesmente **não gera a classe**, sem
avisar. Escreve-se com sublinhado, que ele converte em espaço:

```
w-[calc(50%-10px)]      ← a classe não existe no CSS
w-[calc(50%_-_10px)]    ← certo
```

Aconteceu em sete larguras da grade de equipe. Nenhuma foi gerada, o `w-full` da
base passou a valer sozinho, e os seis cards desciam **um por linha** em tablet e
desktop: seção de **11.086 pixels**, doze telas para ver seis pessoas. Depois:
**932px**.

O que pega isso não é ler o JSX — as classes estavam lá, literais. É conferir se
chegaram ao CSS que o navegador baixa:

```bash
npm run build && grep -F "calc(33.333% - 14px)" .vercel/output/static/assets/*.css
```

### A âncora precisa limpar o cabeçalho grudado

`scroll-padding-top` tem de ser **maior que a altura do header sticky**. Era
92px contra um cabeçalho de 127px: clicar em "Tratamentos" parava a seção 35px
atrás dele, engolindo o começo do título. Hoje são 136px. **Se a altura do
cabeçalho mudar, esse número muda junto.**

### O intervalo entre seções é uma soma, não um valor

O espaço que se vê entre duas seções é o `padding-bottom` de uma **mais** o `padding-top` da seguinte. `.jp-section` vale 4,5rem de cada lado, então o intervalo real é **144px**, não 72px.

Quem for apertar ou afrouxar a respiração do site mexe só nessa classe. Antes havia três escalas convivendo (`py-20/28/36`, `py-24/32` e `.jp-section`), o intervalo variava de 240 a 288px e cada seção tinha a régua do dia em que foi escrita. Se aparecer um `py-*` num `<section>`, é regressão.

---

## Conteúdo: o que é real e o que não é

Isto não é detalhe de implementação. É uma clínica de saúde real e a publicidade odontológica é regulada (**Resolução CFO 196/2019**).

| Elemento                | Origem                                                                       |
| ----------------------- | ---------------------------------------------------------------------------- |
| Imagens dos ambientes   | **Versões geradas por IA** a partir das fotos reais da clínica — ver abaixo  |
| Texto dos depoimentos   | **Avaliações reais do Google**, com o nome como aparece lá                   |
| Nota e volume           | **4,6★ · 192 avaliações** — vive em `AVALIACOES`, ver [DESIGN.md](DESIGN.md) |
| Missão                  | **Transcrita do quadro** afixado na parede da clínica                        |
| 7 dos 8 vídeos          | Acervo da própria clínica                                                    |
| Vídeo de clareamento    | Pexels (licença livre para uso comercial)                                    |
| **Retratos de pessoas** | **Fictícios** — ver abaixo                                                   |

### As imagens dos ambientes são recriações por IA

A clínica optou por substituir as 6 fotos reais por versões geradas por IA das **mesmas cenas** — mesma fachada, mesmos consultórios, mesmo equipo, mesma sala de esterilização. O que muda é a limpeza da imagem: sumiram a fiação da rua, o céu ficou uniforme, a iluminação ficou homogênea.

| Arquivo                 | Recriação de                    |
| ----------------------- | ------------------------------- |
| `fachada.webp`          | `jp-clinica-odontologica-6.jpg` |
| `consultorio-1.webp`    | `jp-clinica-odontologica-5.jpg` |
| `consultorio-wide.webp` | `jp-clinica-odontologica-5.jpg` |
| `consultorio-2.webp`    | `jp-clinica-odontologica.jpg`   |
| `esterilizacao.webp`    | `jp-clinica-odontologica-3.jpg` |
| `equipamento.webp`      | `jp-clinica-odontologica-2.jpg` |

As fotos originais em 3024×4032 estão preservadas fora do repositório (`Downloads/imagens-reais-jp-clinica.zip`).

> **Leia a placa com zoom antes de subir qualquer fachada nova.** A primeira geração da fachada trazia, sob o nome da responsável técnica, um registro inventado: **"CRO/PI 1002 3889"** — UF de outro estado e número inexistente. Foi descartada. A que está no ar traz `Responsavel Tecnica CROSP 75.159`, igual à placa real, conferido com ampliação de 8×.
>
> Modelos de imagem erram texto com naturalidade, e um CRO falso na publicidade de uma clínica é infração ao CFO. Placa, letreiro, diploma ou qualquer documento legível numa imagem gerada tem de ser lido caractere a caractere.

### As pessoas do site são reais

Já não são. Este bloco existiu por meses avisando o contrário, e o aviso ficou
para trás quando os dados chegaram — registro aqui o estado de hoje para ninguém
"corrigir" de volta.

| Onde          | Situação                                                            |
| ------------- | ------------------------------------------------------------------- |
| `EQUIPE`      | **6 pessoas reais.** Cinco com CROSP conferido, mais a recepção     |
| `DEPOIMENTOS` | **5 avaliações reais**, transcritas da ficha do Google              |
| Fundação      | Jeferson Barbosa e **Dra. Juliana Pelisser Barbosa — CROSP 75.159** |

Os CROs no ar: **177.801, 168.512, 175.851, 75.157, 162.394** e, na responsável
técnica, **75.159**. A carteira traz o número sem ponto (`SP-162394`); o ponto é
só de exibição.

> **Duas armadilhas neste assunto, as duas já cometidas aqui.**
>
> Havia um aviso `⚠️ FICTÍCIOS` sobre dois depoimentos que a clínica depois
> confirmou serem reais. A marcação estava errada, não o site — e ela me levou a
> remover duas avaliações verdadeiras do site publicado. Marcação de conteúdo
> falso tem de sair no instante em que o dado real chega; enquanto fica, ela
> mente para a próxima pessoa que abrir o arquivo.
>
> `Profissional.ficticio` **continua existindo e é lógica viva**: o
> `TeamSection` filtra a equipe por ele. Se um dia entrar alguém sem dado
> confirmado, é essa a marcação que mantém a pessoa fora do ar.

### Regras que o site precisa manter

- **CRO do responsável técnico no rodapé** — obrigatório, aparece nas 9 rotas
- **Sem "antes e depois"** — vedado na publicidade odontológica
- **Sem promessa de resultado** — todo bloco lembra que a indicação depende de avaliação profissional
- **Sem preço nem promoção** como atrativo

---

## Vídeos

Os 8 tratamentos têm animação explicativa. Cada uma é MP4 H.264 600×600, entre 30 KB e 280 KB.

O componente `TreatmentVideo` resolve três coisas:

1. **`preload="none"` + poster** — o arquivo só baixa quando o visitante rola até ele. Nenhum vídeo entra no carregamento inicial.
2. **`prefers-reduced-motion`** desliga o autoplay. Quem pediu menos movimento recebe o poster e decide.
3. **Botão de pausa** (WCAG 2.2.2) — em repouso cobre o vídeo convidando a tocar; tocando, encolhe para um canto.

Os clipes são mudos por natureza, então não há o que legendar. O que existe é `descricao`, que aparece ao lado do vídeo **e** serve de rótulo acessível.

---

## Deploy

```bash
npm run build
vercel deploy --prebuilt --prod
```

O build gera `.vercel/output` no formato Build Output API v3. `.vercel/` está no `.gitignore` — nunca versione, contém os IDs do projeto.

---

## Rotas

`/` · `/tratamentos/{limpeza-profilaxia, clareamento-dental, restauracoes, implantes-dentarios, proteses-dentarias, ortodontia, odontopediatria, harmonizacao-orofacial}`

Slug inexistente devolve **404 de verdade**, não 200 com tela de erro. Cada rota emite `title`, `description`, `og:*` e `canonical` próprios **no HTML servido** — o robô de preview do WhatsApp não roda JavaScript, e o WhatsApp é o canal de conversão.

---

## SEO

Cada rota emite `title`, `description`, `og:*` e `canonical` próprios **no HTML
servido** — o robô de preview do WhatsApp não roda JavaScript, e o WhatsApp é o
canal de conversão.

### O título começa pela busca, não pela marca

`src/lib/seo.ts` monta título e descrição dentro do que o Google **mostra** (60 e
155 caracteres). Antes todo título tinha 65 a 75 e toda descrição 164 a 228 — a
clínica escrevia um fim de frase que ninguém lia, e o corte caía dentro do nome
dela.

A ordem é a decisão: quem procura dentista digita _"implante dentário na
Freguesia do Ó"_, não o nome de uma clínica que ainda não conhece. O
procedimento e o bairro ocupam o começo; a marca fecha, e **encolhe até caber** —
"Restaurações" sobra espaço e leva o nome inteiro, "Harmonização orofacial" leva
o curto.

### Dados estruturados

`src/lib/dadosEstruturados.ts` monta o JSON-LD **a partir de `jp.ts`**, nunca
digitado:

| Onde            | Tipo                         |
| --------------- | ---------------------------- |
| Home            | `Dentist` + `FAQPage`        |
| Cada tratamento | `MedicalWebPage` + `FAQPage` |
| Cada vaga       | `JobPosting`                 |

O `Dentist` traz endereço, coordenadas, horário, CNPJ, a responsável técnica com
CRO e os 8 tratamentos.

**Não traz `aggregateRating`, e é decisão consciente.** A nota do Google aparece
para o visitante na página — é prova social legítima — mas não entra no schema
do próprio `Dentist`: as diretrizes do Google para LocalBusiness desaconselham
agregar avaliação de outro site, e avaliação sobre si mesmo não é elegível ao
rich result de estrelas. O schema fica no que a clínica pode declarar de forma
factual e verificável.

> Dado estruturado que **discorda** da página visível é pior que dado nenhum: o
> Google trata divergência como sinal de manipulação. Por isso sai tudo da mesma
> fonte — não há como divergir. E `foundingDate` vai em ISO 8601 (`2002-08-17`),
> não no formato que a página exibe: data errada o Google descarta em silêncio.

**Lighthouse de SEO: 100** em 11 das 12 rotas. A exceção é `/trabalhe-conosco`,
que é `noindex` de propósito — quem procura emprego deve cair em `/carreiras`.

---

## Acessibilidade

O site passou por auditoria WCAG 2.1 AA com contraste calculado, não estimado.

- Contorno de foco muda de cor conforme a superfície (escuro no claro, lime no escuro)
- Menu mobile com Escape, retorno de foco e `invisible` quando fechado
- Skip link em todas as rotas
- **Alvo de toque de 44px no site inteiro** via `.alvo-toque`, não só no cabeçalho
- **Piso de 12px em todo texto** (`--text-micro`)
- Vídeos com rótulo acessível e controle de pausa
- `prefers-reduced-motion` zera transição e animação, e desliga o autoplay
- Decoração de fundo é `aria-hidden` e `pointer-events-none` — nada disso chega ao leitor de tela

**Medido no site publicado, em 320, 390 e 1440px:** zero alvo abaixo de 44px,
zero texto abaixo de 12px, zero rolagem horizontal e **zero falha de contraste em
112 elementos**. Lighthouse de acessibilidade **100** nas 12 rotas.

> Contraste se mede pintando a cor num canvas e **lendo o pixel**. Parser por
> expressão regular mente com `oklch()`/`oklab()`, que é o que o Tailwind v4
> emite — cheguei a reportar 18 falhas que não existiam. Está detalhado em
> [DESIGN.md](DESIGN.md).

---

## Pendências

- [x] ~~Trocar as pessoas fictícias.~~ **Feito.** Equipe, fundação e depoimentos são reais; `grep -rn "ficticio: true" src` não devolve nada. A marcação `Profissional.ficticio` segue disponível para quem entrar sem dado confirmado.
- [x] ~~Confirmar a idade da clínica.~~ **Confirmado pela clínica em 14/08/2026: 24 anos, fundada em 17/08/2002.** O CNPJ de 2021 é da pessoa jurídica atual, não o início da clínica — está documentado em `HISTORIA` para ninguém "corrigir" o número achando que é erro.
- [ ] **Vincular o site à ficha do Google.** Hoje o Google mostra "Adicionar website" — é tráfego direto e gratuito sendo perdido.
- [x] ~~Trocar o domínio.~~ **Feito.** O site responde em `www.jpclinicaodontologica.com.br`; `SITE_URL` e o sitemap já apontam para lá.
- [ ] Páginas de **facetas**, **endodontia** e **periodontia** — os dois últimos estão na placa da clínica mas não no site, e há bom material de vídeo para os três.
