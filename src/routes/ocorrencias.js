const express = require('express');
const router = express.Router();
const db = require('../database/db');
const authMiddleware = require('../middleware/auth');

// Todas as rotas de ocorrências exigem autenticação
router.use(authMiddleware);

// GET /api/ocorrencias - Listagem das ocorrências do usuário com filtros
router.get('/', async (req, res) => {
  try {
    const { mes, ano, status, prioridade, busca, data_inicio, data_fim } = req.query;
    const usuarioId = req.usuario.id;

    let query = `SELECT * FROM ocorrencias WHERE usuario_id = ?`;
    const params = [usuarioId];

    if (data_inicio && data_fim) {
      query += ` AND data >= ? AND data <= ?`;
      params.push(String(data_inicio).slice(0, 10), String(data_fim).slice(0, 10));
    } else if (data_inicio) {
      query += ` AND data >= ?`;
      params.push(String(data_inicio).slice(0, 10));
    } else if (data_fim) {
      query += ` AND data <= ?`;
      params.push(String(data_fim).slice(0, 10));
    } else {
      if (ano) {
        query += ` AND strftime('%Y', data) = ?`;
        params.push(String(ano));
      }

      if (mes) {
        const formattedMonth = String(mes).padStart(2, '0');
        query += ` AND strftime('%m', data) = ?`;
        params.push(formattedMonth);
      }
    }

    if (status) {
      query += ` AND status = ?`;
      params.push(status);
    }

    if (prioridade) {
      query += ` AND prioridade = ?`;
      params.push(prioridade);
    }

    if (busca && busca.trim()) {
      query += ` AND (setor LIKE ? OR problema LIKE ? OR diagnostico LIKE ? OR o_que_foi_feito LIKE ?)`;
      const term = `%${busca.trim()}%`;
      params.push(term, term, term, term);
    }

    query += ` ORDER BY data DESC, id DESC`;

    const ocorrencias = await db.prepare(query).all(...params);
    res.json(ocorrencias);
  } catch (error) {
    res.status(500).json({ erro: 'Erro ao listar ocorrências.', detalhes: error.message });
  }
});

// GET /api/ocorrencias/:id - Detalhes de uma ocorrência do usuário
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const usuarioId = req.usuario.id;

    const ocorrencia = await db.prepare('SELECT * FROM ocorrencias WHERE id = ? AND usuario_id = ?').get(id, usuarioId);

    if (!ocorrencia) {
      return res.status(404).json({ erro: 'Ocorrência não encontrada ou você não tem permissão para acessá-la.' });
    }

    res.json(ocorrencia);
  } catch (error) {
    res.status(500).json({ erro: 'Erro ao buscar ocorrência.', detalhes: error.message });
  }
});

