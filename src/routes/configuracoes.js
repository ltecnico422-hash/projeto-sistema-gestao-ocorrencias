const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('node:path');
const fs = require('node:fs');
const db = require('../database/db');
const authMiddleware = require('../middleware/auth');

router.use(authMiddleware);

// Configuração do Multer para upload do Logo
const uploadDir = path.join(__dirname, '../../uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.png';
    cb(null, `logo_user_${req.usuario.id}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|webp|svg/;
    const extname = allowed.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowed.test(file.mimetype);
    if (extname && mimetype) {
      return cb(null, true);
    }
    cb(new Error('Apenas arquivos de imagem (PNG, JPG, WEBP, SVG) são permitidos.'));
  }
});

function getUserConfig(usuarioId, nomePadrao) {
  let cfg = db.prepare('SELECT * FROM configuracoes_usuario WHERE usuario_id = ?').get(usuarioId);
  if (!cfg) {
    db.prepare(`
      INSERT INTO configuracoes_usuario (usuario_id, nome_hospital, setor, nome_responsavel, logo_path)
      VALUES (?, 'Hospital Regional Nossa Senhora do Bom Conselho', 'Tecnologia da Informação', ?, 'uploads/logo.png')
    `).run(usuarioId, nomePadrao || '');
    cfg = db.prepare('SELECT * FROM configuracoes_usuario WHERE usuario_id = ?').get(usuarioId);
  }
  return cfg;
}

// GET /api/configuracoes - Configurações privativas do usuário autenticado
router.get('/', (req, res) => {
  try {
    const config = getUserConfig(req.usuario.id, req.usuario.nome);
    res.json(config);
  } catch (error) {
    res.status(500).json({ erro: 'Erro ao consultar configurações.', detalhes: error.message });
  }
});

// PUT /api/configuracoes - Atualiza as configurações privativas do usuário
router.put('/', (req, res) => {
  try {
    const { nome_hospital, setor, nome_responsavel } = req.body;
    const usuarioId = req.usuario.id;

    getUserConfig(usuarioId, req.usuario.nome);

    db.prepare(`
      UPDATE configuracoes_usuario
      SET nome_hospital = COALESCE(?, nome_hospital),
          setor = COALESCE(?, setor),
          nome_responsavel = COALESCE(?, nome_responsavel),
          atualizado_em = datetime('now', 'localtime')
      WHERE usuario_id = ?
    `).run(
      nome_hospital ?? null,
      setor ?? null,
      nome_responsavel ?? null,
      usuarioId
    );

    const updated = db.prepare('SELECT * FROM configuracoes_usuario WHERE usuario_id = ?').get(usuarioId);
    res.json({ mensagem: 'Configurações atualizadas com sucesso.', dados: updated });
  } catch (error) {
    res.status(500).json({ erro: 'Erro ao atualizar configurações.', detalhes: error.message });
  }
});

// POST /api/configuracoes/logo - Upload de logotipo exclusivo para o usuário
router.post('/logo', upload.single('logo'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ erro: 'Nenhum arquivo de imagem foi enviado.' });
    }

    const usuarioId = req.usuario.id;
    const relativePath = `uploads/${req.file.filename}`;

    getUserConfig(usuarioId, req.usuario.nome);

    db.prepare(`
      UPDATE configuracoes_usuario
      SET logo_path = ?, atualizado_em = datetime('now', 'localtime')
      WHERE usuario_id = ?
    `).run(relativePath, usuarioId);

    res.json({
      mensagem: 'Logotipo atualizado com sucesso.',
      logo_path: relativePath
    });
  } catch (error) {
    res.status(500).json({ erro: 'Erro ao processar upload do logotipo.', detalhes: error.message });
  }
});

// GET /api/configuracoes/backup - Download da cópia de segurança do banco de dados com 1 clique
router.get('/backup', (req, res) => {
  try {
    const dbPath = path.join(__dirname, '../../data/database.sqlite');
    if (!fs.existsSync(dbPath)) {
      return res.status(404).json({ erro: 'Arquivo de banco de dados não encontrado.' });
    }

    // Força checkpoint para garantir que tudo do WAL esteja no arquivo principal
    try {
      db.exec('PRAGMA wal_checkpoint(TRUNCATE);');
    } catch (e) {
      // continua
    }

    const todayStr = new Date().toISOString().slice(0, 10);
    const filename = `backup-ti-hospital-${todayStr}.sqlite`;

    res.setHeader('Content-Type', 'application/x-sqlite3');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    const fileStream = fs.createReadStream(dbPath);
    fileStream.pipe(res);
  } catch (error) {
    res.status(500).json({ erro: 'Erro ao gerar backup do banco de dados.', detalhes: error.message });
  }
});

module.exports = router;
