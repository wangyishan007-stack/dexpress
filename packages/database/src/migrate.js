"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
// database/src → database → packages → project root
dotenv_1.default.config({ path: path_1.default.resolve(__dirname, '..', '..', '..', '.env') });
const fs_1 = __importDefault(require("fs"));
const client_1 = require("./client");
async function migrate() {
    // SIMPLE=1 pnpm migrate → 使用简化版 schema（本地测试，无分区）
    const schemaFile = process.env.SIMPLE === '1' ? 'schema-simple.sql' : 'schema.sql';
    const schemaPath = path_1.default.join(__dirname, '..', schemaFile);
    console.log('[DB] Schema file:', schemaPath);
    const sql = fs_1.default.readFileSync(schemaPath, 'utf8');
    console.log('[DB] Running migration…');
    await client_1.db.query(sql);
    console.log('[DB] Migration complete.');
    await client_1.db.end();
}
migrate().catch((err) => {
    console.error('[DB] Migration failed:', err);
    process.exit(1);
});
