import { pagesFor } from '@/nav'
import type { RoleKey } from '@/types'
import { defaultPlan } from '../plan/model'

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
    { id: 's1', code: '1#A1', warehouse: '1仓', areaLabel: '原料区', grid: '4×3', capacity: 8000, status: '启用' },
    { id: 's2', code: '1#A2', warehouse: '1仓', areaLabel: '原料区', grid: '4×3', capacity: 8000, status: '启用' },
    { id: 's3', code: '2#A1', warehouse: '2仓', areaLabel: '原料区', grid: '3×3', capacity: 7000, status: '启用' },
    { id: 's4', code: '4#A1', warehouse: '4仓', areaLabel: '待检区', grid: '4×2', capacity: 6000, status: '启用' },
    { id: 's5', code: '4#B1', warehouse: '4仓', areaLabel: '原料区', grid: '4×2', capacity: 6000, status: '启用' },
    { id: 's6', code: '5#A1', warehouse: '5仓', areaLabel: '成品区', grid: '3×2', capacity: 5000, status: '启用' },
    { id: 's7', code: '6#A1', warehouse: '6仓', areaLabel: '原料区', grid: '3×2', capacity: 5000, status: '启用' },
    { id: 's8', code: '码头#A1', warehouse: '码头仓库', areaLabel: '原料区', grid: '2×2', capacity: 4000, status: '启用' },
  ] as Row[],
  materials: [
    { id: 'm1', code: 'CU-RAW-01', name: '铜精矿', cargoType: '达标矿', kind: '原料', source: '' },
    { id: 'm2', code: 'CU-RAW-02', name: '铜精矿（报备）', cargoType: '报备矿', kind: '原料', source: '智利矿源A' },
    { id: 'm3', code: 'CU-FG-01', name: '铜精矿混成品', cargoType: '混成品', kind: '成品', source: '' },
  ] as Row[],
  filings: [
    { id: 'f1', code: 'BA-2026-018', source: '智利矿源A', originCountry: '智利', qty: 5000, usedQty: 1860, remain: 3140, usage: 37, status: '有效', filingDate: '2026-03-12', prodBatches: 'FL-20260803', attachment: '备案单.pdf' },
    { id: 'f2', code: 'BA-2026-007', source: '秘鲁矿源B', originCountry: '秘鲁', qty: 3000, usedQty: 2460, remain: 540, usage: 82, status: '有效', filingDate: '2026-01-20', prodBatches: 'FL-20260718', attachment: '备案单.pdf' },
  ] as Row[],
  filingLots: {
    'BA-2026-018': [
      { customsNo: '5301202600002234', prodBatch: 'FL-20260803', consignor: '广西金川', wet: 860, dry: 780, stack: '2#A1', status: '在库' },
    ],
    'BA-2026-007': [
      { customsNo: '5301202600005234', prodBatch: 'FL-20260718', consignor: '广西金川', wet: 640, dry: 580, stack: '5#A1', status: '已完工' },
    ],
  } as Record<string, Record<string, unknown>[]>,
  partners: [
    { id: 'p1', code: 'WT-01', name: '五矿有色', role: '委托方', phone: '0771-1000001', status: '启用', source: '手工维护' },
    { id: 'p2', code: 'WT-02', name: '广西金川', role: '委托方', phone: '0771-1000002', status: '启用', source: '手工维护' },
    { id: 'p3', code: 'WT-03', name: '广西南国', role: '委托方', phone: '0771-1000003', status: '启用', source: '手工维护' },
    { id: 'p4', code: 'WL-01', name: '北部湾物流', role: '物流账册主体', phone: '0771-2000001', status: '启用', source: '手工维护' },
    { id: 'p5', code: 'LX-01', name: '华南冶炼', role: '流向企业', phone: '', status: '启用', source: '出库识别' },
  ] as Row[],
  books: [
    { id: 'b1', code: 'ZC-2026-01', name: '2026年铜精矿账册', operator: '广西丰联铜业', value: 186000000, customsNo: '5301202600001234', status: '新账', prevBook: 'ZC-2025-12', warnDate: '2026-06-30' },
    { id: 'b2', code: 'ZC-2025-12', name: '2025年铜精矿账册', operator: '广西丰联铜业', value: 92000000, customsNo: '5301202500007788', status: '旧账', prevBook: '', warnDate: '2026-06-30' },
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
    { id: 'mv1', consignor: '五矿有色', customsNo: '5301202600001234', prodBatch: '', material: '铜精矿', shipName: '丰联海', containerCount: 0, fromStack: '1#A2', toStack: '1#A1', timeFrom: '2026-08-02 08:00', timeTo: '2026-08-02 11:00' },
    { id: 'mv2', consignor: '广西金川', customsNo: '5301202600002234', prodBatch: '', material: '铜精矿', shipName: '金川轮', containerCount: 18, fromStack: '码头#A1', toStack: '2#A1', timeFrom: '2026-08-02 13:00', timeTo: '2026-08-02 16:00' },
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
    { id: 'pr1', prodBatch: 'FL-20260803', consignor: '五矿有色', stage: '待检', customsNos: '5301202600001234、5301202600002234', outCustomsNo: 'CK-FL-20260803', cargoType: '达标矿', wet: 200, time: '2026-08-03 13:00', material: '铜精矿', voyage: '丰联海 / V202608', blNo: 'BL86021', originCountry: '智利', process: '混矿', stackCode: '4#A1' },
    { id: 'pr2', prodBatch: 'FL-20260718', consignor: '广西金川', stage: '成品', customsNos: '5301202600005234', outCustomsNo: 'CK-FL-20260718', cargoType: '报备矿', wet: 140, time: '2026-07-18 09:00', material: '铜精矿', voyage: '金川轮 / V202607', blNo: 'BL77018', originCountry: '智利', process: '筛分', stackCode: '5#A1' },
  ] as Row[],
  outbound: [
    { id: 'ob1', customsNo: '5301202600008891', checklistNo: 'QD8891', consignee: '华南冶炼', consumer: '华南冶炼', wet: 95, amount: 1280000, time: '2026-08-03 19:00', status: '已审核', remark: '', batchNo: 'FL-20260718' },
    { id: 'ob2', customsNo: '5301202600009901', checklistNo: 'QD9901', consignee: '云铜加工', consumer: '云铜加工', wet: 60, amount: 760000, time: '2026-09-12 10:00', status: '待审核', remark: '', batchNo: 'FL-20260803' },
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
  floorPlan: defaultPlan(),
}

export function nextId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}`
}
