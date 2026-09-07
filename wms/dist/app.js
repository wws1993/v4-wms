const HIDDEN_PAGES = new Set(['architecture']);

const NAV = [
  { group: '概览', items: [
    { id: 'dashboard', label: '可视化驾驶舱', icon: '▣' },
  ]},
  { group: '基础数据', items: [
    { id: 'warehouses', label: '仓库管理', icon: '▣' },
    { id: 'stacks', label: '堆位管理', icon: '▦' },
    { id: 'materials', label: '物料档案', icon: '▤' },
    { id: 'partners', label: '往来主体', icon: '◎' },
    { id: 'bonded', label: '保税账册', icon: '☰' },
    { id: 'settings', label: '系统设置', icon: '⚙' },
  ]},
  { group: '仓储作业', items: [
    { id: 'inbound', label: '入库管理', icon: '↓' },
    { id: 'transfer', label: '库内移库', icon: '⇄' },
    { id: 'inventory', label: '库存查询', icon: '▦' },
    { id: 'stocktake', label: '盘点管理', icon: '☑' },
    { id: 'alert', label: '库存预警', icon: '⚠' },
    { id: 'outbound', label: '出库管理', icon: '↑' },
  ]},
  { group: '生产与关务', items: [
    { id: 'production', label: '生产/完工', icon: '⚙' },
    { id: 'customs', label: '关务保税', icon: '★' },
    { id: 'ocr', label: 'OCR识别', icon: '⌘' },
  ]},
  { group: '系统', items: [
    { id: 'integration', label: '对外对接', icon: '⛓' },
    { id: 'audit', label: '操作日志', icon: '≡' },
  ]},
];

const PAGE_TITLE = {
  dashboard: '可视化驾驶舱',
  architecture: '系统架构',
  warehouses: '基础数据 / 仓库管理',
  stacks: '基础数据 / 堆位管理',
  materials: '基础数据 / 物料档案',
  partners: '基础数据 / 往来主体',
  bonded: '基础数据 / 保税账册',
  settings: '系统设置 / 权限与参数',
  inbound: '入库管理',
  transfer: '库内移库管理',
  inventory: '库存精细化 / 多维查询',
  stocktake: '库存精细化 / 盘点',
  alert: '库存精细化 / 预警',
  production: '生产 / 完工流转',
  outbound: '出库管理',
  customs: '关务保税监管',
  ocr: 'OCR 单据识别',
  integration: '系统对外对接',
  audit: '操作日志',
};

const ROLE_MAP = {
  warehouse: { name: '仓管员', short: '仓', customs: false },
  customs: { name: '关务员（海关专用）', short: '关', customs: true },
  admin: { name: '系统管理员', short: '管', customs: false },
  production: { name: '生产员', short: '生', customs: false },
};

/** 各角色可见菜单（null = 全部）；对齐项目设计 §3 角色权限 */
const ROLE_PAGES = {
  admin: null,
  warehouse: ['dashboard', 'inbound', 'transfer', 'inventory', 'stocktake', 'alert', 'outbound'],
  customs: ['customs', 'bonded', 'audit'],
  production: ['production', 'inventory', 'inbound'],
};

const ROLE_DEFAULT_PAGE = {
  admin: 'dashboard',
  warehouse: 'dashboard',
  customs: 'customs',
  production: 'production',
};

const ROLE_ORDER = ['admin', 'warehouse', 'customs', 'production'];
const ROLE_PAGES_KEY = 'wms_role_pages';
const ROLE_PERM_HINTS = {
  admin: '管理员默认可访问全部模块，可按需收窄菜单。',
  warehouse: '仓管员负责入出库、移库、盘点与日常库存查询。',
  customs: '关务员使用海关专用账号，菜单、数据与审计与业务账号隔离。',
  production: '生产员负责投料、加工过程与完工入库登记。',
};

let currentRole = null;
let rolePermEditing = null;

function loadRolePages() {
  try {
    const raw = localStorage.getItem(ROLE_PAGES_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (!parsed || typeof parsed !== 'object') return;
    ROLE_ORDER.forEach((key) => {
      if (parsed[key] === null) ROLE_PAGES[key] = null;
      else if (Array.isArray(parsed[key])) ROLE_PAGES[key] = parsed[key];
    });
  } catch { /* empty */ }
}

function persistRolePages() {
  localStorage.setItem(ROLE_PAGES_KEY, JSON.stringify(ROLE_PAGES));
}

function allMenuPageIds() {
  return NAV.flatMap((g) => g.items.map((it) => it.id)).filter((id) => !HIDDEN_PAGES.has(id));
}

function roleHasPage(roleKey, pageId) {
  const allowed = ROLE_PAGES[roleKey];
  return !allowed || allowed.includes(pageId);
}

function toggleRolePermGroup(groupIdx, checked) {
  document.querySelectorAll(`#rolePermTree [data-perm-group="${groupIdx}"]`).forEach((el) => {
    el.checked = checked;
  });
}

function syncRolePermGroupChecks() {
  document.querySelectorAll('#rolePermTree .perm-group').forEach((group) => {
    const boxes = [...group.querySelectorAll('[data-perm-page]')];
    const head = group.querySelector('[data-perm-group]');
    if (!head || !boxes.length) return;
    head.checked = boxes.every((b) => b.checked);
    head.indeterminate = !head.checked && boxes.some((b) => b.checked);
  });
}

function openRolePermModal(roleKey) {
  const role = ROLE_MAP[roleKey];
  if (!role) return;
  rolePermEditing = roleKey;
  const title = document.getElementById('rolePermTitle');
  if (title) title.textContent = `配置权限 · ${role.name}`;
  const anno = document.getElementById('rolePermAnno');
  if (anno) {
    anno.innerHTML = `<strong>权限矩阵</strong>${ROLE_PERM_HINTS[roleKey] || ''}勾选该角色可见菜单；保存后侧栏按此过滤。`;
  }
  const tree = document.getElementById('rolePermTree');
  if (tree) {
    tree.innerHTML = NAV.map((g, gi) => {
      const items = g.items.filter((it) => !HIDDEN_PAGES.has(it.id));
      if (!items.length) return '';
      const boxes = items.map((it) => `
        <label class="perm-item">
          <input type="checkbox" data-perm-page="${it.id}" ${roleHasPage(roleKey, it.id) ? 'checked' : ''} />
          <span>${it.label}</span>
        </label>`).join('');
      return `<div class="perm-group">
        <label class="perm-group-hd">
          <input type="checkbox" data-perm-group="${gi}" onchange="toggleRolePermGroup(${gi}, this.checked)" />
          <span>${g.group}</span>
        </label>
        <div class="perm-group-bd">${boxes}</div>
      </div>`;
    }).join('');
    tree.querySelectorAll('[data-perm-page]').forEach((el) => {
      el.addEventListener('change', syncRolePermGroupChecks);
    });
    syncRolePermGroupChecks();
  }
  openModal('modalRolePerm');
}

function saveRolePerms() {
  if (!rolePermEditing) return;
  const selected = [...document.querySelectorAll('#rolePermTree [data-perm-page]:checked')].map((el) => el.dataset.permPage);
  if (!selected.length) {
    toast('请至少勾选一个菜单模块', 'warn');
    return;
  }
  const allIds = allMenuPageIds();
  ROLE_PAGES[rolePermEditing] = selected.length >= allIds.length ? null : selected;
  persistRolePages();
  if (currentRole === rolePermEditing) renderNav();
  closeModal('modalRolePerm');
  toast(`${ROLE_MAP[rolePermEditing].name} 权限已保存`, 'ok');
}

function canAccessPage(pageId, roleKey) {
  if (HIDDEN_PAGES.has(pageId)) return false;
  const allowed = ROLE_PAGES[roleKey ?? currentRole];
  return !allowed || allowed.includes(pageId);
}

function renderNav() {
  const roleKey = currentRole || 'admin';
  const allowed = ROLE_PAGES[roleKey];
  const el = document.getElementById('sideNav');
  el.innerHTML = NAV.map((g) => {
    const items = g.items.filter((it) => !HIDDEN_PAGES.has(it.id) && (!allowed || allowed.includes(it.id)));
    if (!items.length) return '';
    const itemsHtml = items.map((it) =>
      `<div class="nav-item" data-page="${it.id}" onclick="go('${it.id}')">
        <span class="icon">${it.icon}</span><span>${it.label}</span>
      </div>`
    ).join('');
    return `<div class="nav-group-title">${g.group}</div>${itemsHtml}`;
  }).join('');
}

function go(pageId) {
  if (currentRole && !canAccessPage(pageId, currentRole)) {
    toast('当前角色无权访问该页面', 'warn');
    return;
  }
  document.querySelectorAll('.page').forEach((p) => p.classList.toggle('active', p.dataset.page === pageId));
  document.querySelectorAll('.nav-item').forEach((n) => n.classList.toggle('active', n.dataset.page === pageId));
  document.getElementById('breadcrumb').innerHTML = `<strong>${PAGE_TITLE[pageId] || pageId}</strong>`;
  const content = document.querySelector('.content');
  content.scrollTop = 0;
  const isCockpit = pageId === 'dashboard';
  document.getElementById('app').classList.toggle('cockpit-mode', isCockpit);
  content.classList.toggle('cockpit-on', isCockpit);
  if (isCockpit) initCockpit();
  else stopCockpit();
  if (pageId === 'stacks') { renderStackTable(); applyLocationFilter(); }
  if (pageId === 'warehouses') renderWarehouseTable();
  if (pageId === 'inbound') renderInboundTable();
  if (pageId === 'materials') {
    renderMaterialTable();
    renderSourceFilingTable();
  }
  if (pageId === 'settings') initSysParamsForm();
  if (pageId === 'alert') renderAlertPage();
  renderAnnoPins();
  highlightActiveAnnoPin();
}

function defaultWarehouseFilter() {
  return WAREHOUSES[0]?.filter || '1仓';
}

function currentWarehouse() {
  const key = sessionStorage.getItem('wms_wh') || defaultWarehouseFilter();
  return WAREHOUSES.find((w) => w.filter === key) || WAREHOUSES[0];
}

function goWarehouse(whId, stackCode) {
  const wh = WAREHOUSES.find((w) => w.id === whId);
  if (!wh) return;
  sessionStorage.setItem('wms_wh', wh.filter);
  if (stackCode) sessionStorage.setItem('wms_stack', stackCode);
  else sessionStorage.removeItem('wms_stack');
  go('stacks');
  toast(`已进入 ${wh.name}${stackCode ? ' · ' + stackCode : ''}`, 'ok');
}

function onWarehouseFilterChange() {
  const sel = document.getElementById('filterWarehouse');
  if (!sel) return;
  sessionStorage.setItem('wms_wh', sel.value || defaultWarehouseFilter());
  sessionStorage.removeItem('wms_stack');
  renderStackTable();
  applyLocationFilter();
}

function applyLocationFilter() {
  let whKey = sessionStorage.getItem('wms_wh');
  if (!whKey || !WAREHOUSES.some((w) => w.filter === whKey)) {
    whKey = defaultWarehouseFilter();
    sessionStorage.setItem('wms_wh', whKey);
  }
  const stack = sessionStorage.getItem('wms_stack');
  const sel = document.getElementById('filterWarehouse');
  const hint = document.getElementById('locationFilterHint');
  const wh = currentWarehouse();
  if (sel) sel.value = whKey;
  if (hint) {
    hint.hidden = false;
    hint.innerHTML = `本页仅支持<strong>单仓库</strong>展示，默认第一个仓库。当前：<strong>${whKey}</strong>（共 ${WAREHOUSES.length} 个仓库可选）${stack ? ` · 定位堆位 <strong>${stack}</strong>` : ''}。平面图保存后可在驾驶舱点击该仓模型查看。`;
  }
  document.querySelectorAll('#stackTableBody tr').forEach((row) => {
    row.classList.remove('row-highlight');
    const rowCode = row.dataset.code || row.cells[0]?.textContent.trim();
    if (stack && rowCode === stack) row.classList.add('row-highlight');
  });
  const pag = document.getElementById('stackPagination');
  if (pag && wh) pag.textContent = `共 ${wh.stacks.length} 条堆位（${wh.name}）`;
}

function clearLocationFilter() {
  sessionStorage.setItem('wms_wh', defaultWarehouseFilter());
  sessionStorage.removeItem('wms_stack');
  renderStackTable();
  applyLocationFilter();
  toast('已回到默认仓库');
}

function applyRole(roleKey) {
  const role = ROLE_MAP[roleKey];
  if (!role) return;
  currentRole = roleKey;
  const loginRole = document.getElementById('loginRole');
  if (loginRole) loginRole.value = roleKey;
  document.getElementById('userAvatar').textContent = role.short;
  const badge = document.getElementById('roleBadge');
  const label = document.getElementById('roleBadgeLabel');
  if (label) label.textContent = role.name;
  else if (badge) badge.textContent = role.name;
  badge.classList.toggle('customs', role.customs);
  updateRoleMenuActive();
  renderNav();
  const activePage = document.querySelector('.page.active')?.dataset.page;
  if (!activePage || !canAccessPage(activePage, roleKey)) {
    go(ROLE_DEFAULT_PAGE[roleKey] || 'dashboard');
  } else {
    document.querySelectorAll('.nav-item').forEach((n) => {
      n.classList.toggle('active', n.dataset.page === activePage);
    });
  }
}

function initRoleSwitcher() {
  const menu = document.getElementById('roleMenu');
  if (!menu || menu.dataset.ready) return;
  menu.innerHTML = ROLE_ORDER.map((key) => {
    const r = ROLE_MAP[key];
    return `<button type="button" class="role-menu-item${r.customs ? ' customs' : ''}" data-role="${key}" role="menuitem" onclick="selectRole('${key}')">
      <span class="role-menu-short">${r.short}</span><span>${r.name}</span>
    </button>`;
  }).join('');
  menu.dataset.ready = '1';
  updateRoleMenuActive();
}

function updateRoleMenuActive() {
  document.querySelectorAll('.role-menu-item').forEach((el) => {
    el.classList.toggle('active', el.dataset.role === currentRole);
  });
}

const AUTH_SESSION_KEY = 'wms_auth';

function readAuthSession() {
  try {
    const raw = sessionStorage.getItem(AUTH_SESSION_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || !ROLE_MAP[data.roleKey]) return null;
    return {
      roleKey: data.roleKey,
      user: String(data.user || 'admin').trim() || 'admin',
    };
  } catch {
    return null;
  }
}

function writeAuthSession(roleKey, user) {
  sessionStorage.setItem(AUTH_SESSION_KEY, JSON.stringify({
    roleKey,
    user: user || 'admin',
    at: Date.now(),
  }));
}

function clearAuthSession() {
  sessionStorage.removeItem(AUTH_SESSION_KEY);
}

function selectRole(roleKey) {
  if (roleKey === currentRole) return;
  applyRole(roleKey);
  const user = document.getElementById('userName')?.textContent?.trim() || 'admin';
  writeAuthSession(roleKey, user);
  toast(`已切换为 ${ROLE_MAP[roleKey].name}`, 'ok');
}

function doLogin(opts = {}) {
  const silent = !!opts.silent;
  const roleKey = opts.roleKey || document.getElementById('loginRole').value;
  const user = (opts.user != null
    ? String(opts.user).trim()
    : document.getElementById('loginUser').value.trim()) || 'admin';
  if (!ROLE_MAP[roleKey]) return;

  document.getElementById('loginRole').value = roleKey;
  document.getElementById('loginUser').value = user;
  document.getElementById('loginPage').style.display = 'none';
  document.getElementById('app').classList.add('show');
  document.getElementById('userName').textContent = user;
  applyRole(roleKey);
  writeAuthSession(roleKey, user);
  initAnnotations();
  go(ROLE_DEFAULT_PAGE[roleKey] || 'dashboard');
  if (!silent) toast('登录成功', 'ok');
}

function doLogout() {
  currentRole = null;
  clearAuthSession();
  stopCockpit();
  const tip = document.getElementById('ckTip');
  if (tip) tip.hidden = true;
  document.getElementById('app').classList.remove('show', 'cockpit-mode');
  document.querySelector('.content').classList.remove('cockpit-on');
  document.getElementById('loginPage').style.display = 'flex';
}

function restoreAuthSession() {
  const session = readAuthSession();
  if (!session) return false;
  doLogin({ roleKey: session.roleKey, user: session.user, silent: true });
  return true;
}

function openModal(id) {
  document.getElementById(id).classList.add('show');
  document.body.style.overflow = 'hidden';
}

function closeModal(id) {
  document.getElementById(id).classList.remove('show');
  if (id === 'modalAnno') {
    annoState.pendingPos = null;
    annoState.editingId = null;
  }
  if (!document.querySelector('.modal-mask.show')) {
    document.body.style.overflow = '';
  }
}

function saveAndClose(id) {
  closeModal(id);
  toast('已保存（原型演示）', 'ok');
}

function openBatchTransferModal() {
  openModal('modalBatchTransfer');
  updateBatchTransferCount();
}

function toggleBatchTransferAll(input) {
  document.querySelectorAll('#batchTransferBody .batch-transfer-check').forEach((cb) => {
    cb.checked = input?.checked;
  });
  updateBatchTransferCount();
}

function updateBatchTransferCount() {
  const checks = document.querySelectorAll('#batchTransferBody .batch-transfer-check');
  const selected = document.querySelectorAll('#batchTransferBody .batch-transfer-check:checked').length;
  const countEl = document.getElementById('batchTransferSelCount');
  if (countEl) countEl.textContent = `已选 ${selected} 票原料单`;
  const allEl = document.getElementById('batchTransferAll');
  if (allEl && checks.length) {
    allEl.checked = selected === checks.length;
    allEl.indeterminate = selected > 0 && selected < checks.length;
  }
}

function saveBatchTransfer() {
  const selected = document.querySelectorAll('#batchTransferBody .batch-transfer-check:checked');
  if (!selected.length) {
    toast('请至少勾选一票原料单', 'warn');
    return;
  }
  closeModal('modalBatchTransfer');
  toast(`批量移库已提交（${selected.length} 票原料单）`, 'ok');
}

/* ===== 原料投料出库 · 列表筛选 ===== */
const FEED_MATERIAL_LIST = [
  { id: 'feed-1', customs: 'BG20260728041', material: '原料物料-A', country: '秘鲁', stack: '1#A1', available: 2549.12, feedDry: 80, checked: true },
  { id: 'feed-2', customs: 'BG20260801022', material: '原料物料-B', country: '智利', stack: '1#A2', available: 1582.71, feedDry: 70, checked: true },
  { id: 'feed-3', customs: 'BG20260715033', material: '原料物料-A', country: '秘鲁', stack: '2#A1', available: 899.17, feedDry: 50, checked: true },
  { id: 'feed-4', customs: 'BG20260612018', material: '原料物料-B', country: '智利', stack: '2#A2', available: 620.5, feedDry: '', checked: false },
  { id: 'feed-5', customs: 'BG20260508007', material: '原料物料-C', country: '澳大利亚', stack: '1#B1', available: 430.0, feedDry: '', checked: false },
];

function initFeedMaterialFilters() {
  const matSel = document.getElementById('feedFilterMaterial');
  const countrySel = document.getElementById('feedFilterCountry');
  if (matSel) {
    const materials = [...new Set(FEED_MATERIAL_LIST.map((r) => r.material))];
    matSel.innerHTML = '<option value="">全部物料</option>' + materials.map((m) => `<option value="${m}">${m}</option>`).join('');
  }
  if (countrySel) {
    const countries = [...new Set(FEED_MATERIAL_LIST.map((r) => r.country))];
    countrySel.innerHTML = '<option value="">全部国家</option>' + countries.map((c) => `<option value="${c}">${c}</option>`).join('');
  }
}

function renderFeedMaterialRows(rows = FEED_MATERIAL_LIST) {
  const tbody = document.getElementById('feedMaterialBody');
  if (!tbody) return;
  tbody.innerHTML = rows.map((r) => `
    <tr class="feed-material-row" data-id="${r.id}" data-customs="${r.customs}" data-material="${r.material}" data-country="${r.country}" data-stack="${r.stack}">
      <td><input type="checkbox" class="feed-material-check" ${r.checked ? 'checked' : ''} onchange="updateFeedSelectedCount()" /></td>
      <td>${r.customs}</td>
      <td>${r.material}</td>
      <td>${r.country}</td>
      <td><strong>${r.stack}</strong></td>
      <td>${r.available.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
      <td><input class="input feed-dry-input" style="width:90px" value="${r.feedDry ?? ''}" placeholder="干重" /></td>
    </tr>
  `).join('');
  updateFeedFilterSummary(rows.length, FEED_MATERIAL_LIST.length);
  updateFeedSelectedCount();
}

function updateFeedFilterSummary(visible, total) {
  const el = document.getElementById('feedFilterSummary');
  if (el) el.textContent = `显示 ${visible} / ${total} 条`;
}

function filterFeedMaterialRows() {
  const customs = document.getElementById('feedFilterCustoms')?.value?.trim().toLowerCase() || '';
  const material = document.getElementById('feedFilterMaterial')?.value || '';
  const country = document.getElementById('feedFilterCountry')?.value || '';
  const stack = document.getElementById('feedFilterStack')?.value?.trim().toLowerCase() || '';
  const filtered = FEED_MATERIAL_LIST.filter((r) => {
    if (customs && !r.customs.toLowerCase().includes(customs)) return false;
    if (material && r.material !== material) return false;
    if (country && r.country !== country) return false;
    if (stack && !r.stack.toLowerCase().includes(stack)) return false;
    return true;
  });
  renderFeedMaterialRows(filtered);
}

function resetFeedMaterialFilter() {
  const set = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.value = val;
  };
  set('feedFilterCustoms', '');
  set('feedFilterMaterial', '');
  set('feedFilterCountry', '');
  set('feedFilterStack', '');
  renderFeedMaterialRows();
}

function updateFeedSelectedCount() {
  const selected = document.querySelectorAll('#feedMaterialBody .feed-material-check:checked').length;
  const el = document.getElementById('feedSelectedCount');
  if (el) el.value = `${selected} 票`;
}

function openFeedModal() {
  populateConsignorSelects();
  resetFeedMaterialFilter();
  openModal('modalFeed');
}

/* ===== OCR 识别回填（原型演示） ===== */
const OCR_SAMPLES = {
  inbound_bl: {
    ship: '海洋之星',
    bl: 'BL20260801001',
    customs: 'BG20260801088',
    hz: 'HZ20260801012',
    amount: '1280000',
    currency: 'USD',
    arrival: '2026-08-05',
    material: '原料物料-A（达标矿·秘鲁）',
    preview: '提单 BL20260801001.pdf',
  },
  inbound_customs: {
    ship: '海豚号',
    bl: 'BL20260804002',
    customs: 'BG20260804088',
    hz: 'HZ20260804012',
    amount: '218000',
    currency: 'USD',
    arrival: '2026-08-06',
    material: '原料物料-A（达标矿·秘鲁）',
    preview: '入库报关单 BG20260804088.pdf',
  },
  receive_weight: {
    wet: '820',
    dry: '738',
    moisture: '10.0%',
    preview: '重量单 WGT-20260803.pdf',
  },
  receive_quality: {
    docNo: 'QA-20260803-001',
    moisture: '10.0%',
    material: '原料物料-A',
    preview: '品质检验证书 QA-20260803.pdf',
    elements: {
      Cu: '22.5%',
      Ag: '45 g/t',
      Au: '0.8 g/t',
      As: '0.12%',
      Pb: '0.05%',
      Cd: '0.01%',
      F: '0.02%',
      Hg: '0.001%',
    },
  },
  outbound_customs: {
    customs: 'BGCK2026080301',
    hz: 'HZCK2026080301',
    consignee: '华东冶炼股份公司',
    weight: '100',
    batch: 'FL-20260803 成品物料-A',
    material: '成品物料-A',
    preview: '出库报关单 BGCK2026080301.pdf',
  },
};

const ocrState = { target: null, docType: null, lastData: null };

function setOcrStatus(id, text, state) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = text;
  el.classList.remove('is-ok', 'is-busy');
  if (state) el.classList.add(state);
}

function setInputValue(id, val) {
  const el = document.getElementById(id);
  if (el && val != null && val !== '') el.value = val;
}

function selectOptionByText(selectId, text) {
  const sel = document.getElementById(selectId);
  if (!sel || !text) return;
  const opt = Array.from(sel.options).find((o) => o.text.includes(text) || text.includes(o.text.split('（')[0]));
  if (opt) sel.value = opt.value;
}

function simulateOcr(label, onDone) {
  toast('OCR 识别中…', 'warn');
  setTimeout(onDone, 900);
}

