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
  settings: '系统设置 / 权限、参数与平面图',
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
};

/** 各角色可见菜单（null = 全部）；对齐项目设计 §3 角色权限 */
const ROLE_PAGES = {
  admin: null,
  warehouse: ['dashboard', 'inbound', 'transfer', 'inventory', 'stocktake', 'alert', 'outbound'],
  customs: null,
};

const ROLE_DEFAULT_PAGE = {
  admin: 'dashboard',
  warehouse: 'dashboard',
  customs: 'dashboard',
};

const ROLE_ORDER = ['admin', 'warehouse', 'customs'];
const ROLE_PAGES_KEY = 'wms_role_pages_v2';
const ROLE_PERM_HINTS = {
  admin: '管理员默认可访问全部模块，可按需收窄菜单。',
  warehouse: '仓管员负责入出库、移库、盘点与日常库存查询。',
  customs: '关务员菜单默认全开；关务员操作在审计中单独标识。',
};

const SYS_ACCOUNTS_KEY = 'wms_sys_accounts';
const DEFAULT_SYS_ACCOUNTS = [
  { user: 'admin', name: '系统管理员', roleKey: 'admin', status: '启用', lastLogin: '2026-08-03 09:00', password: '' },
  { user: 'wh01', name: '仓管-赵', roleKey: 'warehouse', status: '启用', lastLogin: '2026-08-03 10:22', password: '' },
  { user: 'wh02', name: '仓管-钱', roleKey: 'warehouse', status: '启用', lastLogin: '2026-08-03 09:05', password: '' },
  { user: 'customs01', name: '关务张', roleKey: 'customs', status: '启用', lastLogin: '2026-08-03 09:12', password: '' },
  { user: 'customs02', name: '关务李', roleKey: 'customs', status: '启用', lastLogin: '2026-08-02 16:40', password: '' },
];

function loadSysAccounts() {
  try {
    const raw = localStorage.getItem(SYS_ACCOUNTS_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (Array.isArray(parsed) && parsed.length) return parsed;
  } catch { /* empty */ }
  return DEFAULT_SYS_ACCOUNTS.map((a) => ({ ...a }));
}

function persistSysAccounts(list) {
  localStorage.setItem(SYS_ACCOUNTS_KEY, JSON.stringify(list));
}

function findSysAccount(user) {
  const key = String(user || '').trim();
  return loadSysAccounts().find((a) => a.user === key) || null;
}

function openAccountModal() {
  const set = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.value = val;
  };
  set('accUser', '');
  set('accName', '');
  set('accRole', 'warehouse');
  set('accStatus', '启用');
  set('accPwd', '');
  set('accPwd2', '');
  openModal('modalAccount');
}

function saveAccount() {
  const user = document.getElementById('accUser')?.value.trim() || '';
  const name = document.getElementById('accName')?.value.trim() || '';
  const roleKey = document.getElementById('accRole')?.value || 'warehouse';
  const status = document.getElementById('accStatus')?.value || '启用';
  const pwd = document.getElementById('accPwd')?.value || '';
  const pwd2 = document.getElementById('accPwd2')?.value || '';
  if (!user || !name) {
    toast('请填写账号和姓名', 'warn');
    return;
  }
  if (!ROLE_MAP[roleKey]) {
    toast('请选择角色', 'warn');
    return;
  }
  if (!pwd) {
    toast('请设置密码', 'warn');
    return;
  }
  if (pwd !== pwd2) {
    toast('两次密码不一致', 'warn');
    return;
  }
  const list = loadSysAccounts();
  if (list.some((a) => a.user === user)) {
    toast('账号已存在', 'warn');
    return;
  }
  list.push({
    user,
    name,
    roleKey,
    status,
    lastLogin: '—',
    password: pwd,
  });
  persistSysAccounts(list);
  renderAccountTable();
  closeModal('modalAccount');
  toast(`账号 ${user} 已注册`, 'ok');
}

function resetAccountPassword(user) {
  toast(`已向 ${user} 发出重置密码提示（演示）`, 'ok');
}

function toggleAccountStatus(user) {
  const list = loadSysAccounts();
  const acc = list.find((a) => a.user === user);
  if (!acc) return;
  acc.status = acc.status === '启用' ? '停用' : '启用';
  persistSysAccounts(list);
  renderAccountTable();
  toast(`${user} 已${acc.status}`, 'ok');
}

function renderAccountTable() {
  const tbody = document.getElementById('accountTableBody');
  if (!tbody) return;
  const list = loadSysAccounts();
  tbody.innerHTML = list.map((a) => {
    const role = ROLE_MAP[a.roleKey];
    const st = a.status === '停用'
      ? '<span class="tag tag-orange">停用</span>'
      : '<span class="tag tag-green">启用</span>';
    const toggleLabel = a.status === '停用' ? '启用' : '停用';
    return `<tr>
      <td>${a.user}</td>
      <td>${a.name}</td>
      <td>${role ? role.name.replace('（海关专用）', '') : a.roleKey}</td>
      <td>${st}</td>
      <td>${a.lastLogin || '—'}</td>
      <td class="ops">
        <button type="button" class="btn-text" onclick="resetAccountPassword('${a.user}')">重置密码</button>
        <button type="button" class="btn-text" onclick="toggleAccountStatus('${a.user}')">${toggleLabel}</button>
      </td>
    </tr>`;
  }).join('');
  const counts = { admin: 0, warehouse: 0, customs: 0 };
  list.forEach((a) => {
    if (counts[a.roleKey] != null) counts[a.roleKey] += 1;
  });
  const setCount = (id, n) => {
    const el = document.getElementById(id);
    if (el) el.textContent = String(n);
  };
  setCount('roleCountAdmin', counts.admin);
  setCount('roleCountWarehouse', counts.warehouse);
  setCount('roleCountCustoms', counts.customs);
}

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
  if (pageId === 'stacks') {
    const paint = () => { renderStackTable(); applyLocationFilter(); };
    paint();
    if (typeof ensureParkPlanLoaded === 'function') Promise.resolve(ensureParkPlanLoaded()).then(paint).catch(() => {});
  }
  if (pageId === 'warehouses') renderWarehouseTable();
  if (pageId === 'partners') renderPartnerTable();
  if (pageId === 'bonded') renderBondedTable();
  if (pageId === 'inbound') renderInboundTable();
  if (pageId === 'transfer') renderTransferTable();
  if (pageId === 'materials') {
    renderMaterialTable();
    renderSourceFilingTable();
  }
  if (pageId === 'settings') {
    initSysParamsForm();
    renderAccountTable();
    const floorOn = document.querySelector('#settingsTabs .tab.active')?.dataset.tab === 'floorplan';
    document.querySelector('[data-page="settings"]')?.classList.toggle('settings-floorplan', !!floorOn);
    if (floorOn && typeof openParkEditor === 'function') openParkEditor();
  }
  if (pageId === 'alert') renderAlertPage();
  if (pageId === 'inventory') applyPendingInventoryTicket();
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
  toast(`已进入堆位管理${stackCode ? ' · ' + stackCode : ''}`, 'ok');
}

function goInventoryLot(ticket) {
  const key = String(ticket || '').trim();
  if (!key || key === '—') {
    go('inventory');
    return;
  }
  sessionStorage.setItem('wms_inv_ticket', key);
  go('inventory');
}

function applyPendingInventoryTicket() {
  const ticket = sessionStorage.getItem('wms_inv_ticket');
  if (!ticket) return;
  sessionStorage.removeItem('wms_inv_ticket');
  let hit = 0;
  document.querySelectorAll('#invTableBody tr').forEach((row) => {
    const customs = (row.dataset.ticket || row.cells[0]?.textContent || '').replace(/[—\s]/g, '');
    const prod = (row.cells[1]?.textContent || '').replace(/[—\s]/g, '');
    const match = customs === ticket || prod === ticket || (row.dataset.ticket || '') === ticket;
    row.style.display = match ? '' : 'none';
    row.classList.toggle('row-highlight', match);
    if (match) hit += 1;
  });
  toast(hit ? `已定位本票 ${ticket}` : `库存中未找到本票 ${ticket}`, hit ? 'ok' : 'warn');
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
    hint.innerHTML = `本页仅支持<strong>单仓库</strong>展示，默认第一个仓库。当前：<strong>${whKey}</strong>（共 ${WAREHOUSES.length} 个仓库可选）${stack ? ` · 定位堆位 <strong>${stack}</strong>` : ''}。堆位网格取自<strong>系统设置 · 平面图设置</strong>中该堆位所占行列。`;
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
  const typedUser = (opts.user != null
    ? String(opts.user).trim()
    : document.getElementById('loginUser').value.trim()) || 'admin';
  const acc = findSysAccount(typedUser);
  if (acc && acc.status === '停用') {
    if (!silent) toast('该账号已停用', 'warn');
    return;
  }
  if (acc && acc.password && !silent) {
    const pwd = document.getElementById('loginPwd')?.value || '';
    if (pwd !== acc.password) {
      toast('密码不正确', 'warn');
      return;
    }
  }
  let roleKey = opts.roleKey || document.getElementById('loginRole').value;
  if (acc && ROLE_MAP[acc.roleKey]) roleKey = acc.roleKey;
  const user = acc ? acc.name : typedUser;
  if (!ROLE_MAP[roleKey]) return;

  document.getElementById('loginRole').value = roleKey;
  document.getElementById('loginUser').value = typedUser;
  document.getElementById('loginPage').style.display = 'none';
  document.getElementById('app').classList.add('show');
  document.getElementById('userName').textContent = user;
  applyRole(roleKey);
  writeAuthSession(roleKey, typedUser);
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

const TRANSFER_LOTS = [
  { stack: '1#A1', customs: 'BG20260728041', prod: '', material: '原料物料-A', consignor: '广西金川有色金属有限公司', consignorShort: '广西金川', weight: 120, ship: '远航号', containers: '8' },
  { stack: '1#A1', customs: 'BG20260801088', prod: '', material: '原料物料-A', consignor: '五矿有色金属股份有限公司', consignorShort: '五矿有色', weight: 200, ship: '海洋之星', containers: '12' },
  { stack: '1#A2', customs: 'BG20260801022', prod: '', material: '原料物料-B', consignor: '广西金川有色金属有限公司', consignorShort: '广西金川', weight: 330, ship: '海豚号', containers: '' },
  { stack: '2#A1', customs: 'BG20260715033', prod: '', material: '原料物料-A', consignor: '广西金川有色金属有限公司', consignorShort: '广西金川', weight: 40, ship: '金海轮', containers: '' },
  { stack: '4#A1', customs: '', prod: 'FL-20260803', material: '成品物料-A', consignor: '广西金川有色金属有限公司', consignorShort: '广西金川', weight: 180, ship: '—', containers: '' },
  { stack: '码头#A1', customs: 'BG20260725088', prod: '', material: '原料物料-D', consignor: '五矿有色金属股份有限公司', consignorShort: '五矿有色', weight: 1920, ship: '远洋号', containers: '' },
];

let TRANSFER_LIST = [
  { id: 'YK-20260803-006', consignor: '广西金川有色金属有限公司', consignorShort: '广西金川', scene: '整票移位', customs: 'BG20260728041', prod: '—', material: '原料物料-A', ship: '远航号', containers: '8', weight: 120, from: '1#A1', to: '1#B1', timeFrom: '2026-08-03T10', timeTo: '2026-08-03T11', status: '已完成' },
  { id: 'YK-20260803-005', consignor: '广西金川有色金属有限公司', consignorShort: '广西金川', scene: '拆票移位', customs: 'BG20260801022', prod: '—', material: '原料物料-B', ship: '海豚号', containers: '—', weight: 40, from: '2#A1', to: '5#小A', timeFrom: '2026-08-03T09', timeTo: '2026-08-03T10', status: '已完成' },
  { id: 'YK-20260802-021', consignor: '广西金川有色金属有限公司', consignorShort: '广西金川', scene: '批量移库', customs: 'BG20260728041', prod: '—', material: '原料物料-A', ship: '远航号', containers: '8', weight: 120, from: '1#A1', to: '1#B1', timeFrom: '2026-08-02T15', timeTo: '2026-08-02T16', status: '已完成' },
  { id: 'YK-20260802-022', consignor: '五矿有色金属股份有限公司', consignorShort: '五矿有色', scene: '批量移库', customs: 'BG20260801088', prod: '—', material: '原料物料-A', ship: '海洋之星', containers: '12', weight: 200, from: '1#A1', to: '1#A2', timeFrom: '2026-08-02T15', timeTo: '2026-08-02T16', status: '已完成' },
];

function formatHourRange(fromKey, toKey) {
  const parse = (k) => {
    const m = String(k || '').match(/^(\d{4}-\d{2}-\d{2})T(\d{1,2})$/);
    return m ? { d: m[1], h: Number(m[2]) } : null;
  };
  const a = parse(fromKey);
  const b = parse(toKey);
  if (!a || !b) return '—';
  if (a.d === b.d) return `${a.d} ${a.h}时–${b.h}时`;
  return `${a.d} ${a.h}时 – ${b.d} ${b.h}时`;
}

function lotsOnTransferStack(stack) {
  return TRANSFER_LOTS.filter((l) => l.stack === stack);
}

function transferLotKey(lot) {
  return `${lot.stack}|${lot.customs || lot.prod}`;
}

function findTransferLot(key) {
  return TRANSFER_LOTS.find((l) => transferLotKey(l) === key);
}

function fillHourSelect(id, def) {
  const el = document.getElementById(id);
  if (!el) return;
  if (!el.options.length) {
    for (let h = 0; h < 24; h++) {
      const o = document.createElement('option');
      o.value = String(h);
      o.textContent = `${h}时`;
      el.appendChild(o);
    }
  }
  if (def != null) el.value = String(def);
}

function fillTransferStackSelects() {
  const opts = (typeof allStackOptions === 'function'
    ? allStackOptions()
    : TRANSFER_LOTS.map((l) => ({ code: l.stack }))
  );
  const seen = new Set();
  const html = opts.map((s) => {
    const code = s.code || s;
    if (seen.has(code)) return '';
    seen.add(code);
    return `<option value="${code}">${code}</option>`;
  }).join('');
  const fromStacks = [...new Set(TRANSFER_LOTS.map((l) => l.stack))];
  const fromHtml = fromStacks.map((c) => `<option value="${c}">${c}</option>`).join('');
  const tfFrom = document.getElementById('tfFromStack');
  const tfTo = document.getElementById('tfToStack');
  const batchFrom = document.getElementById('batchFromStack');
  if (tfFrom) tfFrom.innerHTML = '<option value="">请选择原堆位</option>' + fromHtml;
  if (tfTo) tfTo.innerHTML = html || fromHtml;
  if (batchFrom) batchFrom.innerHTML = fromHtml;
}

function onTransferFromStackChange() {
  const stack = document.getElementById('tfFromStack')?.value || '';
  const sel = document.getElementById('tfBatch');
  if (!sel) return;
  const lots = lotsOnTransferStack(stack);
  sel.innerHTML = lots.length
    ? '<option value="">请选择矿批次</option>' + lots.map((l) => {
      const label = l.customs ? `${l.customs}（报关单）` : `${l.prod}（生产批次）`;
      return `<option value="${transferLotKey(l)}">${label} · ${l.material}</option>`;
    }).join('')
    : '<option value="">该堆位暂无可移批次</option>';
  onTransferBatchChange();
}

function onTransferBatchChange() {
  const lot = findTransferLot(document.getElementById('tfBatch')?.value || '');
  const set = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.value = val ?? '';
  };
  set('tfConsignor', lot?.consignor || '');
  set('tfCustoms', lot?.customs || '—');
  set('tfProd', lot?.prod || '—');
  set('tfMaterial', lot?.material || '');
  set('tfShip', lot?.ship === '—' ? '' : (lot?.ship || ''));
  set('tfContainers', lot?.containers || '');
  set('tfWeight', lot?.weight != null ? String(lot.weight) : '');
}

function renderTransferTable() {
  const tbody = document.getElementById('transferTableBody');
  if (!tbody) return;
  const consignor = document.getElementById('transferConsignorFilter')?.value || '';
  const scene = document.getElementById('transferSceneFilter')?.value || '';
  const rows = TRANSFER_LIST.filter((r) => {
    if (consignor && r.consignor !== consignor) return false;
    if (scene && r.scene !== scene) return false;
    return true;
  });
  tbody.innerHTML = rows.map((r) => `
    <tr>
      <td>${r.id}</td>
      <td><span class="tag tag-purple" title="${r.consignor}">${r.consignorShort}</span></td>
      <td>${r.scene}</td>
      <td>${r.customs || '—'}</td>
      <td>${r.prod || '—'}</td>
      <td>${r.material}</td>
      <td>${r.ship || '—'}</td>
      <td>${r.containers || '—'}</td>
      <td>${r.weight}</td>
      <td>${r.from}</td>
      <td>${r.to}</td>
      <td>${formatHourRange(r.timeFrom, r.timeTo)}</td>
      <td><span class="tag tag-green">${r.status}</span></td>
    </tr>
  `).join('') || '<tr><td colspan="13" style="color:var(--text-2)">暂无移库单</td></tr>';
  const count = document.getElementById('transferTableCount');
  if (count) count.textContent = `共 ${rows.length} 条`;
}

function nextTransferId() {
  const d = (typeof wmsDemoToday === 'function' ? wmsDemoToday() : '2026-08-03').replace(/-/g, '');
  const nums = TRANSFER_LIST
    .map((r) => Number(String(r.id).split('-').pop()) || 0);
  const n = (nums.length ? Math.max(...nums) : 0) + 1;
  return `YK-${d}-${String(n).padStart(3, '0')}`;
}

function openTransferModal() {
  fillTransferStackSelects();
  fillHourSelect('tfTimeFromHour', '10');
  fillHourSelect('tfTimeToHour', '11');
  const from = document.getElementById('tfFromStack');
  if (from) from.value = '';
  onTransferFromStackChange();
  openModal('modalTransfer');
}

