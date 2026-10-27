const ExcelJS = require('exceljs');

/**
 * Converte qualquer valor de célula do ExcelJS em string limpa
 */
function getCellValue(cell) {
  if (!cell || cell.value === null || cell.value === undefined) return '';
  if (typeof cell.value === 'object') {
    // Casos especiais do ExcelJS (fórmulas, rich text, datas)
    if (cell.value instanceof Date) {
      return cell.value;
    }
    if (cell.value.result !== undefined) {
      return String(cell.value.result).trim();
    }
    if (cell.value.text !== undefined) {
      return String(cell.value.text).trim();
    }
    if (Array.isArray(cell.value.richText)) {
      return cell.value.richText.map(r => r.text).join('').trim();
    }
    return String(cell.text || '').trim();
  }
  return String(cell.value).trim();
}

/**
 * Normaliza e extrai data no formato YYYY-MM-DD
 */
function parseDate(raw) {
  if (!raw) return new Date().toISOString().slice(0, 10);

  if (raw instanceof Date && !isNaN(raw.getTime())) {
    return raw.toISOString().slice(0, 10);
  }

  const str = String(raw).trim();

  // Se for número serial do Excel (ex.: 45200)
  if (/^\d{5}$/.test(str)) {
    const num = Number(str);
    const dateObj = new Date(Math.round((num - 25569) * 86400 * 1000));
    if (!isNaN(dateObj.getTime())) {
      return dateObj.toISOString().slice(0, 10);
    }
  }

  // Padrão DD/MM/AAAA ou DD-MM-AAAA
  const brMatch = str.match(/^(\d{1,2})[\/\.-](\d{1,2})[\/\.-](\d{2,4})/);
  if (brMatch) {
    const dia = brMatch[1].padStart(2, '0');
    const mes = brMatch[2].padStart(2, '0');
    let ano = brMatch[3];
    if (ano.length === 2) ano = '20' + ano;
    return `${ano}-${mes}-${dia}`;
  }

  // Padrão AAAA-MM-DD
  const isoMatch = str.match(/^(\d{4})[\/\.-](\d{1,2})[\/\.-](\d{1,2})/);
  if (isoMatch) {
    const ano = isoMatch[1];
    const mes = isoMatch[2].padStart(2, '0');
    const dia = isoMatch[3].padStart(2, '0');
    return `${ano}-${mes}-${dia}`;
  }

  // Tenta parse genérico
  const parsed = new Date(str);
  if (!isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }

  return new Date().toISOString().slice(0, 10);
}

/**
 * Classificação inteligente do Tipo de Problema baseada em palavras-chave
 */
function detectTipoProblema(tipoRaw, problemaText = '', diagnosticoText = '') {
  const combined = `${tipoRaw || ''} ${problemaText || ''} ${diagnosticoText || ''}`.toLowerCase();

  // 1. Impressão
  if (/(impressor|impress[aã]o|toner|papel|etiquet|bobina|zebra|brother|epson|spooler|atolamento|imprimir)/i.test(combined)) {
    return 'Impressão';
  }

  // 2. Rede / Internet
  if (/(rede|internet|wi-?fi|cabo|rj45|switch|roteador|link|fibra|proxy|sem conex[aã]o|desconectad|dns|ip|oscilando)/i.test(combined)) {
    return 'Rede/Internet';
  }

  // 3. Acesso / Usuário
  if (/(acesso|senha|login|usu[aá]rio|bloquead|redefinir|trocar senha|active directory|\bAD\b|permiss[aã]o|autentica)/i.test(combined)) {
    return 'Acesso/Usuário';
  }

  // 4. Hardware
  if (/(hardware|mouse|teclado|computador|pc|desktop|cpu|monitor|tela|fonte|cabo de for[cç]a|placa|mem[oó]ria|ram|hd|ssd|nobreak|no-break|estabilizador|queimad|n[aã]o liga|desligando)/i.test(combined)) {
    return 'Hardware';
  }

  // 5. Software
  if (/(software|sistema|app|programa|windows|office|excel|word|outlook|e-?mail|erro no sistema|travand|tasy|mv|totvs|prontu[aá]rio|antiv[ií]rus|navegador|chrome)/i.test(combined)) {
    return 'Software';
  }

  return 'Outro';
}

