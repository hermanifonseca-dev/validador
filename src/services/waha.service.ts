import axios, { AxiosInstance } from "axios";
import { env } from "../config/env.js";
import { logger } from "../utils/logger.js";

export class WahaService {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: env.WAHA_BASE_URL,
      headers: {
        "Content-Type": "application/json",
        "X-Api-Key": env.WAHA_API_KEY,
        "x-api-key": env.WAHA_API_KEY,
        Authorization: `Bearer ${env.WAHA_API_KEY}`,
      },
      timeout: 30000,
    });
  }

  /**
   * Envia mensagem de texto via WhatsApp (WAHA)
   */
  async sendText(chatId: string, text: string, session: string = env.WAHA_SESSION): Promise<boolean> {
    try {
      logger.info(`Enviando mensagem de texto para ${chatId} (sessão: ${session})...`);
      
      const payload = {
        session,
        chatId,
        text,
      };

      await this.client.post("/api/sendText", payload);
      logger.success(`Mensagem de texto enviada com sucesso para ${chatId}`);
      return true;
    } catch (error: any) {
      const errorData = error.response?.data;
      const exceptionMsg = errorData?.exception?.message || errorData?.message || error.message;
      
      if (exceptionMsg && (exceptionMsg.includes("463") || exceptionMsg.includes("reachoutTimelock") || exceptionMsg.includes("ReachoutTimelock"))) {
        logger.error(
          `⚠️ [Reachout Timelock - Erro 463] O WhatsApp bloqueou temporariamente o envio para contatos novos/frios nesta sessão (${session}). ` +
          `O contato ${chatId} precisa mandar um 'oi' primeiro ou aguardar o fim da restrição do WhatsApp.`
        );
      } else {
        logger.error(`Erro ao enviar mensagem para ${chatId}:`, errorData || error.message);
      }
      return false;
    }
  }

  /**
   * Envia arquivo (PDF, imagem, documento) via WhatsApp (WAHA)
   */
  async sendFile(
    chatId: string,
    file: { mimetype: string; filename: string; url?: string; data?: string },
    session: string = env.WAHA_SESSION
  ): Promise<boolean> {
    try {
      logger.info(`Enviando arquivo (${file.filename}) para ${chatId}...`);

      const payload = {
        session,
        chatId,
        file,
      };

      await this.client.post("/api/sendFile", payload);
      logger.success(`Arquivo enviado com sucesso para ${chatId}`);
      return true;
    } catch (error: any) {
      const errorData = error.response?.data;
      const exceptionMsg = errorData?.exception?.message || errorData?.message || error.message;

      if (exceptionMsg && (exceptionMsg.includes("463") || exceptionMsg.includes("reachoutTimelock") || exceptionMsg.includes("ReachoutTimelock"))) {
        logger.error(
          `⚠️ [Reachout Timelock - Erro 463] O WhatsApp bloqueou temporariamente o envio de arquivos para contatos novos/frios nesta sessão (${session}). ` +
          `O contato ${chatId} precisa mandar uma mensagem primeiro ou aguardar a liberação do WhatsApp.`
        );
      } else {
        logger.error(`Erro ao enviar arquivo para ${chatId}:`, errorData || error.message);
      }
      return false;
    }
  }

  /**
   * Baixa a mídia do WhatsApp tentando as URLs do WAHA ou decodificando o Base64 inline
   */
  async downloadMedia(
    urlsToTry: string[],
    inlineBase64?: string | null
  ): Promise<{ buffer: Buffer | null; base64: string; downloadedFrom: string; errors: string[] }> {
    const errors: string[] = [];

    // 1. Tenta base64 inline primeiro se existir
    if (inlineBase64 && typeof inlineBase64 === "string" && inlineBase64.length > 100) {
      try {
        const buffer = Buffer.from(inlineBase64, "base64");
        if (buffer.length > 100) {
          logger.info(`Mídia obtida com sucesso via inlineBase64 (${buffer.length} bytes)`);
          return {
            buffer,
            base64: inlineBase64,
            downloadedFrom: "webhook_inline_base64",
            errors,
          };
        }
      } catch (e: any) {
        errors.push(`Erro ao decodificar base64 inline: ${e.message}`);
      }
    }

    // 2. Tenta fazer o download pelas URLs montadas
    for (const url of urlsToTry) {
      if (!url || url.startsWith("https://mmg.whatsapp.net") || url.includes("localhost:3000")) {
        continue;
      }

      try {
        logger.debug(`Tentando baixar mídia de: ${url}`);
        const response = await axios.get(url, {
          responseType: "arraybuffer",
          headers: {
            "X-Api-Key": env.WAHA_API_KEY,
            "x-api-key": env.WAHA_API_KEY,
            Authorization: `Bearer ${env.WAHA_API_KEY}`,
            Accept: "*/*",
          },
          timeout: 25000,
        });

        if (response.data) {
          let buffer: Buffer | null = null;
          if (Buffer.isBuffer(response.data)) {
            buffer = response.data;
          } else if (response.data instanceof ArrayBuffer) {
            buffer = Buffer.from(response.data);
          } else if (typeof response.data === "string" && response.data.length > 50) {
            buffer = Buffer.from(response.data, "binary");
          }

          if (buffer && buffer.length > 100) {
            logger.success(`Mídia baixada com sucesso de ${url} (${buffer.length} bytes)`);
            return {
              buffer,
              base64: buffer.toString("base64"),
              downloadedFrom: url,
              errors,
            };
          }
        }
      } catch (err: any) {
        errors.push(`${url} -> ${err.message || String(err)}`);
      }
    }

    logger.warn(`Não foi possível obter a mídia. Erros: ${errors.join(" | ")}`);
    return {
      buffer: null,
      base64: "",
      downloadedFrom: "",
      errors,
    };
  }
}

export const wahaService = new WahaService();
