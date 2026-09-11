#!/usr/bin/env node
/**
 * Emite um JWT HS256 para o PostgREST de teste — Fase E.
 *
 * POR QUE ISTO EXISTE. O app fala com o banco por PostgREST, e o PostgREST
 * decide o papel do Postgres a partir do claim `role` de um JWT assinado. Em
 * produção quem emite é o Supabase; em CI, ninguém — e sem um token válido os
 * testes de integração não conseguiriam nem abrir a porta.
 *
 * POR QUE NÃO USAR UMA BIBLIOTECA. Um JWT HS256 é três pedaços em base64url com
 * um HMAC. `node:crypto` já faz HMAC. Trazer `jsonwebtoken` para o projeto só
 * por isto acrescentaria uma dependência de build a um repositório que hoje tem
 * nove dependências de runtime.
 *
 * ESTE TOKEN NÃO SERVE PARA PRODUÇÃO, e não por convenção: o segredo é público,
 * está no workflow, e o token não expira tão cedo de propósito, para o CI não
 * quebrar por causa de relógio. Em produção o segredo é do Supabase e nunca
 * passa por aqui.
 *
 * USO:
 *   node scripts/jwt-de-teste.mjs                 # papel service_role
 *   node scripts/jwt-de-teste.mjs anon            # papel anon
 *   PGRST_JWT_SECRET=... node scripts/jwt-de-teste.mjs
 */
import { createHmac } from "node:crypto";

/** O mesmo valor default do workflow. Trocar aqui exige trocar lá. */
const SEGREDO =
  process.env.PGRST_JWT_SECRET ?? "segredo-de-teste-do-crc-com-no-minimo-32-caracteres";

const papel = process.argv[2] ?? "service_role";

const base64url = (o) =>
  Buffer.from(typeof o === "string" ? o : JSON.stringify(o))
    .toString("base64")
    .replace(/\+/gu, "-")
    .replace(/\//gu, "_")
    .replace(/=+$/u, "");

const cabecalho = base64url({ alg: "HS256", typ: "JWT" });
const corpo = base64url({
  role: papel,
  // Dez anos. O CI não pode falhar porque um token de teste venceu num domingo.
  exp: Math.floor(Date.now() / 1000) + 10 * 365 * 24 * 3600,
});

const assinatura = createHmac("sha256", SEGREDO)
  .update(`${cabecalho}.${corpo}`)
  .digest("base64")
  .replace(/\+/gu, "-")
  .replace(/\//gu, "_")
  .replace(/=+$/u, "");

process.stdout.write(`${cabecalho}.${corpo}.${assinatura}`);
