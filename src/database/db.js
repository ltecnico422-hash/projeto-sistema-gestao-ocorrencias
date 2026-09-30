const path = require('node:path');
const fs = require('node:fs');

// Carrega arquivo .env localmente caso exista e variáveis não estejam setadas
const envPath = path.join(__dirname, '../../.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
      const idx = trimmed.indexOf('=');
      const key = trimmed.slice(0, idx).trim();
      const val = trimmed.slice(idx + 1).trim().replace(/^['"]|['"]$/g, '');
      if (!process.env[key]) {
        process.env[key] = val;
      }
    }
  }
}

/**
 * Sanitiza e normaliza URLs do PostgreSQL / Supabase:
 * - Remove colchetes envolventes da senha (ex: [minhasenha])
 * - Codifica caracteres especiais na senha (&, +, %, #, etc.)
 * - Redireciona conexões diretas db.<ref>.supabase.co para o pooler IPv4
 */
function sanitizeDatabaseUrl(raw) {
  if (!raw) return raw;
  let str = raw.trim();
  const match = str.match(/^(postgres(?:ql)?:\/\/)([^:]+):(.*)@([^@]+)$/);
  if (!match) return str;

  const prefix = match[1];
  let user = match[2];
  let pass = match[3];
  let hostPart = match[4];

  if (pass.startsWith('[') && pass.endsWith(']')) {
    pass = pass.slice(1, -1);
  }

  try {
    if (decodeURIComponent(pass) === pass) {
      pass = encodeURIComponent(pass);
    }
  } catch (e) {
    pass = encodeURIComponent(pass);
  }

  const dbHostMatch = hostPart.match(/^db\.([a-z0-9]+)\.supabase\.co(?::5432)?(\/.*)?$/);
  if (dbHostMatch) {
    const projectRef = dbHostMatch[1];
    const pathPart = dbHostMatch[2] || '/postgres';
    user = 'postgres.' + projectRef;
    hostPart = 'aws-0-sa-east-1.pooler.supabase.com:5432' + pathPart;
  }

  return `${prefix}${user}:${pass}@${hostPart}`;
}

function convertPlaceholders(sql) {
  let paramIndex = 1;
  let inString = false;
  let quoteChar = '';
  let result = '';

  for (let i = 0; i < sql.length; i++) {
    const char = sql[i];
    if (inString) {
      result += char;
      if (char === quoteChar) {
        if (sql[i + 1] === quoteChar) {
          result += sql[i + 1];
          i++;
        } else {
          inString = false;
        }
      }
    } else {
      if (char === "'" || char === '"') {
        inString = true;
        quoteChar = char;
        result += char;
      } else if (char === '?') {
        result += '$' + (paramIndex++);
      } else {
        result += char;
      }
    }
  }
  return result;
}

function normalizeSqlForPg(sql) {
  let s = convertPlaceholders(sql);
  s = s.replace(/datetime\('now',\s*'localtime'\)/gi, 'NOW()');
  s = s.replace(/datetime\('now'\)/gi, 'NOW()');
  return s;
}

const rawDatabaseUrl = process.env.DATABASE_URL;
let dbInstance = null;