function applyInboundOcr(data) {
  populateInboundMaterials();
  setInputValue('ibShip', data.ship);
  setInputValue('ibBl', data.bl);
  setInputValue('ibArrival', data.arrival);
  setInputValue('ibCustoms', data.customs);
  setInputValue('ibHz', data.hz);
  setInputValue('ibAmount', data.amount);
  const currencySel = document.getElementById('ibCurrency');
  if (currencySel) currencySel.value = data.currency || 'CNY';
  selectOptionByText('ibMaterial', data.material);
  syncInboundFiling();
  setOcrStatus('ibOcrStatus', `已识别：${data.preview || '提单/报关单'} → 字段已回填`, 'is-ok');
}

function applyReceiveWeightOcr(data) {
  setInputValue('rcWet', data.wet);
  setInputValue('rcDry', data.dry);
  setInputValue('rcMoisture', data.moisture);
  setOcrStatus('rcWeightOcrStatus', `重量单已识别：湿重 ${data.wet}t / 干重 ${data.dry}t`, 'is-ok');
}

function applyReceiveQualityOcr(data) {
  const elements = data.elements || (data.cu ? { Cu: data.cu } : {});
  renderReceiveQualityFields(elements);
  setInputValue('rcMoisture', data.moisture);
  setInputValue('rcQualityNo', data.docNo);
  setOcrStatus('rcQualityOcrStatus', buildQualityOcrStatus(data), 'is-ok');
}

function applyOutboundOcr(data) {
  setInputValue('obCustoms', data.customs);
  setInputValue('obHz', data.hz);
  setInputValue('obWeight', data.weight);
  selectOptionByText('obConsignee', data.consignee);
  selectOptionByText('obBatch', data.batch);
  setOcrStatus('obOcrStatus', `已识别：${data.preview || '出库报关单'} → 字段已回填`, 'is-ok');
}

function runOutboundOcr(fileName) {
  const label = fileName ? `出库报关单 ${fileName}` : '出库报关单';
  setOcrStatus('obOcrStatus', `正在识别${label}…`, 'is-busy');
  ocrState.target = 'outbound';
  ocrState.docType = 'customs';
  simulateOcr(label, () => {
    const data = { ...OCR_SAMPLES.outbound_customs, preview: fileName || OCR_SAMPLES.outbound_customs.preview };
    ocrState.lastData = data;
    applyOutboundOcr(data);
    toast('出库报关单 OCR 完成，字段已回填', 'ok');
  });
}

function onOutboundOcrUpload(input) {
  const file = input?.files?.[0];
  if (!file) return;
  runOutboundOcr(file.name);
  input.value = '';
}

function openInboundModal() {
  populateConsignorSelects();
  populateInboundMaterials();
  syncInboundFiling();
  openModal('modalInbound');
  const sel = document.querySelector('#modalInbound [data-consignor-select]');
  if (sel) {
    const opt = Array.from(sel.options).find((o) => o.text.includes('南国铜业') || o.value.includes('南国铜业'));
    if (opt) sel.value = opt.value;
  }
  setOcrStatus('ibOcrStatus', '上传提单或报关单影像，自动识别并回填下方字段');
  const currencySel = document.getElementById('ibCurrency');
  if (currencySel) currencySel.value = 'CNY';
}

function openOutboundModal() {
  openModal('modalOutbound');
  const sel = document.querySelector('#modalOutbound [data-consignor-select]');
  if (sel) {
    const opt = Array.from(sel.options).find((o) => o.text.includes('南国铜业'));
    if (opt) sel.value = opt.value;
  }
  setOcrStatus('obOcrStatus', '上传出库报关单影像，自动识别并回填报关单号、核注清单号、流向企业与重量');
}

function formatOutboundShortTime(d = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function getOutboundRow(el) {
  return el?.closest?.('tr[data-outbound-id]');
}

function renderOutboundOps(row) {
  const ops = row.querySelector('.ops');
  if (!ops) return;
  const status = row.dataset.status;
  const parts = [];
  if (status === 'pending') {
    parts.push('<button class="btn-text" onclick="approveOutbound(this)">审核</button>');
    parts.push('<button class="btn-text" onclick="openOutboundModal();runOutboundOcr()">OCR</button>');
  } else if (status === 'approved') {
    parts.push('<button class="btn-text" onclick="completeOutbound(this)">出库完成</button>');
    parts.push('<button class="btn-text" onclick="openOutboundModal();runOutboundOcr()">OCR</button>');
  }
  parts.push('<button class="btn-text">详情</button>');
  ops.innerHTML = parts.join('');
}

function approveOutbound(btn) {
  const row = getOutboundRow(btn);
  if (!row || row.dataset.status !== 'pending') return;
  row.dataset.status = 'approved';
  const tagCell = row.cells[7];
  if (tagCell) tagCell.innerHTML = '<span class="tag tag-orange">已审核</span>';
  renderOutboundOps(row);
  toast(`出库单 ${row.dataset.outboundId} 审核通过`, 'ok');
}

function completeOutbound(btn) {
  const row = getOutboundRow(btn);
  if (!row || row.dataset.status !== 'approved') {
    toast('仅已审核状态的出库单可执行出库完成', 'warn');
    return;
  }
  const now = new Date();
  const outAt = formatOutboundShortTime(now);
  const finishAt = formatOutboundShortTime(new Date(now.getTime() + 5 * 60 * 1000));
  const timesCell = row.querySelector('.outbound-times');
  if (timesCell) timesCell.textContent = `${outAt} / ${finishAt}`;
  row.dataset.status = 'completed';
  const tagCell = row.cells[7];
  if (tagCell) tagCell.innerHTML = '<span class="tag tag-green">已出库</span>';
  renderOutboundOps(row);
  toast(`出库单 ${row.dataset.outboundId} 已完成 · 完成时间 ${finishAt}`, 'ok');
}

function saveOutbound() {
  const customs = document.getElementById('obCustoms')?.value?.trim();
  const hz = document.getElementById('obHz')?.value?.trim();
  const weight = document.getElementById('obWeight')?.value?.trim();
  const consignee = document.getElementById('obConsignee')?.value?.trim();
  if (!customs || !hz) {
    toast('请先上传并 OCR 识别出库报关单，回填报关单号与核注清单号', 'warn');
    return;
  }
  if (!weight || !consignee) {
    toast('请填写出库重量与流向企业（可通过 OCR 回填）', 'warn');
    return;
  }
  closeModal('modalOutbound');
  toast('出库单已提交审核（原型演示）', 'ok');
}

function runInboundOcr(docType) {
  const key = docType === 'customs' ? 'inbound_customs' : 'inbound_bl';
  const label = docType === 'customs' ? '报关单' : '提单';
  setOcrStatus('ibOcrStatus', `正在识别${label}…`, 'is-busy');
  ocrState.target = 'inbound';
  ocrState.docType = docType;
  simulateOcr(label, () => {
    const data = OCR_SAMPLES[key];
    ocrState.lastData = data;
    applyInboundOcr(data);
    toast(`${label} OCR 完成，字段已回填`, 'ok');
  });
}

function runReceiveOcr(docType) {
  const key = docType === 'quality' ? 'receive_quality' : 'receive_weight';
  const label = docType === 'quality' ? '品质证书' : '重量单';
  const statusId = docType === 'quality' ? 'rcQualityOcrStatus' : 'rcWeightOcrStatus';
  setOcrStatus(statusId, `正在识别${label}…`, 'is-busy');
  ocrState.target = 'receive';
  ocrState.docType = docType;
  simulateOcr(label, () => {
    const base = OCR_SAMPLES[key];
    const data = docType === 'quality'
      ? { ...base, elements: buildQualityOcrSample(base.elements) }
      : base;
    ocrState.lastData = data;
    if (docType === 'quality') applyReceiveQualityOcr(data);
    else applyReceiveWeightOcr(data);
    toast(`${label} OCR 完成，字段已回填`, 'ok');
  });
}

function configureOcrModalFields(target) {
  const showQuality = target === 'receive-quality' || target === 'receive';
  const fields = {
    ocrDocNo: target === 'inbound' || target === 'outbound' ? false : target !== 'receive-weight',
    ocrMaterial: target !== 'inbound' && target !== 'outbound',
    ocrMoisture: target !== 'inbound' && target !== 'outbound',
    ocrWet: target === 'receive-weight' || target === 'receive',
    ocrDry: target === 'receive-weight' || target === 'receive' || target === 'outbound',
    ocrShip: target === 'inbound',
    ocrBl: target === 'inbound',
    ocrCustoms: target === 'inbound' || target === 'outbound',
    ocrHz: target === 'inbound' || target === 'outbound',
    ocrConsignee: target === 'outbound',
  };
  Object.entries(fields).forEach(([id, show]) => {
    const group = document.getElementById(id)?.closest('.form-group');
    if (group) group.classList.toggle('ocr-field-hidden', !show);
  });
  const qualityWrap = document.getElementById('ocrQualityWrap');
  if (qualityWrap) qualityWrap.classList.toggle('ocr-field-hidden', !showQuality);
}

function fillOcrModalFromData(target, data) {
  if (!data) return;
  if (target === 'inbound') {
    setInputValue('ocrShip', data.ship);
    setInputValue('ocrBl', data.bl);
    setInputValue('ocrCustoms', data.customs);
    setInputValue('ocrHz', data.hz);
    document.getElementById('ocrPreviewName').textContent = data.preview || '单据预览';
    document.getElementById('ocrPreviewHint').textContent = '提单 / 报关单影像（示意）';
  } else if (target === 'outbound') {
    setInputValue('ocrCustoms', data.customs);
    setInputValue('ocrHz', data.hz);
    setInputValue('ocrConsignee', data.consignee);
    setInputValue('ocrDry', data.weight);
    document.getElementById('ocrPreviewName').textContent = data.preview || '出库报关单预览';
    document.getElementById('ocrPreviewHint').textContent = '出库报关单影像（示意）';
  } else if (target === 'receive-weight') {
    setInputValue('ocrWet', data.wet);
    setInputValue('ocrDry', data.dry);
    setInputValue('ocrMoisture', data.moisture);
    document.getElementById('ocrPreviewName').textContent = data.preview || '重量单预览';
    document.getElementById('ocrPreviewHint').textContent = '重量单影像（示意）';
  } else if (target === 'receive-quality') {
    setInputValue('ocrDocNo', data.docNo);
    setInputValue('ocrMaterial', data.material);
    renderOcrQualityFields(data.elements || buildQualityOcrSample());
    setInputValue('ocrMoisture', data.moisture);
    document.getElementById('ocrPreviewName').textContent = data.preview || '品质证书预览';
    document.getElementById('ocrPreviewHint').textContent = '品质证书影像（示意）';
  } else if (target === 'receive') {
    setInputValue('ocrWet', data.wet);
    setInputValue('ocrDry', data.dry);
    setInputValue('ocrMoisture', data.moisture);
    renderOcrQualityFields(data.elements || buildQualityOcrSample());
    setInputValue('ocrDocNo', data.docNo);
    setInputValue('ocrMaterial', data.material);
    document.getElementById('ocrPreviewName').textContent = data.preview || '收货单据预览';
    document.getElementById('ocrPreviewHint').textContent = '重量单 / 品质证书影像（示意）';
  }
}

function openOcrModal(target) {
  ocrState.target = target || 'receive';
  const titles = {
    inbound: 'OCR 识别结果 · 入库预约（提单/报关单）',
    outbound: 'OCR 识别结果 · 出库报关单',
    receive: 'OCR 识别结果 · 收货登记',
    'receive-weight': 'OCR 识别结果 · 重量单',
    'receive-quality': 'OCR 识别结果 · 品质证书',
  };
  document.getElementById('ocrModalTitle').textContent = titles[target] || titles.receive;
  configureOcrModalFields(target);
  let data = ocrState.lastData;
  if (!data) {
    if (target === 'inbound') data = OCR_SAMPLES.inbound_bl;
    else if (target === 'outbound') data = OCR_SAMPLES.outbound_customs;
    else if (target === 'receive-quality') {
      data = { ...OCR_SAMPLES.receive_quality, elements: buildQualityOcrSample() };
    } else if (target === 'receive-weight') data = OCR_SAMPLES.receive_weight;
    else {
      data = {
        ...OCR_SAMPLES.receive_weight,
        ...OCR_SAMPLES.receive_quality,
        elements: buildQualityOcrSample(),
      };
    }
  }
  fillOcrModalFromData(target, data);
  openModal('modalOcr');
}

function applyOcrModal() {
  const target = ocrState.target || 'receive';
  if (target === 'inbound') {
    applyInboundOcr({
      ship: document.getElementById('ocrShip')?.value,
      bl: document.getElementById('ocrBl')?.value,
      customs: document.getElementById('ocrCustoms')?.value,
      hz: document.getElementById('ocrHz')?.value,
      arrival: document.getElementById('ibArrival')?.value || OCR_SAMPLES.inbound_bl.arrival,
      amount: OCR_SAMPLES.inbound_bl.amount,
      currency: OCR_SAMPLES.inbound_bl.currency,
      material: OCR_SAMPLES.inbound_bl.material,
      preview: document.getElementById('ocrPreviewName')?.textContent,
    });
  } else if (target === 'outbound') {
    applyOutboundOcr({
      customs: document.getElementById('ocrCustoms')?.value,
      hz: document.getElementById('ocrHz')?.value,
      consignee: document.getElementById('ocrConsignee')?.value,
      weight: document.getElementById('ocrDry')?.value,
      batch: OCR_SAMPLES.outbound_customs.batch,
      preview: document.getElementById('ocrPreviewName')?.textContent,
    });
  } else {
    applyReceiveWeightOcr({
      wet: document.getElementById('ocrWet')?.value,
      dry: document.getElementById('ocrDry')?.value,
      moisture: document.getElementById('ocrMoisture')?.value,
    });
    applyReceiveQualityOcr({
      docNo: document.getElementById('ocrDocNo')?.value,
      elements: getOcrQualityValues(),
      moisture: document.getElementById('ocrMoisture')?.value,
      material: document.getElementById('ocrMaterial')?.value,
    });
  }
  closeModal('modalOcr');
  toast('OCR 字段已回填并归档', 'ok');
}

function saveInbound() {
  const ship = document.getElementById('ibShip')?.value?.trim();
  const bl = document.getElementById('ibBl')?.value?.trim();
  if (!ship || !bl) {
    toast('请填写船名与提单号，或使用 OCR 识别回填', 'warn');
    return;
  }
  closeModal('modalInbound');
  toast('入库预约已提交（原型演示）', 'ok');
}

/* ===== 矿源备案 · 系统参数 · 入库扣减 ===== */
const SYS_PARAMS_KEY = 'wms_sys_params';
const SOURCE_FILINGS_KEY = 'wms_source_filings';

const DEFAULT_QUALITY_PARAMS = [
  { code: 'Cu', name: '铜', required: true },
  { code: 'Ag', name: '银', required: false },
  { code: 'Au', name: '金', required: false },
  { code: 'As', name: '砷', required: false },
  { code: 'Pb', name: '铅', required: false },
  { code: 'Cd', name: '镉', required: false },
  { code: 'F', name: '氟', required: false },
  { code: 'Hg', name: '汞', required: false },
];

const DEFAULT_SYS_PARAMS = {
  capAlertPct: 70,
  agingDays: 90,
  filingUsageAlertPct: 80,
  qualityParams: DEFAULT_QUALITY_PARAMS.map((p) => ({ ...p })),
};

const DEFAULT_SOURCE_FILINGS = [
  { code: 'JG4-2025-KY02', source: '澳洲精矿', country: '澳大利亚', date: '2025-01-15', quotaDmt: 10000, usedDmt: 8200 },
  { code: 'JG4-2024-KY01', source: '澳洲精矿', country: '澳大利亚', date: '2024-06-01', quotaDmt: 8000, usedDmt: 8000 },
  { code: 'JG-2023-KY04', source: '智利精矿', country: '智利', date: '2023-03-20', quotaDmt: 30000, usedDmt: 19637.76 },
  { code: 'JG-2022-KY03', source: '智利精矿', country: '智利', date: '2022-08-10', quotaDmt: 20000, usedDmt: 20000 },
];

const INBOUND_LIST = [
  {
    id: 'RK-20260803-001',
    consignor: '五矿有色金属股份有限公司',
    consignorShort: '五矿有色',
    ship: '海洋之星',
    bl: 'BL20260801001',
    customs: 'BG20260801088',
    hz: 'HZ20260801012',
    amount: 1280000,
    currency: 'USD',
    wetDry: '— / —',
    stack: '—',
    area: '—',
    status: '待收货',
    statusCls: 'tag-orange',
    actions: '<button class="btn-text" onclick="openReceiveModal(\'RK-20260803-001\')">收货</button><button class="btn-text" onclick="openInboundModal();runInboundOcr(\'bl\')">OCR</button>',
  },
  {
    id: 'RK-20260804-004',
    consignor: '广西南国铜业有限责任公司',
    consignorShort: '南国铜业',
    ship: '海豚号',
    bl: 'BL20260804002',
    customs: 'BG20260804088',
    hz: 'HZ20260804012',
    amount: 218000,
    currency: 'USD',
    wetDry: '— / —',
    stack: '—',
    area: '—',
    status: '待收货',
    statusCls: 'tag-orange',
    actions: '<button class="btn-text" onclick="openReceiveModal(\'RK-20260804-004\')">收货</button><button class="btn-text" onclick="openInboundModal();runInboundOcr(\'customs\')">OCR</button>',
  },
  {
    id: 'RK-20260801-015',
    consignor: '广西南国铜业有限责任公司',
    consignorShort: '南国铜业',
    ship: '金海轮',
    bl: 'BL20260725003',
    customs: 'BG20260725022',
    hz: 'HZ20260725007',
    amount: 2100000,
    currency: 'USD',
    wetDry: '800 / 720',
    stack: '待分配',
    area: '—',
    status: '已称重',
    statusCls: 'tag-blue',
    actions: '<button class="btn-text" onclick="openAssignModal(\'RK-20260801-015\')">分配堆位</button><button class="btn-text" onclick="openLotDocs(\'RK-20260801-015\')">详情</button>',
  },
  {
    id: 'RK-20260802-018',
    consignor: '广西金川有色金属有限公司',
    consignorShort: '广西金川',
    ship: '远航号',
    bl: 'BL20260728005',
    customs: 'BG20260728041',
    hz: 'HZ20260728009',
    amount: 860000,
    currency: 'CNY',
    wetDry: '520 / 468',
    stack: '1#A1',
    area: '<span class="tag tag-blue">原料区域</span>',
    status: '已上架',
    statusCls: 'tag-green',
    actions: '<button class="btn-text" onclick="openLotDocs(\'RK-20260802-018\')">详情</button>',
  },
];

const INBOUND_STATUS_ORDER = { 待收货: 0, 已称重: 1, 已上架: 2 };

function sortInboundList(list) {
  return [...list].sort((a, b) => {
    const oa = INBOUND_STATUS_ORDER[a.status] ?? 99;
    const ob = INBOUND_STATUS_ORDER[b.status] ?? 99;
    if (oa !== ob) return oa - ob;
    return a.id.localeCompare(b.id);
  });
}

function formatInboundAmount(amount, currency = 'CNY') {
  const num = Number(amount);
  if (!amount || Number.isNaN(num)) return '—';
  const formatted = num.toLocaleString('en-US');
  return currency === 'USD' ? `$${formatted}` : `¥${formatted}`;
}

function renderInboundTable() {
  const tbody = document.getElementById('inboundTableBody');
  if (!tbody) return;
  tbody.innerHTML = sortInboundList(INBOUND_LIST).map((row) => `
    <tr>
      <td>${row.id}</td>
      <td><span class="tag tag-purple" title="${row.consignor}">${row.consignorShort}</span></td>
      <td>${row.ship}</td>
      <td>${row.bl}</td>
      <td>${row.customs}</td>
      <td>${row.hz}</td>
      <td>${formatInboundAmount(row.amount, row.currency)}</td>
      <td>${row.wetDry}</td>
      <td>${row.stack}</td>
      <td>${row.area}</td>
      <td><span class="tag ${row.statusCls}">${row.status}</span></td>
      <td class="ops">${row.actions}</td>
    </tr>
  `).join('');
}

const INBOUND_ORDERS = {
  'RK-20260803-001': {
    consignor: '五矿有色金属股份有限公司',
    material: '原料物料-A',
    cargoType: '达标矿',
    filingCode: '',
    customs: 'BG20260801088',
    defaultDry: '',
  },
  'RK-20260804-004': {
    consignor: '广西南国铜业有限责任公司',
    material: '原料物料-A（达标矿·秘鲁）',
    cargoType: '达标矿',
    filingCode: '',
    customs: 'BG20260804088',
    defaultDry: '',
  },
  'RK-20260801-015': {
    consignor: '广西南国铜业有限责任公司',
    material: '原料物料-B（报备矿）',
    cargoType: '报备矿',
    filingCode: 'JG-2023-KY04',
    customs: 'BG20260725022',
    defaultDry: 720,
    filingDeducted: false,
  },
};

function loadSysParams() {
  try {
    const raw = localStorage.getItem(SYS_PARAMS_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    const base = { ...DEFAULT_SYS_PARAMS, ...parsed };
    if (!Array.isArray(base.qualityParams) || base.qualityParams.length === 0) {
      base.qualityParams = DEFAULT_QUALITY_PARAMS.map((p) => ({ ...p }));
    }
    return base;
  } catch {
    return { ...DEFAULT_SYS_PARAMS, qualityParams: DEFAULT_QUALITY_PARAMS.map((p) => ({ ...p })) };
  }
}

function persistSysParams(params) {
  localStorage.setItem(SYS_PARAMS_KEY, JSON.stringify(params));
}

function loadSourceFilings() {
  try {
    const raw = localStorage.getItem(SOURCE_FILINGS_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* empty */ }
  return DEFAULT_SOURCE_FILINGS.map((f) => ({ ...f }));
}

function persistSourceFilings(list) {
  localStorage.setItem(SOURCE_FILINGS_KEY, JSON.stringify(list));
}

function filingRemaining(f) {
  return Math.max(0, f.quotaDmt - f.usedDmt);
}

function filingUsagePct(f) {
  if (!f.quotaDmt) return 0;
  return (f.usedDmt / f.quotaDmt) * 100;
}

function filingStatusMeta(f) {
  const rem = filingRemaining(f);
  const pct = filingUsagePct(f);
  const threshold = loadSysParams().filingUsageAlertPct;
  if (rem <= 0 || pct >= 100) return { label: '已用尽', cls: 'tag-gray' };
  if (pct >= threshold) return { label: '即将用尽', cls: 'tag-orange' };
  return { label: '有效', cls: 'tag-blue' };
}

function getSourceFiling(code) {
  return loadSourceFilings().find((f) => f.code === code);
}

function deductSourceFiling(code, dryTon) {
  const dry = Number(dryTon);
  if (!code || code === '—' || !dry || dry <= 0) return { ok: false, msg: '备案号或干重无效' };
  const list = loadSourceFilings();
  const f = list.find((x) => x.code === code);
  if (!f) return { ok: false, msg: `未找到矿源备案 ${code}` };
  const rem = filingRemaining(f);
  if (dry > rem) return { ok: false, msg: `备案剩余 ${rem.toFixed(2)} 干吨，不足扣减 ${dry} 干吨` };
  f.usedDmt = Math.round((f.usedDmt + dry) * 100) / 100;
  persistSourceFilings(list);
  const pct = filingUsagePct(f);
  const threshold = loadSysParams().filingUsageAlertPct;
  return {
    ok: true,
    filing: f,
    remaining: filingRemaining(f),
    usagePct: pct,
    alert: pct >= threshold,
    threshold,
  };
}

function getQualityParams() {
  return loadSysParams().qualityParams || [];
}

function buildQualityOcrSample(base = OCR_SAMPLES.receive_quality.elements) {
  const elements = { ...(base || {}) };
  getQualityParams().forEach((p) => {
    if (!elements[p.code]) elements[p.code] = '—';
  });
  return elements;
}

function buildQualityOcrStatus(data) {
  const elements = data.elements || (data.cu ? { Cu: data.cu } : {});
  const parts = Object.entries(elements)
    .filter(([, v]) => v && v !== '—')
    .map(([k, v]) => `${k} ${v}`);
  const doc = data.docNo || '';
  if (!doc && parts.length === 0) return '品质证书：待上传';
  return `品质证书已识别：${doc}${parts.length ? ' · ' + parts.join(' · ') : ''}`;
}

function renderQualityInputs(containerId, prefix, values = {}, readonly = false) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const params = getQualityParams();
  container.innerHTML = params.map((p) => {
    const id = `${prefix}Q_${p.code}`;
    const val = values[p.code] ?? '';
    const reqMark = p.required ? '<span class="req">*</span>' : '';
    const ro = readonly ? 'readonly' : '';
    return `<div class="form-group"><label>${p.name}(${p.code})${reqMark}</label><input class="input" id="${id}" data-q-code="${p.code}" value="${val}" placeholder="OCR 回填" ${ro} /></div>`;
  }).join('');
}

function renderReceiveQualityFields(values = {}) {
  renderQualityInputs('rcQualityFields', 'rc', values, true);
}

function renderOcrQualityFields(values = {}) {
  renderQualityInputs('ocrQualityFields', 'ocr', values, false);
}

function getQualityValuesFromContainer(containerId) {
  const values = {};
  const container = document.getElementById(containerId);
  if (!container) return values;
  container.querySelectorAll('[data-q-code]').forEach((input) => {
    const code = input.dataset.qCode;
    if (code && input.value) values[code] = input.value;
  });
  return values;
}

function getOcrQualityValues() {
  return getQualityValuesFromContainer('ocrQualityFields');
}

function renderParamQualityTable() {
  const tbody = document.getElementById('paramQualityBody');
  if (!tbody) return;
  const params = loadSysParams().qualityParams;
  tbody.innerHTML = params.map((p) => `
    <tr>
      <td><input class="input" data-q-name value="${p.name}" placeholder="如 铜" /></td>
      <td><input class="input" data-q-code value="${p.code}" placeholder="如 Cu" /></td>
      <td class="param-quality-check"><input type="checkbox" data-q-required ${p.required ? 'checked' : ''} /></td>
      <td><button type="button" class="btn-text" onclick="this.closest('tr').remove()">删除</button></td>
    </tr>
  `).join('');
}

function collectQualityParamsFromForm() {
  const rows = document.querySelectorAll('#paramQualityBody tr');
  const params = [];
  const codes = new Set();
  rows.forEach((row) => {
    const name = row.querySelector('[data-q-name]')?.value?.trim();
    const code = row.querySelector('[data-q-code]')?.value?.trim();
    const required = row.querySelector('[data-q-required]')?.checked;
    if (!name || !code) return;
    if (codes.has(code)) return;
    codes.add(code);
    params.push({ name, code, required: !!required });
  });
  return params;
}

function addQualityParamRow() {
  const tbody = document.getElementById('paramQualityBody');
  if (!tbody) return;
  tbody.insertAdjacentHTML('beforeend', `
    <tr>
      <td><input class="input" data-q-name placeholder="元素名称" /></td>
      <td><input class="input" data-q-code placeholder="符号" /></td>
      <td class="param-quality-check"><input type="checkbox" data-q-required /></td>
      <td><button type="button" class="btn-text" onclick="this.closest('tr').remove()">删除</button></td>
    </tr>
  `);
}

function refreshQualityParamUi() {
  const rcValues = getQualityValuesFromContainer('rcQualityFields');
  const ocrValues = getOcrQualityValues();
  renderReceiveQualityFields(rcValues);
  renderOcrQualityFields(ocrValues);
}

function initSysParamsForm() {
  const p = loadSysParams();
  const set = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.value = val;
  };
  set('paramCapAlert', p.capAlertPct);
  set('paramAgingDays', p.agingDays);
  set('paramFilingUsage', p.filingUsageAlertPct);
  renderParamQualityTable();
}

function saveSysParams() {
  const cap = Number(document.getElementById('paramCapAlert')?.value);
  const aging = Number(document.getElementById('paramAgingDays')?.value);
  const filing = Number(document.getElementById('paramFilingUsage')?.value);
  const qualityParams = collectQualityParamsFromForm();
  if (!qualityParams.length) {
    toast('至少保留一项品质参数', 'warn');
    return;
  }
  const codes = qualityParams.map((p) => p.code);
  if (codes.length !== new Set(codes).size) {
    toast('品质参数符号不可重复', 'warn');
    return;
  }
  if (!filing || filing <= 0 || filing > 100) {
    toast('矿源备案用量预警阈值须为 1–100', 'warn');
    return;
  }
  persistSysParams({
    capAlertPct: cap || DEFAULT_SYS_PARAMS.capAlertPct,
    agingDays: aging || DEFAULT_SYS_PARAMS.agingDays,
    filingUsageAlertPct: filing,
    qualityParams,
  });
  refreshQualityParamUi();
  renderMaterialTable();
  renderSourceFilingTable();
  renderAllAlerts();
  toast('系统参数已保存', 'ok');
}

function renderSourceFilingTable() {
  const tbody = document.getElementById('sourceFilingTableBody');
  if (!tbody) return;
  const threshold = loadSysParams().filingUsageAlertPct;
  tbody.innerHTML = loadSourceFilings().map((f) => {
    const rem = filingRemaining(f);
    const pct = filingUsagePct(f);
    const st = filingStatusMeta(f);
    const pctCell = pct >= threshold
      ? `<span class="tag tag-orange">${pct.toFixed(2)}%</span>`
      : `${pct.toFixed(2)}%`;
    return `<tr>
      <td>${f.source}</td><td>${f.country}</td><td>${f.code}</td><td>${f.date}</td>
      <td><span class="tag ${st.cls}">${st.label}</span></td>
      <td>${f.quotaDmt.toLocaleString('zh-CN')}</td>
      <td>${f.usedDmt.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
      <td>${rem.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
      <td>${pctCell}</td>
      <td class="ops"><button class="btn-text" onclick="openSourceFilingModal('${f.code}')">编辑</button></td>
    </tr>`;
  }).join('');
}

function openSourceFilingModal(code) {
  const f = getSourceFiling(code);
  if (!f) {
    openModal('modalSourceFiling');
    return;
  }
  const st = filingStatusMeta(f);
  const rem = filingRemaining(f);
  const pct = filingUsagePct(f);
  const set = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.value = val;
  };
  set('sfCountry', f.country);
  set('sfCode', f.code);
  set('sfDate', f.date);
  set('sfQuota', f.quotaDmt.toLocaleString('zh-CN'));
  set('sfStatus', st.label);
  set('sfUsed', f.usedDmt.toFixed(2));
  set('sfRemaining', rem.toFixed(2));
  set('sfUsage', `${pct.toFixed(2)}%`);
  const srcSel = document.getElementById('sfSource');
  if (srcSel) {
    const opt = Array.from(srcSel.options).find((o) => o.text === f.source);
    if (opt) srcSel.value = opt.value;
  }
  openModal('modalSourceFiling');
}

