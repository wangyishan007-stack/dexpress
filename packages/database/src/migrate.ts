import dotenv from 'dotenv'
import path   from 'path'

// database/src → database → packages → project root
dotenv.config({ path: path.resolve(__dirname, '..', '..', '..', '.env') })

import fs from 'fs'
import { db } from './client'

async function migrate() {
  // SIMPLE=1 pnpm migrate → 使用简化版 schema（本地测试，无分区）
  const schemaFile = process.env.SIMPLE === '1' ? 'schema-simple.sql' : 'schema.sql'
  const schemaPath = path.join(__dirname, '..', schemaFile)
  console.log('[DB] Schema file:', schemaPath)
  const sql = fs.readFileSync(schemaPath, 'utf8')
  console.log('[DB] Running migration…')
  await db.query(sql)
  console.log('[DB] Migration complete.')
  await db.end()
}

migrate().catch((err) => {
  console.error('[DB] Migration failed:', err)
  process.exit(1)
})
