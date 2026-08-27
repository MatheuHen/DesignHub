import { apiRequest } from '../../../lib/apiClient';

export const SOLICITACAO_STATUSES = [
  'Em produção',
  'Enviado para avaliação',
  'Ajustes',
  'Aprovado',
  'Cancelado',
  'Agendado',
  'Publicado',
] as const;
export type SolicitacaoStatus = (typeof SOLICITACAO_STATUSES)[number];

export interface Solicitacao {
  id: number;
  idCliente: number;
  clienteNome: string;
  idDesigner: string;
  tema: string | null;
  status: SolicitacaoStatus;
  dataCriacao: string;
  prazoPrimeiraVersao: string;
}

export interface SolicitacaoDetail extends Solicitacao {
  descricao: string | null;
  cores: string | null;
  observacoes: string | null;
}

export interface HistoricoEntry {
  id_historico: number;
  acao: string;
  status_anterior: string | null;
  status_novo: string | null;
  data_hora: string;
}

export interface RespostaEntry {
  pergunta: string;
  resposta: string;
  data_hora: string;
}

export interface VersaoArteEntry {
  id_versao: number;
  numero_versao: number;
  formato: string;
  data_envio: string;
  observacoes: string | null;
}

export interface AgendamentoAtivo {
  idAgendamento: number;
  dataPublicacao: string;
  horario: string;
  legenda: string | null;
}

export interface AjusteEntry {
  idAjuste: number;
  numeroVersao: number | null;
  descricao: string;
  observacoes: string | null;
  imagemReferenciaUrl: string | null;
  createdAt: string;
}

export interface AgendamentoPreferencia {
  desejaAgendamento: boolean | null;
  dataDesejada: string | null;
  horarioDesejado: string | null;
}

export interface SolicitacaoDetailResult {
  solicitacao: SolicitacaoDetail;
  historico: HistoricoEntry[];
  respostasAtendimento: RespostaEntry[];
  versoes: VersaoArteEntry[];
  ajustes: AjusteEntry[];
  agendamento: AgendamentoAtivo | null;
  preferenciaAgendamento: AgendamentoPreferencia | null;
}

