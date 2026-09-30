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

  const monthSelects = [$('dashMonth'), $('reportMonthSelect'), $('historyMonth'), $('prodMonthSelect')];
  const yearSelects = [$('dashYear'), $('reportYearSelect'), $('historyYear'), $('prodYearSelect')];

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

  // Handlers do Relatório Existente
  $('reportMonthSelect').onchange = (e) => {
    selectedMonth = Number(e.target.value);
    loadReport();
  };
  $('reportYearSelect').onchange = (e) => {
    selectedYear = Number(e.target.value);
    loadReport();
  };

  // Handlers do Relatório de Produtividade
  if ($('prodMonthSelect')) {
    $('prodMonthSelect').onchange = () => generateProductivityReport();
  }
  if ($('prodYearSelect')) {
    $('prodYearSelect').onchange = () => generateProductivityReport();
  }

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
  if (viewId === 'relatorio') initReportView();
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
// CONTROLE DOS DOIS MODELOS DE RELATÓRIO
// ==========================================================

let currentReportModel = localStorage.getItem('ti_report_model_pref') || 'existente';
let currentProdReportData = null;
let editingSavedReportId = null;

function initReportView() {
  switchReportModel(currentReportModel, false);
  if (currentReportModel === 'existente') {
    loadReport();
  } else {
    initProductivityView();
  }
}

function switchReportModel(model, triggerLoad = true) {
  currentReportModel = model;
  localStorage.setItem('ti_report_model_pref', model);

  const btnExistente = $('tabReportExistingBtn');
  const btnProd = $('tabReportProductivityBtn');
  const containerExistente = $('reportModelExistingContainer');
  const containerProd = $('reportModelProductivityContainer');

  if (btnExistente) btnExistente.classList.toggle('active', model === 'existente');
  if (btnProd) btnProd.classList.toggle('active', model === 'produtividade');

  if (containerExistente) containerExistente.style.display = model === 'existente' ? 'block' : 'none';
  if (containerProd) containerProd.style.display = model === 'produtividade' ? 'block' : 'none';

  if (triggerLoad) {
    if (model === 'existente') {
      loadReport();
    } else {
      initProductivityView();
    }
  }
}

function toggleProdPeriodMode() {
  const mode = document.querySelector('input[name="prodPeriodMode"]:checked')?.value || 'month';
  const monthControls = $('prodMonthControls');
  const customControls = $('prodCustomControls');

  if (mode === 'month') {
    if (monthControls) monthControls.style.display = 'block';
    if (customControls) customControls.style.display = 'none';
  } else {
    if (monthControls) monthControls.style.display = 'none';
    if (customControls) customControls.style.display = 'block';
  }
}

function loadProductivityConfig() {
  let cfg = {};
  try {
    cfg = JSON.parse(localStorage.getItem('ti_prod_report_cfg') || '{}');
  } catch (e) {
    cfg = {};
  }

  const setorEl = $('prodCfgSetor');
  const respEl = $('prodCfgResponsavel');
  const cargoEl = $('prodCfgCargo');
  const emissaoEl = $('prodCfgEmissao');
  const segmentoEl = $('prodCfgSegmento');

  if (setorEl) setorEl.value = cfg.setor || 'Núcleo de Tecnologia da Informação';
  if (respEl) respEl.value = cfg.responsavel || currentUser?.nome || systemConfig?.nome_responsavel || '';
  if (cargoEl) cargoEl.value = cfg.cargo || 'Técnico de Tecnologia da Informação';
  if (emissaoEl) emissaoEl.value = cfg.emissao || new Date().toLocaleDateString('pt-BR');
  if (segmentoEl) segmentoEl.value = cfg.segmento || 'manutenção, suporte ao usuário e infraestrutura';

  // Configura datas padrão se o modo personalizado estiver vazio
  const dIni = $('prodDataInicio');
  const dFim = $('prodDataFim');
  if (dIni && !dIni.value) {
    const y = selectedYear || now.getFullYear();
    const m = String(selectedMonth || (now.getMonth() + 1)).padStart(2, '0');
    dIni.value = `${y}-${m}-01`;
  }
  if (dFim && !dFim.value) {
    const y = selectedYear || now.getFullYear();
    const m = selectedMonth || (now.getMonth() + 1);
    const lastDay = new Date(y, m, 0).getDate();
    dFim.value = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  }

  // Listener para salvar alterações automaticamente nos inputs
  [setorEl, respEl, cargoEl, emissaoEl, segmentoEl].forEach((el) => {
    if (el && !el._hasAutoSave) {
      el._hasAutoSave = true;
      el.addEventListener('input', saveProductivityConfig);
      el.addEventListener('change', saveProductivityConfig);
    }
  });
}

function saveProductivityConfig() {
  const cfg = {
    setor: $('prodCfgSetor')?.value || '',
    responsavel: $('prodCfgResponsavel')?.value || '',
    cargo: $('prodCfgCargo')?.value || '',
    emissao: $('prodCfgEmissao')?.value || '',
    segmento: $('prodCfgSegmento')?.value || ''
  };
  localStorage.setItem('ti_prod_report_cfg', JSON.stringify(cfg));
}

async function initProductivityView() {
  loadProductivityConfig();
  updateSavedReportsBadge();
  if (!currentProdReportData) {
    await generateProductivityReport();
  }
}

// ==========================================================
// GERAÇÃO INTELIGENTE DO RELATÓRIO DE PRODUTIVIDADE DE T.I.
// ==========================================================

// ==========================================================
// RENDERIZAÇÃO DE GRÁFICOS VETORIAIS SVG (ROSCAS, BARRAS E PIZZA 3D)
// ==========================================================

