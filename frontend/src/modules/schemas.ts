import {
  auditApi, bondedApi, customsApi, inboundApi, inventoryApi, ledgerApi, materialApi, ocrApi,
  outboundApi, partnerApi, productionApi, stocktakeApi, warehouseApi, authApi,
} from '@/api'
import type { ApiResult, DetailBlock, ModuleSchema } from '@/types'

function ledgerDetail(row: Record<string, unknown>): DetailBlock[] {
  const records = Array.isArray(row.records) ? row.records as Record<string, unknown>[] : []
  const block = (kind: string, title: string): DetailBlock => ({
    title,
    table: {
      columns: [
        { prop: 'action', label: '事项', width: 140 },
        { prop: 'tons', label: '吨数', width: 100 },
        { prop: 'time', label: '时间', minWidth: 160 },
        { prop: 'refNo', label: '单号', minWidth: 160 },
      ],
      rows: records.filter((item) => item.kind === kind),
    },
  })
  const consume = Number(row.consumeTons || 0)
  return [
    {
      title: `${row.seq || ''} ${row.customsNo || ''}`.trim() || '票货',
      fields: [
        { label: '账期', value: text(row.month) },
        { label: '入库(吨)', value: text(row.inboundTons) },
        { label: '投产(吨)', value: text(row.consumeTons) },
        { label: '保税归属', value: text(row.place) },
        { label: '月度出清', value: text(row.monthlyStatus || (consume > 0 ? '已出清' : '未出清')) },
        { label: '次月库存', value: text(row.nextStock || (consume > 0 ? '不再纳入' : '纳入库存')) },
      ],
    },
    block('存储', '原料存储'),
    block('加工', '加工'),
    block('出库', '出库'),
  ]
}

function text(value: unknown) {
  if (value == null || value === '') return '—'
  return String(value)
}

function statusActions(
  noun: string,
  save: (id: string, body: Record<string, unknown>) => Promise<ApiResult>,
) {
  const send = (row: Record<string, unknown>, status: '启用' | '停用') => save(String(row.id), { ...row, status })
  return [
    { label: '停用', when: (row: Record<string, unknown>) => row.status === '启用', confirm: `确认停用该${noun}？`, request: (row: Record<string, unknown>) => send(row, '停用') },
    { label: '启用', when: (row: Record<string, unknown>) => row.status !== '启用', confirm: `确认启用该${noun}？`, request: (row: Record<string, unknown>) => send(row, '启用') },
  ]
}

