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

| Comando | O que faz |
| --- | --- |
| `npm run dev` | Servidor de desenvolvimento com HMR |
| `npm run build` | Build de produção (Nitro → `.vercel/output`) |
| `npm run preview` | Serve o build localmente |
| `npm run lint` | ESLint + Prettier |
| `npm run format` | Aplica a formatação |

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
│   ├── index.tsx                home (13 seções)
│   └── tratamentos/$slug.tsx    as 8 páginas de tratamento
├── components/site/             componentes próprios
└── assets/                      fotos e vídeos
```

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

### `--primary-ink` existe por acessibilidade

O verde `--primary` mede **3,7:1 sobre branco** — reprova no WCAG AA para texto pequeno. `--primary-ink` é o mesmo matiz um passo mais escuro, medindo **6,1:1**. Use `--primary` só em texto grande (≥18,66px em negrito); qualquer coisa menor usa `--primary-ink`.

### O menu mobile é a navegação do celular

A nav horizontal só aparece em `xl` (≥1280px). Abaixo disso, **o painel do menu é o único caminho** para telefone e WhatsApp. Ele tem `overflow-y-auto` e prende o foco (`role="dialog"`, Escape fecha, Tab circula). Mexer nisso sem cuidado derruba a conversão no celular inteiro.

---

## Conteúdo: o que é real e o que não é

Isto não é detalhe de implementação. É uma clínica de saúde real e a publicidade odontológica é regulada (**Resolução CFO 196/2019**).

| Elemento | Origem |
| --- | --- |
| Todas as fotos do site | **Fotos da própria clínica** — fachada, consultórios, esterilização, equipo, quadro da missão |
| Depoimentos | **Avaliações reais do Google**, com o nome como aparece lá |
| Nota e volume | **4,5★ · 176 avaliações**, conferido na ficha do Google |
| Missão | **Transcrita do quadro** afixado na parede da clínica |
| 7 dos 8 vídeos | Acervo da própria clínica |
| Vídeo de clareamento | Pexels (licença livre para uso comercial) |

**Nada é gerado por IA. Nada é foto de banco fazendo passar por real.**

### Regras que o site precisa manter

- **CRO do responsável técnico no rodapé** — obrigatório, aparece nas 9 rotas
- **Sem "antes e depois"** — vedado na publicidade odontológica
- **Sem promessa de resultado** — todo bloco lembra que a indicação depende de avaliação profissional
- **Sem preço nem promoção** como atrativo

> ⚠️ **Nunca publique um profissional sem CRO confirmado.** Os cards marcados com `placeholder: true` em `EQUIPE` são vagas a preencher, não pessoas.

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
- Menu mobile com foco preso, Escape e retorno de foco
- Skip link em todas as rotas
- Marquee pausa no hover **e** no foco; a segunda passada é `aria-hidden` para não duplicar no leitor de tela
- Vídeos com rótulo acessível e controle de pausa

---

## Pendências

- [ ] **Confirmar os 23 anos.** O CNPJ é de 21/06/2021 e uma avaliação diz "há mais de 3 anos". Pode ser reabertura sob novo CNPJ. É um número em `jp.ts`.
- [ ] **Completar a equipe** — nome, formação, especialidade, CRO e foto **recortada com fundo transparente** de cada profissional.
- [ ] **Vincular o site à ficha do Google.** Hoje o Google mostra "Adicionar website" — é tráfego direto e gratuito sendo perdido.
- [ ] **Trocar o domínio.** Ao migrar, atualizar `SITE_URL` em `jp.ts` e as URLs de `public/sitemap.xml`.
- [ ] Páginas de **facetas**, **endodontia** e **periodontia** — os dois últimos estão na placa da clínica mas não no site, e há bom material de vídeo para os três.
