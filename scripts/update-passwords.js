const db = require('../src/database/db');
const { hashPassword } = require('../src/utils/security');

// Atualiza as senhas com hash criptográfico seguro scrypt
const updates = [
  { email: 'ltecnico422@gmail.com', pass: '123456' },
  { email: 'iescodec@gmail.com', pass: '1234' },
  { email: 'northon.ti@hnsbc.com.br', pass: '123456' },
  { email: 'adailton.palestrante@gmail.com', pass: '123456' },
  { email: 'tecnico.a.1789998217777@hospital.com', pass: '123456' },
  { email: 'tecnico.b.1789998217777@hospital.com', pass: '123456' },
  { email: 'pwa.excel.1789999729428@hospital.com', pass: '123456' }
];

const stmt = db.prepare('UPDATE usuarios SET senha_hash = ? WHERE email = ?');
for (const u of updates) {
  const hash = hashPassword(u.pass);
  stmt.run(hash, u.email);
}

console.log('--- Usuários e Senhas Gravadas no Banco ---');
const users = db.prepare('SELECT id, nome, email, senha_hash FROM usuarios').all();
console.table(users);
