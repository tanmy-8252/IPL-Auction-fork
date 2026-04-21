const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  console.error('❌ Missing env vars: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

async function runMigration(filePath, name) {
  try {
    const sql = fs.readFileSync(filePath, 'utf-8');
    console.log(`\n▶️  Running ${name}...`);
    
    const { error, data } = await supabase.rpc('exec_sql', { sql_text: sql });
    
    if (error) {
      console.error(`❌ ${name} failed:`, error);
      return false;
    }
    
    console.log(`✅ ${name} completed successfully`);
    return true;
  } catch (err) {
    console.error(`❌ ${name} error:`, err.message);
    return false;
  }
}

async function main() {
  console.log('🚀 Starting IPL Auction migrations...\n');
  
  const migrations = [
    ['supabase/sql/009_enforce_auction_caps_and_bid_rules.sql', '009 - Auction caps and bid rules'],
    ['supabase/sql/010_round_three_strategy.sql', '010 - Round 3 strategy'],
    ['supabase/sql/011_enable_client_admin_writes.sql', '011 - Client admin write policies'],
  ];
  
  let allSuccess = true;
  
  for (const [file, name] of migrations) {
    const fullPath = path.join(__dirname, file);
    if (!fs.existsSync(fullPath)) {
      console.error(`❌ File not found: ${fullPath}`);
      allSuccess = false;
      continue;
    }
    
    const success = await runMigration(fullPath, name);
    if (!success) allSuccess = false;
  }
  
  console.log('\n' + '='.repeat(60));
  if (allSuccess) {
    console.log('✅ All migrations completed successfully!');
    console.log('🔄 Refresh /admin/super-admin and test the round controls.');
  } else {
    console.log('⚠️  Some migrations failed. Check the errors above.');
  }
  console.log('='.repeat(60) + '\n');
  
  process.exit(allSuccess ? 0 : 1);
}

main();