if (rawDatabaseUrl && rawDatabaseUrl.trim()) {
  // ==========================================
  // MODO SUPABASE / POSTGRESQL (NUVEM DEFINITIVA)
  // ==========================================
  const { Pool, types } = require('pg');

  // Garante que contadores e datas retornem no mesmo formato do SQLite
  types.setTypeParser(1082, val => val); // DATE -> string 'YYYY-MM-DD'
  types.setTypeParser(20, val => Number(val)); // BIGINT / COUNT(*) -> number

  const connectionString = sanitizeDatabaseUrl(rawDatabaseUrl);
  console.log('[Banco de Dados] Modo PostgreSQL / Supabase ativado.');

  const pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false },
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000
  });

  // Inicialização assíncrona do esquema no PostgreSQL
  const initPgPromise = (async () => {
    try {
      await pool.query(`
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

        CREATE OR REPLACE FUNCTION datetime(arg1 text DEFAULT 'now', arg2 text DEFAULT 'localtime') RETURNS timestamptz AS $$
        BEGIN
          RETURN NOW();
        END;
        $$ LANGUAGE plpgsql IMMUTABLE;

        INSERT INTO configuracoes (id, nome_hospital, setor, nome_responsavel, logo_path)
        VALUES (1, 'Hospital Regional Nossa Senhora do Bom Conselho', 'Tecnologia da Informação', '', 'uploads/logo.png')
        ON CONFLICT (id) DO NOTHING;
      `);
      console.log('✓ [Supabase] Tabelas e funções verificadas com sucesso!');
    } catch (errInit) {
      console.error('❌ [Supabase] Erro ao inicializar tabelas:', errInit.message);
    }
  })();

  dbInstance = {
    isPg: true,
    pool,
    initPromise: initPgPromise,
    prepare(sql) {
      return {
        async get(...params) {
          const flatParams = params.length === 1 && Array.isArray(params[0]) ? params[0] : params;
          const pgSql = normalizeSqlForPg(sql);
          const res = await pool.query(pgSql, flatParams);
          return res.rows[0] || undefined;
        },
        async all(...params) {
          const flatParams = params.length === 1 && Array.isArray(params[0]) ? params[0] : params;
          const pgSql = normalizeSqlForPg(sql);
          const res = await pool.query(pgSql, flatParams);
          return res.rows || [];
        },
        async run(...params) {
          let flatParams = params.length === 1 && Array.isArray(params[0]) ? params[0] : params;
          let pgSql = normalizeSqlForPg(sql).trim();

          const isInsert = /^INSERT\s+INTO/i.test(pgSql);
          if (isInsert && !/RETURNING/i.test(pgSql)) {
            pgSql += ' RETURNING *';
          }

          const res = await pool.query(pgSql, flatParams);
          const firstRow = res.rows && res.rows[0];
          const lastId = firstRow ? (firstRow.id || firstRow.usuario_id) : undefined;
          return {
            changes: res.rowCount || 0,
            lastInsertRowid: lastId !== undefined ? Number(lastId) : undefined
          };
        }
      };
    },
    async exec(sql) {
      return pool.query(sql);
    },
    async query(sql, params = []) {
      const pgSql = normalizeSqlForPg(sql);
      const res = await pool.query(pgSql, params);
      return res.rows;
    }
  };
} else {
  // ==========================================
  // MODO SQLITE LOCAL (DESENVOLVIMENTO OFFLINE)
  // ==========================================
  const { DatabaseSync } = require('node:sqlite');
  console.log('[Banco de Dados] Modo SQLite local ativado (DATABASE_URL não configurada).');

  const dataDir = process.env.DATA_DIR || path.join(__dirname, '../../data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const dbPath = path.join(dataDir, 'database.sqlite');
  const sqliteDb = new DatabaseSync(dbPath);

  sqliteDb.exec(`PRAGMA journal_mode = WAL;`);
  sqliteDb.exec(`PRAGMA foreign_keys = ON;`);

  sqliteDb.exec(`
    CREATE TABLE IF NOT EXISTS usuarios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      senha_hash TEXT NOT NULL,
      criado_em TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS configuracoes_usuario (
      usuario_id INTEGER PRIMARY KEY REFERENCES usuarios(id) ON DELETE CASCADE,
      nome_hospital TEXT NOT NULL DEFAULT 'Hospital Regional Nossa Senhora do Bom Conselho',
      setor TEXT NOT NULL DEFAULT 'Tecnologia da Informação',
      nome_responsavel TEXT DEFAULT '',
      logo_path TEXT DEFAULT 'uploads/logo.png',
      atualizado_em TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS ocorrencias (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      usuario_id INTEGER REFERENCES usuarios(id) ON DELETE CASCADE,
      data TEXT NOT NULL,
      setor TEXT NOT NULL,
      tipo_problema TEXT NOT NULL CHECK (tipo_problema IN ('Hardware', 'Software', 'Rede/Internet', 'Impressão', 'Acesso/Usuário', 'Outro')),
      problema TEXT NOT NULL,
      diagnostico TEXT,
      o_que_foi_feito TEXT,
      status TEXT NOT NULL DEFAULT 'Aberto' CHECK (status IN ('Aberto', 'Em andamento', 'Resolvido')),
      prioridade TEXT NOT NULL DEFAULT 'Normal' CHECK (prioridade IN ('Normal', 'Alta', 'Urgente')),
      criado_em TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      atualizado_em TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS configuracoes (
      id INTEGER PRIMARY KEY,
      nome_hospital TEXT NOT NULL DEFAULT 'Hospital Regional Nossa Senhora do Bom Conselho',
      setor TEXT NOT NULL DEFAULT 'Tecnologia da Informação',
      nome_responsavel TEXT DEFAULT '',
      logo_path TEXT DEFAULT 'uploads/logo.png',
      atualizado_em TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS relatorios_gerados (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      usuario_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
      periodo_mes INTEGER NOT NULL,
      periodo_ano INTEGER NOT NULL,
      total_ocorrencias INTEGER NOT NULL,
      resolvidas INTEGER NOT NULL,
      em_andamento INTEGER NOT NULL,
      abertas INTEGER NOT NULL,
      alta_prioridade INTEGER NOT NULL,
      responsavel TEXT,
      formato TEXT CHECK (formato IN ('pdf', 'docx')),
      gerado_em TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS relatorios_salvos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      usuario_id INTEGER REFERENCES usuarios(id) ON DELETE CASCADE,
      tipo TEXT NOT NULL DEFAULT 'produtividade',
      titulo TEXT NOT NULL,
      periodo_inicio TEXT,
      periodo_fim TEXT,
      dados_json TEXT NOT NULL,
      criado_em TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      atualizado_em TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );

    CREATE INDEX IF NOT EXISTS idx_ocorrencias_usuario ON ocorrencias (usuario_id);
    CREATE INDEX IF NOT EXISTS idx_ocorrencias_data ON ocorrencias (data);
    CREATE INDEX IF NOT EXISTS idx_ocorrencias_status ON ocorrencias (status);
    CREATE INDEX IF NOT EXISTS idx_ocorrencias_prioridade ON ocorrencias (prioridade);
    CREATE INDEX IF NOT EXISTS idx_relatorios_salvos_usuario ON relatorios_salvos (usuario_id);
  `);

  const configExists = sqliteDb.prepare('SELECT id FROM configuracoes WHERE id = 1').get();
  if (!configExists) {
    sqliteDb.prepare(`
      INSERT INTO configuracoes (id, nome_hospital, setor, nome_responsavel, logo_path)
      VALUES (1, 'Hospital Regional Nossa Senhora do Bom Conselho', 'Tecnologia da Informação', '', 'uploads/logo.png')
    `).run();
  }

  dbInstance = {
    isPg: false,
    sqliteDb,
    prepare(sql) {
      const stmt = sqliteDb.prepare(sql);
      return {
        async get(...params) {
          const flatParams = params.length === 1 && Array.isArray(params[0]) ? params[0] : params;
          return stmt.get(...flatParams);
        },
        async all(...params) {
          const flatParams = params.length === 1 && Array.isArray(params[0]) ? params[0] : params;
          return stmt.all(...flatParams);
        },
        async run(...params) {
          const flatParams = params.length === 1 && Array.isArray(params[0]) ? params[0] : params;
          return stmt.run(...flatParams);
        }
      };
    },
    async exec(sql) {
      return sqliteDb.exec(sql);
    },
    async query(sql, params = []) {
      const stmt = sqliteDb.prepare(sql);
      return stmt.all(...params);
    }
  };
}

module.exports = dbInstance;
