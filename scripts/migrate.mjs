// Creates the database tables. Safe to run more than once: npm run db:migrate
import { connect, schemaSql } from "./db.mjs";

const db = await connect();
await db.exec(schemaSql);
await db.close();
console.log("✓ Database tables are ready.");
