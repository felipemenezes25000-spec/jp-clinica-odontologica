/**
 * Configurações — os números que governam o comportamento do sistema.
 *
 * ATÉ AQUI ELES EXISTIAM E NÃO TINHAM TELA. `crc_settings` já era lido em toda
 * decisão — quantos dias até o recall, quantas horas de espera depois da falta,
 * quantos contatos por dia — mas mudar qualquer um deles exigia um INSERT à
 * mão. Uma regra que só o desenvolvedor consegue ajustar não é configuração: é
 * constante com passos extras.
 *
 * TRÊS DECISÕES QUE FAZEM A TELA SER SEGURA DE USAR:
 *
 *   CADA CAMPO DIZ O QUE ACONTECE SE MUDAR. "Contatos por dia" não significa
 *   nada sozinho; "quantas mensagens automáticas o mesmo paciente pode receber
 *   num dia" significa. Quem mexe precisa prever a consequência antes, não
 *   descobrir depois pelo WhatsApp de um paciente irritado.
 *
 *   O INTERVALO PERMITIDO FICA VISÍVEL, e o servidor o repete. A tela mostra
 *   "1 a 3" para não deixar alguém tentar 20; o servidor recusa 20 porque a
 *   tela pode ser contornada.
 *
 *   SALVA CAMPO A CAMPO, ao sair do campo. Um botão "salvar tudo" no fim de
 *   doze campos transforma um ajuste de um número numa transação — e faz quem
 *   mexeu num campo e desistiu sair sem saber se salvou.
 *
 * AS FLAGS FICAM AQUI, os kill switches NÃO. Flag é decisão de produto, tomada
 * com calma; kill switch é decisão de incidente, tomada às três da manhã, e
 * mora na tela de Integrações junto do resto do diagnóstico. Misturar os dois
 * faz alguém desligar a coisa errada com pressa.
 */
import { useCallback, useEffect, useState } from "react";

import {
  carregarConfiguracoes,
  definirFeatureFlag,
  salvarConfiguracaoNumerica,
  salvarHorarioComercial,
  type ConfiguracoesDto,
  type JanelaDoDia,
} from "@/lib/crc/api";

import {
  Aviso,
  BarraDeRecado,
  Botao,
  Campo,
  Cartao,
  Entrada,
  Interruptor,
  ListaEsqueleto,
  useAcao,
} from "./base";

const DIAS_DA_SEMANA = [
  "Domingo",
  "Segunda",
  "Terça",
  "Quarta",
  "Quinta",
  "Sexta",
  "Sábado",
] as const;

type CampoNumerico = {
  chave: keyof ConfiguracoesDto;
  rotulo: string;
  /** O que muda no mundo quando este número muda. */
  explicacao: string;
  min: number;
  max: number;
  unidade: string;
};

/**
 * Agrupados pelo que a pessoa quer mudar, e não pelo tipo do dado.
 *
 * "Quero incomodar menos" e "quero esperar mais antes de cobrar" são intenções
 * diferentes, e uma lista única de doze números obrigaria a lê-los todos para
 * achar qual serve.
 */
