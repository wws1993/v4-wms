import { pagesFor } from '@/nav'
import type { RoleKey } from '@/types'
import { defaultPlan } from '../plan/model'
import { seedLedgerTickets } from './ledger'

export interface Row {
  id: string
  [key: string]: unknown
}

function lot(partial: Row): Row {
  return partial
}

export const db = {
  users: [
    { id: 'u1', username: 'admin', password: 'admin123', name: '系统管理员', roleKey: 'admin' as RoleKey, roleName: '系统管理员', phone: '13800000001', status: '启用' },
    { id: 'u2', username: 'warehouse', password: 'wh123', name: '张仓管', roleKey: 'warehouse' as RoleKey, roleName: '仓管员', phone: '13800000002', status: '启用' },
    { id: 'u3', username: 'customs', password: 'cus123', name: '李关务', roleKey: 'customs' as RoleKey, roleName: '关务员', phone: '13800000003', status: '启用' },
  ],
  rolePerms: {
    admin: pagesFor('admin'),
    warehouse: pagesFor('warehouse'),
    customs: pagesFor('customs'),
  } as Record<RoleKey, string[]>,
  params: {
    capacityWarn: 70,
    ageWarn: 90,
    dockDays: 7,
    filingUsageWarn: 80,
    qualities: 'Cu、Ag、Au、As、Pb、Cd、F、Hg',
    qualityItems: [
      { name: '铜', symbol: 'Cu', harmful: false, taxable: true },
      { name: '银', symbol: 'Ag', harmful: false, taxable: true },
      { name: '金', symbol: 'Au', harmful: false, taxable: true },
      { name: '砷', symbol: 'As', harmful: true, taxable: false },
      { name: '铅', symbol: 'Pb', harmful: true, taxable: false },
      { name: '镉', symbol: 'Cd', harmful: true, taxable: false },
      { name: '氟', symbol: 'F', harmful: true, taxable: false },
      { name: '汞', symbol: 'Hg', harmful: true, taxable: false },
    ],
  },
  warehouses: [
    { id: 'wh1', code: '1仓', capacity: 30000, area: 2400, stackCount: 4, used: 18600, rate: 62, status: '启用' },
    { id: 'wh2', code: '2仓', capacity: 28000, area: 2200, stackCount: 4, used: 11480, rate: 41, status: '启用' },
    { id: 'wh4', code: '4仓', capacity: 32000, area: 2600, stackCount: 6, used: 21760, rate: 68, status: '启用' },
    { id: 'wh5', code: '5仓', capacity: 26000, area: 2000, stackCount: 4, used: 9360, rate: 36, status: '启用' },
    { id: 'wh6', code: '6仓', capacity: 24000, area: 1800, stackCount: 4, used: 5280, rate: 22, status: '启用' },
    { id: 'whd', code: '码头仓库', capacity: 8000, area: 1200, stackCount: 2, used: 6080, rate: 76, status: '启用' },
  ] as Row[],
  stacks: [
    { id: 's1', code: '1#A1', warehouse: '1仓', warehouseId: 'wh1', areaLabel: '原料区', grid: '4×3', capacity: 8000, status: '启用' },
    { id: 's2', code: '1#A2', warehouse: '1仓', warehouseId: 'wh1', areaLabel: '原料区', grid: '4×3', capacity: 8000, status: '启用' },
    { id: 's3', code: '2#A1', warehouse: '2仓', warehouseId: 'wh2', areaLabel: '原料区', grid: '3×3', capacity: 7000, status: '启用' },
    { id: 's4', code: '4#A1', warehouse: '4仓', warehouseId: 'wh4', areaLabel: '待检区', grid: '4×2', capacity: 6000, status: '启用' },
    { id: 's5', code: '4#B1', warehouse: '4仓', warehouseId: 'wh4', areaLabel: '原料区', grid: '4×2', capacity: 6000, status: '启用' },
    { id: 's6', code: '5#A1', warehouse: '5仓', warehouseId: 'wh5', areaLabel: '成品区', grid: '3×2', capacity: 5000, status: '启用' },
    { id: 's7', code: '6#A1', warehouse: '6仓', warehouseId: 'wh6', areaLabel: '原料区', grid: '3×2', capacity: 5000, status: '启用' },
    { id: 's8', code: '码头#A1', warehouse: '码头仓库', warehouseId: 'whd', areaLabel: '原料区', grid: '2×2', capacity: 4000, status: '启用' },
  ] as Row[],
  materials: [
    { id: 'm1', code: 'CU-RAW-01', name: '铜精矿', cargoType: '达标矿', kind: '原料', source: '' },
    { id: 'm2', code: 'CU-RAW-02', name: '铜精矿（报备）', cargoType: '报备矿', kind: '原料', source: '智利精矿' },
    { id: 'm3', code: 'CU-FG-01', name: '铜精矿混成品', cargoType: '混成品', kind: '成品', source: '' },
  ] as Row[],
  filings: [
    { id: 'f1', code: 'JG4-2025-KY02', source: '澳洲精矿', originCountry: '澳大利亚', qty: 10000, usedQty: 8200, remain: 1800, usage: 82, status: '即将用尽', filingDate: '2025-01-15', prodBatches: '—', attachment: '' },
    { id: 'f2', code: 'JG4-2024-KY01', source: '澳洲精矿', originCountry: '澳大利亚', qty: 8000, usedQty: 8000, remain: 0, usage: 100, status: '已用尽', filingDate: '2024-06-01', prodBatches: '—', attachment: '' },
    { id: 'f3', code: 'JG-2023-KY04', source: '智利精矿', originCountry: '智利', qty: 30000, usedQty: 19637.76, remain: 10362.24, usage: 65.46, status: '有效', filingDate: '2023-03-20', prodBatches: 'FL-20260803', attachment: '智利精矿备案说明.txt' },
    { id: 'f4', code: 'JG-2022-KY03', source: '智利精矿', originCountry: '智利', qty: 20000, usedQty: 20000, remain: 0, usage: 100, status: '已用尽', filingDate: '2022-08-10', prodBatches: '—', attachment: '' },
  ] as Row[],
  filingLots: {
    'JG-2023-KY04': [
      { customsNo: 'BG20260801022', prodBatch: '—', consignor: '广西金川', material: '原料物料-B', cargoType: '报备矿', wet: 360, dry: 330, stack: '1#A2', inAt: '2026-07-28 09:00', status: '在库' },
      { customsNo: 'BG20260725088', prodBatch: '—', consignor: '五矿有色', material: '原料物料-D', cargoType: '报备矿', wet: 2100, dry: 1920, stack: '码头#A1', inAt: '2026-07-25 08:00', status: '在库' },
      { customsNo: 'BG20260512009', prodBatch: 'FL-20260803', consignor: '广西金川', material: '原料物料-B', cargoType: '报备矿', wet: 8200, dry: 7380, stack: '1#A2', inAt: '2026-05-12 10:00', status: '已投料' },
      { customsNo: 'BG20250418031', prodBatch: '—', consignor: '广西南国', material: '原料物料-B', cargoType: '报备矿', wet: 11000, dry: 10007.76, stack: '2#B1', inAt: '2025-04-18 14:00', status: '已核销' },
    ],
    'JG4-2025-KY02': [
      { customsNo: 'BG20260428016', prodBatch: '—', consignor: '五矿有色', material: '原料物料-C', cargoType: '报备矿', wet: 280, dry: 252, stack: '5#小A', inAt: '2026-04-28 08:00', status: '在库' },
      { customsNo: 'BG20250120014', prodBatch: '—', consignor: '五矿有色', material: '原料物料-C', cargoType: '报备矿', wet: 8800, dry: 7948, stack: '5#小A', inAt: '2025-01-20 11:00', status: '已核销' },
    ],
    'JG4-2024-KY01': [
      { customsNo: 'BG20240601008', prodBatch: '—', consignor: '五矿有色', material: '原料物料-C', cargoType: '报备矿', wet: 8900, dry: 8000, stack: '5#大A前', inAt: '2024-06-08 09:00', status: '已核销' },
    ],
    'JG-2022-KY03': [
      { customsNo: 'BG20220810044', prodBatch: '—', consignor: '广西南国', material: '原料物料-B', cargoType: '报备矿', wet: 22200, dry: 20000, stack: '2#A2', inAt: '2022-08-16 15:00', status: '已核销' },
    ],
  } as Record<string, Record<string, unknown>[]>,
  partners: [
    { id: 'p1', code: 'WT-01', name: '五矿有色', role: '委托方', phone: '0771-1000001', status: '启用', source: '手工维护' },
    { id: 'p2', code: 'WT-02', name: '广西金川', role: '委托方', phone: '0771-1000002', status: '启用', source: '手工维护' },
    { id: 'p3', code: 'WT-03', name: '广西南国', role: '委托方', phone: '0771-1000003', status: '启用', source: '手工维护' },
    { id: 'p4', code: 'WL-01', name: '北部湾物流', role: '物流账册主体', phone: '0771-2000001', status: '启用', source: '手工维护' },
    { id: 'p5', code: 'LX-01', name: '华南冶炼', role: '流向企业', phone: '', status: '启用', source: '出库识别' },
  ] as Row[],
  ledgerTickets: seedLedgerTickets(),
  books: [
    { id: 'b1', code: 'ZC-2026-01', name: '2026年铜精矿账册', operator: '广西丰联铜业', value: 186000000, customsNo: '5301202600001234', status: '在用', prevBook: 'ZC-2025-12', warnDate: '2026-06-30' },
    { id: 'b2', code: 'ZC-2025-12', name: '2025年铜精矿账册', operator: '广西丰联铜业', value: 92000000, customsNo: '5301202500007788', status: '停用', prevBook: '', warnDate: '2026-06-30' },
  ] as Row[],
  bookLots: {
    'ZC-2026-01': [
      { direction: '入库', customsNo: '5301202600001234', blNo: 'BL86021', wet: 820, dry: 740, consignor: '五矿有色', time: '2026-08-01 09:00' },
      { direction: '出库', customsNo: '5301202600008891', blNo: 'BL86088', wet: 95, dry: 88, consignor: '华南冶炼', time: '2026-08-03 19:00' },
    ],
    'ZC-2025-12': [
      { direction: '入库', customsNo: '5301202500007788', blNo: 'BL24011', wet: 1200, dry: 1080, consignor: '广西南国', time: '2025-12-18 10:00' },
    ],
  } as Record<string, Record<string, unknown>[]>,
  inbound: [
    { id: 'in1', shipName: '丰联海', voyage: 'V202608', blNo: 'BL86021', customsNo: '5301202600001234', checklistNo: 'QD86021', amount: 2360000, oreType: '铜精矿', shipMode: '散货', containerCount: 0, consignor: '五矿有色', stackCode: '1#A1', cells: '1-1,1-2', status: '已入库', time: '2026-08-01 09:00', as: '0.18', pb: '0.04', cd: '0.002', f: '0.03', hg: '0.001' },
    { id: 'in2', shipName: '金川轮', voyage: 'V202608', blNo: 'BL86032', customsNo: '5301202600002234', checklistNo: 'QD86032', amount: 1980000, oreType: '铜精矿', shipMode: '集装箱', containerCount: 18, consignor: '广西金川', stackCode: '2#A1', cells: '2-1', status: '已入库', time: '2026-08-02 11:00', as: '0.21', pb: '0.05', cd: '0.003', f: '0.04', hg: '0.001' },
    { id: 'in3', shipName: '南国轮', voyage: 'V202609', blNo: 'BL86040', customsNo: '5301202600004234', checklistNo: 'QD86040', amount: 860000, oreType: '铜精矿', shipMode: '散货', containerCount: 0, consignor: '广西南国', stackCode: '码头#A1', cells: '1-1', status: '暂存码头', time: '2026-09-10 08:00', as: '', pb: '', cd: '', f: '', hg: '' },
    { id: 'in4', shipName: '丰联海', voyage: 'V202609', blNo: 'BL86055', customsNo: '5301202600006234', checklistNo: 'QD86055', amount: 1420000, oreType: '铜精矿', shipMode: '集装箱', containerCount: 12, consignor: '五矿有色', stackCode: '6#A1', cells: '', status: '待收货', time: '2026-09-20 15:00', as: '', pb: '', cd: '', f: '', hg: '' },
  ] as Row[],
  transfers: [
    { id: 'mv1', orderNo: 'YK-20260802-001', scene: '整票移位', weight: 740, status: '已完成', consignor: '五矿有色', customsNo: '5301202600001234', prodBatch: '', material: '铜精矿', shipName: '丰联海', containerCount: 0, fromStack: '1#A2', toStack: '1#A1', timeFrom: '2026-08-02 08:00', timeTo: '2026-08-02 11:00' },
    { id: 'mv2', orderNo: 'YK-20260802-002', scene: '整票移位', weight: 550, status: '已完成', consignor: '广西金川', customsNo: '5301202600002234', prodBatch: '', material: '铜精矿', shipName: '金川轮', containerCount: 18, fromStack: '码头#A1', toStack: '2#A1', timeFrom: '2026-08-02 13:00', timeTo: '2026-08-02 16:00' },
  ] as Row[],
  inventory: [
    lot({ id: 'iv1', batchNo: '5301202600001234', batchKind: '报关单号', consignor: '五矿有色', material: '铜精矿', cargoType: '达标矿', warehouse: '1仓', stackText: '1#A1', areaLabel: '原料区', wet: 820, dry: 740, originCountry: '智利', cu: '22.4', ag: '86', au: '0.6', as: '0.18', pb: '0.04', cd: '0.002', f: '0.03', hg: '0.001', status: '在库', inDate: '2026-08-01', owner: '五矿有色' }),
    lot({ id: 'iv2', batchNo: '5301202600002234', batchKind: '报关单号', consignor: '广西金川', material: '铜精矿', cargoType: '报备矿', warehouse: '2仓', stackText: '2#A1', areaLabel: '原料区', wet: 860, dry: 780, originCountry: '智利', cu: '21.8', ag: '74', au: '0.4', as: '0.21', pb: '0.05', cd: '0.003', f: '0.04', hg: '0.001', status: '在库', inDate: '2026-05-01', owner: '广西金川' }),
    lot({ id: 'iv3', batchNo: '5301202600003234', batchKind: '报关单号', consignor: '广西南国', material: '铜精矿', cargoType: '达标矿', warehouse: '4仓', stackText: '4#B1', areaLabel: '原料区', wet: 540, dry: 490, originCountry: '秘鲁', cu: '24.1', ag: '92', au: '0.8', as: '0.12', pb: '0.03', cd: '0.001', f: '0.02', hg: '0.001', status: '在库', inDate: '2026-08-06', owner: '广西南国' }),
    lot({ id: 'iv4', batchNo: 'FL-20260803', batchKind: '生产批次号', consignor: '五矿有色', material: '铜精矿', cargoType: '混成品', warehouse: '4仓', stackText: '4#A1', areaLabel: '待检区', wet: 210, dry: 180, originCountry: '—', cu: '23.2', ag: '80', au: '0.5', as: '0.16', pb: '0.04', cd: '0.002', f: '0.03', hg: '0.001', status: '在库', inDate: '2026-08-03', owner: '五矿有色' }),
    lot({ id: 'iv5', batchNo: 'FL-20260718', batchKind: '生产批次号', consignor: '广西金川', material: '铜精矿', cargoType: '混成品', warehouse: '5仓', stackText: '5#A1', areaLabel: '成品区', wet: 160, dry: 140, originCountry: '—', cu: '23.6', ag: '77', au: '0.5', as: '0.15', pb: '0.03', cd: '0.002', f: '0.02', hg: '0.001', status: '在库', inDate: '2026-07-20', owner: '广西金川' }),
    lot({ id: 'iv6', batchNo: '5301202600004234', batchKind: '报关单号', consignor: '广西南国', material: '铜精矿', cargoType: '达标矿', warehouse: '码头仓库', stackText: '码头#A1', areaLabel: '原料区', wet: 610, dry: 550, originCountry: '智利', cu: '20.6', ag: '61', au: '0.3', as: '0.19', pb: '0.06', cd: '0.002', f: '0.03', hg: '0.001', status: '在库', inDate: '2026-09-10', owner: '广西南国' }),
    lot({ id: 'iv7', batchNo: '5301202600008891', batchKind: '报关单号', consignor: '五矿有色', material: '铜精矿', cargoType: '混成品', warehouse: '5仓', stackText: '—', areaLabel: '成品区', wet: 0, dry: 0, originCountry: '—', cu: '23.0', ag: '79', au: '0.5', as: '0.14', pb: '0.03', cd: '0.001', f: '0.02', hg: '0.001', status: '已出库', inDate: '2026-07-02', owner: '五矿有色' }),
  ] as Row[],
  ledgers: {
    '5301202600001234': [
      { time: '2026-08-01 09:00', action: '入库', wet: 820, dry: 740, stack: '1#A1', consignee: '' },
      { time: '2026-08-02 10:00', action: '移库', wet: 820, dry: 740, stack: '1#A1', consignee: '' },
    ],
    'FL-20260803': [
      { time: '2026-08-03 17:00', action: '完工入库', wet: 210, dry: 180, stack: '4#A1', consignee: '' },
    ],
    '5301202600008891': [
      { time: '2026-08-03 19:00', action: '出库', wet: 95, dry: 88, stack: '5#A1', consignee: '华南冶炼' },
    ],
  } as Record<string, Record<string, unknown>[]>,
  products: {
    '5301202600001234': [{ prodBatch: 'FL-20260803', output: 180, stock: 180, outbound: 0 }],
    '5301202600002234': [{ prodBatch: 'FL-20260803', output: 60, stock: 60, outbound: 0 }],
  } as Record<string, Record<string, unknown>[]>,
  stocktakes: [
    { id: 'st1', month: '2026-08', warehouses: '1仓、4仓', stacks: '1#A1、4#A1', attachment: '盘点照片.zip', operator: '张仓管', time: '2026-08-28 16:00', remark: '现场归档，不回写库存' },
    { id: 'st2', month: '2026-09', warehouses: '码头仓库', stacks: '码头#A1', attachment: '码头盘点.xlsx', operator: '张仓管', time: '2026-09-18 11:00', remark: '' },
  ] as Row[],
  production: [
    {
      id: 'JG-20260803-02', docType: '加工过程', prodBatch: 'FL-20260803', consignor: '广西金川',
      workOrder: 'WO-20260803-01', process: '混矿筛分', time: '2026-08-03 08:00', timeTo: '2026-08-03 12:00',
      remark: '生产批次 FL-20260803 混矿，挂接 3 票报关单', outCustomsNo: '', feedLines: [],
    },
    {
      id: 'TL-20260803-004', docType: '投料出库', prodBatch: 'FL-20260803', consignor: '广西金川',
      workOrder: 'WO-20260803-01', outCustomsNo: 'BGCKTL2026080301', time: '2026-08-03 07:30',
      feedLines: [
        { customsNo: '5301202600001234', consignor: '五矿有色', cargoType: '达标矿', material: '铜精矿', voyage: '丰联海 / V202608', blNo: 'BL86021', originCountry: '智利', wet: 820, dry: 740, feedDry: 80, stack: '1#A1', areaLabel: '原料区' },
        { customsNo: '5301202600002234', consignor: '广西金川', cargoType: '报备矿', material: '铜精矿', voyage: '金川轮 / V202608', blNo: 'BL86032', originCountry: '智利', wet: 860, dry: 780, feedDry: 70, stack: '2#A1', areaLabel: '原料区' },
        { customsNo: '5301202600003234', consignor: '广西南国', cargoType: '达标矿', material: '铜精矿', voyage: '—', blNo: '—', originCountry: '秘鲁', wet: 540, dry: 490, feedDry: 50, stack: '4#B1', areaLabel: '原料区' },
      ],
    },
    {
      id: 'WG-20260803-01', docType: '完工入库', prodBatch: 'FL-20260803', consignor: '广西金川',
      product: '铜精矿混成品', outputDry: 180, stackCode: '4#A1', areaLabel: '待检区',
      sourceStacks: '1#A1 / 2#A1 / 4#B1', customsNos: '5301202600001234 等 3 票', time: '2026-08-03 14:20', feedLines: [],
    },
    {
      id: 'JG-20260802-01', docType: '加工过程', prodBatch: 'FL-20260802', consignor: '五矿有色',
      workOrder: 'WO-20260802-01', process: '破碎筛分', time: '2026-08-02 09:00', timeTo: '2026-08-02 16:00',
      remark: '', outCustomsNo: '', feedLines: [],
    },
    {
      id: 'TL-20260802-001', docType: '投料出库', prodBatch: 'FL-20260802', consignor: '五矿有色',
      workOrder: 'WO-20260802-01', outCustomsNo: 'BGCKTL2026080201', time: '2026-08-02 08:20',
      feedLines: [
        { customsNo: '5301202600004234', consignor: '广西南国', cargoType: '达标矿', material: '铜精矿', voyage: '南国轮 / V202609', blNo: 'BL86040', originCountry: '智利', wet: 610, dry: 550, feedDry: 90, stack: '码头#A1', areaLabel: '原料区' },
      ],
    },
  ] as Row[],
  outbound: [
    { id: 'ob1', orderNo: 'CK-20260803-012', consignor: '广西南国', customsNo: '5301202600008891', checklistNo: 'QD8891', consignee: '华南冶炼', consumer: '华南冶炼', wet: 95, amount: 1280000, currency: 'USD', bondedBook: 'ZC-2026-01', time: '2026-08-03 19:00', finishedAt: '', status: '已审核', remark: '成品出库', batchNo: 'FL-20260718' },
    { id: 'ob2', orderNo: 'CK-20260912-003', consignor: '广西南国', customsNo: '5301202600009901', checklistNo: 'QD9901', consignee: '云铜加工', consumer: '云铜加工', wet: 60, amount: 760000, currency: 'CNY', bondedBook: 'ZC-2026-01', time: '2026-09-12 10:00', finishedAt: '', status: '待审核', remark: '', batchNo: 'FL-20260803' },
  ] as Row[],
  reconciles: [
    { id: 'rc1', book: 'ZC-2026-01', item: '铜精矿', bookWet: 12680, stockWet: 12640, diff: -40, status: '有差异' },
    { id: 'rc2', book: 'ZC-2026-01', item: '混成品', bookWet: 3412, stockWet: 3412, diff: 0, status: '一致' },
  ] as Row[],
  reconcileDetails: {
    rc1: [
      { checklistNo: 'QD86021', customsNo: '5301202600001234', prodBatch: '', bookWet: 820, stockWet: 820, diff: 0 },
      { checklistNo: 'QD8891', customsNo: '5301202600008891', prodBatch: 'FL-20260718', bookWet: 95, stockWet: 55, diff: -40 },
    ],
  } as Record<string, Record<string, unknown>[]>,
  ocrTasks: [
    { id: 'ocr1', docType: '入库报关单', fileName: '报关单-86021.pdf', customsNo: '5301202600001234', checklistNo: 'QD86021', consignee: '', confidence: '96%', status: '已回填', time: '2026-08-01 08:40' },
    { id: 'ocr2', docType: '出库报关单', fileName: '报关单-9901.pdf', customsNo: '5301202600009901', checklistNo: 'QD9901', consignee: '云铜加工', confidence: '91%', status: '待修正', time: '2026-09-12 09:20' },
  ] as Row[],
  audits: [
    { id: 'log1', time: '2026-08-03 17:10', operator: '张仓管', module: '生产/完工', action: '完工入库', bizNo: 'FL-20260803', ip: '10.0.0.12', customsAccount: '否', before: '片区标识：原料区', after: '片区标识：待检区' },
    { id: 'log2', time: '2026-07-20 15:00', operator: '李关务', module: '生产/完工', action: '查验完成', bizNo: 'FL-20260718', ip: '10.0.0.8', customsAccount: '是', before: '片区标识：待检区', after: '片区标识：成品区' },
    { id: 'log3', time: '2026-09-12 09:30', operator: '张仓管', module: '出库管理', action: '修正OCR', bizNo: '5301202600009901', ip: '10.0.0.12', customsAccount: '否', before: '流向企业：空', after: '流向企业：云铜加工' },
  ] as Row[],
  dictTypes: [
    { id: 'dt1', name: '货物类型', type: 'wms_item_category', status: '正常', remark: '', createdAt: '2026-01-01 00:00:00' },
    { id: 'dt2', name: '物料类型', type: 'wms_item_type', status: '正常', remark: '', createdAt: '2026-01-01 00:00:00' },
    { id: 'dt3', name: '片区标识', type: 'wms_area_identification', status: '正常', remark: '', createdAt: '2026-01-01 00:00:00' },
    { id: 'dt4', name: '企业类型', type: 'merchant_type', status: '正常', remark: '', createdAt: '2026-01-01 00:00:00' },
  ] as Row[],
  dictData: [
    { id: 'dd1', type: 'wms_item_category', sort: 1, label: '达标矿', value: '1', isDefault: '是', status: '正常', remark: '', cssClass: '', listClass: '', createdAt: '2026-01-01 00:00:00' },
    { id: 'dd2', type: 'wms_item_category', sort: 2, label: '报备矿', value: '2', isDefault: '否', status: '正常', remark: '', cssClass: '', listClass: '', createdAt: '2026-01-01 00:00:00' },
    { id: 'dd3', type: 'wms_item_category', sort: 3, label: '混成品', value: '3', isDefault: '否', status: '正常', remark: '', cssClass: '', listClass: '', createdAt: '2026-01-01 00:00:00' },
    { id: 'dd4', type: 'wms_item_type', sort: 1, label: '原料', value: '1', isDefault: '是', status: '正常', remark: '', cssClass: '', listClass: '', createdAt: '2026-01-01 00:00:00' },
    { id: 'dd5', type: 'wms_item_type', sort: 2, label: '成品', value: '2', isDefault: '否', status: '正常', remark: '', cssClass: '', listClass: '', createdAt: '2026-01-01 00:00:00' },
    { id: 'dd6', type: 'wms_area_identification', sort: 1, label: '原料区', value: '原料区', isDefault: '否', status: '正常', remark: '', cssClass: '', listClass: '', createdAt: '2026-01-01 00:00:00' },
    { id: 'dd7', type: 'wms_area_identification', sort: 2, label: '待检区', value: '待检区', isDefault: '否', status: '正常', remark: '', cssClass: '', listClass: '', createdAt: '2026-01-01 00:00:00' },
    { id: 'dd8', type: 'wms_area_identification', sort: 3, label: '成品区', value: '成品区', isDefault: '否', status: '正常', remark: '', cssClass: '', listClass: '', createdAt: '2026-01-01 00:00:00' },
    { id: 'dd9', type: 'merchant_type', sort: 1, label: '委托方', value: '1', isDefault: '否', status: '正常', remark: '', cssClass: '', listClass: '', createdAt: '2026-01-01 00:00:00' },
    { id: 'dd10', type: 'merchant_type', sort: 2, label: '物流账册主体', value: '2', isDefault: '否', status: '正常', remark: '', cssClass: '', listClass: '', createdAt: '2026-01-01 00:00:00' },
    { id: 'dd11', type: 'merchant_type', sort: 3, label: '流向企业', value: '3', isDefault: '否', status: '正常', remark: '', cssClass: '', listClass: '', createdAt: '2026-01-01 00:00:00' },
  ] as Row[],
  floorPlan: defaultPlan(),
}

let serial = 0
export function nextId(prefix: string) {
  serial += 1
  return `${prefix}-${Date.now().toString(36)}-${serial.toString(36)}`
}
