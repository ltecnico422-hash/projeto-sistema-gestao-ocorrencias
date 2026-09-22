/**
 * TI Hospital Regional — Sistema de Gestão e Relatório de Ocorrências
 * Frontend SPA com Autenticação e Isolamento por Usuário
 */

const MONTHS = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

// Estado global da aplicação
let authToken = localStorage.getItem('ti_auth_token') || null;
let currentUser = null;
let currentView = 'dashboard';
let systemConfig = {};
const now = new Date();
let selectedMonth = now.getMonth() + 1;
let selectedYear = now.getFullYear();
let itemToDeleteId = null;

// Atalho para elementos
const $ = (id) => document.getElementById(id);

// Utilitário de requisições com autenticação JWT
async function api(url, options = {}) {
  const headers = options.headers ? { ...options.headers } : {};

  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }

  try {
    const res = await fetch(url, { ...options, headers });

    if (res.status === 401) {
      const errData = await res.json().catch(() => ({}));
      logout(errData.erro || 'Sessão expirada. Por favor, faça login novamente.');
      throw new Error(errData.erro || 'Não autorizado.');
    }

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.erro || `Erro HTTP ${res.status}`);
    }

    return await res.json();
  } catch (error) {
    if (authToken) {
      showToast(error.message, 'error');
    }
    throw error;
  }
}

// Sistema de Toasts
function showToast(msg, type = 'success') {
  const container = $('toastContainer');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span>${type === 'success' ? '✓' : '⚠'}</span> <span>${escapeHtml(msg)}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// Sanitização de HTML
function escapeHtml(text) {
  if (text === null || text === undefined) return '';
  return String(text).replace(/[&<>'"]/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  }[c]));
}

function formatDate(isoStr) {
  if (!isoStr) return '-';
  const parts = isoStr.split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return isoStr;
}

function clsStatus(status) {
  if (status === 'Resolvido') return 'done';
  if (status === 'Em andamento') return 'wait';
  return 'open';
}

function clsPriority(priority) {
  if (priority === 'Urgente') return 'urgent';
  if (priority === 'Alta') return 'wait';
  return 'normal';
}

// ==========================================================
// CONTROLE DE AUTENTICAÇÃO (LOGIN / CADASTRO / LOGOUT)
// ==========================================================

function switchAuthTab(tab) {
  const isLogin = tab === 'login';
  const isCadastro = tab === 'cadastro';
  const isRecuperar = tab === 'recuperar';

  $('tabLoginBtn').classList.toggle('active', isLogin);
  $('tabCadastroBtn').classList.toggle('active', isCadastro);
  $('loginForm').style.display = isLogin ? 'block' : 'none';
  $('cadastroForm').style.display = isCadastro ? 'block' : 'none';
  $('recuperarForm').style.display = isRecuperar ? 'block' : 'none';
  hideAuthAlert();
}

function showAuthAlert(msg) {
  const alert = $('authAlert');
  alert.textContent = msg;
  alert.style.display = 'block';
}

function hideAuthAlert() {
  const alert = $('authAlert');
  alert.style.display = 'none';
  alert.textContent = '';
}

// Formulário de Login
$('loginForm').onsubmit = async (e) => {
  e.preventDefault();
  hideAuthAlert();
  const email = $('loginEmail').value.trim();
  const senha = $('loginSenha').value;

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, senha })
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.erro || 'Falha ao entrar.');
    }

    authToken = data.token;
    localStorage.setItem('ti_auth_token', authToken);
    currentUser = data.usuario;

    initAuthenticatedApp();
    showToast(`Bem-vindo(a), ${currentUser.nome}!`);
  } catch (err) {
    showAuthAlert(err.message);
  }
};

// Formulário de Cadastro
$('cadastroForm').onsubmit = async (e) => {
  e.preventDefault();
  hideAuthAlert();
  const nome = $('cadNome').value.trim();
  const email = $('cadEmail').value.trim();
  const senha = $('cadSenha').value;

  try {
    const res = await fetch('/api/auth/cadastro', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nome, email, senha })
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.erro || 'Falha ao criar conta.');
    }

    authToken = data.token;
    localStorage.setItem('ti_auth_token', authToken);
    currentUser = data.usuario;

    initAuthenticatedApp();
    showToast(`Conta criada com sucesso! Bem-vindo(a), ${currentUser.nome}!`);
  } catch (err) {
    showAuthAlert(err.message);
  }
};

