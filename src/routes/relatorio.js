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
  ImageRun
} = require('docx');
const db = require('../database/db');
const authMiddleware = require('../middleware/auth');

router.use(authMiddleware);

const MONTH_NAMES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'
];

function getReportData(mesParam, anoParam, usuario) {
  const today = new Date();
  const ano = anoParam ? String(anoParam) : String(today.getFullYear());
  const mes = mesParam
    ? String(mesParam).padStart(2, '0')
    : String(today.getMonth() + 1).padStart(2, '0');

  const usuarioId = usuario.id;

  // Busca configurações personalizadas do usuário ou cria padrão
  let config = db.prepare('SELECT * FROM configuracoes_usuario WHERE usuario_id = ?').get(usuarioId);
  if (!config) {
    config = {
      nome_hospital: 'Hospital Regional Nossa Senhora do Bom Conselho',
      setor: 'Tecnologia da Informação',
      nome_responsavel: usuario.nome || '',
      logo_path: 'uploads/logo.png'
    };
  }

  // Indicadores exclusivos do usuário
  const total = db.prepare(`
    SELECT COUNT(*) as count FROM ocorrencias
    WHERE usuario_id = ?
      AND strftime('%Y', data) = ? AND strftime('%m', data) = ?
  `).get(usuarioId, ano, mes).count;

  const resolvidas = db.prepare(`
    SELECT COUNT(*) as count FROM ocorrencias
    WHERE usuario_id = ? AND status = 'Resolvido'
      AND strftime('%Y', data) = ? AND strftime('%m', data) = ?
  `).get(usuarioId, ano, mes).count;

  const emAndamento = db.prepare(`
    SELECT COUNT(*) as count FROM ocorrencias
    WHERE usuario_id = ? AND status = 'Em andamento'
      AND strftime('%Y', data) = ? AND strftime('%m', data) = ?
  `).get(usuarioId, ano, mes).count;

  const abertas = db.prepare(`
    SELECT COUNT(*) as count FROM ocorrencias
    WHERE usuario_id = ? AND status = 'Aberto'
      AND strftime('%Y', data) = ? AND strftime('%m', data) = ?
  `).get(usuarioId, ano, mes).count;

  const altaPrioridade = db.prepare(`
    SELECT COUNT(*) as count FROM ocorrencias
    WHERE usuario_id = ? AND prioridade IN ('Alta', 'Urgente')
      AND strftime('%Y', data) = ? AND strftime('%m', data) = ?
  `).get(usuarioId, ano, mes).count;

  // Lista de ocorrências do usuário ordenada decrescente por data e ID
  const ocorrencias = db.prepare(`
    SELECT * FROM ocorrencias
    WHERE usuario_id = ?
      AND strftime('%Y', data) = ? AND strftime('%m', data) = ?
    ORDER BY data DESC, id DESC
  `).all(usuarioId, ano, mes);

  const mesNum = parseInt(mes, 10);
  const mesExtenso = MONTH_NAMES[mesNum - 1] || mes;
  const periodoLabel = `${mesExtenso} de ${ano}`;
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
router.get('/', (req, res) => {
  try {
    const data = getReportData(req.query.mes, req.query.ano, req.usuario);
    res.json(data);
  } catch (error) {
    res.status(500).json({ erro: 'Erro ao gerar relatório em JSON.', detalhes: error.message });
  }
});

// GET /api/relatorio/docx
router.get('/docx', async (req, res) => {
  try {
    const report = getReportData(req.query.mes, req.query.ano, req.usuario);

    // Registra na auditoria
    db.prepare(`
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
router.get('/pdf', (req, res) => {
  try {
    const report = getReportData(req.query.mes, req.query.ano, req.usuario);

    // Registra auditoria
    db.prepare(`
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
    const report = getReportData(req.query.mes, req.query.ano, req.usuario);

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

module.exports = router;