function saveTransfer() {
  const from = document.getElementById('tfFromStack')?.value || '';
  const lotKey = document.getElementById('tfBatch')?.value || '';
  const to = document.getElementById('tfToStack')?.value || '';
  const weight = document.getElementById('tfWeight')?.value?.trim();
  const fromDate = document.getElementById('tfTimeFromDate')?.value || '';
  const toDate = document.getElementById('tfTimeToDate')?.value || '';
  const fromHour = document.getElementById('tfTimeFromHour')?.value ?? '0';
  const toHour = document.getElementById('tfTimeToHour')?.value ?? '0';
  if (!from || !lotKey) {
    toast('请先选择原堆位，再选择要移动的矿批次', 'warn');
    return;
  }
  if (!to || !weight) {
    toast('请填写目标堆位与移库重量', 'warn');
    return;
  }
  if (!fromDate || !toDate) {
    toast('请填写移库起止时间（精确到时）', 'warn');
    return;
  }
  const timeFrom = `${fromDate}T${fromHour}`;
  const timeTo = `${toDate}T${toHour}`;
  if (timeFrom > timeTo) {
    toast('开始时间不能晚于结束时间', 'warn');
    return;
  }
  const lot = findTransferLot(lotKey);
  TRANSFER_LIST.unshift({
    id: nextTransferId(),
    consignor: lot?.consignor || document.getElementById('tfConsignor')?.value || '',
    consignorShort: lot?.consignorShort || '',
    scene: document.getElementById('transferScene')?.value || '整票移位',
    customs: lot?.customs || '—',
    prod: lot?.prod || '—',
    material: lot?.material || '',
    ship: document.getElementById('tfShip')?.value?.trim() || '—',
    containers: document.getElementById('tfContainers')?.value?.trim() || '—',
    weight: Number(weight) || 0,
    from,
    to,
    timeFrom,
    timeTo,
    status: '已完成',
  });
  closeModal('modalTransfer');
  renderTransferTable();
  toast('移库单已提交并更新库存', 'ok');
}

function openBatchTransferModal() {
  fillTransferStackSelects();
  const sel = document.getElementById('batchFromStack');
  if (sel && !sel.value) sel.value = '1#A1';
  renderBatchTransferLots();
  openModal('modalBatchTransfer');
}

function renderBatchTransferLots() {
  const stack = document.getElementById('batchFromStack')?.value || '';
  const tbody = document.getElementById('batchTransferBody');
  if (!tbody) return;
  const lots = lotsOnTransferStack(stack);
  const toOpts = (typeof allStackOptions === 'function' ? allStackOptions() : TRANSFER_LOTS)
    .map((s) => s.code || s.stack)
    .filter((c, i, arr) => c && c !== stack && arr.indexOf(c) === i)
    .slice(0, 8)
    .map((c) => `<option>${c}</option>`)
    .join('');
  tbody.innerHTML = lots.length
    ? lots.map((l, i) => `
      <tr data-lot-key="${transferLotKey(l)}">
        <td><input type="checkbox" class="batch-transfer-check" ${i < 2 ? 'checked' : ''} onchange="updateBatchTransferCount()" /></td>
        <td>${l.customs || '—'}</td>
        <td>${l.prod || '—'}</td>
        <td>${l.material}</td>
        <td>${l.ship || '—'}</td>
        <td>${l.containers || '—'}</td>
        <td>${l.weight} 吨</td>
        <td><select class="select batch-to">${toOpts}</select></td>
        <td><select class="select batch-scene"><option>整票移位</option><option>拆票移位</option></select></td>
      </tr>`)
      .join('')
    : '<tr><td colspan="9" style="color:var(--text-2)">该堆位暂无可移批次</td></tr>';
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
  if (countEl) countEl.textContent = `已选 ${selected} 票`;
  const allEl = document.getElementById('batchTransferAll');
  if (allEl && checks.length) {
    allEl.checked = selected === checks.length;
    allEl.indeterminate = selected > 0 && selected < checks.length;
  }
}

function saveBatchTransfer() {
  const selected = [...document.querySelectorAll('#batchTransferBody .batch-transfer-check:checked')];
  if (!selected.length) {
    toast('请至少勾选一票矿批次', 'warn');
    return;
  }
  const from = document.getElementById('batchFromStack')?.value || '';
  const today = typeof wmsDemoToday === 'function' ? wmsDemoToday() : '2026-08-03';
  selected.forEach((cb) => {
    const tr = cb.closest('tr');
    const lot = findTransferLot(tr?.dataset.lotKey || '');
    if (!lot) return;
    TRANSFER_LIST.unshift({
      id: nextTransferId(),
      consignor: lot.consignor,
      consignorShort: lot.consignorShort,
      scene: '批量移库',
      customs: lot.customs || '—',
      prod: lot.prod || '—',
      material: lot.material,
      ship: lot.ship || '—',
      containers: lot.containers || '—',
      weight: lot.weight,
      from,
      to: tr.querySelector('.batch-to')?.value || '',
      timeFrom: `${today}T15`,
      timeTo: `${today}T16`,
      status: '已完成',
    });
  });
  closeModal('modalBatchTransfer');
  renderTransferTable();
  toast(`批量移库已提交，生成 ${selected.length} 条记录`, 'ok');
}

/* ===== 原料投料出库 · 列表筛选 ===== */
function cargoTypeTagHtml(type) {
  const cls = type === '报备矿' ? 'tag-orange' : 'tag-green';
  return `<span class="tag ${cls}">${type}</span>`;
}

function cargoTypeClass(type) {
  return type === '报备矿' ? 'tag-orange' : 'tag-green';
}

const FEED_MATERIAL_LIST = [
  { id: 'feed-1', customs: 'BG20260728041', cargoType: '达标矿', country: '秘鲁', stack: '1#A1', available: 2549.12, feedDry: 80, checked: true },
  { id: 'feed-2', customs: 'BG20260801022', cargoType: '报备矿', country: '智利', stack: '1#A2', available: 1582.71, feedDry: 70, checked: true },
  { id: 'feed-3', customs: 'BG20260715033', cargoType: '达标矿', country: '秘鲁', stack: '2#A1', available: 899.17, feedDry: 50, checked: true },
  { id: 'feed-4', customs: 'BG20260612018', cargoType: '报备矿', country: '智利', stack: '2#A2', available: 620.5, feedDry: '', checked: false },
  { id: 'feed-5', customs: 'BG20260508007', cargoType: '报备矿', country: '澳大利亚', stack: '1#B1', available: 430.0, feedDry: '', checked: false },
];

function initFeedMaterialFilters() {
  const matSel = document.getElementById('feedFilterMaterial');
  const countrySel = document.getElementById('feedFilterCountry');
  if (matSel) {
    const types = [...new Set(FEED_MATERIAL_LIST.map((r) => r.cargoType))];
    matSel.innerHTML = '<option value="">全部货物类型</option>' + types.map((m) => `<option value="${m}">${m}</option>`).join('');
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
    <tr class="feed-material-row" data-id="${r.id}" data-customs="${r.customs}" data-cargo-type="${r.cargoType}" data-country="${r.country}" data-stack="${r.stack}">
      <td><input type="checkbox" class="feed-material-check" ${r.checked ? 'checked' : ''} onchange="updateFeedSelectedCount()" /></td>
      <td>${r.customs}</td>
      <td>${cargoTypeTagHtml(r.cargoType)}</td>
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
    if (material && r.cargoType !== material) return false;
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
    consumerUnit: '华东冶炼冶炼一分厂',
    weight: '100',
    amount: '218000',
    currency: 'USD',
    batch: 'FL-20260803 成品物料-A',
    material: '成品物料-A',
    preview: '出库报关单 BGCK2026080301.pdf',
  },
};

const ocrState = { target: null, docType: null, lastData: null, recognized: null };

const OCR_FIELD_LABELS = {
  ship: '船名',
  bl: '提单号',
  customs: '报关单号',
  hz: '核注清单号',
  amount: '报关单金额',
  currency: '币种',
  consignee: '流向企业',
  consumerUnit: '消费使用单位',
  weight: '出库重量',
  wet: '湿重',
  dry: '干重',
  moisture: '水分',
  docNo: '单据编号',
  material: '物料',
};

function currencyMark(code) {
  return code === 'USD' ? '$' : '¥';
}

function formatOcrAmount(amount, currency) {
  if (amount == null || amount === '') return '—';
  const n = Number(amount);
  const num = Number.isFinite(n) ? n.toLocaleString('en-US') : String(amount);
  return `${currencyMark(currency)} ${num}`;
}

function rememberOcrRecognized(target, data) {
  ocrState.recognized = { target, data: JSON.parse(JSON.stringify(data || {})) };
}

function diffOcrFields(before, after) {
  if (!before || !after) return [];
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  const skip = new Set(['preview', 'batch', 'elements']);
  const changes = [];
  keys.forEach((key) => {
    if (skip.has(key)) return;
    const a = String(before[key] ?? '').trim();
    const b = String(after[key] ?? '').trim();
    if (a !== b) {
      const label = OCR_FIELD_LABELS[key] || key;
      const show = (val, k) => (k === 'amount' ? formatOcrAmount(val, after.currency || before.currency) : (k === 'currency' ? (val === 'USD' ? '美元' : val === 'CNY' ? '人民币' : val) : val));
      changes.push({
        field: label,
        before: show(a, key) || '—',
        after: show(b, key) || '—',
      });
    }
  });
  const elA = before.elements || {};
  const elB = after.elements || {};
  new Set([...Object.keys(elA), ...Object.keys(elB)]).forEach((code) => {
    const a = String(elA[code] ?? '').trim();
    const b = String(elB[code] ?? '').trim();
    if (a !== b) changes.push({ field: `品质 ${code}`, before: a || '—', after: b || '—' });
  });
  return changes;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function formatAuditNow() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const clock = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const sec = pad(d.getSeconds());
  return {
    date: '2026-08-03',
    clock,
    full: `2026-08-03 ${clock}:${sec}`,
  };
}

function appendOcrCorrectionAudit({ module, bizNo, customsNo, prodBatch, changes, hint }) {
  if (!changes?.length) return;
  const body = document.getElementById('auditTableBody');
  if (!body) return;
  const t = formatAuditNow();
  const summary = changes.map((c) => `${c.field}：${c.before} → ${c.after}`).join('；');
  const beforeText = changes.map((c) => `${c.field}：${c.before}`).join('\n');
  const afterText = changes.map((c) => `${c.field}：${c.after}`).join('\n');
  const tr = document.createElement('tr');
  tr.dataset.module = module;
  tr.dataset.customs = '0';
  tr.dataset.time = t.date;
  tr.dataset.customsNo = customsNo || '';
  tr.dataset.prodBatch = prodBatch || '';
  tr.dataset.auditOperator = 'admin / 业务账号';
  tr.dataset.auditTime = `${t.full} / 本地`;
  tr.dataset.auditModule = `${module} / ${bizNo || '—'}`;
  tr.dataset.auditResult = '成功；OCR 字段人工修正';
  tr.dataset.auditBefore = beforeText;
  tr.dataset.auditAfter = afterText;
  tr.innerHTML = `<td>${escapeHtml(t.date)} ${escapeHtml(t.clock)}</td><td>admin</td><td>${escapeHtml(module)}</td><td>OCR字段修正</td><td>${escapeHtml(bizNo || '—')}</td><td>${escapeHtml(summary)}</td><td>${escapeHtml(hint || 'OCR 识别字段人工修正')}</td><td class="ops"><button class="btn-text" onclick="openAuditDetail(this)">详情</button></td>`;
  body.prepend(tr);
  applyAuditFilter();
}

function openAuditDetail(btn) {
  const row = btn?.closest?.('tr');
  const set = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.value = val;
  };
  set('auditDetailOperator', row?.dataset.auditOperator || '关务张 / 海关专用账号');
  set('auditDetailTime', row?.dataset.auditTime || '2026-08-03 09:15:03 / 10.20.8.16');
  set('auditDetailModule', row?.dataset.auditModule || '关务保税 / DZ-20260803-001');
  set('auditDetailResult', row?.dataset.auditResult || '成功；差异项 2');
  set('auditDetailBefore', row?.dataset.auditBefore || '对账状态：未执行；差异重量：—');
  set('auditDetailAfter', row?.dataset.auditAfter || '对账状态：待复核；差异重量：-2.5 吨');
  openModal('modalAuditDetail');
}

function collectOutboundOcrFields() {
  return {
    customs: document.getElementById('obCustoms')?.value?.trim() || '',
    hz: document.getElementById('obHz')?.value?.trim() || '',
    consignee: document.getElementById('obConsignee')?.value?.trim() || '',
    consumerUnit: document.getElementById('obConsumerUnit')?.value?.trim() || '',
    weight: document.getElementById('obWeight')?.value?.trim() || '',
    amount: document.getElementById('obAmount')?.value?.trim() || '',
    currency: document.getElementById('obCurrency')?.value || 'CNY',
  };
}

function collectInboundOcrFields() {
  return {
    ship: document.getElementById('ibShip')?.value?.trim() || '',
    bl: document.getElementById('ibBl')?.value?.trim() || '',
    customs: document.getElementById('ibCustoms')?.value?.trim() || '',
    hz: document.getElementById('ibHz')?.value?.trim() || '',
    amount: document.getElementById('ibAmount')?.value?.trim() || '',
    currency: document.getElementById('ibCurrency')?.value || 'CNY',
  };
}

function collectReceiveOcrFields() {
  return {
    wet: document.getElementById('rcWet')?.value?.trim() || '',
    dry: document.getElementById('rcDry')?.value?.trim() || '',
    moisture: document.getElementById('rcMoisture')?.value?.trim() || '',
    docNo: document.getElementById('rcQualityNo')?.value?.trim() || '',
    elements: getQualityValuesFromContainer('rcQualityFields') || {},
  };
}

function collectOcrModalFields(target) {
  if (target === 'inbound') {
    return {
      ship: document.getElementById('ocrShip')?.value,
      bl: document.getElementById('ocrBl')?.value,
      customs: document.getElementById('ocrCustoms')?.value,
      hz: document.getElementById('ocrHz')?.value,
      amount: document.getElementById('ocrAmount')?.value,
      currency: document.getElementById('ocrCurrency')?.value,
    };
  }
  if (target === 'outbound') {
    return {
      customs: document.getElementById('ocrCustoms')?.value,
      hz: document.getElementById('ocrHz')?.value,
      consignee: document.getElementById('ocrConsignee')?.value,
      consumerUnit: document.getElementById('ocrConsumerUnit')?.value,
      weight: document.getElementById('ocrDry')?.value,
      amount: document.getElementById('ocrAmount')?.value,
      currency: document.getElementById('ocrCurrency')?.value,
    };
  }
  return {
    wet: document.getElementById('ocrWet')?.value,
    dry: document.getElementById('ocrDry')?.value,
    moisture: document.getElementById('ocrMoisture')?.value,
    docNo: document.getElementById('ocrDocNo')?.value,
    material: document.getElementById('ocrMaterial')?.value,
    elements: getOcrQualityValues(),
  };
}

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
  rememberOcrRecognized('inbound', collectInboundOcrFields());
}

function applyReceiveWeightOcr(data) {
  setInputValue('rcWet', data.wet);
  setInputValue('rcDry', data.dry);
  setInputValue('rcMoisture', data.moisture);
  setOcrStatus('rcWeightOcrStatus', `重量单已识别：湿重 ${data.wet}t / 干重 ${data.dry}t`, 'is-ok');
  rememberOcrRecognized('receive', collectReceiveOcrFields());
}

function applyReceiveQualityOcr(data) {
  const elements = data.elements || (data.cu ? { Cu: data.cu } : {});
  renderReceiveQualityFields(elements);
  setInputValue('rcMoisture', data.moisture);
  setInputValue('rcQualityNo', data.docNo);
  setOcrStatus('rcQualityOcrStatus', buildQualityOcrStatus(data), 'is-ok');
  rememberOcrRecognized('receive', collectReceiveOcrFields());
}

function applyOutboundOcr(data) {
  setInputValue('obCustoms', data.customs);
  setInputValue('obHz', data.hz);
  setInputValue('obWeight', data.weight);
  setInputValue('obAmount', data.amount);
  const currencySel = document.getElementById('obCurrency');
  if (currencySel && data.currency) currencySel.value = data.currency;
  setInputValue('obConsignee', data.consignee);
  setInputValue('obConsumerUnit', data.consumerUnit);
  selectOptionByText('obBatch', data.batch);
  upsertFlowPartner(data.consignee);
  setOcrStatus('obOcrStatus', `已识别：${data.preview || '出库报关单'} → 字段已回填（可手工修正）`, 'is-ok');
  rememberOcrRecognized('outbound', collectOutboundOcrFields());
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
  fillBondedSelects();
  syncInboundFiling();
  const afterPlan = () => {
    populateInboundStacks();
    openModal('modalInbound');
    const sel = document.querySelector('#modalInbound [data-consignor-select]');
    if (sel) {
      const opt = Array.from(sel.options).find((o) => o.text.includes('南国铜业') || o.value.includes('南国铜业'));
      if (opt) sel.value = opt.value;
    }
    setOcrStatus('ibOcrStatus', '上传提单或报关单影像，自动识别并回填下方字段');
    const currencySel = document.getElementById('ibCurrency');
    if (currencySel) currencySel.value = 'CNY';
    const mineral = document.getElementById('ibMineral');
    if (mineral) mineral.value = '铜精矿';
    const shipMode = document.getElementById('ibShipMode');
    if (shipMode) shipMode.value = '散货';
    const containers = document.getElementById('ibContainers');
    if (containers) containers.value = '';
    onIbShipModeChange();
    renderHarmfulFields('ibHarmfulFields', 'ib', {});
  };
  if (typeof ensureParkPlanLoaded === 'function') {
    Promise.resolve(ensureParkPlanLoaded()).then(afterPlan).catch(afterPlan);
  } else {
    afterPlan();
  }
}

function openOutboundModal() {
  fillBondedSelects();
  openModal('modalOutbound');
  const sel = document.querySelector('#modalOutbound [data-consignor-select]');
  if (sel) {
    const opt = Array.from(sel.options).find((o) => o.text.includes('南国铜业'));
    if (opt) sel.value = opt.value;
  }
  setOcrStatus('obOcrStatus', '上传出库报关单影像，自动识别并回填报关单号、核注清单号、流向企业、消费使用单位、重量与报关单金额');
  const currencySel = document.getElementById('obCurrency');
  if (currencySel) currencySel.value = 'USD';
  setInputValue('obAmount', '');
  setInputValue('obConsumerUnit', '');
  const remark = document.getElementById('obRemark');
  if (remark) remark.value = '';
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
  const tagCell = row.querySelector('.outbound-status');
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
  const tagCell = row.querySelector('.outbound-status');
  if (tagCell) tagCell.innerHTML = '<span class="tag tag-green">已出库</span>';
  renderOutboundOps(row);
  const cells = row.querySelectorAll('td');
  appendBondedLot({
    book: row.dataset.bondedBook || document.getElementById('obBonded')?.value || '',
    direction: '出库',
    orderNo: row.dataset.outboundId,
    customs: cells[4]?.textContent?.trim() || '',
    consignor: cells[1]?.textContent?.trim() || '',
    consignorShort: cells[1]?.textContent?.trim() || '',
    material: '',
    wet: '',
    dry: Number(String(cells[7]?.textContent || '').replace(/[^\d.]/g, '')) || '',
    value: Number(String(cells[6]?.textContent || '').replace(/[^\d.]/g, '')) || 0,
    stack: '—',
    at: finishAt,
    status: '已出库',
  });
  toast(`出库单 ${row.dataset.outboundId} 已完成 · 完成时间 ${finishAt}`, 'ok');
}