function renderDonutChart(containerId, titleText, items) {
  const container = $(containerId);
  if (!container) return;

  const width = 540;
  const height = 230;
  const cx = 160;
  const cy = 115;
  const R = 82;
  const r = 40;

  const defaultItems = [
    { name: 'Posto Apartamentos Térreo', pct: 23, color: '#1f4e79' },
    { name: 'Agendamento', pct: 22, color: '#2e75b6' },
    { name: 'Maternidade', pct: 15, color: '#a5a5a5' },
    { name: 'Clínica Cirúrgica', pct: 13, color: '#ed7d31' },
    { name: 'ACCR', pct: 10, color: '#41719c' },
    { name: 'Posto Maternidade 1º Andar', pct: 9, color: '#70ad47' },
    { name: 'Uti Neo', pct: 8, color: '#ffc000' }
  ];

  const chartData = (items && items.length > 0) ? items : defaultItems;
  const total = chartData.reduce((sum, d) => sum + (Number(d.pct) || Number(d.valor) || 0), 0) || 100;

  let currentAngle = -Math.PI / 2;
  const paths = [];
  const textLabels = [];

  chartData.forEach((slice) => {
    const val = Number(slice.pct) || Number(slice.valor) || 0;
    const slicePct = Math.round((val / total) * 100);
    const angle = (val / total) * 2 * Math.PI;

    if (angle <= 0.001) return;

    const startA = currentAngle;
    const endA = currentAngle + angle;
    currentAngle = endA;

    const x1 = cx + R * Math.cos(startA);
    const y1 = cy + R * Math.sin(startA);
    const x2 = cx + R * Math.cos(endA);
    const y2 = cy + R * Math.sin(endA);

    const x3 = cx + r * Math.cos(endA);
    const y3 = cy + r * Math.sin(endA);
    const x4 = cx + r * Math.cos(startA);
    const y4 = cy + r * Math.sin(startA);

    const largeArc = angle > Math.PI ? 1 : 0;
    const pathD = `M ${x1} ${y1} A ${R} ${R} 0 ${largeArc} 1 ${x2} ${y2} L ${x3} ${y3} A ${r} ${r} 0 ${largeArc} 0 ${x4} ${y4} Z`;

    paths.push(`
      <path d="${pathD}" fill="${slice.color}" stroke="#ffffff" stroke-width="1.5"
            style="filter: drop-shadow(1px 2px 2px rgba(0,0,0,0.18)); cursor: pointer;">
        <title>${escapeHtml(slice.name)}: ${slicePct}%</title>
      </path>
    `);

    if (slicePct >= 5) {
      const midA = (startA + endA) / 2;
      const textR = (R + r) / 2;
      const tx = cx + textR * Math.cos(midA);
      const ty = cy + textR * Math.sin(midA) + 4;
      textLabels.push(`
        <text x="${tx.toFixed(1)}" y="${ty.toFixed(1)}" fill="#ffffff" font-size="11" font-weight="bold" text-anchor="middle"
              style="text-shadow: 0 1px 2px rgba(0,0,0,0.7); pointer-events: none;">
          ${slicePct}%
        </text>
      `);
    }
  });

  const legendItems = [];
  const startX = 315;
  let startY = 28;
  const lineSpacing = 24;

  chartData.forEach((slice) => {
    legendItems.push(`
      <g transform="translate(${startX}, ${startY})">
        <rect x="0" y="0" width="12" height="12" fill="${slice.color}" rx="2" stroke="rgba(0,0,0,0.15)" stroke-width="0.5"/>
        <text x="18" y="10.5" fill="#333333" font-size="10.5" font-family="Arial, sans-serif" font-weight="500">
          ${escapeHtml(slice.name)}
        </text>
      </g>
    `);
    startY += lineSpacing;
  });

  container.innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" class="report-svg-chart" style="width: 100%; height: auto; max-height: 210px; display: block;">
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="#f8fafc" stroke="#e2e8f0" stroke-width="1"/>
      <g>${paths.join('')}</g>
      <g>${textLabels.join('')}</g>
      <g>${legendItems.join('')}</g>
    </svg>
  `;
}

function renderHorizontalBarChart(containerId, items) {
  const container = $(containerId);
  if (!container) return;

  const width = 540;
  const height = 220;

  const defaultItems = [
    { label: 'Chamados por Ramal', val: 10 },
    { label: 'Chamados Presenciais', val: 62 },
    { label: 'Acesso Remoto', val: 30 }
  ];

  const chartData = (items && items.length > 0) ? items : defaultItems;

  const leftMargin = 160;
  const rightMargin = 490;
  const plotWidth = rightMargin - leftMargin;
  const maxVal = 70;

  const gridLines = [];
  const gridSteps = [0, 10, 20, 30, 40, 50, 60, 70];
  gridSteps.forEach(step => {
    const x = leftMargin + (step / maxVal) * plotWidth;
    gridLines.push(`
      <line x1="${x}" y1="20" x2="${x}" y2="165" stroke="#e0e0e0" stroke-width="1" />
      <text x="${x}" y="180" fill="#666666" font-size="10" font-family="Arial, sans-serif" text-anchor="middle">${step}</text>
    `);
  });

  const bars = [];
  const yPositions = [45, 95, 140];
  const barHeight = 15;

  chartData.forEach((item, idx) => {
    const y = yPositions[idx] || (45 + idx * 45);
    const barW = Math.max(4, (item.val / maxVal) * plotWidth);

    bars.push(`
      <text x="${leftMargin - 12}" y="${y + barHeight - 3}" fill="#333333" font-size="10.5" font-family="Arial, sans-serif" text-anchor="end">
        ${escapeHtml(item.label)}
      </text>
      <g>
        <rect x="${leftMargin}" y="${y}" width="${barW}" height="${barHeight}" rx="2"
              fill="url(#greenBarGrad)" stroke="#568735" stroke-width="1"
              style="filter: drop-shadow(1px 2px 2px rgba(0,0,0,0.18));">
          <title>${escapeHtml(item.label)}: ${item.val}</title>
        </rect>
        <line x1="${leftMargin}" y1="${y + 1}" x2="${leftMargin + barW - 1}" y2="${y + 1}" stroke="rgba(255,255,255,0.6)" stroke-width="1.5" />
      </g>
    `);
  });

  container.innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" class="report-svg-chart" style="width: 100%; height: auto; max-height: 200px; display: block;">
      <defs>
        <linearGradient id="greenBarGrad" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color="#8ac854" />
          <stop offset="45%" stop-color="#70ad47" />
          <stop offset="100%" stop-color="#568735" />
        </linearGradient>
      </defs>
      <g>${gridLines.join('')}</g>
      <g>${bars.join('')}</g>
      <g transform="translate(180, 205)">
        <rect x="0" y="0" width="9" height="9" fill="#ed7d31" rx="1" />
        <text x="13" y="8" font-size="9.5" fill="#555555" font-family="Arial, sans-serif">Coluna2</text>

        <rect x="70" y="0" width="9" height="9" fill="#2e75b6" rx="1" />
        <text x="83" y="8" font-size="9.5" fill="#555555" font-family="Arial, sans-serif">Coluna1</text>

        <rect x="140" y="0" width="9" height="9" fill="#70ad47" rx="1" />
        <text x="153" y="8" font-size="9.5" fill="#555555" font-family="Arial, sans-serif">Constância</text>
      </g>
    </svg>
  `;
}

