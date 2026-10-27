import { getSupabaseAdminClient } from '../config/supabase.js';
import { claimAgendamentosParaNotificar } from '../repositories/publicacao.repository.js';
import { getSolicitacaoDetail } from '../repositories/solicitacao.repository.js';
import { buildPushTitle, notificarDesignerPush, solicitacaoUrl } from './designerPush.service.js';

/** Item 9 (requisito explícito): aviso 2h antes da publicação agendada. */
const ANTECEDENCIA_MS = 2 * 60 * 60 * 1000;
/** Janela de checagem (10 min) folgada o bastante para o cron de 5 em 5 min nunca perder um agendamento. */
const JANELA_MS = 10 * 60 * 1000;

export interface NotificarPublicacoesProximasResult {
  processados: number;
  enviados: number;
  semAssinatura: number;
  falhas: number;
}

/**
 * RF012/item 9: varre agendamentos cujo horário cai ~2h à frente e avisa,
 * por Web Push, o(s) dispositivo(s) do designer responsável. Nunca decide
 * nada de negócio — é só um canal de aviso best-effort, com a mesma
 * garantia de "nunca reenviar o mesmo aviso" que o restante do sistema já
 * usa para publicação/WhatsApp (idempotência via coluna dedicada).
 */
export async function notificarPublicacoesProximas(): Promise<NotificarPublicacoesProximasResult> {
  const adminClient = getSupabaseAdminClient();
  const agora = Date.now();
  const windowStart = new Date(agora + ANTECEDENCIA_MS - JANELA_MS / 2).toISOString();
  const windowEnd = new Date(agora + ANTECEDENCIA_MS + JANELA_MS / 2).toISOString();

  const agendamentos = await claimAgendamentosParaNotificar(adminClient, windowStart, windowEnd);

  const result: NotificarPublicacoesProximasResult = {
    processados: agendamentos.length,
    enviados: 0,
    semAssinatura: 0,
    falhas: 0,
  };

  for (const agendamento of agendamentos) {
    try {
      const solicitacao = await getSolicitacaoDetail(adminClient, agendamento.idSolicitacao);
      if (!solicitacao) continue;

      const horario = agendamento.horario.slice(0, 5);
      const payload = {
        title: buildPushTitle('Lembrete de publicação'),
        body: solicitacao.tema
          ? `A arte "${solicitacao.tema}" do cliente ${solicitacao.clienteNome} está agendada para ${horario}.`
          : `Uma arte do cliente ${solicitacao.clienteNome} está agendada para ${horario}.`,
        url: solicitacaoUrl(agendamento.idSolicitacao),
      };

      // Despacho unificado em `designerPush.service` (mesma limpeza de
      // assinatura expirada que existia aqui). O resultado já informa quantos
      // dispositivos existiam, então não é preciso consultar as assinaturas
      // uma segunda vez só para distinguir "sem aparelho" de "falha".
      const envio = await notificarDesignerPush(
        adminClient,
        solicitacao.idDesigner,
        payload,
        'lembrete-publicacao-2h',
      );
      if (envio.total === 0) result.semAssinatura += 1;
      else if (envio.enviados > 0) result.enviados += 1;
      else result.falhas += 1;
    } catch (error) {
      result.falhas += 1;
      console.error('[designhub:push] falha ao processar aviso de publicação próxima', {
        idAgendamento: agendamento.idAgendamento,
        message: error instanceof Error ? error.message.slice(0, 200) : 'erro desconhecido',
      });
    }
  }

  return result;
}
