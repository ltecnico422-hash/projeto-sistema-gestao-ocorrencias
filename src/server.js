const express = require('express');
const cors = require('cors');
const path = require('node:path');
const fs = require('node:fs');

// Inicializa banco de dados
require('./database/db');

const app = express();
const PORT = process.env.PORT || 3000;

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Servir arquivos estáticos (Frontend e Uploads)
const publicDir = path.join(__dirname, '../public');
const uploadsDir = process.env.UPLOADS_DIR || path.join(__dirname, '../uploads');

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

app.use('/uploads', express.static(uploadsDir));
app.use(express.static(publicDir));

// Rotas da API
app.use('/api/auth', require('./routes/auth'));
app.use('/api/configuracoes', require('./routes/configuracoes'));
app.use('/api/ocorrencias', require('./routes/ocorrencias'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/relatorio', require('./routes/relatorio'));

// Redirecionamento padrão para SPA
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/uploads')) {
    return next();
  }
  res.sendFile(path.join(publicDir, 'index.html'));
});

// Middleware de tratamento de erros
app.use((err, req, res, next) => {
  console.error('[Servidor] Erro não tratado:', err);
  res.status(500).json({
    erro: 'Ocorreu um erro interno no servidor.',
    detalhes: err.message
  });
});

app.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(` Sistema de Gestão e Relatório de Ocorrências de T.I.`);
  console.log(` Hospital Regional Nossa Senhora do Bom Conselho`);
  console.log(` Servidor rodando com sucesso em: http://localhost:${PORT}`);
  console.log(`=======================================================`);
});
