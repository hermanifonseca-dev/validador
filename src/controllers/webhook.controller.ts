import { Request, Response } from "express";
import { env } from "../config/env.js";
import { geminiService } from "../services/gemini.service.js";
import { supabaseService } from "../services/supabase.service.js";
import { wahaService } from "../services/waha.service.js";
import { logger } from "../utils/logger.js";
import { extractViagemId, formatPhoneNumber } from "../utils/phone.js";

export class WebhookController {
  /**
   * 1. Enviar Prestação para Assinatura (GOV.BR)
   * Rota: POST /webhook/prestacoes
   */
  async handleEnviarPrestacao(req: Request, res: Response): Promise<void> {
    try {
      const body = req.body || {};
      const nome = body.nome || "Colaborador";
      const telefone = body.telefone || "";
      const urlDoc = body.url || "";

      if (!urlDoc || !telefone) {
        res.status(400).json({
          success: false,
          error: "Campos obrigatórios ausentes: 'telefone' e 'url' são necessários.",
        });
        return;
      }

      const { cleanTel, chatId } = formatPhoneNumber(telefone);

      if (!chatId) {
        res.status(400).json({
          success: false,
          error: "Telefone inválido ou não foi possível formatar.",
        });
        return;
      }

      const nomeArquivo = (urlDoc.split("/").pop() || "prestacao_contas").replace(".pdf", "");

      logger.info(`Processando envio de prestação para ${nome} (${chatId})...`);

      // 1. Envia arquivo PDF
      const fileSent = await wahaService.sendFile(chatId, {
        mimetype: "application/pdf",
        filename: `${nomeArquivo}.pdf`,
        url: urlDoc,
      });

      // 2. Envia mensagem de texto com orientações
      const textoInstrucoes =
        `📃 Olá ${nome}! Sua Prestação de Contas foi gerada com sucesso.\n\n` +
        `✍️ *Instruções para Assinatura:*\n` +
        `1️⃣ Acesse o Assinador GOV.BR: https://assinador.iti.br\n` +
        `2️⃣ Faça login e assine o arquivo PDF em anexo\n` +
        `3️⃣ Reenvie o PDF assinado aqui nesta conversa para validação automática.`;

      await wahaService.sendText(chatId, textoInstrucoes);

      res.status(200).json({
        success: true,
        message: "Prestação enviada para o WhatsApp do colaborador com sucesso!",
        data: {
          nome,
          telefone: cleanTel,
          chatId,
          urlDocumento: urlDoc,
          arquivoEnviado: fileSent,
        },
      });
    } catch (error: any) {
      logger.error("Erro no fluxo de Envio de Prestação:", error);
      res.status(500).json({
        success: false,
        error: error.message || "Erro interno ao processar envio de prestação.",
      });
    }
  }

  /**
   * 2. Notificação de Recusa do Financeiro
   * Rota: POST ou GET /webhook/recusa (e /webhook/Recusa)
   */
  async handleNotificarRecusa(req: Request, res: Response): Promise<void> {
    try {
      const data = { ...req.query, ...req.body };
      const nome = data.nome_colaborador || data.nome || "Colaborador";
      const telefone = data.telefone || "";
      const motivo = data.motivo_recusa || data.motivo || "Inconsistência nas despesas ou comprovantes ausentes.";
      const viagemId = data.viagem_id || "";

      if (!telefone) {
        res.status(400).json({
          success: false,
          error: "Campo 'telefone' é obrigatório.",
        });
        return;
      }

      const { chatId } = formatPhoneNumber(telefone);

      if (!chatId) {
        res.status(400).json({
          success: false,
          error: "Telefone inválido para envio.",
        });
        return;
      }

      logger.info(`Notificando recusa para ${nome} (${chatId}) - Viagem #${viagemId}...`);

      const textoRecusa =
        `❌ Olá ${nome},\n\n` +
        `Sua prestação de contas${viagemId ? ` referente à Viagem #${viagemId}` : ""} foi recusada pelo setor financeiro.\n\n` +
        `📌 Motivo da Recusa:\n_${motivo}_\n\n` +
        `Por favor, faça os ajustes necessários no sistema ou nos comprovantes e nos envie o documento corrigido assinado.`;

      await wahaService.sendText(chatId, textoRecusa);

      res.status(200).json({
        success: true,
        message: "Notificação de recusa enviada com sucesso ao WhatsApp!",
        data: {
          nome,
          chatId,
          viagemId,
          motivo,
        },
      });
    } catch (error: any) {
      logger.error("Erro no fluxo de Recusa:", error);
      res.status(500).json({
        success: false,
        error: error.message || "Erro interno ao notificar recusa.",
      });
    }
  }

