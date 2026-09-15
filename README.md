# JP Clínica Odontológica

> **Documentação principal revisada em 15/09/2026.**
>
> Este README descreve o HEAD atual. Para navegar por toda a documentação, use [`docs/README.md`](docs/README.md). Documentos de auditoria, aceite, roadmap e post-mortem preservam o estado da época e não devem ser tratados como fonte do comportamento atual.

Repositório da **JP Clínica Integrada Odontológica**, reunindo quatro frentes no mesmo projeto:

1. site institucional e páginas de tratamentos;
2. aquisição/analytics para mídia paga;
3. Portal de RH;
4. JP CRC OS, com seu tour institucional separado em `apresentacao/`.

Site: **https://www.jpclinicaodontologica.com.br**

## Clínica — dados públicos centrais

A fonte de verdade é `src/lib/jp.ts`. Não copie telefone, endereço, avaliação ou equipe para JSX ou documentação operacional.

- endereço: R. Rio Verde, 1029, Vila Bruna, São Paulo-SP, região da Freguesia do Ó;
- telefone: `(11) 3975-9902`;
- WhatsApp: `(11) 97616-5117`;
- atendimento: segunda a sexta, 08:00–18:00;
- responsável técnica: Dra. Juliana Pelisser Barbosa — CROSP 75.159;
- fundação: 17/08/2002 — 24 anos em 2026;
- prova social exibida atualmente: 4,6 no Google, 192 avaliações.

A seção pública de equipe filtra placeholders, registros fictícios e membros inativos no ponto de exibição. Não publique profissional de um tratamento específico sem dado verificável.

## Rodando localmente

```bash
npm ci
npm run dev
```

Scripts do `package.json`:

| Comando | Função |
| --- | --- |
| `npm run dev` | desenvolvimento com Vite |
| `npm run build` | build de produção com Vite + Nitro |
| `npm run preview` | preview do build |
| `npm run lint` | ESLint |
| `npm run format` | Prettier |
| `npm run typecheck` | TypeScript sem emissão |
| `npm run test` | testes unitários/contratuais com Vitest |
| `npm run test:integracao` | testes que exigem infraestrutura de integração |
| `npm run e2e` | Playwright do CRC |
| `npm run e2e:site` | Playwright do site público e funil pago, sem banco |
| `npm run schema:status` | verifica estado das migrations |
| `npm run schema:aplicar` | aplica schema conforme o script do projeto |
| `npm run check` | lint + typecheck + test + build |
| `npm run tour:build` | build do subprojeto `apresentacao/` |

Não fixe em documentação viva a quantidade de testes, arquivos ou tabelas: esses números mudam a cada commit. O CI é a fonte para a execução atual.

## Stack

- React 19.2;
- TanStack Start + TanStack Router;
- TanStack Query;
- TypeScript 5.8 em modo estrito;
- Tailwind CSS 4 via `@tailwindcss/vite`;
- Vite 8;
- Nitro com saída para Vercel;
- Vitest;
- Playwright.

O subprojeto `apresentacao/` usa React, Vite e Remotion e possui `package.json` próprio.

## Organização

```text
src/
├── components/
│   ├── site/            site público
│   ├── rh/              painel e fluxos de RH
│   └── crc/             interface do JP CRC
├── lib/
│   ├── jp.ts            dados públicos centrais da clínica
│   ├── analytics/       atribuição, eventos, consentimento e rotas pagas
│   ├── rh/              domínio/aplicação do RH
│   └── crc/             domínio, aplicação, automação, integrações e servidor do CRC
├── routes/              TanStack file-based routing
└── styles.css           tokens e estilos globais

docs/
├── README.md            índice de documentação
├── ANUNCIAR.md          mídia paga e analytics
├── PORTAL-RH.md         RH
├── crc/                 documentação do CRC
└── marca/               fonte e regras da marca

supabase/                 schema e migrations
scripts/                  validações e utilitários
apresentacao/             tour/vídeo do CRC
```

`src/routes/routeTree.gen.ts` é gerado. Não edite manualmente. Convenções: [`src/routes/README.md`](src/routes/README.md).

## Sistemas e rotas

| Área | Rotas principais | Documento |
| --- | --- | --- |
| Site | `/`, `/tratamentos/*` | este README + [`DESIGN.md`](DESIGN.md) |
| LPs de mídia | `/implante-dentario` e outras 7 rotas curtas | [`docs/ANUNCIAR.md`](docs/ANUNCIAR.md) |
| Carreiras | `/carreiras`, `/carreiras/<slug>`, `/trabalhe-conosco` | [`docs/PORTAL-RH.md`](docs/PORTAL-RH.md) |
| RH interno | `/rh` | [`docs/PORTAL-RH.md`](docs/PORTAL-RH.md) |
| CRC | `/crc` | [`docs/crc/README.md`](docs/crc/README.md) |
| Tour CRC | `/crc-institucional` | [`apresentacao/README.md`](apresentacao/README.md) |

`/crc-vitrine` é ferramenta de demonstração/desenvolvimento; não use como rota operacional do CRC.

