const { Pool } = require('pg');

const poolerUrl = 'postgresql://postgres.qrgxqaxifmiaroytlxuz:Ar8%2664JW%2Bnh9%25%23z@aws-0-sa-east-1.pooler.supabase.com:5432/postgres';

async function setup() {
  const pool = new Pool({
    connectionString: poolerUrl,
    ssl: { rejectUnauthorized: false }
  });

  console.log('Criando funções de compatibilidade SQLite -> PostgreSQL no Supabase...');

  await pool.query(`
    CREATE OR REPLACE FUNCTION strftime(fmt text, dt date) RETURNS text AS $$
    BEGIN
      IF fmt = '%Y' THEN RETURN to_char(dt, 'YYYY');
      ELSIF fmt = '%m' THEN RETURN to_char(dt, 'MM');
      ELSIF fmt = '%d' THEN RETURN to_char(dt, 'DD');
      ELSIF fmt = '%Y-%m' THEN RETURN to_char(dt, 'YYYY-MM');
      ELSE RETURN to_char(dt, 'YYYY-MM-DD');
      END IF;
    END;
    $$ LANGUAGE plpgsql IMMUTABLE;

    CREATE OR REPLACE FUNCTION strftime(fmt text, dt timestamptz) RETURNS text AS $$
    BEGIN
      IF fmt = '%Y' THEN RETURN to_char(dt, 'YYYY');
      ELSIF fmt = '%m' THEN RETURN to_char(dt, 'MM');
      ELSIF fmt = '%d' THEN RETURN to_char(dt, 'DD');
      ELSIF fmt = '%Y-%m' THEN RETURN to_char(dt, 'YYYY-MM');
      ELSE RETURN to_char(dt, 'YYYY-MM-DD');
      END IF;
    END;
    $$ LANGUAGE plpgsql IMMUTABLE;

    CREATE OR REPLACE FUNCTION strftime(fmt text, dt text) RETURNS text AS $$
    BEGIN
      RETURN strftime(fmt, dt::date);
    EXCEPTION WHEN OTHERS THEN
      RETURN '';
    END;
    $$ LANGUAGE plpgsql IMMUTABLE;
  `);

  console.log('✓ Funções strftime criadas com sucesso!');

  const test1 = await pool.query("SELECT strftime('%Y', CURRENT_DATE) as ano, strftime('%m', CURRENT_DATE) as mes");
  console.log('✓ Teste strftime:', test1.rows[0]);

  // Testa query do dashboard
  const testDash = await pool.query(`
    SELECT COUNT(*) as count FROM ocorrencias
    WHERE usuario_id = $1
      AND strftime('%Y', data) = $2 AND strftime('%m', data) = $3
  `, [3, '2026', '09']);
  console.log('✓ Teste query dashboard:', testDash.rows[0]);

  await pool.end();
}

setup().catch(err => {
  console.error('Erro:', err);
  process.exit(1);
});
