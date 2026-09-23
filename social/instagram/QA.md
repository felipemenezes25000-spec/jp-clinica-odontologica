# QA — conferência antes de publicar

> Duas camadas: o que o computador confere sozinho, e o que só o olho pega.

---

## 1. A camada automática

```bash
node social/instagram/source/scripts/conferir.mjs
```

Sai com código 1 se houver erro. Onze checagens, todas escolhidas por um critério: **se falharem, o problema só aparece depois de publicado.**

| #   | Checagem                                                 | O que ela impede                                                               |
| --- | -------------------------------------------------------- | ------------------------------------------------------------------------------ |
| 1   | ativos proibidos nos campos de foto                      | publicar banco de imagem como se fosse a recepção da JP                        |
| 2   | expressões vedadas no texto publicado                    | "sem dor", "resultado garantido", "últimas vagas", "especialista em implantes" |
| 3   | a frase proibida de localidade                           | "24 anos na Freguesia do Ó" — a clínica nasceu em Pirituba                     |
| 4   | todo CRO citado existe em `src/lib/jp.ts`                | publicar número de inscrição errado                                            |
| 5   | todo telefone bate com `src/lib/jp.ts`                   | o WhatsApp da placa antiga vazar para uma peça                                 |
| 6   | todo `{{token}}` resolve                                 | `{{avaliacoes.nota}}` impresso numa arte                                       |
| 7   | toda foto citada existe em disco                         | retângulo menta no lugar da foto                                               |
| 8   | todo PNG tem 1080×1350, 1080×1080 ou 1080×1920           | export com medida errada                                                       |
| 9   | nomenclatura minúscula, sem acento, com prefixo `jp_ig_` | arquivo que ninguém acha em seis meses                                         |
| 10  | todo MP4 tem `.srt` ao lado                              | Reel sem legenda                                                               |
| 11  | todo MP4 tem trilha e é mais novo que o motor e a trilha | publicar vídeo mudo, ou feito antes da última correção do motor                |

A checagem 2 é a que mais pega coisa boa. Ela olha **só o texto que vira pixel** — a `descricao` de um manifest pode (e deve) escrever "aqui não se usa promoção" sem que o verificador acuse a própria regra.

### O renderizador também confere

`renderizar.mjs` reporta, por peça:

- **transbordo** — o conteúdo ficou maior que a peça mesmo depois do auto-ajuste;
- **vazamento** — algum elemento saiu da moldura.

Transbordo depois do auto-ajuste significa que o problema é a **copy**, não o layout. Corte palavras.

### O gerador de vídeo também confere

`gerar-videos.mjs --conferir` monta os 34 roteiros no motor, sem gravar nenhum quadro, e acusa:

- **pouco tempo de leitura**: a cena termina de entrar a menos de 1 s do corte;
- **viúva**: a última palavra de uma linha do título, com até 4 letras, quebrando sozinha para baixo ("Freguesia do / Ó.");
- **bairro partido**: "do" numa linha e "Ó" na outra, em qualquer texto do vídeo;
- **área segura**: conteúdo da cena acima de 280 px ou abaixo de 1452 px, onde moram o nome do perfil, a legenda e os botões;
- **ilustração cortada**: o desfecho do desenho (a coroa assentando, o visto aparecendo) acontecendo depois que a próxima cena começa a entrar.

Para olhar, não só medir: `--quadros=0,0.8,1.3,…` fotografa o palco nesses instantes e monta uma folha de contato. Todo efeito novo do motor passou por ela antes do render.

A viúva foi achada depois da revisão visual, num anúncio já renderizado. Por isso virou checagem: olho humano não pega em 34 vídeos.

---

## 2. A camada visual

Abrir os arquivos. Renderizar não é publicar.

```bash
node social/instagram/source/scripts/renderizar.mjs <grupo> --qa
```

Desenha as guias por cima: **vermelho** = margem segura, **azul** = a faixa 4:5 que o grid do perfil mostra de uma capa de Reel. Renderize sem `--qa` antes de publicar — a guia sai dentro do PNG.

### O que olhar, em ordem

1. **A headline cabe?** Nenhuma palavra órfã numa linha sozinha.
2. **A foto está cortando rosto ou objeto pela metade?**
3. **A logo está na variante certa** para o fundo? (clara em fundo escuro, escura em fundo claro)
4. **O texto tem contraste** sobre a parte mais clara da foto, não só sobre a média dela?
5. **O rodapé aparece inteiro?**
6. **Há microtexto?** Nada abaixo de 25 px numa peça de 1080.
7. **A ortografia está certa?** Acento, crase, número por extenso.
8. **A peça parece JP** ou poderia ser de qualquer clínica?

### Capa de Reel — a conferência extra

Abra o PNG e olhe **só a faixa central 4:5**. É isso que aparece no grid. Se a headline não for legível ali, a capa falhou — mesmo que a peça inteira esteja linda.

