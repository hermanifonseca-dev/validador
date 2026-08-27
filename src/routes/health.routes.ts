import { Router, Request, Response } from "express";
import { env } from "../config/env.js";

const router = Router();

router.get("/health", (req: Request, res: Response) => {
  res.status(200).json({
    status: "ok",
    service: "Agente de Confirmacao - WAHA / Gov.br",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

router.get("/", (req: Request, res: Response) => {
  res.status(200).json({
    name: "Agente de Confirmação & Validação de Prestação de Contas (GOV.BR / WAHA)",
    version: "1.0.0",
    status: "online",
    endpoints: {
      enviarPrestacao: "POST /webhook/prestacoes",
      notificarRecusa: "POST /webhook/recusa (ou /webhook/Recusa)",
      receberDoWaha: "POST /webhook/receberpres",
      healthCheck: "GET /health",
    },
    environment: {
      wahaUrl: env.WAHA_BASE_URL,
      wahaSession: env.WAHA_SESSION,
      supabaseUrl: env.SUPABASE_URL,
      geminiConfigured: !!env.GEMINI_API_KEY && !env.GEMINI_API_KEY.includes("sua_chave"),
    },
  });
});

export default router;
