import cors from "cors";
import express from "express";
import { env } from "./config/env.js";
import healthRoutes from "./routes/health.routes.js";
import webhookRoutes from "./routes/webhook.routes.js";
import { logger } from "./utils/logger.js";

const app = express();

// Middlewares
app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// Middleware de log de requisições
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.originalUrl} - IP: ${req.ip}`);
  next();
});

// Rotas
app.use("/", healthRoutes);
app.use("/webhook", webhookRoutes);

// Tratamento de rotas não encontradas
app.use((req, res) => {
  res.status(404).json({
    error: "Rota não encontrada",
    path: req.originalUrl,
  });
});

// Tratamento global de erros
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error("Erro interno não tratado:", err);
  res.status(500).json({
    success: false,
    error: "Erro interno no servidor",
    message: err.message,
  });
});

// Inicialização do servidor
const server = app.listen(env.PORT, () => {
  logger.success(`🚀 Servidor rodando na porta ${env.PORT}`);
  logger.info(`📡 WAHA Configurado: ${env.WAHA_BASE_URL} (Sessão: ${env.WAHA_SESSION})`);
  logger.info(`🗄️ Supabase Configurado: ${env.SUPABASE_URL}`);
  logger.info(`🔗 Endpoints disponíveis:`);
  logger.info(`   - POST /webhook/prestacoes`);
  logger.info(`   - POST /webhook/recusa`);
  logger.info(`   - POST /webhook/receberpres`);
  logger.info(`   - GET  /health`);
});

// Graceful shutdown
process.on("SIGTERM", () => {
  logger.warn("Recebido sinal SIGTERM. Encerrando servidor graciosamente...");
  server.close(() => {
    logger.info("Servidor encerrado.");
    process.exit(0);
  });
});