```bash
python social/instagram/source/scripts/montar-grid.py
```

Monta o grid do perfil já com o recorte correto de cada capa.

### Capa de Destaque — a conferência extra

O Instagram recorta um **círculo central** e mostra a **60 px**. Reduza a imagem a 60 px na tela: o ícone continua reconhecível? O rótulo continua legível?

### Vídeo

- assista **sem som** — é como 85% vai assistir;
- confira se o texto sai antes de a cena cortar;
- confira se a assinatura `@jpclinicaodontologica` não está sobre outra coisa;
- confira se a última cena dá tempo de ler o WhatsApp;
- abra o `.srt` e leia — legenda automática sem revisão é o defeito que o §40 proíbe.

---

## 3. Checklist antes de exportar cada criativo

```text
[ ] marca correta
[ ] logo na variante certa para o fundo
[ ] foto real da JP quando a peça afirma ser a JP
[ ] nenhum dado inventado
[ ] CRO conferido em src/lib/jp.ts
[ ] nenhum título de especialidade inventado
[ ] texto legível no celular
[ ] contraste conferido no ponto mais claro da foto
[ ] safe area respeitada
[ ] ortografia PT-BR
[ ] CTA adequado à intenção do público
[ ] localização correta (Vila Bruna / região da Freguesia do Ó)
[ ] sem promessa
[ ] sem antes/depois
[ ] arquivo no tamanho correto
[ ] nome padronizado
[ ] versão fonte preservada (manifest ou roteiro)
[ ] export final gerado
```

## 4. Checklist extra para anúncio

```text
[ ] não atribui condição de saúde ao usuário
[ ] não contém promessa de resultado
[ ] não usa escassez falsa
[ ] não contém dado sensível
[ ] CTA natural
[ ] tratamento correto
[ ] rota de destino correta (não é a home)
[ ] UTM correta e minúscula
[ ] utm_content único
[ ] versão 9:16
[ ] versão 4:5 quando aplicável
[ ] legenda revisada
[ ] nenhum elemento de interface orgânica
```

---

## 5. Revisão ética — as sete perguntas

Antes de qualquer peça clínica ir ao ar:

1. Isto **promete** alguma coisa?
2. Isto **diagnostica** quem está lendo?
3. Isto **atribui** uma condição de saúde ao usuário?
4. Algum dado aqui foi **digitado** em vez de vir de `src/lib/jp.ts`?
5. Alguma pessoa aparece **sem autorização** documentada?
6. Algum título ou especialidade está afirmado **sem documentação**?
7. A frase, **recortada num print**, continua verdadeira?

A sétima é a que mais reprova. Um chip que diz "SEM DOR TAMBÉM CONTA" faz sentido no contexto do carrossel e vira uma promessa quando alguém tira print só daquele slide. (Aconteceu neste kit; o chip virou "QUANDO NADA DÓI".)

---

## 6. Revisão de dados — trimestral

Estes números mudam e ficam congelados em arquivo publicado:

| Dado                | Onde vive          | Quando revisar             |
| ------------------- | ------------------ | -------------------------- |
| nota do Google      | `AVALIACOES.nota`  | a cada trimestre           |
| total de avaliações | `AVALIACOES.total` | a cada trimestre           |
| anos de história    | `HISTORIA.anos`    | **17 de agosto**, todo ano |
| equipe e CRO        | `EQUIPE`           | a cada entrada ou saída    |
| horário             | `CLINICA.horario`  | quando mudar               |

Depois de mexer em `src/lib/jp.ts`:

```bash
node social/instagram/source/scripts/extrair-dados.mjs
node social/instagram/source/scripts/renderizar.mjs
node social/instagram/source/scripts/gerar-videos.mjs
node social/instagram/source/scripts/conferir.mjs
```

O que já está publicado **não muda sozinho**. Republique as peças que citam o número antigo — ou arquive-as.

---

## 7. O resultado da última conferência

```text
✓ nenhum ativo proibido referenciado (5 padrões verificados)
✓ nenhuma expressão vedada (14 padrões verificados)
✓ narrativa de localidade correta ("24 anos de história. Hoje, na Freguesia do Ó.")
✓ todos os CRO citados existem em src/lib/jp.ts (6 válidos)
✓ nenhum telefone divergente escrito à mão nos manifests
✓ todos os tokens resolvem contra dados-jp.json
✓ 26 caminhos de imagem conferidos em disco
✓ toda peça de anúncio declara `anuncio: true` (desliga a interface orgânica do template)
✓ 257 PNG com dimensão válida
✓ 294 arquivos com nomenclatura conferida
✓ 34 vídeos com legenda .srt ao lado
✓ 34 vídeos com trilha e gerados pelo motor atual

260 imagens · 34 vídeos · 30 manifests · 34 roteiros — sem erro.
```