function openReceiveModal(orderId) {
  const order = INBOUND_ORDERS[orderId];
  if (!order) return;
  const set = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.value = val ?? '';
  };
  set('rcInboundNo', orderId);
  set('rcConsignor', order.consignor);
  set('rcMaterial', order.material);
  set('rcCargoType', order.cargoType);
  set('rcFilingNo', order.cargoType === '报备矿' ? order.filingCode : '—');
  set('rcWet', '');
  set('rcDry', order.defaultDry || '');
  set('rcQualityNo', '');
  set('rcMoisture', '');
  renderReceiveQualityFields({});
  setOcrStatus('rcWeightOcrStatus', '重量单：待上传');
  setOcrStatus('rcQualityOcrStatus', '品质证书：待上传');
  openModal('modalReceive');
}

function openAssignModal(orderId) {
  const order = INBOUND_ORDERS[orderId];
  if (!order) return;
  const set = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.value = val ?? '';
  };
  set('asInboundNo', orderId);
  set('asConsignor', order.consignor);
  set('asCargoType', order.cargoType);
  set('asFilingNo', order.cargoType === '报备矿' ? order.filingCode : '—');
  set('asCustomsNo', order.customs || '');
  set('asDry', order.defaultDry || '');
  openModal('modalAssign');
}

const LOT_DOCS = {
  'RK-20260802-018': {
    title: '本票详情 · BG20260728041',
    inboundNo: 'RK-20260802-018',
    customs: 'BG20260728041',
    prodBatch: '—',
    consignor: '广西金川有色金属有限公司',
    consignorShort: '广西金川',
    material: '原料物料-A',
    cargoType: '达标矿',
    category: '原料',
    stack: '1#A1',
    wet: '520',
    dry: '468',
    customsDoc: {
      name: '进口货物报关单 BG20260728041.pdf',
      fields: [
        ['报关单号', 'BG20260728041'],
        ['核注清单', 'HZ20260728009'],
        ['提单号', 'BL20260728005'],
        ['船名', '远航号'],
        ['境内收货人', '广西金川有色金属有限公司'],
        ['原产国', '秘鲁'],
        ['商品项', '铜精矿'],
      ],
    },
    weightDoc: {
      name: '重量证书 WGT-20260802-018.pdf',
      no: 'WGT-20260802-018',
      fields: [
        ['证书编号', 'WGT-20260802-018'],
        ['湿重', '520 吨'],
        ['干重', '468 吨'],
        ['水分', '10.0%'],
        ['检定日期', '2026-08-02'],
      ],
    },
    qualityDoc: {
      name: '品质检验证书 QA-20260802-018.pdf',
      no: 'QA-20260802-018',
      fields: [
        ['证书编号', 'QA-20260802-018'],
        ['物料', '原料物料-A'],
        ['检定日期', '2026-08-02'],
      ],
      elements: { Cu: '22.5%', Ag: '45g/t', Au: '0.8g/t', As: '0.12%', Pb: '0.05%', Cd: '0.01%', F: '0.02%', Hg: '0.001%' },
    },
  },
  'RK-20260801-015': {
    title: '本票详情 · BG20260725022',
    inboundNo: 'RK-20260801-015',
    customs: 'BG20260725022',
    prodBatch: '—',
    consignor: '广西南国铜业有限责任公司',
    consignorShort: '南国铜业',
    material: '原料物料-B',
    cargoType: '报备矿',
    category: '原料',
    stack: '待分配',
    wet: '800',
    dry: '720',
    customsDoc: {
      name: '进口货物报关单 BG20260725022.pdf',
      fields: [
        ['报关单号', 'BG20260725022'],
        ['核注清单', 'HZ20260725007'],
        ['提单号', 'BL20260725003'],
        ['船名', '金海轮'],
        ['境内收货人', '广西南国铜业有限责任公司'],
        ['矿源备案号', 'JG-2023-KY04'],
        ['原产国', '智利'],
      ],
    },
    weightDoc: {
      name: '重量证书 WGT-20260801-015.pdf',
      no: 'WGT-20260801-015',
      fields: [
        ['证书编号', 'WGT-20260801-015'],
        ['湿重', '800 吨'],
        ['干重', '720 吨'],
        ['水分', '10.0%'],
        ['检定日期', '2026-08-01'],
      ],
    },
    qualityDoc: {
      name: '品质检验证书 QA-20260801-015.pdf',
      no: 'QA-20260801-015',
      fields: [
        ['证书编号', 'QA-20260801-015'],
        ['物料', '原料物料-B'],
        ['检定日期', '2026-08-01'],
      ],
      elements: { Cu: '25.1%', Ag: '42g/t', Au: '0.6g/t', As: '0.10%', Pb: '0.04%', Cd: '0.008%', F: '0.015%', Hg: '0.0008%' },
    },
  },
  'BG20260801022': {
    title: '本票详情 · BG20260801022',
    inboundNo: 'RK-20260728-011',
    customs: 'BG20260801022',
    prodBatch: '—',
    consignor: '广西金川有色金属有限公司',
    consignorShort: '广西金川',
    material: '原料物料-B',
    cargoType: '报备矿',
    category: '原料',
    stack: '1#A2',
    wet: '360',
    dry: '330',
    customsDoc: {
      name: '进口货物报关单 BG20260801022.pdf',
      fields: [
        ['报关单号', 'BG20260801022'],
        ['核注清单', 'HZ20260801008'],
        ['境内收货人', '广西金川有色金属有限公司'],
        ['矿源备案号', 'JG-2023-KY04'],
        ['原产国', '智利'],
      ],
    },
    weightDoc: {
      name: '重量证书 WGT-20260728-011.pdf',
      no: 'WGT-20260728-011',
      fields: [
        ['证书编号', 'WGT-20260728-011'],
        ['湿重', '360 吨'],
        ['干重', '330 吨'],
        ['水分', '8.3%'],
        ['检定日期', '2026-07-28'],
      ],
    },
    qualityDoc: {
      name: '品质检验证书 QA-20260728-011.pdf',
      no: 'QA-20260728-011',
      fields: [
        ['证书编号', 'QA-20260728-011'],
        ['物料', '原料物料-B'],
        ['检定日期', '2026-07-28'],
      ],
      elements: { Cu: '25.1%', Ag: '42g/t', Au: '0.6g/t', As: '0.10%', Pb: '0.04%', Cd: '0.008%', F: '0.015%', Hg: '0.0008%' },
    },
  },
  'BG20260428016': {
    title: '本票详情 · BG20260428016',
    inboundNo: 'RK-20260428-006',
    customs: 'BG20260428016',
    prodBatch: '—',
    consignor: '五矿有色金属股份有限公司',
    consignorShort: '五矿有色',
    material: '原料物料-C',
    cargoType: '报备矿',
    category: '原料',
    stack: '5#小A',
    wet: '280',
    dry: '252',
    customsDoc: {
      name: '进口货物报关单 BG20260428016.pdf',
      fields: [
        ['报关单号', 'BG20260428016'],
        ['核注清单', 'HZ20260428004'],
        ['境内收货人', '五矿有色金属股份有限公司'],
        ['矿源备案号', 'JG4-2025-KY02'],
        ['原产国', '澳大利亚'],
      ],
    },
    weightDoc: {
      name: '重量证书 WGT-20260428-006.pdf',
      no: 'WGT-20260428-006',
      fields: [
        ['证书编号', 'WGT-20260428-006'],
        ['湿重', '280 吨'],
        ['干重', '252 吨'],
        ['水分', '10.0%'],
        ['检定日期', '2026-04-28'],
      ],
    },
    qualityDoc: {
      name: '品质检验证书 QA-20260428-006.pdf',
      no: 'QA-20260428-006',
      fields: [
        ['证书编号', 'QA-20260428-006'],
        ['物料', '原料物料-C'],
        ['检定日期', '2026-04-28'],
      ],
      elements: { Cu: '21.8%', Ag: '38g/t', Au: '0.5g/t', As: '0.15%', Pb: '0.06%', Cd: '0.012%', F: '0.025%', Hg: '0.0012%' },
    },
  },
  'FL-20260803': {
    title: '本票详情 · 生产批次 FL-20260803',
    inboundNo: 'WG-20260803-01',
    customs: '—',
    prodBatch: 'FL-20260803',
    consignor: '广西金川有色金属有限公司',
    consignorShort: '广西金川',
    material: '成品物料-A',
    cargoType: '达标矿',
    category: '成品',
    stack: '4#A1',
    wet: '—',
    dry: '180',
    customsDoc: {
      name: '关联原料报关单（完工谱系）',
      fields: [
        ['生产批次', 'FL-20260803'],
        ['关联报关单', 'BG20260728041、BG20260801022、BG20260715033'],
        ['说明', '成品无进口报关单，追溯原料票'],
      ],
    },
    weightDoc: {
      name: '完工计量单 WG-20260803-01.pdf',
      no: 'WG-20260803-01',
      fields: [
        ['证书编号', 'WG-20260803-01'],
        ['产量干重', '180 吨'],
        ['完工日期', '2026-08-03'],
      ],
    },
    qualityDoc: {
      name: '成品品质报告 QA-FL-20260803.pdf',
      no: 'QA-FL-20260803',
      fields: [
        ['证书编号', 'QA-FL-20260803'],
        ['物料', '成品物料-A'],
        ['检定日期', '2026-08-03'],
      ],
      elements: { Cu: '24.8%', Ag: '28g/t', Au: '0.3g/t', As: '0.08%', Pb: '0.03%', Cd: '0.005%', F: '0.01%', Hg: '0.0005%' },
    },
  },
  'FL-20260802': {
    title: '本票详情 · 生产批次 FL-20260802',
    inboundNo: 'WG-20260802-01',
    customs: '—',
    prodBatch: 'FL-20260802',
    consignor: '广西金川有色金属有限公司',
    consignorShort: '广西金川',
    material: '成品物料-A',
    cargoType: '达标矿',
    category: '成品',
    stack: '4#A2',
    wet: '—',
    dry: '180',
    customsDoc: {
      name: '关联原料报关单（完工谱系）',
      fields: [
        ['生产批次', 'FL-20260802'],
        ['关联报关单', 'BG20260715033 等'],
        ['说明', '成品无进口报关单，追溯原料票'],
      ],
    },
    weightDoc: {
      name: '完工计量单 WG-20260802-01.pdf',
      no: 'WG-20260802-01',
      fields: [
        ['证书编号', 'WG-20260802-01'],
        ['产量干重', '180 吨'],
        ['完工日期', '2026-08-02'],
      ],
    },
    qualityDoc: {
      name: '成品品质报告 QA-FL-20260802.pdf',
      no: 'QA-FL-20260802',
      fields: [
        ['证书编号', 'QA-FL-20260802'],
        ['物料', '成品物料-A'],
        ['检定日期', '2026-08-02'],
      ],
      elements: { Cu: '24.2%', Ag: '30g/t', Au: '0.3g/t', As: '0.08%', Pb: '0.03%', Cd: '0.005%', F: '0.01%', Hg: '0.0005%' },
    },
  },
};

LOT_DOCS.BG20260728041 = LOT_DOCS['RK-20260802-018'];
LOT_DOCS.BG20260725022 = LOT_DOCS['RK-20260801-015'];

function lotDocsFieldHtml(pairs) {
  return (pairs || []).map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
}

function lotDocsPaperHtml(title, fileName, lines) {
  const extras = (lines || []).map((t) => `<p>${t}</p>`).join('');
  return `<div class="lot-doc-kicker">归档影像（示意）</div>
    <h4>${title}</h4>
    ${extras}
    <div class="lot-doc-meta">${fileName || '已归档附件'}</div>`;
}

function resetLotDocsTabs() {
  const root = document.getElementById('lotDocsTabs');
  if (!root) return;
  root.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === 'customs'));
  ['customs', 'weight', 'quality'].forEach((k) => {
    const panel = document.getElementById(`lot-docs-${k}`);
    if (panel) panel.style.display = k === 'customs' ? '' : 'none';
  });
}

function openLotDocs(key) {
  const lot = LOT_DOCS[key];
  if (!lot) {
    toast('未找到本票单证', 'warn');
    return;
  }
  const titleEl = document.getElementById('lotDocsTitle');
  if (titleEl) titleEl.textContent = lot.title;
  const stats = document.getElementById('lotDocsStats');
  if (stats) {
    stats.innerHTML = `
      <div class="stat-card"><div class="label">委托方</div><div class="value" style="font-size:14px">${lot.consignorShort}</div><div class="sub">${lot.material}</div></div>
      <div class="stat-card"><div class="label">报关单号 / 生产批次</div><div class="value" style="font-size:14px">${lot.customs}</div><div class="sub">${lot.prodBatch}</div></div>
      <div class="stat-card"><div class="label">湿重 / 干重</div><div class="value" style="font-size:14px">${lot.wet} / ${lot.dry}</div><div class="sub">吨 · ${lot.stack}</div></div>
      <div class="stat-card ok"><div class="label">货物类型</div><div class="value" style="font-size:14px">${lot.cargoType}</div><div class="sub">${lot.category}</div></div>`;
  }
  const customsPaper = document.getElementById('lotDocsCustomsPaper');
  if (customsPaper) {
    customsPaper.innerHTML = lotDocsPaperHtml(
      lot.category === '成品' ? '关联原料报关单' : '海关进口货物报关单',
      lot.customsDoc.name,
      lot.customsDoc.fields.slice(0, 3).map(([k, v]) => `${k}：${v}`),
    );
  }
  const customsFields = document.getElementById('lotDocsCustomsFields');
  if (customsFields) customsFields.innerHTML = lotDocsFieldHtml(lot.customsDoc.fields);
  const weightPaper = document.getElementById('lotDocsWeightPaper');
  if (weightPaper) {
    weightPaper.innerHTML = lotDocsPaperHtml('重量证书', lot.weightDoc.name, [
      `编号 ${lot.weightDoc.no}`,
      `湿重 ${lot.wet} 吨 · 干重 ${lot.dry} 吨`,
    ]);
  }
  const weightFields = document.getElementById('lotDocsWeightFields');
  if (weightFields) weightFields.innerHTML = lotDocsFieldHtml(lot.weightDoc.fields);
  const qualityPaper = document.getElementById('lotDocsQualityPaper');
  if (qualityPaper) {
    qualityPaper.innerHTML = lotDocsPaperHtml('品质检验证书', lot.qualityDoc.name, [
      `编号 ${lot.qualityDoc.no}`,
      `本票参数随上架记入，不属于物料档案`,
    ]);
  }
  const qualityMeta = document.getElementById('lotDocsQualityMeta');
  if (qualityMeta) qualityMeta.innerHTML = lotDocsFieldHtml(lot.qualityDoc.fields);
  const qWrap = document.getElementById('lotDocsQualityFields');
  if (qWrap) {
    const elements = lot.qualityDoc.elements || {};
    qWrap.innerHTML = getQualityParams().map((p) => {
      const val = elements[p.code] || '—';
      return `<div class="form-group"><label>${p.name}(${p.code})</label><input class="input" value="${val}" readonly /></div>`;
    }).join('');
  }
  resetLotDocsTabs();
  openModal('modalLotDocs');
}

function tryDeductFilingOnInbound(orderId, dryTon) {
  const order = INBOUND_ORDERS[orderId];
  if (!order || order.cargoType !== '报备矿' || !order.filingCode) return { ok: true, skipped: true };
  if (order.filingDeducted) return { ok: true, skipped: true, already: true };
  const result = deductSourceFiling(order.filingCode, dryTon);
  if (!result.ok) return result;
  order.filingDeducted = true;
  renderSourceFilingTable();
  renderAllAlerts();
  return result;
}

function saveAssign() {
  const orderId = document.getElementById('asInboundNo')?.value?.trim();
  const dry = document.getElementById('asDry')?.value?.trim();
  if (!dry) {
    toast('请填写上架干重', 'warn');
    return;
  }
  const deduct = tryDeductFilingOnInbound(orderId, dry);
  if (!deduct.ok) {
    toast(deduct.msg, 'warn');
    return;
  }
  closeModal('modalAssign');
  if (deduct.skipped) {
    toast('上架确认（原型演示）', 'ok');
    return;
  }
  let msg = `上架确认 · 备案 ${INBOUND_ORDERS[orderId]?.filingCode} 扣减 ${dry} 干吨，剩余 ${deduct.remaining.toFixed(2)} DMT`;
  if (deduct.alert) msg += ` · 用量已达 ${deduct.threshold}% 预警阈值`;
  toast(msg, deduct.alert ? 'warn' : 'ok');
}

function saveReceive() {
  const wet = document.getElementById('rcWet')?.value?.trim();
  const dry = document.getElementById('rcDry')?.value?.trim();
  if (!wet || !dry) {
    toast('请填写湿重/干重，或使用 OCR 识别重量单', 'warn');
    return;
  }
  const missingRequired = getQualityParams()
    .filter((p) => p.required)
    .filter((p) => !getQualityValuesFromContainer('rcQualityFields')[p.code]?.trim());
  if (missingRequired.length) {
    toast(`请填写必填品质参数：${missingRequired.map((p) => p.name).join('、')}，或使用 OCR 识别品质证书`, 'warn');
    return;
  }
  const orderId = document.getElementById('rcInboundNo')?.value?.trim();
  const cargoType = document.getElementById('rcCargoType')?.value?.trim();
  const deduct = cargoType === '报备矿' ? tryDeductFilingOnInbound(orderId, dry) : { ok: true, skipped: true };
  if (!deduct.ok) {
    toast(deduct.msg, 'warn');
    return;
  }
  closeModal('modalReceive');
  if (deduct.skipped) {
    toast('收货登记已确认（原型演示）', 'ok');
    return;
  }
  let msg = `收货确认 · 备案 ${INBOUND_ORDERS[orderId]?.filingCode} 扣减 ${dry} 干吨，剩余 ${deduct.remaining.toFixed(2)} DMT`;
  if (deduct.alert) msg += ` · 用量已达 ${deduct.threshold}% 预警阈值`;
  toast(msg, deduct.alert ? 'warn' : 'ok');
}

function toast(msg, type) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast show' + (type ? ' ' + type : '');
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => t.classList.remove('show'), 2200);
}

function bindTabs(containerSel, prefix) {
  const root = document.querySelector(containerSel);
  if (!root) return;
  root.querySelectorAll('.tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      root.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      const id = tab.dataset.tab;
      root.parentElement.querySelectorAll(`[id^="${prefix}"]`).forEach((panel) => {
        if (panel.id.startsWith(prefix)) {
          panel.style.display = panel.id === prefix + id ? '' : 'none';
        }
      });
      // settings tabs are siblings after tabs
      if (prefix === 'tab-') {
        ['roles', 'customs-acc', 'params'].forEach((k) => {
          const p = document.getElementById('tab-' + k);
          if (p) p.style.display = k === id ? '' : 'none';
        });
      }
      if (prefix === 'prod-') {
        ['feed', 'process', 'finish', 'ledger'].forEach((k) => {
          const p = document.getElementById('prod-' + k);
          if (p) p.style.display = k === id ? '' : 'none';
        });
      }
    });
  });
}

