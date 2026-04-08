/**
 * Truncates all tables populated by seeding-all-datas / seeding-all-datas-cloud.
 *
 * Usage:
 *   npx ts-node -r tsconfig-paths/register --transpile-only scripts/truncate-seeded-tables.ts
 *   NODE_ENV=production npx ts-node -r tsconfig-paths/register --transpile-only scripts/truncate-seeded-tables.ts
 *
 * When NODE_ENV=production, SSL is enabled for RDS via tunnel.
 */

const dotenv = require("dotenv");
const path = require("path");
dotenv.config({ path: path.resolve(__dirname, "../.env") });

import { Client } from "pg";

const isCloud = process.env.NODE_ENV === "production";

const client = new Client({
    host: process.env.DB_HOST ?? "localhost",
    port: Number(process.env.DB_PORT ?? (isCloud ? 5433 : 5432)),
    user: process.env.DB_USER ?? "postgres",
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME ?? "onedelivery",
    ssl: isCloud ? { rejectUnauthorized: false } : false,
});

// Truncate in FK-safe order: children before parents.
const TABLES = [
    // knowledge
    "knowledge.faq",
    "knowledge.sop",
    // incident
    "incident.incidents",
    // users (chat messages/sessions before user)
    "users.chat_message",
    "users.chat_session",
    "users.sentiment",
    'users."user"',
    // payment (refunds before payments)
    "payment.refunds",
    "payment.payments",
    // order (items before order)
    '"order".order_items',
    '"order"."order"',
    // logistics (tracking before deliveries before products)
    "logistics.delivery_tracking",
    "logistics.deliveries",
    "logistics.products",
    // audit
    "audit.audit_events",
];

async function main() {
    console.log(
        `Connecting to ${client.host}:${client.port}/${client.database} (SSL: ${isCloud})`,
    );
    await client.connect();
    console.log("Connected.\n");

    for (const table of TABLES) {
        const sql = `TRUNCATE TABLE ${table} RESTART IDENTITY CASCADE;`;
        process.stdout.write(`  ${sql} ... `);
        await client.query(sql);
        console.log("OK");
    }

    await client.end();
    console.log("\nTruncation complete.");
}

main().catch((err) => {
    console.error("\nError:", err.message);
    client.end().catch(() => {});
    process.exit(1);
});
