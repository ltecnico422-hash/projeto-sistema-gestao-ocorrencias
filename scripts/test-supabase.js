const { Client } = require('pg');

async function test() {
  const password = 'Ar8&64JW+nh9%#z';
  const encodedPassword = encodeURIComponent(password);
  
  // Testar conexão direta e via pooler
  const directUrl = `postgresql://postgres:${encodedPassword}@db.qrgxqaxifmiaroytlxuz.supabase.co:5432/postgres`;
  const poolerUrl = `postgresql://postgres.qrgxqaxifmiaroytlxuz:${encodedPassword}@aws-0-sa-east-1.pooler.supabase.com:6543/postgres`;

  console.log('Tentando conectar ao Supabase...');

  let client = new Client({
    connectionString: poolerUrl,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('✓ Conectado com sucesso via Pooler Supabase!');
  } catch (err1) {
    console.warn('Tentativa via Pooler falhou:', err1.message);
    console.log('Tentando conexão direta...');
    client = new Client({
      connectionString: directUrl,
      ssl: { rejectUnauthorized: false }
    });
    await client.connect();
    console.log('✓ Conectado com sucesso via Conexão Direta!');
  }

  const res = await client.query('SELECT NOW() as agora, version() as versao');
  console.log('Data/Hora no Supabase:', res.rows[0].agora);
  console.log('Versão PostgreSQL:', res.rows[0].versao);

  await client.end();
  console.log('Conexão finalizada com sucesso!');
}

test().catch(err => {
  console.error('❌ Erro ao conectar ao Supabase:', err);
  process.exit(1);
});
