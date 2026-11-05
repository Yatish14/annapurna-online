// Creates the database tables. Safe to run more than once: npm run db:migrate
import { connect, describeTarget, schemaSql } from "./db.mjs";

console.log(`Updating the tables in ${describeTarget()}…`);
const db = await connect();
await db.exec(schemaSql);
await db.close();
console.log("✓ Database tables are ready.");
