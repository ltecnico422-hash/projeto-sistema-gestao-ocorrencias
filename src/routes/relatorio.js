const express = require('express');
const router = express.Router();
const path = require('node:path');
const fs = require('node:fs');
const PDFDocument = require('pdfkit');
const {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  AlignmentType,
  WidthType,
  ImageRun,
  BorderStyle,
  Header,
  Footer,
  PageNumber
} = require('docx');
const db = require('../database/db');
const authMiddleware = require('../middleware/auth');

router.use(authMiddleware);

const MONTH_NAMES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'
];

async function getReportData(mesParam, anoParam, usuario, dataInicioParam, dataFimParam) {
  const today = new Date();
  const usuarioId = usuario.id;

  // Busca configurações personalizadas do usuário ou cria padrão
  let config = await db.prepare('SELECT * FROM configuracoes_usuario WHERE usuario_id = ?').get(usuarioId);
  if (!config) {
    config = {
      nome_hospital: 'Hospital Regional Nossa Senhora do Bom Conselho',
      setor: 'Tecnologia da Informação',
      nome_responsavel: usuario.nome || '',
      logo_path: 'uploads/logo.png'
    };
  }

  let ano, mes, periodoLabel, queryWhere, queryParams;

  if (dataInicioParam && dataFimParam) {
    const dIni = String(dataInicioParam).slice(0, 10);
    const dFim = String(dataFimParam).slice(0, 10);
    queryWhere = `usuario_id = ? AND data >= ? AND data <= ?`;
    queryParams = [usuarioId, dIni, dFim];
    ano = Number(dFim.slice(0, 4));
    mes = Number(dFim.slice(5, 7));
    periodoLabel = `${dIni.split('-').reverse().join('/')} até ${dFim.split('-').reverse().join('/')}`;
  } else {
    ano = anoParam ? String(anoParam) : String(today.getFullYear());
    mes = mesParam
      ? String(mesParam).padStart(2, '0')
      : String(today.getMonth() + 1).padStart(2, '0');
    queryWhere = `usuario_id = ? AND strftime('%Y', data) = ? AND strftime('%m', data) = ?`;
    queryParams = [usuarioId, String(ano), String(mes)];
    const mesNum = parseInt(mes, 10);
    const mesExtenso = MONTH_NAMES[mesNum - 1] || mes;
    periodoLabel = `${mesExtenso} de ${ano}`;
  }

  // Indicadores exclusivos do usuário
  const totalRow = await db.prepare(`SELECT COUNT(*) as count FROM ocorrencias WHERE ${queryWhere}`).get(...queryParams);
  const total = totalRow ? Number(totalRow.count) : 0;

  const resolvidasRow = await db.prepare(`SELECT COUNT(*) as count FROM ocorrencias WHERE ${queryWhere} AND status = 'Resolvido'`).get(...queryParams);
  const resolvidas = resolvidasRow ? Number(resolvidasRow.count) : 0;

  const emAndamentoRow = await db.prepare(`SELECT COUNT(*) as count FROM ocorrencias WHERE ${queryWhere} AND status = 'Em andamento'`).get(...queryParams);
  const emAndamento = emAndamentoRow ? Number(emAndamentoRow.count) : 0;

  const abertasRow = await db.prepare(`SELECT COUNT(*) as count FROM ocorrencias WHERE ${queryWhere} AND status = 'Aberto'`).get(...queryParams);
  const abertas = abertasRow ? Number(abertasRow.count) : 0;

  const altaPrioridadeRow = await db.prepare(`SELECT COUNT(*) as count FROM ocorrencias WHERE ${queryWhere} AND prioridade IN ('Alta', 'Urgente')`).get(...queryParams);
  const altaPrioridade = altaPrioridadeRow ? Number(altaPrioridadeRow.count) : 0;

  // Lista de ocorrências do usuário ordenada decrescente por data e ID
  const ocorrencias = await db.prepare(`
    SELECT * FROM ocorrencias
    WHERE ${queryWhere}
    ORDER BY data DESC, id DESC
  `).all(...queryParams);

  const emissao = today.toLocaleDateString('pt-BR');

  let resumoTexto = '';
  if (total === 0) {
    resumoTexto = 'Não há ocorrências registradas no período para o seu usuário.';
  } else {
    resumoTexto = `No período, foram registradas ${total} ocorrência(s), das quais ${resolvidas} foram resolvidas. A seguir, estão documentadas integralmente as informações lançadas em cada registro, incluindo setor, tipo do problema, descrição, diagnóstico, providências realizadas, status e prioridade.`;
  }

  return {
    ano: Number(ano),
    mes: Number(mes),
    periodoLabel,
    emissao,
    config,
    indicadores: {
      total,
      resolvidas,
      em_andamento: emAndamento,
      abertas,
      alta_prioridade: altaPrioridade
    },
    resumoTexto,
    ocorrencias
  };
}

// GET /api/relatorio
router.get('/', async (req, res) => {
  try {
    const data = await getReportData(req.query.mes, req.query.ano, req.usuario, req.query.data_inicio, req.query.data_fim);
    res.json(data);
  } catch (error) {
    res.status(500).json({ erro: 'Erro ao gerar relatório em JSON.', detalhes: error.message });
  }
});