/**
 * Normaliza Status de acordo com os princípios do sistema
 */
function normalizeStatus(raw) {
  if (!raw) return 'Aberto';
  const str = String(raw).toLowerCase().trim();

  if (/(resolv|conclu|fechad|finaliz|encerr|atendid|ok|solucionad|pronto)/i.test(str)) {
    return 'Resolvido';
  }

  if (/(andamento|atend|aguard|analis|an[aá]lise|execu|pendent|espera)/i.test(str)) {
    return 'Em andamento';
  }

  return 'Aberto';
}

/**
 * Normaliza Prioridade
 */
function normalizePrioridade(raw, problemaText = '') {
  const str = `${raw || ''} ${problemaText || ''}`.toLowerCase().trim();

  if (/(urgent|cr[ií]tic|grav[ií]ssim|imediat|emerg[eê]ncia|\bp1\b|parou tudo)/i.test(str)) {
    return 'Urgente';
  }

  if (/(alta|alto|importante|\bp2\b)/i.test(str)) {
    return 'Alta';
  }

  return 'Normal';
}

/**
 * Normaliza flag de Sobreaviso
 */
function normalizeSobreaviso(raw, texto = '') {
  const combined = `${raw || ''} ${texto || ''}`.toLowerCase().trim();
  return /(sim|\bs\b|true|1|sobreaviso|sobre-aviso|plant[aã]o|fds|final de semana|fim de semana|noturno)/i.test(combined) ? 1 : 0;
}

