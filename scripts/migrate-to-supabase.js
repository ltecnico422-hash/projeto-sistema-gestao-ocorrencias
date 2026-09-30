const { Client } = require('pg');
const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const fs = require('node:fs');

async function migrate() {
  const password = 'Ar8&64JW+nh9%#z';
  const encodedPassword = encodeURIComponent(password);
  const poolerUrl = `postgresql://postgres.qrgxqaxifmiaroytlxuz:${encodedPassword}@aws-0-sa-east-1.pooler.supabase.com:6543/postgres`;

  console.log('1. Conectando ao Supabase...');
  const client = new Client({
    connectionString: poolerUrl,
    ssl: { rejectUnauthorized: false }
  });
  await client.connect();
  console.log('✓ Conectado ao Supabase com sucesso!');

  console.log('2. Criando estrutura de tabelas no PostgreSQL do Supabase...');

  await client.query(`
    CREATE TABLE IF NOT EXISTS usuarios (
      id SERIAL PRIMARY KEY,
      nome TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      senha_hash TEXT NOT NULL,
      criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS configuracoes_usuario (
      usuario_id INTEGER PRIMARY KEY REFERENCES usuarios(id) ON DELETE CASCADE,
      nome_hospital TEXT NOT NULL DEFAULT 'Hospital Regional Nossa Senhora do Bom Conselho',
      setor TEXT NOT NULL DEFAULT 'Tecnologia da Informação',
      nome_responsavel TEXT DEFAULT '',
      logo_path TEXT DEFAULT 'uploads/logo.png',
      atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS ocorrencias (
      id SERIAL PRIMARY KEY,
      usuario_id INTEGER REFERENCES usuarios(id) ON DELETE CASCADE,
      data DATE NOT NULL,
      setor TEXT NOT NULL,
      tipo_problema TEXT NOT NULL,
      problema TEXT NOT NULL,
      diagnostico TEXT,
      o_que_foi_feito TEXT,
      status TEXT NOT NULL DEFAULT 'Aberto',
      prioridade TEXT NOT NULL DEFAULT 'Normal',
      criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS configuracoes (
      id INTEGER PRIMARY KEY,
      nome_hospital TEXT NOT NULL DEFAULT 'Hospital Regional Nossa Senhora do Bom Conselho',
      setor TEXT NOT NULL DEFAULT 'Tecnologia da Informação',
      nome_responsavel TEXT DEFAULT '',
      logo_path TEXT DEFAULT 'uploads/logo.png',
      atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS relatorios_gerados (
      id SERIAL PRIMARY KEY,
      usuario_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
      periodo_mes INTEGER NOT NULL,
      periodo_ano INTEGER NOT NULL,
      total_ocorrencias INTEGER NOT NULL,
      resolvidas INTEGER NOT NULL,
      em_andamento INTEGER NOT NULL,
      abertas INTEGER NOT NULL,
      alta_prioridade INTEGER NOT NULL,
      responsavel TEXT,
      formato TEXT,
      gerado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS relatorios_salvos (
      id SERIAL PRIMARY KEY,
      usuario_id INTEGER REFERENCES usuarios(id) ON DELETE CASCADE,
      tipo TEXT NOT NULL DEFAULT 'produtividade',
      titulo TEXT NOT NULL,
      periodo_inicio TEXT,
      periodo_fim TEXT,
      dados_json TEXT NOT NULL,
      criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_pg_ocorrencias_usuario ON ocorrencias (usuario_id);
    CREATE INDEX IF NOT EXISTS idx_pg_ocorrencias_data ON ocorrencias (data);
    CREATE INDEX IF NOT EXISTS idx_pg_relatorios_salvos_usuario ON relatorios_salvos (usuario_id);
  `);
  console.log('✓ Tabelas e índices criados com sucesso no Supabase!');

  // Garante configuracao padrao id = 1
  await client.query(`
    INSERT INTO configuracoes (id, nome_hospital, setor, nome_responsavel, logo_path)
    VALUES (1, 'Hospital Regional Nossa Senhora do Bom Conselho', 'Tecnologia da Informação', '', 'uploads/logo.png')
    ON CONFLICT (id) DO NOTHING;
  `);

  // 3. Migrar dados do SQLite local se existir
  const localDbPath = path.join(__dirname, '../data/database.sqlite');
  if (fs.existsSync(localDbPath)) {
    console.log('3. Lendo dados do SQLite local para migração...');
    const sqlite = new DatabaseSync(localDbPath);

    // Migra Usuários
    const users = sqlite.prepare('SELECT * FROM usuarios').all();
    console.log(`   - Encontrados ${users.length} usuários locais.`);
    for (const u of users) {
      await client.query(`
        INSERT INTO usuarios (id, nome, email, senha_hash, criado_em)
        VALUES ($1, $2, $3, $4, COALESCE($5::timestamptz, NOW()))
        ON CONFLICT (email) DO UPDATE SET nome = EXCLUDED.nome, senha_hash = EXCLUDED.senha_hash
      `, [u.id, u.nome, u.email, u.senha_hash, u.criado_em]);
    }
    // Ajusta sequence do id
    await client.query(`SELECT setval('usuarios_id_seq', (SELECT COALESCE(MAX(id), 1) FROM usuarios));`);

    // Migra Configurações de Usuário
    const userConfigs = sqlite.prepare('SELECT * FROM configuracoes_usuario').all();
    for (const cfg of userConfigs) {
      await client.query(`
        INSERT INTO configuracoes_usuario (usuario_id, nome_hospital, setor, nome_responsavel, logo_path)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (usuario_id) DO UPDATE SET
          nome_hospital = EXCLUDED.nome_hospital,
          setor = EXCLUDED.setor,
          nome_responsavel = EXCLUDED.nome_responsavel,
          logo_path = EXCLUDED.logo_path
      `, [cfg.usuario_id, cfg.nome_hospital, cfg.setor, cfg.nome_responsavel, cfg.logo_path]);
    }

    // Migra Ocorrências Reais
    const ocorrencias = sqlite.prepare('SELECT * FROM ocorrencias WHERE usuario_id IS NOT NULL').all();
    console.log(`   - Encontradas ${ocorrencias.length} ocorrências com usuário.`);
    for (const o of ocorrencias) {
      await client.query(`
        INSERT INTO ocorrencias (id, usuario_id, data, setor, tipo_problema, problema, diagnostico, o_que_foi_feito, status, prioridade)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        ON CONFLICT (id) DO NOTHING
      `, [
        o.id, o.usuario_id, o.data, o.setor, o.tipo_problema,
        o.problema, o.diagnostico || '', o.o_que_foi_feito || '',
        o.status || 'Aberto', o.prioridade || 'Normal'
      ]);
    }
    await client.query(`SELECT setval('ocorrencias_id_seq', (SELECT COALESCE(MAX(id), 1) FROM ocorrencias));`);

    // Migra Relatórios Salvos
    try {
      const rels = sqlite.prepare('SELECT * FROM relatorios_salvos').all();
      console.log(`   - Encontrados ${rels.length} relatórios salvos.`);
      for (const r of rels) {
        await client.query(`
          INSERT INTO relatorios_salvos (id, usuario_id, tipo, titulo, periodo_inicio, periodo_fim, dados_json)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          ON CONFLICT (id) DO NOTHING
        `, [r.id, r.usuario_id, r.tipo, r.titulo, r.periodo_inicio, r.periodo_fim, r.dados_json]);
      }
      await client.query(`SELECT setval('relatorios_salvos_id_seq', (SELECT COALESCE(MAX(id), 1) FROM relatorios_salvos));`);
    } catch (e) {}

    console.log('✓ Migração de dados do SQLite para o Supabase concluída com sucesso!');
  }

  // Verificação final
  const countUsers = await client.query('SELECT count(*) as c FROM usuarios');
  const countOc = await client.query('SELECT count(*) as c FROM ocorrencias');
  console.log(`\n🎉 SUPABASE PRONTO PARA USO!`);
  console.log(`   * Total de usuários no Supabase: ${countUsers.rows[0].c}`);
  console.log(`   * Total de ocorrências no Supabase: ${countOc.rows[0].c}`);

  await client.end();
}

migrate().catch(err => {
  console.error('❌ Erro na migração para o Supabase:', err);
  process.exit(1);
});
