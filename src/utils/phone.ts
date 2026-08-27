/**
 * Normaliza número de telefone brasileiro para o formato aceito pelo WhatsApp (WAHA)
 * @param telefone String ou número do telefone (ex: "33984282601", "5533984282601", "(33) 98428-2601")
 * @returns Objeto com cleanTel, rawTel e chatId (ex: "553384282601@c.us")
 */
export function formatPhoneNumber(telefone: string | number | undefined | null): {
  cleanTel: string;
  rawTel: string;
  chatId: string;
} {
  if (!telefone) {
    return { cleanTel: "", rawTel: "", chatId: "" };
  }

  let rawTel = String(telefone).replace(/\D/g, "");

  // Se tem 10 (DDD + 8 dígitos) ou 11 (DDD + 9 dígitos), adiciona DDI 55
  if (rawTel.length === 10 || rawTel.length === 11) {
    rawTel = "55" + rawTel;
  }

  let cleanTel = rawTel;
  // Se tem 13 dígitos com 55 + DDD (2 dígitos) + 9 (1 dígito) + 8 dígitos, remove o 9º dígito conforme padrão WhatsApp
  if (rawTel.length === 13 && rawTel.startsWith("55")) {
    cleanTel = rawTel.substring(0, 4) + rawTel.substring(5);
  }

  const chatId = cleanTel ? `${cleanTel}@c.us` : "";

  return {
    cleanTel,
    rawTel,
    chatId,
  };
}

/**
 * Extrai o ID da viagem a partir do nome do arquivo ou legenda
 * Exemplo: "viagem-54_assinado.pdf" -> 54, "Viagem #54" -> 54, "Prestação Viagem 12" -> 12
 */
export function extractViagemId(text: string): number | null {
  if (!text) return null;
  // Aceita "viagem-54", "viagem_54", "viagem 54", "viagem #54", "viagem#54", etc.
  const match = text.match(/viagem[-_\s#]*(\d+)/i);
  if (match && match[1]) {
    return parseInt(match[1], 10);
  }
  return null;
}
