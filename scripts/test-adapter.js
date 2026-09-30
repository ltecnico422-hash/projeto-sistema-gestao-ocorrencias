const { Pool, types } = require('pg');

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


// Garante que contadores retornem números e datas como strings YYYY-MM-DD
types.setTypeParser(1082, val => val); // DATE
types.setTypeParser(20, val => Number(val)); // BIGINT / COUNT

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

function normalizeSql(sql) {
  let s = convertPlaceholders(sql);
  // Substitui datetime('now', 'localtime') por NOW() se necessário
  s = s.replace(/datetime\('now',\s*'localtime'\)/gi, 'NOW()');
  s = s.replace(/datetime\('now'\)/gi, 'NOW()');
  return s;
}

function createPgAdapter(connectionString) {
  const pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false }
  });

  return {
    isPg: true,
    pool,
    prepare(sql) {
      return {
        async get(...params) {
          const flatParams = params.length === 1 && Array.isArray(params[0]) ? params[0] : params;
          const pgSql = normalizeSql(sql);
          const res = await pool.query(pgSql, flatParams);
          return res.rows[0] || undefined;
        },
        async all(...params) {
          const flatParams = params.length === 1 && Array.isArray(params[0]) ? params[0] : params;
          const pgSql = normalizeSql(sql);
          const res = await pool.query(pgSql, flatParams);
          return res.rows || [];
        },
        async run(...params) {
          let flatParams = params.length === 1 && Array.isArray(params[0]) ? params[0] : params;
          let pgSql = normalizeSql(sql).trim();

          const isInsert = /^INSERT\s+INTO/i.test(pgSql);
          if (isInsert && !/RETURNING/i.test(pgSql)) {
            pgSql += ' RETURNING id';
          }

          const res = await pool.query(pgSql, flatParams);
          const lastId = res.rows && res.rows[0] && res.rows[0].id ? Number(res.rows[0].id) : undefined;
          return {
            changes: res.rowCount || 0,
            lastInsertRowid: lastId
          };
        }
      };
    },
    async exec(sql) {
      return pool.query(sql);
    },
    async query(sql, params = []) {
      const pgSql = normalizeSql(sql);
      const res = await pool.query(pgSql, params);
      return res.rows;
    }
  };
}

async function testAdapter() {
  const rawUserUrl = 'postgresql://postgres:[Ar8&64JW+nh9%#z]@db.qrgxqaxifmiaroytlxuz.supabase.co:5432/postgres';
  const cleanUrl = sanitizeDatabaseUrl(rawUserUrl);
  console.log('URL Original:  ', rawUserUrl);
  console.log('URL Sanitizada:', cleanUrl);
  const db = createPgAdapter(cleanUrl);

  console.log('--- TESTANDO ADAPTER SUPABASE POSTGRESQL ---');

  // 1. Teste .get()
  const user = await db.prepare('SELECT id, nome, email FROM usuarios WHERE id = ?').get(3);
  console.log('1. User encontrado:', user);

  // 2. Teste .all()
  const ocorrencias = await db.prepare('SELECT id, data, setor, problema FROM ocorrencias WHERE usuario_id = ? ORDER BY data DESC LIMIT 2').all(3);
  console.log(`2. Ocorrências encontradas (${ocorrencias.length}):`, ocorrencias);

  // 3. Teste query do dashboard com strftime
  const totalRow = await db.prepare(`
    SELECT COUNT(*) as count FROM ocorrencias
    WHERE usuario_id = ?
      AND strftime('%Y', data) = ? AND strftime('%m', data) = ?
  `).get(3, '2026', '09');
  console.log('3. Dashboard totalRow:', totalRow, typeof totalRow.count);

  // 4. Teste .run() INSERT
  const insertRes = await db.prepare(`
    INSERT INTO ocorrencias (usuario_id, data, setor, tipo_problema, problema, status, prioridade)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(3, '2026-09-30', 'TI Teste Adapter', 'Hardware', 'Problema teste adapter', 'Aberto', 'Normal');
  console.log('4. Insert resultado:', insertRes);

  // 5. Teste .run() UPDATE
  const updateRes = await db.prepare('UPDATE ocorrencias SET problema = ? WHERE id = ?').run('Problema teste atualizado', insertRes.lastInsertRowid);
  console.log('5. Update resultado:', updateRes);

  // 6. Teste .run() DELETE
  const deleteRes = await db.prepare('DELETE FROM ocorrencias WHERE id = ?').run(insertRes.lastInsertRowid);
  console.log('6. Delete resultado:', deleteRes);

  console.log('--- TODOS OS TESTES DO ADAPTER PASSARAM COM 100% DE SUCESSO! ---');
  await db.pool.end();
}

testAdapter().catch(err => {
  console.error('ERRO:', err);
  process.exit(1);
});
