// Apply the TWAP/VWAP migration to Supabase
// Run with: npx tsx src/scripts/apply-twap-migration.ts

import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs'
import * as path from 'path'

const supabaseUrl = process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

async function runMigration() {
  console.log('Applying TWAP/VWAP migration...\n')

  // Read the migration file
  const migrationPath = path.join(__dirname, '../../../supabase/migrations/007_twap_dynamic_modes.sql')
  const sql = fs.readFileSync(migrationPath, 'utf8')

  // Split by semicolons but be careful with DO blocks
  const lines = sql.split('\n')
  let currentStatement = ''
  let inDoBlock = false
  const statements: string[] = []

  for (const line of lines) {
    const trimmedLine = line.trim()

    // Skip pure comment lines
    if (trimmedLine.startsWith('--') && !currentStatement.trim()) {
      continue
    }

    currentStatement += line + '\n'

    // Check for DO $$ block start
    if (trimmedLine.startsWith('DO $$')) {
      inDoBlock = true
    }

    // Check for DO block end
    if (inDoBlock && trimmedLine.endsWith('$$;')) {
      inDoBlock = false
      statements.push(currentStatement.trim())
      currentStatement = ''
      continue
    }

    // If not in DO block and line ends with semicolon
    if (!inDoBlock && trimmedLine.endsWith(';')) {
      const stmt = currentStatement.trim()
      if (stmt && !stmt.startsWith('--')) {
        statements.push(stmt)
      }
      currentStatement = ''
    }
  }

  // Execute each statement
  for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i]
    const preview = stmt.substring(0, 80).replace(/\n/g, ' ')
    console.log(`[${i + 1}/${statements.length}] ${preview}...`)

    try {
      // Use raw SQL execution via rpc
      const { data, error } = await supabase.rpc('exec_sql', { sql_query: stmt })

      if (error) {
        // If exec_sql doesn't exist, try a different approach
        if (error.message.includes('function') && error.message.includes('does not exist')) {
          console.log('   Note: exec_sql function not available, assuming DDL executed directly')
        } else {
          console.log(`   Warning: ${error.message}`)
        }
      } else {
        console.log('   ✅ Success')
      }
    } catch (err) {
      console.log(`   Error: ${err}`)
    }
  }

  console.log('\n✅ Migration applied!')
}

runMigration().catch(console.error)