// Formulário de Recuperação de Senha
$('recuperarForm').onsubmit = async (e) => {
  e.preventDefault();
  hideAuthAlert();

  const email = $('recEmail').value.trim();
  const novaSenha = $('recSenha').value;
  const confirmacao = $('recSenhaConfirm').value;

  if (novaSenha !== confirmacao) {
    showAuthAlert('As senhas digitadas não coincidem. Verifique e tente novamente.');
    return;
  }

  try {
    const res = await fetch('/api/auth/recuperar-senha', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, novaSenha })
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.erro || 'Falha ao redefinir senha.');
    }

    authToken = data.token;
    localStorage.setItem('ti_auth_token', authToken);
    currentUser = data.usuario;

    initAuthenticatedApp();
    showToast(`Senha redefinida com sucesso! Bem-vindo(a) de volta, ${currentUser.nome}!`);
    $('recuperarForm').reset();
  } catch (err) {
    showAuthAlert(err.message);
  }
};

// Logout
function logout(message) {
  authToken = null;
  currentUser = null;
  localStorage.removeItem('ti_auth_token');

  $('mainApp').style.display = 'none';
  $('authScreen').style.display = 'flex';
  $('loginSenha').value = '';

  if (message) {
    showAuthAlert(message);
  } else {
    showToast('Sessão encerrada com sucesso.', 'success');
  }
}

// Verifica token no carregamento da página
async function checkAuth() {
  if (!authToken) {
    $('authScreen').style.display = 'flex';
    $('mainApp').style.display = 'none';
    return;
  }

  try {
    const data = await api('/api/auth/me');
    currentUser = data.usuario;
    initAuthenticatedApp();
  } catch (err) {
    logout();
  }
}

function initAuthenticatedApp() {
  $('authScreen').style.display = 'none';
  $('mainApp').style.display = 'flex';

  if (currentUser) {
    $('topUserName').textContent = currentUser.nome;
    $('topUserEmail').textContent = currentUser.email;
    const initial = currentUser.nome.charAt(0).toUpperCase() || 'U';
    $('topAvatarLetter').textContent = initial;
  }

  loadConfig();
  showView(currentView || 'dashboard');
}

// ==========================================================
// SELETORES DE MÊS E ANO
// ==========================================================

function initPeriodSelectors() {
  const currentYear = new Date().getFullYear();
  const years = [currentYear - 2, currentYear - 1, currentYear, currentYear + 1];

  const monthSelects = [$('dashMonth'), $('reportMonthSelect'), $('historyMonth')];
  const yearSelects = [$('dashYear'), $('reportYearSelect'), $('historyYear')];

  monthSelects.forEach((sel) => {
    if (!sel) return;
    const hasEmptyOption = sel.id === 'historyMonth';
    if (!hasEmptyOption) sel.innerHTML = '';
    MONTHS.forEach((m, idx) => {
      const opt = document.createElement('option');
      opt.value = idx + 1;
      opt.textContent = m;
      if (idx + 1 === selectedMonth) opt.selected = true;
      sel.appendChild(opt);
    });
  });

  yearSelects.forEach((sel) => {
    if (!sel) return;
    const hasEmptyOption = sel.id === 'historyYear';
    if (!hasEmptyOption) sel.innerHTML = '';
    years.forEach((y) => {
      const opt = document.createElement('option');
      opt.value = y;
      opt.textContent = y;
      if (y === selectedYear) opt.selected = true;
      sel.appendChild(opt);
    });
  });

  // Handlers do Dashboard
  $('dashMonth').onchange = (e) => {
    selectedMonth = Number(e.target.value);
    loadDashboard();
  };
  $('dashYear').onchange = (e) => {
    selectedYear = Number(e.target.value);
    loadDashboard();
  };

  // Handlers do Relatório
  $('reportMonthSelect').onchange = (e) => {
    selectedMonth = Number(e.target.value);
    loadReport();
  };
  $('reportYearSelect').onchange = (e) => {
    selectedYear = Number(e.target.value);
    loadReport();
  };

  // Handlers do Histórico
  $('historyMonth').onchange = loadHistory;
  $('historyYear').onchange = loadHistory;
  $('historyStatus').onchange = loadHistory;
  $('historyPriority').onchange = loadHistory;
  $('historySearch').oninput = debounce(loadHistory, 300);

  $('btnResetFilters').onclick = () => {
    $('historySearch').value = '';
    $('historyMonth').value = '';
    $('historyYear').value = '';
    $('historyStatus').value = '';
    $('historyPriority').value = '';
    loadHistory();
  };
}

function debounce(func, wait) {
  let timeout;
  return function (...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), wait);
  };
}

// ==========================================================
// CONTROLE DO MENU MOBILE E NAVEGAÇÃO ENTRE ABAS
// ==========================================================

