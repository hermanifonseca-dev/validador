import axios from "axios";
import { env } from "../config/env.js";
import { logger } from "../utils/logger.js";
import { pdfValidatorService, SignatureValidationResult } from "./pdf-validator.service.js";

export class GeminiService {
  /**
   * Executa auditoria combinando IA Multimodal Gemini e validação nativa de PDF
   */
  async auditPdfSignature(
    base64Pdf: string,
    buffer: Buffer,
    fileName: string = "",
    caption: string = "",
    defaultName: string = "Colaborador"
  ): Promise<SignatureValidationResult & { auditoriaIAExecutada: boolean }> {
    // 1. Sempre executa a validação nativa profunda primeiro (é instantânea e 100% precisa no texto/streams)
    const nativeResult = await pdfValidatorService.validatePdf(buffer, fileName, caption, defaultName);

    // Se a validação nativa já confirmou o selo GOV.BR no PDF, não precisamos obrigatoriamente da IA
    if (nativeResult.assinado) {
      logger.success(`Validação nativa de PDF aprovada com sucesso! (${nativeResult.tipoAssinatura})`);
      return {
        ...nativeResult,
        auditoriaIAExecutada: false,
      };
    }

    // 2. Se a validação nativa não identificou (ou se for imagem/scan), chama o Google Gemini Vision
    if (env.GEMINI_API_KEY && !env.GEMINI_API_KEY.includes("sua_chave") && base64Pdf) {
      try {
        logger.info("Executando auditoria visual com Google Gemini Vision AI...");

        const geminiPrompt =
          "Você é um auditor oficial de assinaturas digitais do governo brasileiro. " +
          "Analise detalhadamente o documento PDF em anexo em busca de assinaturas digitais do GOV.BR, ICP-Brasil ou Assinador ITI. " +
          "Procure especificamente por:\n" +
          "1. O selo/carimbo 'Documento assinado digitalmente' com o logotipo 'gov.br'\n" +
          "2. Nome do signatário (ex: HERMANI GOMES GONCALVES FONSECA)\n" +
          "3. Data da assinatura (ex: Data: DD/MM/AAAA HH:MM:SS)\n" +
          "4. Link de validação 'Verifique em https://validar.iti.gov.br' ou 'assinador.iti.br'\n\n" +
          "Responda EXCLUSIVAMENTE em JSON válido no formato:\n" +
          "{\"assinado\": true, \"tipo_assinatura\": \"GOV.BR\", \"nome_assinante\": \"nome identificado\", \"motivo\": \"explicação do que foi visto no documento\"}";

        const payload = {
          contents: [
            {
              parts: [
                { text: geminiPrompt },
                {
                  inlineData: {
                    mimeType: "application/pdf",
                    data: base64Pdf,
                  },
                },
              ],
            },
          ],
          generationConfig: {
            responseMimeType: "application/json",
            temperature: 0.1,
          },
        };

        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${env.GEMINI_API_KEY}`;

        const response = await axios.post(url, payload, {
          headers: { "Content-Type": "application/json" },
          timeout: 35000,
        });

        const rawAiText = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;

        if (rawAiText) {
          const cleanedText = rawAiText.replace(/^```json\s*/i, "").replace(/\s*```$/i, "").trim();
          const parsed = JSON.parse(cleanedText);

          logger.success(`Auditoria IA Gemini finalizada: Assinado=${parsed.assinado} (${parsed.motivo})`);

          if (parsed.assinado === true) {
            return {
              assinado: true,
              tipoAssinatura: parsed.tipo_assinatura || "GOV.BR",
              nomeAssinante: parsed.nome_assinante || defaultName,
              motivo: parsed.motivo || "Assinatura validada pelo Agente IA Gemini",
              detalhesTecnicos: ["Identificado visualmente pelo Google Gemini AI"],
              auditoriaIAExecutada: true,
            };
          }
        }
      } catch (aiErr: any) {
        logger.warn("Falha na chamada da IA Gemini:", aiErr.response?.data || aiErr.message);
      }
    }

    return {
      ...nativeResult,
      auditoriaIAExecutada: false,
    };
  }
}

export const geminiService = new GeminiService();