const GRUPOS: readonly { titulo: string; nota: string; campos: readonly CampoNumerico[] }[] = [
  {
    titulo: "Limites de contato",
    nota: "Os números que protegem o paciente de excesso — e o número da clínica de bloqueio.",
    campos: [
      {
        chave: "contatosPorDia",
        rotulo: "Contatos por paciente, por dia",
        explicacao:
          "Quantas mensagens automáticas a mesma pessoa pode receber num dia. Acima de 3 vira perseguição.",
        min: 1,
        max: 3,
        unidade: "mensagens",
      },
      {
        chave: "cooldownHoras",
        rotulo: "Intervalo mínimo entre contatos",
        explicacao:
          "Horas de silêncio obrigatório depois de falar com alguém, mesmo que outra automação queira falar.",
        min: 1,
        max: 720,
        unidade: "horas",
      },
      {
        chave: "envioPorHora",
        rotulo: "Teto de envios da clínica, por hora",
        explicacao:
          "Protege a conta do WhatsApp. Sem isso, uma campanha de 800 inativos vira 800 mensagens em minutos.",
        min: 1,
        max: 1000,
        unidade: "mensagens",
      },
      {
        chave: "tentativasPorJornada",
        rotulo: "Tentativas antes de chamar humano",
        explicacao:
          "Quantas vezes a automação insiste antes de desistir e criar tarefa para alguém ligar.",
        min: 1,
        max: 10,
        unidade: "tentativas",
      },
    ],
  },
  {
    titulo: "Quando cada automação dispara",
    nota: "Os prazos que decidem quem entra na fila, e quando.",
    campos: [
      {
        chave: "faltaEsperaHoras",
        rotulo: "Espera depois de uma falta",
        explicacao:
          "Tempo antes da primeira mensagem. Existe para o paciente ligar sozinho e a recepção registrar a remarcação de balcão.",
        min: 1,
        max: 168,
        unidade: "horas",
      },
      {
        chave: "confirmacaoAntecedenciaHoras",
        rotulo: "Antecedência da confirmação",
        explicacao: "Quantas horas antes da consulta o pedido de confirmação sai.",
        min: 2,
        max: 168,
        unidade: "horas",
      },
      {
        chave: "recallDias",
        rotulo: "Retorno de rotina",
        explicacao: "Dias sem consulta até o paciente virar oportunidade de retorno.",
        min: 30,
        max: 1095,
        unidade: "dias",
      },
      {
        chave: "recallLongoDias",
        rotulo: "Segundo retorno",
        explicacao: "Para quem não respondeu ao primeiro. Precisa ser maior que o de rotina.",
        min: 60,
        max: 1825,
        unidade: "dias",
      },
      {
        chave: "inatividadeDias",
        rotulo: "Paciente considerado inativo",
        explicacao: "Dias sem aparecer até entrar nas campanhas de reativação.",
        min: 60,
        max: 1825,
        unidade: "dias",
      },
      {
        chave: "orcamentoParadoDias",
        rotulo: "Orçamento parado",
        explicacao: "Dias com o orçamento em aberto e sem resposta até virar oportunidade.",
        min: 1,
        max: 365,
        unidade: "dias",
      },
    ],
  },
];

const ROTULO_FLAG: Readonly<Record<string, { nome: string; explicacao: string }>> = {
  ai_autopilot: {
    nome: "IA pode agir sozinha",
    explicacao:
      "Dentro dos limites de confiança. Sem isto, a leitura automática só classifica e sugere.",
  },
  auto_scheduling: {
    nome: "Marcar consulta sem humano",
    explicacao:
      "Permite oferecer horários reais e reservar quando o paciente escolhe. Precisa da escrita no Dental Office ligada.",
  },
  dental_office_writeback: {
    nome: "Escrever no Dental Office",
    explicacao:
      "A única permissão que altera dado de terceiro. Sem ela, o aceite do paciente vira tarefa para a recepção digitar.",
  },
};

/**
 * As flags que existem no banco e ainda NÃO gatilham nada.
 *
 * Aparecem na tela, e aparecem DESABILITADAS. Esconder faria alguém encontrá-las
 * depois no banco e não saber o que são; deixar clicáveis daria um interruptor
 * que não faz nada — que é pior, porque quem o liga passa a acreditar que ligou
 * alguma coisa.
 */
const FLAGS_INERTES: Readonly<Record<string, { nome: string; explicacao: string }>> = {
  automatic_whatsapp: {
    nome: "Envio automático de WhatsApp",
    explicacao:
      "Ainda não faz nada: quem controla o envio hoje é o modo da automação e o interruptor de emergência, em Integrações.",
  },
  budget_integration: {
    nome: "Leitura de orçamentos",
    explicacao:
      "Ainda não faz nada, e não é esquecimento: a API v1.0 do Dental Office não expõe financeiro. " +
      "Até existir, orçamentos entram pela tela de Importar.",
  },
};