function toggleSidebar(open) {
  const sidebar = $('sidebar');
  const backdrop = $('sidebarBackdrop');
  if (!sidebar) return;

  const shouldOpen = open !== undefined ? open : !sidebar.classList.contains('open');
  sidebar.classList.toggle('open', shouldOpen);
  if (backdrop) backdrop.classList.toggle('active', shouldOpen);
}

function showView(viewId) {
  toggleSidebar(false);

  document.querySelectorAll('.view').forEach((v) => v.classList.remove('active'));
  const target = $(viewId);
  if (target) target.classList.add('active');

  // Atualiza botões da sidebar desktop
  document.querySelectorAll('.nav button').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.view === viewId);
  });

  // Atualiza botões da barra inferior mobile (bottom nav)
  document.querySelectorAll('.bottom-nav-item').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.view === viewId);
  });

  currentView = viewId;
  window.scrollTo({ top: 0, behavior: 'smooth' });

  const titleMap = {
    dashboard: { title: 'Visão geral', sub: 'Controle operacional e indicadores dos seus chamados de T.I.' },
    novo: { title: 'Nova ocorrência', sub: 'Registro rápido e catalogação de chamados hospitalares.' },
    historico: { title: 'Histórico de ocorrências', sub: 'Consulta, filtros avançados e gestão das suas ocorrências.' },
    relatorio: { title: 'Relatório mensal', sub: 'Consolidação gerencial oficial em formatos Word e PDF.' },
    config: { title: 'Configurações', sub: 'Identificação institucional, setor e gestão de logotipo.' }
  };

  const info = titleMap[viewId] || titleMap.dashboard;
  $('pageTitle').textContent = info.title;
  $('pageSubtitle').textContent = info.sub;

  if (viewId === 'dashboard') loadDashboard();
  if (viewId === 'historico') loadHistory();
  if (viewId === 'relatorio') loadReport();
  if (viewId === 'config') loadConfig();
  if (viewId === 'novo') {
    const dataInput = $('newData');
    if (!dataInput.value) {
      dataInput.value = new Date().toISOString().slice(0, 10);
    }
  }
}

// ==========================================================
// CARREGAMENTO DE CONFIGURAÇÕES
// ==========================================================

async function loadConfig() {
  try {
    systemConfig = await api('/api/configuracoes');

    if (systemConfig.nome_hospital) {
      $('sidebarHospitalSub').textContent = systemConfig.nome_hospital.toUpperCase();
      $('cfgHospital').value = systemConfig.nome_hospital;
      $('reportHospitalTitle').textContent = systemConfig.nome_hospital;
    }
    if (systemConfig.setor) {
      $('sidebarSector').textContent = systemConfig.setor;
      $('cfgSetor').value = systemConfig.setor;
      $('reportSectorText').textContent = systemConfig.setor;
      $('reportSigSector').textContent = `${systemConfig.setor} — ${systemConfig.nome_hospital}`;
    }
    if (systemConfig.nome_responsavel) {
      $('cfgResponsavel').value = systemConfig.nome_responsavel;
      $('topUserName').textContent = systemConfig.nome_responsavel;
      $('reportResponsibleText').textContent = systemConfig.nome_responsavel;
      $('reportSigName').textContent = systemConfig.nome_responsavel;
    } else if (currentUser) {
      $('topUserName').textContent = currentUser.nome;
      $('reportResponsibleText').textContent = currentUser.nome;
      $('reportSigName').textContent = currentUser.nome;
    }

    if (systemConfig.logo_path) {
      const logoUrl = `/${systemConfig.logo_path}?t=${Date.now()}`;
      $('cfgLogoPreview').src = logoUrl;
      $('reportLogo').src = logoUrl;
      $('reportLogo').style.display = 'block';
    }
  } catch (error) {
    console.error('Falha ao obter configurações:', error);
  }
}

// ==========================================================
// DASHBOARD
// ==========================================================

let currentChartTab = 'tipo';
let dashboardDataCache = null;