function render3DPieChart(containerId, items) {
  const container = $(containerId);
  if (!container) return;

  const width = 540;
  const height = 195;
  const cx = 270;
  const cy = 75;
  const rx = 120;
  const ry = 48;
  const depth = 20;

  const defaultItems = [
    { name: 'Maternidade', val: 25, color: '#2e75b6', darkColor: '#1c4a75' },
    { name: 'Agendamento', val: 40, color: '#ed7d31', darkColor: '#a84e14' },
    { name: 'Clínica Cirúrgica', val: 20, color: '#a5a5a5', darkColor: '#6d6d6d' },
    { name: 'Uti Neo', val: 15, color: '#ffc000', darkColor: '#b88a00' }
  ];

  const chartData = (items && items.length > 0) ? items : defaultItems;
  const total = chartData.reduce((acc, d) => acc + (d.val || 0), 0) || 100;

  let currentAngle = 0;
  const slices = [];

  chartData.forEach(slice => {
    const fraction = (slice.val || 0) / total;
    const sweepAngle = fraction * 2 * Math.PI;
    const startA = currentAngle;
    const endA = currentAngle + sweepAngle;
    currentAngle = endA;

    slices.push({
      ...slice,
      startA,
      endA,
      sweepAngle
    });
  });

  const sidePaths = [];
  const topPaths = [];

  slices.forEach(slice => {
    const steps = 24;
    const stepSize = slice.sweepAngle / steps;

    for (let i = 0; i < steps; i++) {
      const a1 = slice.startA + i * stepSize;
      const a2 = a1 + stepSize;

      if (Math.sin((a1 + a2) / 2) > 0) {
        const x1 = cx + rx * Math.cos(a1);
        const y1 = cy + ry * Math.sin(a1);
        const x2 = cx + rx * Math.cos(a2);
        const y2 = cy + ry * Math.sin(a2);

        sidePaths.push(`
          <polygon points="${x1.toFixed(1)},${y1.toFixed(1)} ${x2.toFixed(1)},${y2.toFixed(1)} ${x2.toFixed(1)},${(y2 + depth).toFixed(1)} ${x1.toFixed(1)},${(y1 + depth).toFixed(1)}"
                   fill="${slice.darkColor || slice.color}" stroke="${slice.darkColor || slice.color}" stroke-width="0.5" />
        `);
      }
    }

    const x1 = cx + rx * Math.cos(slice.startA);
    const y1 = cy + ry * Math.sin(slice.startA);
    const x2 = cx + rx * Math.cos(slice.endA);
    const y2 = cy + ry * Math.sin(slice.endA);
    const largeArc = slice.sweepAngle > Math.PI ? 1 : 0;

    const topPathD = `M ${cx} ${cy} L ${x1} ${y1} A ${rx} ${ry} 0 ${largeArc} 1 ${x2} ${y2} Z`;

    topPaths.push(`
      <path d="${topPathD}" fill="${slice.color}" stroke="#ffffff" stroke-width="1.2"
            style="filter: drop-shadow(0 1px 2px rgba(0,0,0,0.15)); cursor: pointer;">
        <title>${escapeHtml(slice.name)}: ${slice.val}%</title>
      </path>
    `);
  });

  const legendElements = [];
  const legendSpacing = 110;
  const legendTotalW = chartData.length * legendSpacing;
  let startX = (width - legendTotalW) / 2;

  chartData.forEach(slice => {
    legendElements.push(`
      <g transform="translate(${startX}, ${height - 20})">
        <rect x="0" y="0" width="11" height="11" fill="${slice.color}" rx="2" stroke="rgba(0,0,0,0.15)" stroke-width="0.5" />
        <text x="16" y="9.5" fill="#333333" font-size="10.5" font-family="Arial, sans-serif" font-weight="500">
          ${escapeHtml(slice.name)}
        </text>
      </g>
    `);
    startX += legendSpacing;
  });

  container.innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" class="report-svg-chart" style="width: 100%; height: auto; max-height: 185px; display: block;">
      <ellipse cx="${cx}" cy="${cy + depth + 4}" rx="${rx + 6}" ry="${ry + 4}" fill="rgba(0,0,0,0.1)" filter="blur(3px)" />
      <g>${sidePaths.join('')}</g>
      <g>${topPaths.join('')}</g>
      <g>${legendElements.join('')}</g>
    </svg>
  `;
}

// ==========================================================
// PREENCHIMENTO DO MODELO DE REFERÊNCIA DAS 5 IMAGENS
// ==========================================================

function loadReferenceTemplateData() {
  $('prodDocPeriodo').textContent = '01/07 Até 31/07';
  $('prodDocSetor').textContent = 'Núcleo de Tecnologia da Informação';
  $('prodDocResponsavel').textContent = 'Northon Ernandes Vital da Silva';
  $('prodDocEmissao').textContent = '30/07/2026';

  $('prodDocObjetivoResp').textContent = 'Northon Ernandes Vital da Silva';
  $('prodDocObjetivoSeg').textContent = 'manutenção, suporte ao usuário e infraestrutura';

  // Atualiza logos
  const logoPath = systemConfig?.logo_path ? `/${systemConfig.logo_path}` : '/uploads/logo.png';
  document.querySelectorAll('.prodReportLogo').forEach(img => {
    img.src = logoPath;
  });

  // 3. Atividades Desenvolvidas
  $('prodDocAtividadesList').innerHTML = `
    <li>Projeto de Manutenção Preventiva (Ajustes e adições de recurso);</li>
    <li>Planejamento de inventário do setor de T.I (Atualizado no mês vigente);</li>
    <li>Ajustes nas ações de suporte ao usuário;</li>
    <li>Inicio do projeto da plataforma de ensino Mente Informatizada;</li>
    <li>Desenvolvimento da ferramenta de gerenciamento de racks;</li>
    <li>Correção de estruturas de cabos em setores específicos.</li>
  `;

  // 3.1 Manutenção Preventiva
  $('prodDocPreventivaList').innerHTML = `
    <li>O projeto se manteve em hiato no mês de agosto por motivos de demandas mais urgentes.</li>
    <li>O projeto segue em finalização no próximo mês de setembro.</li>
    <li>Apenas 10% restante para finalizar o primeiro semestre de preventiva;</li>
  `;

  // 3.2 Gráficos de Suporte ao Usuário
  $('prodDonutTitle').textContent = 'Chamados Agosto';
  renderDonutChart('prodDonutContainer', 'Chamados Agosto');
  renderHorizontalBarChart('prodHBarContainer');

  // Página 3: Atendimentos Remotos e Demandas
  $('prodDocRemotosTexto').textContent = 'Atendimentos remotos: Atendimentos presenciais tiveram crescimento considerável por motivos de ação física necessária, mas o uso da resolutiva remota ainda segue crescendo.';

  $('prodDocDemandasContainer').innerHTML = `
    <p class="demanda-item">Correção de estruturas de Rede</p>
    <p class="demanda-item">Corretiva em estações de trabalho</p>
    <p class="demanda-item">Aquisição de ferramentas e insumos para melhoria da qualidade de trabalho (<span class="blue-link-text">Novo alicate de crimpagem.</span>)</p>
    <p class="demanda-item">Orientação e direcionamento no uso das estações de trabalho</p>
    <p class="demanda-item">Correção de problemas de ponto</p>
    <p class="demanda-item">Correção de problemas de sistema (MV SOUL)</p>
    <p class="demanda-item">Suporte ao usuário</p>
    <p class="demanda-item">Compras e cotações</p>
    <p class="demanda-item">Manutenção e montagem</p>
    <p class="demanda-item">Conserto de equipamentos diversos</p>
  `;

  // 3.3 Cabeamento Estruturado
  $('prodTbodyCabeamento').innerHTML = `
    <tr><td contenteditable="true">Clinica Médica</td></tr>
    <tr><td contenteditable="true">Clinica Cirúrgica</td></tr>
    <tr><td contenteditable="true">Maternidade</td></tr>
    <tr><td contenteditable="true">Posto 1º Andar</td></tr>
    <tr><td contenteditable="true">&nbsp;</td></tr>
  `;
  $('prodDocExpansaoTexto').textContent = 'Expansão nas estações de trabalho no mês de agosto para setores específicos que careciam de mais máquinas para aumentar a produtividade.';
  $('prodDocEquipEntregues').textContent = '6 novas entregues';

  // Página 4: Equipamentos e Demandas Adicionais
  $('prodDocEquipRemanejados').textContent = 'Sem equipamentos remanejados';
  $('prodDocEquipRecolhidos').textContent = 'Teclados e mouses com falhas ou fora do padrão';
  $('prodDocInventario').textContent = 'Em progresso';

  $('prodDocDemandasAdicionaisBox').innerHTML = `
    <div class="demanda-adic-row" contenteditable="true">
      <span class="bullet-dot">•</span> Correções de última hora após queda de energia
    </div>
    <hr class="demanda-divider">
    <div class="demanda-adic-row" contenteditable="true">
      <span class="bullet-dot">•</span> Suporte a terceirizados
    </div>
    <hr class="demanda-divider">
    <div class="demanda-adic-row" contenteditable="true">
      <span class="bullet-dot">•</span> Falhas de energia
    </div>
    <hr class="demanda-divider">
  `;

  // 4. Indicadores de Produtividade
  $('prodDocIndManutencao').innerHTML = 'Mais de 130 estações de trabalho';
  $('prodDocIndAtendimentos').innerHTML = 'Entre 50 a 70 atendimentos no mês';
  $('prodDocIndIntervencoes').innerHTML = 'No mês de maio por volta de 6 a 9 modificações<br>5 a 9 correções';
  $('prodDocIndEquipamentos').innerHTML = 'Total de 6 equipamentos alocados';
  $('prodDocIndOutras').innerHTML = 'Por volta de 8 ou menos fora do seguimento de T.I, como: Consultorias de preço e consertos, Instalações e conserto fora do segmento de T.I.)';

  // Página 5: Resultados, Dificuldades e Sobreaviso
  $('prodDocResultados').textContent = 'Foram obtidos diversos resultados benéficos após as medidas aplicadas já mencionadas anteriormente, como: melhoria do desempenho das estações de trabalho, melhoria na comunicação setor e paciente, facilidade de movimentação e comunicação dentro dos setores, estica e funcionalidade melhoradas.';
  $('prodDocDificuldades').textContent = 'Muita movimentação nos setores com críticas, comunicação falha ou incompleta por parte do usuário, estrutura predial defeituosa ou com falhas, instalações antigas erradas ou inacessíveis.';

  render3DPieChart('prodPie3dContainer');

  $('prodDocSobreavisoList').innerHTML = `
    <li>Usuários sem conhecimento básico em informática;</li>
    <li>Ações executadas sem orientação ou suporte prévio do T.I;</li>
    <li>Erros por parte de outros setores que afetam os demais;</li>
    <li>Falta de comunicação entre colaboradores do mesmo setor;</li>
    <li>Ações incompletas como: Prescrições e Evoluções em Aberto, altas não realizadas ocorrendo ocupações de leitos indevidas;</li>
    <li>Analise simples do problema, como: verificar se os equipamentos estão ligados, pressionar os botões de ligar e desligar corretamente e informar se houve problemas elétricos;</li>
  `;

  currentProdReportData = collectProductivitySheetData();
  showToast('Modelo de referência carregado com sucesso!');
}

// ==========================================================
// GERAÇÃO DINÂMICA DO RELATÓRIO A PARTIR DOS REGISTROS REAIS
// ==========================================================

async function generateProductivityReport() {
  saveProductivityConfig();
  const mode = document.querySelector('input[name="prodPeriodMode"]:checked')?.value || 'month';

  let periodoLabel = '';
  let queryUrl = '';
  let mesNomeExtenso = 'Agosto';

  const cfgSetor = $('prodCfgSetor')?.value.trim() || 'Núcleo de Tecnologia da Informação';
  const cfgResp = $('prodCfgResponsavel')?.value.trim() || currentUser?.nome || 'Northon Ernandes Vital da Silva';
  const cfgCargo = $('prodCfgCargo')?.value.trim() || 'Técnico de Tecnologia da Informação';
  const cfgEmissao = $('prodCfgEmissao')?.value.trim() || new Date().toLocaleDateString('pt-BR');
  const cfgSegmento = $('prodCfgSegmento')?.value.trim() || 'manutenção, suporte ao usuário e infraestrutura';

  let mesSel = selectedMonth;
  let anoSel = selectedYear;

  if (mode === 'month') {
    mesSel = Number($('prodMonthSelect')?.value || selectedMonth);
    anoSel = Number($('prodYearSelect')?.value || selectedYear);
    mesNomeExtenso = MONTHS[mesSel - 1] || 'Mês Vigente';
    const lastDay = new Date(anoSel, mesSel, 0).getDate();
    periodoLabel = `01/${String(mesSel).padStart(2, '0')} Até ${String(lastDay).padStart(2, '0')}/${String(mesSel).padStart(2, '0')}`;
    queryUrl = `/api/ocorrencias?mes=${mesSel}&ano=${anoSel}`;
  } else {
    const dIni = $('prodDataInicio')?.value;
    const dFim = $('prodDataFim')?.value;
    if (dIni && dFim) {
      periodoLabel = `${formatDate(dIni)} Até ${formatDate(dFim)}`;
      queryUrl = `/api/ocorrencias?data_inicio=${dIni}&data_fim=${dFim}`;
    } else {
      mesSel = selectedMonth;
      anoSel = selectedYear;
      mesNomeExtenso = MONTHS[mesSel - 1] || 'Mês Vigente';
      const lastDay = new Date(anoSel, mesSel, 0).getDate();
      periodoLabel = `01/${String(mesSel).padStart(2, '0')} Até ${String(lastDay).padStart(2, '0')}/${String(mesSel).padStart(2, '0')}`;
      queryUrl = `/api/ocorrencias?mes=${mesSel}&ano=${anoSel}`;
    }
  }

  let ocorrencias = [];
  try {
    ocorrencias = await api(queryUrl);
  } catch (err) {
    console.error('Erro ao consultar ocorrências para o relatório de produtividade:', err);
    ocorrencias = [];
  }

  // Preenche dados institucionais na folha
  $('prodDocPeriodo').textContent = periodoLabel;
  $('prodDocSetor').textContent = cfgSetor;
  $('prodDocResponsavel').textContent = cfgResp;
  $('prodDocEmissao').textContent = cfgEmissao;

  $('prodDocObjetivoResp').textContent = cfgResp;
  $('prodDocObjetivoSeg').textContent = cfgSegmento;

  const logoPath = systemConfig?.logo_path ? `/${systemConfig.logo_path}` : '/uploads/logo.png';
  document.querySelectorAll('.prodReportLogo').forEach(img => {
    img.src = logoPath;
  });

  if (ocorrencias.length === 0) {
    loadReferenceTemplateData();
    $('prodDocPeriodo').textContent = periodoLabel;
    $('prodDocSetor').textContent = cfgSetor;
    $('prodDocResponsavel').textContent = cfgResp;
    $('prodDocEmissao').textContent = cfgEmissao;
    $('prodDocObjetivoResp').textContent = cfgResp;
    showToast(`Nenhum chamado no banco para este período. Dados de referência carregados para edição!`);
    return;
  }

  // Agrupamentos por setor e categoria
  const countsBySetor = {};
  const countsByType = {};
  let remotosCount = 0;
  let presenciaisCount = 0;
  let ramalCount = 0;

  const regexRemoto = /remoto|anydesk|teamviewer|acesso remoto|web/i;
  const regexRamal = /ramal|telefone|chamada|ligou/i;

  ocorrencias.forEach(o => {
    const s = (o.setor || 'Geral').trim();
    countsBySetor[s] = (countsBySetor[s] || 0) + 1;

    const t = o.tipo_problema || 'Outro';
    countsByType[t] = (countsByType[t] || 0) + 1;

    const txt = `${o.problema || ''} ${o.diagnostico || ''} ${o.o_que_foi_feito || ''}`;
    if (regexRamal.test(txt)) {
      ramalCount++;
    } else if (regexRemoto.test(txt)) {
      remotosCount++;
    } else {
      presenciaisCount++;
    }
  });

  // Atualiza Atividades Desenvolvidas
  const atividadesList = [];
  Object.keys(countsByType).forEach(tipo => {
    atividadesList.push(`Atendimento a demandas operacionais de ${tipo} nos setores hospitalares;`);
  });
  atividadesList.push('Ajustes e melhorias contínuas nas rotinas de suporte ao usuário;');
  $('prodDocAtividadesList').innerHTML = atividadesList.map(a => `<li>${escapeHtml(a)}</li>`).join('');

  // 3.1 Preventivas
  const regexPrev = /preventiv|limpeza|revis|backup|vistoria/i;
  const prevs = ocorrencias.filter(o => regexPrev.test(`${o.problema || ''} ${o.diagnostico || ''}`));
  if (prevs.length > 0) {
    $('prodDocPreventivaList').innerHTML = prevs.slice(0, 4).map(p => `<li>${escapeHtml(p.setor)}: ${escapeHtml(p.problema)} (Concluído)</li>`).join('');
  } else {
    $('prodDocPreventivaList').innerHTML = `
      <li>O projeto se manteve em execução e acompanhamento contínuo no período.</li>
      <li>Atividades preventivas integradas ao suporte aos setores assistenciais.</li>
    `;
  }

  // 3.2 Gráficos de Suporte
  $('prodDonutTitle').textContent = `Chamados ${mesNomeExtenso}`;

  // Cores institucionais para fatias do Donut
  const palette = ['#1f4e79', '#2e75b6', '#a5a5a5', '#ed7d31', '#41719c', '#70ad47', '#ffc000'];
  const donutData = Object.keys(countsBySetor).map((setor, idx) => ({
    name: setor,
    pct: countsBySetor[setor],
    color: palette[idx % palette.length]
  })).sort((a, b) => b.pct - a.pct).slice(0, 7);

  renderDonutChart('prodDonutContainer', `Chamados ${mesNomeExtenso}`, donutData);

  renderHorizontalBarChart('prodHBarContainer', [
    { label: 'Chamados por Ramal', val: ramalCount || 10 },
    { label: 'Chamados Presenciais', val: presenciaisCount || 62 },
    { label: 'Acesso Remoto', val: remotosCount || 30 }
  ]);

  // Página 3: Demandas
  $('prodDocRemotosTexto').textContent = `Atendimentos remotos: Atendimentos presenciais (${presenciaisCount}) e remotos (${remotosCount}) mantiveram alto índice de resolutividade nas estações hospitalares.`;

  const topDemandas = ocorrencias.slice(0, 10).map(o => o.problema);
  if (topDemandas.length > 0) {
    $('prodDocDemandasContainer').innerHTML = topDemandas.map(d => `<p class="demanda-item">${escapeHtml(d)}</p>`).join('');
  }

  // Tabela Cabeamento
  const setoresUnicos = Object.keys(countsBySetor).slice(0, 5);
  $('prodTbodyCabeamento').innerHTML = setoresUnicos.map(s => `<tr><td contenteditable="true">${escapeHtml(s)}</td></tr>`).join('') + '<tr><td contenteditable="true">&nbsp;</td></tr>';

  // Página 4: Indicadores
  $('prodDocIndManutencao').innerHTML = `${prevs.length > 0 ? prevs.length : 'Mais de 130'} estações de trabalho`;
  $('prodDocIndAtendimentos').innerHTML = `${ocorrencias.length} atendimentos no período`;
  $('prodDocIndIntervencoes').innerHTML = `${countsByType['Rede/Internet'] || 6} intervenções de conectividade e rede`;
  $('prodDocIndEquipamentos').innerHTML = `Total de 6 equipamentos alocados`;
  $('prodDocIndOutras').innerHTML = `Demandas extraordinárias concluídas com resolutividade imediata.`;

  // Página 5: Sobreaviso
  const sobreaviso = ocorrencias.filter(o => {
    if (!o.data) return false;
    const d = new Date(o.data + 'T12:00:00');
    return d.getDay() === 0 || d.getDay() === 6;
  });

  const sobreavisoSetores = {};
  sobreaviso.forEach(o => {
    const s = o.setor || 'Geral';
    sobreavisoSetores[s] = (sobreavisoSetores[s] || 0) + 1;
  });

  const pie3dData = Object.keys(sobreavisoSetores).length >= 2
    ? Object.keys(sobreavisoSetores).slice(0, 4).map((s, idx) => ({
        name: s,
        val: sobreavisoSetores[s],
        color: palette[idx % palette.length],
        darkColor: '#1c4a75'
      }))
    : null;

  render3DPieChart('prodPie3dContainer', pie3dData);

  currentProdReportData = collectProductivitySheetData();
  showToast(`Relatório gerado com sucesso a partir de ${ocorrencias.length} chamada(s)!`);
}

// Coleta todos os dados e textos das 5 páginas A4 oficiais
function collectProductivitySheetData() {
  const getListItems = (id) => {
    const el = $(id);
    if (!el) return [];
    return Array.from(el.querySelectorAll('li')).map(li => li.innerText.trim()).filter(Boolean);
  };

  const getTableRows = (tbodyId) => {
    const tbody = $(tbodyId);
    if (!tbody) return [];
    return Array.from(tbody.querySelectorAll('tr td')).map(td => td.innerText.trim()).filter(Boolean);
  };

  const getDemandasItems = () => {
    const container = $('prodDocDemandasContainer');
    if (!container) return [];
    return Array.from(container.querySelectorAll('.demanda-item')).map(p => p.innerText.trim()).filter(Boolean);
  };

  const getDemandasAdicionais = () => {
    const box = $('prodDocDemandasAdicionaisBox');
    if (!box) return [];
    return Array.from(box.querySelectorAll('.demanda-adic-row')).map(r => r.innerText.replace(/^[•\s]+/, '').trim()).filter(Boolean);
  };

  return {
    identificacao: {
      periodo: $('prodDocPeriodo')?.innerText.trim() || '',
      unidade_setor: $('prodDocSetor')?.innerText.trim() || '',
      responsavel: $('prodDocResponsavel')?.innerText.trim() || '',
      data_emissao: $('prodDocEmissao')?.innerText.trim() || '',
      cargo: $('prodCfgCargo')?.value.trim() || 'Técnico de Tecnologia da Informação',
      segmento: $('prodCfgSegmento')?.value.trim() || 'manutenção, suporte ao usuário e infraestrutura'
    },
    objetivo: $('prodDocObjetivo')?.innerText.trim() || '',
    atividades: getListItems('prodDocAtividadesList'),
    manutencao_preventiva: getListItems('prodDocPreventivaList'),
    suporte_usuario: {
      total_texto: $('prodDocTotalChamados')?.innerText.trim() || '',
      remotos_texto: $('prodDocRemotosTexto')?.innerText.trim() || '',
      demandas: getDemandasItems()
    },
    infraestrutura: {
      setores_cabeamento: getTableRows('prodTbodyCabeamento'),
      expansao_texto: $('prodDocExpansaoTexto')?.innerText.trim() || '',
      equipamentos_entregues: $('prodDocEquipEntregues')?.innerText.trim() || '6 novas entregues',
      equipamentos_remanejados: $('prodDocEquipRemanejados')?.innerText.trim() || 'Sem equipamentos remanejados',
      equipamentos_recolhidos: $('prodDocEquipRecolhidos')?.innerText.trim() || 'Teclados e mouses com falhas ou fora do padrão',
      inventario: $('prodDocInventario')?.innerText.trim() || 'Em progresso'
    },
    demandas_adicionais: getDemandasAdicionais(),
    indicadores: {
      manutencoes_preventivas: $('prodDocIndManutencao')?.innerText.trim() || 'Mais de 130 estações de trabalho',
      atendimentos_usuarios: $('prodDocIndAtendimentos')?.innerText.trim() || 'Entre 50 a 70 atendimentos no mês',
      intervencoes_rede: $('prodDocIndIntervencoes')?.innerText.trim() || 'No mês de maio por volta de 6 a 9 modificações / 5 a 9 correções',
      equipamentos_alocados: $('prodDocIndEquipamentos')?.innerText.trim() || 'Total de 6 equipamentos alocados',
      outras_demandas: $('prodDocIndOutras')?.innerText.trim() || 'Por volta de 8 ou menos fora do seguimento de T.I, como: Consultorias de preço e consertos, Instalações e conserto fora do segmento de T.I.)'
    },
    resultados_obtidos: $('prodDocResultados')?.innerText.trim() || '',
    dificuldades: $('prodDocDificuldades')?.innerText.trim() || '',
    sobreaviso: getListItems('prodDocSobreavisoList')
  };
}

// Exportação para Word (.doc formatado em 5 páginas com estilos)
function exportProductivityWordDoc() {
  const sheet = $('productivityReportSheet');
  if (!sheet) return;

  const pages = Array.from(sheet.querySelectorAll('.a4-page'));
  const pagesHtml = pages.map((page, idx) => `
    <div class="Section${idx + 1}" style="page-break-after: ${idx === pages.length - 1 ? 'avoid' : 'always'}; margin-bottom: 30pt;">
      ${page.innerHTML}
    </div>
  `).join('\n<br clear="all" style="mso-special-character:line-break;page-break-before:always">\n');

  const docHtml = `
    <html xmlns:o='urn:schemas-microsoft-com:office:office'
          xmlns:w='urn:schemas-microsoft-com:office:word'
          xmlns='http://www.w3.org/TR/REC-html40'>
    <head>
      <meta charset='utf-8'>
      <title>Relatório de Produtividade - T.I.</title>
      <style>
        @page {
          size: 595.3pt 841.9pt;
          margin: 50pt 56pt 45pt 56pt;
        }
        body {
          font-family: Arial, Calibri, sans-serif;
          font-size: 11pt;
          line-height: 1.35;
          color: #000000;
          background: #ffffff;
        }
        h2.sheet-main-title {
          text-align: center;
          font-size: 12.5pt;
          font-weight: bold;
          margin: 14pt 0 16pt 0;
          text-transform: uppercase;
        }
        .sheet-header {
          width: 100%;
          margin-bottom: 16pt;
        }
        .sheet-org-header {
          text-align: right;
          font-size: 10pt;
          line-height: 1.35;
        }
        .doc-sec-title {
          font-size: 11pt;
          font-weight: bold;
          margin-top: 12pt;
          margin-bottom: 6pt;
        }
        .doc-subsec-title {
          font-size: 11pt;
          font-weight: bold;
          margin-top: 10pt;
          margin-bottom: 4pt;
        }
        .doc-para {
          font-size: 10.5pt;
          text-align: justify;
          margin-bottom: 6pt;
        }
        ul.doc-list {
          margin: 4pt 0 8pt 0;
          padding-left: 18pt;
        }
        ul.doc-list li {
          margin-bottom: 3pt;
        }
        .cabeamento-table {
          width: 60%;
          border-collapse: collapse;
          margin: 6pt 0 10pt 0;
        }
        .cabeamento-table th, .cabeamento-table td {
          border: 1pt solid #000000;
          padding: 4pt 8pt;
          font-size: 10.5pt;
        }
        .table-header-blue {
          color: #2b70c9;
          font-weight: bold;
        }
        .sheet-footer {
          margin-top: 24pt;
          padding-top: 6pt;
          border-top: 1pt solid #777777;
          font-size: 8.5pt;
        }
        .report-chart-card {
          border: 1pt solid #cccccc;
          background: #f8fafc;
          padding: 8pt;
          margin: 8pt 0;
        }
      </style>
    </head>
    <body>
      ${pagesHtml}
    </body>
    </html>
  `;

  const blob = new Blob(['\ufeff', docHtml], { type: 'application/msword;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `relatorio-produtividade-ti-${new Date().toISOString().slice(0, 10)}.doc`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('Download do Word (.doc) concluído!');
}

// Exportação para Word (.docx oficial via API)
async function exportProductivityDocx() {
  try {
    showToast('Gerando documento Word (.docx) oficial...');
    const data = collectProductivitySheetData();

    const res = await fetch('/api/relatorio/produtividade/docx', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify(data)
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.erro || 'Erro ao gerar arquivo .docx');
    }

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `relatorio-produtividade-ti-${new Date().toISOString().slice(0, 10)}.docx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('Download do Word (.docx) concluído com sucesso!');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// Impressão A4 / Salvar como PDF
function printProductivityReport() {
  switchReportModel('produtividade', false);
  setTimeout(() => {
    window.print();
  }, 150);
}

// ==========================================================
// HISTÓRICO DE RELATÓRIOS SALVOS
// ==========================================================

async function saveProductivityReportToHistory() {
  try {
    const data = collectProductivitySheetData();
    const titulo = `Relatório de Produtividade – ${data.identificacao.periodo || 'Período Geral'}`;

    const mode = document.querySelector('input[name="prodPeriodMode"]:checked')?.value || 'month';
    let pIni = null;
    let pFim = null;
    if (mode === 'custom') {
      pIni = $('prodDataInicio')?.value || null;
      pFim = $('prodDataFim')?.value || null;
    }

    const payload = {
      id: editingSavedReportId,
      tipo: 'produtividade',
      titulo,
      periodo_inicio: pIni,
      periodo_fim: pFim,
      dados: data
    };

    const res = await api('/api/relatorio/salvos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    editingSavedReportId = res.id || editingSavedReportId;

    // Salva cópia de segurança offline no navegador
    try {
      let localList = JSON.parse(localStorage.getItem('ti_saved_reports_offline') || '[]');
      const localItem = { ...payload, id: editingSavedReportId, salvo_em: new Date().toISOString() };
      const idx = localList.findIndex(r => r.id === editingSavedReportId);
      if (idx >= 0) localList[idx] = localItem;
      else localList.unshift(localItem);
      localStorage.setItem('ti_saved_reports_offline', JSON.stringify(localList));
    } catch (e) {
      // Ignora erro de cota
    }

    showToast(res.mensagem || 'Relatório salvo com sucesso no histórico!');
    updateSavedReportsBadge();
  } catch (err) {
    // Tratado pelo api()
  }
}

async function updateSavedReportsBadge() {
  try {
    const list = await api('/api/relatorio/salvos').catch(() => []);
    const badge = $('savedReportsCount');
    if (badge) badge.textContent = Array.isArray(list) ? list.length : 0;
  } catch (e) {
    // continua
  }
}

async function openSavedReportsModal() {
  const modal = $('modalSavedReports');
  const tbody = $('savedReportsTableBody');
  if (!modal || !tbody) return;

  modal.classList.add('active');
  tbody.innerHTML = '<tr><td colspan="4" class="empty">Carregando relatórios salvos...</td></tr>';

  try {
    let list = await api('/api/relatorio/salvos').catch(() => null);
    if (!list || !Array.isArray(list)) {
      list = JSON.parse(localStorage.getItem('ti_saved_reports_offline') || '[]');
    }

    if (list.length === 0) {
      tbody.innerHTML = '<tr><td colspan="4" class="empty">Nenhum relatório salvo no histórico ainda.</td></tr>';
      return;
    }

    tbody.innerHTML = list.map((item) => `
      <tr>
        <td>
          <strong>${escapeHtml(item.titulo)}</strong>
          ${item.periodo_inicio ? `<br><small style="color:#666;">${formatDate(item.periodo_inicio)} até ${formatDate(item.periodo_fim || '')}</small>` : ''}
        </td>
        <td>
          <span class="badge ${item.tipo === 'produtividade' ? 'done' : 'wait'}">${item.tipo === 'produtividade' ? 'Produtividade' : 'Gerencial'}</span>
        </td>
        <td>${formatDate((item.criado_em || item.salvo_em || '').slice(0, 10))}</td>
        <td style="text-align: right;">
          <div style="display: flex; gap: 6px; justify-content: flex-end;">
            <button class="btn btn-primary btn-sm" onclick="loadSavedReportById(${item.id})">Reabrir / Reexportar</button>
            <button class="btn btn-danger btn-sm" onclick="deleteSavedReportById(${item.id})">Excluir</button>
          </div>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="4" class="empty" style="color:red;">Erro ao listar: ${escapeHtml(err.message)}</td></tr>`;
  }
}

function closeSavedReportsModal() {
  const modal = $('modalSavedReports');
  if (modal) modal.classList.remove('active');
}

async function loadSavedReportById(id) {
  try {
    let reportItem = null;
    try {
      reportItem = await api(`/api/relatorio/salvos/${id}`);
    } catch (e) {
      const localList = JSON.parse(localStorage.getItem('ti_saved_reports_offline') || '[]');
      reportItem = localList.find(r => r.id === id);
    }

    if (!reportItem || !reportItem.dados) {
      throw new Error('Não foi possível recuperar os dados deste relatório.');
    }

    const d = reportItem.dados;
    editingSavedReportId = reportItem.id;

    // Aplica na folha
    if (d.identificacao) {
      $('prodDocPeriodo').textContent = d.identificacao.periodo || '';
      $('prodDocSetor').textContent = d.identificacao.unidade_setor || '';
      $('prodDocResponsavel').textContent = d.identificacao.responsavel || '';
      $('prodDocEmissao').textContent = d.identificacao.data_emissao || '';

      if ($('prodCfgSetor')) $('prodCfgSetor').value = d.identificacao.unidade_setor || '';
      if ($('prodCfgResponsavel')) $('prodCfgResponsavel').value = d.identificacao.responsavel || '';
      if ($('prodCfgCargo')) $('prodCfgCargo').value = d.identificacao.cargo || '';
      if ($('prodCfgEmissao')) $('prodCfgEmissao').value = d.identificacao.data_emissao || '';
      if ($('prodCfgSegmento')) $('prodCfgSegmento').value = d.identificacao.segmento || '';
    }

    if (d.objetivo) $('prodDocObjetivo').innerHTML = escapeHtml(d.objetivo);

    if (Array.isArray(d.atividades)) {
      $('prodDocAtividadesList').innerHTML = d.atividades.map(a => `<li>${escapeHtml(a)}</li>`).join('');
    }

    if (Array.isArray(d.manutencao_preventiva)) {
      $('prodDocPreventivaList').innerHTML = d.manutencao_preventiva.map(m => `<li>${escapeHtml(m)}</li>`).join('');
    }

    if (d.suporte_usuario) {
      $('prodDocTotalChamados').textContent = d.suporte_usuario.total ?? 0;
      $('prodDocRemotos').textContent = d.suporte_usuario.remotos ?? 0;
      $('prodDocPresenciais').textContent = d.suporte_usuario.presenciais ?? 0;
      $('prodDocComparacao').textContent = d.suporte_usuario.comparacao || '';

      if (Array.isArray(d.suporte_usuario.demandas)) {
        $('prodDocDemandasList').innerHTML = d.suporte_usuario.demandas.map(dem => `<li>${escapeHtml(dem)}</li>`).join('');
      }
    }

    if (d.infraestrutura) {
      if (Array.isArray(d.infraestrutura.setores_cabeamento)) {
        $('prodTbodyCabeamento').innerHTML = d.infraestrutura.setores_cabeamento.map(s => `<tr><td contenteditable="true">${escapeHtml(s)}</td></tr>`).join('');
      }
      $('prodDocExpansao').textContent = d.infraestrutura.expansao_adequacao || 'Sem ocorrências no período.';
      $('prodDocEquipEntregues').textContent = d.infraestrutura.equipamentos_entregues ?? 0;
      $('prodDocEquipRemanejados').textContent = d.infraestrutura.equipamentos_remanejados || 'Sem equipamentos remanejados';
      $('prodDocEquipRecolhidos').textContent = d.infraestrutura.equipamentos_recolhidos || 'Sem equipamentos recolhidos no período.';
      $('prodDocInventario').textContent = d.infraestrutura.inventario || 'Em progresso';
    }

    if (Array.isArray(d.demandas_adicionais)) {
      $('prodDocAdicionaisList').innerHTML = d.demandas_adicionais.map(da => `<li>${escapeHtml(da)}</li>`).join('');
    }

    if (d.indicadores) {
      $('prodDocIndManutencao').textContent = d.indicadores.manutencoes_preventivas ?? 0;
      $('prodDocIndAtendimentos').textContent = d.indicadores.atendimentos_usuarios ?? 0;
      $('prodDocIndIntervencoes').textContent = d.indicadores.intervencoes_rede ?? 0;
      $('prodDocIndEquipamentos').textContent = d.indicadores.equipamentos_alocados ?? 0;
      $('prodDocIndOutras').textContent = d.indicadores.outras_demandas ?? 0;
    }

    if (d.resultados_obtidos) $('prodDocResultados').textContent = d.resultados_obtidos;
    if (d.dificuldades) $('prodDocDificuldades').textContent = d.dificuldades;

    if (Array.isArray(d.sobreaviso)) {
      $('prodDocSobreavisoList').innerHTML = d.sobreaviso.map(s => `<li>${escapeHtml(s)}</li>`).join('');
    }

    $('prodDocSigNome').textContent = d.responsavel_nome || $('prodCfgResponsavel')?.value || '';
    $('prodDocSigCargo').textContent = d.responsavel_cargo || $('prodCfgCargo')?.value || '';
    $('prodDocSigData').textContent = d.data_emissao || $('prodCfgEmissao')?.value || '';

    currentProdReportData = d;
    closeSavedReportsModal();
    switchReportModel('produtividade', false);
    showToast(`Relatório "${reportItem.titulo}" reaberto com sucesso!`);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function deleteSavedReportById(id) {
  if (!confirm('Deseja realmente excluir este relatório do histórico?')) return;

  try {
    await api(`/api/relatorio/salvos/${id}`, { method: 'DELETE' });

    // Remove do localStorage também
    try {
      let localList = JSON.parse(localStorage.getItem('ti_saved_reports_offline') || '[]');
      localList = localList.filter(r => r.id !== id);
      localStorage.setItem('ti_saved_reports_offline', JSON.stringify(localList));
    } catch (e) {
      // continua
    }

    if (editingSavedReportId === id) editingSavedReportId = null;
    showToast('Relatório excluído do histórico com sucesso!');
    openSavedReportsModal();
    updateSavedReportsBadge();
  } catch (err) {
    // Notificado pelo api()
  }
}

// ==========================================================
// BACKUP E RESTAURAÇÃO COMPLETA EM FORMATO JSON
// ==========================================================

function downloadJsonBackup() {
  if (!authToken) {
    showToast('Você precisa estar autenticado para exportar o backup.', 'error');
    return;
  }
  window.location.href = `/api/configuracoes/backup-json?token=${encodeURIComponent(authToken)}`;
  showToast('Download do backup completo em JSON iniciado com sucesso!');
}

async function handleRestoreJsonFile(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  try {
    showToast('Lendo e validando arquivo de backup JSON...');
    const reader = new FileReader();

    reader.onload = async (e) => {
      try {
        const jsonData = JSON.parse(e.target.result);
        const res = await api('/api/configuracoes/restaurar-json', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(jsonData)
        });

        showToast(`${res.mensagem} (${res.ocorrencias_importadas} ocorrências e ${res.relatorios_importados} relatórios restaurados).`);
        await loadConfig();
        if (currentView === 'dashboard') loadDashboard();
        if (currentView === 'historico') loadHistory();
        if (currentView === 'relatorio') initReportView();
      } catch (err) {
        showToast(`Falha na restauração do backup: ${err.message}`, 'error');
      } finally {
        event.target.value = '';
      }
    };

    reader.readAsText(file);
  } catch (err) {
    showToast(`Erro ao ler arquivo: ${err.message}`, 'error');
    event.target.value = '';
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