function auditQuickFilter(module, btn) {
  document.querySelectorAll('.audit-quick-tag').forEach((t) => t.classList.remove('active'));
  if (btn) btn.classList.add('active');
  const sel = document.getElementById('auditModuleFilter');
  if (sel) sel.value = module;
  applyAuditFilter();
}

function auditModuleSelect(val) {
  document.querySelectorAll('.audit-quick-tag').forEach((t) => {
    t.classList.toggle('active', t.dataset.module === (val || ''));
  });
  applyAuditFilter();
}

function auditRowMatchesField(row, token, datasetKey) {
  if (!token) return true;
  const key = token.toLowerCase();
  const fieldVal = (row.dataset[datasetKey] || '').toLowerCase();
  if (fieldVal && fieldVal.includes(key)) return true;
  return row.textContent.toLowerCase().includes(key);
}

function applyAuditFilter() {
  const module = document.getElementById('auditModuleFilter')?.value || '';
  const operator = (document.getElementById('auditOperator')?.value || '').trim();
  const bizNo = (document.getElementById('auditBizNo')?.value || '').trim().toLowerCase();
  const customsNo = (document.getElementById('auditCustomsNo')?.value || '').trim();
  const prodBatch = (document.getElementById('auditProdBatch')?.value || '').trim();
  const customsOnly = document.getElementById('auditCustomsOnly')?.value === '是';
  const dateFrom = document.getElementById('auditDateFrom')?.value || '';
  const dateTo = document.getElementById('auditDateTo')?.value || '';
  if (dateFrom && dateTo && dateFrom > dateTo) {
    toast('开始日期不能晚于结束日期', 'warn');
    return;
  }
  let visible = 0;
  const filtering = !!(module || operator || bizNo || customsNo || prodBatch || customsOnly || dateFrom || dateTo);
  document.querySelectorAll('#auditTableBody tr').forEach((row) => {
    const rowModule = row.dataset.module || '';
    const rowCustoms = row.dataset.customs === '1';
    const rowTime = row.dataset.time || '';
    const text = row.textContent.toLowerCase();
    let show = true;
    if (module && rowModule !== module) show = false;
    if (customsOnly && !rowCustoms) show = false;
    if (operator && !text.includes(operator.toLowerCase())) show = false;
    if (bizNo && !text.includes(bizNo)) show = false;
    if (!auditRowMatchesField(row, customsNo, 'customsNo')) show = false;
    if (!auditRowMatchesField(row, prodBatch, 'prodBatch')) show = false;
    if (dateFrom && rowTime && rowTime < dateFrom) show = false;
    if (dateTo && rowTime && rowTime > dateTo) show = false;
    row.style.display = show ? '' : 'none';
    if (show) visible += 1;
  });
  const pag = document.getElementById('auditPagination');
  if (pag) {
    pag.textContent = filtering
      ? `共 ${visible} 条留痕（筛选中）`
      : `共 ${visible} 条留痕`;
  }
}

function toggleFilingFields() {
  const sel = document.getElementById('matCargoType');
  const show = sel && sel.value === '报备矿';
  ['matSourceGroup', 'matSourceTitle'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.style.display = show ? '' : 'none';
  });
}

function resolveActiveFiling(source) {
  if (!source || source === '—') return null;
  return loadSourceFilings()
    .filter((f) => f.source === source && filingRemaining(f) > 0)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)))[0] || null;
}

function inboundMaterialLabel(m) {
  if (m.cargoType === '报备矿') return `${m.name}（报备矿·${m.source}）`;
  return `${m.name}（${m.cargoType}·${m.country}）`;
}

function populateInboundMaterials() {
  const sel = document.getElementById('ibMaterial');
  if (!sel) return;
  const prev = sel.value;
  const materials = loadMaterials().filter((m) => m.category === '原料');
  sel.innerHTML = materials.map((m) => `<option value="${m.code}">${inboundMaterialLabel(m)}</option>`).join('');
  if (prev && Array.from(sel.options).some((o) => o.value === prev)) sel.value = prev;
}

function syncInboundFiling() {
  const sel = document.getElementById('ibMaterial');
  const filingEl = document.getElementById('ibFiling');
  if (!sel || !filingEl) return;
  const material = loadMaterials().find((m) => m.code === sel.value)
    || loadMaterials().find((m) => inboundMaterialLabel(m) === sel.value)
    || loadMaterials().find((m) => sel.selectedOptions[0]?.text?.includes(m.name));
  if (!material || material.cargoType !== '报备矿') {
    filingEl.value = '—';
    return;
  }
  const filing = resolveActiveFiling(material.source);
  if (!filing) {
    filingEl.value = `${material.source}：无剩余备案，请先新建矿源备案`;
    return;
  }
  const rem = filingRemaining(filing).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  filingEl.value = `${filing.code}（剩余 ${rem} DMT · 按矿源自动匹配）`;
}

/* ===== 物料档案 ===== */
const MATERIALS_STORAGE_KEY = 'wms_materials_v2';
const MAT_ATTACHMENTS_STORAGE_KEY = 'wms_material_attachments';
const MAT_ATTACH_MAX_BYTES = 4 * 1024 * 1024;

const matAttachState = { code: null, viewRecord: null };

const DEFAULT_MAT_ATTACHMENTS = {
  'YL-CU-001': [
    {
      id: 'demo-qa-spec',
      name: '品质标准说明.txt',
      mime: 'text/plain',
      dataUrl: `data:text/plain;charset=utf-8,${encodeURIComponent('原料物料-A 品质标准\nCu≥22%\nAg≤50g/t\nAu≤0.8g/t')}`,
      uploadedAt: '2026-08-01T08:00:00.000Z',
      size: 72,
    },
  ],
};

const DEFAULT_MATERIALS = [
  {
    code: 'YL-CU-001',
    name: '原料物料-A',
    cargoType: '达标矿',
    cargoTypeCls: 'tag-green',
    category: '原料',
    categoryCls: 'tag-blue',
    source: '—',
    country: '秘鲁',
  },
  {
    code: 'YL-CU-002',
    name: '原料物料-B',
    cargoType: '报备矿',
    cargoTypeCls: 'tag-orange',
    category: '原料',
    categoryCls: 'tag-blue',
    source: '智利精矿',
    country: '智利',
  },
  {
    code: 'YL-CU-003',
    name: '原料物料-C',
    cargoType: '报备矿',
    cargoTypeCls: 'tag-orange',
    category: '原料',
    categoryCls: 'tag-blue',
    source: '澳洲精矿',
    country: '澳大利亚',
  },
  {
    code: 'CP-CU-01',
    name: '成品物料-A',
    cargoType: '达标矿',
    cargoTypeCls: 'tag-green',
    category: '成品',
    categoryCls: 'tag-green',
    source: '—',
    country: '中国',
  },
];

function loadMaterials() {
  try {
    const raw = localStorage.getItem(MATERIALS_STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* empty */ }
  return DEFAULT_MATERIALS.map((m) => ({ ...m }));
}

function persistMaterials(list) {
  localStorage.setItem(MATERIALS_STORAGE_KEY, JSON.stringify(list));
}

function renderMaterialTable() {
  const tbody = document.getElementById('materialTableBody');
  if (!tbody) return;
  const materials = loadMaterials();
  tbody.innerHTML = materials.map((m) => {
    return `<tr>
      <td>${m.code}</td>
      <td>${m.name}</td>
      <td><span class="tag ${m.cargoTypeCls}">${m.cargoType}</span></td>
      <td><span class="tag ${m.categoryCls}">${m.category}</span></td>
      <td>${m.source}</td>
      <td>${m.country}</td>
      <td>${getMatAttachmentCount(m.code) ? `<span class="tag tag-blue">${getMatAttachmentCount(m.code)} 个</span>` : '—'}</td>
      <td class="ops">
        <button type="button" class="btn-text" onclick="openMaterialModal('${m.code}')">编辑</button>
        <button type="button" class="btn-text" onclick="openMaterialAttachmentsModal('${m.code}')">查看附件</button>
      </td>
    </tr>`;
  }).join('');
  const countEl = document.getElementById('materialTableCount');
  if (countEl) countEl.textContent = `共 ${materials.length} 条物料档案`;
}

function openMaterialModal(code) {
  const materials = loadMaterials();
  const m = code ? materials.find((item) => item.code === code) : null;
  const set = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.value = val ?? '';
  };
  set('matCode', m?.code || '');
  set('matName', m?.name || '');
  set('matCountry', m?.country || '');
  const cargoSel = document.getElementById('matCargoType');
  if (cargoSel) cargoSel.value = m?.cargoType || '达标矿';
  const catSel = document.getElementById('matCategory');
  if (catSel) catSel.value = m?.category || '原料';
  const srcSel = document.getElementById('matSource');
  if (srcSel && m?.source && m.source !== '—') srcSel.value = m.source;
  matAttachState.code = m?.code || '';
  renderMatAttachmentLists(m?.code || '');
  toggleFilingFields();
  openModal('modalMaterial');
}

function saveMaterial() {
  const code = document.getElementById('matCode')?.value?.trim();
  const name = document.getElementById('matName')?.value?.trim();
  if (!code || !name) {
    toast('请填写物料编码与名称', 'warn');
    return;
  }
  const cargoType = document.getElementById('matCargoType')?.value || '达标矿';
  const category = document.getElementById('matCategory')?.value || '原料';
  const source = cargoType === '报备矿'
    ? (document.getElementById('matSource')?.value || '—')
    : '—';
  if (cargoType === '报备矿' && (!source || source === '—')) {
    toast('报备矿请选择矿源', 'warn');
    return;
  }
  const materials = loadMaterials();
  const idx = materials.findIndex((m) => m.code === code);
  const record = {
    code,
    name,
    cargoType,
    cargoTypeCls: cargoType === '报备矿' ? 'tag-orange' : 'tag-green',
    category,
    categoryCls: category === '成品' ? 'tag-green' : 'tag-blue',
    source,
    country: document.getElementById('matCountry')?.value?.trim() || '—',
  };
  if (idx >= 0) materials[idx] = { ...materials[idx], ...record };
  else materials.push(record);
  persistMaterials(materials);
  renderMaterialTable();
  populateInboundMaterials();
  closeModal('modalMaterial');
  toast('物料档案已保存', 'ok');
}