async function loadDashboard() {
  try {
    const data = await api(`/api/dashboard?mes=${selectedMonth}&ano=${selectedYear}`);
    dashboardDataCache = data;

    // Atualiza métricas numéricas
    if ($('metricTotal')) $('metricTotal').textContent = data.indicadores.total;
    if ($('metricResolved')) $('metricResolved').textContent = data.indicadores.resolvidas;
    if ($('metricProgress')) $('metricProgress').textContent = data.indicadores.em_andamento;
    if ($('metricHigh')) $('metricHigh').textContent = data.indicadores.alta_prioridade;

    // Atualiza barra proporcional de status
    if ($('barDone')) $('barDone').style.width = `${data.percentuais.resolvidas_pct}%`;
    if ($('barProg')) $('barProg').style.width = `${data.percentuais.em_andamento_pct}%`;
    if ($('barOpen')) $('barOpen').style.width = `${data.percentuais.abertas_pct}%`;

    if ($('donePct')) $('donePct').textContent = `${data.percentuais.resolvidas_pct}%`;
    if ($('progPct')) $('progPct').textContent = `${data.percentuais.em_andamento_pct}%`;
    if ($('openPct')) $('openPct').textContent = `${data.percentuais.abertas_pct}%`;

    // Renderiza o novo gráfico interativo com base na aba ativa
    renderCategoryChart(data);

    // Atualiza lista de atividades recentes com itens interativos clicáveis
    const recentList = $('recentActivitiesList');
    if (!data.atividades_recentes || data.atividades_recentes.length === 0) {
      recentList.innerHTML = '<div class="empty">Nenhuma ocorrência registrada por você neste período.</div>';
    } else {
      recentList.innerHTML = data.atividades_recentes.map((item) => `
        <div class="activity-item" onclick="openEditModal(${item.id})" title="Clique para ver ou editar esta ocorrência" role="button" tabindex="0">
          <div class="activity-info">
            <strong>${escapeHtml(item.setor)} — ${formatDate(item.data)}</strong>
            <p>${escapeHtml(item.problema)}</p>
          </div>
          <div style="display: flex; gap: 8px; align-items: center;">
            <span class="badge ${clsStatus(item.status)}">${escapeHtml(item.status)}</span>
            <span style="font-size: 11.5px; color: var(--blue); font-weight: 600;">Ver &rarr;</span>
          </div>
        </div>
      `).join('');
    }
  } catch (err) {
    console.error('Erro no dashboard:', err);
  }
}

// Renderiza o gráfico representativo com barras interativas animadas
function renderCategoryChart(data) {
  const container = $('dashboardCategoryChart');
  if (!container) return;

  if (!data || !data.indicadores || data.indicadores.total === 0) {
    container.innerHTML = '<div class="empty" style="padding: 24px 0;">Nenhuma ocorrência registrada no período selecionado para gerar o gráfico.</div>';
    return;
  }

  const total = data.indicadores.total;
  let items = [];
  let categoryType = currentChartTab;

  if (currentChartTab === 'tipo') {
    items = (data.por_tipo || []).map(i => ({
      name: i.tipo_problema,
      total: i.total,
      resolvidas: i.resolvidas,
      icon: getIconForCategory(i.tipo_problema)
    }));
  } else if (currentChartTab === 'setor') {
    items = (data.por_setor || []).map(i => ({
      name: i.setor,
      total: i.total,
      resolvidas: i.resolvidas,
      icon: '🏢'
    }));
  } else if (currentChartTab === 'prioridade') {
    items = (data.por_prioridade || []).map(i => ({
      name: i.prioridade,
      total: i.total,
      resolvidas: 0,
      icon: i.prioridade === 'Urgente' ? '🚨' : (i.prioridade === 'Alta' ? '⚠️' : '🔹')
    }));
  }

  if (items.length === 0) {
    container.innerHTML = '<div class="empty" style="padding: 24px 0;">Nenhum dado encontrado para esta categoria.</div>';
    return;
  }

  container.innerHTML = items.map((item) => {
    const pct = Math.round((item.total / total) * 100);
    const gradColor = getGradientForTab(currentChartTab, item.name);

    return `
      <div class="cat-bar-row" onclick="filterHistoryFromCategory('${categoryType}', '${escapeHtml(item.name)}')" title="Clique para ver ocorrências de '${escapeHtml(item.name)}' no histórico">
        <div class="cat-bar-info">
          <div class="cat-bar-name">
            <span>${item.icon}</span>
            <span>${escapeHtml(item.name)}</span>
          </div>
          <div class="cat-bar-counts">
            <span>${item.total} chamada${item.total > 1 ? 's' : ''}</span>
            <span class="cat-bar-badge">${pct}%</span>
          </div>
        </div>
        <div class="cat-bar-track">
          <div class="cat-bar-fill" style="width: ${pct}%; background: ${gradColor};"></div>
        </div>
      </div>
    `;
  }).join('');
}

// Retorna ícone visual para cada categoria de problema
function getIconForCategory(tipo) {
  const map = {
    'Hardware': '💻',
    'Software': '💾',
    'Rede/Internet': '🌐',
    'Impressão': '🖨️',
    'Acesso/Usuário': '🔑',
    'Outro': '📦'
  };
  return map[tipo] || '⚙️';
}