// GET /api/relatorio/docx
router.get('/docx', async (req, res) => {
  try {
    const report = await getReportData(req.query.mes, req.query.ano, req.usuario);

    // Registra na auditoria
    await db.prepare(`
      INSERT INTO relatorios_gerados (
        usuario_id, periodo_mes, periodo_ano, total_ocorrencias, resolvidas,
        em_andamento, abertas, alta_prioridade, responsavel, formato
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'docx')
    `).run(
      req.usuario.id,
      report.mes,
      report.ano,
      report.indicadores.total,
      report.indicadores.resolvidas,
      report.indicadores.em_andamento,
      report.indicadores.abertas,
      report.indicadores.alta_prioridade,
      report.config.nome_responsavel || req.usuario.nome
    );

    const docChildren = [];

    // Logotipo
    const logoFullPath = path.join(__dirname, '../../', report.config.logo_path || 'uploads/logo.png');
    if (fs.existsSync(logoFullPath)) {
      try {
        const logoData = fs.readFileSync(logoFullPath);
        docChildren.push(
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new ImageRun({
                data: logoData,
                transformation: { width: 140, height: 70 }
              })
            ]
          })
        );
      } catch (err) {
        console.warn('Não foi possível carregar o logo no Word:', err.message);
      }
    }

    // Título Principal
    docChildren.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 180, after: 80 },
        children: [
          new TextRun({
            text: 'RELATÓRIO MENSAL DE OCORRÊNCIAS DE T.I.',
            bold: true,
            size: 28,
            color: '07356F',
            font: 'Arial'
          })
        ]
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 260 },
        children: [
          new TextRun({
            text: report.config.nome_hospital || 'Hospital Regional Nossa Senhora do Bom Conselho',
            size: 22,
            bold: true,
            color: '333333',
            font: 'Arial'
          })
        ]
      })
    );

    // Tabela de Metadados
    const metaTable = new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({
          children: [
            new TableCell({
              children: [
                new Paragraph({
                  children: [
                    new TextRun({ text: 'Período: ', bold: true, font: 'Arial' }),
                    new TextRun({ text: report.periodoLabel, font: 'Arial' })
                  ]
                })
              ]
            }),
            new TableCell({
              children: [
                new Paragraph({
                  children: [
                    new TextRun({ text: 'Responsável: ', bold: true, font: 'Arial' }),
                    new TextRun({ text: report.config.nome_responsavel || req.usuario.nome, font: 'Arial' })
                  ]
                })
              ]
            })
          ]
        }),
        new TableRow({
          children: [
            new TableCell({
              children: [
                new Paragraph({
                  children: [
                    new TextRun({ text: 'Setor: ', bold: true, font: 'Arial' }),
                    new TextRun({ text: report.config.setor || 'Tecnologia da Informação', font: 'Arial' })
                  ]
                })
              ]
            }),
            new TableCell({
              children: [
                new Paragraph({
                  children: [
                    new TextRun({ text: 'Emissão: ', bold: true, font: 'Arial' }),
                    new TextRun({ text: report.emissao, font: 'Arial' })
                  ]
                })
              ]
            })
          ]
        })
      ]
    });

    docChildren.push(metaTable);
    docChildren.push(new Paragraph({ spacing: { after: 200 } }));

    // 1. Resumo Executivo
    docChildren.push(
      new Paragraph({
        spacing: { before: 200, after: 120 },
        children: [
          new TextRun({
            text: '1. RESUMO EXECUTIVO',
            bold: true,
            size: 24,
            color: '07356F',
            font: 'Arial'
          })
        ]
      }),
      new Paragraph({
        spacing: { after: 200 },
        children: [
          new TextRun({
            text: report.resumoTexto,
            font: 'Arial',
            size: 21
          })
        ]
      })
    );

    // Atividades Detalhadas
    const totalOcorrencias = report.ocorrencias.length;
    report.ocorrencias.forEach((oc, idx) => {
      const numAtividade = totalOcorrencias - idx;
      const dataFormatada = oc.data.split('-').reverse().join('/');

      docChildren.push(
        new Paragraph({
          spacing: { before: 140, after: 60 },
          children: [
            new TextRun({
              text: `Atividade ${numAtividade} — ${dataFormatada} | ${oc.setor}`,
              bold: true,
              size: 22,
              color: '16324F',
              font: 'Arial'
            })
          ]
        }),
        new Paragraph({
          spacing: { after: 40 },
          children: [
            new TextRun({ text: 'Tipo do problema: ', bold: true, font: 'Arial', size: 20 }),
            new TextRun({ text: oc.tipo_problema, font: 'Arial', size: 20 })
          ]
        }),
        new Paragraph({
          spacing: { after: 40 },
          children: [
            new TextRun({ text: 'Problema: ', bold: true, font: 'Arial', size: 20 }),
            new TextRun({ text: oc.problema, font: 'Arial', size: 20 })
          ]
        }),
        new Paragraph({
          spacing: { after: 40 },
          children: [
            new TextRun({ text: 'Diagnóstico: ', bold: true, font: 'Arial', size: 20 }),
            new TextRun({ text: oc.diagnostico || 'Não informado', font: 'Arial', size: 20 })
          ]
        }),
        new Paragraph({
          spacing: { after: 40 },
          children: [
            new TextRun({ text: 'O que foi feito: ', bold: true, font: 'Arial', size: 20 }),
            new TextRun({ text: oc.o_que_foi_feito || 'Não informado', font: 'Arial', size: 20 })
          ]
        }),
        new Paragraph({
          spacing: { after: 120 },
          children: [
            new TextRun({ text: 'Status: ', bold: true, font: 'Arial', size: 20 }),
            new TextRun({ text: `${oc.status}    `, font: 'Arial', size: 20 }),
            new TextRun({ text: 'Prioridade: ', bold: true, font: 'Arial', size: 20 }),
            new TextRun({ text: oc.prioridade, font: 'Arial', size: 20 })
          ]
        })
      );
    });

    // 2. Indicadores
    docChildren.push(
      new Paragraph({
        spacing: { before: 240, after: 120 },
        children: [
          new TextRun({
            text: '2. INDICADORES DO PERÍODO',
            bold: true,
            size: 24,
            color: '07356F',
            font: 'Arial'
          })
        ]
      })
    );

    const indTable = new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({
          children: [
            new TableCell({
              children: [new Paragraph({ children: [new TextRun({ text: 'Total de ocorrências', font: 'Arial', bold: true })] })]
            }),
            new TableCell({
              children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: String(report.indicadores.total), font: 'Arial', bold: true })] })]
            })
          ]
        }),
        new TableRow({
          children: [
            new TableCell({
              children: [new Paragraph({ children: [new TextRun({ text: 'Ocorrências resolvidas', font: 'Arial' })] })]
            }),
            new TableCell({
              children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: String(report.indicadores.resolvidas), font: 'Arial' })] })]
            })
          ]
        }),
        new TableRow({
          children: [
            new TableCell({
              children: [new Paragraph({ children: [new TextRun({ text: 'Ocorrências em andamento', font: 'Arial' })] })]
            }),
            new TableCell({
              children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: String(report.indicadores.em_andamento), font: 'Arial' })] })]
            })
          ]
        }),
        new TableRow({
          children: [
            new TableCell({
              children: [new Paragraph({ children: [new TextRun({ text: 'Ocorrências abertas', font: 'Arial' })] })]
            }),
            new TableCell({
              children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: String(report.indicadores.abertas), font: 'Arial' })] })]
            })
          ]
        }),
        new TableRow({
          children: [
            new TableCell({
              children: [new Paragraph({ children: [new TextRun({ text: 'Alta prioridade / urgente', font: 'Arial' })] })]
            }),
            new TableCell({
              children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: String(report.indicadores.alta_prioridade), font: 'Arial' })] })]
            })
          ]
        })
      ]
    });

    docChildren.push(indTable);

    // 3. Observações
    docChildren.push(
      new Paragraph({
        spacing: { before: 240, after: 120 },
        children: [
          new TextRun({
            text: '3. OBSERVAÇÕES',
            bold: true,
            size: 24,
            color: '07356F',
            font: 'Arial'
          })
        ]
      }),
      new Paragraph({
        spacing: { after: 360 },
        children: [
          new TextRun({
            text: 'Este relatório foi gerado automaticamente a partir dos registros do sistema de gestão de ocorrências da Tecnologia da Informação.',
            font: 'Arial',
            size: 20
          })
        ]
      })
    );

    // Bloco de Assinatura
    docChildren.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 400, after: 60 },
        children: [
          new TextRun({
            text: '____________________________________________________',
            font: 'Arial'
          })
        ]
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({
            text: report.config.nome_responsavel || req.usuario.nome,
            bold: true,
            font: 'Arial',
            size: 21
          })
        ]
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({
            text: `${report.config.setor || 'Tecnologia da Informação'} — ${report.config.nome_hospital}`,
            font: 'Arial',
            size: 19,
            color: '666666'
          })
        ]
      })
    );

    const doc = new Document({
      sections: [{
        properties: {
          page: {
            margin: {
              top: 1440,
              right: 1440,
              bottom: 1440,
              left: 1440
            }
          }
        },
        children: docChildren
      }]
    });

    const buffer = await Packer.toBuffer(doc);
    const filename = `relatorio-ti-${report.mes}-${report.ano}.docx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  } catch (error) {
    res.status(500).json({ erro: 'Erro ao gerar documento Word (.docx).', detalhes: error.message });
  }
});

// GET /api/relatorio/pdf
router.get('/pdf', async (req, res) => {
  try {
    const report = await getReportData(req.query.mes, req.query.ano, req.usuario);

    // Registra auditoria
    await db.prepare(`
      INSERT INTO relatorios_gerados (
        usuario_id, periodo_mes, periodo_ano, total_ocorrencias, resolvidas,
        em_andamento, abertas, alta_prioridade, responsavel, formato
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pdf')
    `).run(
      req.usuario.id,
      report.mes,
      report.ano,
      report.indicadores.total,
      report.indicadores.resolvidas,
      report.indicadores.em_andamento,
      report.indicadores.abertas,
      report.indicadores.alta_prioridade,
      report.config.nome_responsavel || req.usuario.nome
    );

    const doc = new PDFDocument({
      size: 'A4',
      margin: 45,
      bufferPages: true
    });

    const filename = `relatorio-ti-${report.mes}-${report.ano}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);

    doc.pipe(res);

    // Logo
    const logoFullPath = path.join(__dirname, '../../', report.config.logo_path || 'uploads/logo.png');
    if (fs.existsSync(logoFullPath)) {
      try {
        doc.image(logoFullPath, { fit: [140, 60], align: 'center' });
        doc.moveDown(0.5);
      } catch (e) {
        console.warn('Erro ao inserir logo no PDF:', e.message);
      }
    }

    // Título Principal
    doc.fillColor('#07356F')
      .fontSize(16)
      .font('Helvetica-Bold')
      .text('RELATÓRIO MENSAL DE OCORRÊNCIAS DE T.I.', { align: 'center' });

    doc.fillColor('#333333')
      .fontSize(11)
      .font('Helvetica')
      .text(report.config.nome_hospital || 'Hospital Regional Nossa Senhora do Bom Conselho', { align: 'center' });

    doc.moveDown(1);

    // Caixa de Metadados
    const metaTop = doc.y;
    doc.rect(45, metaTop, 505, 45).fillAndStroke('#F4F8FB', '#DBE7EF');
    doc.fillColor('#16324F').fontSize(9).font('Helvetica-Bold');
    doc.text(`Período: `, 55, metaTop + 8, { continued: true })
      .font('Helvetica').text(report.periodoLabel);
    doc.font('Helvetica-Bold').text(`Setor: `, 55, metaTop + 24, { continued: true })
      .font('Helvetica').text(report.config.setor || 'Tecnologia da Informação');

    doc.font('Helvetica-Bold').text(`Responsável: `, 300, metaTop + 8, { continued: true })
      .font('Helvetica').text(report.config.nome_responsavel || req.usuario.nome);
    doc.font('Helvetica-Bold').text(`Emissão: `, 300, metaTop + 24, { continued: true })
      .font('Helvetica').text(report.emissao);

    doc.y = metaTop + 55;
    doc.moveDown(0.8);

    // 1. Resumo Executivo
    doc.fillColor('#07356F').fontSize(12).font('Helvetica-Bold').text('1. RESUMO EXECUTIVO');
    doc.moveDown(0.3);
    doc.fillColor('#222222').fontSize(9.5).font('Helvetica').text(report.resumoTexto, { align: 'justify' });
    doc.moveDown(0.8);

    // Atividades Detalhadas
    const totalOcorrencias = report.ocorrencias.length;
    report.ocorrencias.forEach((oc, idx) => {
      const numAtividade = totalOcorrencias - idx;
      const dataFormatada = oc.data.split('-').reverse().join('/');

      if (doc.y > 700) {
        doc.addPage();
      }

      doc.fillColor('#16324F').fontSize(10).font('Helvetica-Bold')
        .text(`Atividade ${numAtividade} — ${dataFormatada} | ${oc.setor}`);
      doc.moveDown(0.2);

      doc.fontSize(8.5).font('Helvetica-Bold').text('Tipo do problema: ', { continued: true })
        .font('Helvetica').text(oc.tipo_problema);
      doc.font('Helvetica-Bold').text('Problema: ', { continued: true })
        .font('Helvetica').text(oc.problema);
      doc.font('Helvetica-Bold').text('Diagnóstico: ', { continued: true })
        .font('Helvetica').text(oc.diagnostico || 'Não informado');
      doc.font('Helvetica-Bold').text('O que foi feito: ', { continued: true })
        .font('Helvetica').text(oc.o_que_foi_feito || 'Não informado');
      doc.font('Helvetica-Bold').text('Status: ', { continued: true })
        .font('Helvetica').text(`${oc.status}    `, { continued: true })
        .font('Helvetica-Bold').text('Prioridade: ', { continued: true })
        .font('Helvetica').text(oc.prioridade);

      doc.moveDown(0.6);
    });

    if (doc.y > 660) {
      doc.addPage();
    }

    // 2. Indicadores
    doc.fillColor('#07356F').fontSize(12).font('Helvetica-Bold').text('2. INDICADORES DO PERÍODO');
    doc.moveDown(0.4);

    const indicadoresList = [
      ['Total de ocorrências', report.indicadores.total],
      ['Ocorrências resolvidas', report.indicadores.resolvidas],
      ['Ocorrências em andamento', report.indicadores.em_andamento],
      ['Ocorrências abertas', report.indicadores.abertas],
      ['Alta prioridade / urgente', report.indicadores.alta_prioridade]
    ];

    indicadoresList.forEach(([label, valor], i) => {
      const yPos = doc.y;
      const bgColor = i % 2 === 0 ? '#F9FBFC' : '#FFFFFF';
      doc.rect(45, yPos, 505, 18).fillAndStroke(bgColor, '#DBE7EF');
      doc.fillColor('#222222').fontSize(9).font(i === 0 ? 'Helvetica-Bold' : 'Helvetica')
        .text(label, 55, yPos + 4);
      doc.text(String(valor), 480, yPos + 4, { align: 'right', width: 60 });
      doc.y = yPos + 18;
    });

    doc.moveDown(1);

    // 3. Observações
    doc.fillColor('#07356F').fontSize(12).font('Helvetica-Bold').text('3. OBSERVAÇÕES');
    doc.moveDown(0.3);
    doc.fillColor('#333333').fontSize(9).font('Helvetica').text(
      'Este relatório foi gerado automaticamente a partir dos registros do sistema de gestão de ocorrências da Tecnologia da Informação do hospital.'
    );

    doc.moveDown(2);

    // Assinatura
    if (doc.y > 720) {
      doc.addPage();
    }
    const sigY = doc.y + 20;
    doc.strokeColor('#999999').lineWidth(0.8)
      .moveTo(170, sigY).lineTo(425, sigY).stroke();

    doc.fillColor('#111111').fontSize(9.5).font('Helvetica-Bold')
      .text(report.config.nome_responsavel || req.usuario.nome, 170, sigY + 5, {
        align: 'center',
        width: 255
      });

    doc.fillColor('#666666').fontSize(8.5).font('Helvetica')
      .text(`${report.config.setor || 'Tecnologia da Informação'} — ${report.config.nome_hospital}`, 170, sigY + 18, {
        align: 'center',
        width: 255
      });

    doc.end();
  } catch (error) {
    res.status(500).json({ erro: 'Erro ao gerar documento PDF.', detalhes: error.message });
  }
});

