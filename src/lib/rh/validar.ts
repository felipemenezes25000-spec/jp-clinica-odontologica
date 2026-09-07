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
export type ContextoPortal = { aceitandoEspontanea: boolean };

/** Idade mínima para estágio/menor aprendiz; abaixo disso a clínica não contrata. */
const IDADE_MINIMA = 16;

function vazio(v: string): boolean {
  return v.trim().length === 0;
}

function validarVaga(dados: Candidatura, contexto: ContextoPortal, erros: ErrosPasso): void {
  // Sem vaga escolhida a candidatura é espontânea; se a clínica desligou o banco
  // de talentos, não há nada a enviar. A mensagem manda para onde há saída.
  if (vazio(dados.vagaId) && !contexto.aceitandoEspontanea) {
    erros["vagaId"] =
      "A clínica não está recebendo candidaturas espontâneas agora. Escolha uma das vagas abertas.";
  }
  if (!dados.area) erros["area"] = "Escolha a área da vaga.";
  if (vazio(dados.cargoDesejado)) erros["cargoDesejado"] = "Informe o cargo desejado.";
  if (!dados.vinculo) erros["vinculo"] = "Escolha o tipo de vínculo.";
  if (dados.area === "dentista" && dados.especialidades.length === 0) {
    erros["especialidades"] = "Selecione pelo menos uma especialidade.";
  }
  if (dados.disponibilidade.length === 0) {
    erros["disponibilidade"] = "Marque pelo menos um turno disponível.";
  }
}

function validarPessoal(dados: Candidatura, agora: Date, erros: ErrosPasso): void {
  const partesNome = dados.nome.trim().split(/\s+/).filter(Boolean);
  if (partesNome.length < 2) erros["nome"] = "Informe o nome completo.";

  if (!dataValida(dados.nascimento)) {
    erros["nascimento"] = "Informe uma data de nascimento válida.";
  } else {
    const anos = idade(dados.nascimento, agora);
    if (anos === null || anos < IDADE_MINIMA) {
      erros["nascimento"] = `É preciso ter ao menos ${IDADE_MINIMA} anos.`;
    }
  }

  if (!cpfValido(dados.cpf)) erros["cpf"] = "CPF inválido.";
  if (!emailValido(dados.email)) erros["email"] = "E-mail inválido.";
  if (!telefoneValido(dados.telefone)) erros["telefone"] = "Telefone inválido com DDD.";
  if (vazio(dados.cidade)) erros["cidade"] = "Informe a cidade.";
  if (vazio(dados.uf)) erros["uf"] = "Informe o estado.";
}

function validarFormacao(dados: Candidatura, erros: ErrosPasso): void {
  if (vazio(dados.escolaridade)) erros["escolaridade"] = "Informe a escolaridade.";
  if (dados.area === "dentista") {
    const cro = apenasDigitos(dados.cro);
    if (cro.length < 4 || cro.length > 8) erros["cro"] = "Informe o número do CRO.";
    if (vazio(dados.croUf)) erros["croUf"] = "Informe a UF do CRO.";
  }
}

function validarExperiencia(dados: Candidatura, erros: ErrosPasso): void {
  if (!dados.anosExperiencia) erros["anosExperiencia"] = "Informe seu tempo de experiência.";

  // Linha em branco é normal (o formulário já começa com uma); só cobramos
  // empresa e cargo de quem começou a preencher alguma coisa.
  const incompleta = dados.experiencias.some((exp) => {
    const algoPreenchido = [exp.empresa, exp.cargo, exp.periodo, exp.atividades].some(
      (campo) => !vazio(campo),
    );
    return algoPreenchido && (vazio(exp.empresa) || vazio(exp.cargo));
  });
  if (incompleta) erros["experiencias"] = "Preencha empresa e cargo em cada experiência.";
}

function validarFinal(dados: Candidatura, erros: ErrosPasso): void {
  if (vazio(dados.origem)) erros["origem"] = "Conte como você chegou até a clínica.";
  if (dados.consentimentoLgpd !== true) {
    erros["consentimentoLgpd"] = "É preciso autorizar o uso dos seus dados para seguir.";
  }
}

/**
 * Valida um passo do formulário (1 a 5) e devolve mapa campo -> mensagem.
 * O currículo não é checado aqui: o arquivo viaja fora do objeto Candidatura,
 * e quem valida tamanho e tipo é o upload.
 */
export function validarPasso(
  passo: number,
  dados: Candidatura,
  agora: Date,
  contexto: ContextoPortal,
): ErrosPasso {
  const erros: ErrosPasso = {};
  if (passo === 1) validarVaga(dados, contexto, erros);
  if (passo === 2) validarPessoal(dados, agora, erros);
  if (passo === 3) validarFormacao(dados, erros);
  if (passo === 4) validarExperiencia(dados, erros);
  if (passo === 5) validarFinal(dados, erros);
  return erros;
}

export function validarTudo(dados: Candidatura, agora: Date, contexto: ContextoPortal): ErrosPasso {
  const erros: ErrosPasso = {};
  for (let passo = 1; passo <= 5; passo += 1) {
    Object.assign(erros, validarPasso(passo, dados, agora, contexto));
  }
  return erros;
}

const PASSO_DO_CAMPO: Record<string, number> = {
  vagaId: 1,
  area: 1,
  cargoDesejado: 1,
  vinculo: 1,
  especialidades: 1,
  disponibilidade: 1,
  inicioEm: 1,
  pretensao: 1,

  nome: 2,
  nascimento: 2,
  cpf: 2,
  email: 2,
  telefone: 2,
  cep: 2,
  logradouro: 2,
  bairro: 2,
  cidade: 2,
  uf: 2,
  linkedin: 2,
  instagram: 2,

  escolaridade: 3,
  instituicao: 3,
  anoFormacao: 3,
  cro: 3,
  croUf: 3,
  posGraduacoes: 3,
  cursos: 3,

  anosExperiencia: 4,
  experiencias: 4,
  softwares: 4,
  competencias: 4,
  idiomas: 4,

  cartaApresentacao: 5,
  origem: 5,
  indicadoPor: 5,
  curriculo: 5,
  consentimentoLgpd: 5,
};

/** Usado para saltar ao passo do primeiro erro quando o envio é recusado. */
export function passoDoErro(campo: string): number {
  return PASSO_DO_CAMPO[campo] ?? 1;
}