function loadMatAttachmentStore() {
  try {
    const raw = localStorage.getItem(MAT_ATTACHMENTS_STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* empty */ }
  return JSON.parse(JSON.stringify(DEFAULT_MAT_ATTACHMENTS));
}

function persistMatAttachmentStore(store) {
  localStorage.setItem(MAT_ATTACHMENTS_STORAGE_KEY, JSON.stringify(store));
}

function getMatAttachments(code) {
  if (!code) return [];
  const store = loadMatAttachmentStore();
  return store[code] ? [...store[code]] : [];
}

function getMatAttachmentCount(code) {
  return getMatAttachments(code).length;
}

function getMatEditingCode() {
  return document.getElementById('matCode')?.value?.trim() || matAttachState.code || '';
}

function formatMatFileSize(bytes) {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatMatUploadTime(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('zh-CN', { hour12: false });
  } catch {
    return '—';
  }
}

function getMatAttachmentViewMode(record) {
  if (!record) return 'download';
  const mime = record.mime || '';
  const name = record.name || '';
  if (mime.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i.test(name)) return 'image';
  if (mime === 'application/pdf' || /\.pdf$/i.test(name)) return 'pdf';
  if (mime.startsWith('text/') || /\.txt$/i.test(name)) return 'text';
  return 'download';
}

function renderMatAttachmentItemHtml(code, att) {
  const viewMode = getMatAttachmentViewMode(att);
  const viewLabel = viewMode === 'download' ? '下载' : '查看';
  const safeName = escapeHtml(att.name);
  const safeCode = escapeHtml(code);
  const safeId = escapeHtml(att.id);
  return `<li class="mat-attach-item">
    <span class="mat-attach-name" title="${safeName}">${safeName}</span>
    <span class="mat-attach-meta">${formatMatFileSize(att.size)} · ${formatMatUploadTime(att.uploadedAt)}</span>
    <span class="mat-attach-actions">
      <button type="button" class="btn-text" onclick="openMatAttachmentViewer('${safeCode}','${safeId}')">${viewLabel}</button>
      <button type="button" class="btn-text" onclick="deleteMatAttachment('${safeCode}','${safeId}')">删除</button>
    </span>
  </li>`;
}

function renderMatAttachmentLists(code) {
  const items = code ? getMatAttachments(code) : [];
  const html = items.map((att) => renderMatAttachmentItemHtml(code, att)).join('');
  ['matAttachmentList', 'matAttachmentModalList'].forEach((listId) => {
    const list = document.getElementById(listId);
    if (list) list.innerHTML = html;
  });
}

function openMaterialAttachmentsModal(code) {
  const m = loadMaterials().find((item) => item.code === code);
  matAttachState.code = code;
  const title = document.getElementById('matAttachModalTitle');
  if (title) title.textContent = `物料附件 · ${m?.name || code}`;
  renderMatAttachmentLists(code);
  openModal('modalMatAttachments');
}

function onMatAttachmentUpload(input) {
  const files = input?.files;
  if (!files?.length) return;
  const code = getMatEditingCode();
  if (!code) {
    toast('请先填写物料编码后再上传附件', 'warn');
    input.value = '';
    return;
  }
  Array.from(files).forEach((file) => uploadMatAttachment(file, code));
  input.value = '';
}

function uploadMatAttachment(file, code) {
  if (!file || !code) return;
  if (file.size > MAT_ATTACH_MAX_BYTES) {
    toast(`「${file.name}」超过 4MB 限制`, 'warn');
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    const store = loadMatAttachmentStore();
    const list = store[code] ? [...store[code]] : [];
    const record = {
      id: `mat-att-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: file.name,
      mime: file.type || 'application/octet-stream',
      dataUrl: reader.result,
      uploadedAt: new Date().toISOString(),
      size: file.size,
    };
    list.push(record);
    store[code] = list;
    try {
      persistMatAttachmentStore(store);
    } catch {
      toast('保存失败，附件可能过大', 'warn');
      return;
    }
    matAttachState.code = code;
    renderMatAttachmentLists(code);
    renderMaterialTable();
    toast(`附件已上传：${file.name}`, 'ok');
  };
  reader.readAsDataURL(file);
}

function deleteMatAttachment(code, id) {
  const store = loadMatAttachmentStore();
  const list = store[code];
  if (!list) return;
  store[code] = list.filter((a) => a.id !== id);
  if (!store[code].length) delete store[code];
  persistMatAttachmentStore(store);
  renderMatAttachmentLists(code);
  renderMaterialTable();
  toast('附件已删除', 'ok');
}

function dataUrlToText(dataUrl) {
  if (!dataUrl) return '';
  if (!dataUrl.startsWith('data:')) return dataUrl;
  const comma = dataUrl.indexOf(',');
  const payload = dataUrl.slice(comma + 1);
  const header = dataUrl.slice(0, comma);
  if (header.includes(';base64')) {
    try {
      return decodeURIComponent(escape(atob(payload)));
    } catch {
      return atob(payload);
    }
  }
  return decodeURIComponent(payload);
}

function openMatAttachmentViewer(code, id) {
  const att = getMatAttachments(code).find((a) => a.id === id);
  if (!att) {
    toast('附件不存在', 'warn');
    return;
  }
  const mode = getMatAttachmentViewMode(att);
  if (mode === 'download') {
    downloadMatAttachment(att);
    return;
  }
  matAttachState.viewRecord = att;
  const title = document.getElementById('matFileViewTitle');
  if (title) title.textContent = `附件预览 · ${att.name}`;
  const img = document.getElementById('matFileViewImg');
  const pdf = document.getElementById('matFileViewPdf');
  const text = document.getElementById('matFileViewText');
  const fallback = document.getElementById('matFileViewDownloadOnly');
  if (img) { img.hidden = true; img.src = ''; }
  if (pdf) { pdf.hidden = true; pdf.src = ''; }
  if (text) { text.hidden = true; text.textContent = ''; }
  if (fallback) fallback.hidden = true;

  if (mode === 'image' && img) {
    img.src = att.dataUrl;
    img.hidden = false;
  } else if (mode === 'pdf' && pdf) {
    pdf.src = att.dataUrl;
    pdf.hidden = false;
  } else if (mode === 'text' && text) {
    text.textContent = dataUrlToText(att.dataUrl);
    text.hidden = false;
  } else if (fallback) {
    fallback.hidden = false;
  }
  openModal('modalMatFileView');
}

function downloadMatAttachment(record) {
  if (!record?.dataUrl) return;
  const a = document.createElement('a');
  a.href = record.dataUrl;
  a.download = record.name || 'attachment';
  a.click();
}

function downloadCurrentMatAttachment() {
  if (matAttachState.viewRecord) downloadMatAttachment(matAttachState.viewRecord);
}

document.addEventListener('DOMContentLoaded', () => {
  loadRolePages();
  initRoleSwitcher();
  bindTabs('#settingsTabs', 'tab-');
  bindTabs('#prodTabs', 'prod-');
  bindTabs('#matTabs', 'mat-');
  bindTabs('#lotDocsTabs', 'lot-docs-');
  initSysParamsForm();
  renderReceiveQualityFields({});
  renderOcrQualityFields({});
  renderSourceFilingTable();
  renderMaterialTable();
  renderInboundTable();
  renderAllAlerts();
  initWhPlanViewer();
  initFloorPlanEditor();
  ensureFloorPlansLoaded();
  initFeedMaterialFilters();
  renderFeedMaterialRows();

  document.querySelectorAll('.modal-mask').forEach((mask) => {
    mask.addEventListener('click', (e) => {
      if (e.target === mask) {
        mask.classList.remove('show');
        if (!document.querySelector('.modal-mask.show')) {
          document.body.style.overflow = '';
        }
      }
    });
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && document.getElementById('loginPage').style.display !== 'none') {
      const appHidden = !document.getElementById('app').classList.contains('show');
      if (appHidden) doLogin();
    }
    if (e.key === 'Escape') {
      document.querySelectorAll('.modal-mask.show').forEach((m) => m.classList.remove('show'));
      document.body.style.overflow = '';
    }
  });

  window.addEventListener('resize', () => {
    if (document.getElementById('app').classList.contains('cockpit-mode')) drawCockpitCharts();
  });

  const demo = new URLSearchParams(window.location.search);
  const targetPage = demo.get('page');
  if (targetPage && PAGE_TITLE[targetPage]) {
    const roleKey = demo.get('role') || 'admin';
    document.getElementById('loginRole').value = roleKey;
    doLogin();
    if (canAccessPage(targetPage, roleKey)) go(targetPage);
    const targetModal = demo.get('modal');
    if (targetModal && document.getElementById(targetModal)) openModal(targetModal);
  } else {
    restoreAuthSession();
  }
  populateWarehouseSelects();
  populateConsignorSelects();
  if (!sessionStorage.getItem('wms_wh')) sessionStorage.setItem('wms_wh', defaultWarehouseFilter());
  toggleFilingFields();
  populateInboundMaterials();
  applyAuditFilter();
});

/* ===== Visualization Cockpit ===== */
const cockpit = { timers: [] };

const CONSIGNORS = [
  { code: 'WT-001', name: '五矿有色金属股份有限公司', short: '五矿有色' },
  { code: 'WT-002', name: '广西金川有色金属有限公司', short: '广西金川' },
  { code: 'WT-003', name: '广西南国铜业有限责任公司', short: '南国铜业' },
];

function populateConsignorSelects() {
  const opts = CONSIGNORS.map((c) => `<option value="${c.name}">${c.short || c.name}</option>`).join('');
  document.querySelectorAll('[data-consignor-select]').forEach((sel) => {
    const all = sel.hasAttribute('data-consignor-select-all');
    sel.innerHTML = (all ? '<option value="">全部委托方</option>' : '') + opts;
  });
}

function consignorTag(name) {
  const c = CONSIGNORS.find((x) => x.name === name);
  const short = c ? c.short : name;
  return `<span class="tag tag-purple" title="${name}">${short}</span>`;
}

const WAREHOUSE_DEFS = [
  { no: 1, cap: 30000, slots: ['A1', 'A2', 'B1', 'B2'] },
  { no: 2, cap: 25000, slots: ['A1', 'A2', 'B1', 'B2'] },
  { no: 4, cap: 75000, slots: ['A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'D1', 'D2'], slotCaps: {
    A1: 12000, A2: 8000, B1: 15000, B2: 5500, C1: 10000, C2: 4500, D1: 11000, D2: 9000,
  } },
  { no: 5, cap: 80000, slots: ['小A', '大A前', '大A后', '小B', '大B前', '大B后', '小C', '大C前', '大C后', '小D', '大D前', '大D后'] },
  { no: 6, cap: 60000, slots: ['A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'D1', 'D2'] },
];

const STACK_DEMO = {
  '1#A1': { area: '原料区域', mat: '原料物料-A', used: 94, batch: 'BG20260728041', batchType: '报关单号', inspect: '—' },
  '1#A2': { area: '原料区域', mat: '原料物料-B', used: 66, batch: 'BG20260801022', batchType: '报关单号', inspect: '—' },
  '1#B1': { area: '原料区域', mat: '空闲', used: 12, batch: '—', batchType: '', inspect: '—' },
  '2#A1': { area: '原料区域', mat: '原料物料-A', used: 70, batch: 'BG20260715033', batchType: '报关单号', inspect: '—' },
  '4#A1': { area: '待检区域', mat: 'FL-20260803·待查验', used: 36, batch: 'FL-20260803', batchType: '生产批次', inspect: '查验中' },
  '4#A2': { area: '混成品区域', mat: '成品物料-A', used: 36, batch: 'FL-20260802', batchType: '生产批次', inspect: '已放行' },
  '4#B1': { area: '混成品区域', mat: '成品物料-A', used: 60, batch: 'FL-20260728', batchType: '生产批次', inspect: '已放行' },
  '5#小A': { area: '待检区域', mat: '原料物料-C', used: 30, batch: 'BG20260428016', batchType: '报关单号', inspect: '查验中' },
  '6#C2': { area: '混成品区域', mat: '成品物料-A', used: 62, batch: 'FL-20260801', batchType: '生产批次', inspect: '已放行' },
};

const STACK_LOTS = {
  '1#A1': [
    { consignor: '五矿', kind: '报备矿', origin: '毛里塔尼亚', weight: 4200 },
    { consignor: '五矿', kind: '报备矿', origin: 'WO LONG SONG/卧龙松', weight: 2850 },
  ],
  '1#A2': [
    { consignor: '五矿', kind: '达标', origin: '刚果金', weight: 4950 },
  ],
  '1#B2': [
    { consignor: '南国', kind: '报备矿', origin: 'DA XIN', weight: 1400 },
    { consignor: '五矿', kind: '报备矿', origin: '卧龙松', weight: 775 },
  ],
  '2#A1': [
    { consignor: '五矿', kind: '报备矿', origin: '秘鲁', weight: 4375 },
  ],
  '4#A1': [
    { consignor: '五矿', kind: '报备矿', origin: '待查验', weight: 4320 },
  ],
  '4#A2': [
    { consignor: '南国', kind: '达标', origin: '混成品', weight: 2880 },
  ],
  '4#B1': [
    { consignor: '金川', kind: '报备矿', origin: '智利', weight: 9000 },
  ],
  '5#小A': [
    { consignor: '五矿', kind: '报备矿', origin: '澳洲', weight: 2000 },
  ],
  '6#C2': [
    { consignor: '南国', kind: '达标', origin: '混成品', weight: 4650 },
  ],
};

function whLabel(no) { return `${no}仓`; }
function stackCode(no, slot) { return `${no}#${slot}`; }

function whNoFromLabel(label) {
  const m = String(label || '').match(/^(\d+)/);
  return m ? Number(m[1]) : null;
}

function updateStackCode() {
  const whSel = document.getElementById('stWhSelect');
  const slotInput = document.getElementById('stSlotName');
  const codeInput = document.getElementById('stCode');
  if (!whSel || !slotInput || !codeInput) return;
  const no = whNoFromLabel(whSel.value);
  const slot = slotInput.value.trim();
  codeInput.value = no && slot ? stackCode(no, slot) : (no ? `${no}#` : '');
}

function openNewStackModal() {
  openStackModal();
}

function openStackModal(code) {
  populateWarehouseSelects();
  let whFilter = currentWarehouse()?.filter || WAREHOUSES[0]?.filter || '1仓';
  let slot = 'A1';
  if (code) {
    const wh = WAREHOUSES.find((w) => w.stacks.some((s) => s.code === code));
    const stack = wh?.stacks.find((s) => s.code === code);
    if (wh && stack) {
      whFilter = wh.filter;
      slot = stack.slot;
    }
  }
  const whSel = document.getElementById('stWhSelect');
  const slotInput = document.getElementById('stSlotName');
  if (whSel) whSel.value = whFilter;
  if (slotInput) slotInput.value = slot;
  const customsEl = document.getElementById('stCustomsNo');
  const prodEl = document.getElementById('stProdBatch');
  if (code) {
    const wh = WAREHOUSES.find((w) => w.stacks.some((s) => s.code === code));
    const stack = wh?.stacks.find((s) => s.code === code);
    if (customsEl) customsEl.value = stack ? customsNoCell(stack.batch, stack.batchType) : '—';
    if (prodEl) prodEl.value = stack ? prodBatchCell(stack.batch, stack.batchType) : '—';
  } else {
    if (customsEl) customsEl.value = '—';
    if (prodEl) prodEl.value = '—';
  }
  updateStackCode();
  openModal('modalStack');
}

function saveStack() {
  const slot = document.getElementById('stSlotName')?.value?.trim();
  const code = document.getElementById('stCode')?.value?.trim();
  if (!slot) {
    toast('请填写堆位名称', 'warn');
    return;
  }
  if (!code || !code.includes('#')) {
    toast('堆位编码生成失败，请检查所属仓库与堆位名称', 'warn');
    return;
  }
  closeModal('modalStack');
  toast(`堆位 ${code} 已保存（原型演示）`, 'ok');
}

function whCls(no) {
  if (no === 1 || no === 2) return 'raw';
  if (no === 5) return 'mix';
  return 'fg';
}

function buildWarehouses() {
  return WAREHOUSE_DEFS.map((def) => {
    const equalCap = Math.round(def.cap / def.slots.length);
    const stacks = def.slots.map((slot, i) => {
      const code = stackCode(def.no, slot);
      const demo = STACK_DEMO[code] || { area: '空闲', mat: '空闲', used: 8 + ((i * 7) % 35), batch: '—', batchType: '', inspect: '—' };
      const stackCap = def.slotCaps?.[slot] ?? equalCap;
      const usedTon = Math.round(stackCap * demo.used / 100);
      return { code, slot, area: demo.area, mat: demo.mat, used: demo.used, cap: stackCap, usedTon, batch: demo.batch, batchType: demo.batchType || '', inspect: demo.inspect };
    });
    const occ = Math.round(stacks.reduce((s, x) => s + x.used, 0) / stacks.length);
    const usedTotal = stacks.reduce((s, x) => s + x.usedTon, 0);
    const firstStack = stacks.find((s) => s.batch !== '—') || stacks[0];
    return {
      id: `wh${def.no}`,
      no: def.no,
      name: whLabel(def.no),
      filter: whLabel(def.no),
      cap: def.cap,
      stackCount: def.slots.length,
      usedTotal,
      occ,
      cls: whCls(def.no),
      zone: `${firstStack.code} · ${firstStack.area}`,
      stacks,
      status: '启用',
    };
  });
}

const WAREHOUSES = buildWarehouses();
const STACK_TOTAL = WAREHOUSES.reduce((s, w) => s + w.stacks.length, 0);

function areaTagHtml(area) {
  if (area.includes('待检')) return '<span class="tag tag-orange">待检区域</span>';
  if (area.includes('混成品')) return '<span class="tag tag-green">混成品区域</span>';
  if (area.includes('成品')) return '<span class="tag tag-green">成品区域</span>';
  if (area.includes('原料')) return '<span class="tag tag-blue">原料区域</span>';
  return `<span class="tag">${area}</span>`;
}

function inspectTagHtml(inspect) {
  if (inspect === '查验中') return '<span class="tag tag-orange">查验中</span>';
  if (inspect === '已放行') return '<span class="tag tag-green">已放行</span>';
  return '—';
}

function isCustomsBatchType(batchType) {
  return batchType === '报关单号';
}

function isProdBatchType(batchType) {
  return batchType === '生产批次' || batchType === '生产批次号';
}

function customsNoCell(batch, batchType) {
  if (isCustomsBatchType(batchType) && batch && batch !== '—') return batch;
  return '—';
}

function prodBatchCell(batch, batchType) {
  if (isProdBatchType(batchType) && batch && batch !== '—') return batch;
  return '—';
}

function batchCellHtml(batch, batchType) {
  if (!batch || batch === '—') return '—';
  if (isProdBatchType(batchType)) return `${batch} <span class="tag tag-green">生产批次</span>`;
  if (isCustomsBatchType(batchType)) return `${batch} <span class="tag tag-blue">报关单</span>`;
  return batch;
}

function renderStackTable() {
  const tbody = document.getElementById('stackTableBody');
  if (!tbody) return;
  const wh = currentWarehouse();
  if (!wh) {
    tbody.innerHTML = '';
    return;
  }
  tbody.innerHTML = wh.stacks.map((s) => {
    const usedPctHtml = s.used >= 70 ? `<span class="tag tag-orange">${s.used}%</span>` : `${s.used}%`;
    const ops = [`<button class="btn-text" onclick="openStackModal('${s.code}')">编辑</button>`];
    if (s.inspect === '查验中') ops.push('<button class="btn-text" onclick="openModal(\'modalInspect\')">查验完成</button>');
    return `<tr data-wh="${wh.filter}" data-code="${s.code}">
      <td>${s.code}</td><td>${wh.name}</td><td>${areaTagHtml(s.area)}</td><td>${customsNoCell(s.batch, s.batchType)}</td><td>${prodBatchCell(s.batch, s.batchType)}</td>
      <td>${s.cap.toLocaleString('zh-CN')}</td><td>${s.usedTon.toLocaleString('zh-CN')} / ${usedPctHtml}</td>
      <td>${inspectTagHtml(s.inspect)}</td><td><span class="tag tag-green">启用</span></td>
      <td class="ops">${ops.join('')}</td></tr>`;
  }).join('');
  const pag = document.getElementById('stackPagination');
  if (pag) pag.textContent = `共 ${wh.stacks.length} 条堆位（${wh.name}）`;
}

function renderWarehouseTable() {
  const tbody = document.getElementById('warehouseTableBody');
  if (!tbody) return;
  tbody.innerHTML = WAREHOUSES.map((wh) => `
    <tr>
      <td>${wh.no}</td>
      <td>${wh.name}</td>
      <td>${wh.cap.toLocaleString('zh-CN')}</td>
      <td>${wh.stackCount}</td>
      <td>${wh.usedTotal.toLocaleString('zh-CN')} / ${wh.occ}%</td>
      <td><span class="tag tag-green">${wh.status}</span></td>
      <td class="ops">
        <button class="btn-text" onclick="goWarehouse('${wh.id}')">查看堆位</button>
        <button class="btn-text" onclick="openModal('modalWarehouse')">编辑</button>
      </td>
    </tr>
  `).join('');
}

function populateWarehouseSelects() {
  const opts = WAREHOUSES.map((w) => `<option value="${w.filter}">${w.name}</option>`).join('');
  document.querySelectorAll('[data-wh-select]').forEach((sel) => {
    const all = sel.hasAttribute('data-wh-select-all');
    sel.innerHTML = (all ? '<option value="">全部仓库</option>' : '') + opts;
  });
}

function stackAreaClass(area) {
  if (area.includes('待检')) return 'qc';
  if (area.includes('混成品')) return 'mix';
  if (area.includes('成品')) return 'fg';
  return 'raw';
}

function stackLevel(used) {
  if (used >= 85) return 'lv-crit';
  if (used >= 70) return 'lv-high';
  if (used >= 40) return 'lv-mid';
  return 'lv-low';
}

function renderStackIsoSvg(level) {
  const colors = {
    'lv-low': { top: '#4A8FA8', left: '#2E6078', right: '#3A7890' },
    'lv-mid': { top: '#5A8FD4', left: '#3A6098', right: '#4878B0' },
    'lv-high': { top: '#C49A48', left: '#8A6828', right: '#A88438' },
    'lv-crit': { top: '#C45868', left: '#8A3848', right: '#A84858' },
  };
  const c = colors[level] || colors['lv-low'];
  return `<svg class="stack-iso-svg" viewBox="0 0 20 16" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path d="M2 11 L10 7 L18 11 L10 15 Z" fill="${c.left}" opacity="0.35"/>
    <path d="M2 11 L2 8 L10 4 L10 7 Z" fill="${c.left}"/>
    <path d="M10 7 L10 4 L18 8 L18 11 Z" fill="${c.right}"/>
    <path d="M2 8 L10 4 L18 8 L10 12 Z" fill="${c.top}"/>
  </svg>`;
}

const FLOW_LOGS = [
  { time: '14:32', type: '入仓', cls: 'in', text: 'RK-20260803-001 · 物料 800 湿吨 · 1仓' },
  { time: '14:18', type: '出仓', cls: 'out', text: 'CK-20260803-012 · 成品 180 干吨 · 华东冶炼' },
  { time: '13:55', type: '生产', cls: 'prod', text: 'FL-20260803 · 3 票报关单投料 200 干吨' },
  { time: '13:40', type: '称重', cls: 'weigh', text: 'RK-20260801-015 · 湿 800 / 干 720' },
  { time: '13:22', type: '上架', cls: 'put', text: '4#A1 · 生产批次 FL-20260803 上架，片区标识：待检区域' },
  { time: '12:58', type: '完工', cls: 'done', text: 'WG-20260803-01 · 成品 180 干吨入库' },
  { time: '12:35', type: '入仓', cls: 'in', text: 'RK-20260803-002 · 物料 620 湿吨 · 2仓' },
  { time: '11:48', type: '出仓', cls: 'out', text: 'CK-20260803-008 · 成品 95 干吨 · 华南冶炼' },
  { time: '11:20', type: '生产', cls: 'prod', text: 'TL-20260803-003 · 投料物料 150 干吨' },
  { time: '10:45', type: '称重', cls: 'weigh', text: 'RK-20260802-028 · 湿 540 / 干 486' },
  { time: '10:12', type: '入仓', cls: 'in', text: 'RK-20260802-028 · 物料 540 湿吨 · 1仓' },
  { time: '09:30', type: '出仓', cls: 'out', text: 'CK-20260803-005 · 成品 120 干吨 · 丰联铜业' },
];

const PROD_DATA = {
  batchId: 'FL-20260803',
  workOrder: 'WO-20260803-01',
  totalTons: 5031.0,
  startDate: '2026-08-03',
  endDate: '2026-08-07',
  cumulative: 180.0,
};

function formatProdTons(n) {
  return Number(n).toFixed(2);
}

const PROD_SCENE_VIDEO = 'assets/scene.mp4?v=clean1';
const PROD_SCENE_POSTER = 'assets/scene-poster.jpg?v=clean1';

const ALERTS_STATIC = [
  { lvl: 'high', type: '库容占用', target: '1#A1', title: '库容占用达阈值', desc: '1#A1 占用 94%，建议移库疏导', time: '08:00', page: 'transfer', action: '移库疏导', actionFn: 'go(\'transfer\')' },
  { lvl: 'mid', type: '原料库龄', target: 'BG20260428016', title: '原料库龄超期', desc: '报关单号在库 98 天，超过库龄预警阈值', time: '08:00', page: 'alert', action: '追溯台账', actionFn: 'openModal(\'modalLedger\')' },
  { lvl: 'high', type: '账实差异', target: 'YL-CU-001', title: '账实差异 2.5 吨', desc: '账册库存与实物差 2.5 吨', time: '07:30', page: 'customs', action: '对账', actionFn: 'go(\'customs\')' },
];

function buildAlertList() {
  const params = loadSysParams();
  const list = [...ALERTS_STATIC];
  loadSourceFilings().forEach((f) => {
    const rem = filingRemaining(f);
    const pct = filingUsagePct(f);
    if (rem > 0 && pct >= params.filingUsageAlertPct) {
      list.push({
        lvl: pct >= 95 ? 'high' : 'mid',
        type: '矿源备案',
        target: f.code,
        title: `矿源备案用量达 ${params.filingUsageAlertPct}%`,
        desc: `${f.code} 用量 ${pct.toFixed(2)}%，剩余 ${rem.toFixed(2)} DMT`,
        time: '08:00',
        page: 'materials',
        action: '查看备案',
        actionFn: 'go(\'materials\')',
      });
    }
  });
  return list;
}

function alertLevelTag(lvl) {
  if (lvl === 'high') return '<span class="tag tag-red">高</span>';
  return '<span class="tag tag-orange">中</span>';
}

function renderAlertPage() {
  const tbody = document.getElementById('alertTableBody');
  if (!tbody) return;
  tbody.innerHTML = buildAlertList().map((a) => `
    <tr>
      <td>${alertLevelTag(a.lvl)}</td>
      <td>${a.type}</td>
      <td>${a.target}</td>
      <td>${a.desc}</td>
      <td>2026-08-03 ${a.time}</td>
      <td class="ops"><button class="btn-text" onclick="${a.actionFn}">${a.action}</button></td>
    </tr>
  `).join('');
}

function renderAllAlerts() {
  renderAlerts();
  renderAlertPage();
}

const WH_ISO_PALETTE = {
  raw: { top: '#7CB8E8', left: '#3D6F9E', right: '#4E84B5', roof: '#2A5580', ground: '#162838', door: '#1E3A52', accent: '#5A9FD4' },
  mix: { top: '#B0A4E8', left: '#6E62A8', right: '#8578BF', roof: '#524888', ground: '#221E38', door: '#342E52', accent: '#9B8FD4' },
  fg: { top: '#6FD4A8', left: '#3A9468', right: '#4AAA7C', roof: '#287050', ground: '#142820', door: '#1E4030', accent: '#4DB88A' },
  qc: { top: '#E8C878', left: '#A88438', right: '#C49A48', roof: '#886828', ground: '#302818', door: '#483818', accent: '#D4A850' },
};

function renderWhIsoSvg(cls, occ, whId) {
  const c = WH_ISO_PALETTE[cls] || WH_ISO_PALETTE.raw;
  const fill = Math.round(occ * 0.38);
  const gid = `g-${whId}`;
  return `<svg class="wh-iso-svg" viewBox="0 0 200 128" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <defs>
      <linearGradient id="${gid}" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="${c.top}" stop-opacity="0.95"/>
        <stop offset="100%" stop-color="${c.left}" stop-opacity="0.85"/>
      </linearGradient>
    </defs>
    <ellipse cx="100" cy="112" rx="72" ry="10" fill="rgba(0,0,0,0.28)"/>
    <path d="M18 88 L100 48 L182 88 L100 128 Z" fill="${c.ground}" stroke="rgba(255,255,255,0.06)" stroke-width="0.6"/>
    <path d="M52 52 L52 90 L100 114 L100 76 Z" fill="${c.left}"/>
    <path d="M100 76 L100 114 L148 90 L148 52 Z" fill="${c.right}"/>
    <path d="M52 52 L100 30 L148 52 L100 76 Z" fill="url(#${gid})"/>
    <path d="M52 52 L100 30 L100 38 L52 60 Z" fill="${c.roof}" opacity="0.92"/>
    <path d="M100 30 L148 52 L148 60 L100 38 Z" fill="${c.roof}" opacity="0.78"/>
    <path d="M68 78 L68 92 L84 100 L84 86 Z" fill="${c.door}" opacity="0.55"/>
    <path d="M108 ${92 - fill} L108 92 L136 78 L136 ${78 - fill * 0.72} Z" fill="${c.accent}" opacity="0.42"/>
    <path d="M118 38 L132 46 L132 50 L118 42 Z" fill="rgba(255,255,255,0.12)"/>
    <path d="M62 94 L78 102 L78 98 L62 90 Z" fill="rgba(0,0,0,0.12)"/>
  </svg>`;
}

function initCockpit() {
  renderYard();
  renderFlow();
  renderProdData();
  renderAlerts();
  renderAlertPage();
  renderCapList();
  animateKpis();
  stopCockpit();
  cockpit.timers.push(setInterval(tickCockpitClock, 1000));
  cockpit.timers.push(setInterval(tickProdData, 1800));
  tickCockpitClock();
  requestAnimationFrame(() => requestAnimationFrame(() => drawCockpitCharts()));
}

function stopCockpit() {
  cockpit.timers.forEach((t) => clearInterval(t));
  cockpit.timers = [];
  const tip = document.getElementById('ckTip');
  if (tip) tip.hidden = true;
}

/* ===== 仓库平面图（堆位管理编辑 + 驾驶舱展示） ===== */
const FP_STORAGE_KEY = 'wms_floor_plans';
const FP_API_BASE = ((typeof location !== 'undefined' && location.hostname === 'wms.skd.wang')
  ? ''
  : 'http://wms.skd.wang') + '/api';
const FP_W = 1000;
const FP_H = 560;
const FP_PAD = 36;
const FP_LABEL_W = 46;
const FP_STACK_COLORS = ['#d4a84a', '#c9b07a', '#e8c4a0', '#c5d89a', '#d8b060', '#b7c98a'];
const FP_GRID = 20;
const FP_ANGLE_SNAP = 90;
const FP_HISTORY_MAX = 100;
const FP_DRAG_SLOP = 4;

const fpEditor = {
  whId: null,
  rooms: 1,
  doors: 3,
  items: [],
  selectedId: null,
  drag: null,
  snap: true,
  history: { past: [], future: [] },
  nameBefore: null,
};

const whPlanState = { whId: null, scale: 1, rotate: 0, tx: 0, ty: 0 };
const whPlanDrag = { active: false, x: 0, y: 0 };

const floorPlanCache = {};
let floorPlansReady = false;

function getFloorPlan(whId) {
  return floorPlanCache[whId] || null;
}

function setFloorPlanCache(whId, plan) {
  if (plan) floorPlanCache[whId] = plan;
  else delete floorPlanCache[whId];
}

async function fetchJsonApi(url, opts) {
  const res = await fetch(url, { ...opts, headers: { Accept: 'application/json', ...(opts && opts.headers) } });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    if (!res.ok || !text) throw new Error(`平面图接口失败 (${res.status || '网络错误'})`);
    throw new Error(res.status === 404 ? '平面图接口 404，请更新并重启 api（server.py）后重载 Nginx' : '平面图接口返回了非 JSON');
  }
  if (!json || json.success === false) {
    throw new Error((json && json.message) || `平面图接口失败 (${res.status})`);
  }
  return json;
}

async function fetchFloorPlansFromApi() {
  const json = await fetchJsonApi(`${FP_API_BASE}/floor-plans`);
  const plans = (json.data && json.data.plans) || {};
  Object.keys(floorPlanCache).forEach((k) => { delete floorPlanCache[k]; });
  Object.entries(plans).forEach(([id, plan]) => {
    if (plan) floorPlanCache[id] = plan;
  });
}

async function putFloorPlanToApi(whId, plan) {
  const json = await fetchJsonApi(`${FP_API_BASE}/floor-plans`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: whId, ...plan }),
  });
  const saved = (json.data && Array.isArray(json.data.items)) ? json.data : plan;
  setFloorPlanCache(whId, saved);
  return saved;
}

async function migrateLocalFloorPlans() {
  let local = {};
  try {
    const raw = localStorage.getItem(FP_STORAGE_KEY);
    local = raw ? JSON.parse(raw) : {};
  } catch {
    local = {};
  }
  const ids = Object.keys(local || {});
  if (!ids.length) return;
  for (let i = 0; i < ids.length; i += 1) {
    const id = ids[i];
    if (floorPlanCache[id] || !local[id] || !Array.isArray(local[id].items) || !local[id].items.length) continue;
    try {
      await putFloorPlanToApi(id, local[id]);
    } catch {
      /* 后端不可用时保留本地，下次再迁 */
      return;
    }
  }
  try {
    localStorage.removeItem(FP_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

async function ensureFloorPlansLoaded() {
  if (floorPlansReady) return;
  try {
    await fetchFloorPlansFromApi();
    await migrateLocalFloorPlans();
  } catch {
    try {
      const raw = localStorage.getItem(FP_STORAGE_KEY);
      const local = raw ? JSON.parse(raw) : {};
      Object.entries(local || {}).forEach(([id, plan]) => {
        if (!floorPlanCache[id] && plan) floorPlanCache[id] = plan;
      });
    } catch {
      /* ignore */
    }
  }
  floorPlansReady = true;
}

function clampFpCount(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(12, Math.round(v)));
}

function fpInnerBox() {
  return {
    x: FP_PAD,
    y: FP_PAD,
    w: FP_W - FP_PAD * 2 - FP_LABEL_W,
    h: FP_H - FP_PAD * 2,
  };
}

function fpSnapOn(evt) {
  if (evt?.shiftKey) return false;
  return fpEditor.snap !== false;
}

function fpSnapCoord(v, origin) {
  return origin + Math.round((v - origin) / FP_GRID) * FP_GRID;
}

function fpSnapAngle(deg) {
  return Math.round(deg / FP_ANGLE_SNAP) * FP_ANGLE_SNAP;
}

function snapItemBBoxToGrid(it) {
  ensureItemPts(it);
  const box = fpInnerBox();
  const bb = ptsToBBox(it.pts);
  translatePts(it, fpSnapCoord(bb.x, box.x) - bb.x, fpSnapCoord(bb.y, box.y) - bb.y);
}

function cloneFpState() {
  return {
    rooms: fpEditor.rooms,
    doors: fpEditor.doors,
    selectedId: fpEditor.selectedId,
    items: JSON.parse(JSON.stringify(fpEditor.items || [])),
  };
}

function fpLayoutKey(state) {
  return JSON.stringify({
    rooms: state.rooms,
    doors: state.doors,
    items: state.items,
  });
}

function applyFpState(state) {
  fpEditor.rooms = state.rooms;
  fpEditor.doors = state.doors;
  fpEditor.items = JSON.parse(JSON.stringify(state.items || []));
  fpEditor.selectedId = state.selectedId;
  const roomEl = document.getElementById('fpRoomCount');
  const doorEl = document.getElementById('fpDoorCount');
  if (roomEl) roomEl.value = fpEditor.rooms;
  if (doorEl) doorEl.value = fpEditor.doors;
}

function fpResetHistory() {
  fpEditor.history = { past: [], future: [] };
  syncFpHistoryButtons();
}

function fpCommit(before) {
  if (!before || fpLayoutKey(before) === fpLayoutKey(cloneFpState())) return;
  fpEditor.history.past.push(before);
  if (fpEditor.history.past.length > FP_HISTORY_MAX) fpEditor.history.past.shift();
  fpEditor.history.future = [];
  syncFpHistoryButtons();
}

function fpUndo() {
  if (!fpEditor.history.past.length) return;
  fpEditor.history.future.push(cloneFpState());
  applyFpState(fpEditor.history.past.pop());
  syncFpHistoryButtons();
  paintFloorPlanEditor();
}

function fpRedo() {
  if (!fpEditor.history.future.length) return;
  fpEditor.history.past.push(cloneFpState());
  applyFpState(fpEditor.history.future.pop());
  syncFpHistoryButtons();
  paintFloorPlanEditor();
}

function fpToggleSnap(force) {
  fpEditor.snap = typeof force === 'boolean' ? force : !fpEditor.snap;
  const el = document.getElementById('fpSnapToggle');
  if (el) el.checked = fpEditor.snap;
  paintFloorPlanEditor();
}

function syncFpHistoryButtons() {
  const undo = document.getElementById('fpUndoBtn');
  const redo = document.getElementById('fpRedoBtn');
  if (undo) undo.disabled = !fpEditor.history.past.length;
  if (redo) redo.disabled = !fpEditor.history.future.length;
}

function isFpEditorOpen() {
  return document.getElementById('modalFloorPlan')?.classList.contains('show');
}

function onFpKeydown(e) {
  if (!isFpEditorOpen()) return;
  const typing = e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable);
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
    if (typing) return;
    e.preventDefault();
    if (e.shiftKey) fpRedo();
    else fpUndo();
    return;
  }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
    if (typing) return;
    e.preventDefault();
    fpRedo();
    return;
  }
  if (!typing && e.key.toLowerCase() === 'g' && !e.ctrlKey && !e.metaKey) {
    e.preventDefault();
    fpToggleSnap();
  }
}

function fpRoomItems(items) {
  return (items || []).filter((it) => it.type === 'room');
}

function fpSolidItems(items) {
  return (items || []).filter((it) => it.type === 'stack' || it.type === 'room');
}

function rectToPts(x, y, w, h) {
  return [
    { x, y },
    { x: x + w, y },
    { x: x + w, y: y + h },
    { x, y: y + h },
  ];
}

function ensureItemPts(it) {
  if (!it.pts || it.pts.length !== 4) {
    it.pts = rectToPts(Number(it.x) || 0, Number(it.y) || 0, Number(it.w) || 40, Number(it.h) || 32);
  }
  it.pts = it.pts.map((p) => ({ x: Number(p.x), y: Number(p.y) }));
  return it;
}