function applyOutboundFilter() {
  const consignor = (document.getElementById('obFilterConsignor')?.value || '').trim();
  const status = document.getElementById('obFilterStatus')?.value || '';
  const from = document.getElementById('obTimeFrom')?.value || '';
  const to = document.getElementById('obTimeTo')?.value || '';
  if (from && to && from > to) {
    toast('开始日期不能晚于结束日期', 'warn');
    return;
  }
  let visible = 0;
  document.querySelectorAll('#outboundTableBody tr').forEach((row) => {
    const at = row.dataset.outAt || '';
    const rowStatus = row.dataset.status || '';
    let show = true;
    if (status && rowStatus !== status) show = false;
    if (consignor && !(row.innerHTML || '').includes(consignor)) show = false;
    if (from && at && at < from) show = false;
    if (to && at && at > to) show = false;
    row.style.display = show ? '' : 'none';
    if (show) visible += 1;
  });
  toast(visible ? `已查询，共 ${visible} 条` : '该条件下暂无出库单', visible ? 'ok' : 'warn');
}

function saveOutbound() {
  const customs = document.getElementById('obCustoms')?.value?.trim();
  const hz = document.getElementById('obHz')?.value?.trim();
  const weight = document.getElementById('obWeight')?.value?.trim();
  const consignee = document.getElementById('obConsignee')?.value?.trim();
  const consumerUnit = document.getElementById('obConsumerUnit')?.value?.trim();
  const remark = document.getElementById('obRemark')?.value?.trim() || '';
  if (!customs || !hz) {
    toast('请先上传并 OCR 识别出库报关单，回填报关单号与核注清单号', 'warn');
    return;
  }
  if (!weight || !consignee || !consumerUnit) {
    toast('请填写出库重量、流向企业与消费使用单位（可通过 OCR 回填）', 'warn');
    return;
  }
  const bonded = document.getElementById('obBonded')?.value || '';
  if (!bonded) {
    toast('请匹配保税账册', 'warn');
    return;
  }
  upsertFlowPartner(consignee);
  appendBondedLot({
    book: bonded,
    direction: '出库',
    orderNo: `CK-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-NEW`,
    customs,
    consignor: document.querySelector('#modalOutbound [data-consignor-select]')?.selectedOptions?.[0]?.text || '',
    consignorShort: '',
    material: document.getElementById('obBatch')?.value || '',
    wet: '',
    dry: Number(weight) || '',
    value: Number(document.getElementById('obAmount')?.value) || 0,
    stack: '—',
    at: '—',
    status: '待出库',
  });
  const current = collectOutboundOcrFields();
  const baseline = ocrState.recognized?.target === 'outbound' ? ocrState.recognized.data : null;
  const changes = diffOcrFields(baseline || current, current);
  if (baseline && changes.length) {
    appendOcrCorrectionAudit({
      module: '出库',
      bizNo: 'CK-新建',
      customsNo: current.customs,
      prodBatch: document.getElementById('obBatch')?.value || '',
      changes,
      hint: `出库报关单 OCR 人工修正${remark ? ' · 备注 ' + remark : ''}`,
    });
    rememberOcrRecognized('outbound', current);
  }
  closeModal('modalOutbound');
  toast(remark ? '出库单已提交审核（含备注）' : '出库单已提交审核（原型演示）', 'ok');
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
    ocrConsumerUnit: target === 'outbound',
    ocrAmount: target === 'inbound' || target === 'outbound',
    ocrCurrency: target === 'inbound' || target === 'outbound',
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
    setInputValue('ocrAmount', data.amount);
    const ibCur = document.getElementById('ocrCurrency');
    if (ibCur) ibCur.value = data.currency || 'CNY';
    document.getElementById('ocrPreviewName').textContent = data.preview || '单据预览';
    document.getElementById('ocrPreviewHint').textContent = '提单 / 报关单影像（示意）';
  } else if (target === 'outbound') {
    setInputValue('ocrCustoms', data.customs);
    setInputValue('ocrHz', data.hz);
    setInputValue('ocrConsignee', data.consignee);
    setInputValue('ocrConsumerUnit', data.consumerUnit);
    setInputValue('ocrDry', data.weight);
    setInputValue('ocrAmount', data.amount);
    const obCur = document.getElementById('ocrCurrency');
    if (obCur) obCur.value = data.currency || 'USD';
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
  const edited = collectOcrModalFields(target);
  const baseline = ocrState.lastData || ocrState.recognized?.data;
  const changes = diffOcrFields(baseline, { ...baseline, ...edited });
  if (target === 'inbound') {
    applyInboundOcr({
      ship: edited.ship,
      bl: edited.bl,
      customs: edited.customs,
      hz: edited.hz,
      arrival: document.getElementById('ibArrival')?.value || OCR_SAMPLES.inbound_bl.arrival,
      amount: edited.amount,
      currency: edited.currency,
      material: OCR_SAMPLES.inbound_bl.material,
      preview: document.getElementById('ocrPreviewName')?.textContent,
    });
  } else if (target === 'outbound') {
    applyOutboundOcr({
      customs: edited.customs,
      hz: edited.hz,
      consignee: edited.consignee,
      consumerUnit: edited.consumerUnit,
      weight: edited.weight,
      amount: edited.amount,
      currency: edited.currency,
      batch: OCR_SAMPLES.outbound_customs.batch,
      preview: document.getElementById('ocrPreviewName')?.textContent,
    });
  } else {
    applyReceiveWeightOcr({
      wet: edited.wet,
      dry: edited.dry,
      moisture: edited.moisture,
    });
    applyReceiveQualityOcr({
      docNo: edited.docNo,
      elements: edited.elements,
      moisture: edited.moisture,
      material: edited.material,
    });
  }
  if (changes.length) {
    const module = target === 'outbound' ? '出库' : target === 'inbound' ? '入库' : '入库';
    appendOcrCorrectionAudit({
      module,
      bizNo: target === 'outbound' ? '出库报关单' : target === 'inbound' ? '入库预约' : '收货登记',
      customsNo: edited.customs || '',
      prodBatch: target === 'outbound' ? (document.getElementById('obBatch')?.value || '') : '',
      changes,
      hint: 'OCR 识别详情人工修正后回填',
    });
  }
  ocrState.lastData = { ...(baseline || {}), ...edited };
  closeModal('modalOcr');
  toast(changes.length ? 'OCR 字段已修正、回填并留痕' : 'OCR 字段已回填并归档', 'ok');
}

function saveInbound() {
  const ship = document.getElementById('ibShip')?.value?.trim();
  const bl = document.getElementById('ibBl')?.value?.trim();
  if (!ship || !bl) {
    toast('请填写船名与提单号，或使用 OCR 识别回填', 'warn');
    return;
  }
  const current = collectInboundOcrFields();
  const baseline = ocrState.recognized?.target === 'inbound' ? ocrState.recognized.data : null;
  const changes = baseline ? diffOcrFields(baseline, current) : [];
  if (changes.length) {
    appendOcrCorrectionAudit({
      module: '入库',
      bizNo: 'RK-预约',
      customsNo: current.customs,
      prodBatch: '',
      changes,
      hint: '入库提单/报关单 OCR 人工修正',
    });
    rememberOcrRecognized('inbound', current);
  }
  if (!inboundPick.stackCode) {
    toast('请选择预定堆位', 'warn');
    return;
  }
  const grid = getStackGrid(inboundPick.stackCode);
  if (!grid.fromPlan) {
    toast('该堆位未在平面图中绘制，请先到系统设置 · 平面图设置绘制后再选存放位置', 'warn');
    return;
  }
  if (!inboundPick.cells.size) {
    toast('请在右侧网格圈选存放位置', 'warn');
    return;
  }
  const bonded = document.getElementById('ibBonded')?.value;
  if (!bonded || !bondedAllowsInbound(bonded)) {
    toast('请匹配可入库的保税账册（只出不进的旧账不可再入库）', 'warn');
    return;
  }
  INBOUND_RESERVES = INBOUND_RESERVES.filter((r) => r.id !== 'RK-预约');
  INBOUND_RESERVES.push({
    id: `RK-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-NEW`,
    stackCode: inboundPick.stackCode,
    cells: [...inboundPick.cells].map((k) => {
      const [r, c] = k.split(',');
      return { r: Number(r), c: Number(c) };
    }),
  });
  persistInboundReserves();
  const newId = `RK-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-NEW`;
  const consignorName = document.querySelector('#modalInbound [data-consignor-select]')?.value || '';
  const consignorMeta = (typeof CONSIGNORS !== 'undefined' ? CONSIGNORS : []).find((c) => c.name === consignorName);
  const shipMode = document.getElementById('ibShipMode')?.value || '散货';
  const docked = String(inboundPick.stackCode || '').includes('码头');
  INBOUND_LIST.unshift({
    id: newId,
    at: wmsDemoToday(),
    consignor: consignorName,
    consignorShort: consignorMeta?.short || consignorName,
    mineral: document.getElementById('ibMineral')?.value || '铜精矿',
    ship: document.getElementById('ibShip')?.value?.trim() || '',
    bl: document.getElementById('ibBl')?.value?.trim() || '',
    customs: document.getElementById('ibCustoms')?.value?.trim() || '',
    hz: document.getElementById('ibHz')?.value?.trim() || '',
    amount: Number(document.getElementById('ibAmount')?.value) || 0,
    currency: document.getElementById('ibCurrency')?.value || 'CNY',
    wetDry: '— / —',
    stack: inboundPick.stackCode,
    shipMode,
    containers: shipMode === '集装箱' ? (document.getElementById('ibContainers')?.value || '') : '',
    harmful: collectHarmfulFrom('ibHarmfulFields'),
    status: docked ? '暂存码头' : '待收货',
  });
  renderInboundTable();
  appendBondedLot({
    book: bonded,
    direction: '入库',
    orderNo: newId,
    customs: document.getElementById('ibCustoms')?.value?.trim() || '',
    consignor: document.querySelector('#modalInbound [data-consignor-select]')?.selectedOptions?.[0]?.text || '',
    consignorShort: '',
    material: document.getElementById('ibMaterial')?.selectedOptions?.[0]?.text || '',
    wet: '',
    dry: '',
    value: Number(document.getElementById('ibAmount')?.value) || 0,
    stack: inboundPick.stackCode,
    at: wmsDemoToday(),
    status: '待收货',
  });
  closeModal('modalInbound');
  toast(`入库预约已提交，预定 ${inboundPick.stackCode} 共 ${inboundPick.cells.size} 格`, 'ok');
  if (typeof renderParkYard === 'function' && document.getElementById('app')?.classList.contains('cockpit-mode')) {
    renderParkYard();
  }
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
  dockAgingDays: 7,
  filingUsageAlertPct: 80,
  qualityParams: DEFAULT_QUALITY_PARAMS.map((p) => ({ ...p })),
};

const DEFAULT_SOURCE_FILINGS = [
  { code: 'JG4-2025-KY02', source: '澳洲精矿', country: '澳大利亚', date: '2025-01-15', quotaDmt: 10000, usedDmt: 8200 },
  { code: 'JG4-2024-KY01', source: '澳洲精矿', country: '澳大利亚', date: '2024-06-01', quotaDmt: 8000, usedDmt: 8000 },
  { code: 'JG-2023-KY04', source: '智利精矿', country: '智利', date: '2023-03-20', quotaDmt: 30000, usedDmt: 19637.76 },
  { code: 'JG-2022-KY03', source: '智利精矿', country: '智利', date: '2022-08-10', quotaDmt: 20000, usedDmt: 20000 },
];

const FILING_LOTS = [
  { filing: 'JG-2023-KY04', customs: 'BG20260801022', consignor: '广西金川有色金属有限公司', consignorShort: '广西金川', material: '原料物料-B', cargoType: '报备矿', wet: 360, dry: 330, stack: '1#A2', inAt: '2026-07-28 9时', status: '在库' },
  { filing: 'JG-2023-KY04', customs: 'BG20260725088', consignor: '五矿有色金属股份有限公司', consignorShort: '五矿有色', material: '原料物料-D', cargoType: '报备矿', wet: 2100, dry: 1920, stack: '码头#A1', inAt: '2026-07-25 8时', status: '在库' },
  { filing: 'JG-2023-KY04', customs: 'BG20260512009', consignor: '广西金川有色金属有限公司', consignorShort: '广西金川', material: '原料物料-B', cargoType: '报备矿', wet: 8200, dry: 7380, stack: '1#A2', inAt: '2026-05-12 10时', status: '已投料' },
  { filing: 'JG-2023-KY04', customs: 'BG20250418031', consignor: '广西南国铜业有限责任公司', consignorShort: '南国铜业', material: '原料物料-B', cargoType: '报备矿', wet: 11000, dry: 10007.76, stack: '2#B1', inAt: '2025-04-18 14时', status: '已核销' },
  { filing: 'JG4-2025-KY02', customs: 'BG20260428016', consignor: '五矿有色金属股份有限公司', consignorShort: '五矿有色', material: '原料物料-C', cargoType: '报备矿', wet: 280, dry: 252, stack: '5#小A', inAt: '2026-04-28 8时', status: '在库' },
  { filing: 'JG4-2025-KY02', customs: 'BG20250120014', consignor: '五矿有色金属股份有限公司', consignorShort: '五矿有色', material: '原料物料-C', cargoType: '报备矿', wet: 8800, dry: 7948, stack: '5#小A', inAt: '2025-01-20 11时', status: '已核销' },
  { filing: 'JG4-2024-KY01', customs: 'BG20240601008', consignor: '五矿有色金属股份有限公司', consignorShort: '五矿有色', material: '原料物料-C', cargoType: '报备矿', wet: 8900, dry: 8000, stack: '5#大A前', inAt: '2024-06-08 9时', status: '已核销' },
  { filing: 'JG-2022-KY03', customs: 'BG20220810044', consignor: '广西南国铜业有限责任公司', consignorShort: '南国铜业', material: '原料物料-B', cargoType: '报备矿', wet: 22200, dry: 20000, stack: '2#A2', inAt: '2022-08-16 15时', status: '已核销' },
];

let filingLotsViewCode = '';

const HARMFUL5 = [
  { code: 'As', name: '砷' },
  { code: 'Pb', name: '铅' },
  { code: 'Cd', name: '镉' },
  { code: 'F', name: '氟' },
  { code: 'Hg', name: '汞' },
];

function formatHarmful5(h) {
  if (!h) return '—';
  const parts = HARMFUL5.map((p) => (h[p.code] ? `${p.code}${h[p.code]}` : '')).filter(Boolean);
  return parts.length ? parts.join('；') : '—';
}

function renderHarmfulFields(containerId, prefix, values = {}) {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = HARMFUL5.map((p) => `
    <div class="form-group"><label>${p.name}(${p.code})</label>
      <input class="input" id="${prefix}H_${p.code}" data-h-code="${p.code}" value="${values[p.code] || ''}" placeholder="如 0.12%" />
    </div>`).join('');
}

function collectHarmfulFrom(containerId) {
  const values = {};
  document.querySelectorAll(`#${containerId} [data-h-code]`).forEach((input) => {
    if (input.dataset.hCode && input.value.trim()) values[input.dataset.hCode] = input.value.trim();
  });
  return values;
}

function inboundStatusTag(status) {
  if (status === '暂存码头') return '<span class="tag tag-red">暂存码头</span>';
  if (status === '待收货') return '<span class="tag tag-orange">待收货</span>';
  if (status === '混成品') return '<span class="tag tag-purple">混成品</span>';
  return '<span class="tag tag-green">已入库</span>';
}

function inboundOps(row) {
  if (row.status === '待收货' || row.status === '暂存码头') {
    return `<button class="btn-text" onclick="openReceiveModal('${row.id}')">收货</button><button class="btn-text" onclick="openInboundModal();runInboundOcr('bl')">OCR</button>`;
  }
  return `<button class="btn-text" onclick="openLotDocs('${row.id}')">详情</button>`;
}

const INBOUND_LIST = [
  {
    id: 'RK-20260725-020',
    at: '2026-07-25',
    consignor: '五矿有色金属股份有限公司',
    consignorShort: '五矿有色',
    mineral: '铜精矿',
    ship: '远洋号',
    bl: 'BL20260720008',
    customs: 'BG20260725088',
    hz: 'HZ20260725008',
    amount: 1800000,
    currency: 'USD',
    wetDry: '2100 / 1920',
    stack: '码头#A1',
    shipMode: '散货',
    containers: '',
    harmful: { As: '0.18%', Pb: '0.11%', Cd: '0.03%', F: '0.05%', Hg: '0.002%' },
    status: '暂存码头',
  },
  {
    id: 'RK-20260803-001',
    at: '2026-08-03',
    consignor: '五矿有色金属股份有限公司',
    consignorShort: '五矿有色',
    mineral: '铜精矿',
    ship: '海洋之星',
    bl: 'BL20260801001',
    customs: 'BG20260801088',
    hz: 'HZ20260801012',
    amount: 1280000,
    currency: 'USD',
    wetDry: '— / —',
    stack: '—',
    shipMode: '集装箱',
    containers: '12',
    harmful: { As: '0.12%', Pb: '0.08%', Cd: '0.02%', F: '0.04%', Hg: '0.001%' },
    status: '待收货',
  },
  {
    id: 'RK-20260804-004',
    at: '2026-08-04',
    consignor: '广西南国铜业有限责任公司',
    consignorShort: '南国铜业',
    mineral: '铜精矿',
    ship: '海豚号',
    bl: 'BL20260804002',
    customs: 'BG20260804088',
    hz: 'HZ20260804012',
    amount: 218000,
    currency: 'USD',
    wetDry: '— / —',
    stack: '—',
    shipMode: '散货',
    containers: '',
    harmful: { As: '0.09%', Pb: '0.06%', Cd: '0.01%', F: '0.03%', Hg: '0.001%' },
    status: '待收货',
  },
  {
    id: 'RK-20260801-015',
    at: '2026-08-01',
    consignor: '广西南国铜业有限责任公司',
    consignorShort: '南国铜业',
    mineral: '铜精矿',
    ship: '金海轮',
    bl: 'BL20260725003',
    customs: 'BG20260725022',
    hz: 'HZ20260725007',
    amount: 2100000,
    currency: 'USD',
    wetDry: '800 / 720',
    stack: '2#A1',
    shipMode: '散货',
    containers: '',
    harmful: { As: '0.15%', Pb: '0.09%', Cd: '0.02%', F: '0.04%', Hg: '0.001%' },
    status: '已入库',
  },
  {
    id: 'RK-20260802-018',
    at: '2026-08-02',
    consignor: '广西金川有色金属有限公司',
    consignorShort: '广西金川',
    mineral: '冰铜',
    ship: '远航号',
    bl: 'BL20260728005',
    customs: 'BG20260728041',
    hz: 'HZ20260728009',
    amount: 860000,
    currency: 'CNY',
    wetDry: '520 / 468',
    stack: '4#A2',
    shipMode: '集装箱',
    containers: '8',
    harmful: { As: '0.10%', Pb: '0.07%', Cd: '0.02%', F: '0.03%', Hg: '0.001%' },
    status: '混成品',
  },
];

