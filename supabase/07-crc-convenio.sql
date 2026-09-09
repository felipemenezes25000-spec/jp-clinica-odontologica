-- ============================================================================
-- JP CRC OS — convênio do paciente. Aditivo: rode depois do 02.
--
-- POR QUE A COLUNA NASCE ANULÁVEL, e vai continuar assim
-- Porque quem preenche não é o CRC: é o Dental Office, na sincronização. Se a
-- API deles não devolver o campo — e não dá para saber antes de a credencial
-- chegar — a coluna fica nula para todo mundo, e isso não pode quebrar nada.
--
-- É por isso que o filtro de campanha por convênio é montado a partir dos
-- valores que EXISTEM na base, e não de uma lista fixa: se nenhum paciente tem
-- convênio, o campo simplesmente não aparece na tela. Um filtro que a clínica
-- vê e que nunca casa com ninguém é pior do que filtro nenhum — ela conclui
-- que o sistema está quebrado.
--
-- O índice é parcial (`where convenio is not null`) pelo mesmo motivo: enquanto
-- o campo não vier, ele não ocupa espaço nem custa escrita.
-- ============================================================================

alter table public.crc_patients
  add column if not exists convenio text;

create index if not exists crc_patients_convenio
  on public.crc_patients (organization_id, convenio)
  where convenio is not null;