function normalizeRectItem(it) {
  ensureItemPts(it);
  const bb = ptsToBBox(it.pts);
  const minW = it.type === 'door' ? 1 : 40;
  const minH = it.type === 'door' ? 16 : 32;
  const w = Math.max(bb.w || minW, minW);
  const h = Math.max(bb.h || minH, minH);
  it.pts = rectToPts(bb.x, bb.y, w, h);
  it.x = bb.x;
  it.y = bb.y;
  it.w = w;
  it.h = h;
  it.rot = 0;
  return it;
}

function ptsToBBox(pts) {
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

function polygonCentroid(pts) {
  const n = pts.length || 1;
  return {
    x: pts.reduce((s, p) => s + p.x, 0) / n,
    y: pts.reduce((s, p) => s + p.y, 0) / n,
  };
}

function translatePts(it, dx, dy) {
  ensureItemPts(it);
  it.pts.forEach((p) => {
    p.x += dx;
    p.y += dy;
  });
  const bb = ptsToBBox(it.pts);
  it.x = bb.x;
  it.y = bb.y;
  it.w = bb.w;
  it.h = bb.h;
}

function rotatePtsAround(it, deg, cx, cy) {
  ensureItemPts(it);
  const rad = (deg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  it.pts.forEach((p) => {
    const dx = p.x - cx;
    const dy = p.y - cy;
    p.x = cx + dx * cos - dy * sin;
    p.y = cy + dx * sin + dy * cos;
  });
  it.rot = ((Number(it.rot) || 0) + deg) % 360;
  const bb = ptsToBBox(it.pts);
  it.x = bb.x;
  it.y = bb.y;
  it.w = bb.w;
  it.h = bb.h;
}

function ptsAttr(pts) {
  return pts.map((p) => `${p.x},${p.y}`).join(' ');
}

function clampPolygonToGrid(it) {
  ensureItemPts(it);
  const box = fpInnerBox();
  const bb = ptsToBBox(it.pts);
  let dx = 0;
  let dy = 0;
  if (bb.x < box.x) dx = box.x - bb.x;
  if (bb.y < box.y) dy = box.y - bb.y;
  if (bb.x + bb.w + dx > box.x + box.w) dx = box.x + box.w - (bb.x + bb.w);
  if (bb.y + bb.h + dy > box.y + box.h) dy = box.y + box.h - (bb.y + bb.h);
  if (dx || dy) translatePts(it, dx, dy);
  const bb2 = ptsToBBox(it.pts);
  if (bb2.w > box.w + 0.5 || bb2.h > box.h + 0.5) {
    const c = polygonCentroid(it.pts);
    const s = Math.min(box.w / Math.max(bb2.w, 1), box.h / Math.max(bb2.h, 1), 1);
    it.pts.forEach((p) => {
      p.x = c.x + (p.x - c.x) * s;
      p.y = c.y + (p.y - c.y) * s;
    });
    translatePts(it, 0, 0);
    const bb3 = ptsToBBox(it.pts);
    let sx = 0;
    let sy = 0;
    if (bb3.x < box.x) sx = box.x - bb3.x;
    if (bb3.y < box.y) sy = box.y - bb3.y;
    if (bb3.x + bb3.w + sx > box.x + box.w) sx = box.x + box.w - (bb3.x + bb3.w);
    if (bb3.y + bb3.h + sy > box.y + box.h) sy = box.y + box.h - (bb3.y + bb3.h);
    if (sx || sy) translatePts(it, sx, sy);
  }
  return it;
}

function subtractIntervals(x0, x1, cuts) {
  let segs = [{ x: x0, w: Math.max(0, x1 - x0) }];
  (cuts || []).forEach((cut) => {
    const next = [];
    segs.forEach((seg) => {
      const a = seg.x;
      const b = seg.x + seg.w;
      const c = Math.max(cut.x, a);
      const d = Math.min(cut.x + cut.w, b);
      if (d <= c + 0.5) {
        next.push(seg);
        return;
      }
      if (c - a > 3) next.push({ x: a, w: c - a });
      if (b - d > 3) next.push({ x: d, w: b - d });
    });
    segs = next;
  });
  return segs.filter((s) => s.w > 6);
}

function roomsCuttingBand(rooms, band) {
  const pad = 4;
  return (rooms || []).map((r) => {
    const y1 = Math.max(r.y, band.y);
    const y2 = Math.min(r.y + r.h, band.y + band.h);
    if (y2 - y1 < 6) return null;
    const x1 = Math.max(r.x, band.x) - pad;
    const x2 = Math.min(r.x + r.w, band.x + band.w) + pad;
    if (x2 - x1 < 6) return null;
    return { x: x1, w: x2 - x1 };
  }).filter(Boolean);
}

function layoutStacksInBand(list, band, rooms) {
  if (!list.length) return [];
  const cuts = roomsCuttingBand(rooms, band);
  let segs = subtractIntervals(band.x, band.x + band.w, cuts);
  if (!segs.length) segs = [{ x: band.x, w: Math.max(24, band.w * 0.25) }];
  const totalCap = list.reduce((s, x) => s + x.cap, 0) || 1;
  const totalFree = segs.reduce((s, g) => s + g.w, 0) || 1;
  const remain = segs.map((g) => ({ x: g.x, w: g.w, used: 0 }));
  let segIdx = 0;
  return list.map((s) => {
    const need = (s.cap / totalCap) * totalFree;
    while (segIdx < remain.length && remain[segIdx].w - remain[segIdx].used < 8) segIdx += 1;
    if (segIdx >= remain.length) segIdx = remain.length - 1;
    let g = remain[segIdx];
    const leftover = g.w - g.used;
    if (need > leftover + 1 && segIdx + 1 < remain.length) {
      segIdx += 1;
      g = remain[segIdx];
    }
    const take = Math.min(need, Math.max(8, g.w - g.used));
    const rect = {
      code: s.code,
      slot: s.slot,
      x: g.x + g.used,
      y: band.y,
      w: take,
      h: band.h,
      cap: s.cap,
      usedTon: s.usedTon,
      used: s.used,
    };
    g.used += take;
    return rect;
  });
}

function computeStackRects(wh, rooms) {
  const box = fpInnerBox();
  const stacks = wh.stacks || [];
  const topN = Math.max(1, Math.ceil(stacks.length / 2));
  const top = stacks.slice(0, topN);
  const bot = stacks.slice(topN);
  const bandH = box.h / 2;
  const topBand = { x: box.x, y: box.y, w: box.w, h: bandH };
  const botBand = { x: box.x, y: box.y + bandH, w: box.w, h: bandH };
  return {
    rects: [
      ...layoutStacksInBand(top, topBand, rooms),
      ...layoutStacksInBand(bot, botBand, rooms),
    ],
  };
}

function defaultDoorItems(count) {
  const box = fpInnerBox();
  const n = clampFpCount(count);
  const topN = Math.ceil(n / 2);
  const botN = n - topN;
  const doorW = 72;
  const doorH = 22;
  const items = [];
  function place(num, y, startNo, rtl) {
    for (let i = 0; i < num; i++) {
      const idx = rtl ? num - 1 - i : i;
      const x = box.x + (box.w / (num + 1)) * (idx + 1) - doorW / 2;
      const no = startNo + i;
      items.push({
        id: `door-${no}`,
        type: 'door',
        x,
        y,
        w: doorW,
        h: doorH,
        rot: 0,
        label: `${no}号门`,
        pts: rectToPts(x, y, doorW, doorH),
      });
    }
  }
  place(botN, box.y + box.h - doorH, 1, false);
  place(topN, box.y, botN + 1, true);
  return items;
}

function defaultRoomItems(count, wh) {
  const box = fpInnerBox();
  const n = clampFpCount(count);
  if (!n) return [];
  const stacks = wh?.stacks || [];
  const totalCap = stacks.reduce((s, x) => s + x.cap, 0) || 1;
  const avgCap = totalCap / Math.max(stacks.length, 1);
  const roomWeight = avgCap * n;
  const stripW = Math.max(72, Math.min(box.w * 0.42, box.w * (roomWeight / (totalCap + roomWeight))));
  const roomH = box.h / n;
  const x = box.x + box.w - stripW;
  return Array.from({ length: n }, (_, i) => {
    const y = box.y + i * roomH;
    return {
      id: `room-${i + 1}`,
      type: 'room',
      x,
      y,
      w: stripW,
      h: roomH,
      rot: 0,
      label: `功能区${i + 1}`,
      pts: rectToPts(x, y, stripW, roomH),
    };
  });
}

function defaultStackItems(wh, rooms) {
  const layout = computeStackRects(wh, rooms || []);
  return layout.rects.map((r, i) => ({
    id: `stack-${r.code}`,
    type: 'stack',
    code: r.code,
    slot: r.slot,
    label: r.code,
    cap: r.cap,
    usedTon: r.usedTon,
    used: r.used,
    color: i,
    rot: 0,
    x: r.x,
    y: r.y,
    w: r.w,
    h: r.h,
    pts: rectToPts(r.x, r.y, r.w, r.h),
  }));
}

function polyNormals(pts) {
  return pts.map((p, i) => {
    const q = pts[(i + 1) % pts.length];
    const ex = q.x - p.x;
    const ey = q.y - p.y;
    const len = Math.hypot(ex, ey) || 1;
    return { x: -ey / len, y: ex / len };
  });
}

function projectPoly(pts, n) {
  let min = Infinity;
  let max = -Infinity;
  pts.forEach((p) => {
    const d = p.x * n.x + p.y * n.y;
    if (d < min) min = d;
    if (d > max) max = d;
  });
  return { min, max };
}

function overlapMTV(aPts, bPts) {
  let minOverlap = Infinity;
  let nx = 0;
  let ny = 0;
  const axes = polyNormals(aPts).concat(polyNormals(bPts));
  const ca = polygonCentroid(aPts);
  const cb = polygonCentroid(bPts);
  for (let i = 0; i < axes.length; i += 1) {
    const n = axes[i];
    const pa = projectPoly(aPts, n);
    const pb = projectPoly(bPts, n);
    const o = Math.min(pa.max, pb.max) - Math.max(pa.min, pb.min);
    if (o <= 0) return null;
    if (o < minOverlap) {
      minOverlap = o;
      const sign = (cb.x - ca.x) * n.x + (cb.y - ca.y) * n.y >= 0 ? 1 : -1;
      nx = n.x * sign;
      ny = n.y * sign;
    }
  }
  return { dx: nx * minOverlap, dy: ny * minOverlap };
}

function pointSegDelta(px, py, ax, ay, bx, by) {
  const abx = bx - ax;
  const aby = by - ay;
  const den = abx * abx + aby * aby || 1;
  const t = Math.max(0, Math.min(1, ((px - ax) * abx + (py - ay) * aby) / den));
  const qx = ax + t * abx;
  const qy = ay + t * aby;
  return { d: Math.hypot(px - qx, py - qy), dx: qx - px, dy: qy - py };
}

function snapItemEdges(it, others) {
  const SNAP = 14;
  ensureItemPts(it);
  const box = ptsToBBox(it.pts);
  const grid = fpInnerBox();
  let dx = 0;
  let dy = 0;
  const l = box.x;
  const r = box.x + box.w;
  const t = box.y;
  const b = box.y + box.h;
  if (Math.abs(l - grid.x) < SNAP) dx = grid.x - l;
  else if (Math.abs(r - (grid.x + grid.w)) < SNAP) dx = grid.x + grid.w - r;
  if (Math.abs(t - grid.y) < SNAP) dy = grid.y - t;
  else if (Math.abs(b - (grid.y + grid.h)) < SNAP) dy = grid.y + grid.h - b;
  others.forEach((o) => {
    if (!o.pts) return;
    const ob = ptsToBBox(o.pts);
    const ol = ob.x;
    const orr = ob.x + ob.w;
    const ot = ob.y;
    const obb = ob.y + ob.h;
    [[l, ol], [l, orr], [r, ol], [r, orr]].forEach(([a, c]) => {
      if (Math.abs(a + dx - c) < SNAP) dx = c - a;
    });
    [[t, ot], [t, obb], [b, ot], [b, obb]].forEach(([a, c]) => {
      if (Math.abs(a + dy - c) < SNAP) dy = c - a;
    });
  });
  if (dx || dy) translatePts(it, dx, dy);

  let best = SNAP;
  let sdx = 0;
  let sdy = 0;
  const consider = (px, py, ax, ay, bx, by, sign) => {
    const r = pointSegDelta(px, py, ax, ay, bx, by);
    if (r.d < best) {
      best = r.d;
      sdx = r.dx * sign;
      sdy = r.dy * sign;
    }
  };
  others.forEach((o) => {
    if (!o.pts) return;
    it.pts.forEach((p) => {
      o.pts.forEach((a, i) => {
        const b = o.pts[(i + 1) % o.pts.length];
        consider(p.x, p.y, a.x, a.y, b.x, b.y, 1);
      });
    });
    o.pts.forEach((p) => {
      it.pts.forEach((a, i) => {
        const b = it.pts[(i + 1) % it.pts.length];
        consider(p.x, p.y, a.x, a.y, b.x, b.y, -1);
      });
    });
  });
  if (sdx || sdy) translatePts(it, sdx, sdy);
}

function resolveItemOverlaps(it, others) {
  ensureItemPts(it);
  for (let k = 0; k < 10; k += 1) {
    let moved = false;
    others.forEach((o) => {
      ensureItemPts(o);
      const mtv = overlapMTV(it.pts, o.pts);
      if (!mtv) return;
      translatePts(it, -mtv.dx, -mtv.dy);
      moved = true;
    });
    clampPolygonToGrid(it);
    if (!moved) break;
  }
}

function settleFpItem(it) {
  if (!it) return;
  normalizeRectItem(it);
  if (it.type === 'door') {
    if (fpEditor.snap) snapItemBBoxToGrid(it);
    clampPolygonToGrid(it);
    normalizeRectItem(it);
    return;
  }
  if (fpEditor.snap) snapItemBBoxToGrid(it);
  const others = fpSolidItems(fpEditor.items).filter((x) => x.id !== it.id);
  snapItemEdges(it, others);
  resolveItemOverlaps(it, others);
  clampPolygonToGrid(it);
  normalizeRectItem(it);
}

function assemblePlanItems(wh, existing, roomCount, doorCount, opts = {}) {
  const prev = existing || [];
  const keptStacks = prev.filter((it) => it.type === 'stack').map((it) => ensureItemPts({ ...it }));
  const decor = syncDecorItems({ items: prev }, roomCount, doorCount, wh, opts);
  const rooms = decor.filter((it) => it.type === 'room');
  const doors = decor.filter((it) => it.type === 'door');
  const stacks = keptStacks.length === (wh.stacks || []).length
    ? keptStacks
    : defaultStackItems(wh, rooms);
  return [...stacks, ...rooms, ...doors].map((it) => normalizeRectItem(clampPolygonToGrid(ensureItemPts(it))));
}

function clampItemToGrid(it) {
  ensureItemPts(it);
  return clampPolygonToGrid(it);
}

function syncDecorItems(plan, roomCount, doorCount, wh, opts = {}) {
  const oldRooms = (plan.items || [])
    .filter((it) => it.type === 'room')
    .map((r) => normalizeRectItem(ensureItemPts({
      ...r,
      pts: (r.pts || []).map((p) => ({ x: p.x, y: p.y })),
    })));
  const doors = (plan.items || []).filter((it) => it.type === 'door');
  const roomN = clampFpCount(roomCount);
  const doorN = clampFpCount(doorCount);
  const keepRooms = !opts.resetRooms && oldRooms.length === roomN;
  const nextRooms = keepRooms
    ? oldRooms.map((r, i) => ({
      ...r,
      id: `room-${i + 1}`,
      type: 'room',
      label: (!r.label || /^设备间\d+$/.test(r.label)) ? `功能区${i + 1}` : r.label,
    }))
    : defaultRoomItems(roomN, wh);
  const nextDoors = defaultDoorItems(doorN).map((d, i) => {
    const prev = doors[i];
    return prev
      ? { ...d, ...prev, id: d.id, type: 'door', label: prev.label || d.label }
      : d;
  });
  return [...nextRooms, ...nextDoors].map((it) => clampItemToGrid(it));
}

function lotsForStack(stack) {
  if (STACK_LOTS[stack.code]) return STACK_LOTS[stack.code].map((x) => ({ ...x }));
  if (stack.mat && stack.mat !== '空闲' && stack.usedTon > 0) {
    return [{ consignor: '', kind: '', origin: stack.mat, weight: stack.usedTon }];
  }
  return [];
}

function formatPlanWeight(t) {
  const n = Number(t) || 0;
  if (n >= 5000) {
    const w = n / 10000;
    return `${Number.isInteger(w) ? w : w.toFixed(1)}w`;
  }
  return `${Math.round(n)}吨`;
}

function escapeXml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fpFitLabel(text, bb, fill, opts = {}) {
  const raw = String(text || '').trim();
  if (!raw || !bb) return '';
  const pad = opts.pad ?? 6;
  const innerW = Math.max(8, bb.w - pad * 2);
  const innerH = Math.max(8, bb.h - pad * 2);
  const chars = [...raw];
  const n = chars.length || 1;
  const cx = bb.x + bb.w / 2;
  const cy = bb.y + bb.h / 2;
  const maxFs = opts.maxFs ?? 13;
  const minFs = opts.minFs ?? 8;
  const vertical = innerH > innerW * 1.15 && innerW < n * 11;
  if (vertical) {
    const fs = Math.max(minFs, Math.min(maxFs, innerH / (n * 1.05), innerW * 0.78));
    return `<text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="middle" fill="${fill}" font-size="${fs}" font-weight="700" transform="rotate(-90 ${cx} ${cy})">${escapeXml(raw)}</text>`;
  }
  const fs = Math.max(minFs, Math.min(maxFs, innerW / Math.max(n * 0.92, 1), innerH * 0.72));
  if (n > 4 && innerW < n * fs * 0.85 && innerH > fs * 2.2) {
    const mid = Math.ceil(n / 2);
    const l1 = chars.slice(0, mid).join('');
    const l2 = chars.slice(mid).join('');
    return `<text x="${cx}" y="${cy - fs * 0.55}" text-anchor="middle" fill="${fill}" font-size="${fs}" font-weight="700"><tspan x="${cx}" dy="0">${escapeXml(l1)}</tspan><tspan x="${cx}" dy="${fs * 1.15}">${escapeXml(l2)}</tspan></text>`;
  }
  return `<text x="${cx}" y="${cy + fs * 0.35}" text-anchor="middle" fill="${fill}" font-size="${fs}" font-weight="700">${escapeXml(raw)}</text>`;
}

function splitLotsInRect(rect, lots, usedTon, cap) {
  const pieces = [];
  const occupied = Math.min(usedTon || 0, cap || usedTon || 0);
  const empty = Math.max(0, (cap || 0) - occupied);
  const totalW = lots.reduce((s, l) => s + (l.weight || 0), 0);
  const vertical = rect.h >= rect.w;
  let cursor = vertical ? rect.y : rect.x;
  const span = vertical ? rect.h : rect.w;
  const denom = (occupied + empty) || 1;

  lots.forEach((lot) => {
    const share = occupied ? (lot.weight / (totalW || occupied)) * occupied : 0;
    const len = (share / denom) * span;
    pieces.push({
      ...lot,
      x: vertical ? rect.x : cursor,
      y: vertical ? cursor : rect.y,
      w: vertical ? rect.w : len,
      h: vertical ? len : rect.h,
    });
    cursor += len;
  });
  if (empty > 0) {
    const len = (empty / denom) * span;
    pieces.push({
      empty: true,
      x: vertical ? rect.x : cursor,
      y: vertical ? cursor : rect.y,
      w: vertical ? rect.w : len,
      h: vertical ? len : rect.h,
    });
  }
  return pieces;
}

function renderFloorPlanMarkup(wh, plan, opts = {}) {
  const overlay = !!opts.overlayMaterials;
  const interactive = !!opts.interactive;
  const selectedId = opts.selectedId || null;
  const raw = (plan.items || []).map((it) => normalizeRectItem(ensureItemPts({
    ...it,
    pts: (it.pts || []).map((p) => ({ x: p.x, y: p.y })),
  })));
  const items = raw.some((it) => it.type === 'stack')
    ? raw.map((it) => clampPolygonToGrid(it))
    : assemblePlanItems(wh, raw, plan.rooms ?? fpEditor.rooms, plan.doors ?? fpEditor.doors);
  const box = fpInnerBox();
  const uid = opts.svgId || 'fp';

  const bodySvg = items.map((it, i) => {
    const selected = interactive && it.id === selectedId;
    const isStack = it.type === 'stack';
    const fill = it.type === 'door' ? '#6b5344' : (isStack ? FP_STACK_COLORS[(it.color ?? i) % FP_STACK_COLORS.length] : '#9aa3ad');
    const stroke = selected ? '#2F80C4' : (isStack ? '#8a6a28' : '#4a5560');
    const sw = selected ? 2.5 : 1.2;
    const c = polygonCentroid(it.pts);
    const bb = ptsToBBox(it.pts);
    const stack = isStack ? wh.stacks.find((s) => s.code === it.code) : null;
    let extra = '';
    if (overlay && stack) {
      const lots = lotsForStack(stack);
      const pieces = splitLotsInRect(bb, lots, stack.usedTon, stack.cap);
      extra = pieces.map((p) => {
        if (p.empty || p.w < 10 || p.h < 10) return '';
        const lines = [p.consignor && p.kind ? `${p.consignor} ${p.kind}` : (p.consignor || p.kind || ''), p.origin, formatPlanWeight(p.weight)].filter(Boolean);
        return fpFitLabel(lines.join(' '), p, '#b42318', { maxFs: 12, minFs: 8, pad: 4 });
      }).join('');
    }
    const labelFill = isStack ? '#7a1f1f' : '#fff';
    const clipId = `${uid}-clip-${escapeXml(it.id)}`;
    let handles = '';
    if (interactive && selected) {
      handles += `<rect class="fp-select-box" x="${bb.x - 4}" y="${bb.y - 4}" width="${bb.w + 8}" height="${bb.h + 8}" fill="none" stroke="#2F80C4" stroke-width="1.2" stroke-dasharray="5 3"/>`;
    }
    if (interactive && selected && it.type !== 'door') {
      const hx = bb.x + bb.w / 2;
      const hy = bb.y - 28;
      handles += `<line class="fp-rotate-arm" x1="${hx}" y1="${bb.y - 4}" x2="${hx}" y2="${hy}" stroke="#2F80C4" stroke-width="1.5"/>
        <circle class="fp-rotate" data-id="${escapeXml(it.id)}" cx="${hx}" cy="${hy}" r="8" fill="#fff" stroke="#2F80C4" stroke-width="2"/>`;
    }
    if (interactive && selected) {
      handles += [[0, 0, 'nw'], [it.w, 0, 'ne'], [0, it.h, 'sw'], [it.w, it.h, 'se']].map(([hx2, hy2, dir]) =>
        `<rect class="fp-handle" data-id="${escapeXml(it.id)}" data-dir="${dir}" x="${it.x + hx2 - 5}" y="${it.y + hy2 - 5}" width="10" height="10" fill="#fff" stroke="#2F80C4" stroke-width="1.5"/>`
      ).join('');
    }
    const dash = isStack ? 'stroke-dasharray="4 3"' : '';
    return `<g class="fp-item${selected ? ' is-selected' : ''}" data-id="${escapeXml(it.id)}" data-type="${it.type}">
      <defs><clipPath id="${clipId}"><polygon points="${ptsAttr(it.pts)}"/></clipPath></defs>
      <polygon points="${ptsAttr(it.pts)}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" ${dash}/>
      <g clip-path="url(#${clipId})">${extra}</g>
      ${fpFitLabel(it.label || it.code || '', bb, labelFill, { maxFs: it.type === 'door' ? 12 : 13 })}
      ${handles}
    </g>`;
  }).join('');

  return `<svg id="${uid}" viewBox="0 0 ${FP_W} ${FP_H}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <pattern id="${uid}Grid" width="${FP_GRID}" height="${FP_GRID}" patternUnits="userSpaceOnUse" x="${box.x}" y="${box.y}">
        <path d="M ${FP_GRID} 0 L 0 0 0 ${FP_GRID}" fill="none" stroke="#c5ccd4" stroke-width="0.7"/>
      </pattern>
    </defs>
    <rect width="${FP_W}" height="${FP_H}" fill="#eef1f4"/>
    <rect x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" fill="url(#${uid}Grid)" stroke="#9aa3ad"/>
    ${bodySvg}
    <text x="${FP_W - 22}" y="${FP_H / 2}" text-anchor="middle" fill="#1A2332" font-size="28" font-weight="800" transform="rotate(90 ${FP_W - 22} ${FP_H / 2})">${escapeXml(wh.no)}#</text>
  </svg>`;
}

function fpSvgPoint(evt, svg) {
  const pt = svg.createSVGPoint();
  pt.x = evt.clientX;
  pt.y = evt.clientY;
  const ctm = svg.getScreenCTM();
  if (!ctm) return { x: 0, y: 0 };
  return pt.matrixTransform(ctm.inverse());
}

function selectedFpItem() {
  return fpEditor.items.find((x) => x.id === fpEditor.selectedId) || null;
}

function syncFpNameField() {
  const input = document.getElementById('fpItemName');
  if (!input) return;
  const it = selectedFpItem();
  input.disabled = !it;
  if (document.activeElement === input && it) return;
  input.value = it ? (it.label || '') : '';
  input.placeholder = it
    ? (it.type === 'door' ? '如 1号门' : it.type === 'stack' ? '堆位名称' : '如 主通道')
    : '点选堆位、门或功能区后改名';
}

function onFloorPlanNameFocus() {
  fpEditor.nameBefore = cloneFpState();
}

function onFloorPlanNameInput() {
  const it = selectedFpItem();
  const input = document.getElementById('fpItemName');
  if (!it || !input) return;
  it.label = String(input.value || '').slice(0, 16);
  paintFloorPlanEditor();
}

function onFloorPlanNameBlur() {
  const it = selectedFpItem();
  const input = document.getElementById('fpItemName');
  if (!it || !input) return;
  const name = input.value.replace(/\s+/g, ' ').trim();
  it.label = (name || (it.type === 'door' ? '门' : it.type === 'stack' ? (it.code || '堆位') : '功能区')).slice(0, 16);
  input.value = it.label;
  if (fpEditor.nameBefore) fpCommit(fpEditor.nameBefore);
  fpEditor.nameBefore = null;
  paintFloorPlanEditor();
}

function paintFloorPlanEditor() {
  const host = document.getElementById('fpCanvas');
  const wh = WAREHOUSES.find((w) => w.id === fpEditor.whId);
  if (!host || !wh) return;
  host.innerHTML = renderFloorPlanMarkup(wh, { items: fpEditor.items }, {
    interactive: true,
    selectedId: fpEditor.selectedId,
    svgId: 'fpSvg',
  });
  syncFpNameField();
  syncFpHistoryButtons();
}

function initFloorPlanEditor() {
  const wrap = document.getElementById('fpCanvasWrap');
  if (!wrap || wrap.dataset.bound) return;
  wrap.dataset.bound = '1';
  wrap.addEventListener('mousedown', onFpPointerDown);
  window.addEventListener('mousemove', (e) => {
    if (fpEditor.drag) onFpPointerMove(e);
  });
  window.addEventListener('mouseup', () => {
    if (fpEditor.drag) onFpPointerUp();
  });
  document.addEventListener('keydown', onFpKeydown);
  wrap.addEventListener('dblclick', (e) => {
    const item = e.target.closest?.('.fp-item');
    if (!item) return;
    fpEditor.selectedId = item.getAttribute('data-id');
    paintFloorPlanEditor();
    const input = document.getElementById('fpItemName');
    if (!input || input.disabled) return;
    input.focus();
    input.select();
  });
}

function onFloorPlanCountChange() {
  const wh = WAREHOUSES.find((w) => w.id === fpEditor.whId);
  const before = cloneFpState();
  const nextRooms = clampFpCount(document.getElementById('fpRoomCount')?.value);
  const nextDoors = clampFpCount(document.getElementById('fpDoorCount')?.value);
  const resetRooms = nextRooms !== fpEditor.rooms;
  fpEditor.rooms = nextRooms;
  fpEditor.doors = nextDoors;
  const roomEl = document.getElementById('fpRoomCount');
  const doorEl = document.getElementById('fpDoorCount');
  if (roomEl) roomEl.value = fpEditor.rooms;
  if (doorEl) doorEl.value = fpEditor.doors;
  fpEditor.items = assemblePlanItems(wh, fpEditor.items, fpEditor.rooms, fpEditor.doors, { resetRooms });
  fpEditor.selectedId = null;
  fpCommit(before);
  paintFloorPlanEditor();
}

async function openFloorPlanEditor() {
  const wh = currentWarehouse();
  if (!wh) {
    toast('请先选择仓库', 'warn');
    return;
  }
  await ensureFloorPlansLoaded();
  const saved = getFloorPlan(wh.id);
  fpEditor.whId = wh.id;
  fpEditor.rooms = saved ? clampFpCount(saved.rooms) : 1;
  fpEditor.doors = saved ? clampFpCount(saved.doors) : 3;
  fpEditor.items = assemblePlanItems(wh, saved?.items || [], fpEditor.rooms, fpEditor.doors);
  fpEditor.selectedId = null;
  fpEditor.drag = null;
  fpResetHistory();
  const snapEl = document.getElementById('fpSnapToggle');
  if (snapEl) snapEl.checked = fpEditor.snap;
  const title = document.getElementById('fpTitle');
  if (title) title.textContent = `平面图管理 · ${wh.name}`;
  const roomEl = document.getElementById('fpRoomCount');
  const doorEl = document.getElementById('fpDoorCount');
  if (roomEl) roomEl.value = fpEditor.rooms;
  if (doorEl) doorEl.value = fpEditor.doors;
  openModal('modalFloorPlan');
  requestAnimationFrame(() => paintFloorPlanEditor());
}

async function saveFloorPlan() {
  if (!fpEditor.whId) return;
  const plan = {
    rooms: fpEditor.rooms,
    doors: fpEditor.doors,
    items: fpEditor.items,
    savedAt: new Date().toISOString(),
  };
  try {
    await putFloorPlanToApi(fpEditor.whId, plan);
    closeModal('modalFloorPlan');
    toast('平面图已保存，驾驶舱点击该仓模型可查看', 'ok');
  } catch (err) {
    toast(err.message || '平面图保存失败，请检查后端接口', 'warn');
  }
}

function fpRotateSelected(deg) {
  const it = selectedFpItem();
  if (!it || it.type === 'door') return;
  const before = cloneFpState();
  const c = polygonCentroid(it.pts);
  rotatePtsAround(it, deg, c.x, c.y);
  settleFpItem(it);
  fpCommit(before);
  paintFloorPlanEditor();
}

function onFpPointerDown(e) {
  const svg = document.getElementById('fpSvg');
  if (!svg) return;
  const rotate = e.target.closest?.('.fp-rotate');
  const handle = e.target.closest?.('.fp-handle');
  const item = e.target.closest?.('.fp-item');
  const pt = fpSvgPoint(e, svg);
  const before = cloneFpState();
  if (rotate) {
    const id = rotate.getAttribute('data-id');
    const it = fpEditor.items.find((x) => x.id === id);
    if (!it) return;
    ensureItemPts(it);
    const c = polygonCentroid(it.pts);
    fpEditor.selectedId = id;
    fpEditor.drag = {
      mode: 'rotate',
      id,
      cx: c.x,
      cy: c.y,
      startAng: Math.atan2(pt.y - c.y, pt.x - c.x),
      pts: it.pts.map((p) => ({ x: p.x, y: p.y })),
      rot: Number(it.rot) || 0,
      moved: false,
      before,
    };
    e.preventDefault();
    e.stopPropagation();
    paintFloorPlanEditor();
    return;
  }
  if (handle) {
    const id = handle.getAttribute('data-id');
    const dir = handle.getAttribute('data-dir');
    const it = fpEditor.items.find((x) => x.id === id);
    if (!it) return;
    fpEditor.selectedId = id;
    fpEditor.drag = {
      mode: 'resize', id, dir, x: pt.x, y: pt.y, ox: it.x, oy: it.y, ow: it.w, oh: it.h, moved: false, before,
    };
    e.preventDefault();
    e.stopPropagation();
    paintFloorPlanEditor();
    return;
  }
  if (item) {
    const id = item.getAttribute('data-id');
    const it = fpEditor.items.find((x) => x.id === id);
    if (!it) return;
    ensureItemPts(it);
    fpEditor.selectedId = id;
    fpEditor.drag = {
      mode: 'move',
      id,
      x: pt.x,
      y: pt.y,
      pts: it.pts.map((p) => ({ x: p.x, y: p.y })),
      moved: false,
      before,
    };
    e.preventDefault();
    e.stopPropagation();
    paintFloorPlanEditor();
    return;
  }
  fpEditor.selectedId = null;
  fpEditor.drag = null;
  paintFloorPlanEditor();
}

function onFpPointerMove(e) {
  if (!fpEditor.drag) return;
  const svg = document.getElementById('fpSvg');
  if (!svg) return;
  const it = fpEditor.items.find((x) => x.id === fpEditor.drag.id);
  if (!it) return;
  const pt = fpSvgPoint(e, svg);
  const box = fpInnerBox();
  const useSnap = fpSnapOn(e);
  if (fpEditor.drag.mode === 'move') {
    const dx = pt.x - fpEditor.drag.x;
    const dy = pt.y - fpEditor.drag.y;
    if (!fpEditor.drag.moved && Math.hypot(dx, dy) < FP_DRAG_SLOP) return;
    fpEditor.drag.moved = true;
    it.pts = fpEditor.drag.pts.map((p) => ({ x: p.x + dx, y: p.y + dy }));
    translatePts(it, 0, 0);
    if (useSnap) snapItemBBoxToGrid(it);
    clampPolygonToGrid(it);
  } else if (fpEditor.drag.mode === 'rotate') {
    const ang = Math.atan2(pt.y - fpEditor.drag.cy, pt.x - fpEditor.drag.cx);
    let deg = ((ang - fpEditor.drag.startAng) * 180) / Math.PI;
    if (!fpEditor.drag.moved && Math.abs(deg) < 2) return;
    fpEditor.drag.moved = true;
    if (useSnap) deg = fpSnapAngle(deg);
    it.pts = fpEditor.drag.pts.map((p) => ({ x: p.x, y: p.y }));
    it.rot = fpEditor.drag.rot;
    rotatePtsAround(it, deg, fpEditor.drag.cx, fpEditor.drag.cy);
    clampPolygonToGrid(it);
  } else if (fpEditor.drag.mode === 'resize') {
    const dx = pt.x - fpEditor.drag.x;
    const dy = pt.y - fpEditor.drag.y;
    if (!fpEditor.drag.moved && Math.hypot(dx, dy) < FP_DRAG_SLOP) return;
    fpEditor.drag.moved = true;
    const minW = it.type === 'door' ? 1 : 40;
    const minH = it.type === 'door' ? 16 : 32;
    const dir = fpEditor.drag.dir;
    let x = fpEditor.drag.ox;
    let y = fpEditor.drag.oy;
    let w = fpEditor.drag.ow;
    let h = fpEditor.drag.oh;
    if (dir.includes('e')) w = Math.max(minW, fpEditor.drag.ow + dx);
    if (dir.includes('s')) h = Math.max(minH, fpEditor.drag.oh + dy);
    if (dir.includes('w')) {
      w = Math.max(minW, fpEditor.drag.ow - dx);
      x = fpEditor.drag.ox + (fpEditor.drag.ow - w);
    }
    if (dir.includes('n')) {
      h = Math.max(minH, fpEditor.drag.oh - dy);
      y = fpEditor.drag.oy + (fpEditor.drag.oh - h);
    }
    if (useSnap) {
      x = fpSnapCoord(x, box.x);
      y = fpSnapCoord(y, box.y);
      w = Math.max(minW, fpSnapCoord(x + w, box.x) - x);
      h = Math.max(minH, fpSnapCoord(y + h, box.y) - y);
    }
    it.x = x;
    it.y = y;
    it.w = w;
    it.h = h;
    it.pts = rectToPts(x, y, w, h);
    clampPolygonToGrid(it);
  }
  paintFloorPlanEditor();
}

function onFpPointerUp() {
  const drag = fpEditor.drag;
  fpEditor.drag = null;
  if (!drag) return;
  const it = fpEditor.items.find((x) => x.id === drag.id);
  if (it && drag.moved) {
    settleFpItem(it);
    fpCommit(drag.before);
  } else if (it && !drag.moved && drag.mode === 'move') {
    it.pts = drag.pts.map((p) => ({ x: p.x, y: p.y }));
    translatePts(it, 0, 0);
  }
  paintFloorPlanEditor();
}

function applyWhPlanTransform() {
  const stage = document.getElementById('whPlanStage');
  const meta = document.getElementById('whPlanMeta');
  if (!stage) return;
  const { scale, rotate, tx, ty } = whPlanState;
  stage.style.transform = `translate(${tx}px, ${ty}px) scale(${scale}) rotate(${rotate}deg)`;
  if (meta) meta.textContent = `${Math.round(scale * 100)}% · ${rotate}°`;
}

function whPlanReset() {
  whPlanState.scale = 1;
  whPlanState.rotate = 0;
  whPlanState.tx = 0;
  whPlanState.ty = 0;
  applyWhPlanTransform();
}

function whPlanZoom(delta) {
  whPlanState.scale = Math.min(4, Math.max(0.25, whPlanState.scale + delta));
  applyWhPlanTransform();
}

function whPlanRotate(delta) {
  whPlanState.rotate = ((whPlanState.rotate + delta) % 360 + 360) % 360;
  applyWhPlanTransform();
}

async function openWhPlanModal(whId) {
  const wh = WAREHOUSES.find((w) => w.id === whId);
  await ensureFloorPlansLoaded();
  const plan = getFloorPlan(whId);
  if (!plan) {
    toast('该仓库尚未设置平面图', 'warn');
    return;
  }
  whPlanState.whId = whId;
  const title = document.getElementById('whPlanTitle');
  if (title) title.textContent = `${wh?.name || whId} 平面图`;
  const host = document.getElementById('whPlanSvgHost');
  if (host && wh) {
    host.innerHTML = renderFloorPlanMarkup(wh, plan, { overlayMaterials: true, svgId: 'whPlanSvg' });
  }
  whPlanReset();
  openModal('modalWhPlan');
}

function whPlanGoStacks() {
  const whId = whPlanState.whId;
  closeModal('modalWhPlan');
  if (whId) goWarehouse(whId);
}

function initWhPlanViewer() {
  const viewport = document.getElementById('whPlanViewport');
  const stage = document.getElementById('whPlanStage');
  if (!viewport || !stage || viewport.dataset.bound) return;
  viewport.dataset.bound = '1';

  viewport.addEventListener('wheel', (e) => {
    e.preventDefault();
    whPlanZoom(e.deltaY < 0 ? 0.1 : -0.1);
  }, { passive: false });

  viewport.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    whPlanDrag.active = true;
    whPlanDrag.x = e.clientX;
    whPlanDrag.y = e.clientY;
    viewport.classList.add('is-dragging');
    stage.classList.add('no-transition');
    e.preventDefault();
  });

  window.addEventListener('mousemove', (e) => {
    if (!whPlanDrag.active) return;
    whPlanState.tx += e.clientX - whPlanDrag.x;
    whPlanState.ty += e.clientY - whPlanDrag.y;
    whPlanDrag.x = e.clientX;
    whPlanDrag.y = e.clientY;
    applyWhPlanTransform();
  });

  window.addEventListener('mouseup', () => {
    if (!whPlanDrag.active) return;
    whPlanDrag.active = false;
    viewport.classList.remove('is-dragging');
    stage.classList.remove('no-transition');
  });
}

