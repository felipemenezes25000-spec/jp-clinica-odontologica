# n8n — logo ausente

Sem arquivo oficial no repositório. A peça desenha, no lugar, um pequeno grafo de
nós (três nós ligados) em coral — uma representação do que a ferramenta faz, não
uma imitação do logotipo dela.

## Como colocar o arquivo real

1. Pegue o asset em <https://n8n.io/press/> e salve **nesta pasta**, por exemplo
   `n8n.svg`.
2. Preencha a entrada `n8n` em `src/data/marcas.ts`:

   ```ts
   n8n: {
     nome: "n8n",
     arquivo: "/brands/n8n/n8n.svg",
     proporcao: 120 / 40,
     acento: cor.n8n,
   }
   ```

Nenhum componente muda.
