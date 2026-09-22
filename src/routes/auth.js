const express = require('express');
const router = express.Router();
const db = require('../database/db');
const { hashPassword, verifyPassword, isLegacyPassword, generateToken } = require('../utils/security');
const authMiddleware = require('../middleware/auth');

// POST /api/auth/cadastro - Criação de nova conta de usuário
router.post('/cadastro', (req, res) => {
  try {
    const { nome, email, senha } = req.body;

    if (!nome || !nome.trim()) {
      return res.status(400).json({ erro: 'O nome completo é obrigatório.' });
    }
    if (!email || !email.includes('@')) {
      return res.status(400).json({ erro: 'Informe um e-mail válido.' });
    }
    if (!senha || senha.length < 4) {
      return res.status(400).json({ erro: 'A senha deve ter no mínimo 4 caracteres.' });
    }

    const emailNorm = email.trim().toLowerCase();
    const nomeNorm = nome.trim();

    // Verifica duplicidade de e-mail
    const exists = db.prepare('SELECT id FROM usuarios WHERE email = ?').get(emailNorm);
    if (exists) {
      return res.status(400).json({ erro: 'Este e-mail já está cadastrado. Faça login ou use outro e-mail.' });
    }

    const senhaHash = hashPassword(senha);

    const insertUser = db.prepare(`
      INSERT INTO usuarios (nome, email, senha_hash)
      VALUES (?, ?, ?)
    `);
    const result = insertUser.run(nomeNorm, emailNorm, senhaHash);
    const userId = Number(result.lastInsertRowid);

    // Cria as configurações exclusivas deste usuário
    db.prepare(`
      INSERT INTO configuracoes_usuario (usuario_id, nome_hospital, setor, nome_responsavel, logo_path)
      VALUES (?, 'Hospital Regional Nossa Senhora do Bom Conselho', 'Tecnologia da Informação', ?, 'uploads/logo.png')
    `).run(userId, nomeNorm);

    // Cria 2 ocorrências iniciais de boas-vindas para o usuário visualizar o sistema já populado
    const today = new Date().toISOString().slice(0, 10);
    const insertOc = db.prepare(`
      INSERT INTO ocorrencias (usuario_id, data, setor, tipo_problema, problema, diagnostico, o_que_foi_feito, status, prioridade)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insertOc.run(
      userId,
      today,
      'Pronto Atendimento',
      'Hardware',
      'Verificação preventiva dos computadores e impressoras da triagem.',
      'Rotina inicial de checagem técnica.',
      'Equipamentos testados, cabos organizados e impressoras operacionais.',
      'Resolvido',
      'Normal'
    );

    insertOc.run(
      userId,
      today,
      'UTI Geral',
      'Rede/Internet',
      'Teste de conectividade do terminal de monitoramento.',
      'Sinal estável.',
      'Ponto de rede certificado e link ativo.',
      'Resolvido',
      'Normal'
    );

    const token = generateToken({ id: userId, email: emailNorm });

    res.status(201).json({
      mensagem: 'Conta criada com sucesso!',
      token,
      usuario: {
        id: userId,
        nome: nomeNorm,
        email: emailNorm
      }
    });
  } catch (error) {
    res.status(500).json({ erro: 'Erro ao realizar cadastro.', detalhes: error.message });
  }
});

// POST /api/auth/login - Autenticação com e-mail e senha
router.post('/login', (req, res) => {
  try {
    const { email, senha } = req.body;

    if (!email || !senha) {
      return res.status(400).json({ erro: 'Informe o e-mail e a senha.' });
    }

    const emailNorm = email.trim().toLowerCase();
    const user = db.prepare('SELECT * FROM usuarios WHERE email = ?').get(emailNorm);

    if (!user) {
      return res.status(401).json({ erro: 'E-mail ou senha incorretos.' });
    }

    const isValid = verifyPassword(senha, user.senha_hash);
    if (!isValid) {
      return res.status(401).json({ erro: 'E-mail ou senha incorretos.' });
    }

    // Se a senha armazenada for legada, atualiza de forma transparente para hash seguro scrypt
    if (isLegacyPassword(user.senha_hash)) {
      try {
        const secureHash = hashPassword(senha);
        db.prepare('UPDATE usuarios SET senha_hash = ? WHERE id = ?').run(secureHash, user.id);
      } catch (errMigrate) {
        console.error('[Auth] Aviso ao atualizar hash de senha legada:', errMigrate.message);
      }
    }

    const token = generateToken({ id: user.id, email: user.email });

    res.json({
      mensagem: 'Login realizado com sucesso!',
      token,
      usuario: {
        id: user.id,
        nome: user.nome,
        email: user.email
      }
    });
  } catch (error) {
    res.status(500).json({ erro: 'Erro ao realizar login.', detalhes: error.message });
  }
});

// POST /api/auth/recuperar-senha - Redefinição de senha sem perda de dados
router.post('/recuperar-senha', (req, res) => {
  try {
    const { email, novaSenha } = req.body;

    if (!email || !email.trim()) {
      return res.status(400).json({ erro: 'Informe o e-mail cadastrado.' });
    }
    if (!novaSenha || novaSenha.length < 4) {
      return res.status(400).json({ erro: 'A nova senha deve ter no mínimo 4 caracteres.' });
    }

    const emailNorm = email.trim().toLowerCase();
    const user = db.prepare('SELECT * FROM usuarios WHERE email = ?').get(emailNorm);

    if (!user) {
      return res.status(404).json({
        erro: 'Não encontramos nenhuma conta com este e-mail. Verifique a digitação ou crie uma nova conta.'
      });
    }

    const senhaArmazenada = hashPassword(novaSenha);
    db.prepare('UPDATE usuarios SET senha_hash = ? WHERE id = ?').run(senhaArmazenada, user.id);

    const token = generateToken({ id: user.id, email: user.email });

    res.json({
      mensagem: 'Senha redefinida com sucesso! Todos os seus dados e ocorrências estão preservados.',
      token,
      usuario: {
        id: user.id,
        nome: user.nome,
        email: user.email
      }
    });
  } catch (error) {
    res.status(500).json({ erro: 'Erro ao redefinir a senha.', detalhes: error.message });
  }
});

// POST /api/auth/alterar-senha - Alteração de senha pelo usuário autenticado
router.post('/alterar-senha', authMiddleware, (req, res) => {
  try {
    const { senhaAtual, novaSenha } = req.body;

    if (!senhaAtual || !novaSenha) {
      return res.status(400).json({ erro: 'Informe a senha atual e a nova senha.' });
    }
    if (novaSenha.length < 4) {
      return res.status(400).json({ erro: 'A nova senha deve ter pelo menos 4 caracteres.' });
    }

    const user = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(req.usuario.id);
    if (!user) {
      return res.status(404).json({ erro: 'Usuário não encontrado.' });
    }

    const isMatch = verifyPassword(senhaAtual, user.senha_hash);
    if (!isMatch) {
      return res.status(401).json({ erro: 'A senha atual informada está incorreta.' });
    }

    const novaSenhaArmazenada = hashPassword(novaSenha);
    db.prepare('UPDATE usuarios SET senha_hash = ? WHERE id = ?').run(novaSenhaArmazenada, user.id);

    res.json({ mensagem: 'Sua senha foi alterada com sucesso!' });
  } catch (error) {
    res.status(500).json({ erro: 'Erro ao alterar a senha.', detalhes: error.message });
  }
});

// GET /api/auth/me - Dados do usuário atualmente autenticado
router.get('/me', authMiddleware, (req, res) => {
  res.json({ usuario: req.usuario });
});

module.exports = router;