// Retorna gradientes diferenciados e vibrantes para as barras do gráfico
function getGradientForTab(tab, name) {
  if (tab === 'prioridade') {
    if (name === 'Urgente') return 'linear-gradient(90deg, #dc2626, #ef4444)';
    if (name === 'Alta') return 'linear-gradient(90deg, #d97706, #f59e0b)';
    return 'linear-gradient(90deg, #2563eb, #3b82f6)';
  }
  if (tab === 'tipo') {
    const colorMap = {
      'Hardware': 'linear-gradient(90deg, #4f46e5, #6366f1)',
      'Software': 'linear-gradient(90deg, #0284c7, #38bdf8)',
      'Rede/Internet': 'linear-gradient(90deg, #059669, #10b981)',
      'Impressão': 'linear-gradient(90deg, #d97706, #fbbf24)',
      'Acesso/Usuário': 'linear-gradient(90deg, #7c3aed, #a855f7)',
      'Outro': 'linear-gradient(90deg, #64748b, #94a3b8)'
    };
    return colorMap[name] || 'linear-gradient(90deg, #1b5cb8, #3b82f6)';
  }
  return 'linear-gradient(90deg, #0284c7, #2563eb)';
}

// Alterna entre abas do novo gráfico (Tipo, Setor, Prioridade)
function switchDashboardChart(tabName) {
  currentChartTab = tabName;
  $('tabChartTipo')?.classList.toggle('active', tabName === 'tipo');
  $('tabChartSetor')?.classList.toggle('active', tabName === 'setor');
  $('tabChartPrioridade')?.classList.toggle('active', tabName === 'prioridade');

  if (dashboardDataCache) {
    renderCategoryChart(dashboardDataCache);
  }
}

// Interatividade dos Cards de Métricas: Filtra o Histórico diretamente pelo Card clicado
function filterHistoryFromCard(filterType) {
  showView('historico');

  // Sincroniza mês e ano do histórico com o período visto no dashboard
  if ($('historyMonth')) $('historyMonth').value = selectedMonth;
  if ($('historyYear')) $('historyYear').value = selectedYear;

  if (filterType === 'todos') {
    if ($('historyStatus')) $('historyStatus').value = '';
    if ($('historyPriority')) $('historyPriority').value = '';
    if ($('historySearch')) $('historySearch').value = '';
    showToast('Exibindo todas as ocorrências do período.');
  } else if (filterType === 'Resolvido' || filterType === 'Em andamento' || filterType === 'Aberto') {
    if ($('historyStatus')) $('historyStatus').value = filterType;
    if ($('historyPriority')) $('historyPriority').value = '';
    showToast(`Filtrando histórico por: ${filterType}`);
  } else if (filterType === 'alta') {
    if ($('historyStatus')) $('historyStatus').value = '';
    if ($('historyPriority')) $('historyPriority').value = 'Alta';
    showToast('Filtrando histórico por: Alta Prioridade / Urgente');
  }

  loadHistory();
}

// Interatividade das Barras do Gráfico: Filtra o histórico pela Categoria/Setor clicado
function filterHistoryFromCategory(categoryType, value) {
  showView('historico');

  if ($('historyMonth')) $('historyMonth').value = selectedMonth;
  if ($('historyYear')) $('historyYear').value = selectedYear;

  if (categoryType === 'prioridade') {
    if ($('historyPriority')) $('historyPriority').value = value;
    if ($('historyStatus')) $('historyStatus').value = '';
    if ($('historySearch')) $('historySearch').value = '';
    showToast(`Filtrando histórico por prioridade: ${value}`);
  } else {
    // Para setor e tipo, usa a busca rápida
    if ($('historySearch')) $('historySearch').value = value;
    if ($('historyStatus')) $('historyStatus').value = '';
    if ($('historyPriority')) $('historyPriority').value = '';
    showToast(`Filtrando histórico por: ${value}`);
  }

  loadHistory();
}

// Botão de Atualizar dados com rotação suave e feedback
async function refreshDashboardWithAnimation() {
  const btn = $('btnDashRefresh');
  if (btn) btn.classList.add('spinning');

  await loadDashboard();

  setTimeout(() => {
    if (btn) btn.classList.remove('spinning');
  }, 600);

  showToast('Painel atualizado com sucesso!');
}

// Botões rápidos de alternância de período (Este Mês / Mês Anterior)
function setDashboardPeriod(type) {
  const now = new Date();
  if (type === 'current') {
    selectedMonth = now.getMonth() + 1;
    selectedYear = now.getFullYear();
    $('btnDashQuickCurrent')?.classList.add('active');
    $('btnDashQuickPrev')?.classList.remove('active');
  } else if (type === 'prev') {
    let m = now.getMonth();
    let y = now.getFullYear();
    if (m === 0) {
      m = 12;
      y -= 1;
    }
    selectedMonth = m;
    selectedYear = y;
    $('btnDashQuickPrev')?.classList.add('active');
    $('btnDashQuickCurrent')?.classList.remove('active');
  }

  if ($('dashMonth')) $('dashMonth').value = selectedMonth;
  if ($('dashYear')) $('dashYear').value = selectedYear;

  loadDashboard();
  showToast(`Período alterado para: ${String(selectedMonth).padStart(2, '0')}/${selectedYear}`);
}

