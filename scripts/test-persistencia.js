const http = require('http');

async function request(path, options = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: 'localhost',
      port: 3000,
      path,
      method: options.method || 'GET',
      headers: options.headers || {}
    }, (res) => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const bodyBuffer = Buffer.concat(chunks);
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          bodyText: bodyBuffer.toString('utf-8'),
          json: () => JSON.parse(bodyBuffer.toString('utf-8'))
        });
      });
    });

    req.on('error', reject);
    if (options.body) {
      req.write(options.body);
    }
    req.end();
  });
}

async function run() {
  console.log('--- Testando Persistência e Sincronização Inteligente ---');

  // 1. Criar usuário de teste
  const userEmail = `persist.${Date.now()}@teste.com`;
  const cadRes = await request('/api/auth/cadastro', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nome: 'Usuario Persistência', email: userEmail, senha: '1234' })
  });
  const { token, usuario } = cadRes.json();
  const headers = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };

  console.log('1. Usuário autenticado:', usuario.nome);

  // 2. Cadastrar 3 ocorrências de teste
  const ocorrenciasTeste = [
    { setor: 'UTI NEO', data: '2026-08-10', tipo_problema: 'Hardware', problema: 'Monitor não liga', status: 'Resolvido', prioridade: 'Alta' },
    { setor: 'Maternidade', data: '2026-08-15', tipo_problema: 'Software', problema: 'Erro ao abrir prontuário', status: 'Em andamento', prioridade: 'Urgente' },
    { setor: 'Farmácia', data: '2026-09-01', tipo_problema: 'Rede/Internet', problema: 'Sem acesso à rede local', status: 'Aberto', prioridade: 'Normal' }
  ];

  for (const oc of ocorrenciasTeste) {
    const res = await request('/api/ocorrencias', {
      method: 'POST',
      headers,
      body: JSON.stringify(oc)
    });
    if (res.statusCode !== 201) throw new Error('Falha ao cadastrar: ' + res.bodyText);
  }
  console.log('2. 3 ocorrências cadastradas via API.');

  // 3. Listar e conferir
  const listRes = await request('/api/ocorrencias', { headers });
  const list = listRes.json();
  if (list.length !== 5) throw new Error(`Esperado 5 ocorrências (2 de boas-vindas + 3 novas), obtido ${list.length}`);
  console.log('3. Listagem confirmada com 5 ocorrências registradas no banco.');

  // 4. Testar sincronização em lote (simulando restauração do cache do navegador)
  const syncRes = await request('/api/ocorrencias/sincronizar', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      ocorrencias: [
        ...ocorrenciasTeste,
        { setor: 'Pronto Atendimento', data: '2026-09-05', tipo_problema: 'Impressão', problema: 'Impressora travada', status: 'Resolvido', prioridade: 'Normal' }
      ]
    })
  });

  const syncData = syncRes.json();
  console.log('4. Sincronização em lote executada:', syncData.mensagem);
  if (syncData.total !== 6) throw new Error(`Esperado 6 ocorrências no total após sync, obtido ${syncData.total}`);

  console.log('✓ TESTE DE PERSISTÊNCIA E SINCRONIZAÇÃO PASSOU COM SUCESSO TOTAL!');
}

run().catch(e => {
  console.error('ERRO:', e);
  process.exit(1);
});
