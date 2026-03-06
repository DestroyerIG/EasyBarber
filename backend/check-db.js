import pg from 'pg';
const pool = new pg.Pool({ connectionString: 'postgresql://postgres:Gabriel23@localhost:5432/barberpro' });
try {
  const r = await pool.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name");
  console.log('Tables:', r.rows.map(x => x.table_name));
  
  // Check columns of barbershops and users if they exist
  const tables = r.rows.map(x => x.table_name);
  for (const t of ['barbershops', 'users', 'refresh_tokens']) {
    if (tables.includes(t)) {
      const cols = await pool.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = $1 ORDER BY ordinal_position", [t]);
      console.log(`\n${t} columns:`, cols.rows.map(c => `${c.column_name} (${c.data_type})`));
    } else {
      console.log(`\n❌ Table '${t}' MISSING`);
    }
  }
} catch (e) {
  console.error('Error:', e.message);
} finally {
  await pool.end();
}
