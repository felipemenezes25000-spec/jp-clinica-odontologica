# Tour institucional do JP CRC

Uma apresentação audiovisual de 4:33 sobre o que o JP CRC faz, com narração em
português e legenda sincronizada. Existe em dois formatos, gerados do **mesmo
código**:

| Formato | Onde                                                     |
| ------- | -------------------------------------------------------- |
| Web     | `https://www.jpclinicaodontologica.com.br/crc-institucional` |
| Vídeo   | `apresentacao/out/jp-crc-1080p.mp4` (1920×1080, 30 fps)   |

## Onde está o quê

```
apresentacao/                     o código-fonte (sub-projeto isolado)
public/crc-tour/                  o app construído, servido como estático
src/routes/crc-institucional.tsx  a página do site que o exibe
```

O sub-projeto tem `package.json`, `tsconfig` e ferramentas próprios. Ele **não é
importado pelo bundle do site** — decisão tomada por causa do
[INCIDENTE-BUILD-500](../INCIDENTE-BUILD-500.md).

## Atualizar

```bash
npm run tour:build     # na raiz do site
```

Constrói `apresentacao/` para `public/crc-tour/`. **Comite a pasta**: o build da
Vercel roda só o `vite build` da raiz e não entra no sub-projeto.

## Documentação completa

Está dentro de `apresentacao/`:

| Arquivo             | Assunto                                             |
| ------------------- | --------------------------------------------------- |
| `README.md`         | Visão geral, comandos, tarefas comuns               |
| `STORYBOARD.md`     | As 31 cenas, uma a uma                              |
| `CONTENT.md`        | Editar textos, números, narração e voz              |
| `MOTION-SYSTEM.md`  | Como a animação funciona (e o que ela proíbe)       |
| `RENDERING.md`      | Gerar o MP4                                         |
| `ASSETS.md`         | Logos, fotos e áudio                                |
| `PUBLICACAO.md`     | Como o tour chega ao site                           |

## O que a peça cobre

Dental Office → integração → JP CRC → quem precisa de contato → o que roda
sozinho (**faltas, retorno, pacientes antigos, campanhas, aniversariantes,
lembretes de consulta, cobrança de parcela em atraso**) → WhatsApp e IA →
agendamento → quando a equipe entra → as telas do produto → resultados.

## O que ela não afirma

- Nenhum percentual de aumento de receita.
- Nenhum número é real: todos vêm de `apresentacao/src/data/metricas.ts` com o
  carimbo "Exemplo ilustrativo" na tela. Trocar por dado da clínica é editar
  aquele arquivo e virar `ILUSTRATIVO` para `false`.
- Nenhum paciente é real. Maria Souza, João Lima, Ana Costa e Carlos Antunes são
  fictícios.
