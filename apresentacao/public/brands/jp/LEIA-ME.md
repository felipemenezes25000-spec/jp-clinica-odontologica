# Marca JP — arquivos reais

Estes quatro SVGs **são a marca oficial da clínica**, copiados de
`src/assets/marca/` do site (que por sua vez saem dos `.eps` entregues pela JP,
via `scripts/gerar-marca.py`). Não são placeholder e não devem ser redesenhados.

| Arquivo               | Quando usar                                         |
| --------------------- | --------------------------------------------------- |
| `logo-jp.svg`         | Lockup horizontal sobre **superfície clara**        |
| `logo-jp-claro.svg`   | Lockup horizontal sobre **superfície escura**       |
| `marca-jp.svg`        | Só o símbolo (dente + JP), superfície clara         |
| `marca-jp-claro.svg`  | Só o símbolo, superfície escura                     |

O nome da variante diz a cor da **superfície**, não a da arte — mesma convenção
do componente `Logo` do site.

## Se a clínica entregar um EPS novo

Rode `python scripts/gerar-marca.py` na raiz do site e copie os quatro SVGs
gerados para cá:

```bash
cp src/assets/marca/*.svg apresentacao/public/brands/jp/
```

As proporções estão em `src/data/marcas.ts` e vêm do `viewBox` de cada arquivo:
lockup `215.3945 × 73.9942`, símbolo `50.222 × 53.2834`. Se o viewBox mudar,
atualize lá — é o que impede a marca de esticar.