export function Configuracoes() {
  const [cfg, setCfg] = useState<ConfiguracoesDto | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const acao = useAcao();

  const recarregar = useCallback(async (): Promise<void> => {
    try {
      const r = await carregarConfiguracoes();
      if (r.ok) {
        setCfg(r.configuracoes);
        setErro(null);
      } else {
        setErro(r.message);
      }
    } catch {
      setErro("Não conseguimos carregar as configurações.");
    }
  }, []);

  useEffect(() => {
    void recarregar();
  }, [recarregar]);

  if (erro !== null && cfg === null) return <Aviso tom="perigo">{erro}</Aviso>;
  if (cfg === null) return <ListaEsqueleto linhas={6} />;

  const salvarNumero = (chave: string, valor: number): void => {
    void acao.executar(
      () => salvarConfiguracaoNumerica({ data: { chave, valor } }),
      undefined,
      "Configuração salva.",
    );
  };

  return (
    <div className="crc-pilha">
      <BarraDeRecado recado={acao.recado} aoFechar={acao.limpar} />

      {GRUPOS.map((grupo) => (
        <Cartao key={grupo.titulo} titulo={grupo.titulo}>
          <p className="crc-meta" style={{ marginTop: 0, marginBottom: "var(--crc-e4)" }}>
            {grupo.nota}
          </p>
          <div className="crc-grade">
            {grupo.campos.map((campo) => (
              <CampoNumero
                key={String(campo.chave)}
                campo={campo}
                valor={Number(cfg[campo.chave] ?? 0)}
                aoSalvar={(v) => {
                  salvarNumero(String(campo.chave), v);
                }}
              />
            ))}
          </div>
        </Cartao>
      ))}

      <HorarioComercial
        dias={cfg.dias}
        aoSalvar={(dias) => {
          void acao.executar(
            () => salvarHorarioComercial({ data: { dias } }),
            undefined,
            "Horário de atendimento salvo.",
          );
        }}
      />

      <Cartao titulo="Recursos">
        <p className="crc-meta" style={{ marginTop: 0, marginBottom: "var(--crc-e4)" }}>
          {cfg.podeMexerEmFlags
            ? "Toda flag nasce desligada. Ligar uma muda o que o sistema faz sozinho."
            : "Só administradores e gestores mudam estes recursos."}
        </p>
        <div className="crc-pilha">
          {Object.entries(ROTULO_FLAG).map(([chave, texto]) => (
            <div key={chave} className="crc-linha" style={{ gap: "var(--crc-e3)" }}>
              <Interruptor
                rotulo={texto.nome}
                ligado={cfg.flags[chave] === true}
                desabilitado={!cfg.podeMexerEmFlags}
                aoMudar={(ligada) => {
                  void acao
                    .executar(
                      () => definirFeatureFlag({ data: { chave, ligada } }),
                      undefined,
                      ligada ? "Recurso ligado." : "Recurso desligado.",
                    )
                    // O estado local só muda depois do servidor confirmar. Um
                    // interruptor otimista que volta sozinho dá a impressão de
                    // que a tela está quebrada.
                    .then(() => recarregar());
                }}
              />
              <span style={{ flex: 1, minWidth: 0 }}>
                <strong style={{ fontSize: "0.9375rem" }}>{texto.nome}</strong>
                <span className="crc-meta" style={{ display: "block" }}>
                  {texto.explicacao}
                </span>
              </span>
            </div>
          ))}

          {Object.entries(FLAGS_INERTES).map(([chave, texto]) => (
            <div key={chave} className="crc-linha" style={{ gap: "var(--crc-e3)", opacity: 0.6 }}>
              <Interruptor
                rotulo={texto.nome}
                ligado={false}
                desabilitado
                aoMudar={() => {
                  // Sem efeito por construção: a flag não é lida por nada.
                }}
              />
              <span style={{ flex: 1, minWidth: 0 }}>
                <strong style={{ fontSize: "0.9375rem" }}>{texto.nome}</strong>
                <span className="crc-meta" style={{ display: "block" }}>
                  {texto.explicacao}
                </span>
              </span>
            </div>
          ))}
        </div>
      </Cartao>
    </div>
  );
}

/**
 * Um número, salvo ao sair do campo.
 *
 * O ESTADO LOCAL É TEXTO, e não número: um campo controlado por `number`
 * apaga o que a pessoa digitou no instante em que ela apaga o último dígito
 * para trocar 180 por 90.
 */
