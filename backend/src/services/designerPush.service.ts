import type { SupabaseClient } from '@supabase/supabase-js';
import { env } from '../config/env.js';
import {
  WebPushSubscriptionGoneError,
  sendWebPushNotification,
  type WebPushPayload,
} from '../integrations/webpush/webPushClient.js';
import {
  deletePushSubscriptionByEndpoint,
  listPushSubscriptionsByDesigner,
} from '../repositories/pushSubscription.repository.js';
import { getSolicitacaoDetail } from '../repositories/solicitacao.repository.js';

/**
 * Canal único de Web Push ao designer.
 *
 * Antes existiam duas cópias quase idênticas desta função (uma em
 * `avaliacao.service`, outra em `publicacaoNotificacao.service`), o que
 * obrigava a repetir a lógica de limpeza de assinatura expirada a cada novo
 * evento. Unificar é refatoração: o comportamento observável é o mesmo —
 * best-effort, nunca lança, remove a assinatura quando o navegador responde
 * 404/410 e envia a TODOS os dispositivos inscritos do designer.
 *
 * Web Push é canal COMPLEMENTAR. Nenhuma falha aqui pode interromper
 * aprovação, publicação, upload ou qualquer regra de negócio — e nada aqui
 * substitui o WhatsApp, que continua exatamente como está.
 */

/** Prefixo comum para o usuário identificar a origem na central de notificações. */
const TITLE_PREFIX = 'DesignHub';

export interface DesignerPushResult {
  /** Dispositivos que aceitaram a notificação (o serviço de push devolveu 2xx). */
  enviados: number;
  /** Assinaturas removidas por estarem expiradas/revogadas (404/410). */
  removidas: number;
  /** Dispositivos inscritos no momento do envio. */
  total: number;
}

/** Monta o título padronizado: "DesignHub — ARTE APROVADA". */
export function buildPushTitle(evento: string): string {
  return `${TITLE_PREFIX} — ${evento.toUpperCase()}`;
}

/** URL da solicitação no painel do designer — o clique abre a página correta. */
export function solicitacaoUrl(idSolicitacao: number): string {
  return `${env.FRONTEND_URL}/designer/solicitacoes/${idSolicitacao}`;
}

/** URL do painel de publicações/agendamentos. */
export function publicacoesUrl(): string {
  return `${env.FRONTEND_URL}/designer/publicacoes`;
}

/**
 * Envia a notificação a todos os dispositivos inscritos do designer.
 * Nunca lança: devolve o resultado para quem quiser registrar diagnóstico.
 */
export async function notificarDesignerPush(
  adminClient: SupabaseClient,
  idDesigner: string,
  payload: WebPushPayload,
  contexto: string,
): Promise<DesignerPushResult> {
  const result: DesignerPushResult = { enviados: 0, removidas: 0, total: 0 };

  let subscriptions;
  try {
    subscriptions = await listPushSubscriptionsByDesigner(adminClient, idDesigner);
  } catch (error) {
    console.error('[designhub:push] falha ao buscar assinaturas do designer', {
      contexto,
      message: error instanceof Error ? error.message.slice(0, 200) : 'erro desconhecido',
    });
    return result;
  }

  result.total = subscriptions.length;
  if (subscriptions.length === 0) {
    // Diagnóstico explícito: "não chegou nada" por falta de dispositivo
    // inscrito é diferente de falha de envio (nunca loga endpoint/chave).
    console.warn('[designhub:push] nenhum dispositivo inscrito para o designer', { contexto });
    return result;
  }

  for (const subscription of subscriptions) {
    try {
      await sendWebPushNotification(subscription, payload);
      result.enviados += 1;
    } catch (sendError) {
      if (sendError instanceof WebPushSubscriptionGoneError) {
        await deletePushSubscriptionByEndpoint(adminClient, subscription.endpoint).catch(() => undefined);
        result.removidas += 1;
        continue;
      }
      console.error('[designhub:push] falha ao enviar notificação', {
        contexto,
        message: sendError instanceof Error ? sendError.message.slice(0, 200) : 'erro desconhecido',
      });
    }
  }

  console.info('[designhub:push] resultado do envio', {
    contexto,
    total: result.total,
    enviados: result.enviados,
    removidas: result.removidas,
  });
  return result;
}

/**
 * Atalho para os eventos ligados a uma solicitação: resolve o designer
 * responsável e monta o link de destino. Best-effort de ponta a ponta — se a
 * solicitação não puder ser lida, nada acontece e a ação original segue.
 */
export async function notificarDesignerSolicitacaoPush(
  adminClient: SupabaseClient,
  params: {
    idSolicitacao: number;
    idDesigner: string;
    evento: string;
    body: string;
    url?: string;
  },
): Promise<void> {
  const payload: WebPushPayload = {
    title: buildPushTitle(params.evento),
    body: params.body,
    url: params.url ?? solicitacaoUrl(params.idSolicitacao),
  };
  await notificarDesignerPush(adminClient, params.idDesigner, payload, params.evento);
}

/**
 * Formata data/hora do agendamento para exibição: "27/10/2026 às 15:00".
 *
 * `dataPublicacao` (AAAA-MM-DD) e `horario` (HH:MM[:SS]) já são os valores
 * locais de America/Sao_Paulo gravados pelo RF012 — a conversão para
 * `timestamptz` acontece no trigger do banco. Por isso a formatação aqui é
 * puramente textual: criar um `Date` reinterpretaria os valores no fuso do
 * servidor e exibiria um horário errado ao designer.
 */
export function formatarDataHora(dataPublicacao: string, horario: string): string {
  const [ano, mes, dia] = dataPublicacao.split('-');
  if (!ano || !mes || !dia) return `${dataPublicacao} às ${horario.slice(0, 5)}`;
  return `${dia}/${mes}/${ano} às ${horario.slice(0, 5)}`;
}

/** Rótulo da arte para o corpo da notificação — nunca expõe dado sensível do cliente. */
export function artLabel(tema: string | null | undefined): string {
  return tema ? `a arte "${tema}"` : 'a arte';
}

/**
 * Atalho usado pela maioria dos eventos: resolve sozinho o designer
 * responsável e o tema da arte a partir da solicitação, para o chamador não
 * precisar carregar esses dados só por causa do aviso.
 *
 * Best-effort de ponta a ponta: se a solicitação não puder ser lida, nenhuma
 * notificação é enviada e a ação de negócio que chamou segue normalmente.
 * O `tema` é o único dado do cliente que entra na mensagem — nome, WhatsApp
 * e Instagram nunca aparecem (RNF010).
 */
export async function notificarEventoSolicitacao(
  adminClient: SupabaseClient,
  params: {
    idSolicitacao: number;
    evento: string;
    /** Recebe o rótulo pronto da arte (ex.: `a arte "Sinuca"`). */
    body: (arte: string) => string;
    url?: string;
  },
): Promise<void> {
  try {
    const solicitacao = await getSolicitacaoDetail(adminClient, params.idSolicitacao);
    if (!solicitacao) return;

    await notificarDesignerPush(
      adminClient,
      solicitacao.idDesigner,
      {
        title: buildPushTitle(params.evento),
        body: params.body(artLabel(solicitacao.tema)),
        url: params.url ?? solicitacaoUrl(params.idSolicitacao),
      },
      params.evento,
    );
  } catch (error) {
    console.error('[designhub:push] falha ao preparar notificação do evento', {
      contexto: params.evento,
      message: error instanceof Error ? error.message.slice(0, 200) : 'erro desconhecido',
    });
  }
}