function tickCockpitClock() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const dateEl = document.getElementById('ckDate');
  const timeEl = document.getElementById('ckTime');
  if (!dateEl || !timeEl) return;
  dateEl.textContent = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  timeEl.textContent = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
}

function animateKpis() {
  document.querySelectorAll('.ck-kpi-val[data-count]').forEach((el) => {
    const target = Number(el.dataset.count);
    const start = performance.now();
    const dur = 900;
    const step = (ts) => {
      const p = Math.min(1, (ts - start) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      el.textContent = Math.round(target * eased).toLocaleString('zh-CN');
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
}

function renderYard() {
  const root = document.getElementById('yardMap');
  if (!root) return;
  root.innerHTML = WAREHOUSES.map((wh) => `
    <article class="wh-card ${wh.cls}" data-wh="${wh.id}">
      <div class="wh-card-scene" role="button" tabindex="0" title="点击查看已设置的仓库平面图" onclick="openWhPlanModal('${wh.id}')" onkeydown="if(event.key==='Enter')openWhPlanModal('${wh.id}')">${renderWhIsoSvg(wh.cls, wh.occ, wh.id)}</div>
      <button type="button" class="wh-card-enter" onclick="goWarehouse('${wh.id}')" title="进入仓库查看">
        <span class="wh-card-name">${wh.name}</span>
        <span class="wh-card-zone">${wh.zone}</span>
        <span class="wh-card-occ">${wh.occ}%</span>
      </button>
      <div class="wh-card-strip">
        <div class="wh-strip-label">堆位 · 片区标识 · 点击查看</div>
        <div class="yard-grid wh-strip-grid wh-strip-grid--${wh.stacks.length}">
          ${wh.stacks.map((s) => {
            const lv = stackLevel(s.used);
            const ac = stackAreaClass(s.area);
            return `<div class="stack-cell ${lv} area-${ac}" data-wh="${wh.id}" data-code="${s.code}" data-area="${s.area}" data-mat="${s.mat}" data-used="${s.used}" data-cap="${s.cap}" data-batch="${s.batch}" data-batch-type="${s.batchType || ''}" title="${s.code} · ${s.area}">${renderStackIsoSvg(lv)}</div>`;
          }).join('')}
        </div>
      </div>
    </article>
  `).join('');
  const tip = document.getElementById('ckTip');
  root.querySelectorAll('.stack-cell').forEach((cell) => {
    cell.addEventListener('mouseenter', (e) => {
      const d = e.currentTarget.dataset;
      tip.hidden = false;
      tip.innerHTML = `<b>${d.code}</b> · ${d.area}<br/>${d.mat}${d.batch && d.batch !== '—' ? `<br/>${isCustomsBatchType(d.batchType) ? '报关单号 ' + d.batch : isProdBatchType(d.batchType) ? '生产批次 ' + d.batch : d.batch}` : ''}<br/>占用 ${d.used}% · 库容 ${d.cap} 吨<br/><em>点击进入堆位</em>`;
    });
    cell.addEventListener('mousemove', (e) => {
      tip.style.left = e.clientX + 14 + 'px';
      tip.style.top = e.clientY + 12 + 'px';
    });
    cell.addEventListener('mouseleave', () => { tip.hidden = true; });
    cell.addEventListener('click', (e) => {
      e.stopPropagation();
      const d = e.currentTarget.dataset;
      goWarehouse(d.wh, d.code);
    });
  });
}

function flowLogItemHtml(s) {
  const [hh, mm] = s.time.split(':');
  return `
    <li class="flow-log-item">
      <time>${hh}时${mm}分</time>
      <em class="flow-log-type ${s.cls}">${s.type}</em>
      <span class="flow-log-text">${s.text}</span>
    </li>
  `;
}

function renderFlow() {
  const el = document.getElementById('flowChain');
  if (!el) return;
  const list = FLOW_LOGS.map(flowLogItemHtml).join('');
  el.innerHTML = `
    <div class="flow-log-viewport">
      <ul class="flow-log-track">
        ${list}
        ${list}
      </ul>
    </div>
  `;
}

function renderProdData() {
  const el = document.getElementById('prodDataCard');
  if (!el) return;
  const d = PROD_DATA;
  el.innerHTML = `
    <div class="prod-data-hd">
      <i class="prod-data-bar"></i>
      <span class="prod-data-title">${d.batchId}</span>
    </div>
    <div class="prod-data-visual">
      <div class="prod-data-scene">
        <video class="prod-data-video" src="${PROD_SCENE_VIDEO}" poster="${PROD_SCENE_POSTER}" autoplay muted loop playsinline preload="auto" aria-label="混矿生产加工场景"></video>
      </div>
    </div>
    <div class="prod-data-grid">
      <div class="prod-data-field">
        <span class="prod-data-label">生产批次</span>
        <span class="prod-data-val">${d.batchId}</span>
      </div>
      <div class="prod-data-field">
        <span class="prod-data-label">总生产量(吨)</span>
        <span class="prod-data-val">${formatProdTons(d.totalTons)}</span>
      </div>
      <div class="prod-data-field">
        <span class="prod-data-label">生产日期</span>
        <span class="prod-data-val">${d.startDate}</span>
      </div>
      <div class="prod-data-field">
        <span class="prod-data-label">预计完工</span>
        <span class="prod-data-val">${d.endDate}</span>
      </div>
    </div>
    <div class="prod-data-total">
      <span class="prod-data-label">累计生产重量(吨):</span>
      <strong class="prod-data-progress" id="prodCumulative">${formatProdTons(d.cumulative)} / ${formatProdTons(d.totalTons)}</strong>
    </div>
  `;
  bindProdVideo();
}

function bindProdVideo() {
  const video = document.querySelector('#prodDataCard .prod-data-video');
  if (!video) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    video.pause();
    video.removeAttribute('autoplay');
    return;
  }
  const play = () => { video.play().catch(() => {}); };
  if (video.readyState >= 2) play();
  else video.addEventListener('loadeddata', play, { once: true });
}

function tickProdData() {
  const cap = PROD_DATA.totalTons * 0.18;
  if (PROD_DATA.cumulative >= cap) return;
  PROD_DATA.cumulative = Math.min(cap, PROD_DATA.cumulative + 0.08 + Math.random() * 0.12);
  const el = document.getElementById('prodCumulative');
  if (el) {
    el.textContent = `${formatProdTons(PROD_DATA.cumulative)} / ${formatProdTons(PROD_DATA.totalTons)}`;
  }
}

function renderAlerts() {
  const el = document.getElementById('alertFeed');
  if (!el) return;
  el.innerHTML = buildAlertList().map((a) => `
    <li onclick="go('${a.page}')">
      <i class="lvl ${a.lvl}"></i>
      <div class="ttl">${a.title}<span>${a.desc}</span></div>
      <time>${a.time}</time>
    </li>
  `).join('');
}

function renderCapList() {
  const el = document.getElementById('capList');
  if (!el) return;
  const rows = WAREHOUSES.map((r) => ({
    name: r.name,
    pct: r.occ,
    color: r.cls === 'raw' ? '#3D8BFF' : r.cls === 'mix' ? '#9B7BFF' : '#22E6A2',
  }));
  el.innerHTML = rows.map((r) => `
    <div class="cap-row">
      <span>${r.name}</span>
      <div class="cap-track"><i style="width:${r.pct}%;background:${r.color};box-shadow:0 0 8px ${r.color}"></i></div>
      <b>${r.pct}%</b>
    </div>
  `).join('');
}

function fitCanvas(canvas) {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth || 300;
  const h = canvas.clientHeight || 160;
  canvas.width = Math.floor(w * dpr);
  canvas.height = Math.floor(h * dpr);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w, h };
}

function drawCockpitCharts() {
  drawTrendChart();
  drawCapChart();
}

function drawTrendChart() {
  const canvas = document.getElementById('chartTrend');
  if (!canvas) return;
  const { ctx, w, h } = fitCanvas(canvas);
  const inbound = [420, 680, 310, 800, 540, 260, 520];
  const outbound = [120, 90, 160, 75, 140, 110, 100];
  const labels = ['08-08', '08-09', '08-10', '08-11', '08-12', '08-13', '08-14'];
  const pad = { l: 36, r: 12, t: 16, b: 28 };
  const max = 900;
  ctx.clearRect(0, 0, w, h);
  ctx.strokeStyle = 'rgba(0,229,255,0.12)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = pad.t + ((h - pad.t - pad.b) * i) / 4;
    ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(w - pad.r, y); ctx.stroke();
    ctx.fillStyle = '#6A8EAA';
    ctx.font = '10px sans-serif';
    ctx.fillText(String(max - (max / 4) * i), 4, y + 3);
  }
  const xAt = (i) => pad.l + ((w - pad.l - pad.r) * i) / (labels.length - 1);
  const yAt = (v) => pad.t + (h - pad.t - pad.b) * (1 - v / max);
  const plot = (data, color, fill) => {
    ctx.beginPath();
    data.forEach((v, i) => {
      const x = xAt(i), y = yAt(v);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.shadowColor = color;
    ctx.shadowBlur = 10;
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.lineTo(xAt(data.length - 1), h - pad.b);
    ctx.lineTo(xAt(0), h - pad.b);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    data.forEach((v, i) => {
      ctx.beginPath();
      ctx.arc(xAt(i), yAt(v), 3, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
    });
  };
  plot(inbound, '#00E5FF', 'rgba(0,229,255,0.08)');
  plot(outbound, '#FFB020', 'rgba(255,176,32,0.08)');
  ctx.fillStyle = '#6A8EAA';
  ctx.font = '10px sans-serif';
  labels.forEach((lb, i) => ctx.fillText(lb, xAt(i) - 14, h - 8));
}

function drawCapChart() {
  const canvas = document.getElementById('chartCap');
  if (!canvas) return;
  const { ctx, w, h } = fitCanvas(canvas);
  const slices = [
    { v: 12680, c: '#3D8BFF' },
    { v: 3240, c: '#22E6A2' },
    { v: 720, c: '#FFB020' },
  ];
  const total = slices.reduce((s, x) => s + x.v, 0);
  const cx = w / 2, cy = h / 2 - 4, r = Math.min(w, h) / 2 - 10;
  ctx.clearRect(0, 0, w, h);
  let a = -Math.PI / 2;
  slices.forEach((s) => {
    const da = (s.v / total) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, r, a, a + da);
    ctx.closePath();
    ctx.fillStyle = s.c;
    ctx.globalAlpha = 0.9;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = '#050C16';
    ctx.lineWidth = 2;
    ctx.stroke();
    a += da;
  });
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.58, 0, Math.PI * 2);
  ctx.fillStyle = '#071422';
  ctx.fill();
  ctx.fillStyle = '#D6EEFF';
  ctx.font = 'bold 16px Bahnschrift, Consolas, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('68%', cx, cy + 2);
  ctx.fillStyle = '#6A8EAA';
  ctx.font = '10px sans-serif';
  ctx.fillText('综合占用', cx, cy + 16);
}

function drawReconcileChart() {
  /* 驾驶舱生产数据卡片，环图保留空实现以免旧缓存脚本报错 */
  const canvas = document.getElementById('chartReconcile');
  if (!canvas) return;
}

/* ===== Prototype Annotations (remote sync) ===== */
const ANNO_STORAGE_KEY = 'wms_proto_annotations';
const ANNO_VISIBLE_KEY = 'wms_proto_anno_visible';
const ANNO_REMOTE_ORIGIN = 'http://wms.skd.wang';
const ANNO_API = ((typeof location !== 'undefined' && location.hostname === 'wms.skd.wang')
  ? ''
  : ANNO_REMOTE_ORIGIN) + '/api/annotations';
const ANNO_POLL_MS = 4000;

const annoState = {
  visible: true,
  panelOpen: false,
  items: [],
  editingId: null,
  pendingPos: null,
  activeId: null,
  revision: 0,
  syncStatus: 'syncing',
  pollTimer: null,
  pushing: false,
  pullTimer: null,
  deletedIds: [],
  applyingRemote: false,
};

function genAnnoId() {
  return 'anno-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}

function cacheAnnotationsLocally() {
  try {
    localStorage.setItem(ANNO_STORAGE_KEY, JSON.stringify({
      revision: annoState.revision,
      items: annoState.items,
    }));
  } catch { /* ignore quota */ }
}

function loadAnnotationsCache() {
  try {
    const raw = localStorage.getItem(ANNO_STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      annoState.items = parsed;
      return;
    }
    if (parsed && Array.isArray(parsed.items)) {
      annoState.items = parsed.items;
      annoState.revision = Number(parsed.revision) || 0;
    }
  } catch {
    annoState.items = [];
  }
}

function setAnnoSyncStatus(status, label) {
  annoState.syncStatus = status;
  const root = document.querySelector('.anno-sync');
  const labelEl = document.getElementById('annoSyncLabel');
  if (root) root.dataset.status = status;
  if (labelEl) {
    labelEl.textContent = label || ({
      syncing: '同步中',
      ok: '已同步',
      offline: '离线缓存',
      error: '同步失败',
    }[status] || status);
  }
}

function applyAnnoItems(items, revision) {
  annoState.applyingRemote = true;
  annoState.items = Array.isArray(items) ? items : [];
  if (revision != null) annoState.revision = Number(revision) || 0;
  annoState.deletedIds = [];
  cacheAnnotationsLocally();
  updateAnnoBadge();
  renderAnnoPins();
  renderAnnoList();
  annoState.applyingRemote = false;
}

async function pullAnnotations(opts = {}) {
  const { manual = false, allowMigrate = false } = opts;
  if (annoState.pushing) return;
  setAnnoSyncStatus('syncing');
  try {
    const res = await fetch(ANNO_API, { cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const json = await res.json();
    if (!json || json.success === false) throw new Error(json?.message || '拉取失败');
    const data = json.data || {};
    const remoteItems = Array.isArray(data.items) ? data.items : [];
    const remoteRev = Number(data.revision) || 0;

    if (allowMigrate && remoteItems.length === 0 && annoState.items.length > 0) {
      await pushAnnotations({ migrate: true });
      setAnnoSyncStatus('ok', '已上传本地批注');
      if (manual) toast('本地批注已迁移到服务器', 'ok');
      return;
    }

    if (remoteRev !== annoState.revision || manual) {
      const changed = JSON.stringify(remoteItems) !== JSON.stringify(annoState.items);
      applyAnnoItems(remoteItems, remoteRev);
      if (manual) toast('已从服务器刷新批注', 'ok');
      else if (changed && annoState._inited) toast('批注已同步其他设备修改', 'ok');
    }
    setAnnoSyncStatus('ok');
  } catch (err) {
    setAnnoSyncStatus('offline', '离线缓存');
    if (manual) toast('无法连接批注服务，仍使用本地缓存', 'warn');
    console.warn('[anno] pull failed', err);
  }
}

async function pushAnnotations(opts = {}) {
  if (annoState.applyingRemote && !opts.migrate) return;
  annoState.pushing = true;
  setAnnoSyncStatus('syncing');
  cacheAnnotationsLocally();
  try {
    const res = await fetch(ANNO_API, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: annoState.items,
        deletedIds: annoState.deletedIds,
        baseRevision: annoState.revision,
      }),
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const json = await res.json();
    if (!json || json.success === false) throw new Error(json?.message || '保存失败');
    const data = json.data || {};
    applyAnnoItems(data.items || annoState.items, data.revision);
    setAnnoSyncStatus('ok', data.merged ? '已合并同步' : '已同步');
  } catch (err) {
    setAnnoSyncStatus('error', '待重试');
    console.warn('[anno] push failed', err);
    if (opts.toastOnError) toast('批注已暂存本地，稍后自动重试同步', 'warn');
  } finally {
    annoState.pushing = false;
  }
}

function saveAnnotations(opts = {}) {
  cacheAnnotationsLocally();
  updateAnnoBadge();
  renderAnnoPins();
  renderAnnoList();
  pushAnnotations({ toastOnError: !!opts.toastOnError });
}

function getAnnoAuthor() {
  const el = document.getElementById('userName');
  return (el && el.textContent.trim()) || '演示用户';
}

function startAnnoPolling() {
  stopAnnoPolling();
  annoState.pollTimer = setInterval(() => {
    if (document.hidden) return;
    if (document.getElementById('modalAnno')?.classList.contains('show')) return;
    pullAnnotations();
  }, ANNO_POLL_MS);
}

function stopAnnoPolling() {
  if (annoState.pollTimer) {
    clearInterval(annoState.pollTimer);
    annoState.pollTimer = null;
  }
}

async function initAnnotations() {
  const vis = localStorage.getItem(ANNO_VISIBLE_KEY);
  annoState.visible = vis === null ? true : vis !== '0';
  loadAnnotationsCache();
  populateAnnoPageFilter();
  syncAnnoVisibleUi();
  updateAnnoBadge();
  renderAnnoPins();
  renderAnnoList();
  setAnnoSyncStatus('syncing');

  await pullAnnotations({ allowMigrate: true });
  startAnnoPolling();

  if (annoState._inited) return;
  annoState._inited = true;

  const content = document.getElementById('content');
  if (content) {
    content.addEventListener('contextmenu', onAnnoContextMenu);
    content.addEventListener('scroll', () => {
      if (annoState.activeId) highlightActiveAnnoPin();
    }, { passive: true });
  }

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) pullAnnotations();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.ctrlKey && document.getElementById('modalAnno')?.classList.contains('show')) {
      e.preventDefault();
      saveCurrentAnno();
      return;
    }
    if (e.key === 'Delete' && canDeleteActiveAnno(e)) {
      e.preventDefault();
      deleteAnnotationById(annoState.activeId || annoState.editingId);
    }
  });
}

