const { verifyToken } = require('../utils/security');
const db = require('../database/db');

async function authMiddleware(req, res, next) {
  let token = null;

  // 1. Busca no cabeçalho Authorization
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7).trim();
  }

  // 2. Busca nos parâmetros de query (necessário para downloads diretos em links de PDF e Word)
  if (!token && req.query.token) {
    token = req.query.token;
  }

  if (!token) {
    return res.status(401).json({
      erro: 'Acesso não autorizado. Faça login para continuar.',
      nao_autenticado: true
    });
  }

  const payload = verifyToken(token);
  if (!payload || !payload.id) {
    return res.status(401).json({
      erro: 'Sessão inválida ou expirada. Por favor, faça login novamente.',
      nao_autenticado: true
    });
  }

  try {
    // Valida usuário no banco
    const usuario = await db.prepare('SELECT id, nome, email FROM usuarios WHERE id = ?').get(payload.id);
    if (!usuario) {
      return res.status(401).json({
        erro: 'Usuário não encontrado. Por favor, faça login novamente.',
        nao_autenticado: true
      });
    }

    req.usuario = usuario;
    next();
  } catch (err) {
    return res.status(500).json({
      erro: 'Erro interno ao autenticar usuário.',
      detalhes: err.message
    });
  }
}

module.exports = authMiddleware;