function classifyHeader(raw) {
  const norm = String(raw || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');

  if (!norm) return null;

  // 1. Motivo de Bloqueio (testar antes de problema/motivo geral)
  if (norm.includes('bloqueio') || norm.includes('impedimento') || norm.includes('justificativa')) {
    return 'motivo_bloqueio';
  }

  // 2. Sobreaviso / Plantão
  if (norm.includes('sobreaviso') || norm.includes('plantao') || norm.includes('fds')) {
    return 'em_sobreaviso';
  }

  // 3. Tipo / Categoria de problema (testar antes de problema genérico)
  if (norm.includes('tipo') || norm.includes('categoria') || norm.includes('classificacao') || norm.includes('assunto')) {
    return 'tipo_problema';
  }

  // 4. O que foi feito / Solução / Ação
  if (norm.includes('feito') || norm.includes('solucao') || norm.includes('resolucao') || norm.includes('providencia') || norm.includes('acao') || norm.includes('atendimento')) {
    return 'o_que_foi_feito';
  }

  // 5. Diagnóstico / Parecer técnico
  if (norm.includes('diagnostico') || norm.includes('motivo raiz') || norm.includes('constatacao') || norm.includes('parecer') || norm.includes('analise')) {
    return 'diagnostico';
  }

  // 6. Data do chamado
  if (norm.includes('data') || norm.includes('dia') || norm.includes('date') || norm.includes('abertura')) {
    return 'data';
  }

  // 7. Setor / Departamento
  if (norm.includes('setor') || norm.includes('departamento') || norm.includes('area') || norm.includes('unidade') || norm.includes('local') || norm.includes('solicitante')) {
    return 'setor';
  }

  // 8. Status / Situação
  if (norm.includes('status') || norm.includes('situacao') || norm.includes('estado') || norm.includes('fase')) {
    return 'status';
  }

  // 9. Prioridade / Urgência
  if (norm.includes('prioridade') || norm.includes('urgencia') || norm.includes('criticidade') || norm.includes('gravidade')) {
    return 'prioridade';
  }

  // 10. Problema / Descrição / Chamado
  if (norm.includes('problema') || norm.includes('descricao') || norm.includes('relato') || norm.includes('motivo') || norm.includes('chamado') || norm.includes('ocorrencia') || norm.includes('solicitacao') || norm.includes('detalhe') || norm.includes('titulo')) {
    return 'problema';
  }

  return null;
}

/**
 * Lê e processa um buffer Excel (.xlsx) e transforma em ocorrências prontas
 */
async function parseExcelBuffer(buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  // Pega a primeira planilha com dados
  let worksheet = null;
  workbook.eachSheet((sheet) => {
    if (!worksheet && sheet.rowCount > 0) {
      worksheet = sheet;
    }
  });

  if (!worksheet) {
    throw new Error('Nenhuma planilha com dados foi encontrada no arquivo.');
  }

  // 1. Identificar a linha do cabeçalho
  let headerRowIndex = 1;
  let headerMap = {};
  let foundHeader = false;

  // Varre as primeiras 15 linhas para achar onde começa o cabeçalho
  for (let r = 1; r <= Math.min(15, worksheet.rowCount); r++) {
    const row = worksheet.getRow(r);
    const tempMap = {};
    let matchedCount = 0;

    row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      const field = classifyHeader(cell.value);
      if (field && !tempMap[field]) {
        tempMap[field] = colNumber;
        matchedCount++;
      }
    });

    if (matchedCount >= 2) {
      headerRowIndex = r;
      headerMap = tempMap;
      foundHeader = true;
      break;
    }
  }

  // Fallback caso cabeçalho não seja reconhecido: mapeamento sequencial padrão
  if (!foundHeader) {
    headerRowIndex = 1;
    headerMap = {
      data: 1,
      setor: 2,
      tipo_problema: 3,
      problema: 4,
      diagnostico: 5,
      o_que_foi_feito: 6,
      status: 7,
      prioridade: 8,
      em_sobreaviso: 9,
      motivo_bloqueio: 10
    };
  }

  const ocorrencias = [];
  const erros = [];

  for (let r = headerRowIndex + 1; r <= worksheet.rowCount; r++) {
    const row = worksheet.getRow(r);

    // Se a linha for totalmente vazia, pula
    let rowHasData = false;
    row.eachCell(() => { rowHasData = true; });
    if (!rowHasData) continue;

    const rawData = headerMap.data ? getCellValue(row.getCell(headerMap.data)) : '';
    const rawSetor = headerMap.setor ? getCellValue(row.getCell(headerMap.setor)) : '';
    const rawTipo = headerMap.tipo_problema ? getCellValue(row.getCell(headerMap.tipo_problema)) : '';
    const rawProblema = headerMap.problema ? getCellValue(row.getCell(headerMap.problema)) : '';
    const rawDiagnostico = headerMap.diagnostico ? getCellValue(row.getCell(headerMap.diagnostico)) : '';
    const rawAcao = headerMap.o_que_foi_feito ? getCellValue(row.getCell(headerMap.o_que_foi_feito)) : '';
    const rawStatus = headerMap.status ? getCellValue(row.getCell(headerMap.status)) : '';
    const rawPrioridade = headerMap.prioridade ? getCellValue(row.getCell(headerMap.prioridade)) : '';
    const rawSobreaviso = headerMap.em_sobreaviso ? getCellValue(row.getCell(headerMap.em_sobreaviso)) : '';
    const rawBloqueio = headerMap.motivo_bloqueio ? getCellValue(row.getCell(headerMap.motivo_bloqueio)) : '';

    // Se não tiver setor e não tiver problema, ignora
    if (!rawProblema && !rawSetor) {
      continue;
    }

    const problemaFinal = rawProblema || rawDiagnostico || 'Atendimento técnico registrado via importação Excel';
    const setorFinal = rawSetor || 'Geral / Não informado';
    const tipoFinal = detectTipoProblema(rawTipo, problemaFinal, rawDiagnostico);
    const statusFinal = normalizeStatus(rawStatus);
    const prioridadeFinal = normalizePrioridade(rawPrioridade, problemaFinal);
    const dataFinal = parseDate(rawData);
    const sobreavisoFinal = normalizeSobreaviso(rawSobreaviso, problemaFinal);

    let acaoFinal = rawAcao ? String(rawAcao).trim() : '';
    if (!acaoFinal && statusFinal === 'Resolvido') {
      acaoFinal = 'Atendimento técnico concluído com sucesso.';
    }

    ocorrencias.push({
      linhaOriginal: r,
      data: dataFinal,
      setor: setorFinal.trim(),
      tipo_problema: tipoFinal,
      problema: problemaFinal.trim(),
      diagnostico: rawDiagnostico ? String(rawDiagnostico).trim() : '',
      o_que_foi_feito: acaoFinal,
      status: statusFinal,
      prioridade: prioridadeFinal,
      em_sobreaviso: sobreavisoFinal,
      motivo_bloqueio: rawBloqueio ? String(rawBloqueio).trim() : null
    });
  }

  return {
    totalLinhasLidas: worksheet.rowCount - headerRowIndex,
    ocorrenciasValidas: ocorrencias,
    erros
  };
}

