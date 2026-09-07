/**
 * Validação do Portal de RH.
 *
 * Uma verdade só: o formulário chama isto a cada passo para dar retorno na hora,
 * e a rota do servidor chama de novo antes de gravar. Sem duplicar regra, não há
 * o clássico "passou no cliente, quebrou no servidor" — e um POST fora do
 * formulário cai nas mesmas checagens.
 */
import { apenasDigitos, idade } from "./formatar";
import type { Candidatura } from "./tipos";

export function cpfValido(cpf: string): boolean {
  const d = apenasDigitos(cpf);
  if (d.length !== 11) return false;
  // 111.111.111-11 e afins passam no cálculo dos dígitos, mas não existem.
  if (/^(\d)\1{10}$/.test(d)) return false;

  const digito = (ate: number): number => {
    let soma = 0;
    let peso = ate + 1;
    for (let i = 0; i < ate; i += 1) {
      soma += Number(d[i] ?? "0") * peso;
      peso -= 1;
    }
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };

  return digito(9) === Number(d[9] ?? "-1") && digito(10) === Number(d[10] ?? "-1");
}

export function emailValido(email: string): boolean {
  const v = email.trim();
  if (v.length < 6 || v.length > 254) return false;
  if (/\s/.test(v)) return false;
  return /^[^@.][^@\s]*@[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i.test(v);
}

export function telefoneValido(tel: string): boolean {
  const d = apenasDigitos(tel);
  if (d.length !== 10 && d.length !== 11) return false;

  const ddd = Number(d.slice(0, 2));
  if (ddd < 11 || ddd > 99) return false;

  const primeiro = d[2] ?? "";
  // Celular no Brasil tem 9 dígitos e começa com 9; fixo tem 8 e começa em 2..5.
  return d.length === 11 ? primeiro === "9" : primeiro >= "2" && primeiro <= "5";
}

export function cepValido(cep: string): boolean {
  const d = apenasDigitos(cep);
  return d.length === 8 && !/^0{8}$/.test(d);
}

export function dataValida(iso: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!m) return false;

  const ano = Number(m[1] ?? "");
  const mes = Number(m[2] ?? "");
  const dia = Number(m[3] ?? "");
  if (ano < 1900 || mes < 1 || mes > 12 || dia < 1 || dia > 31) return false;

  // Comparar com o Date reconstruído descarta 2026-02-31, que o construtor
  // "conserta" silenciosamente para 03/03.
  const teste = new Date(Date.UTC(ano, mes - 1, dia));
  return (
    teste.getUTCFullYear() === ano && teste.getUTCMonth() === mes - 1 && teste.getUTCDate() === dia
  );
}

export function maiorDeIdade(nascimentoIso: string, agora: Date): boolean {
  if (!dataValida(nascimentoIso)) return false;
  const anos = idade(nascimentoIso, agora);
  return anos !== null && anos >= 18;
}

export type ErrosPasso = Record<string, string>;

/**
 * O que a validação precisa saber do portal e não dá para deduzir da
 * candidatura. Hoje é só a chave de candidatura espontânea: sem ela, quem chega
 * em `/trabalhe-conosco` com o banco de talentos fechado preenche os cinco
 * passos, anexa o currículo e só descobre a recusa no último clique — a regra
 * mora no servidor, mas a tela precisa da mesma resposta antes disso.
 *
 * É parâmetro obrigatório de propósito: opcional, o servidor esqueceria de
 * passá-lo e a regra viraria enfeite de front-end.
 */
/**
 * O que a validação precisa saber do portal e não dá para deduzir da
 * candidatura.
 *
 * `aceitandoEspontanea`: sem ela, quem chega em `/trabalhe-conosco` com o banco
 * de talentos fechado preenche tudo e só descobre a recusa no último clique.
 *
 * `temCurriculo`: o arquivo viaja FORA do objeto `Candidatura` — no
 * `FormData`, não no JSON — então a validação não consegue enxergá-lo sozinha.
 * Passar por aqui mantém uma verdade só: a tela pergunta antes de deixar
 * enviar, e o servidor pergunta de novo antes de gravar. Se fosse um `if`
 * solto na rota, a mensagem na tela e a regra do servidor divergiriam no
 * primeiro refactor.
 *
 * É parâmetro obrigatório de propósito: opcional, o servidor esqueceria de
 * passá-lo e a regra viraria enfeite de front-end.
 */
export type ContextoPortal = { aceitandoEspontanea: boolean; temCurriculo: boolean };

function vazio(v: string): boolean {
  return v.trim().length === 0;
}

