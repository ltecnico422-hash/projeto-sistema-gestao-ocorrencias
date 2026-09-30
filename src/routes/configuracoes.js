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

async function getUserConfig(usuarioId, nomePadrao) {
  let cfg = await db.prepare('SELECT * FROM configuracoes_usuario WHERE usuario_id = ?').get(usuarioId);
  if (!cfg) {
    await db.prepare(`
      INSERT INTO configuracoes_usuario (usuario_id, nome_hospital, setor, nome_responsavel, logo_path)
      VALUES (?, 'Hospital Regional Nossa Senhora do Bom Conselho', 'Tecnologia da Informação', ?, 'uploads/logo.png')
    `).run(usuarioId, nomePadrao || '');
    cfg = await db.prepare('SELECT * FROM configuracoes_usuario WHERE usuario_id = ?').get(usuarioId);
  }
  return cfg;
}

// GET /api/configuracoes - Configurações privativas do usuário autenticado
router.get('/', async (req, res) => {
  try {
    const config = await getUserConfig(req.usuario.id, req.usuario.nome);
    res.json(config);
  } catch (error) {
    res.status(500).json({ erro: 'Erro ao consultar configurações.', detalhes: error.message });
  }
});

// PUT /api/configuracoes - Atualiza as configurações privativas do usuário
router.put('/', async (req, res) => {
  try {
    const { nome_hospital, setor, nome_responsavel } = req.body;
    const usuarioId = req.usuario.id;

    await getUserConfig(usuarioId, req.usuario.nome);

    await db.prepare(`
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

    const updated = await db.prepare('SELECT * FROM configuracoes_usuario WHERE usuario_id = ?').get(usuarioId);
    res.json({ mensagem: 'Configurações atualizadas com sucesso.', dados: updated });
  } catch (error) {
    res.status(500).json({ erro: 'Erro ao atualizar configurações.', detalhes: error.message });
  }
});

// POST /api/configuracoes/logo - Upload de logotipo exclusivo para o usuário
router.post('/logo', upload.single('logo'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ erro: 'Nenhum arquivo de imagem foi enviado.' });
    }

    const usuarioId = req.usuario.id;
    const relativePath = `uploads/${req.file.filename}`;

    await getUserConfig(usuarioId, req.usuario.nome);

    await db.prepare(`
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
      return res.status(404).json({ erro: 'Arquivo de banco de dados SQLite local não encontrado (utilizando Supabase na nuvem).' });
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

// GET /api/configuracoes/backup-json - Exporta backup completo do usuário em JSON
router.get('/backup-json', async (req, res) => {
  try {
    const usuarioId = req.usuario.id;
    const config = await getUserConfig(usuarioId, req.usuario.nome);
    const ocorrencias = await db.prepare('SELECT * FROM ocorrencias WHERE usuario_id = ? ORDER BY data ASC, id ASC').all(usuarioId);
    
    let relatoriosSalvos = [];
    try {
      relatoriosSalvos = await db.prepare('SELECT * FROM relatorios_salvos WHERE usuario_id = ? ORDER BY criado_em DESC').all(usuarioId);
    } catch (e) {
      // tabela pode não existir ainda se migration não rodou
    }

    const backupData = {
      versao: '1.0',
      gerado_em: new Date().toISOString(),
      usuario: {
        id: req.usuario.id,
        nome: req.usuario.nome,
        email: req.usuario.email
      },
      configuracoes: config,
      ocorrencias: ocorrencias,
      relatorios_salvos: relatoriosSalvos
    };

    const todayStr = new Date().toISOString().slice(0, 10);
    const filename = `backup-ti-hospital-${todayStr}.json`;

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(JSON.stringify(backupData, null, 2));
  } catch (error) {
    res.status(500).json({ erro: 'Erro ao gerar backup JSON.', detalhes: error.message });
  }
});

// POST /api/configuracoes/restaurar-json - Restaura ocorrências e relatórios salvos a partir de arquivo JSON
router.post('/restaurar-json', async (req, res) => {
  try {
    const usuarioId = req.usuario.id;
    const { ocorrencias, relatorios_salvos, configuracoes } = req.body;

    if (!Array.isArray(ocorrencias) && !Array.isArray(relatorios_salvos) && !configuracoes) {
      return res.status(400).json({ erro: 'Estrutura do arquivo de backup JSON inválida.' });
    }

    let ocorrenciasImportadas = 0;
    let relatoriosImportados = 0;

    // Atualiza configurações se presentes
    if (configuracoes && (configuracoes.nome_hospital || configuracoes.setor || configuracoes.nome_responsavel)) {
      await db.prepare(`
        UPDATE configuracoes_usuario
        SET nome_hospital = COALESCE(?, nome_hospital),
            setor = COALESCE(?, setor),
            nome_responsavel = COALESCE(?, nome_responsavel),
            atualizado_em = datetime('now', 'localtime')
        WHERE usuario_id = ?
      `).run(
        configuracoes.nome_hospital || null,
        configuracoes.setor || null,
        configuracoes.nome_responsavel || null,
        usuarioId
      );
    }

    // Importa ocorrências
    if (Array.isArray(ocorrencias) && ocorrencias.length > 0) {
      const insertOc = db.prepare(`
        INSERT INTO ocorrencias (
          usuario_id, data, setor, tipo_problema, problema, diagnostico, o_que_foi_feito, status, prioridade
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const oc of ocorrencias) {
        if (oc.setor && oc.tipo_problema && oc.problema) {
          await insertOc.run(
            usuarioId,
            oc.data ? String(oc.data).slice(0, 10) : new Date().toISOString().slice(0, 10),
            oc.setor.trim(),
            oc.tipo_problema,
            oc.problema.trim(),
            oc.diagnostico ? oc.diagnostico.trim() : '',
            oc.o_que_foi_feito ? oc.o_que_foi_feito.trim() : '',
            oc.status || 'Aberto',
            oc.prioridade || 'Normal'
          );
          ocorrenciasImportadas++;
        }
      }
    }

    // Importa relatórios salvos
    if (Array.isArray(relatorios_salvos) && relatorios_salvos.length > 0) {
      const insertRel = db.prepare(`
        INSERT INTO relatorios_salvos (
          usuario_id, tipo, titulo, periodo_inicio, periodo_fim, dados_json
        ) VALUES (?, ?, ?, ?, ?, ?)
      `);

      for (const r of relatorios_salvos) {
        if (r.titulo && r.dados_json) {
          const dadosStr = typeof r.dados_json === 'string' ? r.dados_json : JSON.stringify(r.dados_json);
          await insertRel.run(
            usuarioId,
            r.tipo || 'produtividade',
            r.titulo,
            r.periodo_inicio || null,
            r.periodo_fim || null,
            dadosStr
          );
          relatoriosImportados++;
        }
      }
    }

    res.json({
      mensagem: 'Restauração de backup JSON concluída com sucesso!',
      ocorrencias_importadas: ocorrenciasImportadas,
      relatorios_importados: relatoriosImportados
    });
  } catch (error) {
    res.status(500).json({ erro: 'Erro ao restaurar backup JSON.', detalhes: error.message });
  }
});

module.exports = router;