const INBOUND_STATUS_ORDER = { 暂存码头: 0, 待收货: 1, 已入库: 2, 混成品: 3 };

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
  const consignor = document.getElementById('inboundConsignorFilter')?.value || '';
  const status = document.getElementById('inboundStatusFilter')?.value || '';
  const shipMode = document.getElementById('inboundShipModeFilter')?.value || '';
  const mineral = document.getElementById('inboundMineralFilter')?.value || '';
  const from = document.getElementById('inboundTimeFrom')?.value || '';
  const to = document.getElementById('inboundTimeTo')?.value || '';
  const kw = (document.getElementById('inboundKeyword')?.value || '').trim().toLowerCase();
  const rows = sortInboundList(INBOUND_LIST).filter((row) => {
    if (consignor && row.consignor !== consignor) return false;
    if (status && row.status !== status) return false;
    if (shipMode && row.shipMode !== shipMode) return false;
    if (mineral && row.mineral !== mineral) return false;
    if (from && row.at && row.at < from) return false;
    if (to && row.at && row.at > to) return false;
    if (kw && !(`${row.id}${row.ship}${row.bl}${row.customs}`).toLowerCase().includes(kw)) return false;
    return true;
  });
  tbody.innerHTML = rows.map((row) => {
    const harm = formatHarmful5(row.harmful);
    return `
    <tr>
      <td>${row.id}</td>
      <td><span class="tag tag-purple" title="${row.consignor}">${row.consignorShort}</span></td>
      <td>${row.mineral || '—'}</td>
      <td>${row.ship}</td>
      <td>${row.bl}</td>
      <td>${row.customs}</td>
      <td>${row.hz}</td>
      <td>${formatInboundAmount(row.amount, row.currency)}</td>
      <td>${row.wetDry}</td>
      <td>${row.shipMode || '—'}</td>
      <td>${row.shipMode === '集装箱' && row.containers ? row.containers : '—'}</td>
      <td class="mat-quality-cell" title="${harm}">${harm}</td>
      <td>${row.stack}</td>
      <td>${inboundStatusTag(row.status)}</td>
      <td class="ops">${inboundOps(row)}</td>
    </tr>`;
  }).join('') || '<tr><td colspan="15" style="color:var(--text-2)">无符合条件的入库单</td></tr>';
  const count = document.getElementById('inboundTableCount');
  if (count) count.textContent = `共 ${rows.length} 条`;
}

function onIbShipModeChange() {
  const mode = document.getElementById('ibShipMode')?.value;
  const g = document.getElementById('ibContainerGroup');
  if (g) g.hidden = mode !== '集装箱';
}

function onRcShipModeChange() {
  const mode = document.getElementById('rcShipMode')?.value;
  const g = document.getElementById('rcContainerGroup');
  if (g) g.hidden = mode !== '集装箱';
}

const INBOUND_ORDERS = {
  'RK-20260725-020': {
    consignor: '五矿有色金属股份有限公司',
    material: '原料物料-D',
    cargoType: '报备矿',
    filingCode: 'JG-2023-KY04',
    customs: 'BG20260725088',
    defaultDry: 1920,
  },
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
  set('paramDockAgingDays', p.dockAgingDays);
  set('paramFilingUsage', p.filingUsageAlertPct);
  renderParamQualityTable();
}

