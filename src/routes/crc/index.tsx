/**
 * A Home do CRC — a raiz `/crc`.
 *
 * ELA NÃO É PREGUIÇOSA, e as outras vinte e nove são. É a primeira tela de
 * todo mundo, todo dia: adiar o download dela trocaria um pacote menor por
 * uma espera que a pessoa vê. As demais entram por `React.lazy`, onde a espera
 * acontece uma vez e só para quem abre aquela tela.
 */
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import type { ReactElement } from "react";

import { Home } from "@/components/crc/Home";
import { PrimeirosPassos } from "@/components/crc/PrimeirosPassos";
import { useCrc } from "@/components/crc/contexto-crc";
import { PERMISSAO_DA_TELA, ehAba } from "@/components/crc/rotas";

export const Route = createFileRoute("/crc/")({
  component: HomeDoCrc,
});

function HomeDoCrc(): ReactElement {
  const navegar = useNavigate();
  const { usuario, abrirPaciente } = useCrc();

  return (
    <>
      {/*
        O CHECKLIST DE INSTALAÇÃO FICA NO TOPO DA HOME, e só enquanto faltar
        passo essencial — ele some sozinho, sem botão de fechar.

        Aqui em cima porque é a primeira tela de todo mundo, e porque a pergunta
        que ele responde é a que a pessoa faz olhando uma tela vazia: "o sistema
        quebrou, ou ainda não terminei de instalar?".
      */}
      <PrimeirosPassos
        aoIrPara={(destino) => {
          /*
           * SÓ NAVEGA SE A TELA EXISTIR E A PESSOA PUDER ABRI-LA. Mandar alguém
           * para uma tela que ela não pode ver trocaria um checklist por um
           * aviso de acesso negado — o que é pior do que não oferecer o atalho.
           */
          if (!ehAba(destino) || destino === "home") return;
          if (!usuario.permissoes.includes(PERMISSAO_DA_TELA[destino])) return;
          void navegar({ to: "/crc/$tela", params: { tela: destino } });
        }}
      />
      <Home nomeUsuario={usuario.nome} aoAbrirPaciente={abrirPaciente} />
    </>
  );
}
