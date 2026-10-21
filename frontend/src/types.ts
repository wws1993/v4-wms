export type RoleKey = 'admin' | 'warehouse' | 'customs'

export interface ApiResult<T = unknown> {
  success: boolean
  data: T
  message: string
}

export interface PageResult<T = Record<string, unknown>> {
  list: T[]
  total: number
  page: number
  pageSize: number
}

export interface AuthUser {
  id: string
  username: string
  name: string
  roleKey: RoleKey
  roleName: string
  pages: string[]
}

export interface FieldSchema {
  key: string
  label: string
  type?: 'text' | 'number' | 'select' | 'date' | 'datetime' | 'textarea' | 'multi' | 'file' | 'image' | 'cells' | 'password'
  optionsFrom?: 'stacks' | 'materials' | 'shipping' | 'consignors' | 'warehouses' | 'roles'
  /** 选项来自字典类型，值为字典标签。 */
  dict?: string
  /** 物料下拉排除的矿种类型，如 混成品、达标矿。 */
  excludeCargoTypes?: string[]
  stackKey?: string
  required?: boolean
  options?: Array<string | { label: string; value: string }> | ((form: Record<string, unknown>, labels?: string[]) => Array<string | { label: string; value: string }>)
  when?: (form: Record<string, unknown>) => boolean
  disabled?: boolean | ((form: Record<string, unknown>, isEdit: boolean) => boolean)
  placeholder?: string
  span?: number
  /** 数字输入框右侧单位，如 吨、方。 */
  unit?: string
}

export interface ColumnSchema {
  prop: string
  label: string
  width?: number
  minWidth?: number
  tag?: boolean
  usage?: boolean
  /** 单元格为报关单号，点击打开票货详情。 */
  lot?: boolean
  /** 单元格为图片地址，点击后用图片查看器打开。 */
  image?: boolean
}

export interface DetailBlock {
  title: string
  fields?: { label: string; value: string }[]
  table?: { columns: ColumnSchema[]; rows: Record<string, unknown>[] }
}

export interface ActionDialog {
  title: string
  message?: string
  confirmLabel?: string
  fields: FieldSchema[]
  fill?: (row: Record<string, unknown>) => Record<string, unknown>
}

export interface RowAction {
  label: string
  when?: (row: Record<string, unknown>) => boolean
  confirm?: string
  danger?: boolean
  dialog?: ActionDialog
  inDetail?: boolean
  /** 打开该行详情，不另发请求。 */
  opensDetail?: boolean
  /** 弹出只读说明，例如查看附件名称。 */
  notice?: (row: Record<string, unknown>) => string
  /** 用图片查看器打开该行图片。返回空字符串时提示暂无图片。 */
  image?: (row: Record<string, unknown>) => string
  request?: (row: Record<string, unknown>, extra: Record<string, unknown>) => Promise<ApiResult>
  path?: string
  queryKey?: string
  queryFrom?: string
  pathFrom?: string
}

export interface ModuleSchema {
  key: string
  filters: FieldSchema[]
  columns: ColumnSchema[]
  form?: FieldSchema[]
  formWidth?: number
  labelWidth?: string
  list: (query: Record<string, unknown>) => Promise<ApiResult<PageResult>>
  create?: (body: Record<string, unknown>) => Promise<ApiResult>
  update?: (id: string, body: Record<string, unknown>) => Promise<ApiResult>
  detail?: (row: Record<string, unknown>) => DetailBlock[] | Promise<DetailBlock[]>
  canEdit?: (row: Record<string, unknown>) => boolean
  showDetail?: boolean | ((row: Record<string, unknown>) => boolean)
  detailColumn?: string
  actions?: RowAction[]
  exportRows?: (query?: Record<string, unknown>) => Promise<ApiResult<{ filename: string; content?: string; blob?: Blob }>>
  exportLabel?: string
  importRows?: (file: File) => Promise<ApiResult>
  dialogTitle?: string
  defaults?: () => Record<string, unknown>
  monthExport?: (month: string) => Promise<ApiResult<{ filename: string; content?: string; blob?: Blob }>>
  onFormChange?: (form: Record<string, unknown>, key: string, ctx?: { materials?: Record<string, unknown>[] }) => void
  assist?: { label: string; fill: () => Record<string, unknown> }
  toolbar?: { label: string; run: () => Promise<ApiResult> | void }[]
  createLabel?: string
  note?: string
}

export type PlanType = 'warehouse' | 'idle' | 'office' | 'zone' | 'line' | 'door' | 'stack' | 'road' | 'bush'

export interface PlanItem {
  id: string
  type: PlanType
  name: string
  col: number
  row: number
  cols: number
  rows: number
  color?: string
  /** 对应堆位档案。标为堆位或初始化后写入，保存时用来回写网格。 */
  stackId?: string
  /** 对应仓库档案。 */
  warehouseId?: string
  /** 堆位档案上的原始编码。名称未改时保存沿用，避免把「盛泽区」改成「吴江仓#盛泽区」。 */
  archiveCode?: string
  /** 库容（吨）。仓库和堆位都用。 */
  capacity?: number
  /** 仓库面积（㎡）。 */
  area?: number
  /** 堆位片区标识。 */
  areaLabel?: string
  /** 仓库或堆位档案状态：启用 / 停用。 */
  status?: string
  /** 档案排序。数字越小越靠前。平面图保存时原样带回，避免把排序清空。 */
  orderNum?: number
  /** 标成仓库或堆位后，保存平面图时写入档案。 */
  archive?: boolean
}

export interface FloorPlan {
  id: string
  /** 每一格在屏幕上的像素边长 */
  gridPx: number
  gridCols: number
  gridRows: number
  items: PlanItem[]
  /** 已从图上删掉、等保存时删除的仓库档案。 */
  removedWarehouseIds?: string[]
  /** 已从图上删掉的仓库名称，编号对不上时用来找到档案。 */
  removedWarehouseCodes?: string[]
  /** 已从图上删掉、等保存时删除的堆位档案。 */
  removedStackIds?: string[]
  /** 已从图上删掉的堆位编码，编号对不上时用来找到档案。 */
  removedStackCodes?: string[]
}
