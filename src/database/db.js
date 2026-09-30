const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const fs = require('node:fs');

// Garante que o diretório data exista (suporta diretório configurável via nuvem)
const dataDir = process.env.DATA_DIR || path.join(__dirname, '../../data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'database.sqlite');
const db = new DatabaseSync(dbPath);

// Ativa WAL mode e foreign keys
db.exec(`PRAGMA journal_mode = WAL;`);
db.exec(`PRAGMA foreign_keys = ON;`);

// Criação das tabelas
db.exec(`
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
`);

// Migração segura para adicionar usuario_id se a tabela já existia sem essa coluna
try {
  db.exec(`ALTER TABLE ocorrencias ADD COLUMN usuario_id INTEGER REFERENCES usuarios(id) ON DELETE CASCADE;`);
} catch (e) {
  // Coluna já existe
}

try {
  db.exec(`ALTER TABLE relatorios_gerados ADD COLUMN usuario_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL;`);
} catch (e) {
  // Coluna já existe
}

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_ocorrencias_usuario ON ocorrencias (usuario_id);
  CREATE INDEX IF NOT EXISTS idx_ocorrencias_data ON ocorrencias (data);
  CREATE INDEX IF NOT EXISTS idx_ocorrencias_status ON ocorrencias (status);
  CREATE INDEX IF NOT EXISTS idx_ocorrencias_prioridade ON ocorrencias (prioridade);
  CREATE INDEX IF NOT EXISTS idx_relatorios_salvos_usuario ON relatorios_salvos (usuario_id);
`);

// Atribui registros históricos sem usuário ao usuário principal para nunca perder ocorrências
try {
  const adminUser = db.prepare('SELECT id FROM usuarios WHERE email = ?').get('ltecnico422@gmail.com') ||
                    db.prepare('SELECT id FROM usuarios ORDER BY id ASC LIMIT 1').get();
  if (adminUser) {
    db.prepare('UPDATE ocorrencias SET usuario_id = ? WHERE usuario_id IS NULL').run(adminUser.id);
  }
} catch (e) {
  // Ignora se tabela de usuários ainda não estiver pronta
}

// Garante que o registro padrão global de configurações exista (id = 1)
const configExists = db.prepare('SELECT id FROM configuracoes WHERE id = 1').get();
if (!configExists) {
  db.prepare(`
    INSERT INTO configuracoes (id, nome_hospital, setor, nome_responsavel, logo_path)
    VALUES (1, 'Hospital Regional Nossa Senhora do Bom Conselho', 'Tecnologia da Informação', '', 'uploads/logo.png')
  `).run();
}

module.exports = db;