function CampoNumero({
  campo,
  valor,
  aoSalvar,
}: {
  campo: CampoNumerico;
  valor: number;
  aoSalvar: (valor: number) => void;
}) {
  const [texto, setTexto] = useState(String(valor));

  useEffect(() => {
    setTexto(String(valor));
  }, [valor]);

  const foraDoIntervalo =
    texto.trim().length > 0 &&
    (!Number.isFinite(Number(texto)) || Number(texto) < campo.min || Number(texto) > campo.max);

  const dica = foraDoIntervalo
    ? `Precisa estar entre ${String(campo.min)} e ${String(campo.max)} ${campo.unidade}.`
    : `${campo.explicacao} (${String(campo.min)} a ${String(campo.max)} ${campo.unidade})`;

  return (
    <Campo rotulo={campo.rotulo} dica={dica}>
      {(id) => (
        <Entrada
          id={id}
          type="number"
          inputMode="numeric"
          min={campo.min}
          max={campo.max}
          value={texto}
          aria-invalid={foraDoIntervalo}
          onChange={(e) => {
            setTexto(e.target.value);
          }}
          onBlur={() => {
            const n = Number(texto);
            // Valor fora do intervalo VOLTA ao que era, em vez de virar erro
            // pendente: o campo é salvo ao sair, e deixar um número recusado
            // na tela faria parecer que ele está valendo.
            if (!Number.isFinite(n) || n === valor || foraDoIntervalo) {
              setTexto(String(valor));
              return;
            }
            aoSalvar(n);
          }}
        />
      )}
    </Campo>
  );
}

/**
 * A semana inteira, salva de uma vez.
 *
 * DIA FECHADO É UM ESTADO, e não um horário vazio. Sem a caixa "atende", um
 * domingo com campos em branco é indistinguível de um domingo que alguém
 * esqueceu de preencher — e a diferença entre os dois é se a automação fala
 * com paciente no domingo.
 */
function HorarioComercial({
  dias,
  aoSalvar,
}: {
  dias: JanelaDoDia[];
  aoSalvar: (dias: JanelaDoDia[]) => void;
}) {
  const [rascunho, setRascunho] = useState<JanelaDoDia[]>(dias);

  useEffect(() => {
    setRascunho(dias);
  }, [dias]);

  const mudou = JSON.stringify(rascunho) !== JSON.stringify(dias);
  const invalido = rascunho.some((d) => d !== null && d.fim <= d.inicio);

  return (
    <Cartao titulo="Horário de atendimento">
      <p className="crc-meta" style={{ marginTop: 0, marginBottom: "var(--crc-e4)" }}>
        A janela em que a automação pode falar com paciente. Fora dela a mensagem é adiada, nunca
        cancelada.
      </p>
      <div className="crc-pilha">
        {DIAS_DA_SEMANA.map((nome, i) => {
          const dia = rascunho[i] ?? null;
          const atende = dia !== null;

          return (
            <div key={nome} className="crc-linha" style={{ gap: "var(--crc-e3)" }}>
              <label style={{ minWidth: "9rem", display: "flex", gap: "var(--crc-e2)" }}>
                <input
                  type="checkbox"
                  checked={atende}
                  onChange={(e) => {
                    setRascunho((atual) =>
                      atual.map((d, j) =>
                        j === i ? (e.target.checked ? { inicio: "08:00", fim: "18:00" } : null) : d,
                      ),
                    );
                  }}
                />
                <span>{nome}</span>
              </label>

              {atende ? (
                <>
                  <Entrada
                    type="time"
                    value={dia.inicio}
                    style={{ width: "7rem" }}
                    onChange={(e) => {
                      setRascunho((atual) =>
                        atual.map((d, j) =>
                          j === i && d !== null ? { ...d, inicio: e.target.value } : d,
                        ),
                      );
                    }}
                  />
                  <span className="crc-meta">até</span>
                  <Entrada
                    type="time"
                    value={dia.fim}
                    style={{ width: "7rem" }}
                    onChange={(e) => {
                      setRascunho((atual) =>
                        atual.map((d, j) =>
                          j === i && d !== null ? { ...d, fim: e.target.value } : d,
                        ),
                      );
                    }}
                  />
                </>
              ) : (
                <span className="crc-meta">fechado</span>
              )}
            </div>
          );
        })}

        {invalido && (
          <Aviso tom="alerta">
            Há um dia com o fim antes do início. Uma janela assim nunca abre, e a automação adiaria
            a mensagem para sempre.
          </Aviso>
        )}

        <div className="crc-linha">
          <Botao
            disabled={!mudou || invalido}
            onClick={() => {
              aoSalvar(rascunho);
            }}
          >
            Salvar a semana
          </Botao>
          {mudou && (
            <Botao
              variante="discreto"
              onClick={() => {
                setRascunho(dias);
              }}
            >
              Descartar
            </Botao>
          )}
        </div>
      </div>
    </Cartao>
  );
}
