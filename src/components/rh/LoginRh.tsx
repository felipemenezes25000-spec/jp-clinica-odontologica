/**
 * Porta de entrada do painel de RH.
 *
 * A tela não sabe nada sobre sessão: quem conversa com o servidor é a rota, que
 * desce aqui só o resultado (`erro`, `segundos` de bloqueio, `ocupado`). Assim o
 * mesmo componente serve para a primeira carga, para o erro de senha e para a
 * espera do rate limit, sem cada estado virar uma tela diferente.
 */
import { useEffect, useId, useState } from "react";
import { ArrowLeft, Eye, EyeOff, KeyRound, ShieldCheck, TriangleAlert } from "lucide-react";

import { Logo } from "@/components/site/Logo";

/**
 * Abaixo de um minuto o texto fica em segundos ("45s"): "0:45" faz a pessoa
 * traduzir mentalmente uma espera que é curta. Acima disso vira relógio.
 */
function formatarEspera(segundos: number): string {
  if (segundos <= 0) return "";
  if (segundos < 60) return `${segundos}s`;
  const minutos = Math.floor(segundos / 60);
  const resto = segundos % 60;
  return `${minutos}:${String(resto).padStart(2, "0")}`;
}

export function LoginRh({
  configurado,
  motivo,
  ocupado,
  erro,
  segundos,
  aoEnviar,
}: {
  /** `false` quando faltam as variáveis de ambiente do portal no servidor. */
  configurado: boolean;
  /** Explicação do servidor para o portal estar fora do ar. */
  motivo: string;
  ocupado: boolean;
  erro: string;
  /** Segundos restantes do bloqueio por tentativas seguidas. Zero = liberado. */
  segundos: number;
  aoEnviar: (senha: string) => void;
}) {
  const [senha, setSenha] = useState("");
  const [mostrar, setMostrar] = useState(false);
  // Cópia local do bloqueio: o servidor manda o número uma vez, quem faz a conta
  // andar na tela é este estado. Sem isso o contador ficaria congelado em "60s"
  // até a próxima resposta, e a pessoa não saberia se ainda falta esperar.
  const [restantes, setRestantes] = useState(segundos);

  const idBase = useId();
  const idSenha = `${idBase}-senha`;
  const idAjuda = `${idBase}-ajuda`;
  const idErro = `${idBase}-erro`;
  const idEspera = `${idBase}-espera`;

  useEffect(() => {
    setRestantes(segundos);
  }, [segundos]);

  const contando = restantes > 0;

  // A dependência é o booleano, e não `restantes`: com o número o intervalo
  // seria destruído e recriado a cada segundo, o que faz a contagem derrapar.
  useEffect(() => {
    if (!contando) return;
    const id = window.setInterval(() => {
      setRestantes((valor) => (valor > 1 ? valor - 1 : 0));
    }, 1000);
    return () => window.clearInterval(id);
  }, [contando]);

  const bloqueado = !configurado || ocupado || contando;

  const descreve = [idAjuda, erro ? idErro : "", contando ? idEspera : ""]
    .filter((id) => id !== "")
    .join(" ");

  return (
    <div className="rh-login-claro flex min-h-dvh flex-col items-center justify-center px-4 py-10 sm:py-16">
      <main className="w-full max-w-md">
        <div className="rh-vidro p-6 sm:p-8">
          <div className="flex flex-col items-center gap-5 text-center">
            <Logo
              variante="lockup"
              fundo="claro"
              altura={36}
              alt="JP Clínica Integrada Odontológica"
            />
            <div>
              {/* "ACESSO RESTRITO" em branco, não em lime: em cima do verde a
                  letra é branca. O ícone é que fica lime — ícone não é letra. */}
              <p className="eyebrow justify-center text-ink">
                <ShieldCheck size={14} className="text-lime" aria-hidden="true" />
                Acesso restrito
              </p>
              <h1 className="mt-2 font-display text-2xl font-extrabold tracking-tight text-ink">
                Portal de RH
              </h1>
              <p className="mt-2 text-sm leading-relaxed text-ink-soft">
                Área da coordenação. Aqui ficam as candidaturas recebidas pelo site e as vagas
                publicadas.
              </p>
            </div>
          </div>

          {!configurado ? (
            <div className="mt-6 flex gap-3 rounded-2xl bg-amber-300/10 p-4 ring-1 ring-amber-200/35">
              <TriangleAlert
                size={18}
                className="mt-0.5 shrink-0 text-amber-200"
                aria-hidden="true"
              />
              {/* A tarja de aviso está por cima do verde profundo da aurora:
                  letra branca, e o âmbar sobrevive no ícone e no anel. */}
              <div className="text-sm leading-relaxed text-ink">
                <p className="font-semibold">
                  {motivo || "O portal ainda não foi configurado neste servidor."}
                </p>
                {/* Sem o nome das variáveis aqui, de propósito. Este bloco é
                    servido no HTML de /rh para QUALQUER visitante sem sessão, e
                    `segredosConfigurados()` já parou de citá-las por isso mesmo
                    (`servidor/sessao.ts`): repeti-las na tela desfaria a
                    correção. Quem opera o servidor recebe a lista exata no
                    `console.warn` do processo, que é onde ela é útil. */}
                <p className="mt-2 text-ink-soft">
                  Faltam variáveis de ambiente do portal. O log do servidor diz quais — configure-as
                  no provedor de hospedagem e publique de novo.
                </p>
              </div>
            </div>
          ) : null}

          <form
            className="mt-6"
            onSubmit={(evento) => {
              evento.preventDefault();
              if (bloqueado) return;
              aoEnviar(senha);
            }}
          >
            {/* O `!` continua necessário porque `.rh-rotulo` declara a cor fora
                de qualquer @layer e venceria a utilitária — sem ele o rótulo
                sairia em --brand-text sobre o verde profundo, a 1,8:1. A cor,
                porém, virou branca: sobre fundo verde a letra é branca. */}
            <label className="rh-rotulo" htmlFor={idSenha}>
              Senha do painel
            </label>

            <div className="relative">
              <input
                id={idSenha}
                name="senha"
                type={mostrar ? "text" : "password"}
                className="rh-campo"
                // O padding da direita é inline porque `.rh-campo` declara
                // `padding` fora de qualquer camada do Tailwind e venceria a
                // utilitária correspondente.
                style={{ paddingRight: "3.25rem" }}
                value={senha}
                onChange={(evento) => setSenha(evento.target.value)}
                disabled={!configurado || ocupado}
                autoComplete="current-password"
                // Foco automático é seguro aqui, e só aqui: a tela inteira
                // existe para este campo, então roubar o foco não tira ninguém
                // do lugar em que estava.
                autoFocus
                aria-describedby={descreve}
                aria-invalid={erro !== ""}
                placeholder="••••••••"
              />

              <button
                type="button"
                onClick={() => setMostrar((v) => !v)}
                disabled={!configurado}
                aria-pressed={mostrar}
                aria-label={mostrar ? "Ocultar senha" : "Mostrar senha"}
                className="absolute inset-y-0 right-1 flex w-11 items-center justify-center rounded-xl text-ink-soft transition hover:text-forest disabled:opacity-50"
              >
                {mostrar ? (
                  <EyeOff size={18} aria-hidden="true" />
                ) : (
                  <Eye size={18} aria-hidden="true" />
                )}
              </button>
            </div>

            <p id={idAjuda} className="mt-2 text-xs leading-relaxed text-ink-soft">
              A senha é a mesma para toda a coordenação e fica só no servidor.
            </p>

            {erro ? (
              // `.rh-erro` não serve aqui: a cor dela é calibrada para papel
              // claro e sobre o verde profundo o vermelho fecha o contraste.
              // A letra do erro é branca (fundo verde), e o vermelho fica no
              // ícone — que, junto com o `role="alert"` e o peso da fonte, é o
              // que continua dizendo "isto é um erro" sem depender da cor.
              <p
                id={idErro}
                role="alert"
                className="mt-3 flex items-start gap-2 text-sm font-semibold text-ink"
              >
                <TriangleAlert
                  size={16}
                  className="mt-0.5 shrink-0 text-rose-300"
                  aria-hidden="true"
                />
                {erro}
              </p>
            ) : null}

            {contando ? (
              <p
                id={idEspera}
                aria-live="polite"
                className="mt-3 flex items-center gap-2 text-sm font-semibold text-ink"
              >
                <span
                  aria-hidden="true"
                  className="inline-flex h-2 w-2 shrink-0 rounded-full bg-amber-300"
                />
                Muitas tentativas seguidas. Tente de novo em {formatarEspera(restantes)}.
              </p>
            ) : null}

            <button
              type="submit"
              className="button-primary mt-6 w-full disabled:opacity-60"
              disabled={bloqueado}
            >
              <KeyRound size={18} aria-hidden="true" />
              {ocupado ? "Entrando..." : "Entrar no painel"}
            </button>
          </form>
        </div>

        <p className="mt-6 text-center text-sm">
          <a
            href="/"
            // Branco a 85% no repouso e branco cheio no hover: o realce não
            // pode virar letra lime sobre verde.
            className="inline-flex min-h-11 items-center gap-2 px-2 text-ink-soft underline-offset-4 transition hover:text-forest hover:underline"
          >
            <ArrowLeft size={15} aria-hidden="true" />
            Voltar ao site
          </a>
        </p>
      </main>
    </div>
  );
}
