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
          bodyBuffer
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

async function runTests() {
  console.log('Iniciando bateria de testes do sistema de relatórios...');

  // 1. Testar se o index.html é servido com os dois modelos
  const indexRes = await request('/');
  if (indexRes.statusCode !== 200) {
    throw new Error(`Falha ao obter index.html. Status: ${indexRes.statusCode}`);
  }
  const html = indexRes.bodyText;
  const hasModel1 = html.includes('Modelo 1: Relatório Gerencial de Ocorrências');
  const hasModel2 = html.includes('Modelo 2: Relatório de Produtividade Oficial de T.I.');
  const hasA4Sheet = html.includes('a4-productivity-sheet');
  const hasBackupJson = html.includes('Backup e Restauração Completa em JSON');
  const hasSavedReportsModal = html.includes('modalSavedReports');

  console.log('1. Verificação de Elementos na Interface (HTML):');
  console.log('   - Aba Modelo 1 (Existente):', hasModel1 ? '✓ OK' : '✗ FALHA');
  console.log('   - Aba Modelo 2 (Produtividade Oficial):', hasModel2 ? '✓ OK' : '✗ FALHA');
  console.log('   - Folha A4 Oficial:', hasA4Sheet ? '✓ OK' : '✗ FALHA');
  console.log('   - Backup JSON em Ajustes:', hasBackupJson ? '✓ OK' : '✗ FALHA');
  console.log('   - Modal de Relatórios Salvos:', hasSavedReportsModal ? '✓ OK' : '✗ FALHA');

  if (!hasModel1 || !hasModel2 || !hasA4Sheet || !hasBackupJson || !hasSavedReportsModal) {
    throw new Error('Algum elemento HTML essencial não foi encontrado.');
  }

  // 2. Login com usuário de teste
  console.log('\n2. Autenticação na API:');
  const testEmail = `teste.relatorio.${Date.now()}@hospital.com`;
  const cadRes = await request('/api/auth/cadastro', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      nome: 'Técnico de T.I. Oficial',
      email: testEmail,
      senha: 'teste'
    })
  });

  let token = '';
  if (cadRes.statusCode === 201) {
    const cadData = JSON.parse(cadRes.bodyText);
    token = cadData.token;
    console.log('   - Cadastro e Login de usuário de teste: ✓ OK');
  } else {
    throw new Error(`Falha no cadastro: ${cadRes.bodyText}`);
  }

  const authHeaders = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  };

  // 3. Teste do Modelo 1 (Existente)
  console.log('\n3. Teste do Relatório Modelo 1 (Existente):');
  const now = new Date();
  const mesAtual = now.getMonth() + 1;
  const anoAtual = now.getFullYear();
  const rel1Res = await request(`/api/relatorio?mes=${mesAtual}&ano=${anoAtual}`, {
    headers: authHeaders
  });
  if (rel1Res.statusCode === 200) {
    const r1Data = JSON.parse(rel1Res.bodyText);
    console.log(`   - Dados recuperados: Total de ocorrências = ${r1Data.indicadores.total} (✓ OK)`);
  } else {
    throw new Error(`Falha no relatório Modelo 1: ${rel1Res.bodyText}`);
  }

  // 4. Teste de busca por Período Personalizado (Datas Início e Fim)
  console.log('\n4. Teste de Consulta com Período Personalizado (data_inicio / data_fim):');
  const dIni = `${anoAtual}-${String(mesAtual).padStart(2, '0')}-01`;
  const dFim = `${anoAtual}-${String(mesAtual).padStart(2, '0')}-28`;
  const relCustomRes = await request(`/api/relatorio?data_inicio=${dIni}&data_fim=${dFim}`, {
    headers: authHeaders
  });
  if (relCustomRes.statusCode === 200) {
    const rcData = JSON.parse(relCustomRes.bodyText);
    console.log(`   - Período customizado (${rcData.periodoLabel}): Total = ${rcData.indicadores.total} (✓ OK)`);
  } else {
    throw new Error(`Falha na consulta por período: ${relCustomRes.bodyText}`);
  }

  // 5. Salvar Relatório no Histórico
  console.log('\n5. Teste de Salvar Relatório no Histórico (relatorios_salvos):');
  const payloadSalvar = {
    tipo: 'produtividade',
    titulo: `Relatório de Produtividade – ${dIni} até ${dFim}`,
    periodo_inicio: dIni,
    periodo_fim: dFim,
    dados: {
      identificacao: {
        periodo: `${dIni} até ${dFim}`,
        unidade_setor: 'Núcleo de Tecnologia da Informação',
        responsavel: 'Técnico de T.I. Oficial',
        cargo: 'Técnico de Tecnologia da Informação',
        data_emissao: '29/09/2026',
        segmento: 'manutenção, suporte ao usuário e infraestrutura'
      },
      objetivo: 'Apresentar as atividades executadas pelo colaborador durante o período avaliado.',
      atividades: ['Manutenção preventiva em microcomputadores', 'Suporte a prontuário eletrônico'],
      indicadores: {
        manutencoes_preventivas: 4,
        atendimentos_usuarios: 15,
        intervencoes_rede: 3,
        equipamentos_alocados: 2,
        outras_demandas: 1
      },
      resultados_obtidos: 'Estabilidade operacional mantida com 100% de disponibilidade.',
      dificuldades: 'Sem dificuldades expressivas registradas no período.'
    }
  };

  const saveRes = await request('/api/relatorio/salvos', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify(payloadSalvar)
  });

  let savedId = null;
  if (saveRes.statusCode === 201) {
    const saveData = JSON.parse(saveRes.bodyText);
    savedId = saveData.id;
    console.log(`   - Relatório salvo com sucesso! ID: ${savedId} (✓ OK)`);
  } else {
    throw new Error(`Falha ao salvar relatório: ${saveRes.bodyText}`);
  }

  // 6. Listar Relatórios Salvos no Histórico
  console.log('\n6. Teste de Listagem de Relatórios Salvos:');
  const listRes = await request('/api/relatorio/salvos', {
    headers: authHeaders
  });
  if (listRes.statusCode === 200) {
    const listData = JSON.parse(listRes.bodyText);
    console.log(`   - Quantidade de relatórios salvos encontrados: ${listData.length} (✓ OK)`);
    const found = listData.find(item => item.id === savedId);
    if (!found) throw new Error('O relatório salvo não foi encontrado na listagem.');
  } else {
    throw new Error(`Falha ao listar relatórios salvos: ${listRes.bodyText}`);
  }

  // 7. Teste de Exportação para Word (.docx) do Modelo de Produtividade Oficial
  console.log('\n7. Teste de Geração do Word (.docx) Oficial de Produtividade:');
  const docxRes = await request('/api/relatorio/produtividade/docx', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify(payloadSalvar.dados)
  });
  if (docxRes.statusCode === 200 && docxRes.headers['content-type'].includes('officedocument')) {
    console.log(`   - Arquivo .docx gerado com sucesso! Tamanho do buffer: ${docxRes.bodyBuffer.length} bytes (✓ OK)`);
  } else {
    throw new Error(`Falha ao gerar DOCX de produtividade: Status ${docxRes.statusCode}, ${docxRes.bodyText}`);
  }

  // 8. Teste de Backup em Formato JSON (incluindo relatórios salvos)
  console.log('\n8. Teste de Exportação do Backup JSON Completo:');
  const backupRes = await request(`/api/configuracoes/backup-json?token=${encodeURIComponent(token)}`);
  if (backupRes.statusCode === 200) {
    const backupJson = JSON.parse(backupRes.bodyText);
    console.log('   - Backup JSON gerado com sucesso!');
    console.log(`     * Usuário: ${backupJson.usuario.nome}`);
    console.log(`     * Total ocorrências no backup: ${backupJson.ocorrencias.length}`);
    console.log(`     * Total relatórios salvos no backup: ${backupJson.relatorios_salvos.length}`);
    if (backupJson.relatorios_salvos.length === 0) {
      throw new Error('Relatório salvo esperado no backup JSON não foi encontrado.');
    }
    console.log('   - Verificação do backup JSON: ✓ OK');
  } else {
    throw new Error(`Falha no backup JSON: ${backupRes.bodyText}`);
  }

  console.log('\n======================================================');
  console.log('  TODOS OS TESTES FORAM CONCLUÍDOS COM 100% DE SUCESSO!');
  console.log('======================================================\n');
}

runTests().catch(err => {
  console.error('\n❌ ERRO DURANTE OS TESTES:', err);
  process.exit(1);
});
