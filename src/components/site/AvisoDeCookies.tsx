import { useEffect, useRef, useState } from "react";
import { useLocation } from "@tanstack/react-router";
import { Cookie } from "lucide-react";

import {
  definirConsentimento,
  lerConsentimento,
  reaplicarConsentimento,
} from "@/lib/analytics/consentimento";

/**
 * ============================================================================
 *  AS FERRAMENTAS INTERNAS NÃO RECEBEM A FAIXA.
 *
 *  Ela é montada no `__root`, então nasce em TODA rota — inclusive `/crc` e
 *  `/rh`, que ficam atrás de login e são usadas pela equipe, não por visitante.
 *  Três coisas quebravam por causa disso:
 *
 *    ela cobria o rodapé do CRC (`fixed bottom-0`, `z-index` 70), que é onde
 *    moram as barras de ação e a última linha das listas;
 *
 *    `Escape` grava "recusado" — e no CRC `Escape` é o atalho de fechar
 *    painel e diálogo. Quem fechasse uma ficha recusaria medição sem saber;
 *
 *    dois testes de navegador passaram a estourar o tempo clicando em
 *    elementos que a faixa interceptava.
 *
 *  E, no mérito: pedir consentimento de medição a quem já se autenticou numa
 *  ferramenta interna não significa nada. O consentimento existe para o
 *  visitante do site público, que é quem o GA4 e o Pixel medem.
 * ============================================================================
 */
const INTERNAS = ["/crc", "/rh"];

function ehFerramentaInterna(pathname: string): boolean {
  return INTERNAS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/**
 * O aviso de cookies — pequeno, porque o que ele governa é pequeno.
 *
 * ============================================================================
 *  POR QUE NÃO É UM MODAL QUE TRAVA A TELA.
 *
 *  O site não usa cookie para funcionar. O que o consentimento liga e desliga é
 *  medição — GA4 e Pixel —, e medição não pode ser condição para um paciente
 *  falar com a clínica. Um modal de tela cheia num site de saúde põe atrito
 *  entre a dor de dente e o WhatsApp, e o custo disso é maior do que qualquer
 *  ganho de atribuição.
 *
 *  Então: faixa embaixo, dois botões do mesmo tamanho, nada bloqueado atrás.
 *  "Rejeitar" tem o mesmo peso visual de "Aceitar" — recusa que precisa ser
 *  procurada é recusa desenhada para não acontecer.
 * ============================================================================
 *
 * ACESSIBILIDADE, e ela não é enfeite aqui: a faixa aparece depois da montagem
 * e pode surgir enquanto alguém navega por teclado. Por isso `role="dialog"`
 * com rótulo, foco levado ao primeiro botão quando ela aparece, `Escape`
 * fechando como recusa — que é o lado seguro do padrão —, e nada de
 * `position: fixed` cobrindo o CTA flutuante: a faixa senta ACIMA dele, com
 * `z-index` menor que o do menu.
 */
export function AvisoDeCookies() {
  const { pathname } = useLocation();
  const [visivel, setVisivel] = useState(false);
  const primeiroBotao = useRef<HTMLButtonElement>(null);
  const interna = ehFerramentaInterna(pathname);

  /*
   * O ESTADO INICIAL É `false` NOS DOIS LADOS, e isso é obrigatório: o servidor
   * não tem `localStorage`, então qualquer tentativa de já nascer visível
   * divergiria do HTML servido e quebraria a hidratação. A faixa entra depois
   * de montar — e, como ela só interessa a quem ainda não decidiu, ninguém
   * percebe o atraso de um quadro.
   */
  useEffect(() => {
    /*
     * A ESCOLHA JÁ FEITA CONTINUA SENDO REAPLICADA nas rotas internas — só a
     * PERGUNTA é que não aparece. Quem aceitou no site público e depois abre o
     * CRC não deve ter a medição desligada por ter trocado de rota.
     */
    const estado = reaplicarConsentimento();
    if (estado === "pendente" && !interna) setVisivel(true);
  }, [interna]);

  useEffect(() => {
    if (!visivel) return;
    primeiroBotao.current?.focus();

    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // Escape é saída, e saída aqui significa "não quero" — nunca "aceito".
      definirConsentimento("recusado");
      setVisivel(false);
    };
    document.addEventListener("keydown", aoTeclar);
    return () => {
      document.removeEventListener("keydown", aoTeclar);
    };
  }, [visivel]);

  // Cinto e suspensório: mesmo que o estado escorregue numa navegação, a faixa
  // não desenha dentro de ferramenta interna.
  if (!visivel || interna) return null;

  const decidir = (escolha: "aceito" | "recusado") => {
    definirConsentimento(escolha);
    setVisivel(false);
  };

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-labelledby="aviso-cookies-titulo"
      className="fixed inset-x-0 bottom-0 z-[70] border-t border-border-soft bg-paper/98 backdrop-blur-md"
    >
      <div className="jp-container flex flex-col gap-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
        <div className="flex items-start gap-3">
          <span
            aria-hidden="true"
            className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full bg-mint text-primary-ink"
          >
            <Cookie className="h-4.5 w-4.5" />
          </span>
          <p id="aviso-cookies-titulo" className="text-[13px] leading-5 text-ink-soft">
            Usamos cookies para medir o desempenho das nossas campanhas e melhorar o site. Nada
            disso é necessário para falar com a clínica.{" "}
            <a
              href="/politica-de-privacidade"
              className="font-semibold text-brand-text underline underline-offset-2"
            >
              Política de Privacidade
            </a>
            .
          </p>
        </div>

        {/* Os dois botões medem o mesmo e ficam lado a lado. Ver o cabeçalho:
            recusa escondida é recusa desenhada para não acontecer. */}
        <div className="flex shrink-0 gap-2.5">
          <button
            ref={primeiroBotao}
            type="button"
            onClick={() => {
              decidir("recusado");
            }}
            className="button-secondary flex-1 px-6 text-sm sm:flex-none"
          >
            Rejeitar
          </button>
          <button
            type="button"
            onClick={() => {
              decidir("aceito");
            }}
            className="button-dark flex-1 px-6 text-sm sm:flex-none"
          >
            Aceitar
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * O botão que devolve a escolha a quem já decidiu.
 *
 * A LGPD pede que revogar seja tão fácil quanto consentir, e um banner que nunca
 * mais aparece transforma uma decisão de dois segundos em definitiva. Fica no
 * rodapé e na política de privacidade — os dois lugares onde alguém procura
 * isso — e some quando ainda não há escolha registrada, porque aí o banner já
 * está na tela.
 */
export function BotaoRevisarConsentimento({ className }: { className?: string }) {
  const [temEscolha, setTemEscolha] = useState(false);

  useEffect(() => {
    setTemEscolha(lerConsentimento() !== "pendente");
  }, []);

  if (!temEscolha) return null;

  return (
    <button
      type="button"
      onClick={() => {
        // Limpar e recarregar, em vez de remontar o banner por estado: o
        // `<head>` precisa reler a escolha para o Consent Mode voltar ao padrão
        // negado antes de qualquer tag disparar. Meia dúzia de linhas de estado
        // compartilhado resolveriam a tela e deixariam o Google achando que o
        // consentimento antigo continua valendo.
        try {
          localStorage.removeItem("jp:consentimento");
        } catch {
          /* modo privado: nada a limpar */
        }
        window.location.reload();
      }}
      className={className ?? "alvo-toque text-micro font-semibold underline underline-offset-2"}
    >
      Rever consentimento de cookies
    </button>
  );
}
