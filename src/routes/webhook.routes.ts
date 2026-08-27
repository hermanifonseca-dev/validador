import { Router } from "express";
import { webhookController } from "../controllers/webhook.controller.js";

const router = Router();

// 1. Enviar Prestação para Assinatura (GOV.BR)
router.post("/prestacoes", (req, res) => webhookController.handleEnviarPrestacao(req, res));

// 2. Notificação de Recusa do Financeiro (suporta GET, POST e variações com maiúscula)
router.post("/recusa", (req, res) => webhookController.handleNotificarRecusa(req, res));
router.get("/recusa", (req, res) => webhookController.handleNotificarRecusa(req, res));
router.post("/Recusa", (req, res) => webhookController.handleNotificarRecusa(req, res));
router.get("/Recusa", (req, res) => webhookController.handleNotificarRecusa(req, res));

// 3. Webhook de Recebimento do WAHA (Auditoria e Upload no Supabase)
router.post("/receberpres", (req, res) => webhookController.handleReceberDocumento(req, res));

export default router;