/**
 * O FORMULÁRIO PÚBLICO PEDE QUATRO COISAS. Só isso.
 *
 * Antes eram cinco passos e mais de vinte campos: nascimento, CPF, endereço,
 * escolaridade, instituição, ano de formação, CRO, pós, cursos, tempo de
 * experiência, cada emprego com empresa/cargo/período/atividades, softwares,
 * competências, idiomas, especialidades, grade de turnos, pretensão, carta e
 * origem. Um formulário desse tamanho não seleciona candidato: ele seleciona
 * quem tem paciência para formulário, e some com o resto no meio do caminho.
 *
 * Tudo isso está no currículo, e a leitura por IA já extrai — formação,
 * empregos com data, cursos, idiomas, softwares, registro no conselho e
 * pretensão declarada. Pedir de novo é cobrar da candidata um trabalho que o
 * sistema faz sozinho.
 *
 * O que continua sendo perguntado, e por quê:
 *
 * - **vaga/área**: é clique, não digitação, e decide para qual processo a
 *   candidatura vai. Nenhuma leitura de currículo adivinha isso.
 * - **nome**: aparece na lista do painel no instante em que chega. Sem ele o
 *   RH veria uma fila de "sem nome" até alguém gastar a leitura da IA.
 * - **WhatsApp**: é por onde a clínica chama. Telefone lido errado num
 *   currículo escaneado falha em silêncio — a pessoa nunca é chamada e
 *   ninguém descobre o porquê. Este é o único campo que não pode depender da IA.
 * - **currículo**: agora OBRIGATÓRIO. É dele que sai todo o resto; sem ele a
 *   candidatura chega vazia e o painel não tem o que mostrar.
 * - **consentimento**: exigência da LGPD, não escolha de produto.
 *
 * O e-mail continua no formulário mas é OPCIONAL: quase todo currículo traz, e
 * a leitura preenche. Quem quiser digitar, digita.
 */
function validarEssencial(dados: Candidatura, contexto: ContextoPortal, erros: ErrosPasso): void {
  if (vazio(dados.vagaId) && !contexto.aceitandoEspontanea) {
    erros["vagaId"] =
      "A clínica não está recebendo candidaturas espontâneas agora. Escolha uma das vagas abertas.";
  }
  if (!dados.area) erros["area"] = "Escolha a área em que você atua.";

  // Duas palavras: "Maria" sozinho não permite chamar a pessoa pelo nome nem
  // distinguir duas Marias na lista do painel.
  const partesNome = dados.nome.trim().split(/s+/).filter(Boolean);
  if (partesNome.length < 2) erros["nome"] = "Informe seu nome completo.";

  if (!telefoneValido(dados.telefone)) {
    erros["telefone"] = "Informe um WhatsApp válido, com DDD.";
  }

  // Opcional, mas se veio tem que estar certo: e-mail com erro de digitação é
  // pior que e-mail em branco, porque parece que existe um canal e não existe.
  if (!vazio(dados.email) && !emailValido(dados.email)) {
    erros["email"] = "E-mail inválido.";
  }

  if (!contexto.temCurriculo) {
    erros["curriculo"] = "Anexe o seu currículo: é a partir dele que a clínica avalia o perfil.";
  }

  if (dados.consentimentoLgpd !== true) {
    erros["consentimentoLgpd"] = "É preciso autorizar o uso dos seus dados para seguir.";
  }
}

/**
 * O formulário virou um passo só, então validar "o passo 1" e validar tudo é a
 * mesma coisa. As duas funções continuam existindo porque a rota do servidor
 * chama `validarTudo` e a tela chama `validarPasso` — e manter os dois nomes
 * evita mexer nos dois lados por uma mudança que é de forma, não de regra.
 */
export function validarPasso(
  _passo: number,
  dados: Candidatura,
  _agora: Date,
  contexto: ContextoPortal,
): ErrosPasso {
  const erros: ErrosPasso = {};
  validarEssencial(dados, contexto, erros);
  return erros;
}

export function validarTudo(dados: Candidatura, agora: Date, contexto: ContextoPortal): ErrosPasso {
  return validarPasso(1, dados, agora, contexto);
}

/** Usado para saltar ao passo do primeiro erro quando o envio é recusado. */
export function passoDoErro(_campo: string): number {
  return 1;
}

/**
 * O telefone de CONTATO de um texto livre — celular na frente do fixo.
 *
 * POR QUE ISTO EXISTE
 * A leitura do currículo devolve o campo do jeito que ele aparece na folha, e
 * na folha ele quase nunca vem limpo:
 *
 *   "Celular: (11) 99876-3111 / Recado: (11) "
 *   "(11) 3945-0938 / (11) 96459-9563"
 *   "+5511963583175 | 11963583175"
 *   "(011) 96080-2168"
 *
 * Passar isso por `apenasDigitos` COLA todos os dígitos da linha: o primeiro
 * exemplo virava `1199876311111`, com treze dígitos, e o painel desligava
 * WhatsApp, Ligar e Copiar telefone dizendo "sem telefone no currículo" — para
 * uma candidata que tinha DOIS.
 *
 * POR QUE CELULAR PRIMEIRO, E NÃO O PRIMEIRO QUE APARECER
 * A clínica chama por WhatsApp, e WhatsApp só existe em celular. Pegar o
 * primeiro válido escolhia o FIXO no segundo exemplo — o botão de WhatsApp
 * ficava desligado para alguém que tinha celular duas linhas abaixo. Aconteceu
 * uma vez em cinco currículos com mais de um número.
 *
 * O fixo continua servindo de reserva: quem só tem fixo tem o número gravado e
 * o botão de Ligar funcionando.
 */
export function telefoneParaContato(texto: string): string {
  const padrao = /(?:\+?55[\s.\-–—]*)?\(?0?(\d{2})\)?[\s.\-–—]*(\d{4,5})[\s.\-–—]*(\d{4})/g;
  const achados: string[] = [];
  for (const achado of texto.matchAll(padrao)) {
    const numero = `${achado[1] ?? ""}${achado[2] ?? ""}${achado[3] ?? ""}`;
    if (telefoneValido(numero) && !achados.includes(numero)) achados.push(numero);
  }
  // Celular brasileiro: 11 dígitos, e o primeiro do número é 9.
  return achados.find((n) => n.length === 11 && n[2] === "9") ?? achados[0] ?? "";
}
