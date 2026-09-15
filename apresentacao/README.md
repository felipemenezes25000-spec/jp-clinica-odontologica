# JP CRC — tour interativo e vídeo

> **Documento principal do subprojeto, revisado em 15/09/2026.**
>
> Este subprojeto é isolado do bundle principal. Ele gera o tour servido pelo site e os materiais de vídeo do CRC. Quantidade/duração de cenas vem dos arquivos de dados do próprio subprojeto; não congele esses números neste README.

## Destinos

- tour interativo publicado em `public/crc-tour/` e acessado pela experiência `/crc-institucional`;
- vídeo renderizável via Remotion;
- thumbnail/capa;
- roteiro/narração/trilha gerados pelos scripts locais.

## Rodando

Dentro de `apresentacao/`:

```bash
npm ci
npm run dev
npm run check
```

Scripts atuais do subprojeto:

```bash
npm run build
npm run preview
npm run typecheck
npm run check
npm run video:preview
npm run video:render
npm run video:leve
npm run video:render:vertical
npm run video:thumbnail
npm run video:frame
npm run cenas:ordenar
npm run narracao
npm run trilha
npm run audio:conferir
```

A ordem `narracao` → `trilha` deve ser preservada quando a trilha depende dos tempos da voz.

No repositório raiz, `npm run tour:build` delega o build para este subprojeto.

## Organização

```text
src/
├── data/           conteúdo, cenas, métricas e narração
├── design-system/  linguagem visual da peça
├── motion/         matemática de movimento
├── components/     blocos visuais
├── scenes/         cenas
├── film/           composição do filme por frame
├── interactive/    player/tour
└── remotion/       composições de vídeo

scripts/            geração/validação de áudio, cena e exportação
out/                artefatos locais gerados
```

A regra central permanece: o quadro deve ser determinístico em função do tempo/frame. Evite lógica que dependa de `Date.now()`, `setTimeout` ou estado temporal não reproduzível dentro do palco do filme.

## Documentação do subprojeto

| Arquivo | Papel |
| --- | --- |
| `CONTENT.md` | linguagem e conteúdo da apresentação |
| `STORYBOARD.md` | sequência narrativa/cenas |
| `ASSETS.md` | ativos e origem |
| `MOTION-SYSTEM.md` | movimento/transições |
| `RENDERING.md` | render/exportação |
| `PUBLICACAO.md` | publicação |

Esses arquivos descrevem a peça audiovisual, não o estado técnico completo do CRC. Para produto atual, use [`../docs/crc/README.md`](../docs/crc/README.md) e o mapa gerado.

## Conteúdo e dados

A apresentação não deve apresentar número fictício como resultado real da clínica. Quando o dado for ilustrativo, a peça deve deixá-lo explícito. Métricas reais só entram com fonte e escopo definidos.

Também não deve prometer percentual de receita/recuperação sem evidência. Mostre mecanismo, fluxo e capacidade; resultado financeiro depende de uso, base, operação e conversão clínica.

## Marcas de terceiros

Use ativos oficiais apenas quando houver direito/arquivo apropriado. Não desenhe uma marca de terceiro como se fosse oficial. A marca da JP segue `docs/marca/` no projeto raiz.

## Relação com o produto

A apresentação pode ficar desatualizada mesmo com o CRC funcionando corretamente. Antes de uso comercial externo:

1. compare afirmações do roteiro com o CRC atual;
2. confira integrações realmente ativas;
3. remova números que pertençam a demonstração antiga;
4. rode `npm run check`;
5. regenere o build/tour e, se necessário, vídeo/thumbnail.

## Publicação

O build deve continuar isolado do app principal; o site consome o artefato estático publicado, não importa o código do Remotion/player no bundle do paciente.

Detalhes operacionais permanecem em [`PUBLICACAO.md`](PUBLICACAO.md).