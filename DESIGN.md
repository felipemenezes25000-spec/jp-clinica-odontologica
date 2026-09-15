# Design system — JP Clínica Odontológica

> **Documento vivo, revisado em 15/09/2026.**
>
> Fonte visual executável: `src/styles.css` + componentes de `src/components/site/`. Fonte da marca: [`docs/marca/LEIA-ME.md`](docs/marca/LEIA-ME.md). Não use este arquivo para substituir a inspeção do CSS quando a implementação mudar.

## Princípios

1. confiança clínica antes de ornamentação;
2. CTA claro sem aparência promocional agressiva;
3. acessibilidade e contraste como regra de sistema;
4. dados públicos vêm de `src/lib/jp.ts`, não de texto duplicado;
5. a página orgânica informa e permite exploração; a LP paga reduz distrações sem esconder informação legal ou de confiança.

## Marca e cores

Cores oficiais extraídas dos materiais da clínica:

| Papel | Valor | Uso |
| --- | --- | --- |
| verde escuro | `#095902` | marca e texto forte em fundo claro |
| verde claro | `#56A805` | acento, borda, ícone e elementos de marca |
| verde profundo | `#032F01` | superfície escura derivada para obter contraste suficiente |

Tokens efetivos ficam em `src/styles.css`. Evite espalhar hexadecimais por componentes quando existir token semântico.

### Contraste

- `#56A805` não serve como texto em fundo claro;
- texto verde em fundo claro usa o verde escuro/token equivalente;
- superfícies escuras usam o verde profundo quando o lime precisa funcionar como texto/acento;
- estado não é comunicado só por cor;
- branco sobre verde claro não é regra universal: confirme contraste para texto corrente.

Os valores medidos detalhados pertencem ao CSS e ao material da marca. Não mantenha inventário manual de quantas declarações de cor existem: isso envelhece a cada alteração.

## Tipografia

- títulos: Manrope;
- corpo/interface: Inter;
- as fontes da logo (Bauhaus 93/Eras Bold ITC) pertencem ao desenho da marca, não ao texto do site;
- piso visual do site: evitar microtexto abaixo do sistema definido nos tokens;
- títulos usam hierarquia forte, mas devem continuar fluidos em mobile.

## Estrutura do site público

O site alterna superfícies claras e escuras para dar ritmo e manter leitura. A ordem concreta das seções vive em `src/routes/index.tsx`; não congele essa ordem em documentação como se fosse contrato.

Componentes reutilizáveis ficam em `src/components/site/`. Mudança visual global deve preferir token/componente compartilhado a correção isolada por rota.

## Cabeçalho

### Páginas orgânicas/home

Navegação completa, com acesso às principais seções e carreiras.

### `modo="anuncio"`

O cabeçalho é propositalmente enxuto:

- desktop: não monta a navegação principal da home;
- mobile: não monta os links de Clínica, Tratamentos, Equipe, Avaliações, Contato e Carreiras;
- mantém marca;
- mantém telefone;
- mantém WhatsApp/agendamento;
- mantém acessibilidade.

Esse comportamento tem teste E2E dedicado. Se o menu mobile voltar a exibir os links de fuga na LP paga, é regressão.

## Página de tratamento

`PaginaDeTratamento` é compartilhada por rota orgânica e rota paga.

### Orgânico

- conteúdo completo;
- navegação completa;
- link para todos os tratamentos;
- cross-sell ao final quando aplicável.

### Anúncio

- H1 com correspondência direta de procedimento + região;
- CTA específico do tratamento;
- localização na primeira dobra;
- prova social cedo;
- sem “Todos os tratamentos” no hero;
- sem cross-sell no final;
- cabeçalho enxuto em desktop e mobile;
- conteúdo clínico, rodapé, CRO, endereço e política permanecem.

Para implantes, a LP atual é `/implante-dentario` e a orgânica é `/tratamentos/implantes-dentarios`.

## CTAs

Prioridade:

1. WhatsApp/agendamento;
2. telefone quando útil;
3. navegação/informação;
4. links secundários.

Não transformar a clínica em varejo promocional. Evitar “últimas vagas”, “resultado garantido”, descontos artificiais e promessas clínicas absolutas.

## Prova social

Nota e quantidade de avaliações devem vir da fonte central do projeto. Não hardcode números em componentes de LP.

Depoimentos e avaliações não substituem orientação clínica. Mídia paga não deve ser estruturada em torno de inferência de condição de saúde do visitante.

## Equipe

A UI pública só deve render profissionais válidos/ativos. O filtro atual também impede placeholders e registros fictícios de aparecerem.

Não crie bloco “especialista em implantes” até existir informação verificável de nome, CRO, qualificação e foto autorizada.

## Imagens e vídeo

- usar ativos reais da clínica quando possível;
- preservar proporção e evitar crop que descaracterize ambiente/profissional;
- poster de vídeo deve permitir carregamento previsível;
- imagens não podem carregar informação essencial que não exista em texto/alt;
- ativos de marca são gerados a partir da fonte documentada em `docs/marca/`.

## Acessibilidade

- um H1 por página;
- `SkipLink` preservado;
- foco visível;
- navegação por teclado;
- `aria-label` em controles sem texto;
- estado acompanhado por texto/ícone, não apenas cor;
- CTAs continuam funcionais com consentimento de analytics recusado;
- banner de consentimento não pode bloquear o CTA essencial.

## RH e CRC

O design do site não deve vazar regras de interface administrativa.

- `/rh` possui escopo visual próprio via `rh-admin`;
- `/crc` possui CSS/tokens próprios e isolamento sob o app do CRC;
- mudanças de tokens globais precisam ser verificadas contra os três produtos.

## SEO e SSR

O conteúdo crítico — principalmente H1 da LP — deve existir no HTML servido, não só depois da hidratação. O E2E público verifica isso.

LPs pagas usam canonical para a rota orgânica correspondente. Não duplique uma página “v2” só para mudar copy de anúncio: use o modo já existente.

## Testes visuais/comportamentais

O design tem invariantes automatizados em Playwright, entre eles:

- H1/SSR da LP;
- conteúdo de implante + Freguesia do Ó;
- CTA específico;
- prova social/localização;
- ausência de cross-sell na LP;
- cabeçalho enxuto;
- menu mobile enxuto;
- CTA funcional sem GTM/Pixel e com consentimento recusado.

Execute:

```bash
npm run e2e:site
```

## Regra de manutenção

Quando comportamento visual muda, atualize este arquivo apenas se a mudança for uma **regra do sistema**. Detalhes efêmeros — contagem de cards, quantidade de declarações CSS, tamanho exato de bundle — pertencem ao código, ao teste ou ao build, não a este documento.