function saveSysParams() {
  const cap = Number(document.getElementById('paramCapAlert')?.value);
  const aging = Number(document.getElementById('paramAgingDays')?.value);
  const dockAging = Number(document.getElementById('paramDockAgingDays')?.value);
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
  if (!dockAging || dockAging <= 0) {
    toast('码头仓库预警天数须大于 0', 'warn');
    return;
  }
  if (!filing || filing <= 0 || filing > 100) {
    toast('矿源备案用量预警阈值须为 1–100', 'warn');
    return;
  }
  persistSysParams({
    capAlertPct: cap || DEFAULT_SYS_PARAMS.capAlertPct,
    agingDays: aging || DEFAULT_SYS_PARAMS.agingDays,
    dockAgingDays: dockAging || DEFAULT_SYS_PARAMS.dockAgingDays,
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
      <td>${f.source}</td><td>${f.country}</td>
      <td><button type="button" class="btn-text" onclick="openFilingLotsModal('${f.code}')" title="查看该备案下全部票货">${f.code}</button></td>
      <td>${f.date}</td>
      <td><span class="tag ${st.cls}">${st.label}</span></td>
      <td>${f.quotaDmt.toLocaleString('zh-CN')}</td>
      <td>${f.usedDmt.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
      <td>${rem.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
      <td>${pctCell}</td>
      <td>${getMatAttachmentCount(f.code) ? `<span class="tag tag-blue">${getMatAttachmentCount(f.code)} 个</span>` : '—'}</td>
      <td class="ops">
        <button class="btn-text" onclick="openFilingLotsModal('${f.code}')">票货</button>
        <button class="btn-text" onclick="openSourceFilingModal('${f.code}')">编辑</button>
        <button class="btn-text" onclick="openMaterialAttachmentsModal('${f.code}')">查看附件</button>
      </td>
    </tr>`;
  }).join('');
}

function lotsOfFiling(code) {
  return FILING_LOTS.filter((lot) => lot.filing === code);
}

function lotStatusTag(status) {
  if (status === '在库') return '<span class="tag tag-green">在库</span>';
  if (status === '已投料') return '<span class="tag tag-orange">已投料</span>';
  return '<span class="tag tag-gray">已核销</span>';
}

function openFilingLotsModal(code) {
  const f = getSourceFiling(code);
  filingLotsViewCode = code;
  const lots = lotsOfFiling(code);
  const title = document.getElementById('filingLotsTitle');
  if (title) title.textContent = `备案票货 · ${code}`;
  const anno = document.getElementById('filingLotsAnno');
  if (anno) {
    const src = f ? `${f.source} · ${f.country}` : '';
    anno.innerHTML = `<strong>${code}</strong>${src ? `（${src}）` : ''} 下共 <strong>${lots.length}</strong> 票货。点击报关单号可查看本票详情。`;
  }
  const tbody = document.getElementById('filingLotsBody');
  if (tbody) {
    tbody.innerHTML = lots.length
      ? lots.map((lot) => `
        <tr>
          <td><button type="button" class="btn-text" onclick="closeModal('modalFilingLots');openLotDocs('${lot.customs}')">${lot.customs}</button></td>
          <td><span class="tag tag-purple" title="${lot.consignor}">${lot.consignorShort}</span></td>
          <td>${lot.material}</td>
          <td><span class="tag tag-orange">${lot.cargoType}</span></td>
          <td>${lot.stack}</td>
          <td>${Number(lot.wet).toLocaleString('zh-CN')}</td>
          <td>${Number(lot.dry).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
          <td>${lot.inAt}</td>
          <td>${lotStatusTag(lot.status)}</td>
          <td class="ops"><button type="button" class="btn-text" onclick="closeModal('modalFilingLots');openLotDocs('${lot.customs}')">详情</button></td>
        </tr>`).join('')
      : '<tr><td colspan="10" style="color:var(--text-2)">该备案下暂无票货</td></tr>';
  }
  openModal('modalFilingLots');
}

function exportSourceFilingsExcel() {
  const list = loadSourceFilings();
  if (!list.length) {
    toast('暂无矿源备案可导出', 'warn');
    return;
  }
  const threshold = loadSysParams().filingUsageAlertPct;
  downloadExcel(
    `矿源备案_${new Date().toISOString().slice(0, 10)}.xls`,
    '矿源备案',
    ['矿源', '备案原产国', '矿源备案编号', '备案日期', '状态', '备案数量(DMT)', '核销吨数', '剩余吨数', '用量%'],
    list.map((f) => {
      const rem = filingRemaining(f);
      const pct = filingUsagePct(f);
      const st = filingStatusMeta(f);
      return [
        f.source, f.country, f.code, f.date, st.label,
        f.quotaDmt, f.usedDmt, rem, `${pct.toFixed(2)}%${pct >= threshold ? '（预警）' : ''}`,
      ];
    }),
  );
  toast(`已导出 ${list.length} 条矿源备案`, 'ok');
}

function exportFilingLotsExcel() {
  const code = filingLotsViewCode;
  const lots = lotsOfFiling(code);
  if (!code) {
    toast('请先打开一条矿源备案', 'warn');
    return;
  }
  if (!lots.length) {
    toast('该备案下暂无票货可导出', 'warn');
    return;
  }
  downloadExcel(
    `矿源备案票货_${code}.xls`,
    '备案票货',
    ['矿源备案编号', '报关单号', '委托方', '物料', '货物类型', '堆位', '湿重', '干重(DMT)', '入库时间', '状态'],
    lots.map((lot) => [
      lot.filing, lot.customs, lot.consignor, lot.material, lot.cargoType,
      lot.stack, lot.wet, lot.dry, lot.inAt, lot.status,
    ]),
  );
  toast(`已导出 ${lots.length} 票货`, 'ok');
}

function openSourceFilingModal(code) {
  const f = getSourceFiling(code);
  if (!f) {
    const draftCode = document.getElementById('sfCode')?.value?.trim() || '';
    matAttachState.code = draftCode;
    renderMatAttachmentLists(draftCode);
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
  matAttachState.code = f.code;
  renderMatAttachmentLists(f.code);
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
  const listRow = INBOUND_LIST.find((r) => r.id === orderId);
  set('rcMineral', listRow?.mineral || '铜精矿');
  set('rcShipMode', listRow?.shipMode || '散货');
  set('rcContainers', listRow?.containers || '');
  onRcShipModeChange();
  renderHarmfulFields('rcHarmfulFields', 'rc', listRow?.harmful || {});
  set('rcWet', '');
  set('rcDry', order.defaultDry || '');
  set('rcQualityNo', '');
  set('rcMoisture', '');
  renderReceiveQualityFields({});
  setOcrStatus('rcWeightOcrStatus', '重量单：待上传');
  setOcrStatus('rcQualityOcrStatus', '品质证书：待上传');
  fillBondedSelects();
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
    cargoType: '混成品',
    category: '成品',
    stack: '4#A1',
    wet: '—',
    dry: '180',
    customsDoc: {
      name: '—',
      pending: true,
      fields: [
        ['出库报关单号', '—'],
        ['流向企业', '—'],
        ['生产批次', 'FL-20260803'],
        ['说明', '尚未出库，出库完成后归档出库报关单'],
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
    cargoType: '混成品',
    category: '成品',
    stack: '4#A2',
    wet: '—',
    dry: '180',
    customsDoc: {
      name: '—',
      pending: true,
      fields: [
        ['出库报关单号', '—'],
        ['流向企业', '—'],
        ['生产批次', 'FL-20260802'],
        ['说明', '尚未出库，出库完成后归档出库报关单'],
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
  'FL-20260728': {
    title: '本票详情 · 生产批次 FL-20260728',
    inboundNo: 'WG-20260728-01',
    customs: '—',
    prodBatch: 'FL-20260728',
    consignor: '广西金川有色金属有限公司',
    consignorShort: '广西金川',
    material: '成品物料-A',
    cargoType: '混成品',
    category: '成品',
    stack: '4#B1',
    wet: '—',
    dry: '220',
    customsDoc: {
      name: '—',
      pending: true,
      fields: [
        ['出库报关单号', '—'],
        ['流向企业', '—'],
        ['生产批次', 'FL-20260728'],
        ['说明', '尚未出库，出库完成后归档出库报关单'],
      ],
    },
    weightDoc: {
      name: '完工计量单 WG-20260728-01.pdf',
      no: 'WG-20260728-01',
      fields: [
        ['证书编号', 'WG-20260728-01'],
        ['产量干重', '220 吨'],
        ['完工日期', '2026-07-28'],
      ],
    },
    qualityDoc: {
      name: '成品品质报告 QA-FL-20260728.pdf',
      no: 'QA-FL-20260728',
      fields: [
        ['证书编号', 'QA-FL-20260728'],
        ['物料', '成品物料-A'],
        ['检定日期', '2026-07-28'],
      ],
      elements: { Cu: '24.0%', Ag: '29g/t', Au: '0.3g/t', As: '0.09%', Pb: '0.03%', Cd: '0.005%', F: '0.01%', Hg: '0.0005%' },
    },
  },
  'FL-20260801': {
    title: '本票详情 · 生产批次 FL-20260801',
    inboundNo: 'WG-20260801-01',
    customs: 'BGCK2026080102',
    prodBatch: 'FL-20260801',
    consignor: '广西金川有色金属有限公司',
    consignorShort: '广西金川',
    material: '成品物料-A',
    cargoType: '混成品',
    category: '成品',
    stack: '—',
    wet: '—',
    dry: '240',
    outbound: true,
    flowTo: '滨海贸易有限公司',
    customsDoc: {
      name: '出口货物报关单 BGCK2026080102.pdf',
      fields: [
        ['出库报关单号', 'BGCK2026080102'],
        ['核注清单', 'HZCK2026080102'],
        ['流向企业', '滨海贸易有限公司'],
        ['生产批次', 'FL-20260801'],
        ['重量', '240 干吨'],
        ['报关单金额', '¥ 850,000'],
      ],
    },
    weightDoc: {
      name: '完工计量单 WG-20260801-01.pdf',
      no: 'WG-20260801-01',
      fields: [
        ['证书编号', 'WG-20260801-01'],
        ['产量干重', '240 吨'],
        ['完工日期', '2026-08-01'],
      ],
    },
    qualityDoc: {
      name: '成品品质报告 QA-FL-20260801.pdf',
      no: 'QA-FL-20260801',
      fields: [
        ['证书编号', 'QA-FL-20260801'],
        ['物料', '成品物料-A'],
        ['检定日期', '2026-08-01'],
      ],
      elements: { Cu: '24.5%', Ag: '31g/t', Au: '0.3g/t', As: '0.08%', Pb: '0.03%', Cd: '0.005%', F: '0.01%', Hg: '0.0005%' },
    },
  },
  'BG20260715033': {
    title: '本票详情 · BG20260715033',
    inboundNo: 'RK-20260715-009',
    customs: 'BG20260715033',
    prodBatch: '—',
    consignor: '广西金川有色金属有限公司',
    consignorShort: '广西金川',
    material: '原料物料-A',
    cargoType: '报备矿',
    category: '原料',
    stack: '2#A1',
    wet: '4375',
    dry: '3938',
    customsDoc: {
      name: '进口货物报关单 BG20260715033.pdf',
      fields: [
        ['报关单号', 'BG20260715033'],
        ['核注清单', 'HZ20260715006'],
        ['境内收货人', '广西金川有色金属有限公司'],
        ['原产国', '秘鲁'],
      ],
    },
    weightDoc: {
      name: '重量证书 WGT-20260715-009.pdf',
      no: 'WGT-20260715-009',
      fields: [
        ['证书编号', 'WGT-20260715-009'],
        ['湿重', '4375 吨'],
        ['干重', '3938 吨'],
        ['水分', '10.0%'],
        ['检定日期', '2026-07-15'],
      ],
    },
    qualityDoc: {
      name: '品质检验证书 QA-20260715-009.pdf',
      no: 'QA-20260715-009',
      fields: [
        ['证书编号', 'QA-20260715-009'],
        ['物料', '原料物料-A'],
        ['检定日期', '2026-07-15'],
      ],
      elements: { Cu: '23.0%', Ag: '40g/t', Au: '0.5g/t', As: '0.11%', Pb: '0.05%', Cd: '0.01%', F: '0.02%', Hg: '0.001%' },
    },
  },
  'BG20260725088': {
    title: '本票详情 · BG20260725088',
    inboundNo: 'RK-20260725-012',
    customs: 'BG20260725088',
    prodBatch: '—',
    consignor: '五矿有色金属股份有限公司',
    consignorShort: '五矿有色',
    material: '原料物料-D',
    cargoType: '报备矿',
    category: '原料',
    stack: '码头#A1',
    wet: '2100',
    dry: '1920',
    customsDoc: {
      name: '进口货物报关单 BG20260725088.pdf',
      fields: [
        ['报关单号', 'BG20260725088'],
        ['核注清单', 'HZ20260725011'],
        ['境内收货人', '五矿有色金属股份有限公司'],
        ['矿源备案号', 'JG-2023-KY04'],
        ['原产国', '智利'],
      ],
    },
    weightDoc: {
      name: '重量证书 WGT-20260725-012.pdf',
      no: 'WGT-20260725-012',
      fields: [
        ['证书编号', 'WGT-20260725-012'],
        ['湿重', '2100 吨'],
        ['干重', '1920 吨'],
        ['水分', '8.6%'],
        ['检定日期', '2026-07-25'],
      ],
    },
    qualityDoc: {
      name: '品质检验证书 QA-20260725-012.pdf',
      no: 'QA-20260725-012',
      fields: [
        ['证书编号', 'QA-20260725-012'],
        ['物料', '原料物料-D'],
        ['检定日期', '2026-07-25'],
      ],
      elements: { Cu: '22.0%', Ag: '36g/t', Au: '0.4g/t', As: '0.18%', Pb: '0.11%', Cd: '0.03%', F: '0.05%', Hg: '0.002%' },
    },
  },
};

LOT_DOCS.BG20260728041 = LOT_DOCS['RK-20260802-018'];
LOT_DOCS.BG20260725022 = LOT_DOCS['RK-20260801-015'];
LOT_DOCS.BGCK2026080102 = LOT_DOCS['FL-20260801'];

let lotDocsCurrentKey = '';

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

function resetLotDocsTabs(finished) {
  const root = document.getElementById('lotDocsTabs');
  if (!root) return;
  const weightTab = root.querySelector('[data-tab="weight"]');
  const customsTab = root.querySelector('[data-tab="customs"]');
  if (weightTab) weightTab.style.display = finished ? 'none' : '';
  if (customsTab) customsTab.textContent = finished ? '出库报关单' : '报关单';
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
  lotDocsCurrentKey = key;
  const finished = lot.category === '成品';
  const titleEl = document.getElementById('lotDocsTitle');
  if (titleEl) titleEl.textContent = lot.title;
  const anno = document.getElementById('lotDocsAnno');
  if (anno) {
    anno.innerHTML = finished
      ? '<strong>成品</strong>详情仅展示<strong>出库报关单</strong>与<strong>品质证书</strong>；尚未出库时出库报关单为 —。'
      : '上架后本票归档报关单、重量证书、品质证书；品质参数仅属于这一票货。';
  }
  const stats = document.getElementById('lotDocsStats');
  if (stats) {
    const flow = lot.flowTo ? `<div class="sub">流向 ${lot.flowTo}</div>` : `<div class="sub">${lot.category}</div>`;
    stats.innerHTML = `
      <div class="stat-card"><div class="label">委托方</div><div class="value" style="font-size:14px">${lot.consignorShort}</div><div class="sub">${lot.material}</div></div>
      <div class="stat-card"><div class="label">${finished ? '出库报关单 / 生产批次' : '报关单号 / 生产批次'}</div><div class="value" style="font-size:14px">${lot.customs}</div><div class="sub">${lot.prodBatch}</div></div>
      <div class="stat-card"><div class="label">湿重 / 干重</div><div class="value" style="font-size:14px">${lot.wet} / ${lot.dry}</div><div class="sub">吨 · ${lot.stack}</div></div>
      <div class="stat-card ok"><div class="label">货物类型</div><div class="value" style="font-size:14px">${lot.cargoType}</div>${flow}</div>`;
  }
  const customsPaper = document.getElementById('lotDocsCustomsPaper');
  if (customsPaper) {
    const paperTitle = finished
      ? (lot.customsDoc.pending ? '出库报关单（尚未出库）' : '海关出口货物报关单')
      : '海关进口货物报关单';
    customsPaper.innerHTML = lotDocsPaperHtml(
      paperTitle,
      lot.customsDoc.name,
      lot.customsDoc.fields.slice(0, 3).map(([k, v]) => `${k}：${v}`),
    );
  }
  const customsFields = document.getElementById('lotDocsCustomsFields');
  if (customsFields) customsFields.innerHTML = lotDocsFieldHtml(lot.customsDoc.fields);
  const weightPaper = document.getElementById('lotDocsWeightPaper');
  if (weightPaper && lot.weightDoc) {
    weightPaper.innerHTML = lotDocsPaperHtml('重量证书', lot.weightDoc.name, [
      `编号 ${lot.weightDoc.no}`,
      `湿重 ${lot.wet} 吨 · 干重 ${lot.dry} 吨`,
    ]);
  }
  const weightFields = document.getElementById('lotDocsWeightFields');
  if (weightFields && lot.weightDoc) weightFields.innerHTML = lotDocsFieldHtml(lot.weightDoc.fields);
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
  resetLotDocsTabs(finished);
  openModal('modalLotDocs');
}

function ledgerRowHtml(row) {
  return `<tr>
    <td>${row.time}</td>
    <td>${row.type}</td>
    <td>${row.bizNo}</td>
    <td>${row.flowTo || '—'}</td>
    <td>${row.stack}</td>
    <td>${row.wet}</td>
    <td>${row.dry}</td>
    <td>${row.balance}</td>
    <td>${row.operator}</td>
  </tr>`;
}

function defaultLedgerForLot(key, lot) {
  const isOut = !!lot.outbound;
  const inboundType = lot.category === '成品' ? '完工入库' : '入库上架';
  const inboundNo = lot.inboundNo || '—';
  const inTime = lot.category === '成品' ? '2026-08-01 09时' : '2026-08-02 10时';
  const rows = [
    { time: inTime, type: inboundType, bizNo: inboundNo, flowTo: '—', stack: lot.stack === '—' ? '6#C2' : lot.stack, wet: lot.wet === '—' ? '—' : `+${lot.wet}`, dry: `+${lot.dry}`, balance: lot.dry, operator: '仓管员' },
  ];
  if (isOut) {
    rows.push({
      time: '2026-08-01 15时',
      type: '出库',
      bizNo: 'CK-20260801-008',
      flowTo: lot.flowTo || '滨海贸易有限公司',
      stack: '6#C2 → —',
      wet: '—',
      dry: `-${lot.dry}`,
      balance: '0',
      operator: '仓管员',
    });
  }
  return rows;
}

const LOT_LEDGERS = {
  BG20260728041: [
    { time: '2026-08-02 10时', type: '入库上架', bizNo: 'RK-20260802-018', flowTo: '—', stack: '→ 1#A1', wet: '+520', dry: '+468', balance: '468', operator: '仓管员' },
  ],
  BG20260801022: [
    { time: '2026-07-28 9时', type: '入库上架', bizNo: 'RK-20260728-011', flowTo: '—', stack: '→ 1#A2', wet: '+360', dry: '+330', balance: '330', operator: '仓管员' },
  ],
  BG20260715033: [
    { time: '2026-07-15 11时', type: '入库上架', bizNo: 'RK-20260715-009', flowTo: '—', stack: '→ 2#A1', wet: '+4375', dry: '+3938', balance: '3938', operator: '仓管员' },
  ],
  BG20260428016: [
    { time: '2026-04-28 8时', type: '入库上架', bizNo: 'RK-20260428-006', flowTo: '—', stack: '→ 5#小A', wet: '+280', dry: '+252', balance: '252', operator: '仓管员' },
  ],
  BG20260725088: [
    { time: '2026-07-25 8时', type: '入库上架', bizNo: 'RK-20260725-012', flowTo: '—', stack: '→ 码头#A1', wet: '+2100', dry: '+1920', balance: '1920', operator: '仓管员' },
  ],
  'FL-20260803': [
    { time: '2026-08-03 14时', type: '完工入库', bizNo: 'WG-20260803-01', flowTo: '—', stack: '→ 4#A1', wet: '—', dry: '+180', balance: '180', operator: '仓管员' },
  ],
  'FL-20260802': [
    { time: '2026-08-02 11时', type: '完工入库', bizNo: 'WG-20260802-01', flowTo: '—', stack: '→ 4#A2', wet: '—', dry: '+180', balance: '180', operator: '仓管员' },
  ],
  'FL-20260728': [
    { time: '2026-07-28 16时', type: '完工入库', bizNo: 'WG-20260728-01', flowTo: '—', stack: '→ 4#B1', wet: '—', dry: '+220', balance: '220', operator: '仓管员' },
  ],
  'FL-20260801': [
    { time: '2026-08-01 9时', type: '完工入库', bizNo: 'WG-20260801-01', flowTo: '—', stack: '→ 6#C2', wet: '—', dry: '+240', balance: '240', operator: '仓管员' },
    { time: '2026-08-01 15时', type: '出库', bizNo: 'CK-20260801-008', flowTo: '滨海贸易有限公司', stack: '6#C2 → —', wet: '—', dry: '-240', balance: '0', operator: '仓管员' },
  ],
};

function openLedger(key) {
  const resolved = key || lotDocsCurrentKey;
  const lot = resolved ? LOT_DOCS[resolved] : null;
  const titleEl = document.getElementById('ledgerTitle');
  const anno = document.getElementById('ledgerAnno');
  const stats = document.getElementById('ledgerStats');
  const body = document.getElementById('ledgerBody');
  const label = lot
    ? (lot.category === '成品' ? `生产批次 ${lot.prodBatch}` : `报关单号 ${lot.customs}`)
    : '本票';
  if (titleEl) titleEl.textContent = `重量台账 · ${label}`;
  if (anno) {
    anno.innerHTML = lot?.category === '成品'
      ? '<strong>成品台账</strong>出库流水记录<strong>流向企业</strong>；已出库后堆位为 —。'
      : '<strong>原料台账</strong>按报关单号记录入库、移库干湿重；出库时记录流向企业。';
  }
  const rows = (resolved && LOT_LEDGERS[resolved]) || (lot ? defaultLedgerForLot(resolved, lot) : []);
  if (stats && lot) {
    const last = rows[rows.length - 1];
    stats.innerHTML = `
      <div class="stat-card"><div class="label">物料</div><div class="value" style="font-size:14px">${lot.material}</div><div class="sub">${lot.consignorShort}</div></div>
      <div class="stat-card"><div class="label">当前堆位</div><div class="value" style="font-size:14px">${lot.stack}</div><div class="sub">${lot.outbound ? '已出库' : '在库'}</div></div>
      <div class="stat-card"><div class="label">结存干重</div><div class="value" style="font-size:14px">${last?.balance || lot.dry}</div><div class="sub">吨</div></div>
      <div class="stat-card ${lot.outbound ? 'ok' : ''}"><div class="label">流向企业</div><div class="value" style="font-size:14px">${lot.flowTo || '—'}</div><div class="sub">${lot.outbound ? '出库报关单已归档' : '未出库'}</div></div>`;
  } else if (stats) {
    stats.innerHTML = '';
  }
  if (body) body.innerHTML = rows.length ? rows.map(ledgerRowHtml).join('') : '<tr><td colspan="9">暂无台账流水</td></tr>';
  openModal('modalLedger');
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
  const bonded = document.getElementById('rcBonded')?.value;
  if (!bonded || !bondedAllowsInbound(bonded)) {
    toast('请匹配可入库的保税账册（只出不进的旧账不可再入库）', 'warn');
    return;
  }
  const deduct = cargoType === '报备矿' ? tryDeductFilingOnInbound(orderId, dry) : { ok: true, skipped: true };
  if (!deduct.ok) {
    toast(deduct.msg, 'warn');
    return;
  }
  const inbound = typeof INBOUND_LIST !== 'undefined' ? INBOUND_LIST.find((r) => r.id === orderId) : null;
  const harmful = collectHarmfulFrom('rcHarmfulFields');
  if (inbound) {
    inbound.status = '已入库';
    inbound.mineral = document.getElementById('rcMineral')?.value || inbound.mineral;
    inbound.shipMode = document.getElementById('rcShipMode')?.value || inbound.shipMode;
    inbound.containers = inbound.shipMode === '集装箱' ? (document.getElementById('rcContainers')?.value || '') : '';
    inbound.harmful = Object.keys(harmful).length ? harmful : inbound.harmful;
    inbound.wetDry = `${wet} / ${dry}`;
    renderInboundTable();
  }
  appendBondedLot({
    book: bonded,
    direction: '入库',
    orderNo: orderId,
    customs: inbound?.customs || '',
    consignor: document.getElementById('rcConsignor')?.value || '',
    consignorShort: inbound?.consignorShort || '',
    material: document.getElementById('rcMaterial')?.value || '',
    wet: Number(wet) || '',
    dry: Number(dry) || '',
    value: inbound?.amount || 0,
    stack: inbound?.stack || '—',
    at: wmsDemoToday(),
    status: '在库',
  });
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
        ['roles', 'accounts', 'params', 'floorplan'].forEach((k) => {
          const p = document.getElementById('tab-' + k);
          if (p) p.style.display = k === id ? '' : 'none';
        });
        document.querySelector('[data-page="settings"]')?.classList.toggle('settings-floorplan', id === 'floorplan');
        if (id === 'floorplan' && typeof openParkEditor === 'function') openParkEditor();
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

function pad2(n) {
  return String(n).padStart(2, '0');
}

function invHourKey(dateStr, hour) {
  if (!dateStr) return '';
  return `${dateStr}T${pad2(hour)}`;
}

function invMonthRangeKeys(now = new Date()) {
  const y = now.getFullYear();
  const m = now.getMonth();
  const last = new Date(y, m + 1, 0).getDate();
  const ym = `${y}-${pad2(m + 1)}`;
  return { from: `${ym}-01T00`, to: `${ym}-${pad2(last)}T23` };
}

function fillInvHourSelects() {
  const pairs = [
    ['invTimeFromHour', '8'],
    ['invTimeToHour', '16'],
  ];
  pairs.forEach(([id, def]) => {
    const el = document.getElementById(id);
    if (!el) return;
    if (!el.options.length) {
      for (let h = 0; h < 24; h++) {
        const o = document.createElement('option');
        o.value = String(h);
        o.textContent = `${h}时`;
        el.appendChild(o);
      }
      el.value = def;
    }
  });
}

function onInvTimeModeChange() {
  const mode = document.getElementById('invTimeMode')?.value || 'month';
  const custom = document.getElementById('invTimeCustom');
  if (custom) custom.hidden = mode !== 'custom';
}

function applyInventoryFilter() {
  const mode = document.getElementById('invTimeMode')?.value || 'month';
  let from = '';
  let to = '';
  if (mode === 'month') {
    ({ from, to } = invMonthRangeKeys());
  } else {
    const fromDate = document.getElementById('invTimeFromDate')?.value || '';
    const toDate = document.getElementById('invTimeToDate')?.value || '';
    const fromHour = document.getElementById('invTimeFromHour')?.value ?? '0';
    const toHour = document.getElementById('invTimeToHour')?.value ?? '23';
    if (!fromDate || !toDate) {
      toast('请选择起止日期', 'warn');
      return;
    }
    from = invHourKey(fromDate, fromHour);
    to = invHourKey(toDate, toHour);
    if (from > to) {
      toast('开始时间不能晚于结束时间', 'warn');
      return;
    }
  }
  let visible = 0;
  document.querySelectorAll('#invTableBody tr').forEach((row) => {
    const at = row.dataset.inAt || '';
    const show = (!from || at >= from) && (!to || at <= to);
    row.style.display = show ? '' : 'none';
    row.classList.remove('row-highlight');
    if (show) visible += 1;
  });
  toast(visible ? `已查询，共 ${visible} 条` : '该时间范围内暂无库存', visible ? 'ok' : 'warn');
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

function syncMatCargoByCategory() {
  const cat = document.getElementById('matCategory')?.value || '原料';
  const cargoSel = document.getElementById('matCargoType');
  if (!cargoSel) return;
  if (cat === '成品') {
    cargoSel.value = '混成品';
    cargoSel.disabled = true;
  } else {
    cargoSel.disabled = false;
    if (cargoSel.value === '混成品') cargoSel.value = '达标矿';
  }
  toggleFilingFields();
}

function resolveActiveFiling(source) {
  if (!source || source === '—') return null;
  return loadSourceFilings()
    .filter((f) => f.source === source && filingRemaining(f) > 0)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)))[0] || null;
}

function inboundMaterialLabel(m) {
  if (m.cargoType === '报备矿') return `${m.name}（报备矿·${m.source}）`;
  return `${m.name}（${m.cargoType}）`;
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
const MATERIALS_STORAGE_KEY = 'wms_materials_v3';
const MAT_ATTACHMENTS_STORAGE_KEY = 'wms_filing_attachments';
const MAT_ATTACH_MAX_BYTES = 4 * 1024 * 1024;

const matAttachState = { code: null, viewRecord: null };

const DEFAULT_MAT_ATTACHMENTS = {
  'JG-2023-KY04': [
    {
      id: 'demo-filing-spec',
      name: '智利精矿备案说明.txt',
      mime: 'text/plain',
      dataUrl: `data:text/plain;charset=utf-8,${encodeURIComponent('矿源备案 JG-2023-KY04\n矿源：智利精矿\n备案数量 30000 DMT')}`,
      uploadedAt: '2026-08-01T08:00:00.000Z',
      size: 80,
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
  },
  {
    code: 'YL-CU-002',
    name: '原料物料-B',
    cargoType: '报备矿',
    cargoTypeCls: 'tag-orange',
    category: '原料',
    categoryCls: 'tag-blue',
    source: '智利精矿',
  },
  {
    code: 'YL-CU-003',
    name: '原料物料-C',
    cargoType: '报备矿',
    cargoTypeCls: 'tag-orange',
    category: '原料',
    categoryCls: 'tag-blue',
    source: '澳洲精矿',
  },
  {
    code: 'CP-CU-01',
    name: '成品物料-A',
    cargoType: '混成品',
    cargoTypeCls: 'tag-green',
    category: '成品',
    categoryCls: 'tag-green',
    source: '—',
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
      <td class="ops">
        <button type="button" class="btn-text" onclick="openMaterialModal('${m.code}')">编辑</button>
      </td>
    </tr>`;
  }).join('');
  const countEl = document.getElementById('materialTableCount');
  if (countEl) countEl.textContent = `共 ${materials.length} 条物料档案`;
}

function xmlEscape(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function monthEndDate(ym) {
  const [y, m] = String(ym || '').split('-').map(Number);
  if (!y || !m) return '';
  const last = new Date(y, m, 0).getDate();
  return `${y}-${String(m).padStart(2, '0')}-${String(last).padStart(2, '0')}`;
}

const STOCKTAKE_ONHAND = [
  { inAt: '2026-08-02', outAt: '', consignor: '广西金川有色金属有限公司', cargoType: '达标矿', stack: '1#A1', bl: 'BL20260728005', customs: 'BG20260728041', wet: '520', dry: '468' },
  { inAt: '2026-07-28', outAt: '', consignor: '广西金川有色金属有限公司', cargoType: '报备矿', stack: '1#A2', bl: 'BL20260728011', customs: 'BG20260801022', wet: '360', dry: '330' },
  { inAt: '2026-07-15', outAt: '', consignor: '广西金川有色金属有限公司', cargoType: '报备矿', stack: '2#A1', bl: 'SANDIA052601', customs: 'BG20260715033', wet: '4375', dry: '3938' },
  { inAt: '2026-04-28', outAt: '', consignor: '五矿有色金属股份有限公司', cargoType: '报备矿', stack: '5#小A', bl: 'BL20260428004', customs: 'BG20260428016', wet: '280', dry: '252' },
  { inAt: '2026-08-03', outAt: '', consignor: '广西金川有色金属有限公司', cargoType: '混成品', stack: '4#A1', bl: '—', customs: '—', wet: '—', dry: '180' },
  { inAt: '2026-08-02', outAt: '', consignor: '广西金川有色金属有限公司', cargoType: '混成品', stack: '4#A2', bl: '—', customs: '—', wet: '—', dry: '180' },
  { inAt: '2026-07-28', outAt: '', consignor: '广西金川有色金属有限公司', cargoType: '混成品', stack: '4#B1', bl: '—', customs: '—', wet: '—', dry: '220' },
  { inAt: '2026-07-25', outAt: '', consignor: '五矿有色金属股份有限公司', cargoType: '报备矿', stack: '码头#A1', bl: 'BL20260720008', customs: 'BG20260725088', wet: '2100', dry: '1920' },
];

function stocktakeOnhandForMonth(ym) {
  const end = monthEndDate(ym);
  if (!end) return [];
  return STOCKTAKE_ONHAND.filter((r) => r.inAt <= end && (!r.outAt || r.outAt > end));
}

function exportStocktakeMonthOnhand() {
  const ym = document.getElementById('stocktakeExportMonth')?.value || '';
  if (!ym) {
    toast('请选择导出月份', 'warn');
    return;
  }
  const rows = stocktakeOnhandForMonth(ym);
  if (!rows.length) {
    toast(`${ym} 月末无在库记录`, 'warn');
    return;
  }
  const sorted = [...rows].sort((a, b) => a.consignor.localeCompare(b.consignor, 'zh-CN') || a.customs.localeCompare(b.customs));
  downloadExcel(
    `盘点月度在库_${ym}.xls`,
    '月度在库',
    ['月份', '委托方', '货物类型', '堆位', '提单号', '报关单号', '在库湿重(吨)', '在库干重(吨)'],
    sorted.map((r) => [ym, r.consignor, r.cargoType, r.stack, r.bl, r.customs, r.wet, r.dry]),
  );
  toast(`已导出 ${ym} 月末在库 ${sorted.length} 条`, 'ok');
}

function downloadExcel(filename, sheetName, headers, rows) {
  const cell = (text) => `<Cell><Data ss:Type="String">${xmlEscape(text)}</Data></Cell>`;
  const xmlRows = [
    `<Row>${headers.map(cell).join('')}</Row>`,
    ...rows.map((r) => `<Row>${r.map(cell).join('')}</Row>`),
  ].join('');
  const safeSheet = String(sheetName || 'Sheet1').slice(0, 31);
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
  <Worksheet ss:Name="${xmlEscape(safeSheet)}">
    <Table>${xmlRows}</Table>
  </Worksheet>
</Workbook>`;
  const blob = new Blob([`\uFEFF${xml}`], { type: 'application/vnd.ms-excel;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

function exportMaterialsExcel() {
  const materials = loadMaterials();
  if (!materials.length) {
    toast('暂无物料档案可导出', 'warn');
    return;
  }
  downloadExcel(
    `物料档案_${new Date().toISOString().slice(0, 10)}.xls`,
    '物料档案',
    ['物料编码', '名称', '货物类型', '类型', '矿源'],
    materials.map((m) => [m.code, m.name, m.cargoType, m.category, m.source || '—']),
  );
  toast(`已导出 ${materials.length} 条物料档案`, 'ok');
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
  const cargoSel = document.getElementById('matCargoType');
  if (cargoSel) cargoSel.value = m?.cargoType || (m?.category === '成品' ? '混成品' : '达标矿');
  const catSel = document.getElementById('matCategory');
  if (catSel) catSel.value = m?.category || '原料';
  const srcSel = document.getElementById('matSource');
  if (srcSel && m?.source && m.source !== '—') srcSel.value = m.source;
  syncMatCargoByCategory();
  openModal('modalMaterial');
}

function saveMaterial() {
  const code = document.getElementById('matCode')?.value?.trim();
  const name = document.getElementById('matName')?.value?.trim();
  if (!code || !name) {
    toast('请填写物料编码与名称', 'warn');
    return;
  }
  const category = document.getElementById('matCategory')?.value || '原料';
  const cargoType = category === '成品'
    ? '混成品'
    : (document.getElementById('matCargoType')?.value || '达标矿');
  if (category === '原料' && cargoType === '混成品') {
    toast('原料货物类型请选择达标矿或报备矿', 'warn');
    return;
  }
  if (category === '成品' && cargoType !== '混成品') {
    toast('成品货物类型须为混成品', 'warn');
    return;
  }
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
    cargoTypeCls: cargoTypeClass(cargoType),
    category,
    categoryCls: category === '成品' ? 'tag-green' : 'tag-blue',
    source,
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
  return document.getElementById('sfCode')?.value?.trim() || matAttachState.code || '';
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
  const f = getSourceFiling(code);
  matAttachState.code = code;
  const title = document.getElementById('matAttachModalTitle');
  if (title) title.textContent = `备案附件 · ${f?.source || ''} ${code}`;
  renderMatAttachmentLists(code);
  openModal('modalMatAttachments');
}

function onMatAttachmentUpload(input) {
  const files = input?.files;
  if (!files?.length) return;
  const code = getMatEditingCode();
  if (!code) {
    toast('请先填写矿源备案编号后再上传附件', 'warn');
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
    renderSourceFilingTable();
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
  renderSourceFilingTable();
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
  renderAccountTable();
  renderReceiveQualityFields({});
  renderOcrQualityFields({});
  renderHarmfulFields('ibHarmfulFields', 'ib', {});
  renderHarmfulFields('rcHarmfulFields', 'rc', {});
  renderSourceFilingTable();
  renderMaterialTable();
  renderInboundTable();
  renderTransferTable();
  renderAllAlerts();
  if (typeof initParkEditor === 'function') initParkEditor();
  if (typeof ensureParkPlanLoaded === 'function') ensureParkPlanLoaded();
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
  seedFlowPartnersFromOutbound();
  renderPartnerTable();
  migrateOverdueBondedLots();
  fillBondedSelects();
  renderBondedTable();
  if (!sessionStorage.getItem('wms_wh')) sessionStorage.setItem('wms_wh', defaultWarehouseFilter());
  toggleFilingFields();
  populateInboundMaterials();
  fillInvHourSelects();
  onInvTimeModeChange();
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

const PARTNERS_KEY = 'wms_partners_v1';
const DEFAULT_PARTNERS = [
  { code: 'WT-001', name: '五矿有色金属股份有限公司', role: '委托方', phone: '', status: '启用', source: 'manual' },
  { code: 'WT-002', name: '广西金川有色金属有限公司', role: '委托方', phone: '', status: '启用', source: 'manual' },
  { code: 'WT-003', name: '广西南国铜业有限责任公司', role: '委托方', phone: '', status: '启用', source: 'manual' },
  { code: 'HZ-001', name: '广西丰联铜业有限公司', role: '物流账册主体', phone: '', status: '启用', source: 'manual' },
];

function loadPartners() {
  try {
    const raw = localStorage.getItem(PARTNERS_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (Array.isArray(parsed) && parsed.length) {
      return parsed.map(({ credit, ...p }) => p);
    }
  } catch { /* empty */ }
  return DEFAULT_PARTNERS.map((p) => ({ ...p }));
}

function persistPartners(list) {
  localStorage.setItem(PARTNERS_KEY, JSON.stringify(list));
}

function partnerRoleTag(role) {
  if (role === '委托方') return '<span class="tag tag-purple">委托方</span>';
  if (role === '物流账册主体') return '<span class="tag tag-blue">物流账册主体</span>';
  return '<span class="tag tag-green">流向企业</span>';
}

function partnerSourceLabel(source) {
  return source === 'outbound' ? '出库自动录入' : '手工维护';
}

function nextFlowPartnerCode(list) {
  const nums = list
    .filter((p) => p.role === '流向企业')
    .map((p) => Number(String(p.code).replace(/\D/g, '')) || 0);
  const n = (nums.length ? Math.max(...nums) : 0) + 1;
  return `LX-${String(n).padStart(3, '0')}`;
}

function upsertFlowPartner(name) {
  const n = String(name || '').trim();
  if (!n) return null;
  const list = loadPartners();
  const found = list.find((p) => p.role === '流向企业' && p.name === n);
  if (found) {
    if (found.status === '停用') {
      found.status = '启用';
      persistPartners(list);
      renderPartnerTable();
    }
    return found;
  }
  list.push({
    code: nextFlowPartnerCode(list),
    name: n,
    role: '流向企业',
    phone: '',
    status: '启用',
    source: 'outbound',
  });
  persistPartners(list);
  renderPartnerTable();
  toast(`流向企业「${n}」已根据出库字段自动写入往来主体`, 'ok');
  return list[list.length - 1];
}

function seedFlowPartnersFromOutbound() {
  document.querySelectorAll('[data-page="outbound"] tbody tr').forEach((tr) => {
    const name = tr.children[2]?.textContent?.trim();
    if (!name) return;
    const list = loadPartners();
    if (list.some((p) => p.role === '流向企业' && p.name === name)) return;
    list.push({
      code: nextFlowPartnerCode(list),
      name,
      role: '流向企业',
      phone: '',
      status: '启用',
      source: 'outbound',
    });
    persistPartners(list);
  });
}

function renderPartnerTable() {
  const tbody = document.getElementById('partnerTableBody');
  if (!tbody) return;
  const role = document.getElementById('partnerRoleFilter')?.value || '';
  const kw = (document.getElementById('partnerKeyword')?.value || '').trim().toLowerCase();
  const rows = loadPartners().filter((p) => {
    if (role && p.role !== role) return false;
    if (kw && !(`${p.code}${p.name}`).toLowerCase().includes(kw)) return false;
    return true;
  });
  tbody.innerHTML = rows.map((p) => `
    <tr>
      <td>${p.code}</td>
      <td>${p.name}</td>
      <td>${partnerRoleTag(p.role)}</td>
      <td>${partnerSourceLabel(p.source)}</td>
      <td>${p.status === '停用' ? '<span class="tag tag-gray">停用</span>' : '<span class="tag tag-green">启用</span>'}</td>
      <td class="ops"><button type="button" class="btn-text" onclick="openPartnerModal('${p.code}')">编辑</button></td>
    </tr>
  `).join('');
  const count = document.getElementById('partnerTableCount');
  if (count) count.textContent = `共 ${rows.length} 条`;
}

function openPartnerModal(code) {
  const list = loadPartners();
  const p = code ? list.find((x) => x.code === code) : null;
  const set = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.value = val ?? '';
  };
  set('ptEditCode', p?.code || '');
  set('ptName', p?.name || '');
  const roleSel = document.getElementById('ptRole');
  if (roleSel) {
    Array.from(roleSel.options).forEach((o) => {
      if (o.textContent === '流向企业' && p?.role !== '流向企业') o.remove();
    });
    if (p?.role === '流向企业' && !Array.from(roleSel.options).some((o) => o.textContent === '流向企业')) {
      roleSel.insertAdjacentHTML('beforeend', '<option>流向企业</option>');
    }
    roleSel.value = p?.role || '委托方';
    roleSel.disabled = !!p && p.role === '流向企业';
  }
  set('ptPhone', p?.phone || '');
  set('ptStatus', p?.status || '启用');
  set('ptSource', p ? partnerSourceLabel(p.source) : '手工维护');
  const anno = document.getElementById('partnerAnno');
  if (anno) {
    anno.innerHTML = p?.role === '流向企业'
      ? '<strong>流向企业</strong>由出库报关单「流向企业」字段自动识别录入，可补全联系电话等信息。'
      : '委托方与物流账册主体可手工维护；流向企业由出库报关单字段自动识别录入。';
  }
  openModal('modalPartner');
}

function savePartner() {
  const name = document.getElementById('ptName')?.value?.trim();
  if (!name) {
    toast('请填写企业名称', 'warn');
    return;
  }
  const editCode = document.getElementById('ptEditCode')?.value || '';
  const list = loadPartners();
  const idx = list.findIndex((p) => p.code === editCode);
  const existing = idx >= 0 ? list[idx] : null;
  const role = existing?.role === '流向企业'
    ? '流向企业'
    : (document.getElementById('ptRole')?.value || '委托方');
  const record = {
    code: existing?.code || (role === '物流账册主体' ? `HZ-${String(list.filter((p) => p.role === '物流账册主体').length + 1).padStart(3, '0')}` : `WT-${String(list.filter((p) => p.role === '委托方').length + 1).padStart(3, '0')}`),
    name,
    role,
    phone: document.getElementById('ptPhone')?.value?.trim() || '',
    status: document.getElementById('ptStatus')?.value || '启用',
    source: existing?.source || 'manual',
  };
  if (idx >= 0) list[idx] = { ...existing, ...record };
  else list.push(record);
  persistPartners(list);
  renderPartnerTable();
  closeModal('modalPartner');
  toast('往来主体已保存', 'ok');
}

const BONDED_BOOKS_KEY = 'wms_bonded_books_v1';
const BONDED_LOTS_KEY = 'wms_bonded_lots_v1';

const DEFAULT_BONDED_BOOKS = [
  {
    code: 'T3700XXXX001', name: '保税物流账册A', owner: '广西丰联铜业', status: '有效',
    value: 850000, customsNos: 'BGCK2026080102', predecessor: '', successor: 'T3700XXXX002',
    oldAlertDate: '2026-08-01', inboundClosed: true,
  },
  {
    code: 'T3700XXXX002', name: '保税物流账册B', owner: '广西丰联铜业', status: '有效',
    value: 12800000, customsNos: '', predecessor: 'T3700XXXX001', successor: '',
    oldAlertDate: '2026-08-01', inboundClosed: false,
  },
];

const DEFAULT_BONDED_LOTS = [
  { book: 'T3700XXXX001', direction: '入库', orderNo: 'RK-20260601-008', customs: 'BG20260601011', consignor: '广西南国铜业有限责任公司', consignorShort: '南国铜业', material: '成品物料-A', wet: 82, dry: 75, value: 850000, stack: '6#C1', at: '2026-06-01 9时', status: '已出库' },
  { book: 'T3700XXXX001', direction: '出库', orderNo: 'CK-20260801-008', customs: 'BGCK2026080102', consignor: '广西南国铜业有限责任公司', consignorShort: '南国铜业', material: '成品物料-A', wet: 82, dry: 75, value: 850000, stack: '—', at: '2026-08-01 15时', status: '已出库' },
  { book: 'T3700XXXX001', direction: '出库', orderNo: 'CK-20260803-012', customs: 'BGCK2026080301', consignor: '广西南国铜业有限责任公司', consignorShort: '南国铜业', material: '成品物料-A', wet: 110, dry: 100, value: 218000, stack: '—', at: '2026-08-03 10时', status: '待出库' },
  { book: 'T3700XXXX002', direction: '入库', orderNo: 'RK-20260802-018', customs: 'BG20260728041', consignor: '广西金川有色金属有限公司', consignorShort: '广西金川', material: '原料物料-A', wet: 520, dry: 468, value: 2100000, stack: '1#A1', at: '2026-08-02 10时', status: '在库', transferredFrom: 'T3700XXXX001' },
  { book: 'T3700XXXX002', direction: '入库', orderNo: 'RK-20260728-009', customs: 'BG20260801022', consignor: '广西金川有色金属有限公司', consignorShort: '广西金川', material: '原料物料-B', wet: 360, dry: 330, value: 980000, stack: '1#A2', at: '2026-07-28 9时', status: '在库', transferredFrom: 'T3700XXXX001' },
  { book: 'T3700XXXX002', direction: '入库', orderNo: 'RK-20260715-033', customs: 'BG20260715033', consignor: '广西金川有色金属有限公司', consignorShort: '广西金川', material: '原料物料-A', wet: 4375, dry: 3938, value: 6200000, stack: '2#A1', at: '2026-07-15 11时', status: '在库', transferredFrom: 'T3700XXXX001' },
  { book: 'T3700XXXX002', direction: '入库', orderNo: 'RK-20260428-016', customs: 'BG20260428016', consignor: '五矿有色金属股份有限公司', consignorShort: '五矿有色', material: '原料物料-C', wet: 280, dry: 252, value: 540000, stack: '5#小A', at: '2026-04-28 8时', status: '在库', transferredFrom: 'T3700XXXX001' },
  { book: 'T3700XXXX002', direction: '入库', orderNo: 'RK-20260725-088', customs: 'BG20260725088', consignor: '五矿有色金属股份有限公司', consignorShort: '五矿有色', material: '原料物料-D', wet: 2100, dry: 1920, value: 1800000, stack: '码头#A1', at: '2026-07-25 8时', status: '在库', transferredFrom: 'T3700XXXX001' },
  { book: 'T3700XXXX002', direction: '入库', orderNo: 'PR-20260803', customs: 'FL-20260803', consignor: '广西金川有色金属有限公司', consignorShort: '广西金川', material: '成品物料-A', wet: 0, dry: 180, value: 420000, stack: '4#A1', at: '2026-08-03 14时', status: '在库', transferredFrom: 'T3700XXXX001' },
  { book: 'T3700XXXX002', direction: '入库', orderNo: 'PR-20260802', customs: 'FL-20260802', consignor: '广西金川有色金属有限公司', consignorShort: '广西金川', material: '成品物料-A', wet: 0, dry: 180, value: 410000, stack: '4#A2', at: '2026-08-02 11时', status: '在库' },
  { book: 'T3700XXXX002', direction: '出库', orderNo: 'CK-20260804-003', customs: 'BGCK2026080401', consignor: '广西南国铜业有限责任公司', consignorShort: '南国铜业', material: '成品物料-A', wet: 88, dry: 80, value: 96000, stack: '—', at: '—', status: '待出库' },
];

let bondedLotsViewCode = '';

function normalizeBondedBook(b) {
  return {
    code: b.code,
    name: b.name || '',
    owner: b.owner || '',
    status: b.status || '有效',
    value: Number(b.value) || 0,
    customsNos: b.customsNos || '',
    predecessor: b.predecessor || '',
    successor: b.successor || '',
    oldAlertDate: b.oldAlertDate || '',
    inboundClosed: !!b.inboundClosed,
  };
}

function loadBondedBooks() {
  try {
    const raw = localStorage.getItem(BONDED_BOOKS_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (Array.isArray(parsed) && parsed.length) return parsed.map(normalizeBondedBook);
  } catch { /* empty */ }
  return DEFAULT_BONDED_BOOKS.map((b) => ({ ...b }));
}

function persistBondedBooks(list) {
  localStorage.setItem(BONDED_BOOKS_KEY, JSON.stringify(list));
}

function loadBondedLots() {
  try {
    const raw = localStorage.getItem(BONDED_LOTS_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (Array.isArray(parsed) && parsed.length) return parsed;
  } catch { /* empty */ }
  return DEFAULT_BONDED_LOTS.map((l) => ({ ...l }));
}

function persistBondedLots(list) {
  localStorage.setItem(BONDED_LOTS_KEY, JSON.stringify(list));
}

function wmsDemoToday() {
  return typeof DEMO_TODAY === 'string' ? DEMO_TODAY : '2026-08-03';
}

function bondedAllowsInbound(code) {
  const b = loadBondedBooks().find((x) => x.code === code);
  if (!b) return false;
  if (b.status === '冻结' || b.status === '注销') return false;
  return !b.inboundClosed;
}

function bondedCustomsOf(book) {
  const fromField = String(book.customsNos || '').split(/[,，\s]+/).map((s) => s.trim()).filter(Boolean);
  const fromLots = loadBondedLots().filter((l) => l.book === book.code && l.customs).map((l) => l.customs);
  return [...new Set([...fromField, ...fromLots])];
}

function formatBondedValue(n) {
  const v = Number(n) || 0;
  return v ? `¥ ${v.toLocaleString('zh-CN')}` : '—';
}

function bondedStatusTag(b) {
  if (b.status === '注销') return '<span class="tag tag-gray">注销</span>';
  if (b.status === '冻结') return '<span class="tag tag-orange">冻结</span>';
  if (b.inboundClosed) return '<span class="tag tag-orange">只出不进</span>';
  return '<span class="tag tag-green">有效</span>';
}

function bondedLinkLabel(b) {
  if (b.successor) return `新账 ${b.successor}`;
  if (b.predecessor) return `旧账 ${b.predecessor}`;
  return '—';
}

function fillBondedSelects() {
  const books = loadBondedBooks();
  const inbound = books.filter((b) => bondedAllowsInbound(b.code));
  const active = books.filter((b) => b.status !== '注销');
  const fill = (id, list, extra) => {
    const el = document.getElementById(id);
    if (!el) return;
    const cur = el.value;
    const opts = extra ? extra.slice() : [];
    list.forEach((b) => opts.push(`<option value="${b.code}">${b.code} ${b.name}</option>`));
    el.innerHTML = opts.join('') || '<option value="">暂无可用账册</option>';
    if (cur && Array.from(el.options).some((o) => o.value === cur)) el.value = cur;
  };
  fill('ibBonded', inbound);
  fill('rcBonded', inbound);
  fill('obBonded', active);
  fill('matBonded', active);
  fill('invBondedFilter', active, ['<option value="">全部</option>']);
}

function lotsOfBonded(code) {
  return loadBondedLots().filter((l) => l.book === code);
}

function appendBondedLot(lot) {
  const list = loadBondedLots();
  const dup = list.find((x) => x.book === lot.book && x.direction === lot.direction && x.orderNo === lot.orderNo);
  if (dup) Object.assign(dup, lot);
  else list.push(lot);
  persistBondedLots(list);
}

function migrateOverdueBondedLots() {
  const today = wmsDemoToday();
  const books = loadBondedBooks();
  const lots = loadBondedLots();
  let moved = 0;
  books.forEach((old) => {
    if (!old.inboundClosed || !old.successor || !old.oldAlertDate) return;
    if (old.oldAlertDate > today) return;
    lots.forEach((lot) => {
      if (lot.book !== old.code || lot.direction !== '入库' || lot.status !== '在库') return;
      lot.book = old.successor;
      lot.transferredFrom = old.code;
      lot.transferredAt = today;
      moved += 1;
    });
  });
  if (moved) {
    persistBondedLots(lots);
    toast(`已将 ${moved} 票未出库入库数据转入新账册`, 'ok');
  }
}

function renderBondedTable() {
  const tbody = document.getElementById('bondedTableBody');
  if (!tbody) return;
  const kw = (document.getElementById('bondedKeyword')?.value || '').trim().toLowerCase();
  const rows = loadBondedBooks().filter((b) => {
    if (!kw) return true;
    const customs = bondedCustomsOf(b).join(' ');
    return `${b.code}${b.name}${b.owner}${customs}`.toLowerCase().includes(kw);
  });
  tbody.innerHTML = rows.map((b) => {
    const nos = bondedCustomsOf(b);
    const nosText = !nos.length ? '—' : (nos.length <= 2 ? nos.join('、') : `${nos.slice(0, 2).join('、')} 等${nos.length}票`);
    return `
    <tr>
      <td><button type="button" class="btn-text" onclick="openBondedLotsModal('${b.code}')" title="查看该账册票矿">${b.code}</button></td>
      <td>${b.name}</td>
      <td>${b.owner || '—'}</td>
      <td>${formatBondedValue(b.value)}</td>
      <td title="${nos.join('、')}">${nosText}</td>
      <td>${bondedStatusTag(b)}</td>
      <td>${bondedLinkLabel(b)}</td>
      <td>${b.oldAlertDate || '—'}</td>
      <td class="ops">
        <button type="button" class="btn-text" onclick="openBondedModal('${b.code}')">编辑</button>
        <button type="button" class="btn-text" onclick="openBondedLotsModal('${b.code}')">票矿</button>
      </td>
    </tr>`;
  }).join('') || '<tr><td colspan="9" style="color:var(--text-2)">暂无账册</td></tr>';
  const count = document.getElementById('bondedTableCount');
  if (count) count.textContent = `共 ${rows.length} 条`;
}

function fillBondedPredecessorSelect(currentCode, selected) {
  const sel = document.getElementById('bdPredecessor');
  if (!sel) return;
  const books = loadBondedBooks().filter((b) => b.code !== currentCode && b.status !== '注销');
  sel.innerHTML = '<option value="">无（首本账册）</option>' + books.map((b) => `<option value="${b.code}">${b.code} ${b.name}</option>`).join('');
  sel.value = selected || '';
}

function onBondedPredChange() {
  const has = !!document.getElementById('bdPredecessor')?.value;
  const req = document.getElementById('bdAlertReq');
  if (req) req.hidden = !has;
}

function openBondedModal(code) {
  const list = loadBondedBooks();
  const b = code ? list.find((x) => x.code === code) : null;
  const set = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.value = val ?? '';
  };
  set('bdEditCode', b?.code || '');
  set('bdCode', b?.code || '');
  set('bdName', b?.name || '');
  set('bdOwner', b?.owner || '广西丰联铜业');
  set('bdValue', b?.value ? String(b.value) : '');
  set('bdCustoms', b?.customsNos || '');
  set('bdStatus', b?.status || '有效');
  fillBondedPredecessorSelect(b?.code || '', b?.predecessor || '');
  const predSel = document.getElementById('bdPredecessor');
  if (predSel) predSel.disabled = !!(b && (b.predecessor || b.successor));
  const codeEl = document.getElementById('bdCode');
  if (codeEl) codeEl.readOnly = !!b;
  set('bdOldAlertDate', b?.oldAlertDate || '');
  onBondedPredChange();
  const anno = document.getElementById('bondedAnno');
  if (anno) {
    if (b?.inboundClosed) anno.innerHTML = '<strong>只出不进</strong>本账册已衔接新账，仅作出库核销，不可再匹配入库。';
    else if (b?.predecessor) anno.innerHTML = `本账册衔接旧账 <strong>${b.predecessor}</strong>；旧账预警日 <strong>${b.oldAlertDate || '—'}</strong> 后未出库入库票转入本账。`;
    else anno.innerHTML = '新建账册若衔接旧账册，须填写<strong>旧账册预警日期</strong>；保存后旧账只出不进，到期未出库票的入库数据转入新账。';
  }
  openModal('modalBonded');
}

function saveBonded() {
  const code = document.getElementById('bdCode')?.value?.trim();
  const name = document.getElementById('bdName')?.value?.trim();
  if (!code || !name) {
    toast('请填写账册编号与名称', 'warn');
    return;
  }
  const editCode = document.getElementById('bdEditCode')?.value || '';
  const list = loadBondedBooks();
  if (!editCode && list.some((b) => b.code === code)) {
    toast('账册编号已存在', 'warn');
    return;
  }
  const predecessor = document.getElementById('bdPredecessor')?.value || '';
  const oldAlertDate = document.getElementById('bdOldAlertDate')?.value || '';
  if (predecessor && !oldAlertDate) {
    toast('衔接旧账册时须填写旧账册预警日期', 'warn');
    return;
  }
  const existing = editCode ? list.find((b) => b.code === editCode) : null;
  const record = {
    code: existing?.code || code,
    name,
    owner: document.getElementById('bdOwner')?.value?.trim() || '',
    status: document.getElementById('bdStatus')?.value || '有效',
    value: Number(document.getElementById('bdValue')?.value) || 0,
    customsNos: document.getElementById('bdCustoms')?.value?.trim() || '',
    predecessor: existing?.predecessor || predecessor,
    successor: existing?.successor || '',
    oldAlertDate: oldAlertDate || existing?.oldAlertDate || '',
    inboundClosed: existing?.inboundClosed || false,
  };
  if (predecessor && !existing) {
    const old = list.find((b) => b.code === predecessor);
    if (old) {
      old.inboundClosed = true;
      old.successor = record.code;
      old.oldAlertDate = oldAlertDate;
    }
  }
  if (existing?.predecessor && oldAlertDate) {
    const old = list.find((b) => b.code === existing.predecessor);
    if (old) old.oldAlertDate = oldAlertDate;
  }
  const idx = list.findIndex((b) => b.code === record.code);
  if (idx >= 0) list[idx] = { ...list[idx], ...record };
  else list.push(record);
  persistBondedBooks(list);
  closeModal('modalBonded');
  if (predecessor && !existing) toast(`新账册已备案，旧账 ${predecessor} 改为只出不进`, 'ok');
  else toast('保税账册已保存', 'ok');
  migrateOverdueBondedLots();
  fillBondedSelects();
  renderBondedTable();
  renderAllAlerts();
}

function bondedLotStatusTag(status) {
  if (status === '在库') return '<span class="tag tag-green">在库</span>';
  if (status === '已出库') return '<span class="tag tag-gray">已出库</span>';
  if (status === '待出库' || status === '待收货') return '<span class="tag tag-orange">' + status + '</span>';
  return `<span class="tag tag-blue">${status || '—'}</span>`;
}

function openBondedLotsModal(code) {
  bondedLotsViewCode = code;
  const b = loadBondedBooks().find((x) => x.code === code);
  const lots = lotsOfBonded(code);
  const title = document.getElementById('bondedLotsTitle');
  if (title) title.textContent = `账册票矿 · ${code}`;
  const anno = document.getElementById('bondedLotsAnno');
  if (anno) {
    const extra = b?.inboundClosed ? ' · 只出不进' : '';
    const warn = b?.oldAlertDate ? ` · 旧账预警 ${b.oldAlertDate}` : '';
    anno.innerHTML = `<strong>${code}</strong>${b ? ` ${b.name}` : ''} 下共 <strong>${lots.length}</strong> 条出入库票矿${extra}${warn}。`;
  }
  const tbody = document.getElementById('bondedLotsBody');
  if (tbody) {
    tbody.innerHTML = lots.length
      ? lots.map((lot) => `
        <tr>
          <td>${lot.direction === '出库' ? '<span class="tag tag-orange">出库</span>' : '<span class="tag tag-blue">入库</span>'}${lot.transferredFrom ? `<br><small>自 ${lot.transferredFrom}</small>` : ''}</td>
          <td>${lot.orderNo || '—'}</td>
          <td>${lot.customs || '—'}</td>
          <td><span class="tag tag-purple" title="${lot.consignor || ''}">${lot.consignorShort || lot.consignor || '—'}</span></td>
          <td>${lot.material || '—'}</td>
          <td>${lot.wet ? Number(lot.wet).toLocaleString('zh-CN') : '—'}</td>
          <td>${lot.dry ? Number(lot.dry).toLocaleString('zh-CN') : '—'}</td>
          <td>${formatBondedValue(lot.value)}</td>
          <td>${lot.stack || '—'}</td>
          <td>${lot.at || '—'}</td>
          <td>${bondedLotStatusTag(lot.status)}</td>
        </tr>`).join('')
      : '<tr><td colspan="11" style="color:var(--text-2)">该账册下暂无票矿</td></tr>';
  }
  openModal('modalBondedLots');
}

function exportBondedLotsExcel() {
  const code = bondedLotsViewCode;
  const lots = lotsOfBonded(code);
  if (!code) {
    toast('请先打开一条保税账册', 'warn');
    return;
  }
  if (!lots.length) {
    toast('该账册下暂无票矿可导出', 'warn');
    return;
  }
  downloadExcel(
    `保税账册票矿_${code}.xls`,
    '账册票矿',
    ['账册编号', '方向', '单号', '报关单号', '委托方', '物料', '湿重', '干重', '货值', '堆位', '时间', '状态', '转入自'],
    lots.map((lot) => [
      code, lot.direction, lot.orderNo, lot.customs, lot.consignor, lot.material,
      lot.wet, lot.dry, lot.value, lot.stack, lot.at, lot.status, lot.transferredFrom || '',
    ]),
  );
  toast(`已导出 ${lots.length} 条票矿`, 'ok');
}

function buildBondedAlerts() {
  const today = wmsDemoToday();
  const out = [];
  loadBondedBooks().forEach((b) => {
    if (!b.inboundClosed || !b.successor || !b.oldAlertDate) return;
    const pending = loadBondedLots().filter((l) => l.book === b.code && l.direction === '入库' && l.status === '在库');
    if (b.oldAlertDate > today) {
      out.push({
        lvl: 'mid',
        type: '保税账册',
        target: b.code,
        title: '旧账册只出不进',
        desc: `${b.code} 已衔接 ${b.successor}，预警日 ${b.oldAlertDate} 后未出库票将转入新账`,
        time: '08:00',
        page: 'bonded',
        action: '查看账册',
        actionFn: 'go(\'bonded\')',
      });
    } else if (pending.length) {
      out.push({
        lvl: 'high',
        type: '保税账册',
        target: b.code,
        title: '旧账未出库票待转入',
        desc: `${b.code} 已过预警日，仍有 ${pending.length} 票在库入库数据待转入 ${b.successor}`,
        time: '08:00',
        page: 'bonded',
        action: '查看账册',
        actionFn: 'go(\'bonded\')',
      });
    }
  });
  return out;
}

const WAREHOUSE_DEFS = [
  { no: 1, cap: 30000, floorArea: 2400, slots: ['A1', 'A2', 'B1', 'B2'] },
  { no: 2, cap: 25000, floorArea: 2200, slots: ['A1', 'A2', 'B1', 'B2'] },
  { no: 4, cap: 75000, floorArea: 5100, slots: ['A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'D1', 'D2'], slotCaps: {
    A1: 12000, A2: 8000, B1: 15000, B2: 5500, C1: 10000, C2: 4500, D1: 11000, D2: 9000,
  } },
  { no: 5, cap: 80000, floorArea: 4800, slots: ['小A', '大A前', '大A后', '小B', '大B前', '大B后', '小C', '大C前', '大C后', '小D', '大D前', '大D后'] },
  { no: 6, cap: 60000, floorArea: 4600, slots: ['A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'D1', 'D2'] },
  { no: '码头', id: 'whDock', name: '码头仓库', kind: 'dock', cap: 8000, floorArea: 1600, slots: ['A1', 'A2'] },
];

const STACK_DEMO = {
  '1#A1': { area: '原料区域', mat: '原料物料-A', used: 94, batch: 'BG20260728041', batchType: '报关单号', inspect: '—' },
  '1#A2': { area: '原料区域', mat: '原料物料-B', used: 66, batch: 'BG20260801022', batchType: '报关单号', inspect: '—' },
  '1#B1': { area: '原料区域', mat: '原料物料-A', used: 22, batch: 'BG20260612018', batchType: '报关单号', inspect: '—' },
  '2#A1': { area: '原料区域', mat: '原料物料-A', used: 70, batch: 'BG20260715033', batchType: '报关单号', inspect: '—' },
  '2#A2': { area: '原料区域', mat: '原料物料-B', used: 28, batch: 'BG20260508007', batchType: '报关单号', inspect: '—' },
  '4#A1': { area: '待检区域', mat: 'FL-20260803·待查验', used: 36, batch: 'FL-20260803', batchType: '生产批次', inspect: '查验中' },
  '4#A2': { area: '混成品区域', mat: '成品物料-A', used: 36, batch: 'FL-20260802', batchType: '生产批次', inspect: '已放行' },
  '4#B1': { area: '混成品区域', mat: '成品物料-A', used: 60, batch: 'FL-20260728', batchType: '生产批次', inspect: '已放行' },
  '5#小A': { area: '待检区域', mat: '原料物料-C', used: 30, batch: 'BG20260428016', batchType: '报关单号', inspect: '查验中' },
  '5#大A前': { area: '原料区域', mat: '原料物料-C', used: 24, batch: 'BG20250120014', batchType: '报关单号', inspect: '—' },
  '6#C2': { area: '混成品区域', mat: '空闲', used: 0, batch: '—', batchType: '', inspect: '—' },
  '码头#A1': { area: '原料区域', mat: '原料物料-D', used: 48, batch: 'BG20260725088', batchType: '报关单号', inspect: '—', inAt: '2026-07-25' },
  '码头#A2': { area: '原料区域', mat: '原料物料-D', used: 18, batch: 'BG20260801055', batchType: '报关单号', inspect: '—', inAt: '2026-08-01' },
};

const STACK_LOTS = {
  '1#A1': [
    { consignor: '广西金川', kind: '达标矿', origin: '秘鲁', weight: 468, batch: 'BG20260728041' },
    { consignor: '五矿有色', kind: '报备矿', origin: '毛里塔尼亚', weight: 200, batch: 'BG20260801088' },
  ],
  '1#A2': [
    { consignor: '广西金川', kind: '报备矿', origin: '智利', weight: 330, batch: 'BG20260801022' },
  ],
  '1#B1': [
    { consignor: '南国铜业', kind: '达标矿', origin: '秘鲁', weight: 180, batch: 'BG20260612018' },
  ],
  '1#B2': [
    { consignor: '南国铜业', kind: '报备矿', origin: 'DA XIN', weight: 1400, batch: 'BG20250418031' },
    { consignor: '五矿有色', kind: '报备矿', origin: '卧龙松', weight: 775, batch: 'BG20260801022' },
  ],
  '2#A1': [
    { consignor: '广西金川', kind: '报备矿', origin: '秘鲁', weight: 3938, batch: 'BG20260715033' },
  ],
  '2#A2': [
    { consignor: '南国铜业', kind: '达标矿', origin: '刚果金', weight: 620, batch: 'BG20260508007' },
  ],
  '4#A1': [
    { consignor: '广西金川', kind: '混成品', origin: '待查验', weight: 180, batch: 'FL-20260803' },
  ],
  '4#A2': [
    { consignor: '广西金川', kind: '混成品', origin: '混成品', weight: 180, batch: 'FL-20260802' },
  ],
  '4#B1': [
    { consignor: '广西金川', kind: '混成品', origin: '智利', weight: 220, batch: 'FL-20260728' },
  ],
  '5#小A': [
    { consignor: '五矿有色', kind: '报备矿', origin: '澳洲', weight: 252, batch: 'BG20260428016' },
  ],
  '5#大A前': [
    { consignor: '五矿有色', kind: '达标矿', origin: '智利', weight: 410, batch: 'BG20250120014' },
  ],
  '6#C2': [],
  '码头#A1': [
    { consignor: '五矿有色', kind: '报备矿', origin: '智利', weight: 1920, batch: 'BG20260725088' },
  ],
  '码头#A2': [
    { consignor: '南国铜业', kind: '达标矿', origin: '秘鲁', weight: 720, batch: 'BG20260801055' },
  ],
};

function whLabel(no) { return no === '码头' ? '码头仓库' : `${no}仓`; }
function stackCode(no, slot) { return `${no}#${slot}`; }

function whNoFromLabel(label) {
  const found = (typeof WAREHOUSES !== 'undefined')
    ? WAREHOUSES.find((w) => w.filter === label || w.name === label)
    : null;
  if (found) return found.no;
  if (String(label || '').includes('码头')) return '码头';
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
  updateStackCode();
  const grid = getStackGrid(code || document.getElementById('stCode')?.value || '1#A1');
  const gridHint = document.getElementById('stGridFromPlan');
  if (gridHint) {
    gridHint.value = grid.fromPlan ? `${grid.cols}×${grid.rows}（平面图）` : '未在平面图中绘制';
  }
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
  toast(`堆位 ${code} 已保存`, 'ok');
  renderStackTable();
  if (typeof renderParkYard === 'function') renderParkYard();
}

function whCls(no) {
  if (no === '码头') return 'raw';
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
      return {
        code, slot, area: demo.area, mat: demo.mat, used: demo.used, cap: stackCap, usedTon,
        batch: demo.batch, batchType: demo.batchType || '', inspect: demo.inspect, inAt: demo.inAt || '',
      };
    });
    const occ = Math.round(stacks.reduce((s, x) => s + x.used, 0) / stacks.length);
    const usedTotal = stacks.reduce((s, x) => s + x.usedTon, 0);
    const firstStack = stacks.find((s) => s.batch !== '—') || stacks[0];
    return {
      id: def.id || `wh${def.no}`,
      no: def.no,
      name: def.name || whLabel(def.no),
      filter: def.name || whLabel(def.no),
      kind: def.kind || 'yard',
      cap: def.cap,
      floorArea: def.floorArea ?? null,
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
const WH_AREA_KEY = 'wms_warehouse_areas';

function loadWarehouseAreas() {
  try {
    const raw = localStorage.getItem(WH_AREA_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function persistWarehouseAreas() {
  const map = {};
  WAREHOUSES.forEach((w) => {
    map[w.id] = w.floorArea == null || w.floorArea === '' ? null : w.floorArea;
  });
  try { localStorage.setItem(WH_AREA_KEY, JSON.stringify(map)); } catch { /* ignore */ }
}

(function applyStoredWarehouseAreas() {
  const stored = loadWarehouseAreas();
  WAREHOUSES.forEach((w) => {
    if (Object.prototype.hasOwnProperty.call(stored, w.id)) w.floorArea = stored[w.id];
  });
}());

function formatFloorArea(val) {
  if (val == null || val === '') return '—';
  const n = Number(val);
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString('zh-CN');
}

function openWarehouseModal(whId) {
  const editId = document.getElementById('whEditId');
  const noEl = document.getElementById('whNo');
  const capEl = document.getElementById('whCap');
  const areaEl = document.getElementById('whFloorArea');
  const statusEl = document.getElementById('whStatus');
  const wh = whId ? WAREHOUSES.find((w) => w.id === whId) : null;
  if (editId) editId.value = wh ? wh.id : '';
  if (wh) {
    if (noEl) noEl.value = wh.no;
    if (capEl) capEl.value = wh.cap;
    if (areaEl) areaEl.value = wh.floorArea != null ? wh.floorArea : '';
    if (statusEl) statusEl.value = wh.status || '启用';
  } else {
    if (noEl) noEl.value = '';
    if (capEl) capEl.value = '';
    if (areaEl) areaEl.value = '';
    if (statusEl) statusEl.value = '启用';
  }
  openModal('modalWarehouse');
}

function saveWarehouse() {
  const editId = document.getElementById('whEditId')?.value;
  const areaRaw = document.getElementById('whFloorArea')?.value;
  const areaVal = areaRaw === '' || areaRaw == null ? null : Number(areaRaw);
  if (areaVal != null && (!Number.isFinite(areaVal) || areaVal < 0)) {
    toast('请填写有效的面积', 'warn');
    return;
  }
  if (editId) {
    const wh = WAREHOUSES.find((w) => w.id === editId);
    if (wh) {
      wh.floorArea = areaVal;
      persistWarehouseAreas();
    }
  }
  closeModal('modalWarehouse');
  renderWarehouseTable();
  toast(editId ? '仓库面积已保存' : '已保存（原型演示）', 'ok');
}

const STACK_TOTAL = WAREHOUSES.reduce((s, w) => s + w.stacks.length, 0);

const INBOUND_RESERVES_KEY = 'wms_inbound_reserves';

function parkDerivedStackGrid(code) {
  if (typeof parkStackGridOf !== 'function') return null;
  return parkStackGridOf(code);
}

function dumpStackGrids() {
  const out = {};
  WAREHOUSES.forEach((w) => {
    w.stacks.forEach((s) => {
      const g = parkDerivedStackGrid(s.code);
      if (g) out[s.code] = { rows: g.rows, cols: g.cols };
    });
  });
  return out;
}

function applyStackGrids() {
  /* 堆位网格以平面图占格为准，不再回写独立网格档案 */
}

function getStackGrid(code) {
  const g = parkDerivedStackGrid(code);
  if (g && g.rows >= 1 && g.cols >= 1) {
    return {
      rows: Math.max(1, Math.min(200, g.rows)),
      cols: Math.max(1, Math.min(200, g.cols)),
      fromPlan: true,
    };
  }
  return { rows: 0, cols: 0, fromPlan: false };
}

function loadInboundReserves() {
  try {
    const raw = localStorage.getItem(INBOUND_RESERVES_KEY);
    const list = raw ? JSON.parse(raw) : [];
    if (Array.isArray(list)) {
      return list.filter((r) => r && r.id && r.id !== 'RK-20260803-001' && Array.isArray(r.cells) && r.cells.length);
    }
  } catch { /* ignore */ }
  return [];
}

let INBOUND_RESERVES = loadInboundReserves();

function persistInboundReserves() {
  try { localStorage.setItem(INBOUND_RESERVES_KEY, JSON.stringify(INBOUND_RESERVES)); } catch { /* ignore */ }
}

function getReservedCells(code) {
  const cells = [];
  INBOUND_RESERVES.forEach((r) => {
    if (r.stackCode === code) (r.cells || []).forEach((c) => cells.push({ r: Number(c.r), c: Number(c.c) }));
  });
  return cells;
}

const inboundPick = { stackCode: '', cells: new Set(), drag: null, bound: false, stackOpts: [], listOpen: false };

function allStackOptions() {
  return WAREHOUSES.flatMap((w) => w.stacks.map((s) => ({
    code: s.code,
    label: `${s.code}（${w.name} / ${s.area}）`,
    hay: `${s.code} ${w.name} ${s.area} ${s.slot || ''}`.toLowerCase(),
  })));
}

function usedCellSet(code) {
  const stack = WAREHOUSES.map((w) => w.stacks.find((s) => s.code === code)).find(Boolean);
  const grid = getStackGrid(code);
  const total = Math.max(0, grid.rows * grid.cols);
  const usedCount = total ? Math.round(total * ((stack?.used || 0) / 100)) : 0;
  const set = new Set();
  for (let i = 0; i < usedCount; i += 1) {
    const r = Math.floor(i / grid.cols);
    const c = i % grid.cols;
    set.add(`${r},${c}`);
  }
  return set;
}

function inboundCellKey(r, c) {
  return `${Number(r)},${Number(c)}`;
}

function paintInboundCellEl(el, on) {
  if (!el) return;
  el.classList.toggle('is-picked', on);
}

function applyInboundCell(r, c, on) {
  const key = inboundCellKey(r, c);
  if (on) inboundPick.cells.add(key);
  else inboundPick.cells.delete(key);
  const host = document.getElementById('ibStackGrid');
  const el = host?.querySelector(`.sg-cell[data-r="${Number(r)}"][data-c="${Number(c)}"]`);
  paintInboundCellEl(el, on);
}

function inboundCellFromEvent(e) {
  const el = (e.target && e.target.closest) ? e.target.closest('.sg-cell') : null;
  if (el) return el;
  const node = document.elementFromPoint(e.clientX, e.clientY);
  return node?.closest?.('.sg-cell') || null;
}

function bindInboundStackGrid() {
  const host = document.getElementById('ibStackGrid');
  if (!host || host.dataset.bound) return;
  host.dataset.bound = '1';
  host.addEventListener('mousedown', (e) => {
    const cell = inboundCellFromEvent(e);
    if (!cell) return;
    e.preventDefault();
    const key = inboundCellKey(cell.dataset.r, cell.dataset.c);
    const adding = !inboundPick.cells.has(key);
    inboundPick.drag = { adding, seen: new Set([key]) };
    applyInboundCell(cell.dataset.r, cell.dataset.c, adding);
  });
  host.addEventListener('mouseover', (e) => {
    if (!inboundPick.drag) return;
    const cell = inboundCellFromEvent(e);
    if (!cell) return;
    const key = inboundCellKey(cell.dataset.r, cell.dataset.c);
    if (inboundPick.drag.seen.has(key)) return;
    inboundPick.drag.seen.add(key);
    applyInboundCell(cell.dataset.r, cell.dataset.c, inboundPick.drag.adding);
  });
  window.addEventListener('mouseup', () => { inboundPick.drag = null; });
}

function renderInboundStackGrid() {
  const host = document.getElementById('ibStackGrid');
  if (!host) return;
  bindInboundStackGrid();
  const code = inboundPick.stackCode;
  if (!code) {
    host.style.gridTemplateColumns = '1fr';
    host.innerHTML = '<div class="sg-empty">请先选择预定堆位，再圈选存放位置</div>';
    return;
  }
  const grid = getStackGrid(code);
  if (!grid.fromPlan) {
    host.style.gridTemplateColumns = '1fr';
    host.innerHTML = '<div class="sg-empty">该堆位未在平面图中绘制，请到系统设置 · 平面图设置绘制后再选存放位置</div>';
    return;
  }
  const used = usedCellSet(code);
  host.style.gridTemplateColumns = `repeat(${grid.cols}, 16px)`;
  let html = '';
  for (let r = 0; r < grid.rows; r += 1) {
    for (let c = 0; c < grid.cols; c += 1) {
      const key = inboundCellKey(r, c);
      const cls = [inboundPick.cells.has(key) ? 'is-picked' : '', used.has(key) ? 'is-used' : ''].filter(Boolean).join(' ');
      html += `<button type="button" class="sg-cell ${cls}" data-r="${r}" data-c="${c}" title="${r + 1}行 ${c + 1}列"></button>`;
    }
  }
  host.innerHTML = html;
}

function onInboundStackChange() {
  const sel = document.getElementById('ibStack');
  inboundPick.stackCode = sel?.value || '';
  inboundPick.cells = new Set();
  inboundPick.drag = null;
  renderInboundStackGrid();
}

function inboundStackMatches(opt, kw) {
  if (!kw) return true;
  return opt.hay.includes(kw) || opt.code.toLowerCase().includes(kw) || opt.label.toLowerCase().includes(kw);
}

function filteredInboundStacks(q) {
  const kw = String(q || '').trim().toLowerCase();
  return (inboundPick.stackOpts || []).filter((o) => inboundStackMatches(o, kw));
}

function renderInboundStackList(q) {
  const list = document.getElementById('ibStackList');
  if (!list) return;
  const matched = filteredInboundStacks(q);
  if (!matched.length) {
    list.innerHTML = '<li class="combo-empty">无匹配堆位</li>';
    return;
  }
  list.innerHTML = matched.map((o) =>
    `<li><button type="button" class="combo-item" data-code="${escapeHtml(o.code)}">${escapeHtml(o.label)}</button></li>`
  ).join('');
}

function openInboundStackList() {
  const list = document.getElementById('ibStackList');
  if (!list) return;
  renderInboundStackList(document.getElementById('ibStackSearch')?.value);
  list.hidden = false;
  inboundPick.listOpen = true;
}

function closeInboundStackList() {
  const list = document.getElementById('ibStackList');
  if (list) list.hidden = true;
  inboundPick.listOpen = false;
}

function onInboundStackSearch() {
  openInboundStackList();
  const typed = document.getElementById('ibStackSearch')?.value.trim() || '';
  const exact = (inboundPick.stackOpts || []).find((o) => o.code === typed);
  const hidden = document.getElementById('ibStack');
  if (exact) {
    if (hidden) hidden.value = exact.code;
    if (inboundPick.stackCode !== exact.code) onInboundStackChange();
    return;
  }
  if (hidden) hidden.value = '';
  if (inboundPick.stackCode) {
    inboundPick.stackCode = '';
    inboundPick.cells = new Set();
    renderInboundStackGrid();
  }
}

function pickInboundStack(code) {
  const opt = (inboundPick.stackOpts || []).find((o) => o.code === code);
  const hidden = document.getElementById('ibStack');
  const input = document.getElementById('ibStackSearch');
  if (hidden) hidden.value = code || '';
  if (input) input.value = opt ? opt.code : (code || '');
  closeInboundStackList();
  onInboundStackChange();
}

function onInboundStackKey(e) {
  if (e.key === 'Escape') {
    closeInboundStackList();
    return;
  }
  if (e.key !== 'Enter') return;
  e.preventDefault();
  const typed = document.getElementById('ibStackSearch')?.value.trim() || '';
  const matched = filteredInboundStacks(typed);
  const exact = matched.find((o) => o.code === typed) || (matched.length === 1 ? matched[0] : null);
  if (exact) pickInboundStack(exact.code);
}

function bindInboundStackCombo() {
  const combo = document.getElementById('ibStackCombo');
  const list = document.getElementById('ibStackList');
  if (list && !list.dataset.bound) {
    list.dataset.bound = '1';
    list.addEventListener('mousedown', (e) => {
      const btn = e.target.closest?.('.combo-item');
      if (!btn) return;
      e.preventDefault();
      pickInboundStack(btn.dataset.code);
    });
  }
  if (!combo || combo.dataset.bound) return;
  combo.dataset.bound = '1';
  document.addEventListener('mousedown', (e) => {
    if (!inboundPick.listOpen) return;
    if (combo.contains(e.target)) return;
    closeInboundStackList();
  });
}

function populateInboundStacks() {
  bindInboundStackCombo();
  inboundPick.stackOpts = allStackOptions();
  const hidden = document.getElementById('ibStack');
  const input = document.getElementById('ibStackSearch');
  if (hidden) hidden.value = '';
  if (input) input.value = '';
  inboundPick.stackCode = '';
  inboundPick.cells = new Set();
  inboundPick.drag = null;
  renderInboundStackList('');
  closeInboundStackList();
  renderInboundStackGrid();
}

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
    const g = getStackGrid(s.code);
    const gridText = g.fromPlan ? `${g.cols}×${g.rows}` : '未绘制';
    return `<tr data-wh="${wh.filter}" data-code="${s.code}">
      <td>${s.code}</td><td>${wh.name}</td><td>${areaTagHtml(s.area)}</td>
      <td>${gridText}</td>
      <td>${s.cap.toLocaleString('zh-CN')}</td>
      <td><span class="tag tag-green">启用</span></td>
      <td class="ops"><button class="btn-text" onclick="openStackModal('${s.code}')">编辑</button></td></tr>`;
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
      <td>${formatFloorArea(wh.floorArea)}</td>
      <td>${wh.stackCount}</td>
      <td>${wh.usedTotal.toLocaleString('zh-CN')} / ${wh.occ}%</td>
      <td><span class="tag tag-green">${wh.status}</span></td>
      <td class="ops">
        <button class="btn-text" onclick="goWarehouse('${wh.id}')">查看堆位</button>
        <button class="btn-text" onclick="openWarehouseModal('${wh.id}')">编辑</button>
      </td>
    </tr>
  `).join('');
  const pag = document.getElementById('warehouseCount');
  if (pag) pag.textContent = `共 ${WAREHOUSES.length} 个仓库`;
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
  { date: '2026-08-03', time: '14:32', type: '入仓', cls: 'in', text: 'RK-20260803-001 · 物料 800 湿吨 · 1仓' },
  { date: '2026-08-03', time: '14:18', type: '出仓', cls: 'out', text: 'CK-20260803-012 · 成品 180 干吨 · 华东冶炼' },
  { date: '2026-08-03', time: '13:55', type: '生产', cls: 'prod', text: 'FL-20260803 · 3 票报关单投料 200 干吨' },
  { date: '2026-08-01', time: '13:40', type: '称重', cls: 'weigh', text: 'RK-20260801-015 · 湿 800 / 干 720' },
  { date: '2026-08-03', time: '13:22', type: '上架', cls: 'put', text: '4#A1 · 生产批次 FL-20260803 上架，片区标识：待检区域' },
  { date: '2026-08-03', time: '12:58', type: '完工', cls: 'done', text: 'WG-20260803-01 · 成品 180 干吨入库' },
  { date: '2026-08-03', time: '12:35', type: '入仓', cls: 'in', text: 'RK-20260803-002 · 物料 620 湿吨 · 2仓' },
  { date: '2026-08-03', time: '11:48', type: '出仓', cls: 'out', text: 'CK-20260803-008 · 成品 95 干吨 · 华南冶炼' },
  { date: '2026-08-03', time: '11:20', type: '生产', cls: 'prod', text: 'TL-20260803-003 · 投料物料 150 干吨' },
  { date: '2026-08-02', time: '10:45', type: '称重', cls: 'weigh', text: 'RK-20260802-028 · 湿 540 / 干 486' },
  { date: '2026-08-02', time: '10:12', type: '入仓', cls: 'in', text: 'RK-20260802-028 · 物料 540 湿吨 · 1仓' },
  { date: '2026-08-03', time: '09:30', type: '出仓', cls: 'out', text: 'CK-20260803-005 · 成品 120 干吨 · 丰联铜业' },
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
  { lvl: 'mid', type: '原料库龄', target: 'BG20260428016', title: '原料库龄超期', desc: '报关单号在库 98 天，超过库龄预警阈值', time: '08:00', page: 'alert', action: '追溯台账', actionFn: 'openLedger(\'BG20260428016\')' },
  { lvl: 'high', type: '账实差异', target: 'YL-CU-001', title: '账实差异 2.5 吨', desc: '账册库存与实物差 2.5 吨', time: '07:30', page: 'customs', action: '对账', actionFn: 'go(\'customs\')' },
];

const DEMO_TODAY = '2026-08-03';

function daysBetween(fromDate, toDate) {
  const a = new Date(`${fromDate}T00:00:00`);
  const b = new Date(`${toDate}T00:00:00`);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return 0;
  return Math.floor((b - a) / 86400000);
}

function buildDockAlerts(params) {
  const threshold = Number(params.dockAgingDays) || DEFAULT_SYS_PARAMS.dockAgingDays;
  const out = [];
  WAREHOUSES.filter((w) => w.kind === 'dock').forEach((wh) => {
    wh.stacks.forEach((s) => {
      if (!s.inAt || !s.batch || s.batch === '—') return;
      const days = daysBetween(s.inAt, DEMO_TODAY);
      if (days > threshold) {
        out.push({
          lvl: 'high',
          type: '码头仓库',
          target: s.batch,
          title: '码头仓库货品超期',
          desc: `${s.code} · ${s.batch} 在码头仓库 ${days} 天，超过 ${threshold} 天预警`,
          time: '08:00',
          page: 'inventory',
          action: '查看库存',
          actionFn: 'go(\'inventory\')',
        });
      }
    });
  });
  return out;
}

function buildAlertList() {
  const params = loadSysParams();
  const list = [...ALERTS_STATIC, ...buildDockAlerts(params), ...buildBondedAlerts()];
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
  const n = buildAlertList().length;
  const el = document.querySelector('.ck-kpi.danger .ck-kpi-val');
  if (el) {
    el.dataset.count = String(n);
    el.textContent = String(n);
  }
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
  renderAllAlerts();
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

/* 园区平面图编辑与驾驶舱渲染见 yard-plan.js */

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
  if (typeof renderParkYard === 'function') {
    renderParkYard();
    return;
  }
}

function flowLogItemHtml(s) {
  const hh = (s.time || '').split(':')[0];
  const date = s.date || '2026-08-03';
  return `
    <li class="flow-log-item">
      <time>${date} ${hh}时</time>
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
  const list = buildAlertList().map((a) => `
    <li class="alert-feed-item" onclick="go('${a.page}')">
      <i class="lvl ${a.lvl}"></i>
      <div class="ttl">${a.title}<span>${a.desc}</span></div>
      <time>${a.time}</time>
    </li>
  `).join('');
  el.innerHTML = `
    <div class="alert-feed-viewport">
      <ul class="alert-feed-track">
        ${list}
        ${list}
      </ul>
    </div>
  `;
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
  /* 驾驶舱已改为进度条，保留空实现以免旧缓存脚本报错 */
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
