// Corpo bruto da requisição, necessário para validar a assinatura
// HMAC (X-Hub-Signature-256) do webhook da Meta antes do JSON parseado.
declare module 'express-serve-static-core' {
  interface Request {
    rawBody?: Buffer;
  }
}

export {};
