const express = require('express');
const router = express.Router();
const db = require('../database/db');
const authMiddleware = require('../middleware/auth');

router.use(authMiddleware);

// GET /api/dashboard - Indicadores e métricas exclusivas do usuário logado
router.get('/', (req, res) => {
  try {
    const today = new Date();
    const ano = req.query.ano ? String(req.query.ano) : String(today.getFullYear());
    const mes = req.query.mes
      ? String(req.query.mes).padStart(2, '0')
      : String(today.getMonth() + 1).padStart(2, '0');

    const usuarioId = req.usuario.id;

    // Total de ocorrências no período
    const totalRow = db.prepare(`
      SELECT COUNT(*) as count FROM ocorrencias
      WHERE usuario_id = ?
        AND strftime('%Y', data) = ? AND strftime('%m', data) = ?
    `).get(usuarioId, ano, mes);
    const total = totalRow.count;

    // Resolvidas
    const resolvidasRow = db.prepare(`
      SELECT COUNT(*) as count FROM ocorrencias
      WHERE usuario_id = ? AND status = 'Resolvido'
        AND strftime('%Y', data) = ? AND strftime('%m', data) = ?
    `).get(usuarioId, ano, mes);
    const resolvidas = resolvidasRow.count;

    // Em andamento
    const emAndamentoRow = db.prepare(`
      SELECT COUNT(*) as count FROM ocorrencias
      WHERE usuario_id = ? AND status = 'Em andamento'
        AND strftime('%Y', data) = ? AND strftime('%m', data) = ?
    `).get(usuarioId, ano, mes);
    const emAndamento = emAndamentoRow.count;

    // Abertas
    const abertasRow = db.prepare(`
      SELECT COUNT(*) as count FROM ocorrencias
      WHERE usuario_id = ? AND status = 'Aberto'
        AND strftime('%Y', data) = ? AND strftime('%m', data) = ?
    `).get(usuarioId, ano, mes);
    const abertas = abertasRow.count;

    // Alta prioridade / Urgente
    const altaPrioridadeRow = db.prepare(`
      SELECT COUNT(*) as count FROM ocorrencias
      WHERE usuario_id = ? AND prioridade IN ('Alta', 'Urgente')
        AND strftime('%Y', data) = ? AND strftime('%m', data) = ?
    `).get(usuarioId, ano, mes);
    const altaPrioridade = altaPrioridadeRow.count;

    // Percentuais de status
    const resolvidasPct = total > 0 ? Math.round((resolvidas / total) * 100) : 0;
    const emAndamentoPct = total > 0 ? Math.round((emAndamento / total) * 100) : 0;
    const abertasPct = total > 0 ? Math.round((abertas / total) * 100) : 0;

    // Últimas ocorrências registradas pelo usuário no período
    const atividadesRecentes = db.prepare(`
      SELECT id, data, setor, tipo_problema, problema, status, prioridade
      FROM ocorrencias
      WHERE usuario_id = ?
        AND strftime('%Y', data) = ? AND strftime('%m', data) = ?
      ORDER BY data DESC, id DESC
      LIMIT 5
    `).all(usuarioId, ano, mes);

    // Distribuição por Setor no período
    const porSetor = db.prepare(`
      SELECT setor, COUNT(*) as total,
             SUM(CASE WHEN status = 'Resolvido' THEN 1 ELSE 0 END) as resolvidas
      FROM ocorrencias
      WHERE usuario_id = ?
        AND strftime('%Y', data) = ? AND strftime('%m', data) = ?
      GROUP BY setor
      ORDER BY total DESC
      LIMIT 8
    `).all(usuarioId, ano, mes);

    // Distribuição por Tipo de Problema no período
    const porTipo = db.prepare(`
      SELECT tipo_problema, COUNT(*) as total,
             SUM(CASE WHEN status = 'Resolvido' THEN 1 ELSE 0 END) as resolvidas
      FROM ocorrencias
      WHERE usuario_id = ?
        AND strftime('%Y', data) = ? AND strftime('%m', data) = ?
      GROUP BY tipo_problema
      ORDER BY total DESC
      LIMIT 8
    `).all(usuarioId, ano, mes);

    // Distribuição por Prioridade no período
    const porPrioridade = db.prepare(`
      SELECT prioridade, COUNT(*) as total
      FROM ocorrencias
      WHERE usuario_id = ?
        AND strftime('%Y', data) = ? AND strftime('%m', data) = ?
      GROUP BY prioridade
      ORDER BY total DESC
    `).all(usuarioId, ano, mes);

    res.json({
      periodo: {
        mes: Number(mes),
        ano: Number(ano)
      },
      indicadores: {
        total,
        resolvidas,
        em_andamento: emAndamento,
        abertas,
        alta_prioridade: altaPrioridade
      },
      percentuais: {
        resolvidas_pct: resolvidasPct,
        em_andamento_pct: emAndamentoPct,
        abertas_pct: abertasPct
      },
      por_setor: porSetor,
      por_tipo: porTipo,
      por_prioridade: porPrioridade,
      atividades_recentes: atividadesRecentes
    });
  } catch (error) {
    res.status(500).json({ erro: 'Erro ao carregar dados do dashboard.', detalhes: error.message });
  }
});

module.exports = router;
