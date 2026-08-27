import { createClient, SupabaseClient } from "@supabase/supabase-js";
import axios from "axios";
import { env } from "../config/env.js";
import { logger } from "../utils/logger.js";

export class SupabaseService {
  private supabase: SupabaseClient;

  constructor() {
    this.supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }

  /**
   * Faz o upload do PDF assinado para o Supabase Storage
   * @param buffer Conteúdo binário do arquivo
   * @param storagePath Caminho no bucket (ex: "prestacao-assinada/viagem54_assinado.pdf")
   * @returns URL pública do documento salvo
   */
  async uploadSignedPdf(buffer: Buffer, storagePath: string): Promise<string> {
    try {
      logger.info(`Fazendo upload do PDF para Supabase Storage (${env.SUPABASE_BUCKET}/${storagePath})...`);

      // Tenta via SDK oficial do Supabase
      const { data, error } = await this.supabase.storage
        .from(env.SUPABASE_BUCKET)
        .upload(storagePath, buffer, {
          contentType: "application/pdf",
          upsert: true,
        });

      if (error) {
        throw error;
      }

      const publicUrl = `${env.SUPABASE_URL}/storage/v1/object/public/${env.SUPABASE_BUCKET}/${storagePath}`;
      logger.success(`Upload concluído com sucesso: ${publicUrl}`);
      return publicUrl;
    } catch (sdkError: any) {
      logger.warn(`Falha no upload via SDK (${sdkError.message}). Tentando via REST API direta...`);

      // Fallback para REST API direta do Supabase Storage
      const url = `${env.SUPABASE_URL}/storage/v1/object/${env.SUPABASE_BUCKET}/${storagePath}`;
      await axios.post(url, buffer, {
        headers: {
          apikey: env.SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
          "Content-Type": "application/pdf",
          "x-upsert": "true",
        },
      });

      const publicUrl = `${env.SUPABASE_URL}/storage/v1/object/public/${env.SUPABASE_BUCKET}/${storagePath}`;
      logger.success(`Upload concluído com sucesso via REST: ${publicUrl}`);
      return publicUrl;
    }
  }

  /**
   * Atualiza a tabela viagens com o status e a URL do documento assinado
   */
  async updateViagemPrestacao(
    viagemId: number,
    prestacaoAssinadaUrl: string,
    statusPrestacao: string = "Pendente"
  ): Promise<boolean> {
    try {
      logger.info(`Atualizando tabela 'viagens' para id=${viagemId}...`);

      const { error } = await this.supabase
        .from("viagens")
        .update({
          status_prestacao: statusPrestacao,
          prestacao_assinada_url: prestacaoAssinadaUrl,
        })
        .eq("id", viagemId);

      if (error) {
        throw error;
      }

      logger.success(`Registro da viagem #${viagemId} atualizado com sucesso no Supabase!`);
      return true;
    } catch (err: any) {
      logger.error(`Erro ao atualizar viagem #${viagemId} no Supabase:`, err.message);
      return false;
    }
  }
}

export const supabaseService = new SupabaseService();
