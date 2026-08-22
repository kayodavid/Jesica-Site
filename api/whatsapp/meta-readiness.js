const DEFAULT_META_API_VERSION = 'v26.0';
const META_PHONE_FIELDS = [
  'id',
  'display_phone_number',
  'verified_name',
  'status',
  'quality_rating',
  'code_verification_status',
  'account_mode',
  'host_platform'
].join(',');

function result(ready, reason, data = {}) {
  return { ready, reason, ...data };
}

function configuredApiVersion() {
  const value = String(process.env.WHATSAPP_GRAPH_API_VERSION || '').trim();
  return /^v\d+\.\d+$/.test(value) ? value : DEFAULT_META_API_VERSION;
}

export async function getMetaReadiness() {
  const accessToken = String(process.env.WHATSAPP_ACCESS_TOKEN || '').trim();
  const phoneNumberId = String(process.env.WHATSAPP_PHONE_NUMBER_ID || '').trim();
  if (!accessToken || !phoneNumberId) {
    return result(false, 'A API oficial do WhatsApp ainda não foi configurada no servidor.');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  let response;
  let payload = {};
  try {
    const query = new URLSearchParams({ fields: META_PHONE_FIELDS });
    response = await fetch(`https://graph.facebook.com/${configuredApiVersion()}/${encodeURIComponent(phoneNumberId)}?${query.toString()}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
      signal: controller.signal
    });
    payload = await response.json().catch(() => ({}));
  } catch (error) {
    const reason = error?.name === 'AbortError'
      ? 'A validação da API Meta excedeu o tempo limite. Tente novamente.'
      : 'Não foi possível conectar à API oficial do WhatsApp para validar a integração.';
    return result(false, reason);
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) return result(false, 'A credencial da API Meta não foi aceita ou não possui as permissões necessárias.');
    if (response.status === 404) return result(false, 'O número profissional configurado não foi encontrado na conta WhatsApp Business da Meta.');
    return result(false, 'A Meta não confirmou a disponibilidade do número profissional.');
  }

  const actualId = String(payload?.id || '').trim();
  const status = String(payload?.status || '').trim().toUpperCase();
  const codeVerification = String(payload?.code_verification_status || '').trim().toUpperCase();
  const hostPlatform = String(payload?.host_platform || '').trim().toUpperCase();
  if (!actualId || actualId !== phoneNumberId) return result(false, 'A Meta retornou um número diferente do número configurado no servidor.');
  if (status !== 'CONNECTED') return result(false, 'O número profissional ainda não está conectado à Cloud API da Meta.');
  if (codeVerification && codeVerification !== 'VERIFIED') return result(false, 'A verificação do número profissional ainda não foi concluída na Meta.');
  if (hostPlatform && hostPlatform !== 'CLOUD_API') return result(false, 'O número configurado não está hospedado na Cloud API da Meta.');

  return result(true, 'API oficial Meta/WhatsApp validada.', {
    phoneNumberId: actualId,
    displayPhoneNumber: String(payload?.display_phone_number || '').trim(),
    verifiedName: String(payload?.verified_name || '').trim(),
    status,
    qualityRating: String(payload?.quality_rating || '').trim()
  });
}

export function publicReadiness(readiness) {
  return {
    ready: readiness?.ready === true,
    reason: String(readiness?.reason || 'A integração oficial do WhatsApp ainda não foi validada.'),
    ...(readiness?.ready === true ? {
      displayPhoneNumber: String(readiness.displayPhoneNumber || ''),
      verifiedName: String(readiness.verifiedName || ''),
      status: String(readiness.status || '')
    } : {})
  };
}
