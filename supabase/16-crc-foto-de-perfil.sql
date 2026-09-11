-- ============================================================================
-- CRC — a coluna da foto de perfil, que faltava
-- ============================================================================
--
-- Rodar UMA VEZ, à mão. DDL não passa pela API.
--
-- POR QUE ESTE ARQUIVO EXISTE, e é um erro meu de fatia anterior: a tela de
-- perfil grava a foto em `crc_users.foto_url`, `repositorios.ts` lê essa coluna,
-- e ela nunca foi criada. O PostgREST recusa o UPDATE inteiro quando a coluna
-- não existe, então o botão de trocar foto SEMPRE falhou — não "não salvou a
-- imagem": devolveu erro.
--
-- Ninguém notou porque o banco em memória dos testes guarda objetos e aceita
-- qualquer chave. O teste `testes/schema.test.ts` passou a comparar cada coluna
-- que o código pede contra estes arquivos, e foi ele quem encontrou.
-- ============================================================================

-- DATA URL, e não URL de arquivo.
--
-- A tela reduz a imagem no navegador para menos de 60 KB e grava `data:image/...`
-- direto na coluna. É uma escolha assumida: evita bucket, política de acesso e
-- URL assinada para uma foto de avatar que a própria pessoa colocou.
--
-- O limite de tamanho é validado na aplicação, antes do UPDATE. Uma foto de 20 KB
-- numa tabela de dez usuários não é problema; o dia em que isto virar galeria, a
-- decisão se revê.
alter table public.crc_users
  add column if not exists foto_url text;
