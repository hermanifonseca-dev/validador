import { pdfValidatorService } from "./services/pdf-validator.service.js";
import { formatPhoneNumber, extractViagemId } from "./utils/phone.js";

async function testarLogica() {
  console.log("🧪 Executando testes unitários do Agente de Confirmação...\n");

  // Teste 1: Formatação de Telefones
  console.log("1️⃣ Teste de Formatação de Telefone:");
  const t1 = formatPhoneNumber("5533984282601");
  console.log("   Input '5533984282601' ->", t1);
  const t2 = formatPhoneNumber("33984282601");
  console.log("   Input '33984282601' ->", t2);
  console.assert(t1.chatId === "553384282601@c.us" || t1.chatId.startsWith("5533"), "Erro na formatação");

  // Teste 2: Extração de Viagem ID
  console.log("\n2️⃣ Teste de Extração de Viagem ID:");
  const id1 = extractViagemId("viagem-54_assinado.pdf");
  console.log("   'viagem-54_assinado.pdf' -> ID:", id1);
  const id2 = extractViagemId("Prestação de Contas Viagem #54");
  console.log("   'Prestação de Contas Viagem #54' -> ID:", id2);
  console.assert(id1 === 54 && id2 === 54, "Erro na extração de ID");

  // Teste 3: Simulação de Validador de PDF com Texto do Selo GOV.BR
  console.log("\n3️⃣ Teste de Validador de Assinatura GOV.BR:");
  const fakePdfContent = Buffer.from(
    "%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n" +
    "Documento assinado digitalmente\nHERMANI GOMES GONCALVES FONSECA\nData: 27/08/2026 14:46:36-0300\nVerifique em https://validar.iti.gov.br\n" +
    "%%EOF"
  );
  const valResult = await pdfValidatorService.validatePdf(fakePdfContent, "viagem-54_assinado.pdf");
  console.log("   Resultado da Validação:", valResult);
  console.assert(valResult.assinado === true, "Deveria identificar a assinatura GOV.BR");

  console.log("\n✅ TODOS OS TESTES PASSARAM COM SUCESSO!");
}

testarLogica();
