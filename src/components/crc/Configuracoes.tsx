import { useCallback, useEffect, useState } from "react";
import {
  Bot,
  Clock3,
  RotateCcw,
  Save,
  ShieldCheck,
  SlidersHorizontal,
} from "lucide-react";

import {
  carregarConfiguracoes,
  definirFeatureFlag,
  salvarConfiguracaoNumerica,
  salvarHorarioComercial,
  type ConfiguracoesDto,
  type JanelaDoDia,
} from "@/lib/crc/api";

import { Aviso, BarraDeRecado, Botao, Entrada, Interruptor, ListaEsqueleto, useAcao } from "./base";
import "./crc-settings.css";

const DIAS_DA_SEMANA = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"] as const;

type CampoNumerico = {
  chave: keyof ConfiguracoesDto;
  rotulo: string;
  explicacao: string;
  min: number;
  max: number;
  unidade: string;
};

const GRUPOS: readonly { titulo: string; nota: string; icone: typeof ShieldCheck; campos: readonly CampoNumerico[] }[] = [
  {
    titulo: "Limites de contato",
    nota: "Protegem o paciente de excesso e o número da clínica de bloqueio.",
    icone: ShieldCheck,
    campos: [
      { chave: "contatosPorDia", rotulo: "Contatos por paciente, por dia", explicacao: "Quantas mensagens automáticas a mesma pessoa pode receber num dia.", min: 1, max: 3, unidade: "mensagens" },
      { chave: "cooldownHoras", rotulo: "Intervalo mínimo entre contatos", explicacao: "Horas de silêncio obrigatório depois de falar com alguém, mesmo que outra automação queira falar.", min: 1, max: 720, unidade: "horas" },
      { chave: "envioPorHora", rotulo: "Teto de envios da clínica, por hora", explicacao: "Protege a conta do WhatsApp de picos de disparo.", min: 1, max: 1000, unidade: "mensagens" },
      { chave: "tentativasPorJornada", rotulo: "Tentativas antes de chamar humano", explicacao: "Quantas vezes a automação insiste antes de desistir e criar tarefa manual.", min: 1, max: 10, unidade: "tentativas" },
    ],
  },
  {
    titulo: "Quando cada automação dispara",
    nota: "Prazos que decidem quem entra na fila e em qual momento.",
    icone: Clock3,
    campos: [
      { chave: "faltaEsperaHoras", rotulo: "Espera depois de uma falta", explicacao: "Tempo antes da primeira mensagem após uma falta.", min: 1, max: 168, unidade: "horas" },
      { chave: "confirmacaoAntecedenciaHoras", rotulo: "Antecedência da confirmação", explicacao: "Quantas horas antes da consulta o pedido de confirmação sai.", min: 2, max: 168, unidade: "horas" },
      { chave: "recallDias", rotulo: "Retorno de rotina", explicacao: "Dias sem consulta até o paciente virar oportunidade de retorno.", min: 30, max: 1095, unidade: "dias" },
      { chave: "recallLongoDias", rotulo: "Segundo retorno", explicacao: "Prazo para quem não respondeu ao primeiro retorno.", min: 60, max: 1825, unidade: "dias" },
      { chave: "inatividadeDias", rotulo: "Paciente considerado inativo", explicacao: "Dias sem aparecer até entrar nas campanhas de reativação.", min: 60, max: 1825, unidade: "dias" },
      { chave: "orcamentoParadoDias", rotulo: "Orçamento parado", explicacao: "Dias em aberto e sem resposta até virar oportunidade.", min: 1, max: 365, unidade: "dias" },
    ],
  },
];

const ROTULO_FLAG: Readonly<Record<string, { nome: string; explicacao: string }>> = {
  ai_autopilot: { nome: "IA pode agir sozinha", explicacao: "Dentro dos limites de confiança. Sem isto, a leitura automática apenas classifica e sugere." },
  auto_scheduling: { nome: "Marcar consulta sem humano", explicacao: "Permite oferecer horários reais e reservar quando o paciente escolhe. Precisa da escrita no Dental Office ligada." },
  dental_office_writeback: { nome: "Escrever no Dental Office", explicacao: "Permite que o CRC crie e altere agendamentos no sistema da clínica." },
};