// GET /api/relatorio/excel - Exportação oficial em formato Excel (.xlsx)
router.get('/excel', async (req, res) => {
  try {
    const ExcelJS = require('exceljs');
    const report = await getReportData(req.query.mes, req.query.ano, req.usuario);

    const workbook = new ExcelJS.Workbook();
    workbook.creator = report.config.nome_responsavel || req.usuario.nome;
    workbook.created = new Date();

    // Aba 1: Ocorrências Detalhadas
    const sheet = workbook.addWorksheet('Ocorrências');
    sheet.columns = [
      { header: 'Atividade', key: 'num', width: 12 },
      { header: 'Data', key: 'data', width: 14 },
      { header: 'Setor', key: 'setor', width: 24 },
      { header: 'Tipo do Problema', key: 'tipo', width: 20 },
      { header: 'Descrição do Problema', key: 'problema', width: 45 },
      { header: 'Diagnóstico da T.I.', key: 'diagnostico', width: 38 },
      { header: 'Providências Realizadas', key: 'feito', width: 38 },
      { header: 'Status', key: 'status', width: 16 },
      { header: 'Prioridade', key: 'prioridade', width: 16 }
    ];

    // Estilo elegante do cabeçalho
    sheet.getRow(1).height = 28;
    sheet.getRow(1).eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF07356F' } // Azul hospitalar
      };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
    });

    const total = report.ocorrencias.length;
    report.ocorrencias.forEach((item, idx) => {
      const row = sheet.addRow({
        num: `Atividade ${total - idx}`,
        data: item.data.split('-').reverse().join('/'),
        setor: item.setor,
        tipo: item.tipo_problema,
        problema: item.problema,
        diagnostico: item.diagnostico || 'Não informado',
        feito: item.o_que_foi_feito || 'Não informado',
        status: item.status,
        prioridade: item.prioridade
      });

      row.height = 22;
      row.alignment = { vertical: 'middle' };

      // Cores alternadas tipo zebra
      if (idx % 2 === 1) {
        row.eachCell((cell) => {
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFF4F8FB' }
          };
        });
      }
    });

    // Aba 2: Resumo e Indicadores do Período
    const sheetInd = workbook.addWorksheet('Resumo e Indicadores');
    sheetInd.columns = [
      { header: 'Item / Indicador', key: 'item', width: 35 },
      { header: 'Informação / Quantidade', key: 'valor', width: 35 }
    ];

    sheetInd.getRow(1).height = 26;
    sheetInd.getRow(1).eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF6EA43A' } };
      cell.alignment = { vertical: 'middle', horizontal: 'left' };
    });

    sheetInd.addRow({ item: 'Hospital', valor: report.config.nome_hospital });
    sheetInd.addRow({ item: 'Setor', valor: report.config.setor });
    sheetInd.addRow({ item: 'Responsável', valor: report.config.nome_responsavel || req.usuario.nome });
    sheetInd.addRow({ item: 'Período', valor: report.periodoLabel });
    sheetInd.addRow({ item: 'Emissão', valor: report.emissao });
    sheetInd.addRow({ item: 'Total de Ocorrências', valor: report.indicadores.total });
    sheetInd.addRow({ item: 'Ocorrências Resolvidas', valor: report.indicadores.resolvidas });
    sheetInd.addRow({ item: 'Ocorrências em Andamento', valor: report.indicadores.em_andamento });
    sheetInd.addRow({ item: 'Ocorrências Abertas', valor: report.indicadores.abertas });
    sheetInd.addRow({ item: 'Alta Prioridade / Urgente', valor: report.indicadores.alta_prioridade });

    const filename = `ocorrencias-ti-${report.mes}-${report.ano}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    res.status(500).json({ erro: 'Erro ao gerar planilha Excel.', detalhes: error.message });
  }
});

// ==========================================================
// ROTAS DE GERENCIAMENTO DE RELATÓRIOS SALVOS (HISTÓRICO)
// ==========================================================

// GET /api/relatorio/salvos - Lista relatórios salvos pelo usuário
router.get('/salvos', async (req, res) => {
  try {
    const usuarioId = req.usuario.id;
    const lista = await db.prepare(`
      SELECT id, usuario_id, tipo, titulo, periodo_inicio, periodo_fim, criado_em, atualizado_em, dados_json
      FROM relatorios_salvos
      WHERE usuario_id = ?
      ORDER BY criado_em DESC
    `).all(usuarioId);

    const formatados = lista.map((item) => {
      let dados = {};
      try {
        dados = JSON.parse(item.dados_json);
      } catch (e) {
        dados = {};
      }
      return {
        id: item.id,
        tipo: item.tipo,
        titulo: item.titulo,
        periodo_inicio: item.periodo_inicio,
        periodo_fim: item.periodo_fim,
        criado_em: item.criado_em,
        atualizado_em: item.atualizado_em,
        dados
      };
    });

    res.json(formatados);
  } catch (error) {
    res.status(500).json({ erro: 'Erro ao listar relatórios salvos.', detalhes: error.message });
  }
});

// POST /api/relatorio/salvos - Salva ou atualiza um relatório
router.post('/salvos', async (req, res) => {
  try {
    const usuarioId = req.usuario.id;
    const { id, tipo = 'produtividade', titulo, periodo_inicio, periodo_fim, dados } = req.body;

    if (!titulo || !dados) {
      return res.status(400).json({ erro: 'Título e dados do relatório são obrigatórios.' });
    }

    const dadosStr = typeof dados === 'string' ? dados : JSON.stringify(dados);

    if (id) {
      const existing = await db.prepare('SELECT id FROM relatorios_salvos WHERE id = ? AND usuario_id = ?').get(id, usuarioId);
      if (!existing) {
        return res.status(404).json({ erro: 'Relatório não encontrado para atualização.' });
      }

      await db.prepare(`
        UPDATE relatorios_salvos
        SET tipo = ?, titulo = ?, periodo_inicio = ?, periodo_fim = ?, dados_json = ?, atualizado_em = datetime('now', 'localtime')
        WHERE id = ? AND usuario_id = ?
      `).run(tipo, titulo, periodo_inicio || null, periodo_fim || null, dadosStr, id, usuarioId);

      const atualizado = await db.prepare('SELECT * FROM relatorios_salvos WHERE id = ?').get(id);
      return res.json({ mensagem: 'Relatório atualizado com sucesso.', id: atualizado.id });
    }

    const insertResult = await db.prepare(`
      INSERT INTO relatorios_salvos (usuario_id, tipo, titulo, periodo_inicio, periodo_fim, dados_json)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(usuarioId, tipo, titulo, periodo_inicio || null, periodo_fim || null, dadosStr);

    res.status(201).json({ mensagem: 'Relatório salvo com sucesso no histórico!', id: insertResult.lastInsertRowid });
  } catch (error) {
    res.status(500).json({ erro: 'Erro ao salvar relatório.', detalhes: error.message });
  }
});

