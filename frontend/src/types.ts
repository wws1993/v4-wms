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
  type?: 'text' | 'number' | 'select' | 'date' | 'datetime' | 'textarea' | 'multi' | 'file'
  required?: boolean
  options?: Array<string | { label: string; value: string }> | ((form: Record<string, unknown>) => Array<string | { label: string; value: string }>)
  when?: (form: Record<string, unknown>) => boolean
  disabled?: boolean | ((form: Record<string, unknown>, isEdit: boolean) => boolean)
  placeholder?: string
  span?: number
}

export interface ColumnSchema {
  prop: string
  label: string
  width?: number
  minWidth?: number
  tag?: boolean
  usage?: boolean
}

export interface DetailBlock {
  title: string
  fields?: { label: string; value: string }[]
  table?: { columns: ColumnSchema[]; rows: Record<string, unknown>[] }
}

export interface RowAction {
  label: string
  when?: (row: Record<string, unknown>) => boolean
  confirm?: string
  prompt?: { title: string; message: string; key: string }
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
  list: (query: Record<string, unknown>) => Promise<ApiResult<PageResult>>
  create?: (body: Record<string, unknown>) => Promise<ApiResult>
  update?: (id: string, body: Record<string, unknown>) => Promise<ApiResult>
  detail?: (row: Record<string, unknown>) => DetailBlock[] | Promise<DetailBlock[]>
  canEdit?: (row: Record<string, unknown>) => boolean
  showDetail?: boolean | ((row: Record<string, unknown>) => boolean)
  actions?: RowAction[]
  exportRows?: () => Promise<ApiResult<{ filename: string; content: string }>>
  monthExport?: (month: string) => Promise<ApiResult<{ filename: string; content: string }>>
  onFormChange?: (form: Record<string, unknown>, key: string) => void
  assist?: { label: string; fill: () => Record<string, unknown> }
  toolbar?: { label: string; run: () => Promise<ApiResult> | void }[]
  createLabel?: string
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
}

export interface FloorPlan {
  id: string
  gridCols: number
  gridRows: number
  items: PlanItem[]
}