export interface ListSolicitacoesResult {
  items: Solicitacao[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ListSolicitacoesParams {
  status?: SolicitacaoStatus | undefined;
  idCliente?: number | undefined;
  dataInicio?: string | undefined;
  dataFim?: string | undefined;
  page?: number;
}

export interface UpdateSolicitacaoInput {
  tema?: string | null;
  cores?: string | null;
  observacoes?: string | null;
  descricao?: string | null;
}

/** RF005/RN44: lista/filtra as próprias solicitações do designer. */
export function listSolicitacoes(params: ListSolicitacoesParams): Promise<ListSolicitacoesResult> {
  const query = new URLSearchParams();
  if (params.status) query.set('status', params.status);
  if (params.idCliente) query.set('idCliente', String(params.idCliente));
  if (params.dataInicio) query.set('dataInicio', params.dataInicio);
  if (params.dataFim) query.set('dataFim', params.dataFim);
  query.set('page', String(params.page ?? 1));
  return apiRequest<ListSolicitacoesResult>(`/api/solicitacoes?${query.toString()}`);
}

/** RF005: detalhes com status, atendimento, versões e histórico. */
export function getSolicitacaoDetail(id: number): Promise<SolicitacaoDetailResult> {
  return apiRequest<SolicitacaoDetailResult>(`/api/solicitacoes/${id}`);
}

export function updateSolicitacao(id: number, input: UpdateSolicitacaoInput): Promise<void> {
  return apiRequest<void>(`/api/solicitacoes/${id}`, { method: 'PATCH', body: JSON.stringify(input) });
}

export interface UploadVersaoArteResult {
  idVersao: number;
  numeroVersao: number;
  status: SolicitacaoStatus;
}

/** RF007/RF008: envia PDF/JPG/PNG como nova versão; RN26 controla quando o backend aceita. */
export function uploadVersaoArte(
  id: number,
  arquivo: File,
  observacoes: string | undefined,
): Promise<UploadVersaoArteResult> {
  const formData = new FormData();
  formData.append('arquivo', arquivo);
  if (observacoes) formData.append('observacoes', observacoes);
  return apiRequest<UploadVersaoArteResult>(`/api/solicitacoes/${id}/versoes`, {
    method: 'POST',
    body: formData,
  });
}

export interface VersaoArteDownloadUrl {
  url: string;
  expiresInSeconds: number;
}

/**
 * RF008 + seção 12.5: URL assinada de curta duração para visualização/download.
 * `inline=true` pede `Content-Disposition: inline` (botão "Visualizar"); o
 * padrão continua forçando download (botão "Baixar").
 */
export function getVersaoArteDownloadUrl(
  id: number,
  idVersao: number,
  inline = false,
): Promise<VersaoArteDownloadUrl> {
  const suffix = inline ? '?inline=1' : '';
  return apiRequest<VersaoArteDownloadUrl>(`/api/solicitacoes/${id}/versoes/${idVersao}/download-url${suffix}`);
}

/** RF010 + seção 12.5: URL assinada de curta duração para a referência opcional de um ajuste. */
export function getAjusteReferenciaUrl(
  id: number,
  idAjuste: number,
  inline = false,
): Promise<VersaoArteDownloadUrl> {
  const suffix = inline ? '?inline=1' : '';
  return apiRequest<VersaoArteDownloadUrl>(`/api/solicitacoes/${id}/ajustes/${idAjuste}/referencia-url${suffix}`);
}

/** RF004/item 5 + seção 12.5: URL assinada de curta duração para a referência enviada pelo cliente no WhatsApp. */
export function getAtendimentoReferenciaUrl(id: number, inline = false): Promise<VersaoArteDownloadUrl> {
  const suffix = inline ? '?inline=1' : '';
  return apiRequest<VersaoArteDownloadUrl>(`/api/solicitacoes/${id}/atendimento-referencia-url${suffix}`);
}

export interface GerarLinkAvaliacaoResult {
  url: string;
  expiresAt: string;
  whatsappNotified: boolean;
  whatsappError?: string;
}

/** RF009/RN19: gera o link de avaliação da versão pendente e tenta notificar o cliente via WhatsApp. */
export function gerarLinkAvaliacao(id: number): Promise<GerarLinkAvaliacaoResult> {
  return apiRequest<GerarLinkAvaliacaoResult>(`/api/solicitacoes/${id}/link-avaliacao`, { method: 'POST' });
}

export interface AgendamentoInput {
  dataPublicacao: string;
  horario: string;
  legenda: string;
}

/** RF012/RN27/RN30: agenda a publicação — só aceito quando a solicitação está Aprovada. */
export function createAgendamento(
  id: number,
  input: AgendamentoInput,
): Promise<{ idAgendamento: number }> {
  return apiRequest<{ idAgendamento: number }>(`/api/solicitacoes/${id}/agendamento`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

/** RF012: edita o agendamento ativo da solicitação. */
export function updateAgendamento(id: number, input: AgendamentoInput): Promise<void> {
  return apiRequest<void>(`/api/solicitacoes/${id}/agendamento`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

/** RF013/RN31: cancela o agendamento ativo — só se faltarem >= 3h para o horário planejado. */
export function cancelAgendamento(id: number): Promise<void> {
  return apiRequest<void>(`/api/solicitacoes/${id}/agendamento`, { method: 'DELETE' });
}

/** RF014/RN29/RN33: fallback manual — designer registra que publicou fora do sistema. */
export function registrarPublicacaoManual(id: number): Promise<void> {
  return apiRequest<void>(`/api/solicitacoes/${id}/publicacao-manual`, { method: 'POST' });
}

export interface ClienteInstagramStatus {
  conectado: boolean;
  conectadoEm: string | null;
  expiraEm: string | null;
}

/** RF014/ADR 0005: status de conexão do Instagram do cliente desta solicitação — nunca o token. */
export function getClienteInstagramStatus(idCliente: number): Promise<ClienteInstagramStatus> {
  return apiRequest<ClienteInstagramStatus>(`/api/clientes/${idCliente}/instagram/status`);
}
