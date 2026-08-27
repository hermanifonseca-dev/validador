import dotenv from "dotenv";
import { z } from "zod";

// Carrega variáveis do arquivo .env se presente
dotenv.config();

const envSchema = z.object({
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  
  // WAHA
  WAHA_BASE_URL: z.string().url().default("https://polis-waha.8vsz2a.easypanel.host"),
  WAHA_API_KEY: z.string().min(1, "WAHA_API_KEY é obrigatória"),
  WAHA_SESSION: z.string().default("PolisHub"),
  
  // Google Gemini
  GEMINI_API_KEY: z.string().optional().default(""),
  
  // Supabase
  SUPABASE_URL: z.string().url().default("https://oyzebaxjalhhttjlqdpk.supabase.co"),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1, "SUPABASE_SERVICE_ROLE_KEY é obrigatória"),
  SUPABASE_BUCKET: z.string().default("reembolso-prestacao"),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("❌ Erro de configuração nas variáveis de ambiente:", parsed.error.format());
  process.exit(1);
}

export const env = parsed.data;
