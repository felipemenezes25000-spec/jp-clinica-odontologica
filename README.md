# JP Clínica Odontológica

Site institucional da **JP Clínica Integrada Odontológica** — Rua Rio Verde, 1029, Vila Bruna, região da Freguesia do Ó, São Paulo.

🔗 **[jp-clinica-odontologica-award-final.vercel.app](https://jp-clinica-odontologica-award-final.vercel.app)**

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
├── lib/jp.ts                    ← FONTE ÚNICA DE VERDADE
├── routes/
│   ├── __root.tsx               shell, metatags globais, 404 e erro
│   ├── index.tsx                home (9 seções)
│   └── tratamentos/$slug.tsx    as 8 páginas de tratamento
├── components/site/             componentes próprios
└── assets/                      fotos e vídeos
```

### Os três sistemas que moram neste repo

| Rota   | O que é                                              | Documentação                           |
| ------ | ---------------------------------------------------- | -------------------------------------- |
| `/`    | O site institucional. É o que este README descreve.  | aqui                                   |
| `/rh`  | Portal de RH: vagas, candidaturas, triagem por IA.   | [docs/PORTAL-RH.md](docs/PORTAL-RH.md) |
| `/crc` | JP CRC OS: CRM, automação de recuperação e cobrança. | [docs/crc/](docs/crc/)                 |

Os três compartilham build, domínio e Supabase, e nada mais: as tabelas do CRC
têm prefixo `crc_`, o CSS dele vive inteiro sob `.crc-app`, e nenhum arquivo do
site foi alterado para ele existir.

**Para colocar o CRC no ar**, comece por
[docs/crc/ATIVACAO-EM-PRODUCAO.md](docs/crc/ATIVACAO-EM-PRODUCAO.md) — o passo a
passo de SQL, variáveis, credenciais e ordem de ativação. Os outros três
documentos são
[ROTEIRO-DA-EQUIPE](docs/crc/ROTEIRO-DA-EQUIPE.md) (**a rotina de quem opera** —
cinco minutos, para a recepção ler no primeiro dia),
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

### Piso de 11px na tipografia

Havia 34 elementos abaixo de 11px, sendo 10 a **8px** — caixa alta com `tracking` largo nesse tamanho é ilegível para muita gente. Todos subiram para 11px. Onde o texto passou a não caber, a solução foi reduzir o `tracking`, não voltar a diminuir a fonte.

O site usa duas famílias: **Manrope** nos títulos (`font-display`) e **Inter** no resto.

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

### O intervalo entre seções é uma soma, não um valor

O espaço que se vê entre duas seções é o `padding-bottom` de uma **mais** o `padding-top` da seguinte. `.jp-section` vale 4,5rem de cada lado, então o intervalo real é **144px**, não 72px.

Quem for apertar ou afrouxar a respiração do site mexe só nessa classe. Antes havia três escalas convivendo (`py-20/28/36`, `py-24/32` e `.jp-section`), o intervalo variava de 240 a 288px e cada seção tinha a régua do dia em que foi escrita. Se aparecer um `py-*` num `<section>`, é regressão.

---

## Conteúdo: o que é real e o que não é

Isto não é detalhe de implementação. É uma clínica de saúde real e a publicidade odontológica é regulada (**Resolução CFO 196/2019**).

| Elemento                | Origem                                                                      |
| ----------------------- | --------------------------------------------------------------------------- |
| Imagens dos ambientes   | **Versões geradas por IA** a partir das fotos reais da clínica — ver abaixo |
| Texto dos depoimentos   | **Avaliações reais do Google**, com o nome como aparece lá                  |
| Nota e volume           | **4,5★ · 176 avaliações**, conferido na ficha do Google                     |
| Missão                  | **Transcrita do quadro** afixado na parede da clínica                       |
| 7 dos 8 vídeos          | Acervo da própria clínica                                                   |
| Vídeo de clareamento    | Pexels (licença livre para uso comercial)                                   |
| **Retratos de pessoas** | **Fictícios** — ver abaixo                                                  |

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

### ⚠️ As 8 pessoas fictícias

O site **exibe hoje 8 rostos de pessoas que não existem**, gerados por um gerador de faces, marcados com `ficticio: true` no código:

| Onde          | Quantos                         | Arquivo                                  |
| ------------- | ------------------------------- | ---------------------------------------- |
| `EQUIPE`      | 4 de 5 (CRO-SP 00.002 a 00.005) | `src/lib/jp.ts`                          |
| `DEPOIMENTOS` | 2 de 5 avatares                 | `src/lib/jp.ts`                          |
| `FUNDADORES`  | 2 (CRO-SP 00.006 e 00.007)      | `src/components/site/HistorySection.tsx` |

São **preenchimento de layout**, colocados a pedido para a clínica ver a diagramação pronta. Os CROs usam o formato `00.00X`, que nenhum registro verdadeiro tem — é proposital, para o número falso ser reconhecível de imediato.

> **Nada disso pode ir ao ar.** Divulgar profissional com CRO inventado é infração ao CFO, e um depoimento com rosto fabricado é publicidade enganosa. Buscar por `ficticio: true` lista tudo que falta trocar.
>
> A única pessoa real no site é a **Dra. Juliana Pelisser (CROSP 78.159)**, responsável técnica.

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

## Acessibilidade

O site passou por auditoria WCAG 2.1 AA com contraste calculado, não estimado.

- Contorno de foco muda de cor conforme a superfície (escuro no claro, lime no escuro)
- Menu mobile com Escape, retorno de foco e `invisible` quando fechado
- Skip link em todas as rotas
- Alvos de toque de 44px no cabeçalho (WCAG 2.5.8 com folga)
- Vídeos com rótulo acessível e controle de pausa
- Decoração de fundo é `aria-hidden` e `pointer-events-none` — nada disso chega ao leitor de tela

---

## Pendências

- [ ] 🔴 **Trocar as 8 pessoas fictícias antes de divulgar** — equipe, fundadores e dois avatares de depoimento. Nome, CRO **conferido** e foto recortada com fundo transparente de cada profissional. `grep -rn "ficticio: true" src` lista todas.
- [x] ~~Confirmar os 23 anos.~~ **Confirmado pela clínica em 09/08/2026: 23 anos, desde 2003.** O CNPJ de 2021 é da pessoa jurídica atual, não o início da clínica — está documentado em `HISTORIA` para ninguém "corrigir" o número achando que é erro.
- [ ] **Vincular o site à ficha do Google.** Hoje o Google mostra "Adicionar website" — é tráfego direto e gratuito sendo perdido.
- [ ] **Trocar o domínio.** Ao migrar, atualizar `SITE_URL` em `jp.ts` e as URLs de `public/sitemap.xml`.
- [ ] Páginas de **facetas**, **endodontia** e **periodontia** — os dois últimos estão na placa da clínica mas não no site, e há bom material de vídeo para os três.