// GET /api/relatorio/salvos/:id - Detalhes de um relatório salvo
router.get('/salvos/:id', async (req, res) => {
  try {
    const usuarioId = req.usuario.id;
    const item = await db.prepare('SELECT * FROM relatorios_salvos WHERE id = ? AND usuario_id = ?').get(req.params.id, usuarioId);

    if (!item) {
      return res.status(404).json({ erro: 'Relatório não encontrado.' });
    }

    let dados = {};
    try {
      dados = JSON.parse(item.dados_json);
    } catch (e) {
      dados = {};
    }

    res.json({
      id: item.id,
      tipo: item.tipo,
      titulo: item.titulo,
      periodo_inicio: item.periodo_inicio,
      periodo_fim: item.periodo_fim,
      criado_em: item.criado_em,
      atualizado_em: item.atualizado_em,
      dados
    });
  } catch (error) {
    res.status(500).json({ erro: 'Erro ao recuperar relatório salvo.', detalhes: error.message });
  }
});

// DELETE /api/relatorio/salvos/:id - Exclui um relatório salvo
router.delete('/salvos/:id', async (req, res) => {
  try {
    const usuarioId = req.usuario.id;
    const item = await db.prepare('SELECT id FROM relatorios_salvos WHERE id = ? AND usuario_id = ?').get(req.params.id, usuarioId);

    if (!item) {
      return res.status(404).json({ erro: 'Relatório não encontrado ou não pertence a você.' });
    }

    await db.prepare('DELETE FROM relatorios_salvos WHERE id = ? AND usuario_id = ?').run(req.params.id, usuarioId);
    res.json({ mensagem: 'Relatório excluído com sucesso do histórico.', id: req.params.id });
  } catch (error) {
    res.status(500).json({ erro: 'Erro ao excluir relatório.', detalhes: error.message });
  }
});