/**
 * Gera uma Planilha Modelo (.xlsx) oficial pronta para preenchimento
 */
async function generateTemplateWorkbook() {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Sistema de Gestão de Ocorrências TI';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('Ocorrências TI');

  sheet.columns = [
    { header: 'Data', key: 'data', width: 14 },
    { header: 'Setor', key: 'setor', width: 22 },
    { header: 'Tipo de Problema', key: 'tipo_problema', width: 20 },
    { header: 'Problema / Descrição', key: 'problema', width: 38 },
    { header: 'Diagnóstico', key: 'diagnostico', width: 30 },
    { header: 'O que foi feito', key: 'o_que_foi_feito', width: 34 },
    { header: 'Status', key: 'status', width: 16 },
    { header: 'Prioridade', key: 'prioridade', width: 14 },
    { header: 'Sobreaviso? (Sim/Não)', key: 'em_sobreaviso', width: 22 },
    { header: 'Motivo de Bloqueio', key: 'motivo_bloqueio', width: 26 }
  ];

  // Estilização do Cabeçalho
  const headerRow = sheet.getRow(1);
  headerRow.height = 30;
  headerRow.eachCell((cell) => {
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF0070F3' }
    };
    cell.font = {
      name: 'Arial',
      size: 11,
      bold: true,
      color: { argb: 'FFFFFFFF' }
    };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
  });

  // Linhas de exemplo
  const sampleData = [
    {
      data: '27/10/2026',
      setor: 'Pronto Atendimento',
      tipo_problema: 'Acesso/Usuário',
      problema: 'Médico não consegue autenticar no prontuário eletrônico',
      diagnostico: 'Conta bloqueada por tentativas sucessivas',
      o_que_foi_feito: 'Desbloqueio de usuário no Active Directory e redefinição de senha',
      status: 'Resolvido',
      prioridade: 'Urgente',
      em_sobreaviso: 'Sim',
      motivo_bloqueio: ''
    },
    {
      data: '26/10/2026',
      setor: 'UTI Geral',
      tipo_problema: 'Impressão',
      problema: 'Impressora de prescrição travada com atolamento de papel',
      diagnostico: 'Sensor térmico obstruído com fragmento de etiqueta',
      o_que_foi_feito: 'Limpeza interna do fusor e reinício da fila de impressão',
      status: 'Resolvido',
      prioridade: 'Alta',
      em_sobreaviso: 'Não',
      motivo_bloqueio: ''
    },
    {
      data: '25/10/2026',
      setor: 'Farmácia Central',
      tipo_problema: 'Rede/Internet',
      problema: 'Terminal de dispensa sem acesso à rede hospitalar',
      diagnostico: 'Conector RJ45 quebrado no ponto de parede',
      o_que_foi_feito: 'Crimpagem de novo conector e certificação de sinal',
      status: 'Resolvido',
      prioridade: 'Alta',
      em_sobreaviso: 'Não',
      motivo_bloqueio: ''
    },
    {
      data: '24/10/2026',
      setor: 'Faturamento',
      tipo_problema: 'Hardware',
      problema: 'Monitor piscando e desligando sozinho após tempo de uso',
      diagnostico: 'Placa inversora com defeito elétrico',
      o_que_foi_feito: 'Substituição provisória por monitor reserva',
      status: 'Em andamento',
      prioridade: 'Normal',
      em_sobreaviso: 'Não',
      motivo_bloqueio: 'Aguardando entrega de tela pela garantia'
    }
  ];

  sampleData.forEach((item) => {
    sheet.addRow(item);
  });

  // Estilização das linhas de exemplo
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber > 1) {
      row.alignment = { vertical: 'middle', horizontal: 'left' };
      row.font = { name: 'Arial', size: 10 };
      if (rowNumber % 2 === 0) {
        row.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFF8FAFC' }
        };
      }
    }
  });

  return workbook.xlsx.writeBuffer();
}

module.exports = {
  parseExcelBuffer,
  generateTemplateWorkbook
};
