const db = require('./db');
const { hashPassword } = require('../utils/security');

async function runSeed() {
  if (db.initPromise) {
    await db.initPromise;
  }

  // 1. Cadastra usuários padrão se tabela estiver vazia
  let defaultUserId = 1;
  try {
    const usersCountRow = await db.prepare('SELECT COUNT(*) as count FROM usuarios').get();
    const usersCount = Number(usersCountRow && usersCountRow.count ? usersCountRow.count : 0);

    if (usersCount === 0) {
      console.log('[Seed] Criando usuários padrão...');
      const defaultUsers = [
        {
          nome: 'Técnico de T.I. - Suporte',
          email: 'ltecnico422@gmail.com',
          senha: hashPassword('123456'),
          setor: 'Tecnologia da Informação'
        },
        {
          nome: 'Administrador T.I.',
          email: 'admin@hospital.com',
          senha: hashPassword('123456'),
          setor: 'Tecnologia da Informação'
        }
      ];

      for (let i = 0; i < defaultUsers.length; i++) {
        const u = defaultUsers[i];
        const res = await db.prepare(`
          INSERT INTO usuarios (nome, email, senha_hash)
          VALUES (?, ?, ?)
        `).run(u.nome, u.email, u.senha);

        const uid = res && res.lastInsertRowid ? res.lastInsertRowid : (i + 1);
        if (i === 0) defaultUserId = uid;

        await db.prepare(`
          INSERT INTO configuracoes_usuario (usuario_id, nome_hospital, setor, nome_responsavel, logo_path)
          VALUES (?, 'Hospital Regional Nossa Senhora do Bom Conselho', ?, ?, 'uploads/logo.png')
        `).run(uid, u.setor, u.nome);
      }
      console.log('✓ [Seed] Usuários padrão cadastrados: ltecnico422@gmail.com / admin@hospital.com (Senha: 123456)');
    } else {
      const firstUser = await db.prepare('SELECT id FROM usuarios ORDER BY id ASC LIMIT 1').get();
      if (firstUser && firstUser.id) {
        defaultUserId = firstUser.id;
      }
    }
  } catch (errUserSeed) {
    console.error('❌ [Seed] Erro ao verificar/criar usuários:', errUserSeed.message);
  }

  // 2. Insere ocorrências de demonstração vinculadas ao usuário
  try {
    const countRow = await db.prepare('SELECT COUNT(*) as count FROM ocorrencias').get();
    const count = Number(countRow && countRow.count ? countRow.count : 0);

    if (count === 0) {
      const today = new Date();
      const currentYear = today.getFullYear();
      const currentMonth = String(today.getMonth() + 1).padStart(2, '0');

      const sampleData = [
        {
          usuario_id: defaultUserId,
          data: `${currentYear}-${currentMonth}-02`,
          setor: 'UTI NEO',
          tipo_problema: 'Impressão',
          problema: 'Impressora de prescrições travada e não imprime etiquetas de medicamentos.',
          diagnostico: 'Papel encravado no fusor térmico e fila de impressão do Windows travada.',
          o_que_foi_feito: 'Desobstrução manual do fusor, limpeza dos roletes tracionadores e reinício do spooler de impressão.',
          status: 'Resolvido',
          prioridade: 'Alta'
        },
        {
          usuario_id: defaultUserId,
          data: `${currentYear}-${currentMonth}-05`,
          setor: 'Pronto Atendimento',
          tipo_problema: 'Acesso/Usuário',
          problema: 'Médico plantonista não consegue autenticar no prontuário eletrônico.',
          diagnostico: 'Conta bloqueada por excesso de tentativas com senha expirada.',
          o_que_foi_feito: 'Desbloqueio de usuário no Active Directory, redefinição de credenciais e teste de login com sucesso.',
          status: 'Resolvido',
          prioridade: 'Urgente'
        },
        {
          usuario_id: defaultUserId,
          data: `${currentYear}-${currentMonth}-08`,
          setor: 'Centro Cirúrgico',
          tipo_problema: 'Rede/Internet',
          problema: 'Ponto de rede do terminal de imagens oscilando sinal durante procedimentos.',
          diagnostico: 'Conector RJ45 oxidado no espelho de parede.',
          o_que_foi_feito: 'Recrimpagem do conector fêmea keystonel cat6, certificação com testador de cabo e estabilização do link.',
          status: 'Resolvido',
          prioridade: 'Alta'
        },
        {
          usuario_id: defaultUserId,
          data: `${currentYear}-${currentMonth}-11`,
          setor: 'Farmácia Central',
          tipo_problema: 'Software',
          problema: 'Erro de comunicação ao validar saída de medicação controlada no sistema hospitalar.',
          diagnostico: 'Instância do WebService de integração desconectada após queda temporária de link.',
          o_que_foi_feito: 'Reinício dos serviços de integração e sincronização das requisições pendentes.',
          status: 'Resolvido',
          prioridade: 'Normal'
        },
        {
          usuario_id: defaultUserId,
          data: `${currentYear}-${currentMonth}-14`,
          setor: 'Recepção / Triagem',
          tipo_problema: 'Hardware',
          problema: 'Computador do guichê 2 não liga após limpeza do setor.',
          diagnostico: 'Cabo de força desencaixado e chave seletora da fonte com mau contato.',
          o_que_foi_feito: 'Substituição do cabo de alimentação, teste de tensão com multímetro e equipamento operacional.',
          status: 'Resolvido',
          prioridade: 'Normal'
        },
        {
          usuario_id: defaultUserId,
          data: `${currentYear}-${currentMonth}-17`,
          setor: 'Almoxarifado',
          tipo_problema: 'Software',
          problema: 'Lentidão severa ao emitir relatórios de conferência de estoque.',
          diagnostico: 'Filtro por período excessivamente amplo executado em concorrência com rotina de backup.',
          o_que_foi_feito: 'Orientação à equipe para segmentação de datas e otimização dos índices de consulta no banco.',
          status: 'Em andamento',
          prioridade: 'Normal'
        },
        {
          usuario_id: defaultUserId,
          data: `${currentYear}-${currentMonth}-19`,
          setor: 'Faturamento',
          tipo_problema: 'Hardware',
          problema: 'Monitor apresentando faixas horizontais e desligando sozinho.',
          diagnostico: 'Capacitores da placa lógica da tela estufados.',
          o_que_foi_feito: 'Equipamento recolhido para bancada, instalado monitor reserva temporário.',
          status: 'Em andamento',
          prioridade: 'Normal'
        },
        {
          usuario_id: defaultUserId,
          data: `${currentYear}-${currentMonth}-21`,
          setor: 'Laboratório de Análises',
          tipo_problema: 'Rede/Internet',
          problema: 'Terminal de interfaceamento do equipamento hematológico sem acesso ao servidor.',
          diagnostico: 'Em diagnóstico de roteamento e tabela ARP.',
          o_que_foi_feito: 'Técnico de plantão alocado no local realizando checagem física da porta do switch.',
          status: 'Aberto',
          prioridade: 'Urgente'
        }
      ];

      const insertStmt = db.prepare(`
        INSERT INTO ocorrencias (usuario_id, data, setor, tipo_problema, problema, diagnostico, o_que_foi_feito, status, prioridade)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const item of sampleData) {
        await insertStmt.run(
          item.usuario_id,
          item.data,
          item.setor,
          item.tipo_problema,
          item.problema,
          item.diagnostico,
          item.o_que_foi_feito,
          item.status,
          item.prioridade
        );
      }

      console.log(`✓ [Seed] Inseridas ${sampleData.length} ocorrências de exemplo vinculadas ao usuário ${defaultUserId}.`);
    }
  } catch (errSeed) {
    console.error('❌ [Seed] Erro ao inserir ocorrências de teste:', errSeed.message);
  }
}

if (require.main === module) {
  runSeed().then(() => {
    console.log('✓ [Seed] Processo concluído com sucesso.');
    process.exit(0);
  }).catch(err => {
    console.error('❌ [Seed] Erro:', err);
    process.exit(1);
  });
}

module.exports = runSeed;