// ==========================================================
// EXPORTAÇÃO DOCX OFICIAL — RELATÓRIO DE PRODUTIVIDADE DE T.I.
// ==========================================================

router.post('/produtividade/docx', async (req, res) => {
  try {
    const data = req.body;
    const usuarioId = req.usuario.id;

    // Busca configuração do usuário para obter o logo oficial
    let config = await db.prepare('SELECT * FROM configuracoes_usuario WHERE usuario_id = ?').get(usuarioId);
    const logoFullPath = path.join(__dirname, '../../', config?.logo_path || 'uploads/logo.png');

    let logoData = null;
    if (fs.existsSync(logoFullPath)) {
      try {
        logoData = fs.readFileSync(logoFullPath);
      } catch (err) {
        console.warn('Não foi possível ler o logo para o documento de produtividade:', err.message);
      }
    }

    const docChildren = [];

    // Cabeçalho institucional (Tabela sem bordas com logo à esquerda e identificação à direita)
    const headerCells = [];
    if (logoData) {
      headerCells.push(
        new TableCell({
          width: { size: 35, type: WidthType.PERCENTAGE },
          borders: {
            top: { style: BorderStyle.NONE },
            bottom: { style: BorderStyle.NONE },
            left: { style: BorderStyle.NONE },
            right: { style: BorderStyle.NONE }
          },
          children: [
            new Paragraph({
              children: [
                new ImageRun({
                  data: logoData,
                  transformation: { width: 130, height: 65 }
                })
              ]
            })
          ]
        })
      );
    }

    headerCells.push(
      new TableCell({
        width: { size: logoData ? 65 : 100, type: WidthType.PERCENTAGE },
        borders: {
          top: { style: BorderStyle.NONE },
          bottom: { style: BorderStyle.NONE },
          left: { style: BorderStyle.NONE },
          right: { style: BorderStyle.NONE }
        },
        children: [
          new Paragraph({
            alignment: AlignmentType.RIGHT,
            children: [
              new TextRun({
                text: 'ASSOCIAÇÃO BENEFICENTE NOSSA SENHORA DO BOM CONSELHO',
                bold: true,
                font: 'Arial',
                size: 21,
                color: '000000'
              })
            ]
          }),
          new Paragraph({
            alignment: AlignmentType.RIGHT,
            spacing: { before: 40 },
            children: [
              new TextRun({
                text: 'Entidade Mantenedora do Hospital Regional de Arapiraca',
                font: 'Arial',
                size: 19,
                color: '000000'
              })
            ]
          })
        ]
      })
    );

    docChildren.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          new TableRow({
            children: headerCells
          })
        ]
      }),
      new Paragraph({ spacing: { after: 200 } })
    );

    // Título centralizado em negrito
    docChildren.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 100, after: 240 },
        keepWithNext: true,
        children: [
          new TextRun({
            text: 'RELATÓRIO DE PRODUTIVIDADE - TECNOLOGIA DA INFORMAÇÃO',
            bold: true,
            font: 'Arial',
            size: 23,
            color: '000000'
          })
        ]
      })
    );

    const makeSectionTitle = (title) =>
      new Paragraph({
        spacing: { before: 180, after: 60 },
        keepWithNext: true,
        children: [
          new TextRun({
            text: title,
            bold: true,
            font: 'Arial',
            size: 22,
            color: '000000'
          })
        ]
      });

    const makeSubSectionTitle = (title) =>
      new Paragraph({
        spacing: { before: 120, after: 40 },
        keepWithNext: true,
        children: [
          new TextRun({
            text: title,
            bold: true,
            font: 'Arial',
            size: 21,
            color: '000000'
          })
        ]
      });

    const makeParagraph = (text, isItalic = false) =>
      new Paragraph({
        spacing: { after: 80 },
        children: [
          new TextRun({
            text: text || 'Sem ocorrências no período.',
            font: 'Arial',
            size: 22,
            italics: isItalic,
            color: '000000'
          })
        ]
      });

    const makeBullet = (text) =>
      new Paragraph({
        bullet: { level: 0 },
        spacing: { after: 40 },
        children: [
          new TextRun({
            text: text || 'Sem ocorrências no período.',
            font: 'Arial',
            size: 22,
            color: '000000'
          })
        ]
      });

    // 1. Identificação
    docChildren.push(makeSectionTitle('1. Identificação'));
    const idObj = data.identificacao || {};
    docChildren.push(
      makeBullet(`Período Avaliado: ${idObj.periodo || '-'}`),
      makeBullet(`Unidade/Setor: ${idObj.unidade_setor || 'Núcleo de Tecnologia da Informação'}`),
      makeBullet(`Responsável: ${idObj.responsavel || '-'}`),
      makeBullet(`Data de Emissão: ${idObj.data_emissao || '-'}`)
    );

    // 2. Objetivo
    docChildren.push(makeSectionTitle('2. Objetivo'));
    docChildren.push(makeParagraph(data.objetivo));

    // 3. Atividades Desenvolvidas
    docChildren.push(makeSectionTitle('3. Atividades Desenvolvidas'));
    if (Array.isArray(data.atividades) && data.atividades.length > 0) {
      data.atividades.forEach((item) => docChildren.push(makeBullet(item)));
    } else {
      docChildren.push(makeParagraph('Sem ocorrências no período.'));
    }

    // 3.1 Manutenção Preventiva
    docChildren.push(makeSubSectionTitle('3.1 Manutenção Preventiva'));
    if (Array.isArray(data.manutencao_preventiva) && data.manutencao_preventiva.length > 0) {
      data.manutencao_preventiva.forEach((item) => docChildren.push(makeBullet(item)));
    } else if (data.manutencao_preventiva_texto) {
      docChildren.push(makeParagraph(data.manutencao_preventiva_texto));
    } else {
      docChildren.push(makeParagraph('Sem ocorrências no período.'));
    }

    // 3.2 Suporte ao Usuário
    docChildren.push(makeSubSectionTitle('3.2 Suporte ao Usuário'));
    const sup = data.suporte_usuario || {};
    docChildren.push(
      makeBullet(`Quantidade de chamados atendidos: ${sup.total ?? 0}`),
      makeBullet(`Atendimentos remotos: ${sup.remotos ?? 0} e Atendimentos presenciais: ${sup.presenciais ?? 0}${sup.comparacao ? ` — ${sup.comparacao}` : ''}`)
    );
    docChildren.push(
      new Paragraph({
        spacing: { before: 80, after: 40 },
        keepWithNext: true,
        children: [
          new TextRun({ text: 'Principais demandas solucionadas:', bold: true, font: 'Arial', size: 21 })
        ]
      })
    );
    if (Array.isArray(sup.demandas) && sup.demandas.length > 0) {
      sup.demandas.forEach((d) => docChildren.push(makeBullet(typeof d === 'string' ? d : `${d.categoria}: ${d.quantidade} chamados`)));
    } else {
      docChildren.push(makeParagraph('Sem ocorrências no período.'));
    }

    // 3.3 Implantação e Manutenção de Infraestrutura de Rede
    docChildren.push(makeSubSectionTitle('3.3 Implantação e Manutenção de Infraestrutura de Rede'));
    const infra = data.infraestrutura || {};

    docChildren.push(
      new Paragraph({
        spacing: { before: 60, after: 40 },
        keepWithNext: true,
        children: [
          new TextRun({ text: 'Organização de cabeamento estruturado:', bold: true, font: 'Arial', size: 21 })
        ]
      })
    );

    // Tabela com uma coluna "Setor" e bordas simples pretas
    const setores = Array.isArray(infra.setores_cabeamento) && infra.setores_cabeamento.length > 0
      ? infra.setores_cabeamento
      : ['Sem ocorrências no período.'];

    const tableRows = [
      new TableRow({
        children: [
          new TableCell({
            width: { size: 100, type: WidthType.PERCENTAGE },
            borders: {
              top: { style: BorderStyle.SINGLE, size: 4, color: '000000' },
              bottom: { style: BorderStyle.SINGLE, size: 4, color: '000000' },
              left: { style: BorderStyle.SINGLE, size: 4, color: '000000' },
              right: { style: BorderStyle.SINGLE, size: 4, color: '000000' }
            },
            children: [
              new Paragraph({
                children: [
                  new TextRun({ text: 'Setor', bold: true, font: 'Arial', size: 21, color: '000000' })
                ]
              })
            ]
          })
        ]
      })
    ];

    setores.forEach((setor) => {
      tableRows.push(
        new TableRow({
          children: [
            new TableCell({
              width: { size: 100, type: WidthType.PERCENTAGE },
              borders: {
                top: { style: BorderStyle.SINGLE, size: 4, color: '000000' },
                bottom: { style: BorderStyle.SINGLE, size: 4, color: '000000' },
                left: { style: BorderStyle.SINGLE, size: 4, color: '000000' },
                right: { style: BorderStyle.SINGLE, size: 4, color: '000000' }
              },
              children: [
                new Paragraph({
                  children: [
                    new TextRun({ text: setor, font: 'Arial', size: 21, color: '000000' })
                  ]
                })
              ]
            })
          ]
        })
      );
    });

    docChildren.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: tableRows
      }),
      new Paragraph({ spacing: { after: 80 } }),
      makeBullet(`Expansão ou adequação da infraestrutura: ${infra.expansao_adequacao || 'Sem ocorrências no período.'}`),
      makeBullet(`Equipamentos entregues: ${infra.equipamentos_entregues ?? 0}`),
      makeBullet(`Equipamentos remanejados: ${infra.equipamentos_remanejados || 'Sem equipamentos remanejados'}`),
      makeBullet(`Equipamentos recolhidos: ${Array.isArray(infra.equipamentos_recolhidos) ? infra.equipamentos_recolhidos.join(', ') : (infra.equipamentos_recolhidos || 'Sem equipamentos recolhidos')}`),
      makeBullet(`Atualização de inventário patrimonial: ${infra.inventario || 'Em progresso'}`)
    );

    // 3.5 Demandas Adicionais
    docChildren.push(
      makeSubSectionTitle('3.5 Demandas Adicionais'),
      new Paragraph({
        spacing: { after: 60 },
        children: [
          new TextRun({ text: '(Descrever atividades extraordinárias ou não previstas inicialmente.)', italics: true, font: 'Arial', size: 20, color: '000000' })
        ]
      })
    );
    if (Array.isArray(data.demandas_adicionais) && data.demandas_adicionais.length > 0) {
      data.demandas_adicionais.forEach((item) => {
        docChildren.push(
          new Paragraph({
            border: {
              bottom: { style: BorderStyle.SINGLE, size: 4, color: '888888', space: 6 }
            },
            spacing: { before: 80, after: 80 },
            children: [
              new TextRun({ text: `•  ${item}`, font: 'Arial', size: 21, bold: true, color: '000000' })
            ]
          })
        );
      });
    } else {
      docChildren.push(makeParagraph('Sem ocorrências extraordinárias no período.'));
    }

    // 4. Indicadores de Produtividade
    docChildren.push(makeSectionTitle('4. Indicadores de Produtividade'));
    const ind = data.indicadores || {};
    
    const makeIndicadorWithArrow = (titulo, valor) => [
      new Paragraph({
        spacing: { before: 80, after: 20 },
        children: [
          new TextRun({ text: `•  ${titulo}`, font: 'Arial', size: 21, bold: true, color: '000000' })
        ]
      }),
      new Paragraph({
        indent: { left: 420 },
        spacing: { after: 60 },
        children: [
          new TextRun({ text: `➔  ${valor}`, font: 'Arial', size: 21, bold: true, color: '000000' })
        ]
      })
    ];

    docChildren.push(
      ...makeIndicadorWithArrow('Total de manutenções preventivas realizadas:', ind.manutencoes_preventivas || 'Mais de 130 estações de trabalho'),
      ...makeIndicadorWithArrow('Total de atendimentos aos usuários:', ind.atendimentos_usuarios || 'Entre 50 a 70 atendimentos no mês'),
      ...makeIndicadorWithArrow('Total de intervenções em infraestrutura de rede:', ind.intervencoes_rede || 'No mês de maio por volta de 6 a 9 modificações / 5 a 9 correções'),
      ...makeIndicadorWithArrow('Total de equipamentos alocados/remanejados:', ind.equipamentos_alocados || 'Total de 6 equipamentos alocados'),
      ...makeIndicadorWithArrow('Total de outras demandas executadas:', ind.outras_demandas || 'Por volta de 8 ou menos fora do seguimento de T.I, como: Consultorias de preço e consertos, Instalações e conserto fora do segmento de T.I.)')
    );

    // 5. Resultados Obtidos
    docChildren.push(makeSectionTitle('5. Resultados Obtidos'));
    docChildren.push(makeParagraph(data.resultados_obtidos));

    // 6. Dificuldades Encontradas
    docChildren.push(makeSectionTitle('6. Dificuldades Encontradas'));
    docChildren.push(makeParagraph(data.dificuldades));

    // 7. Atendimentos no período de sobreaviso nos finais de semana
    docChildren.push(makeSectionTitle('7. Atendimentos no período de sobreaviso nos finais de semana'));
    docChildren.push(
      new Paragraph({
        spacing: { after: 40 },
        keepWithNext: true,
        children: [
          new TextRun({ text: 'Principais ocorrências:', bold: true, font: 'Arial', size: 21 })
        ]
      })
    );
    if (Array.isArray(data.sobreaviso) && data.sobreaviso.length > 0) {
      data.sobreaviso.forEach((item) => docChildren.push(makeBullet(item)));
    } else {
      docChildren.push(makeParagraph('Sem ocorrências no período.'));
    }

    // Assinatura (fim do documento)
    docChildren.push(
      new Paragraph({
        spacing: { before: 360, after: 60 },
        keepWithNext: true,
        children: [
          new TextRun({ text: 'Responsável pelo Relatório:', bold: true, font: 'Arial', size: 22 })
        ]
      }),
      new Paragraph({
        spacing: { after: 40 },
        children: [
          new TextRun({ text: `Nome: ${idObj.responsavel || '-'}`, font: 'Arial', size: 22 })
        ]
      }),
      new Paragraph({
        spacing: { after: 120 },
        children: [
          new TextRun({ text: `Cargo: ${idObj.cargo || 'Técnico de Tecnologia da Informação'}`, font: 'Arial', size: 22 })
        ]
      }),
      new Paragraph({
        spacing: { after: 60 },
        children: [
          new TextRun({ text: 'Assinatura: ____________________________________________________', font: 'Arial', size: 22 })
        ]
      }),
      new Paragraph({
        spacing: { after: 100 },
        children: [
          new TextRun({ text: `Data: ${idObj.data_emissao || '-'}`, font: 'Arial', size: 22 })
        ]
      })
    );

    // Constrói o documento com margens de 2cm e rodapé oficial em todas as páginas
    const doc = new Document({
      sections: [
        {
          properties: {
            page: {
              margin: {
                top: 1134, // ~20mm (2cm)
                right: 1134,
                bottom: 1134,
                left: 1134
              }
            }
          },
          footers: {
            default: new Footer({
              children: [
                new Paragraph({
                  border: {
                    top: { style: BorderStyle.SINGLE, size: 6, color: '000000', space: 4 }
                  },
                  spacing: { before: 80, after: 30 },
                  alignment: AlignmentType.CENTER,
                  children: [
                    new TextRun({
                      text: 'Rua São Francisco, 154, Centro, Arapiraca – Alagoas',
                      font: 'Arial',
                      size: 18,
                      color: '000000'
                    })
                  ]
                }),
                new Paragraph({
                  spacing: { after: 30 },
                  alignment: AlignmentType.CENTER,
                  children: [
                    new TextRun({
                      text: 'CEP: 57300 – 080, Fone: (82) 4004 1010   |   CNPJ: 24.177.305/0001-31',
                      font: 'Arial',
                      size: 18,
                      color: '000000'
                    })
                  ]
                }),
                new Paragraph({
                  alignment: AlignmentType.RIGHT,
                  children: [
                    new TextRun({ text: 'Página ', font: 'Arial', size: 18, color: '000000' }),
                    new TextRun({ children: [PageNumber.CURRENT], font: 'Arial', size: 18, color: '000000' }),
                    new TextRun({ text: ' de ', font: 'Arial', size: 18, color: '000000' }),
                    new TextRun({ children: [PageNumber.TOTAL_PAGES], font: 'Arial', size: 18, color: '000000' })
                  ]
                })
              ]
            })
          },
          children: docChildren
        }
      ]
    });

    const buffer = await Packer.toBuffer(doc);
    const filename = `relatorio-produtividade-ti-${new Date().toISOString().slice(0, 10)}.docx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  } catch (error) {
    console.error('Erro ao gerar DOCX de produtividade:', error);
    res.status(500).json({ erro: 'Erro ao gerar documento Word oficial.', detalhes: error.message });
  }
});

module.exports = router;