function canDeleteActiveAnno(e) {
  const id = annoState.activeId || annoState.editingId;
  if (!id) return false;
  if (e.target.closest('input, textarea, select, [contenteditable="true"]')) {
    // 编辑弹窗打开时：焦点在输入框内不拦截（避免删文字），否则允许 Del 删整条
    return false;
  }
  return true;
}

function populateAnnoPageFilter() {
  const sel = document.getElementById('annoFilterPage');
  if (!sel) return;
  const current = sel.value;
  sel.innerHTML = '<option value="">全部页面</option>' +
    Object.entries(PAGE_TITLE).map(([id, title]) =>
      `<option value="${id}">${title}</option>`
    ).join('');
  sel.value = current || '';
}

function updateAnnoBadge() {
  const badge = document.getElementById('annoBadge');
  const countEl = document.getElementById('annoPanelCount');
  const pending = annoState.items.filter((a) => !a.resolved).length;
  const total = annoState.items.length;
  if (badge) {
    badge.textContent = String(pending);
    badge.hidden = pending === 0;
    badge.title = pending ? `${pending} 条未完成 / 共 ${total} 条` : (total ? `全部 ${total} 条已完成` : '');
  }
  if (countEl) countEl.textContent = String(total);
}

function syncAnnoVisibleUi() {
  document.body.classList.toggle('anno-hidden', !annoState.visible);
  const label = document.getElementById('annoToggleLabel');
  const btn = document.getElementById('annoToggle');
  if (label) label.textContent = annoState.visible ? '隐藏批注' : '显示批注';
  if (btn) btn.classList.toggle('active', !annoState.visible);
}

function toggleAnnoVisible(force) {
  annoState.visible = typeof force === 'boolean' ? force : !annoState.visible;
  localStorage.setItem(ANNO_VISIBLE_KEY, annoState.visible ? '1' : '0');
  syncAnnoVisibleUi();
  renderAnnoPins();
  toast(annoState.visible ? '批注已显示' : '批注已隐藏', 'ok');
}

function toggleAnnoPanel(force) {
  const panel = document.getElementById('annoPanel');
  if (!panel) return;
  annoState.panelOpen = typeof force === 'boolean' ? force : !annoState.panelOpen;
  panel.classList.toggle('open', annoState.panelOpen);
  panel.setAttribute('aria-hidden', annoState.panelOpen ? 'false' : 'true');
  if (annoState.panelOpen) renderAnnoList();
}

function onAnnoContextMenu(e) {
  if (e.target.closest('.anno-panel, .modal-mask, .header, .sidebar')) return;
  const page = e.target.closest('.page.active') || document.querySelector('.page.active');
  if (!page) return;
  e.preventDefault();
  const pos = getClickPositionInPage(e, page);
  annoState.editingId = null;
  annoState.activeId = null;
  annoState.pendingPos = { pageId: page.dataset.page, x: pos.x, y: pos.y };
  if (!annoState.visible) {
    annoState.visible = true;
    localStorage.setItem(ANNO_VISIBLE_KEY, '1');
    syncAnnoVisibleUi();
  }
  openAnnoEditor(null);
}

function getClickPositionInPage(e, page) {
  const rect = page.getBoundingClientRect();
  const w = rect.width || 1;
  const h = rect.height || 1;
  const x = ((e.clientX - rect.left) / w) * 100;
  const y = ((e.clientY - rect.top) / h) * 100;
  return {
    x: Math.max(0, Math.min(100, Math.round(x * 10) / 10)),
    y: Math.max(0, Math.min(100, Math.round(y * 10) / 10)),
  };
}

function openAnnoEditor(id) {
  const item = id ? annoState.items.find((a) => a.id === id) : null;
  const isNew = !item;
  annoState.editingId = item ? item.id : null;
  if (isNew && !annoState.pendingPos) return;

  document.getElementById('modalAnnoTitle').textContent = isNew ? '添加批注' : '编辑批注';
  document.getElementById('annoText').value = item ? item.text : '';
  document.getElementById('annoDeleteBtn').hidden = isNew;

  openModal('modalAnno');
  setTimeout(() => document.getElementById('annoText').focus(), 80);
}

function saveCurrentAnno() {
  const text = document.getElementById('annoText').value.trim();
  if (!text) {
    toast('请填写批注内容', 'warn');
    return;
  }
  const author = getAnnoAuthor();
  const now = new Date().toISOString();

  if (annoState.editingId) {
    const item = annoState.items.find((a) => a.id === annoState.editingId);
    if (item) {
      item.text = text;
      item.author = author;
      item.updatedAt = now;
    }
  } else if (annoState.pendingPos) {
    annoState.items.push({
      id: genAnnoId(),
      pageId: annoState.pendingPos.pageId,
      x: annoState.pendingPos.x,
      y: annoState.pendingPos.y,
      text,
      author,
      resolved: false,
      createdAt: now,
      updatedAt: now,
    });
  }

  annoState.pendingPos = null;
  annoState.editingId = null;
  saveAnnotations();
  closeModal('modalAnno');
  toast('批注已保存', 'ok');
}

function toggleAnnotationResolved(id) {
  const item = annoState.items.find((a) => a.id === id);
  if (!item) return;
  item.resolved = !item.resolved;
  item.updatedAt = new Date().toISOString();
  if (item.resolved) {
    if (annoState.activeId === id) annoState.activeId = null;
    toast('批注已完成，页面标记已隐藏（可在列表查看）', 'ok');
  } else {
    selectAnnotation(id);
    toast('批注已标记为待处理', 'ok');
  }
  saveAnnotations();
}

function deleteCurrentAnno() {
  const id = annoState.editingId || annoState.activeId;
  if (!id) return;
  deleteAnnotationById(id);
}

function deleteAnnotationById(id) {
  if (!id || !annoState.items.some((a) => a.id === id)) return;
  if (!confirm('确定删除这条批注？')) return;
  annoState.items = annoState.items.filter((a) => a.id !== id);
  if (!annoState.deletedIds.includes(id)) annoState.deletedIds.push(id);
  if (annoState.editingId === id) annoState.editingId = null;
  if (annoState.activeId === id) annoState.activeId = null;
  saveAnnotations({ toastOnError: true });
  if (document.getElementById('modalAnno')?.classList.contains('show')) {
    closeModal('modalAnno');
  }
  toast('批注已删除');
}

async function clearAllAnnotations() {
  if (!annoState.items.length) {
    toast('暂无批注');
    return;
  }
  if (!confirm(`确定清空全部 ${annoState.items.length} 条批注？此操作不可恢复。`)) return;
  const ids = annoState.items.map((a) => a.id);
  annoState.items = [];
  annoState.activeId = null;
  annoState.deletedIds = [...new Set([...annoState.deletedIds, ...ids])];
  cacheAnnotationsLocally();
  updateAnnoBadge();
  renderAnnoPins();
  renderAnnoList();
  setAnnoSyncStatus('syncing');
  try {
    const res = await fetch(ANNO_API, { method: 'DELETE' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const json = await res.json();
    const data = json?.data || {};
    applyAnnoItems([], data.revision != null ? data.revision : annoState.revision + 1);
    setAnnoSyncStatus('ok');
    toast('已清空全部批注');
  } catch (err) {
    await pushAnnotations({ toastOnError: true });
    toast('已清空（同步中）');
  }
}

function exportAnnotations() {
  if (!annoState.items.length) {
    toast('暂无批注可导出', 'warn');
    return;
  }
  const blob = new Blob([JSON.stringify(annoState.items, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `wms-annotations-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  toast('批注已导出', 'ok');
}

function triggerImportAnnotations() {
  const input = document.getElementById('annoImportFile');
  if (!input) return;
  input.value = '';
  input.onchange = () => {
    const file = input.files && input.files[0];
    if (file) importAnnotationsFromFile(file);
  };
  input.click();
}

function normalizeImportedAnno(raw, idx) {
  if (!raw || typeof raw !== 'object') return null;
  const text = String(raw.text || '').trim();
  const pageId = String(raw.pageId || '').trim();
  const x = Number(raw.x);
  const y = Number(raw.y);
  if (!text || !pageId || !Number.isFinite(x) || !Number.isFinite(y)) return null;
  const now = new Date().toISOString();
  return {
    id: String(raw.id || '').trim() || genAnnoId() + '-' + idx,
    pageId,
    x: Math.min(100, Math.max(0, x)),
    y: Math.min(100, Math.max(0, y)),
    text,
    author: String(raw.author || getAnnoAuthor()),
    resolved: Boolean(raw.resolved),
    createdAt: String(raw.createdAt || now),
    updatedAt: String(raw.updatedAt || now),
  };
}

function importAnnotationsFromFile(file) {
  const reader = new FileReader();
  reader.onload = () => {
    let data;
    try {
      data = JSON.parse(String(reader.result || ''));
    } catch {
      toast('JSON 解析失败，请检查文件格式', 'warn');
      return;
    }
    if (data && !Array.isArray(data) && Array.isArray(data.items)) data = data.items;
    if (!Array.isArray(data)) {
      toast('导入文件须为批注数组 JSON', 'warn');
      return;
    }
    const imported = data.map(normalizeImportedAnno).filter(Boolean);
    if (!imported.length) {
      toast('未识别到有效批注（需含 pageId / x / y / text）', 'warn');
      return;
    }

    const hasExisting = annoState.items.length > 0;
    let mode = 'replace';
    if (hasExisting) {
      const choice = confirm(
        `识别到 ${imported.length} 条批注。\n\n确定 = 合并到现有 ${annoState.items.length} 条\n取消 = 再确认是否整表替换`
      );
      if (choice) {
        mode = 'merge';
      } else if (!confirm(`将用导入的 ${imported.length} 条整表替换现有 ${annoState.items.length} 条，是否继续？`)) {
        toast('已取消导入');
        return;
      }
    }

    if (mode === 'merge') {
      const map = new Map(annoState.items.map((a) => [a.id, a]));
      let added = 0;
      let updated = 0;
      imported.forEach((item) => {
        if (map.has(item.id)) {
          map.set(item.id, { ...map.get(item.id), ...item });
          updated += 1;
        } else {
          map.set(item.id, item);
          added += 1;
        }
      });
      annoState.items = [...map.values()];
      saveAnnotations();
      if (!annoState.visible) {
        annoState.visible = true;
        localStorage.setItem(ANNO_VISIBLE_KEY, '1');
        syncAnnoVisibleUi();
      }
      toast(`已合并：新增 ${added} · 更新 ${updated}`, 'ok');
    } else {
      const oldIds = annoState.items.map((a) => a.id);
      const keep = new Set(imported.map((a) => a.id));
      annoState.deletedIds = [...new Set([
        ...annoState.deletedIds,
        ...oldIds.filter((id) => !keep.has(id)),
      ])];
      annoState.items = imported;
      annoState.activeId = null;
      saveAnnotations({ toastOnError: true });
      if (!annoState.visible) {
        annoState.visible = true;
        localStorage.setItem(ANNO_VISIBLE_KEY, '1');
        syncAnnoVisibleUi();
      }
      toast(`已导入 ${imported.length} 条批注`, 'ok');
    }
    if (annoState.panelOpen) renderAnnoList();
  };
  reader.onerror = () => toast('读取文件失败', 'warn');
  reader.readAsText(file, 'utf-8');
}

function renderAnnoPins() {
  document.querySelectorAll('.page').forEach((page) => {
    page.querySelectorAll('.anno-pin-layer').forEach((el) => el.remove());
    if (!annoState.visible) return;

    const pageId = page.dataset.page;
    /* 已完成默认隐藏；仅当从列表点选为当前项时临时显示并高亮 */
    const items = annoState.items.filter((a) =>
      a.pageId === pageId && (!a.resolved || a.id === annoState.activeId)
    );
    if (!items.length) return;

    const layer = document.createElement('div');
    layer.className = 'anno-pin-layer';
    items.forEach((a) => {
      const pagePending = annoState.items.filter((x) => x.pageId === pageId && !x.resolved);
      const num = a.resolved
        ? '✓'
        : (pagePending.findIndex((x) => x.id === a.id) + 1);
      const pin = document.createElement('button');
      pin.type = 'button';
      pin.dataset.id = a.id;
      pin.className = 'anno-pin'
        + (a.resolved ? ' resolved' : '')
        + (a.id === annoState.activeId ? ' active' : '');
      pin.style.left = a.x + '%';
      pin.style.top = a.y + '%';
      pin.innerHTML = `<span>${num}</span>`;
      pin.title = (a.resolved ? '已完成 · ' : '待处理 · ') + a.text + '（右键切换完成状态，双击编辑）';
      pin.addEventListener('click', (e) => {
        e.stopPropagation();
        selectAnnotation(a.id);
      });
      pin.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        selectAnnotation(a.id);
        openAnnoEditor(a.id);
      });
      pin.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        toggleAnnotationResolved(a.id);
      });
      layer.appendChild(pin);

      if (a.id === annoState.activeId) {
        const spot = document.createElement('div');
        spot.className = 'anno-spot';
        spot.dataset.id = a.id;
        spot.style.left = a.x + '%';
        spot.style.top = a.y + '%';
        layer.appendChild(spot);
      }
    });
    page.appendChild(layer);
  });
}

function selectAnnotation(id) {
  annoState.activeId = id;
  annoState.pendingPos = null;
  renderAnnoPins();
  highlightActiveAnnoPin();
  renderAnnoList();
}

function highlightActiveAnnoPin() {
  document.querySelectorAll('.anno-pin').forEach((pin) => pin.classList.remove('active'));
  document.querySelectorAll('.anno-spot').forEach((el) => el.classList.toggle('on', el.dataset.id === annoState.activeId));
  if (!annoState.activeId || !annoState.visible) return;
  const pin = document.querySelector(`.anno-pin[data-id="${annoState.activeId}"]`);
  if (pin) pin.classList.add('active');
}

function renderAnnoList() {
  const list = document.getElementById('annoList');
  if (!list) return;

  const pageFilter = document.getElementById('annoFilterPage')?.value || '';
  const statusFilter = document.getElementById('annoFilterStatus')?.value || '';
  let items = [...annoState.items];
  if (pageFilter) items = items.filter((a) => a.pageId === pageFilter);
  if (statusFilter === 'pending') items = items.filter((a) => !a.resolved);
  else if (statusFilter === 'done') items = items.filter((a) => a.resolved);
  items.sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt));

  if (!items.length) {
    list.innerHTML = '<div class="anno-empty">暂无符合条件的批注</div>';
    return;
  }

  list.innerHTML = items.map((a) => {
    const pagePending = annoState.items.filter((x) => x.pageId === a.pageId && !x.resolved);
    const pageIdx = a.resolved
      ? '✓'
      : (pagePending.findIndex((x) => x.id === a.id) + 1 || '·');
    const time = (a.updatedAt || a.createdAt || '').slice(0, 16).replace('T', ' ');
    return `
      <article class="anno-item${a.resolved ? ' resolved' : ''}${a.id === annoState.activeId ? ' active' : ''}" data-id="${a.id}" onclick="jumpToAnnotation('${a.id}')" oncontextmenu="event.preventDefault(); toggleAnnotationResolved('${a.id}')">
        <div class="anno-item-hd">
          <span class="anno-item-num${a.resolved ? ' resolved' : ''}">${pageIdx}</span>
          <span class="anno-item-page">${PAGE_TITLE[a.pageId] || a.pageId}</span>
          <span class="anno-item-tag${a.resolved ? ' done' : ''}">${a.resolved ? '已完成' : '待处理'}</span>
        </div>
        <div class="anno-item-text">${escapeHtml(a.text)}</div>
        <div class="anno-item-meta">
          <span>${escapeHtml(a.author || '—')}</span>
          <time>${time}</time>
        </div>
      </article>
    `;
  }).join('');
}

function jumpToAnnotation(id) {
  const item = annoState.items.find((a) => a.id === id);
  if (!item) return;
  if (!annoState.visible) {
    annoState.visible = true;
    localStorage.setItem(ANNO_VISIBLE_KEY, '1');
    syncAnnoVisibleUi();
  }
  selectAnnotation(id);
  /* 列表点选时收起侧栏，便于看清左侧高亮位置 */
  toggleAnnoPanel(false);
  if (getCurrentPageId() !== item.pageId) go(item.pageId);
  else {
    renderAnnoPins();
    highlightActiveAnnoPin();
  }
  setTimeout(() => {
    const page = document.querySelector(`.page[data-page="${item.pageId}"]`);
    const content = document.querySelector('.content');
    if (page && content) {
      const pageRect = page.getBoundingClientRect();
      const contentRect = content.getBoundingClientRect();
      const pinYInContent = (pageRect.top - contentRect.top) + content.scrollTop + pageRect.height * item.y / 100;
      content.scrollTo({ top: Math.max(0, pinYInContent - content.clientHeight / 3), behavior: 'smooth' });
    }
    highlightActiveAnnoPin();
  }, 120);
}

function getCurrentPageId() {
  const active = document.querySelector('.page.active');
  return active ? active.dataset.page : null;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
