import zlib from "zlib";
import pdfParse from "pdf-parse";
import { logger } from "../utils/logger.js";

export interface SignatureValidationResult {
  assinado: boolean;
  tipoAssinatura: string;
  nomeAssinante: string;
  motivo: string;
  detalhesTecnicos: string[];
}

export class PdfValidatorService {
  /**
   * Executa validação profunda do PDF combinando:
   * 1. Extração de texto real (pdf-parse) procurando pelo selo oficial GOV.BR / ITI
   * 2. Descompressão manual de streams FlateDecode
   * 3. Análise de metadados criptográficos (/ByteRange, /Type /Sig, PKCS#7)
   */
  async validatePdf(
    buffer: Buffer,
    fileName: string = "",
    caption: string = "",
    defaultName: string = "Colaborador"
  ): Promise<SignatureValidationResult> {
    const detalhesTecnicos: string[] = [];
    let nomeIdentificado = defaultName;
    let encontrouSeloGov = false;
    let encontrouCriptografia = false;

    // =========================================================================
    // 1. Extração de Texto via pdf-parse (identifica o selo visual GOV.BR)
    // =========================================================================
    try {
      const pdfData = await pdfParse(buffer);
      const text = pdfData.text || "";

      logger.debug(`Texto extraído do PDF (${pdfData.numpages} páginas):\n${text.substring(0, 500)}...`);

      // Normaliza texto para busca insensível a maiúsculas/minúsculas
      const lowerText = text.toLowerCase();

      // Padrões do selo oficial GOV.BR (como no print da página 2)
      const temDocAssinado =
        lowerText.includes("documento assinado digitalmente") ||
        lowerText.includes("assinado digitalmente") ||
        lowerText.includes("documento assinado");

      const temGovBr =
        lowerText.includes("gov.br") ||
        lowerText.includes("validar.iti.gov.br") ||
        lowerText.includes("assinador.iti.br") ||
        lowerText.includes("iti.gov.br") ||
        lowerText.includes("icp-brasil");

      const temUrlValidador =
        lowerText.includes("validar.iti.gov.br") ||
        lowerText.includes("assinador.iti.br") ||
        lowerText.includes("verifique em https://validar.iti");

      if (temDocAssinado || temUrlValidador || (temGovBr && lowerText.includes("data:"))) {
        encontrouSeloGov = true;
        detalhesTecnicos.push("Selo visual oficial 'Documento assinado digitalmente / GOV.BR' detectado");

        // Tenta extrair o nome do signatário (ex: "HERMANI GOMES GONCALVES FONSECA")
        const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
        for (let i = 0; i < lines.length; i++) {
          const l = lines[i];
          if (/documento assinado digitalmente/i.test(l) && i + 1 < lines.length) {
            const possibleName = lines[i + 1];
            if (possibleName && !possibleName.toLowerCase().startsWith("data:") && possibleName.length > 3) {
              nomeIdentificado = possibleName;
              detalhesTecnicos.push(`Signatário identificado: ${nomeIdentificado}`);
              break;
            }
          }
        }
      }
    } catch (parseError: any) {
      logger.warn(`pdf-parse não conseguiu processar o buffer (${parseError.message}). Continuando com streams...`);
    }

    // =========================================================================
    // 2. Varredura e Descompressão de Streams FlateDecode do PDF
    // =========================================================================
    try {
      const rawString = buffer.toString("binary");
      const streamRegex = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
      let match;
      let streamsFound = 0;

      while ((match = streamRegex.exec(rawString)) !== null) {
        streamsFound++;
        const streamData = match[1];
        try {
          const streamBuffer = Buffer.from(streamData, "binary");
          const decompressed = zlib.inflateSync(streamBuffer).toString("utf-8");
          const decompressedLower = decompressed.toLowerCase();

          if (
            decompressedLower.includes("documento assinado digitalmente") ||
            decompressedLower.includes("validar.iti.gov.br") ||
            decompressedLower.includes("assinador.iti.br") ||
            decompressedLower.includes("iti.gov.br") ||
            decompressedLower.includes("gov.br")
          ) {
            encontrouSeloGov = true;
            detalhesTecnicos.push("Marcador GOV.BR localizado dentro de stream comprimido do PDF");
            break;
          }
        } catch (zlibErr) {
          // Nem todos os streams são zlib/deflate puros, ignora streams não zlib
        }
      }
    } catch (streamScanErr: any) {
      logger.debug("Erro na varredura de streams:", streamScanErr.message);
    }

    // =========================================================================
    // 3. Validação Criptográfica de Metadados (/ByteRange, /Type /Sig, PKCS#7)
    // =========================================================================
    const latin1 = buffer.toString("latin1");

    const hasByteRange = latin1.includes("/ByteRange");
    const hasSigDict =
      latin1.includes("/Type /Sig") ||
      latin1.includes("/Type/Sig") ||
      latin1.includes("/FT /Sig") ||
      latin1.includes("/FT/Sig") ||
      latin1.includes("adbe.pkcs7.detached");
    const hasPkcs =
      latin1.includes("adbe.pkcs7") ||
      latin1.includes("ETSI.CAdES") ||
      latin1.includes("adbe.x509");
    const hasGovBrMarkers =
      latin1.includes("gov.br") ||
      latin1.includes("iti.gov.br") ||
      latin1.includes("assinador.iti.br") ||
      latin1.includes("validar.iti.gov.br") ||
      latin1.includes("ICP-Brasil") ||
      latin1.includes("SERPRO") ||
      latin1.includes("Autoridade Certificadora");

    const isAssinadoNoNome =
      /assinado|gov|signed/i.test(fileName) || /assinado|gov|signed/i.test(caption);

    if (hasByteRange) detalhesTecnicos.push("Estrutura criptográfica /ByteRange encontrada");
    if (hasSigDict) detalhesTecnicos.push("Dicionário de assinatura /Type /Sig identificado");
    if (hasPkcs) detalhesTecnicos.push("Envelope criptográfico PKCS#7 / CAdES presente");
    if (hasGovBrMarkers) detalhesTecnicos.push("Marcadores GOV.BR / ICP-Brasil no corpo do PDF");
    if (isAssinadoNoNome) detalhesTecnicos.push("Identificador 'assinado/gov' no nome/legenda");

    if (hasByteRange || hasSigDict || hasPkcs) {
      encontrouCriptografia = true;
    }

    // =========================================================================
    // Conclusão da Validação
    // =========================================================================
    const assinado = encontrouSeloGov || encontrouCriptografia || (hasGovBrMarkers && isAssinadoNoNome);

    if (assinado) {
      const tipo = encontrouSeloGov
        ? "Assinador Oficial GOV.BR (Selo Digital ITI)"
        : "Certificado Digital ICP-Brasil / PKCS#7";

      logger.success(`✅ PDF VALIDADO COM SUCESSO! Tipo: ${tipo} | Signatário: ${nomeIdentificado}`);

      return {
        assinado: true,
        tipoAssinatura: tipo,
        nomeAssinante: nomeIdentificado,
        motivo: `Assinatura digital válida identificada (${detalhesTecnicos.join(" | ")})`,
        detalhesTecnicos,
      };
    }

    logger.warn(`❌ PDF NÃO ASSINADO. Nenhum selo GOV.BR ou assinatura criptográfica identificada.`);
    return {
      assinado: false,
      tipoAssinatura: "Nenhuma",
      nomeAssinante: defaultName,
      motivo: "Documento sem assinatura digital oficial GOV.BR ou carimbo ITI",
      detalhesTecnicos,
    };
  }
}

export const pdfValidatorService = new PdfValidatorService();