  /**
   * 3. Webhook de Recebimento do WAHA (Validação e Upload)
   * Rota: POST /webhook/receberpres
   */
  async handleReceberDocumento(req: Request, res: Response): Promise<void> {
    // Responde imediatamente 200 para o WAHA não dar timeout
    res.status(200).json({ received: true });

    try {
      const body = req.body || {};
      const payload = body.payload || {};
      const data = payload._data || {};
      const info = data.Info || {};

      const isFromMe = payload.fromMe === true || info.IsFromMe === true || data.isFromMe === true;

      // Se a mensagem foi enviada pelo próprio bot/número, ignora
      if (isFromMe) {
        logger.debug("Mensagem ignorada (fromMe = true)");
        return;
      }

      const rawSender = info.SenderAlt || payload.from || info.Sender || info.Chat || "";
      const cleanNumber = rawSender.replace(/@.*$/, "").replace(/\D/g, "");
      const chatId = cleanNumber ? `${cleanNumber}@c.us` : (payload.from || "");
      const pushName = info.PushName || payload.pushName || "Colaborador";

      const media = payload.media || {};
      const docMessage =
        data.Message?.documentMessage ||
        data.Message?.documentWithCaptionMessage?.message?.documentMessage ||
        {};

      const fileName =
        media.filename || docMessage.fileName || docMessage.title || payload.body || "documento.pdf";
      const caption = payload.body || docMessage.caption || "";

      const inlineBase64 =
        media.data || docMessage.base64 || data.Message?.base64 || data.base64 || null;

      const hasMedia =
        payload.hasMedia === true ||
        !!media.url ||
        !!docMessage.URL ||
        !!media.mimetype ||
        !!docMessage.mimetype ||
        !!inlineBase64;

      if (!hasMedia) {
        logger.debug("Mensagem ignorada (sem mídia/documento anexado)");
        return;
      }

      // Extrai ID da viagem
      let viagemId = extractViagemId(`${fileName} ${caption}`);

      const rawMediaUrl = media.url || "";
      const messageId = info.ID || (payload.id ? payload.id.split("_").pop() : "");
      const session = body.session || payload.session || env.WAHA_SESSION;
      const fileId = rawMediaUrl ? rawMediaUrl.split("/").pop() : (messageId ? `${messageId}.pdf` : "");

      const wahaBase = env.WAHA_BASE_URL;
      const wahaInternal = "http://polis-waha:3000";

      const urlsToTry: string[] = [];

      if (rawMediaUrl) {
        urlsToTry.push(rawMediaUrl);
        if (rawMediaUrl.includes("localhost:3000")) {
          urlsToTry.push(rawMediaUrl.replace("http://localhost:3000", wahaBase));
          urlsToTry.push(rawMediaUrl.replace("http://localhost:3000", wahaInternal));
        }
      }

      if (fileId) {
        urlsToTry.push(`${wahaBase}/api/files/${session}/${fileId}`);
        urlsToTry.push(`${wahaBase}/api/files/${fileId}`);
        urlsToTry.push(`${wahaBase}/api/default/files/${fileId}`);
        urlsToTry.push(`${wahaBase}/api/${session}/files/${fileId}`);
        urlsToTry.push(`${wahaInternal}/api/files/${session}/${fileId}`);
      }

      if (messageId) {
        urlsToTry.push(`${wahaBase}/api/${session}/chats/${chatId}/messages/${messageId}/media`);
        urlsToTry.push(`${wahaBase}/api/default/chats/${chatId}/messages/${messageId}/media`);
        urlsToTry.push(`${wahaBase}/api/chats/${chatId}/messages/${messageId}/media`);
        urlsToTry.push(`${wahaBase}/api/${session}/messages/${messageId}/media`);
        urlsToTry.push(`${wahaBase}/api/messages/${messageId}/media`);
        urlsToTry.push(`${wahaBase}/api/files/${session}/${messageId}.pdf`);
      }

      const uniqueUrls = [...new Set(urlsToTry.filter(Boolean))];

      logger.info(`📥 Processando documento recebido de ${pushName} (${chatId}): ${fileName}`);

      // Baixa mídia
      const { buffer, base64 } = await wahaService.downloadMedia(uniqueUrls, inlineBase64);

      if (!buffer || buffer.length === 0) {
        logger.warn(`Não foi possível baixar o buffer do documento de ${chatId}`);
        return;
      }

      // Executa auditoria de assinatura digital (IA Gemini + Fallback Criptográfico)
      const auditResult = await geminiService.auditPdfSignature(
        base64,
        buffer,
        fileName,
        caption,
        pushName
      );

      if (auditResult.assinado) {
        logger.success(`Documento assinado com sucesso pelo GOV.BR / ICP-Brasil!`);

        const resolvedViagemId = viagemId || 0;
        const storagePath = `prestacao-assinada/viagem${resolvedViagemId}_assinado.pdf`;

        // 1. Upload no Supabase Storage
        const publicUrl = await supabaseService.uploadSignedPdf(buffer, storagePath);

        // 2. Atualiza status no banco se tiver viagemId
        if (resolvedViagemId > 0) {
          await supabaseService.updateViagemPrestacao(resolvedViagemId, publicUrl, "Pendente");
        }

        // 3. Notifica o colaborador de que foi aceito
        const msgSucesso =
          `✅ Olá ${pushName}!\n\n` +
          `Sua prestação de contas${resolvedViagemId ? ` (Viagem #${resolvedViagemId})` : ""} assinada com o GOV.BR foi recebida com sucesso! 📄✍️\n\n` +
          `O documento foi registrado no sistema e encaminhado para validação e ressarcimento pelo setor financeiro.`;

        await wahaService.sendText(chatId, msgSucesso, session);
      } else {
        logger.warn(`Documento rejeitado: sem assinatura digital oficial.`);

        // Notifica o colaborador sobre a ausência da assinatura
        const msgAlerta =
          `⚠️ Olá ${pushName}!\n\n` +
          `Identificamos que o documento enviado (*${fileName}*) NÃO possui a assinatura digital do GOV.BR.\n\n` +
          `👉 Para assinar seu documento gratuitamente:\n` +
          `1️⃣ Acesse o assinador oficial: https://assinador.iti.br (ou use o app GOV.BR)\n` +
          `2️⃣ Faça login com sua conta GOV.BR e selecione o PDF da prestação\n` +
          `3️⃣ Posicione a assinatura e baixe o arquivo assinado\n` +
          `4️⃣ Reenvie o PDF assinado aqui nesta conversa.\n\n` +
          `Ficamos no aguardo para aprovar sua prestação! 🤝`;

        await wahaService.sendText(chatId, msgAlerta, session);
      }
    } catch (error: any) {
      logger.error("Erro ao processar recebimento de documento do WAHA:", error);
    }
  }
}

export const webhookController = new WebhookController();
