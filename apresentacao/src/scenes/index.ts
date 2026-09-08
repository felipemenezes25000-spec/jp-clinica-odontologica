import type { ComponentType } from "react";
import type { IdCena } from "@/data/linhaDoTempo";

import { Cena01Abertura } from "./Cena01Abertura";
import { Cena02Problema } from "./Cena02Problema";
import { Cena03DentalOffice } from "./Cena03DentalOffice";
import { Cena04Integracao } from "./Cena04Integracao";
import { Cena05Nucleo } from "./Cena05Nucleo";
import { Cena06Eventos } from "./Cena06Eventos";
import { Cena07Elegibilidade } from "./Cena07Elegibilidade";
import { Cena08Prioridade } from "./Cena08Prioridade";
import { Cena09Divisao } from "./Cena09Divisao";
import { Cena10Automacoes } from "./Cena10Automacoes";
import { Cena11BaseAntiga } from "./Cena11BaseAntiga";
import { Cena12Reativacao } from "./Cena12Reativacao";
import { Cena13Campanhas } from "./Cena13Campanhas";
import { Cena14WhatsApp } from "./Cena14WhatsApp";
import { Cena15Ia } from "./Cena15Ia";
import { Cena16Intencoes } from "./Cena16Intencoes";
import { Cena17Agendamento } from "./Cena17Agendamento";
import { Cena18Lembretes } from "./Cena18Lembretes";
import { Cena19Cobranca } from "./Cena19Cobranca";
import { Cena20Humano } from "./Cena20Humano";
import { Cena21Home } from "./Cena21Home";
import { Cena22Inbox } from "./Cena22Inbox";
import { Cena23Paciente360 } from "./Cena23Paciente360";
import { Cena24Resultados } from "./Cena24Resultados";
import { Cena25Funil } from "./Cena25Funil";
import { Cena26AntesDepois } from "./Cena26AntesDepois";
import { Cena27Impacto } from "./Cena27Impacto";
import { Cena28Gestor } from "./Cena28Gestor";
import { Cena29Ecossistema } from "./Cena29Ecossistema";
import { Cena30Frase } from "./Cena30Frase";
import { Cena31Final } from "./Cena31Final";

/**
 * O índice das cenas.
 *
 * Um mapa estático, não `lazy()`: o filme roda a 30 fps e a linha do tempo pode
 * saltar para qualquer frame (arrastar a barra, pular capítulo, render de frame
 * avulso no Remotion). Uma cena que chegasse por import dinâmico apareceria em
 * branco no primeiro frame depois do salto — e no render, em branco de vez, já
 * que ninguém espera a promessa resolver.
 *
 * O custo é o bundle inteiro no primeiro paint. A 31 cenas de componente puro,
 * isso é pequeno; o que pesa em bundle de vídeo é asset, e os assets já são SVG
 * e carregam sob demanda.
 *
 * A ORDEM AQUI É A ORDEM DO FILME, e os arquivos são numerados para bater com
 * ela. Se uma cena nova entrar no meio, renumere os arquivos seguintes — o selo
 * "18 / 31" na tela vem da linha do tempo e se corrige sozinho, mas o nome do
 * arquivo é o que orienta quem abre a pasta.
 */
export const COMPONENTES: Readonly<Record<IdCena, ComponentType>> = {
  abertura: Cena01Abertura,
  problema: Cena02Problema,
  dentalOffice: Cena03DentalOffice,
  integracao: Cena04Integracao,
  nucleo: Cena05Nucleo,
  eventos: Cena06Eventos,
  elegibilidade: Cena07Elegibilidade,
  prioridade: Cena08Prioridade,
  divisao: Cena09Divisao,
  automacoes: Cena10Automacoes,
  baseAntiga: Cena11BaseAntiga,
  reativacao: Cena12Reativacao,
  campanhas: Cena13Campanhas,
  whatsapp: Cena14WhatsApp,
  ia: Cena15Ia,
  intencoes: Cena16Intencoes,
  agendamento: Cena17Agendamento,
  lembretes: Cena18Lembretes,
  cobranca: Cena19Cobranca,
  humano: Cena20Humano,
  home: Cena21Home,
  inbox: Cena22Inbox,
  paciente360: Cena23Paciente360,
  resultados: Cena24Resultados,
  funil: Cena25Funil,
  antesDepois: Cena26AntesDepois,
  impacto: Cena27Impacto,
  gestor: Cena28Gestor,
  ecossistema: Cena29Ecossistema,
  frase: Cena30Frase,
  final: Cena31Final,
};
