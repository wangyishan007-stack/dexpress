"use strict";
/**
 * 快速连接测试脚本
 * 验证：PostgreSQL 连通 + Redis 连通 + Alchemy WebSocket 正常
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
dotenv_1.default.config({ path: path_1.default.resolve(__dirname, '..', '..', '..', '.env') });
const pg_1 = require("pg");
const ioredis_1 = __importDefault(require("ioredis"));
const viem_1 = require("viem");
const chains_1 = require("viem/chains");
const RESET = '\x1b[0m';
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
function ok(msg) { console.log(`${GREEN}  ✓${RESET} ${msg}`); }
function fail(msg) { console.log(`${RED}  ✗${RESET} ${msg}`); }
function info(msg) { console.log(`${YELLOW}  →${RESET} ${msg}`); }
async function testPostgres() {
    info('Testing PostgreSQL connection…');
    const pg = new pg_1.Pool({ connectionString: process.env.DATABASE_URL });
    try {
        const res = await pg.query('SELECT current_database() AS db, version()');
        ok(`PostgreSQL: ${res.rows[0].db} — ${res.rows[0].version.split(' ').slice(0, 2).join(' ')}`);
        // Check tables exist
        const tables = await pg.query(`SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name`);
        ok(`Tables: ${tables.rows.map((r) => r.table_name).join(', ')}`);
    }
    catch (err) {
        fail(`PostgreSQL: ${err.message}`);
    }
    finally {
        await pg.end();
    }
}
async function testRedis() {
    info('Testing Redis connection…');
    const redis = new ioredis_1.default(process.env.REDIS_URL ?? 'redis://localhost:6379', {
        connectTimeout: 5000,
        maxRetriesPerRequest: 1,
    });
    try {
        const pong = await redis.ping();
        ok(`Redis: ${pong}`);
        await redis.set('test:key', 'hello', 'EX', 10);
        const val = await redis.get('test:key');
        ok(`Redis read/write: ${val}`);
    }
    catch (err) {
        fail(`Redis: ${err.message}`);
    }
    finally {
        redis.disconnect();
    }
}
async function testAlchemy() {
    info('Testing Alchemy HTTP connection…');
    try {
        const client = (0, viem_1.createPublicClient)({
            chain: chains_1.base,
            transport: (0, viem_1.http)(process.env.ALCHEMY_HTTP_URL),
        });
        const blockNumber = await client.getBlockNumber();
        ok(`Alchemy HTTP: current block #${blockNumber}`);
    }
    catch (err) {
        fail(`Alchemy HTTP: ${err.message}`);
    }
    info('Testing Alchemy WebSocket (5s timeout)…');
    await new Promise((resolve) => {
        const client = (0, viem_1.createPublicClient)({
            chain: chains_1.base,
            transport: (0, viem_1.webSocket)(process.env.ALCHEMY_WS_URL),
        });
        const timeout = setTimeout(() => {
            fail('Alchemy WS: timeout (no block in 5s — chain might be fine, check URL)');
            resolve();
        }, 5000);
        // Just watch for a block to confirm WS works
        const unsub = client.watchBlocks({
            onBlock: (block) => {
                clearTimeout(timeout);
                ok(`Alchemy WS: block #${block.number} received ✓`);
                unsub();
                resolve();
            },
            onError: (err) => {
                clearTimeout(timeout);
                fail(`Alchemy WS: ${err.message}`);
                resolve();
            },
        });
    });
}
async function testChainlink() {
    info('Testing Chainlink ETH/USD price feed…');
    try {
        const { getEthUsdPrice } = await Promise.resolve().then(() => __importStar(require('./utils/price')));
        const client = (0, viem_1.createPublicClient)({ chain: chains_1.base, transport: (0, viem_1.http)(process.env.ALCHEMY_HTTP_URL) });
        const price = await getEthUsdPrice(client, true);
        ok(`ETH/USD = $${price.toFixed(2)}`);
    }
    catch (err) {
        fail(`Chainlink: ${err.message}`);
    }
}
async function main() {
    console.log('\n=== Base DEX Screener — Connection Test ===\n');
    await testPostgres();
    await testRedis();
    await testAlchemy();
    await testChainlink();
    console.log('\n=== Done ===\n');
    process.exit(0);
}
main().catch((err) => {
    console.error('Fatal:', err);
    process.exit(1);
});