// POST /api/ocorrencias - Cadastro de nova ocorrência vinculada ao usuário logado
router.post('/', async (req, res) => {
  try {
    const {
      data,
      setor,
      tipo_problema,
      problema,
      diagnostico,
      o_que_foi_feito,
      status = 'Aberto',
      prioridade = 'Normal'
    } = req.body;

    const usuarioId = req.usuario.id;

    if (!setor || !tipo_problema || !problema) {
      return res.status(400).json({ erro: 'Os campos Setor, Tipo de Problema e Problema são obrigatórios.' });
    }

    const finalData = data ? String(data).slice(0, 10) : new Date().toISOString().slice(0, 10);

    const insertStmt = db.prepare(`
      INSERT INTO ocorrencias (
        usuario_id, data, setor, tipo_problema, problema, diagnostico, o_que_foi_feito, status, prioridade
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = await insertStmt.run(
      usuarioId,
      finalData,
      setor.trim(),
      tipo_problema,
      problema.trim(),
      diagnostico ? diagnostico.trim() : '',
      o_que_foi_feito ? o_que_foi_feito.trim() : '',
      status,
      prioridade
    );

    const novaOcorrencia = await db.prepare('SELECT * FROM ocorrencias WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(novaOcorrencia);
  } catch (error) {
    res.status(500).json({ erro: 'Erro ao cadastrar ocorrência.', detalhes: error.message });
  }
});

// PUT /api/ocorrencias/:id - Atualização de ocorrência com verificação de posse
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const usuarioId = req.usuario.id;
    const {
      data,
      setor,
      tipo_problema,
      problema,
      diagnostico,
      o_que_foi_feito,
      status,
      prioridade
    } = req.body;

    const existing = await db.prepare('SELECT * FROM ocorrencias WHERE id = ? AND usuario_id = ?').get(id, usuarioId);
    if (!existing) {
      return res.status(404).json({ erro: 'Ocorrência não encontrada ou você não tem permissão para alterá-la.' });
    }

    await db.prepare(`
      UPDATE ocorrencias
      SET data = COALESCE(?, data),
          setor = COALESCE(?, setor),
          tipo_problema = COALESCE(?, tipo_problema),
          problema = COALESCE(?, problema),
          diagnostico = COALESCE(?, diagnostico),
          o_que_foi_feito = COALESCE(?, o_que_foi_feito),
          status = COALESCE(?, status),
          prioridade = COALESCE(?, prioridade),
          atualizado_em = datetime('now', 'localtime')
      WHERE id = ? AND usuario_id = ?
    `).run(
      data ?? null,
      setor ?? null,
      tipo_problema ?? null,
      problema ?? null,
      diagnostico ?? null,
      o_que_foi_feito ?? null,
      status ?? null,
      prioridade ?? null,
      id,
      usuarioId
    );

    const atualizado = await db.prepare('SELECT * FROM ocorrencias WHERE id = ?').get(id);
    res.json(atualizado);
  } catch (error) {
    res.status(500).json({ erro: 'Erro ao atualizar ocorrência.', detalhes: error.message });
  }
});

// DELETE /api/ocorrencias/:id - Exclusão de ocorrência com verificação de posse
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const usuarioId = req.usuario.id;

    const existing = await db.prepare('SELECT * FROM ocorrencias WHERE id = ? AND usuario_id = ?').get(id, usuarioId);
    if (!existing) {
      return res.status(404).json({ erro: 'Ocorrência não encontrada ou você não tem permissão para excluí-la.' });
    }

    await db.prepare('DELETE FROM ocorrencias WHERE id = ? AND usuario_id = ?').run(id, usuarioId);
    try { await db.exec(`PRAGMA wal_checkpoint(PASSIVE);`); } catch (e) {}
    res.json({ mensagem: 'Ocorrência excluída com sucesso.', id });
  } catch (error) {
    res.status(500).json({ erro: 'Erro ao excluir ocorrência.', detalhes: error.message });
  }
});

// POST /api/ocorrencias/sincronizar - Sincronização e restauração inteligente em lote
router.post('/sincronizar', async (req, res) => {
  try {
    const usuarioId = req.usuario.id;
    const { ocorrencias } = req.body;

    if (!Array.isArray(ocorrencias) || ocorrencias.length === 0) {
      const allCurrent = await db.prepare('SELECT * FROM ocorrencias WHERE usuario_id = ? ORDER BY data DESC, id DESC').all(usuarioId);
      return res.json({ restauradas: 0, total: allCurrent.length, ocorrencias: allCurrent });
    }

    const checkStmt = db.prepare(`
      SELECT id FROM ocorrencias
      WHERE usuario_id = ? AND data = ? AND setor = ? AND problema = ?
    `);

    const insertStmt = db.prepare(`
      INSERT INTO ocorrencias (
        usuario_id, data, setor, tipo_problema, problema, diagnostico, o_que_foi_feito, status, prioridade
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    let restauradas = 0;
    for (const item of ocorrencias) {
      if (!item || !item.problema || !item.setor) continue;
      const dataVal = item.data ? String(item.data).slice(0, 10) : new Date().toISOString().slice(0, 10);
      const setorVal = String(item.setor).trim();
      const problemaVal = String(item.problema).trim();

      const exists = await checkStmt.get(usuarioId, dataVal, setorVal, problemaVal);
      if (!exists) {
        await insertStmt.run(
          usuarioId,
          dataVal,
          setorVal,
          item.tipo_problema || 'Outro',
          problemaVal,
          item.diagnostico ? String(item.diagnostico).trim() : '',
          item.o_que_foi_feito ? String(item.o_que_foi_feito).trim() : '',
          item.status || 'Aberto',
          item.prioridade || 'Normal'
        );
        restauradas++;
      }
    }

    try { await db.exec(`PRAGMA wal_checkpoint(PASSIVE);`); } catch (e) {}

    const allUpdated = await db.prepare('SELECT * FROM ocorrencias WHERE usuario_id = ? ORDER BY data DESC, id DESC').all(usuarioId);
    res.json({
      mensagem: `${restauradas} ocorrência(s) restaurada(s) e sincronizada(s) com sucesso!`,
      restauradas,
      total: allUpdated.length,
      ocorrencias: allUpdated
    });
  } catch (error) {
    res.status(500).json({ erro: 'Erro ao sincronizar ocorrências.', detalhes: error.message });
  }
});

module.exports = router;