// ==========================================================
// HISTÓRICO
// ==========================================================

async function loadHistory() {
  try {
    const params = new URLSearchParams();
    const search = $('historySearch')?.value?.trim();
    const month = $('historyMonth')?.value;
    const year = $('historyYear')?.value;
    const status = $('historyStatus')?.value;
    const priority = $('historyPriority')?.value;

    if (search) params.append('busca', search);
    if (month) params.append('mes', month);
    if (year) params.append('ano', year);
    if (status) params.append('status', status);
    if (priority) params.append('prioridade', priority);

    const ocorrencias = await api(`/api/ocorrencias?${params.toString()}`);
    const tbody = $('historyTableBody');

    if (!ocorrencias || ocorrencias.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="empty">Nenhuma ocorrência encontrada para os filtros selecionados.</td></tr>';
      return;
    }

    tbody.innerHTML = ocorrencias.map((item) => `
      <tr>
        <td style="font-weight: 600; color: var(--blue);">${formatDate(item.data)}</td>
        <td>
          <strong style="color: var(--ink);">${escapeHtml(item.setor)}</strong><br>
          <small style="color: var(--muted);">${escapeHtml(item.tipo_problema)}</small>
        </td>
        <td>
          <div style="font-weight: 500; color: #222;">${escapeHtml(item.problema)}</div>
          ${item.o_que_foi_feito ? `<small style="color: var(--muted); display: block; margin-top: 3px;"><b>Feito:</b> ${escapeHtml(item.o_que_foi_feito)}</small>` : ''}
        </td>
        <td><span class="badge ${clsStatus(item.status)}">${escapeHtml(item.status)}</span></td>
        <td><span class="badge ${clsPriority(item.prioridade)}">${escapeHtml(item.prioridade)}</span></td>
        <td>
          <div class="table-actions">
            <button class="btn btn-light btn-sm" onclick="openEditModal(${item.id})">Editar</button>
            <button class="btn btn-danger btn-sm" onclick="openDeleteModal(${item.id})">Excluir</button>
          </div>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    console.error('Erro ao carregar histórico:', err);
  }
}

// ==========================================================
// RELATÓRIO MENSAL
// ==========================================================

async function loadReport() {
  try {
    const report = await api(`/api/relatorio?mes=${selectedMonth}&ano=${selectedYear}`);

    $('reportPeriodText').textContent = report.periodoLabel;
    $('reportIssueDate').textContent = report.emissao;
    $('reportResponsibleText').textContent = report.config.nome_responsavel || currentUser?.nome || 'Não informado';
    $('reportSectorText').textContent = report.config.setor || 'Tecnologia da Informação';
    $('reportHospitalTitle').textContent = report.config.nome_hospital || 'Hospital Regional Nossa Senhora do Bom Conselho';
    $('reportSigName').textContent = report.config.nome_responsavel || currentUser?.nome || 'Nome não informado';
    $('reportSigSector').textContent = `${report.config.setor || 'Tecnologia da Informação'} — ${report.config.nome_hospital || 'Hospital Regional'}`;

    $('reportExecutiveSummary').textContent = report.resumoTexto;

    // Indicadores na folha de relatório
    $('rTotal').textContent = report.indicadores.total;
    $('rResolved').textContent = report.indicadores.resolvidas;
    $('rProgress').textContent = report.indicadores.em_andamento;
    $('rOpen').textContent = report.indicadores.abertas;
    $('rHigh').textContent = report.indicadores.alta_prioridade;

    // Detalhamento de atividades
    const list = $('reportExecutiveList');
    if (!report.ocorrencias || report.ocorrencias.length === 0) {
      list.innerHTML = '<div class="empty">Nenhuma atividade registrada por você neste período.</div>';
    } else {
      const total = report.ocorrencias.length;
      list.innerHTML = report.ocorrencias.map((item, idx) => `
        <article class="executive-item">
          <h5>Atividade ${total - idx} — ${formatDate(item.data)} | ${escapeHtml(item.setor)}</h5>
          <p><strong>Tipo do problema:</strong> ${escapeHtml(item.tipo_problema)}</p>
          <p><strong>Problema:</strong> ${escapeHtml(item.problema)}</p>
          <p><strong>Diagnóstico:</strong> ${escapeHtml(item.diagnostico || 'Não informado')}</p>
          <p><strong>O que foi feito:</strong> ${escapeHtml(item.o_que_foi_feito || 'Não informado')}</p>
          <p>
            <strong>Status:</strong> ${escapeHtml(item.status)} &nbsp;&nbsp;|&nbsp;&nbsp;
            <strong>Prioridade:</strong> ${escapeHtml(item.prioridade)}
          </p>
        </article>
      `).join('');
    }
  } catch (err) {
    console.error('Erro ao carregar relatório:', err);
  }
}

// ==========================================================
// CADASTRO DE NOVA OCORRÊNCIA
// ==========================================================

$('newIncidentForm').onsubmit = async (e) => {
  e.preventDefault();
  const form = e.target;
  const payload = {
    setor: form.setor.value.trim(),
    data: form.data.value,
    tipo_problema: form.tipo_problema.value,
    prioridade: form.prioridade.value,
    status: form.status.value,
    problema: form.problema.value.trim(),
    diagnostico: form.diagnostico.value.trim(),
    o_que_foi_feito: form.o_que_foi_feito.value.trim()
  };

  try {
    await api('/api/ocorrencias', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    showToast('Ocorrência cadastrada com sucesso!');
    form.reset();
    showView('dashboard');
  } catch (err) {
    // Tratado
  }
};

// ==========================================================
// MODAL DE EDIÇÃO
// ==========================================================

async function openEditModal(id) {
  try {
    const item = await api(`/api/ocorrencias/${id}`);
    $('editId').value = item.id;
    $('editSetor').value = item.setor;
    $('editData').value = item.data;
    $('editTipo').value = item.tipo_problema;
    $('editPrioridade').value = item.prioridade;
    $('editStatus').value = item.status;
    $('editProblema').value = item.problema;
    $('editDiagnostico').value = item.diagnostico || '';
    $('editFeito').value = item.o_que_foi_feito || '';

    $('modalEdit').classList.add('active');
  } catch (err) {
    console.error(err);
  }
}

function closeEditModal() {
  $('modalEdit').classList.remove('active');
}

$('editForm').onsubmit = async (e) => {
  e.preventDefault();
  const id = $('editId').value;
  const payload = {
    setor: $('editSetor').value.trim(),
    data: $('editData').value,
    tipo_problema: $('editTipo').value,
    prioridade: $('editPrioridade').value,
    status: $('editStatus').value,
    problema: $('editProblema').value.trim(),
    diagnostico: $('editDiagnostico').value.trim(),
    o_que_foi_feito: $('editFeito').value.trim()
  };

  try {
    await api(`/api/ocorrencias/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    showToast('Ocorrência atualizada com sucesso!');
    closeEditModal();
    if (currentView === 'historico') loadHistory();
    if (currentView === 'dashboard') loadDashboard();
    if (currentView === 'relatorio') loadReport();
  } catch (err) {
    // Tratado
  }
};

// ==========================================================
// MODAL DE EXCLUSÃO
// ==========================================================

function openDeleteModal(id) {
  itemToDeleteId = id;
  $('modalDelete').classList.add('active');
}

function closeDeleteModal() {
  itemToDeleteId = null;
  $('modalDelete').classList.remove('active');
}

$('btnConfirmDelete').onclick = async () => {
  if (!itemToDeleteId) return;
  try {
    await api(`/api/ocorrencias/${itemToDeleteId}`, { method: 'DELETE' });
    showToast('Ocorrência removida com sucesso!');
    closeDeleteModal();
    if (currentView === 'historico') loadHistory();
    if (currentView === 'dashboard') loadDashboard();
    if (currentView === 'relatorio') loadReport();
  } catch (err) {
    // Tratado
  }
};

// ==========================================================
// CONFIGURAÇÕES
// ==========================================================

$('configForm').onsubmit = async (e) => {
  e.preventDefault();
  const payload = {
    nome_hospital: $('cfgHospital').value.trim(),
    setor: $('cfgSetor').value.trim(),
    nome_responsavel: $('cfgResponsavel').value.trim()
  };

  try {
    await api('/api/configuracoes', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    showToast('Configurações salvas!');
    await loadConfig();
  } catch (err) {
    // Tratado
  }
};

// Upload de Logotipo
$('logoFileInput').onchange = (e) => {
  const file = e.target.files[0];
  if (file) {
    $('btnUploadLogo').disabled = false;
    const reader = new FileReader();
    reader.onload = (ev) => {
      $('cfgLogoPreview').src = ev.target.result;
    };
    reader.readAsDataURL(file);
  }
};

$('logoUploadForm').onsubmit = async (e) => {
  e.preventDefault();
  const file = $('logoFileInput').files[0];
  if (!file) return;

  const formData = new FormData();
  formData.append('logo', file);

  try {
    const res = await fetch('/api/configuracoes/logo', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authToken}`
      },
      body: formData
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.erro || 'Falha no envio da imagem');

    showToast('Logotipo atualizado com sucesso!');
    $('btnUploadLogo').disabled = true;
    await loadConfig();
  } catch (err) {
    showToast(err.message, 'error');
  }
};

// ==========================================================
// DOWNLOADS DE RELATÓRIO COM AUTENTICAÇÃO (WORD, PDF, EXCEL)
// ==========================================================

$('btnDownloadDocx').onclick = () => {
  window.location.href = `/api/relatorio/docx?mes=${selectedMonth}&ano=${selectedYear}&token=${encodeURIComponent(authToken)}`;
  showToast('Download do documento Word (.docx) iniciado.');
};

$('btnDownloadPdf').onclick = () => {
  window.open(`/api/relatorio/pdf?mes=${selectedMonth}&ano=${selectedYear}&token=${encodeURIComponent(authToken)}`, '_blank');
};

const btnDownloadExcel = $('btnDownloadExcel');
if (btnDownloadExcel) {
  btnDownloadExcel.onclick = () => {
    window.location.href = `/api/relatorio/excel?mes=${selectedMonth}&ano=${selectedYear}&token=${encodeURIComponent(authToken)}`;
    showToast('Download da planilha Excel (.xlsx) iniciado.');
  };
}

const btnHistoryExcel = $('btnHistoryExcel');
if (btnHistoryExcel) {
  btnHistoryExcel.onclick = () => {
    const m = $('historyMonth').value || selectedMonth;
    const y = $('historyYear').value || selectedYear;
    window.location.href = `/api/relatorio/excel?mes=${m}&ano=${y}&token=${encodeURIComponent(authToken)}`;
    showToast('Exportação do histórico para Excel (.xlsx) iniciada.');
  };
}

// ==========================================================
// CÓPIA DE SEGURANÇA (BACKUP DO BANCO DE DADOS)
// ==========================================================

const btnDownloadBackup = $('btnDownloadBackup');
if (btnDownloadBackup) {
  btnDownloadBackup.onclick = () => {
    window.location.href = `/api/configuracoes/backup?token=${encodeURIComponent(authToken)}`;
    showToast('Download do backup do banco de dados iniciado com sucesso!');
  };
}

// ==========================================================
// SEGURANÇA — ALTERAÇÃO DE SENHA DO USUÁRIO LOGADO
// ==========================================================

const changePasswordForm = $('changePasswordForm');
if (changePasswordForm) {
  changePasswordForm.onsubmit = async (e) => {
    e.preventDefault();
    const senhaAtual = $('pwdAtual').value;
    const novaSenha = $('pwdNova').value;
    const confirmacao = $('pwdConfirm').value;

    if (novaSenha !== confirmacao) {
      showToast('A confirmação da nova senha não confere.', 'error');
      return;
    }

    try {
      const data = await api('/api/auth/alterar-senha', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ senhaAtual, novaSenha })
      });

      showToast(data.mensagem || 'Senha alterada com sucesso!');
      changePasswordForm.reset();
    } catch (err) {
      // Notificação tratada no api()
    }
  };
}

// ==========================================================
// PWA — INSTALAÇÃO NO CELULAR / DESKTOP
// ==========================================================

let deferredPrompt = null;

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  const btn = $('btnInstallPwa');
  if (btn) btn.style.display = 'inline-flex';
});

function installPwa() {
  if (deferredPrompt) {
    deferredPrompt.prompt();
    deferredPrompt.userChoice.then((choiceResult) => {
      if (choiceResult.outcome === 'accepted') {
        showToast('Aplicativo instalado com sucesso!', 'success');
      }
      const btn = $('btnInstallPwa');
      if (btn) btn.style.display = 'none';
      deferredPrompt = null;
    });
  } else {
    showToast('Para instalar no celular, toque no menu do navegador e selecione "Adicionar à tela inicial".', 'success');
  }
}

// ==========================================================
// INICIALIZAÇÃO DA APLICAÇÃO
// ==========================================================

window.addEventListener('DOMContentLoaded', async () => {
  // Registra Service Worker para PWA
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.warn('PWA Service Worker registration:', err);
    });
  }

  initPeriodSelectors();
  document.querySelectorAll('.nav button').forEach((btn) => {
    btn.onclick = () => showView(btn.dataset.view);
  });

  await checkAuth();
});