## Site e mídia paga

Existem oito pares de páginas: uma rota orgânica e uma rota curta para campanha. As rotas de anúncio reutilizam `PaginaDeTratamento` com `modo="anuncio"`.

O modo anúncio atualmente:

- mantém marca, CRO, endereço, prova social, política, telefone e WhatsApp;
- usa H1 com tratamento + Freguesia do Ó;
- torna o CTA específico do tratamento;
- mostra localização e prova social cedo;
- remove o link “Todos os tratamentos” do hero;
- remove o cross-sell de outros tratamentos;
- remove a navegação da home no cabeçalho desktop;
- remove também os links de fuga do menu mobile, preservando telefone e WhatsApp.

Fluxo inicial de implantes:

```text
Google Search → /implante-dentario → WhatsApp → recepção humana
```

O CRC **não é pré-requisito** para iniciar mídia paga.

### Analytics

A conversão comercial primária é `generate_lead`. O site também possui eventos auxiliares como `contact_click`, `phone_click`, `treatment_view`, `form_start`, `form_submit`, `map_click`, `review_click`, `career_view` e `career_apply`.

A atribuição captura UTMs e identificadores de clique suportados, mantém contexto por sessão e acrescenta uma referência curta à mensagem do WhatsApp sem expor o `gclid` bruto.

GTM e Meta Pixel são opcionais por ambiente:

```text
VITE_GTM_ID
VITE_META_PIXEL_ID
```

Esses IDs são públicos por natureza. Segredos, tokens de API e credenciais server-side **nunca** recebem prefixo `VITE_`.

O código estar pronto não significa que GTM, GA4, Google Ads ou Meta estejam configurados na produção. Valide os containers e eventos reais antes de investir campanha.

Detalhes: [`docs/ANUNCIAR.md`](docs/ANUNCIAR.md).

## Consentimento

O site inicializa Consent Mode v2 com os sinais de armazenamento/publicidade negados e permite atualização após a escolha do visitante. Recusar medição não bloqueia o WhatsApp.

No modo avançado, ferramentas compatíveis podem emitir sinais sem cookies para modelagem agregada mesmo com armazenamento negado; isso não equivale a consentimento para cookies, personalização ou remarketing.

## Portal de RH

O Portal de RH atende o fluxo público de vagas e o painel interno. A IA é apoio à decisão, não decisão automática. Cálculos objetivos permanecem em TypeScript e dados sensíveis não devem entrar na nota.

Na Vercel, armazenamento persistente deve usar o backend configurado para banco/storage; filesystem de função não é fonte persistente.

Detalhes: [`docs/PORTAL-RH.md`](docs/PORTAL-RH.md).

## JP CRC OS

O Dental Office permanece o sistema clínico; o CRC adiciona relacionamento, oportunidades, jornadas, mensageria, automações, IA, gestão e operação em torno dele.

A documentação do CRC é extensa e contém snapshots históricos. Use esta ordem de confiança:

1. código, testes e migrations;
2. [`docs/crc/CRC-MAPA-DO-SISTEMA.md`](docs/crc/CRC-MAPA-DO-SISTEMA.md), gerado do código;
3. [`docs/crc/ATIVACAO-EM-PRODUCAO.md`](docs/crc/ATIVACAO-EM-PRODUCAO.md);
4. [`docs/crc/RUNBOOK.md`](docs/crc/RUNBOOK.md);
5. demais ADRs/auditorias/aceites como registro da época.

Índice: [`docs/crc/README.md`](docs/crc/README.md).

## CI

Workflows atuais em `.github/workflows/`:

- `quality.yml` — lint, typecheck, testes, build, verificação do bundle e E2E público;
- `crc-integracao.yml` — schema/tenant/concorrência/recovery e navegador do CRC;
- `crc-pulso.yml` — execução programada/manual do pulso;
- `crc-smoke.yml` — smoke do CRC;
- `supply-chain.yml` — controles de dependências/segurança.

Não copie nomes de jobs de um snapshot de auditoria para branch protection sem conferir o workflow atual: nomes de checks são strings e podem mudar.

## Documentação

A política de documentação está em [`docs/README.md`](docs/README.md). Em resumo:

- documento **vivo** acompanha o HEAD;
- documento **gerado** é regenerado pelo script correspondente;
- documento **histórico** preserva data/commit e não deve ser reescrito para parecer atual;
- números voláteis devem vir de comando, teste ou configuração, não de prosa.

## Segurança

- segredos ficam apenas no servidor;
- não exponha `SUPABASE_SERVICE_ROLE`, chaves de provedores, tokens CAPI ou credenciais do Dental Office ao cliente;
- nenhuma variável secreta deve começar por `VITE_`;
- dados de paciente/candidato não devem entrar em analytics do site;
- mantenha isolamento entre site, RH e CRC.

## Validação mínima

```bash
npm ci
npm run lint
npm run typecheck
npm run test
npm run build
npm run e2e:site
```

Mudanças do CRC que dependam de Postgres devem passar também pelos testes/gates de integração descritos em `docs/crc/README.md`.