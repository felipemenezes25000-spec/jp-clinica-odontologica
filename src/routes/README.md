# Rotas — TanStack Start

> **Revisado em 15/09/2026.**

O projeto usa file-based routing do TanStack Router/Start. Arquivos em `src/routes/` definem rotas. Não crie estruturas de Next.js/Remix como `src/pages`, `app/layout.tsx` ou `_app`.

`__root.tsx` é o shell raiz e precisa preservar o `<Outlet />`.

`routeTree.gen.ts` é gerado automaticamente. **Não editar à mão.**

## Convenções

| Arquivo | URL |
| --- | --- |
| `index.tsx` | `/` |
| `tratamentos/$slug.tsx` | `/tratamentos/:slug` |
| `carreiras/index.tsx` | `/carreiras` |
| `carreiras/$slug.tsx` | `/carreiras/:slug` |
| `crc.tsx` + `crc/*` | `/crc...` |
| `api/*` | endpoints server-side |
| `$.tsx` | splat quando usado pelo padrão do Router |

Parâmetro dinâmico usa `$nome`, sem chaves.

## Rotas públicas importantes

### Site

- `/`;
- `/politica-de-privacidade`;
- `/tratamentos/<slug>`;
- `/carreiras` e páginas de vaga.

### Mídia paga

As rotas curtas são finas e reutilizam a página do tratamento em `modo="anuncio"`:

- `/implante-dentario`;
- `/protese-dentaria`;
- `/ortodontia`;
- `/clareamento-dental`;
- `/odontopediatria`;
- `/restauracao-dentaria`;
- `/limpeza-dental`;
- `/harmonizacao-facial`.

O mapeamento técnico entre rota e slug vive em `src/lib/analytics/rotas.ts`. Não mantenha uma segunda tabela de mapeamento no código.

As LPs de anúncio devem manter canonical para a rota orgânica correspondente.

## RH e CRC

- `/rh` é painel interno de RH;
- `/crc` é JP CRC OS;
- `/crc-institucional` hospeda a entrada do tour institucional;
- `/crc-vitrine` é demonstração/desenvolvimento, não rota operacional.

Endpoints sensíveis ficam em rotas server-side e não devem importar segredo no bundle do cliente.

## Analytics

`__root.tsx` monta a infraestrutura global de consentimento/tracking do site. As rotas não devem disparar `gtag`/Pixel de forma ad hoc; use a camada em `src/lib/analytics/`.

## Ao criar rota nova

1. defina se é pública, interna ou endpoint;
2. defina indexação/canonical quando aplicável;
3. não duplique dados de `src/lib/jp.ts`;
4. não importe módulo server-only em componente cliente;
5. rode typecheck/build;
6. se afetar aquisição, atualize E2E público e `docs/ANUNCIAR.md`.

```bash
npm run typecheck
npm run build
npm run e2e:site
```