export const schemas: Record<string, ModuleSchema> = {
  warehouses: {
    key: 'warehouses',
    createLabel: '新建仓库',
    filters: [
      { key: 'keyword', label: '仓库编号', placeholder: '如 1仓 / 码头仓库' },
      { key: 'status', label: '状态', type: 'select', options: ['启用', '停用'] },
    ],
    columns: [
      { prop: 'code', label: '仓库编号', minWidth: 120 },
      // { prop: 'orderNum', label: '排序', width: 80 },
      { prop: 'capacity', label: '库容(吨)', width: 120 },
      { prop: 'area', label: '面积(㎡)', width: 120 },
      { prop: 'stackCount', label: '堆位数', width: 90 },
      // { prop: 'rate', label: '已用/占用率', minWidth: 180, usage: true },
      { prop: 'status', label: '状态', width: 90, tag: true },
    ],
    formWidth: 520,
    form: [
      { key: 'code', label: '仓库编号', required: true, disabled: (_form, isEdit) => isEdit, span: 24 },
      { key: 'capacity', label: '库容', type: 'number', required: true, unit: '吨', span: 24 },
      { key: 'area', label: '面积', type: 'number', required: true, unit: '方', placeholder: '仅展示，不参与占用', span: 24 },
      { key: 'orderNum', label: '排序', type: 'number', required: true, placeholder: '数字越小越靠前', span: 24 },
      { key: 'status', label: '状态', type: 'select', options: ['启用', '停用'], required: true, span: 24 },
    ],
    list: warehouseApi.list,
    create: warehouseApi.create,
    update: warehouseApi.update,
    actions: [
      ...statusActions('仓库', warehouseApi.setStatus),
      { label: '查看堆位', path: '/stacks', queryKey: 'warehouse', queryFrom: 'code' },
      { label: '删除', confirm: '确认删除该仓库？', danger: true, request: (row) => warehouseApi.remove(String(row.id)) },
    ],
  },
  stacks: {
    key: 'stacks',
    createLabel: '新建堆位',
    filters: [
      { key: 'warehouse', label: '仓库', type: 'select', optionsFrom: 'warehouses' },
      { key: 'areaLabel', label: '片区标识', type: 'select', dict: 'wms_area_identification' },
      { key: 'keyword', label: '堆位编码', placeholder: '如 4#A1' },
    ],
    columns: [
      { prop: 'code', label: '编码', minWidth: 120 },
      // { prop: 'orderNum', label: '排序', width: 80 },
      { prop: 'warehouse', label: '所属仓库', width: 120 },
      { prop: 'areaLabel', label: '片区标识', width: 120, tag: true },
      { prop: 'grid', label: '网格', width: 100 },
      { prop: 'capacity', label: '库容(吨)', width: 120 },
    ],
    formWidth: 520,
    form: [
      { key: 'stackName', label: '堆位名称', required: true, placeholder: '如 A1、小A', span: 24 },
      { key: 'code', label: '堆位编码', required: true, disabled: () => true, placeholder: '由仓库编号与名称自动拼接', span: 24 },
      { key: 'warehouse', label: '所属仓库', type: 'select', optionsFrom: 'warehouses', required: true, span: 24 },
      { key: 'areaLabel', label: '片区标识', type: 'select', dict: 'wms_area_identification', required: true, span: 24 },
      { key: 'capacity', label: '库容', type: 'number', required: true, unit: '吨', span: 24 },
      { key: 'orderNum', label: '排序', type: 'number', required: true, placeholder: '数字越小越靠前', span: 24 },
    ],
    list: warehouseApi.stacks,
    create: warehouseApi.createStack,
    update: warehouseApi.updateStack,
    actions: [
      {
        label: '查验完成',
        when: (row) => row.areaLabel === '待检区',
        confirm: '确认将该堆位从待检区改为成品区？',
        request: (row) => warehouseApi.inspectStack(String(row.id)),
      },
      { label: '删除', confirm: '确认删除该堆位？', danger: true, request: (row) => warehouseApi.removeStack(String(row.id)) },
    ],
  },
  materials: {
    key: 'materials',
    createLabel: '新建物料',
    dialogTitle: '物料档案',
    formWidth: 520,
    exportLabel: '导出 Excel',
    filters: [
      { key: 'cargoType', label: '货物类型', type: 'select', placeholder: '全部货物类型', dict: 'wms_item_category' },
      { key: 'kind', label: '类型', type: 'select', placeholder: '全部类型', dict: 'wms_item_type' },
      { key: 'keyword', label: '物料编码/名称', placeholder: '物料编码/名称' },
    ],
    columns: [
      { prop: 'code', label: '物料编码', minWidth: 140 },
      { prop: 'name', label: '名称', minWidth: 160 },
      { prop: 'cargoType', label: '货物类型', width: 120, tag: true },
      { prop: 'kind', label: '类型', width: 100, tag: true },
      { prop: 'source', label: '矿源', minWidth: 140 },
    ],
    form: [
      { key: 'code', label: '物料编码', required: true, placeholder: '如 YL-CU-001', disabled: (_f, isEdit) => isEdit, span: 24 },
      { key: 'name', label: '名称', required: true, span: 24 },
      { key: 'cargoType', label: '货物类型', type: 'select', dict: 'wms_item_category', required: true, span: 24, disabled: (form) => form.kind === '成品', options: (form, labels = []) => {
        if (form.kind === '成品') {
          const locked = labels.filter((item) => item === '混成品')
          return locked.length ? locked : labels
        }
        const raw = labels.filter((item) => item !== '混成品')
        return raw.length ? raw : labels
      } },
      { key: 'kind', label: '类型', type: 'select', dict: 'wms_item_type', required: true, span: 24 },
      { key: 'source', label: '矿源', required: true, span: 24, placeholder: '如 智利精矿', when: (form) => form.kind !== '成品' },
    ],
    onFormChange(form, key) {
      if (key === 'kind' && form.kind === '成品') form.cargoType = '混成品'
      if (key === 'kind' && form.kind === '原料' && form.cargoType === '混成品') form.cargoType = '达标矿'
      if (form.kind === '成品') form.source = ''
    },
    list: materialApi.list,
    create: materialApi.create,
    update: materialApi.update,
    exportRows: (query) => materialApi.exportRows(query),
    importRows: (file) => materialApi.importFile(file),
    actions: [
      { label: '删除', confirm: '确认删除该物料？', danger: true, request: (row) => materialApi.remove(String(row.id)) },
    ],
  },
  filings: {
    key: 'filings',
    createLabel: '新建矿源备案',
    dialogTitle: '矿源备案',
    formWidth: 480,
    labelWidth: '156px',
    exportLabel: '导出 Excel',
    defaults: () => ({
      originCountry: '智利',
      filingDate: new Date().toISOString().slice(0, 10),
    }),
    filters: [
      { key: 'source', label: '矿源', type: 'select', placeholder: '全部矿源', dict: 'wms_mineral_source', options: (_form, labels = []) => labels.length ? labels : ['智利精矿', '澳洲精矿'] },
      { key: 'sourceKind', label: '矿源种类', placeholder: '如 精铜矿' },
      { key: 'keyword', label: '矿源备案编号', placeholder: '如 JG-2023-KY04' },
      { key: 'status', label: '状态', type: 'select', placeholder: '全部状态', options: ['有效', '即将用尽', '已用尽'] },
      { key: 'from', label: '开始日期', type: 'date' },
      { key: 'to', label: '结束日期', type: 'date' },
    ],
    columns: [
      { prop: 'source', label: '矿源', minWidth: 120 },
      { prop: 'sourceKind', label: '矿源种类', width: 110 },
      { prop: 'originCountry', label: '备案原产国', width: 120 },
      { prop: 'code', label: '矿源备案编号', minWidth: 150 },
      { prop: 'filingDate', label: '备案日期', width: 120 },
      { prop: 'status', label: '状态', width: 100, tag: true },
      { prop: 'qty', label: '备案数量（DMT）', width: 150 },
      { prop: 'usedQty', label: '核销吨数', width: 110 },
      { prop: 'remain', label: '剩余吨数', width: 110 },
      { prop: 'usage', label: '用量%', width: 100 },
      { prop: 'attachmentUrl', label: '附件', width: 90, image: true },
    ],
    form: [
      { key: 'source', label: '矿源', required: true, span: 24, placeholder: '如 智利精矿' },
      { key: 'sourceKind', label: '矿源种类', span: 24, placeholder: '如 精铜矿' },
      { key: 'originCountry', label: '备案原产国', required: true, span: 24 },
      { key: 'code', label: '矿源备案编号', required: true, span: 24, placeholder: '如 JG-2025-KY04' },
      { key: 'filingDate', label: '备案日期', type: 'date', span: 24 },
      { key: 'qty', label: '备案数量（DMT）', type: 'number', span: 24, disabled: (_f, isEdit) => isEdit },
      { key: 'attachment', label: '附件资料', type: 'image', span: 24 },
    ],
    list: materialApi.filings,
    create: materialApi.createFiling,
    update: materialApi.updateFiling,
    exportRows: (query) => materialApi.exportFilings(query),
    showDetail: true,
    detailColumn: 'code',
    async detail(row) {
      const res = await materialApi.lots(String(row.code))
      const blocks: DetailBlock[] = [{
        title: `备案票货 · ${row.code || ''}`,
        table: {
          columns: [
            { prop: 'customsNo', label: '报关单号', minWidth: 150, lot: true },
            { prop: 'prodBatch', label: '生产批次号', minWidth: 120 },
            { prop: 'consignor', label: '委托方', minWidth: 100 },
            { prop: 'material', label: '物料', minWidth: 110 },
            { prop: 'cargoType', label: '货物类型', width: 100, tag: true },
            { prop: 'stack', label: '堆位', width: 90 },
            { prop: 'wet', label: '湿重', width: 80 },
            { prop: 'dry', label: '干重(DMT)', width: 110 },
            { prop: 'inAt', label: '入库时间', minWidth: 140 },
            { prop: 'status', label: '状态', width: 90, tag: true },
          ],
          rows: res.success ? res.data : [],
        },
      }]
      return blocks
    },
    actions: [
      { label: '票货', opensDetail: true },
      // {
      //   label: '查看附件',
      //   image: (row) => String(row.attachmentUrl || ''),
      // },
      {
        label: '导出 Excel',
        inDetail: true,
        request: async (row) => materialApi.exportLots(String(row.code)),
      },
    ],
  },
  partners: {
    key: 'partners',
    createLabel: '新建主体',
    formWidth: 520,
    defaults: () => ({ status: '启用' }),
    filters: [
      { key: 'keyword', label: '编码/名称' },
      { key: 'role', label: '角色', type: 'select', dict: 'wms_merchant_type' },
    ],
    columns: [
      { prop: 'code', label: '编码', width: 120 },
      { prop: 'name', label: '名称', minWidth: 140 },
      { prop: 'role', label: '角色', width: 140 },
      { prop: 'phone', label: '联系电话', width: 140 },
      { prop: 'source', label: '来源', width: 120 },
      { prop: 'status', label: '状态', width: 90, tag: true },
    ],
    form: [
      { key: 'code', label: '编码', required: true, disabled: (_f, isEdit) => isEdit, span: 24 },
      { key: 'name', label: '名称', required: true, span: 24 },
      { key: 'role', label: '角色', type: 'select', dict: 'wms_merchant_type', required: true, span: 24, options: (_form, labels =  []) => labels.filter((item) => item !== '流向企业') },
      { key: 'phone', label: '联系电话', span: 24 },
      { key: 'status', label: '状态', when: () => false },
    ],
    canEdit: (row) => row.source !== '出库识别',
    list: partnerApi.list,
    create: partnerApi.create,
    update: partnerApi.update,
    actions: [
      ...statusActions('主体', partnerApi.setStatus),
      {
        label: '删除',
        confirm: '确认删除该主体？',
        danger: true,
        when: (row) => row.source !== '出库识别',
        request: (row) => partnerApi.remove(String(row.id)),
      },
    ],
  },
  bonded: {
    key: 'bonded',
    createLabel: '新建账册',
    filters: [
      { key: 'keyword', label: '关键字', placeholder: '编号 / 名称 / 报关单号' },
      { key: 'from', label: '预警起', type: 'date' },
      { key: 'to', label: '预警止', type: 'date' },
    ],
    columns: [
      { prop: 'code', label: '账册编号', minWidth: 130 },
      { prop: 'name', label: '名称', minWidth: 180 },
      { prop: 'operator', label: '经营单位', minWidth: 140 },
      { prop: 'value', label: '货值', width: 130 },
      { prop: 'customsNo', label: '报关单号', minWidth: 170 },
      { prop: 'status', label: '状态', width: 90, tag: true },
      { prop: 'warnDate', label: '旧账预警日', width: 130 },
    ],
    form: [
      { key: 'code', label: '账册编号', required: true, disabled: (_f, isEdit) => isEdit },
      { key: 'name', label: '名称', required: true },
      { key: 'warnDate', label: '旧账预警日', type: 'date' },
    ],
    list: bondedApi.list,
    create: bondedApi.create,
    update: bondedApi.update,
    showDetail: true,
    detailColumn: 'code',
    actions: [{
      label: '导出 Excel',
      inDetail: true,
      request: async (row) => bondedApi.exportLots(String(row.code)),
    }],
    async detail(row) {
      const res = await bondedApi.lots(String(row.code))
      if (!res.success) {
        return [{
          title: `${row.code} 出入库票矿`,
          fields: [{ label: '说明', value: res.message || '后端未提供账册票矿接口' }],
        }]
      }
      return [{
        title: `${row.code} 出入库票矿`,
        fields: [{ label: '规则', value: '备案默认衔接在用账册；旧账册停用，只结转在册未出库票货。' }],
        table: {
          columns: [
            { prop: 'direction', label: '方向', width: 80 },
            { prop: 'customsNo', label: '报关单号', minWidth: 160 },
            { prop: 'blNo', label: '提单号' },
            { prop: 'wet', label: '湿吨', width: 80 },
            { prop: 'dry', label: '干吨', width: 80 },
            { prop: 'consignor', label: '对方' },
            { prop: 'time', label: '时间', minWidth: 150 },
          ],
          rows: res.success ? res.data : [],
        },
      }]
    },
  },
  ledgerMonthly: {
    key: 'ledgerMonthly',
    filters: [
      { key: 'month', label: '月份', placeholder: '如 2026-08' },
      { key: 'status', label: '出清', type: 'select', options: ['已出清', '未出清'] },
      { key: 'keyword', label: '票次/报关单号', placeholder: '票次或报关单号' },
    ],
    columns: [
      { prop: 'month', label: '入库账期', width: 110 },
      { prop: 'seq', label: '票次', width: 100 },
      { prop: 'customsNo', label: '报关单号', minWidth: 170 },
      { prop: 'inboundTons', label: '入库(吨)', width: 110 },
      { prop: 'monthConsume', label: '当月耗用(吨)', width: 130 },
      { prop: 'monthlyStatus', label: '出清', width: 100, tag: true },
      { prop: 'nextStock', label: '次月库存', width: 110, tag: true },
    ],
    list: ledgerApi.monthly,
    exportRows: ledgerApi.exportMonthly,
    showDetail: true,
    detail: ledgerDetail,
  },
  users: {
    key: 'users',
    createLabel: '注册账号',
    filters: [{ key: 'keyword', label: '账号/姓名' }],
    columns: [
      { prop: 'username', label: '账号', width: 140 },
      { prop: 'name', label: '姓名', width: 120 },
      { prop: 'roleName', label: '角色', width: 120 },
      { prop: 'phone', label: '电话', width: 140 },
      { prop: 'status', label: '状态', width: 90, tag: true },
    ],
    formWidth: 520,
    form: [
      { key: 'username', label: '账号', required: true, disabled: (_f, isEdit) => isEdit, span: 24 },
      { key: 'name', label: '姓名', required: true, span: 24 },
      { key: 'password', label: '密码', type: 'password', required: true, when: (form) => !form.__isEdit, span: 24 },
      { key: 'roleKey', label: '角色', type: 'select', required: true, span: 24, options: [
        { label: '系统管理员', value: 'admin' },
        { label: '仓管员', value: 'warehouse' },
        { label: '关务员', value: 'customs' },
      ] },
      { key: 'phone', label: '电话', span: 24 },
      { key: 'status', label: '状态', type: 'select', options: ['启用', '停用'], required: true, span: 24 },
    ],
    list: authApi.users,
    create: authApi.createUser,
    update: authApi.updateUser,
    actions: statusActions('账号', authApi.setUserStatus),
  },
  inbound: {
    key: 'inbound',
    createLabel: '新建预约',
    filters: [
      { key: 'from', label: '开始日期', type: 'date' },
      { key: 'to', label: '结束日期', type: 'date' },
      { key: 'shipMode', label: '货运方式', type: 'select', optionsFrom: 'shipping' },
      { key: 'oreType', label: '矿种' },
      { key: 'status', label: '状态', type: 'select', options: ['暂存码头', '待收货', '已入库', '混成品'] },
    ],
    columns: [
      { prop: 'time', label: '时间', minWidth: 150 },
      { prop: 'customsNo', label: '报关单号', minWidth: 170 },
      { prop: 'blNo', label: '提单号', width: 120 },
      { prop: 'shipName', label: '船名', width: 100 },
      { prop: 'oreType', label: '矿种', width: 100 },
      { prop: 'shipMode', label: '装运方式', width: 100 },
      { prop: 'containerCount', label: '柜数', width: 80 },
      { prop: 'consignor', label: '委托方', width: 110 },
      { prop: 'stackCode', label: '预定堆位', width: 110 },
      { prop: 'as', label: 'As', width: 70 },
      { prop: 'pb', label: 'Pb', width: 70 },
      { prop: 'cd', label: 'Cd', width: 70 },
      { prop: 'f', label: 'F', width: 70 },
      { prop: 'hg', label: 'Hg', width: 70 },
      { prop: 'status', label: '状态', width: 110, tag: true },
    ],
    form: [
      { key: 'orcId', label: 'OCR任务', placeholder: '先识别入库报关单，填写任务编号', required: true },
      { key: 'material', label: '物料', type: 'select', optionsFrom: 'materials', required: true },
      { key: 'shipName', label: '船名', required: true },
      { key: 'voyage', label: '航次' },
      { key: 'blNo', label: '提单号', required: true },
      { key: 'customsNo', label: '报关单号', required: true },
      { key: 'checklistNo', label: '核注清单', required: true },
      { key: 'amount', label: '金额', type: 'number', required: true },
      { key: 'oreType', label: '矿种', required: true, placeholder: '字典编码或名称' },
      { key: 'shipMode', label: '装运方式', type: 'select', optionsFrom: 'shipping', required: true },
      { key: 'containerCount', label: '集装箱柜数', type: 'number', when: (form) => form.shipMode === '集装箱', required: true },
      { key: 'consignor', label: '委托方', type: 'select', optionsFrom: 'consignors', required: true },
      { key: 'stackCode', label: '预定堆位', type: 'select', required: true, optionsFrom: 'stacks' },
      { key: 'cells', label: '存放格子', type: 'cells', stackKey: 'stackCode', span: 24, required: true },
      { key: 'time', label: '时间', type: 'datetime', required: true },
      { key: 'status', label: '状态', type: 'select', options: ['暂存码头', '待收货', '已入库', '混成品'], required: true },
      { key: 'wetWeight', label: '湿重(吨)', type: 'number', required: true, when: (form) => Boolean(form.__isEdit) && form.status === '待收货' },
      { key: 'dryWeight', label: '干重(吨)', type: 'number', required: true, when: (form) => Boolean(form.__isEdit) && form.status === '待收货' },
      { key: 'moistureContent', label: '水分', type: 'number', required: true, when: (form) => Boolean(form.__isEdit) && form.status === '待收货' },
    ],
    onFormChange(form, key) {
      if (key === 'stackCode') form.cells = ''
    },
    canEdit: (row) => row.status === '暂存码头' || row.status === '待收货',
    showDetail: (row) => row.status === '已入库' || row.status === '混成品',
    detail: (row) => [{
      title: '本票单证',
      fields: [
        { label: '报关单号', value: text(row.customsNo) },
        { label: '核注清单', value: text(row.checklistNo) },
        { label: '提单号', value: text(row.blNo) },
        { label: '预定堆位', value: text(row.stackCode) },
        { label: '存放格子', value: text(row.cells) },
        { label: '金额', value: text(row.amount) },
      ],
    }],
    list: inboundApi.list,
    create: inboundApi.create,
    update: inboundApi.update,
  },
  inventory: {
    key: 'inventory',
    filters: [
      { key: 'timeMode', label: '时间', type: 'select', options: [{ label: '不限', value: '' }, { label: '本月', value: 'month' }, { label: '自定义', value: 'range' }] },
      { key: 'from', label: '开始', type: 'date', when: (form) => form.timeMode === 'range' },
      { key: 'to', label: '结束', type: 'date', when: (form) => form.timeMode === 'range' },
      { key: 'consignor', label: '委托方', type: 'select', optionsFrom: 'consignors' },
      { key: 'warehouse', label: '仓库', type: 'select', optionsFrom: 'warehouses' },
      { key: 'areaLabel', label: '片区标识', type: 'select', dict: 'wms_area_identification' },
      { key: 'cargoType', label: '货物类型', type: 'select', options: ['达标矿', '报备矿', '混成品'] },
      { key: 'status', label: '状态', type: 'select', options: ['在库', '已出库'] },
      { key: 'keyword', label: '批次/堆位' },
    ],
    columns: [
      { prop: 'batchNo', label: '批次号', minWidth: 170 },
      { prop: 'batchKind', label: '批次身份', width: 120 },
      { prop: 'consignor', label: '委托方', width: 110 },
      { prop: 'material', label: '物料', width: 100 },
      { prop: 'cargoType', label: '货物类型', width: 100 },
      { prop: 'warehouse', label: '仓库', width: 110 },
      { prop: 'stackText', label: '堆位', width: 110 },
      { prop: 'areaLabel', label: '片区', width: 100 },
      { prop: 'wet', label: '湿吨', width: 80 },
      { prop: 'dry', label: '干吨', width: 80 },
      { prop: 'originCountry', label: '原产国', width: 90 },
      { prop: 'status', label: '状态', width: 90, tag: true },
    ],
    showDetail: true,
    async detail(row) {
      const res = await inventoryApi.detail(String(row.batchNo))
      const data = res.success ? res.data : row
      const qualities = ['cu', 'ag', 'au', 'as', 'pb', 'cd', 'f', 'hg']
      return [
        {
          title: '本票品质',
          fields: qualities.map((key) => ({ label: key.toUpperCase(), value: text(data[key]) })),
        },
        {
          title: '单证与去向',
          fields: [
            { label: '批次身份', value: text(data.batchKind) },
            { label: '原产国', value: text(data.originCountry) },
            { label: '堆位', value: text(data.stackText) },
          ],
          table: {
            columns: [
              { prop: 'prodBatch', label: '成品批次', minWidth: 140 },
              { prop: 'output', label: '产量', width: 90 },
              { prop: 'stock', label: '库存', width: 90 },
              { prop: 'outbound', label: '出库', width: 90 },
            ],
            rows: (data.products as Record<string, unknown>[]) || [],
          },
        },
        {
          title: '重量台账',
          table: {
            columns: [
              { prop: 'time', label: '时间', minWidth: 150 },
              { prop: 'action', label: '业务', width: 100 },
              { prop: 'wet', label: '湿吨', width: 80 },
              { prop: 'dry', label: '干吨', width: 80 },
              { prop: 'stack', label: '堆位', width: 100 },
              { prop: 'consignee', label: '流向企业', minWidth: 120 },
            ],
            rows: (data.ledger as Record<string, unknown>[]) || [],
          },
        },
      ]
    },
    list: inventoryApi.list,
  },
  stocktake: {
    key: 'stocktake',
    createLabel: '新建盘点',
    filters: [],
    columns: [
      { prop: 'id', label: '盘点单号', minWidth: 160 },
      { prop: 'operator', label: '盘点人', width: 110 },
      { prop: 'time', label: '盘点日期', minWidth: 140 },
      { prop: 'attachment', label: '附件', minWidth: 180 },
    ],
    form: [
      { key: 'date', label: '盘点日期', type: 'date' },
      { key: 'person', label: '盘点人' },
      { key: 'attachment', label: '附件', type: 'file', required: true, span: 24 },
    ],
    list: stocktakeApi.list,
    create: stocktakeApi.create,
    exportRows: stocktakeApi.exportRows,
  },
  outbound: {
    key: 'outbound',
    createLabel: '新建出库',
    filters: [
      { key: 'from', label: '开始日期', type: 'date' },
      { key: 'to', label: '结束日期', type: 'date' },
      { key: 'status', label: '状态', type: 'select', options: ['待审核', '已审核'] },
    ],
    columns: [
      { prop: 'time', label: '出库时间', minWidth: 150 },
      { prop: 'customsNo', label: '报关单号', minWidth: 170 },
      { prop: 'checklistNo', label: '核注清单', minWidth: 120 },
      { prop: 'batchNo', label: '批次', minWidth: 140 },
      { prop: 'consignee', label: '流向企业', width: 120 },
      { prop: 'consumer', label: '消费使用单位', minWidth: 130 },
      { prop: 'wet', label: '重量', width: 90 },
      { prop: 'amount', label: '报关单金额', width: 120 },
      { prop: 'status', label: '状态', width: 100, tag: true },
    ],
    form: [
      { key: 'batchNo', label: '库存批次' },
      { key: 'customsNo', label: '报关单号', required: true },
      { key: 'checklistNo', label: '核注清单号', required: true },
      { key: 'consignee', label: '流向企业', required: true },
      { key: 'consumer', label: '消费使用单位', required: true },
      { key: 'wet', label: '重量', type: 'number', required: true },
      { key: 'amount', label: '报关单金额', type: 'number', required: true },
      { key: 'time', label: '出库时间', type: 'datetime', required: true },
      { key: 'remark', label: '备注', type: 'textarea', span: 24 },
    ],
    list: outboundApi.list,
    create: outboundApi.create,
    update: outboundApi.update,
    actions: [{
      label: '审核',
      when: (row) => row.status === '待审核',
      confirm: '确认审核通过该出库单？',
      request: (row) => outboundApi.approve(String(row.id)),
    }],
  },
  production: {
    key: 'production',
    createLabel: '登记投料',
    filters: [
      { key: 'consignor', label: '委托方', type: 'select', optionsFrom: 'consignors' },
      { key: 'from', label: '开始日期', type: 'date' },
      { key: 'to', label: '结束日期', type: 'date' },
    ],
    columns: [
      { prop: 'time', label: '时间', minWidth: 150 },
      { prop: 'prodBatch', label: '生产批次号', minWidth: 140 },
      { prop: 'consignor', label: '委托方', width: 110 },
      { prop: 'cargoType', label: '矿物', width: 100 },
      { prop: 'customsNos', label: '报关单号', minWidth: 220 },
      { prop: 'outCustomsNo', label: '出库报关单号', minWidth: 150 },
      { prop: 'process', label: '工序', width: 90 },
      { prop: 'wet', label: '干吨', width: 90 },
      { prop: 'stackCode', label: '堆位', width: 100 },
      { prop: 'stage', label: '状态', width: 90, tag: true },
    ],
    form: [
      { key: 'prodBatch', label: '生产批次号', required: true },
      { key: 'consignor', label: '委托方', type: 'select', optionsFrom: 'consignors', required: true },
      { key: 'cargoType', label: '矿物', type: 'select', options: ['达标矿', '报备矿'], required: true },
      { key: 'customsNos', label: '报关单号', required: true, span: 24, placeholder: '多个用顿号分隔' },
      { key: 'outCustomsNo', label: '出库报关单号' },
      { key: 'wet', label: '投料干吨', type: 'number', required: true },
      { key: 'process', label: '工序', type: 'select', options: ['混矿', '筛分'], required: true },
      { key: 'time', label: '时间', type: 'datetime', required: true },
      { key: 'operator', label: '操作人', required: true },
      { key: 'exception', label: '异常说明', type: 'textarea', span: 24 },
      { key: 'material', label: '物料' },
      { key: 'voyage', label: '船名/航次' },
      { key: 'blNo', label: '提单号' },
      { key: 'originCountry', label: '来源国家' },
    ],
    showDetail: true,
    detail: (row) => [{
      title: '批次详情',
      fields: [
        { label: '物料', value: text(row.material) },
        { label: '船名/航次', value: text(row.voyage) },
        { label: '提单号', value: text(row.blNo) },
        { label: '来源国家', value: text(row.originCountry) },
        { label: '挂接报关单', value: text(row.customsNos) },
        { label: '出库报关单号', value: text(row.outCustomsNo) },
        { label: '堆位', value: text(row.stackCode) },
        { label: '操作人', value: text(row.operator) },
        { label: '异常说明', value: text(row.exception) },
      ],
    }],
    list: productionApi.list,
    create: productionApi.create,
  },
  customs: {
    key: 'customs',
    filters: [{ key: 'status', label: '结果', type: 'select', options: ['一致', '有差异'] }],
    columns: [
      { prop: 'book', label: '账册', width: 140 },
      { prop: 'item', label: '项目', width: 120 },
      { prop: 'bookWet', label: '账册湿吨', width: 120 },
      { prop: 'stockWet', label: '库存湿吨', width: 120 },
      { prop: 'diff', label: '差异', width: 100 },
      { prop: 'status', label: '状态', width: 100, tag: true },
    ],
    showDetail: true,
    async detail(row) {
      const res = await customsApi.details(String(row.id))
      return [{
        title: '差异穿透',
        table: {
          columns: [
            { prop: 'checklistNo', label: '核注清单', minWidth: 120 },
            { prop: 'customsNo', label: '报关单号', minWidth: 160 },
            { prop: 'prodBatch', label: '生产批次号', minWidth: 140 },
            { prop: 'bookWet', label: '账册', width: 90 },
            { prop: 'stockWet', label: '库存', width: 90 },
            { prop: 'diff', label: '差异', width: 90 },
          ],
          rows: res.success ? res.data : [],
        },
      }]
    },
    list: customsApi.list,
    toolbar: [
      { label: '联网申报（预留）', run: () => customsApi.declare() },
      { label: '账册核销（预留）', run: () => customsApi.writeOff() },
    ],
  },
  ocr: {
    key: 'ocr',
    createLabel: '发起识别',
    filters: [{ key: 'docType', label: '单据', type: 'select', options: ['入库报关单', '出库报关单', '提单', '品质单', '重量单'] }],
    columns: [
      { prop: 'time', label: '时间', minWidth: 150 },
      { prop: 'docType', label: '单据类型', width: 120 },
      { prop: 'fileName', label: '文件', minWidth: 160 },
      { prop: 'customsNo', label: '报关单号', minWidth: 170 },
      { prop: 'checklistNo', label: '核注清单', width: 120 },
      { prop: 'consignee', label: '流向企业', width: 120 },
      { prop: 'confidence', label: '置信度', width: 90 },
      { prop: 'status', label: '状态', width: 100, tag: true },
    ],
    form: [
      { key: 'docType', label: '单据类型', type: 'select', options: ['入库报关单', '出库报关单', '提单', '品质单', '重量单'], required: true },
      { key: 'fileName', label: '文件名', type: 'file', required: true },
      { key: 'customsNo', label: '报关单号' },
      { key: 'checklistNo', label: '核注清单号' },
      { key: 'consignee', label: '流向企业' },
    ],
    list: ocrApi.list,
    create: ocrApi.recognize,
    update: ocrApi.update,
  },
  audit: {
    key: 'audit',
    filters: [
      { key: 'operator', label: '操作人', placeholder: '姓名/账号' },
      { key: 'module', label: '模块', type: 'select', options: ['入库', '出库', '移库', '生产', '堆位', '关务', '基础数据', '权限'] },
      { key: 'bizNo', label: '业务单号', placeholder: '如 WO- / JG- / YK-' },
      { key: 'customsNo', label: '报关单号', placeholder: '如 BG20260728041' },
      { key: 'prodBatch', label: '生产批次', placeholder: '如 FL-20260803' },
      { key: 'customsOnly', label: '仅关务', type: 'select', options: ['是'] },
      { key: 'from', label: '开始日期', type: 'date' },
      { key: 'to', label: '结束日期', type: 'date' },
    ],
    columns: [
      { prop: 'time', label: '时间', minWidth: 150 },
      { prop: 'operator', label: '操作人', width: 110 },
      { prop: 'module', label: '模块', width: 100 },
      { prop: 'action', label: '业务类型', width: 130 },
      { prop: 'bizNo', label: '业务单号', minWidth: 150 },
      { prop: 'content', label: '操作内容', minWidth: 220 },
      { prop: 'detail', label: '留痕详情', minWidth: 220 },
    ],
    showDetail: true,
    detail: (row) => [{
      title: '操作审计详情',
      fields: [
        { label: '操作人 / 账号类型', value: `${text(row.operator)} / ${text(row.accountType)}` },
        { label: '操作时间 / 来源地址', value: `${text(row.time)} / ${text(row.ip)}` },
        { label: '模块 / 关联单号', value: `${text(row.module)} / ${text(row.bizNo)}` },
        { label: '操作结果', value: text(row.result) },
        { label: '修改前', value: text(row.before) },
        { label: '修改后', value: text(row.after) },
      ],
    }],
    list: auditApi.list,
  },
}

export function getSchema(name: string) {
  return schemas[name]
}