const FLAGS_INERTES: Readonly<Record<string, { nome: string; explicacao: string }>> = {
  automatic_whatsapp: { nome: "Envio automático de WhatsApp", explicacao: "Ainda não controla nada. Hoje o envio é governado pelo modo da automação e pelo interruptor de emergência." },
  budget_integration: { nome: "Leitura de orçamentos", explicacao: "Ainda não controla nada: a API atual do Dental Office não expõe financeiro. Orçamentos entram pela tela Importar." },
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
      } else setErro(r.message);
    } catch {
      setErro("Não conseguimos carregar as configurações.");
    }
  }, []);

  useEffect(() => { void recarregar(); }, [recarregar]);

  if (erro !== null && cfg === null) return <Aviso tom="perigo">{erro}</Aviso>;
  if (cfg === null) return <ListaEsqueleto linhas={6} />;

  const salvarNumero = (chave: string, valor: number): void => {
    void acao.executar(() => salvarConfiguracaoNumerica({ data: { chave, valor } }), undefined, "Configuração salva.");
  };

  return (
    <div className="crc-settings-v2">
      <BarraDeRecado recado={acao.recado} aoFechar={acao.limpar} />

      <section className="crc-settings-command-v2">
        <div>
          <div className="crc-settings-kicker-v2"><SlidersHorizontal size={14} aria-hidden="true" /> Regras da operação</div>
          <h2>Mude comportamento com consequência explícita.</h2>
          <p>Todos os limites abaixo são validados também no servidor. Campos numéricos salvam ao sair; horário da semana salva em conjunto.</p>
        </div>
        <span className="crc-settings-status-v2"><ShieldCheck aria-hidden="true" /> Regras protegidas pelo backend</span>
      </section>

      {GRUPOS.map((grupo) => {
        const Icone = grupo.icone;
        return (
          <section key={grupo.titulo} className="crc-settings-painel-v2">
            <header><span><Icone aria-hidden="true" /></span><div><small>Comportamento</small><h2>{grupo.titulo}</h2><p>{grupo.nota}</p></div></header>
            <div className="crc-settings-grid-v2">
              {grupo.campos.map((campo) => (
                <CampoNumero
                  key={String(campo.chave)}
                  campo={campo}
                  valor={Number(cfg[campo.chave] ?? 0)}
                  aoSalvar={(v) => salvarNumero(String(campo.chave), v)}
                />
              ))}
            </div>
          </section>
        );
      })}

      <HorarioComercial
        dias={cfg.dias}
        aoSalvar={(dias) => {
          void acao.executar(() => salvarHorarioComercial({ data: { dias } }), undefined, "Horário de atendimento salvo.");
        }}
      />

      <section className="crc-settings-painel-v2 crc-settings-recursos-v2">
        <header><span><Bot aria-hidden="true" /></span><div><small>Autonomia</small><h2>Recursos do sistema</h2><p>{cfg.podeMexerEmFlags ? "Ligar uma flag muda o que o CRC pode fazer sozinho." : "Só administradores e gestores mudam estes recursos."}</p></div></header>
        <div className="crc-settings-flags-v2">
          {Object.entries(ROTULO_FLAG).map(([chave, texto]) => (
            <article key={chave} data-ligado={cfg.flags[chave] === true ? "sim" : "nao"}>
              <div><strong>{texto.nome}</strong><p>{texto.explicacao}</p></div>
              <Interruptor
                rotulo={texto.nome}
                ligado={cfg.flags[chave] === true}
                desabilitado={!cfg.podeMexerEmFlags}
                aoMudar={(ligada) => {
                  void acao.executar(() => definirFeatureFlag({ data: { chave, ligada } }), undefined, ligada ? "Recurso ligado." : "Recurso desligado.").then(() => recarregar());
                }}
              />
            </article>
          ))}

          {Object.entries(FLAGS_INERTES).map(([chave, texto]) => (
            <article key={chave} className="crc-settings-flag-inerte-v2">
              <div><strong>{texto.nome}</strong><p>{texto.explicacao}</p><span>Disponível no banco, sem comportamento conectado</span></div>
              <Interruptor rotulo={texto.nome} ligado={false} desabilitado aoMudar={() => {}} />
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

function CampoNumero({ campo, valor, aoSalvar }: { campo: CampoNumerico; valor: number; aoSalvar: (valor: number) => void }) {
  const [texto, setTexto] = useState(String(valor));
  useEffect(() => { setTexto(String(valor)); }, [valor]);

  const foraDoIntervalo = texto.trim().length > 0 && (!Number.isFinite(Number(texto)) || Number(texto) < campo.min || Number(texto) > campo.max);

  return (
    <article className="crc-settings-numero-v2" data-invalido={foraDoIntervalo ? "sim" : "nao"}>
      <div className="crc-settings-numero-topo-v2"><label htmlFor={`cfg-${String(campo.chave)}`}>{campo.rotulo}</label><span>{campo.min}–{campo.max} {campo.unidade}</span></div>
      <div className="crc-settings-numero-campo-v2">
        <Entrada
          id={`cfg-${String(campo.chave)}`}
          type="number"
          inputMode="numeric"
          min={campo.min}
          max={campo.max}
          value={texto}
          aria-invalid={foraDoIntervalo}
          onChange={(e) => setTexto(e.target.value)}
          onBlur={() => {
            const n = Number(texto);
            if (!Number.isFinite(n) || n === valor || foraDoIntervalo) {
              setTexto(String(valor));
              return;
            }
            aoSalvar(n);
          }}
        />
        <span>{campo.unidade}</span>
      </div>
      <p>{campo.explicacao}</p>
    </article>
  );
}

function HorarioComercial({ dias, aoSalvar }: { dias: JanelaDoDia[]; aoSalvar: (dias: JanelaDoDia[]) => void }) {
  const [rascunho, setRascunho] = useState<JanelaDoDia[]>(dias);
  useEffect(() => { setRascunho(dias); }, [dias]);

  const mudou = JSON.stringify(rascunho) !== JSON.stringify(dias);
  const invalido = rascunho.some((d) => d !== null && d.fim <= d.inicio);

  return (
    <section className="crc-settings-painel-v2">
      <header><span><Clock3 aria-hidden="true" /></span><div><small>Janela útil</small><h2>Horário de atendimento</h2><p>Fora desta janela a automação não perde a mensagem: ela espera e envia na próxima abertura.</p></div></header>
      <div className="crc-settings-semana-v2">
        {DIAS_DA_SEMANA.map((nome, i) => {
          const dia = rascunho[i] ?? null;
          const atende = dia !== null;
          return (
            <article key={nome} data-aberto={atende ? "sim" : "nao"}>
              <label className="crc-settings-dia-toggle-v2"><input type="checkbox" checked={atende} onChange={(e) => setRascunho((atual) => atual.map((d,j) => j === i ? (e.target.checked ? { inicio:"08:00", fim:"18:00" } : null) : d))} /><span>{nome}</span></label>
              {atende ? (
                <div className="crc-settings-horas-v2">
                  <Entrada type="time" value={dia.inicio} onChange={(e) => setRascunho((atual) => atual.map((d,j) => j === i && d !== null ? { ...d, inicio:e.target.value } : d))} />
                  <span>até</span>
                  <Entrada type="time" value={dia.fim} onChange={(e) => setRascunho((atual) => atual.map((d,j) => j === i && d !== null ? { ...d, fim:e.target.value } : d))} />
                </div>
              ) : <span className="crc-settings-fechado-v2">Fechado</span>}
            </article>
          );
        })}
      </div>

      {invalido && <Aviso tom="alerta">Há um dia com o fim antes do início. Uma janela assim nunca abre, e a automação adiaria a mensagem indefinidamente.</Aviso>}

      <footer className="crc-settings-semana-acoes-v2">
        <span>{mudou ? "Há alterações ainda não salvas." : "Semana salva."}</span>
        {mudou && <Botao variante="discreto" onClick={() => setRascunho(dias)}><RotateCcw size={14} aria-hidden="true" /> Descartar</Botao>}
        <Botao variante="primario" disabled={!mudou || invalido} onClick={() => aoSalvar(rascunho)}><Save size={14} aria-hidden="true" /> Salvar semana</Botao>
      </footer>
    </section>
  );
}
