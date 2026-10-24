/**
 * 本文件由 scripts/gen-openapi-typings.ts 自动生成，请勿手动修改。
 * 源：docs/对接文档/广西丰联仓储系统_接口文档.openapi.yaml
 */
export interface WarehouseBo {
  /** 创建者 */
  createBy?: string
  /** 创建时间 */
  createTime?: string
  /** 更新者 */
  updateBy?: string
  /** 更新时间 */
  updateTime?: string
  /** 请求参数 */
  params?: Record<string, unknown>
  /** id */
  id: number
  /** 编号 */
  warehouseCode?: string
  /** 名称 */
  warehouseName?: string
  /** 库容（吨） */
  storageCapacity?: number
  /** 面积（㎡） */
  area?: number
  /** 状态 */
  status?: string
  /** 备注 */
  remark?: string
  /** 排序 */
  orderNum?: number
}

/** 响应信息主体 */
export interface RVoid {
  code?: number
  msg?: string
  data?: unknown
}

/** 品质参数配置 */
export interface SystemElementBo {
  /** 编号 */
  elementCode: string
  /** 名称 */
  elementName: string
  /** 是否必填(0 否 1 是) */
  isRequired: string
  /** 是否有害元素(0 否 1 是) */
  isHarmful: string
  /** 是否报税元素(0 否 1 是) */
  isTaxDeclared: string
}

/** 出库单详情业务对象 wms_shipment_order_detail */
export interface ShipmentOrderDetailBo {
  /** 创建者 */
  createBy?: string
  /** 创建时间 */
  createTime?: string
  /** 更新者 */
  updateBy?: string
  /** 更新时间 */
  updateTime?: string
  /** 请求参数 */
  params?: Record<string, unknown>
  id: number
  /** 出库单 */
  shipmentOrderId: number
  /** 规格id */
  skuId: number
  /** 数量 */
  quantity: number
  /** 金额 */
  amount: number
  /** 所属仓库 */
  warehouseId: number
  /** 所属库区 */
  areaId: number
  /** 批号 */
  batchNo?: string
  /** 生产日期 */
  productionDate?: string
  /** 过期时间 */
  expirationDate?: string
  /** 入库记录id */
  inventoryDetailId: number
  /** 备注 */
  remark?: string
  key?: string
}

/** 系统参数 */
export interface SystemParamBo {
  /** 库存预警阈值（库容占用%） */
  thresholdAlter: number
  /** 原料库龄预警（天） */
  agingAlert: number
  /** 码头仓库预警（天） */
  dockAlert: number
  /** 矿源备案用量预警（%） */
  usageAlert: number
  /** 密码最低长度 */
  passwordLength: number
  /** 密码复杂度 */
  passwordComplexity: string
  /** 密码错误次数后锁定 */
  passwordErrorNum: number
  /** 账号异常尝试登录锁定时长 */
  accountLockTime: number
  /** 系统未操作分钟数后退出 */
  sessionFreeTime: number
  /** 首页数据刷新时效 */
  refreshInterval: number
  /** 品质参数配置 */
  elements?: SystemElementBo[]
}

/** 装运方式 */
export interface ShippingMethodBo {
  /** 创建者 */
  createBy?: string
  /** 创建时间 */
  createTime?: string
  /** 更新者 */
  updateBy?: string
  /** 更新时间 */
  updateTime?: string
  /** 请求参数 */
  params?: Record<string, unknown>
  id: number
  /** 编码 */
  shippingMethodCode: string
  /** 名称 */
  shippingMethodName: string
  /** 柜数 */
  areaNumber?: number
}

/** 出库单业务对象 wms_shipment_order */
export interface ShipmentOrderBo {
  /** 创建者 */
  createBy?: string
  /** 创建时间 */
  createTime?: string
  /** 更新者 */
  updateBy?: string
  /** 更新时间 */
  updateTime?: string
  /** 请求参数 */
  params?: Record<string, unknown>
  id: number
  /** 出库单号（后端生成，前端可不传） */
  shipmentOrderNo?: string
  /** 委托方id */
  consignorId: number
  /** 流向企业 */
  receivingCompany: string
  /** 消费使用单位 */
  consumer: string
  /** 库存id */
  inventoryId: number
  /** 出库报关单号 */
  recordNo?: string
  /** 匹配保税账册号 */
  ebookNo?: string
  /** 核注清单号 */
  verificationCode?: string
  /** 生产批次 */
  batchNo?: string
  /** 出库重量(吨) */
  shipmentWeight: number
  /** 报关单金额 */
  recordAmount?: number
  /** 计划出库时间 */
  planShipmentTime?: string
  /** 备注 */
  remark?: string
  /** 出库状态 */
  shipmentOrderStatus?: number
}

/** 入库单-五项有害元素 */
export interface ToxicElementsBo {
  /** 编号 */
  elementCode: string
  /** 值 */
  elementValue: number
}

/** 入库单-五项有害元素 */
export interface ReceiptOrderElementBo {
  /** 创建者 */
  createBy?: string
  /** 创建时间 */
  createTime?: string
  /** 更新者 */
  updateBy?: string
  /** 更新时间 */
  updateTime?: string
  /** 请求参数 */
  params?: Record<string, unknown>
  /** 编号 */
  elementCode: string
  /** 值 */
  elementValue: number
}

/** 库位列表详细信息 */
export interface ReceiptOrderAreaBo {
  /** 创建者 */
  createBy?: string
  /** 创建时间 */
  createTime?: string
  /** 更新者 */
  updateBy?: string
  /** 更新时间 */
  updateTime?: string
  /** 请求参数 */
  params?: Record<string, unknown>
  /** 堆位id */
  areaId: number
  /** 仓库id */
  warehouseId: number
  /** 入库单id */
  receiptOrderId?: number
  /** 湿重(吨) */
  wetWeight?: number
  /** 干重(吨) */
  dryWeight?: number
  /** 存放位置 */
  areas?: AreaItemBo[]
}

/** 入库单-收货 */
export interface ReceiptOrderDetailBo {
  /** 入库单ID */
  id: number
  /** 入库单号 */
  receiptOrdeCode: string
  /** 矿种 */
  mineralType: number
  /** 装运方式 */
  shippingMethodId: number
  /** 湿重(吨) */
  wetWeight: number
  /** 干重(吨) */
  dryWeight: number
  /** 水分 */
  moistureContent: number
  /** 分类 */
  itemType?: number
  /** 账册id */
  ebookId?: number
  /** 备注 */
  remark?: string
  /** OCR入库重量单主键 */
  weightOrcId?: number
  /** OCR入库重量单主键 */
  elementsOrcId?: number
  /** 五项有害元素 */
  elements?: ReceiptOrderElementBo[]
  /** 堆位信息 */
  receiptOrderAreas?: ReceiptOrderAreaBo[]
}

/** OCR 编辑对象 */
export interface OcrLogBo {
  id: number
  /** 类型 0 入库报关单 1 出库报关单 2 重量单 3 品质单 */
  ocrLogType: number
  /** 关联单号(只归档填写0, 回填归档时填报关单ID/重量单ID/品质单ID) */
  orderId?: number
  /** 关联单号 */
  orderNo?: string
  /** 状态(0待修正2回填3归档) */
  ocrLogStatus?: number
  /** 识别结果(回填归档时填写对应值，会修改相关单据信息) */
  result?: Record<string, unknown>
}

/** ProducitionOrderBo */
export interface ProductionOrderBo {
  /** 创建者 */
  createBy?: string
  /** 创建时间 */
  createTime?: string
  /** 更新者 */
  updateBy?: string
  /** 更新时间 */
  updateTime?: string
  /** 请求参数 */
  params?: Record<string, unknown>
  id: number
  /** 生产单号（通常后端生成，可不传） */
  productionOrderNo?: string
  /** 生产工单（通常后端生成，可不传） */
  workOrderNo?: string
  /** 完工工单（通常后端生成，可不传） */
  finishOrderNo?: string
  /** 类型 1 投料/加工 2 完工入库(查询参数) */
  type?: number
  /** 生产类型 0 投料出库 1 加工过程 ... */
  productionType?: number
  /** 委托方 */
  consignorId?: number
  /** 生产批次 */
  batchNo: string
  /** 工序名称 */
  processName?: string
  /** 物料id（产出成品） */
  itemId?: number
  /** 关联出库单 */
  orderId?: number
  /** 关联入库单 */
  receiptOrderId?: number
  /** 关联入库库存id */
  receiptInventoryId?: number
  /** 产出干重(吨) */
  productionWeight?: number
  /** 开始时间 */
  startTime?: string
  /** 结束时间 */
  endTime?: string
  /** 目标仓库（成品入库） */
  targetWarehouseId?: number
  /** 目标库区/堆位（成品入库） */
  targetAreaId?: number
  /** 存放位置 */
  areas?: AreaItemBo[]
  /** 投料报关单 */
  productionOrderDetails?: ProductionOrderDetailBo[]
}

/** 库存移动详情业务对象 wms_movement_order_detail */
export interface MovementOrderDetailBo {
  /** 创建者 */
  createBy?: string
  /** 创建时间 */
  createTime?: string
  /** 更新者 */
  updateBy?: string
  /** 更新时间 */
  updateTime?: string
  /** 请求参数 */
  params?: Record<string, unknown>
  id: number
  /** 移库单Id */
  movementOrderId: number
  /** 规格id */
  skuId: number
  /** 数量 */
  quantity: number
  /** 备注 */
  remark: string
  /** 批号 */
  batchNo?: string
  /** 生产日期 */
  productionDate?: string
  /** 过期时间 */
  expirationDate?: string
  /** 源仓库 */
  sourceWarehouseId: number
  /** 源库区 */
  sourceAreaId: number
  /** 目标仓库 */
  targetWarehouseId: number
  /** 目标库区 */
  targetAreaId: number
  /** 入库记录id */
  inventoryDetailId: number
  warehouseId?: number
  areaId?: number
  key?: string
}

export interface ItemSkuBo {
  /** 创建者 */
  createBy?: string
  /** 创建时间 */
  createTime?: string
  /** 更新者 */
  updateBy?: string
  /** 更新时间 */
  updateTime?: string
  /** 请求参数 */
  params?: Record<string, unknown>
  id: number
  /** 规格名称 */
  skuName: string
  itemId: number
  /** sku条码 */
  barcode?: string
  /** 编码 */
  skuCode?: string
  /** 长(cm) */
  length?: number
  /** 宽(cm) */
  width?: number
  /** 高(cm) */
  height?: number
  /** 毛重(kg) */
  grossWeight?: number
  /** 净重(kg) */
  netWeight?: number
  /** 成本价(元) */
  costPrice?: number
  /** 销售价(元) */
  sellingPrice?: number
  /** 商品名称 */
  itemName?: string
  /** 商品编码 */
  itemCode?: string
  /** 商品分类 */
  itemCategory?: string
  itemBrand?: number
}

/** ProductionOrderDetailBo */
export interface ProductionOrderDetailBo {
  /** 库存id */
  inventoryId?: number
  /** 消耗干重(吨) */
  dryWeight?: number
  /** 消耗湿重(吨) */
  wetWeight?: number
}

export interface ItemCategoryBo {
  /** 创建者 */
  createBy?: string
  /** 创建时间 */
  createTime?: string
  /** 更新者 */
  updateBy?: string
  /** 更新时间 */
  updateTime?: string
  /** 请求参数 */
  params?: Record<string, unknown>
  /** 物料类型id */
  id: number
  /** 父物料类型id */
  parentId?: number
  /** 物料类型名称 */
  categoryName: string
  /** 显示顺序 */
  orderNum?: number
  /** 物料类型状态（0停用 1正常） */
  status?: string
}

/** 商品品牌业务对象 wms_item_brand */
export interface ItemBrandBo {
  /** 创建者 */
  createBy?: string
  /** 创建时间 */
  createTime?: string
  /** 更新者 */
  updateBy?: string
  /** 更新时间 */
  updateTime?: string
  /** 请求参数 */
  params?: Record<string, unknown>
  id: number
  /** 品牌名称 */
  brandName: string
}

export interface MineralSourceFilingBo {
  /** 创建者 */
  createBy?: string
  /** 创建时间 */
  createTime?: string
  /** 更新者 */
  updateBy?: string
  /** 更新时间 */
  updateTime?: string
  /** 请求参数 */
  params?: Record<string, unknown>
  /** id */
  id: number
  /** 物料id */
  itemId: number
  /** 矿源备案编号 */
  recordNumber: string
  /** 矿源种类 */
  category?: string
  /** 备案日期 */
  recordTime?: string
  /** 备案数量 */
  filingsNum?: number
  /** 有害元素含量 */
  hazardousElementsRemark?: string
  /** 生产批次号 */
  batchNumber?: string
  /** 附件 */
  fileUrl?: string
  /** 状态 */
  status?: string
  /** 开始日期 */
  startTime?: string
  /** 结束日期 */
  endTime?: string
  /** 核销吨数 */
  verifiedTonnage?: number
  /** 剩余吨数 */
  remainingTonnage?: number
  /** 用量 */
  dosage?: string
}

export interface ProductionOrderInspectionBo {
  /** 创建者 */
  createBy?: string
  /** 创建时间 */
  createTime?: string
  /** 更新者 */
  updateBy?: string
  /** 更新时间 */
  updateTime?: string
  /** 请求参数 */
  params?: Record<string, unknown>
  /** id */
  id: number
  /** id */
  productionOrderId: number
  /** 附件URL */
  fileUrl?: string
  /** 备注 */
  remark?: string
}

/** 往来单位业务对象 wms_merchant */
export interface MerchantBo {
  /** 创建者 */
  createBy?: string
  /** 创建时间 */
  createTime?: string
  /** 更新者 */
  updateBy?: string
  /** 更新时间 */
  updateTime?: string
  /** 请求参数 */
  params?: Record<string, unknown>
  /** id */
  id: number
  /** 编号 */
  merchantCode: string
  /** 名称 */
  merchantName: string
  /** 角色 */
  merchantType: number
  /** 联系电话 */
  mobile?: string
  /** 联系人 */
  contactPerson?: string
  /** 资质状态 */
  credentialStatus?: string
  /** 附件Url */
  fileUrl?: string
  /** 状态 */
  status?: string
  /** 备注 */
  remark?: string
  /** 来源 （0 手工维护 1 入库自动录入 2 出库自动录入） */
  source?: number
}

export interface ItemBo {
  /** 创建者 */
  createBy?: string
  /** 创建时间 */
  createTime?: string
  /** 更新者 */
  updateBy?: string
  /** 更新时间 */
  updateTime?: string
  /** 请求参数 */
  params?: Record<string, unknown>
  /** id */
  id: number
  /** 主键集合 */
  ids?: number[]
  /** 物料名称 */
  itemName: string
  /** 矿种类型 */
  itemCategory: string
  /** 矿源 */
  mineralSource?: string
  /** 备案原产国 */
  originCountry?: string
  /** 排序 */
  orderNum?: number
  /** 备注 */
  remark?: string
}

/** 库存记录业务对象 wms_inventory_history */
export interface InventoryHistoryBo {
  /** 创建时间 */
  createTime?: string
  /** 请求参数 */
  params?: Record<string, unknown>
  id: number
  /** 操作id（出库、入库、库存移动表单id） */
  orderId: number
  /** 操作单号（入库、出库、移库、盘库单号） */
  orderNo: string
  /** 操作类型 */
  orderType: number
  /** 物料ID */
  skuId: number
  /** 批号 */
  batchNo?: string
  /** 生产日期 */
  productionDate?: string
  /** 过期时间 */
  expirationDate?: string
  /** 金额 */
  amount?: number
  /** 库存变化 */
  quantity: number
  /** 备注 */
  remark: string
  /** 所属仓库 */
  warehouseId: number
  /** 所属库区 */
  areaId: number
  itemName?: string
  itemCode?: string
  skuName?: string
  skuCode?: string
  startTime?: string
  endTime?: string
}

export interface FloorPlanBo {
  /** 创建者 */
  createBy?: string
  /** 创建时间 */
  createTime?: string
  /** 更新者 */
  updateBy?: string
  /** 更新时间 */
  updateTime?: string
  /** 请求参数 */
  params?: Record<string, unknown>
  /** id */
  id: number
  /** 名称 */
  jsonData: string
  /** 状态 */
  status?: string
  /** 备注 */
  remark?: string
}

export interface AreaBo {
  /** 创建者 */
  createBy?: string
  /** 创建时间 */
  createTime?: string
  /** 更新者 */
  updateBy?: string
  /** 更新时间 */
  updateTime?: string
  /** 请求参数 */
  params?: Record<string, unknown>
  /** id */
  id: number
  /** 编号 */
  areaCode?: string
  /** 名称 */
  areaName: string
  /** 所属仓库ID */
  warehouseId: number
  /** 库容（吨） */
  inventoryCapacity: number
  /** 片区标识 */
  areaIdentification?: string
  /** 排序 */
  orderNum?: number
  /** 状态 */
  status?: string
  /** 备注 */
  remark?: string
}

/** 部门表 sys_dept */
export interface SysDept {
  /** 创建者 */
  createBy?: string
  /** 创建时间 */
  createTime?: string
  /** 更新者 */
  updateBy?: string
  /** 更新时间 */
  updateTime?: string
  /** 请求参数 */
  params?: Record<string, unknown>
  /** 部门ID */
  deptId?: number
  /** 部门名称 */
  deptName: string
  /** 显示顺序 */
  orderNum: number
  /** 负责人 */
  leader?: string
  /** 联系电话 */
  phone?: string
  /** 邮箱 */
  email?: string
  /** 部门状态:0正常,1停用 */
  status?: string
  /** 删除标志（0代表存在 1代表删除） */
  delFlag?: string
  /** 祖级列表 */
  ancestors?: string
  /** 父菜单名称 */
  parentName?: string
  /** 父菜单ID */
  parentId?: number
  /** 子部门 */
  children?: SysDept[]
}

/** 角色表 sys_role */
export interface SysRole {
  /** 创建者 */
  createBy?: string
  /** 创建时间 */
  createTime?: string
  /** 更新者 */
  updateBy?: string
  /** 更新时间 */
  updateTime?: string
  /** 请求参数 */
  params?: Record<string, unknown>
  /** 角色ID */
  roleId?: number
  /** 角色名称 */
  roleName: string
  /** 角色权限 */
  roleKey: string
  /** 角色排序 */
  roleSort: number
  /** 数据范围（1：所有数据权限；2：自定义数据权限；3：本部门数据权限；4：本部门及以下数据权限；5：仅本人数据权限） */
  dataScope?: string
  /** 菜单树选择项是否关联显示（ 0：父子不互相关联显示 1：父子互相关联显示） */
  menuCheckStrictly?: boolean
  /** 部门树选择项是否关联显示（0：父子不互相关联显示 1：父子互相关联显示 ） */
  deptCheckStrictly?: boolean
  /** 角色状态（0正常 1停用） */
  status?: string
  /** 删除标志（0代表存在 1代表删除） */
  delFlag?: string
  /** 备注 */
  remark?: string
  /** 用户是否存在此角色标识 默认不存在 */
  flag?: boolean
  /** 菜单组 */
  menuIds?: number[]
  /** 部门组（数据权限） */
  deptIds?: number[]
  admin?: boolean
}

export interface AccountBookBo {
  /** 创建者 */
  createBy?: string
  /** 创建时间 */
  createTime?: string
  /** 更新者 */
  updateBy?: string
  /** 更新时间 */
  updateTime?: string
  /** 请求参数 */
  params?: Record<string, unknown>
  /** id */
  id: number
  /** 账册编号 */
  accountCode: string
  /** 账册名称 */
  accountName: string
  /** 经营单位 */
  operatingUnit?: string
  /** 货值 */
  goodsValue?: number
  /** 报关单号 */
  customsDeclarationNumber?: string
  /** 备案状态 */
  filingStatus?: string
  /** 衔接旧账ID */
  oldAccountId?: number
  /** 备注 */
  remark?: string
  /** 旧账册预警日期 */
  endEarlyWarningTime?: string
  /** 旧账册预警日期 */
  beginEarlyWarningTime?: string
}

/** 业务表 gen_table */
export interface GenTable {
  /** 创建者 */
  createBy?: string
  /** 创建时间 */
  createTime?: string
  /** 更新者 */
  updateBy?: string
  /** 更新时间 */
  updateTime?: string
  /** 请求参数 */
  params?: Record<string, unknown>
  /** 编号 */
  tableId?: number
  /** 表名称 */
  tableName: string
  /** 表描述 */
  tableComment: string
  /** 关联父表的表名 */
  subTableName?: string
  /** 本表关联父表的外键名 */
  subTableFkName?: string
  /** 实体类名称(首字母大写) */
  className: string
  /** 使用的模板（crud单表操作 tree树表操作 sub主子表操作） */
  tplCategory?: string
  /** 生成包路径 */
  packageName: string
  /** 生成模块名 */
  moduleName: string
  /** 生成业务名 */
  businessName: string
  /** 生成功能名 */
  functionName: string
  /** 生成作者 */
  functionAuthor: string
  /** 生成代码方式（0zip压缩包 1自定义路径） */
  genType?: string
  /** 生成路径（不填默认项目路径） */
  genPath?: string
  pkColumn?: GenTableColumn
  subTable?: GenTable
  /** 表列信息 */
  columns?: GenTableColumn[]
  /** 其它生成选项 */
  options?: string
  /** 备注 */
  remark?: string
  /** 树编码字段 */
  treeCode?: string
  /** 树父编码字段 */
  treeParentCode?: string
  /** 树名称字段 */
  treeName?: string
  menuIds?: number[]
  /** 上级菜单ID字段 */
  parentMenuId?: string
  /** 上级菜单名称字段 */
  parentMenuName?: string
  crud?: boolean
  tree?: boolean
  sub?: boolean
}

export interface SysUserBo {
  /** 创建者 */
  createBy?: string
  /** 创建时间 */
  createTime?: string
  /** 更新者 */
  updateBy?: string
  /** 更新时间 */
  updateTime?: string
  /** 请求参数 */
  params?: Record<string, unknown>
  /** 用户ID */
  userId?: number
  /** 部门ID */
  deptId?: number
  /** 用户账号 */
  userName: string
  /** 用户昵称 */
  nickName: string
  /** 用户类型（sys_user系统用户） */
  userType?: string
  /** 用户邮箱 */
  email?: string
  /** 手机号码 */
  phonenumber?: string
  /** 用户性别 */
  sex?: string
  /** 用户头像 */
  avatar?: string
  /** 密码 */
  password?: string
  /** 帐号状态（0正常 1停用） */
  status?: string
  /** 删除标志（0代表存在 1代表删除） */
  delFlag?: string
  /** 最后登录IP */
  loginIp?: string
  /** 最后登录时间 */
  loginDate?: string
  /** 备注 */
  remark?: string
  dept?: SysDept
  /** 角色对象 */
  roles?: SysRole[]
  /** 角色组 */
  roleIds?: number[]
  /** 岗位组 */
  postIds?: number[]
  /** 数据权限 当前角色ID */
  roleId?: number
  admin?: boolean
}

/** 代码生成业务字段表 gen_table_column */
export interface GenTableColumn {
  /** 创建者 */
  createBy?: string
  /** 创建时间 */
  createTime?: string
  /** 更新者 */
  updateBy?: string
  /** 更新时间 */
  updateTime?: string
  /** 请求参数 */
  params?: Record<string, unknown>
  /** 编号 */
  columnId?: number
  /** 归属表编号 */
  tableId?: number
  /** 列名称 */
  columnName?: string
  /** 列描述 */
  columnComment?: string
  /** 列类型 */
  columnType?: string
  /** JAVA类型 */
  javaType?: string
  /** JAVA字段名 */
  javaField: string
  /** 是否主键（1是） */
  isPk?: string
  /** 是否自增（1是） */
  isIncrement?: string
  /** 是否必填（1是） */
  isRequired?: string
  /** 是否为插入字段（1是） */
  isInsert?: string
  /** 是否编辑字段（1是） */
  isEdit?: string
  /** 是否列表字段（1是） */
  isList?: string
  /** 是否查询字段（1是） */
  isQuery?: string
  /** 查询方式（EQ等于、NE不等于、GT大于、LT小于、LIKE模糊、BETWEEN范围） */
  queryType?: string
  /** 显示类型（input文本框、textarea文本域、select下拉框、checkbox复选框、radio单选框、datetime日期控件、image图片上传控件、upload文件上传控件、editor富文本控件） */
  htmlType?: string
  /** 字典类型 */
  dictType?: string
  /** 排序 */
  sort?: number
  required?: boolean
  list?: boolean
  insert?: boolean
  edit?: boolean
  pk?: boolean
  usableColumn?: boolean
  superColumn?: boolean
  query?: boolean
  increment?: boolean
  capJavaField?: string
}

/** 个人信息业务处理 */
export interface SysUserProfileBo {
  /** 创建者 */
  createBy?: string
  /** 创建时间 */
  createTime?: string
  /** 更新者 */
  updateBy?: string
  /** 更新时间 */
  updateTime?: string
  /** 请求参数 */
  params?: Record<string, unknown>
  /** 用户昵称 */
  nickName?: string
  /** 用户邮箱 */
  email?: string
  /** 手机号码 */
  phonenumber?: string
  /** 用户性别（0男 1女 2未知） */
  sex?: string
}

/** 角色信息业务对象 sys_role */
export interface SysRoleBo {
  /** 创建者 */
  createBy?: string
  /** 创建时间 */
  createTime?: string
  /** 更新者 */
  updateBy?: string
  /** 更新时间 */
  updateTime?: string
  /** 请求参数 */
  params?: Record<string, unknown>
  /** 角色ID */
  roleId?: number
  /** 角色名称 */
  roleName: string
  /** 角色权限字符串 */
  roleKey: string
  /** 显示顺序 */
  roleSort: number
  /** 数据范围（1：全部数据权限 2：自定数据权限 3：本部门数据权限 4：本部门及以下数据权限） */
  dataScope?: string
  /** 菜单树选择项是否关联显示 */
  menuCheckStrictly?: boolean
  /** 部门树选择项是否关联显示 */
  deptCheckStrictly?: boolean
  /** 角色状态（0正常 1停用） */
  status?: string
  /** 备注 */
  remark?: string
  /** 菜单组 */
  menuIds?: number[]
  /** 部门组（数据权限） */
  deptIds?: number[]
  admin?: boolean
}

/** 用户和角色关联 sys_user_role */
export interface SysUserRole {
  /** 用户ID */
  userId?: number
  /** 角色ID */
  roleId?: number
}

/** 岗位信息业务对象 sys_post */
export interface SysPostBo {
  /** 创建者 */
  createBy?: string
  /** 创建时间 */
  createTime?: string
  /** 更新者 */
  updateBy?: string
  /** 更新时间 */
  updateTime?: string
  /** 请求参数 */
  params?: Record<string, unknown>
  /** 岗位ID */
  postId?: number
  /** 岗位编码 */
  postCode: string
  /** 岗位名称 */
  postName: string
  /** 显示顺序 */
  postSort: number
  /** 状态（0停用 1正常） */
  status?: string
  /** 备注 */
  remark?: string
}

/** 对象存储配置业务对象 sys_oss_config */
export interface SysOssConfigBo {
  /** 创建者 */
  createBy?: string
  /** 创建时间 */
  createTime?: string
  /** 更新者 */
  updateBy?: string
  /** 更新时间 */
  updateTime?: string
  /** 请求参数 */
  params?: Record<string, unknown>
  /** 主建 */
  ossConfigId: number
  /** 配置key */
  configKey: string
  /** accessKey */
  accessKey: string
  /** 秘钥 */
  secretKey: string
  /** 桶名称 */
  bucketName: string
  /** 前缀 */
  prefix?: string
  /** 访问站点 */
  endpoint: string
  /** 自定义域名 */
  domain?: string
  /** 是否https（Y=是,N=否） */
  isHttps?: string
  /** 是否默认（0=是,1=否） */
  status?: string
  /** 域 */
  region?: string
  /** 扩展字段 */
  ext1?: string
  /** 备注 */
  remark?: string
  /** 桶权限类型(0private 1public 2custom) */
  accessPolicy: string
}

/** 通知公告业务对象 sys_notice */
export interface SysNoticeBo {
  /** 创建者 */
  createBy?: string
  /** 创建时间 */
  createTime?: string
  /** 更新者 */
  updateBy?: string
  /** 更新时间 */
  updateTime?: string
  /** 请求参数 */
  params?: Record<string, unknown>
  /** 公告ID */
  noticeId?: number
  /** 公告标题 */
  noticeTitle: string
  /** 公告类型（1通知 2公告） */
  noticeType?: string
  /** 公告内容 */
  noticeContent?: string
  /** 公告状态（0正常 1关闭） */
  status?: string
  /** 备注 */
  remark?: string
  /** 创建人名称 */
  createByName?: string
}

/** 菜单权限业务对象 sys_menu */
export interface SysMenuBo {
  /** 创建者 */
  createBy?: string
  /** 创建时间 */
  createTime?: string
  /** 更新者 */
  updateBy?: string
  /** 更新时间 */
  updateTime?: string
  /** 请求参数 */
  params?: Record<string, unknown>
  /** 菜单ID */
  menuId?: number
  /** 父菜单ID */
  parentId?: number
  /** 菜单名称 */
  menuName: string
  /** 显示顺序 */
  orderNum: number
  /** 路由地址 */
  path?: string
  /** 组件路径 */
  component?: string
  /** 路由参数 */
  queryParam?: string
  /** 是否为外链（0是 1否） */
  isFrame?: string
  /** 是否缓存（0缓存 1不缓存） */
  isCache?: string
  /** 菜单类型（M目录 C菜单 F按钮） */
  menuType: string
  /** 显示状态（0显示 1隐藏） */
  visible?: string
  /** 菜单状态（0停用 1正常） */
  status?: string
  /** 权限标识 */
  perms?: string
  /** 菜单图标 */
  icon?: string
  /** 备注 */
  remark?: string
}

/** 字典类型业务对象 sys_dict_type */
export interface SysDictTypeBo {
  /** 创建者 */
  createBy?: string
  /** 创建时间 */
  createTime?: string
  /** 更新者 */
  updateBy?: string
  /** 更新时间 */
  updateTime?: string
  /** 请求参数 */
  params?: Record<string, unknown>
  /** 字典主键 */
  dictId?: number
  /** 字典名称 */
  dictName: string
  /** 字典类型 */
  dictType: string
  /** 状态（0停用 1正常） */
  status?: string
  /** 备注 */
  remark?: string
}

/** 字典数据业务对象 sys_dict_data */
export interface SysDictDataBo {
  /** 创建者 */
  createBy?: string
  /** 创建时间 */
  createTime?: string
  /** 更新者 */
  updateBy?: string
  /** 更新时间 */
  updateTime?: string
  /** 请求参数 */
  params?: Record<string, unknown>
  /** 字典编码 */
  dictCode?: number
  /** 字典排序 */
  dictSort?: number
  /** 字典标签 */
  dictLabel: string
  /** 字典键值 */
  dictValue: string
  /** 字典类型 */
  dictType: string
  /** 样式属性（其他样式扩展） */
  cssClass?: string
  /** 表格回显样式 */
  listClass?: string
  /** 是否默认（Y是 N否） */
  isDefault?: string
  /** 状态（0停用 1正常） */
  status?: string
  /** 备注 */
  remark?: string
  isRequired?: string
  isElement1?: string
  isElement2?: string
}

/** 部门业务对象 sys_dept */
export interface SysDeptBo {
  /** 创建者 */
  createBy?: string
  /** 创建时间 */
  createTime?: string
  /** 更新者 */
  updateBy?: string
  /** 更新时间 */
  updateTime?: string
  /** 请求参数 */
  params?: Record<string, unknown>
  /** 部门id */
  deptId?: number
  /** 父部门ID */
  parentId?: number
  /** 部门名称 */
  deptName: string
  /** 显示顺序 */
  orderNum: number
  /** 负责人 */
  leader?: string
  /** 联系电话 */
  phone?: string
  /** 邮箱 */
  email?: string
  /** 部门状态（0正常 1停用） */
  status?: string
}

/** 参数配置业务对象 sys_config */
export interface SysConfigBo {
  /** 创建者 */
  createBy?: string
  /** 创建时间 */
  createTime?: string
  /** 更新者 */
  updateBy?: string
  /** 更新时间 */
  updateTime?: string
  /** 请求参数 */
  params?: Record<string, unknown>
  /** 参数主键 */
  configId?: number
  /** 参数名称 */
  configName: string
  /** 参数键名 */
  configKey: string
  /** 参数键值 */
  configValue: string
  /** 系统内置（Y是 N否） */
  configType?: string
  /** 备注 */
  remark?: string
}

/** 响应信息主体 */
export interface RMapStringObject {
  code?: number
  msg?: string
  data?: Record<string, unknown>
}

export interface ItemTypeTreeSelectVo {
  /** 节点ID */
  id?: number
  /** 节点名称 */
  label?: string
  /** 子节点 */
  children?: ItemTypeTreeSelectVo[]
}

/** 响应信息主体 */
export interface RMapStringString {
  code?: number
  msg?: string
  data?: Record<string, string>
}

/** ShippingMethodVo */
export interface ShippingMethodVo {
  /** 创建者 */
  createBy?: string
  /** 创建时间 */
  createTime?: string
  /** 更新者 */
  updateBy?: string
  /** 更新时间 */
  updateTime?: string
  id?: number
  /** 编码 */
  shippingMethodCode?: string
  /** 名称 */
  shippingMethodName?: string
  /** 柜数 */
  areaNumber?: number
}

/** 短信登录对象 */
export interface SmsLoginBody {
  /** 手机号 */
  phonenumber: string
  /** 短信code */
  smsCode: string
}

/** 用户注册对象 */
export interface RegisterBody {
  /** 用户名 */
  username: string
  /** 用户密码 */
  password: string
  /** 验证码 */
  code?: string
  /** 唯一标识 */
  uuid?: string
  userType?: string
}

/** 响应信息主体 */
export interface RShippingMethodVo {
  code?: number
  msg?: string
  data?: ShippingMethodVo
}

/** 入库单业务对象 wms_receipt_order */
export interface ReceiptOrderBo {
  /** 创建者 */
  createBy?: string
  /** 创建时间 */
  createTime?: string
  /** 更新者 */
  updateBy?: string
  /** 更新时间 */
  updateTime?: string
  /** 请求参数 */
  params?: Record<string, unknown>
  id: number
  /** OCR入库报关单主键 */
  orcId: number
  /** 委托方 */
  consignorId: number
  /** 堆位id(查询参数) */
  areaId?: number
  /** 仓库id(查询参数) */
  warehouseId?: number
  /** 船名 */
  shipName?: string
  /** 提运单号 */
  waybillNo?: string
  /** 核注清单号 */
  verificationCode?: string
  /** 报关单号 */
  recordNo?: string
  /** 币制 */
  currency?: string
  /** 提单重量(吨) */
  ladingWeight?: number
  /** 订单金额 */
  payableAmount: number
  /** 物料id */
  itemId: number
  /** 物料备案id */
  itemBookId?: number
  /** 矿种 */
  mineralType: number
  /** 装运方式 */
  shippingMethodId: number
  /** 到货日期 */
  arrivalDate?: string
  /** 堆位信息 */
  receiptOrderAreas?: ReceiptOrderAreaBo[]
  /** 入库状态 */
  receiptOrderStatus?: number
}

export interface AreaVo {
  id?: number
  /** 编号 */
  areaCode?: string
  /** 名称 */
  areaName?: string
  /** 所属仓库ID */
  warehouseId?: number
  /** 库容（吨） */
  inventoryCapacity?: number
  /** 当前库容（吨） */
  currentCapacity?: number
  /** 片区标识 */
  areaIdentification?: string
  /** 状态 */
  status?: string
  /** 排序 */
  orderNum?: number
  /** 备注 */
  remark?: string
  warehouse?: WarehouseVo
}

/** 系统访问记录业务对象 sys_logininfor */
export interface SysLogininforBo {
  /** 访问ID */
  infoId?: number
  /** 用户账号 */
  userName?: string
  /** 设备类型 */
  deviceType?: string
  /** 登录IP地址 */
  ipaddr?: string
  /** 登录地点 */
  loginLocation?: string
  /** 浏览器类型 */
  browser?: string
  /** 操作系统 */
  os?: string
  /** 登录状态（0失败 1成功） */
  status?: string
  /** 提示消息 */
  msg?: string
  /** 访问时间 */
  loginTime?: string
  /** 请求参数 */
  params?: Record<string, unknown>
}

export interface ItemVo {
  id?: number
  /** 物料名称 */
  itemName?: string
  /** 矿种类型 */
  itemCategory?: string
  /** 矿区 */
  mineralSource?: string
  /** 备案原产国 */
  originCountry?: string
  /** 排序 */
  orderNum?: number
  /** 备注 */
  remark?: string
}

/** AreaItemBo */
export interface AreaItemBo {
  /** 行索引 */
  row?: number
  /** 列索引 */
  column?: number
}

/** 用户登录对象 */
export interface LoginBody {
  /** 用户名 */
  username: string
  /** 用户密码 */
  password: string
  /** 验证码 */
  code?: string
  /** 唯一标识 */
  uuid?: string
}

/** 邮箱登录对象 */
export interface EmailLoginBody {
  /** 邮箱 */
  email: string
  /** 邮箱code */
  emailCode: string
}

/** 往来单位视图对象 wms_merchant */
export interface MerchantVo {
  /** id */
  id?: number
  /** 编码 */
  merchantCode?: string
  /** 企业名称 */
  merchantName?: string
  /** 角色 */
  merchantType?: number
  /** 联系电话 */
  mobile?: string
  /** 状态 */
  status?: string
  /** 资质状态 */
  credentialStatus?: string
  /** 附件Url */
  fileUrl?: string
  /** 状态 */
  statusName?: string
  /** 备注 */
  remark?: string
}

/** AreaItemVo */
export interface AreaItemVo {
  /** 行索引 */
  row?: number
  /** 列索引 */
  column?: number
}

export interface MineralSourceFilingVo {
  /** ID */
  id?: number
  /** 物料id */
  itemId?: number
  /** 物料名称 */
  itemName?: string
  /** 名称 */
  originCountry?: string
  /** 矿源备案编号 */
  recordNumber?: string
  /** 矿源种类 */
  category?: string
  /** 备案日期 */
  recordTime?: string
  /** 状态 */
  status?: string
  /** 备案数量 */
  filingsNum?: number
  /** 核销吨数 */
  verifiedTonnage?: number
  /** 剩余吨数 */
  remainingTonnage?: number
  /** 有害元素含量 */
  hazardousElementsRemark?: string
  /** 用量 */
  dosage?: string
  /** 生产批次号 */
  batchNumber?: string
  /** 附件 */
  fileUrl?: string
  /** 备注 */
  remark?: string
}

/** 入库单-五项有害元素 */
export interface ReceiptOrderElementVo {
  /** 创建者 */
  createBy?: string
  /** 创建时间 */
  createTime?: string
  /** 更新者 */
  updateBy?: string
  /** 更新时间 */
  updateTime?: string
  id?: number
  /** 入库单id */
  receiptOrderId?: number
  /** 编号 */
  elementCode?: string
  /** 名称 */
  elementName?: string
  /** 值 */
  elementValue?: number
}

/** 响应信息主体 */
export interface RWarehouseVo {
  code?: number
  msg?: string
  data?: WarehouseVo
}

export interface ReceiptOrderAreaVo {
  /** 创建者 */
  createBy?: string
  /** 创建时间 */
  createTime?: string
  /** 更新者 */
  updateBy?: string
  /** 更新时间 */
  updateTime?: string
  id?: number
  /** 堆位id */
  areaId?: number
  /** 仓库id */
  warehouseId?: number
  /** 湿重(吨) */
  wetWeight?: number
  /** 干重(吨) */
  dryWeight?: number
  /** 存放位置(json字符串) */
  areaItems?: string
  area?: AreaVo
}

/** 仓库管理回参实体类 */
export interface WarehouseVo {
  /** id */
  id?: number
  /** 编号 */
  warehouseCode?: string
  /** 仓库名称 */
  warehouseName?: string
  /** 库容（吨） */
  storageCapacity?: number
  /** 面积（㎡） */
  area?: number
  /** 堆位数 */
  areaNum?: number
  /** 已用/占用率 */
  occupy?: string
  /** 状态 */
  status?: string
  /** 排序 */
  orderNum?: number
  /** 备注 */
  remark?: string
}

/** 分页查询实体类 */
export interface PageQuery {
  /** 分页大小 */
  pageSize?: number
  /** 当前页数 */
  pageNum?: number
  /** 排序列 */
  orderByColumn?: string
  /** 排序的方向desc或者asc */
  isAsc?: string
  firstNum?: number
}

/** 表格分页数据对象 */
export interface TableDataInfoWarehouseVo {
  /** 总记录数 */
  total?: number
  /** 列表数据 */
  rows?: WarehouseVo[]
  /** 消息状态码 */
  code?: number
  /** 消息内容 */
  msg?: string
}

/** 入库单视图对象 wms_receipt_order */
export interface ReceiptOrderVo {
  /** 创建者 */
  createBy?: string
  /** 创建时间 */
  createTime?: string
  /** 更新者 */
  updateBy?: string
  /** 更新时间 */
  updateTime?: string
  id?: number
  /** 入库单号 */
  receiptOrderNo?: string
  /** OCR日志主键 */
  orcId?: number
  /** 委托方id */
  consignorId?: number
  /** 船名 */
  shipName?: string
  /** 提运单号 */
  waybillNo?: string
  /** 核注清单号 */
  verificationCode?: string
  /** 报关单号 */
  recordNo?: string
  /** 币制 */
  currency?: string
  /** 金额 */
  payableAmount?: number
  /** 物料id */
  itemId?: number
  /** 矿源备案id */
  itemBookId?: string
  /** 矿种 */
  mineralType?: number
  /** 货运方式 */
  shippingMethod?: number
  /** 到货日期 */
  arrivalDate?: string
  /** 物流账册主体id */
  entityId?: number
  /** 账册id */
  ebookId?: number
  /** 入库状态 */
  receiptOrderStatus?: number
  item?: ItemVo
  consignor?: MerchantVo
  /** 分类 */
  receiptType?: number
  /** 湿重(吨) */
  wetWeight?: number
  /** 干重(吨) */
  dryWeight?: number
  /** 提单重量(吨) */
  ladingWeight?: number
  /** 水分 */
  moistureContent?: number
  /** OCR入库重量单主键 */
  weightOrcId?: number
  /** OCR入库单五项有害元素主键 */
  elementsOrcId?: number
  /** 五项有害元素 */
  elements?: ReceiptOrderElementVo[]
  /** 矿源备案信息 */
  mineralSourceFiling?: MineralSourceFilingVo[]
  /** 堆位信息 */
  receiptOrderAreas?: ReceiptOrderAreaVo[]
}

/** 投料/产出记录 */
export interface ProductionOrderDetailVo {
  id?: number
  /** 生产单id */
  productionOrderId?: number
  /** 委托方 */
  consignorId?: number
  /** 库存id */
  inventoryId?: number
  /** 方向 0 领料(原料) 1 产出(成品) */
  direction?: number
  /** 入库报关单id */
  orderId?: number
  /** 物料id */
  itemId?: number
  /** 源/目标仓库 */
  warehouseId?: number
  /** 源/目标堆位 */
  areaId?: number
  /** 湿重(吨) */
  wetWeight?: number
  /** 干重(吨) */
  dryWeight?: number
  /** 批次号 */
  batchNo?: string
  /** 备注 */
  remark?: string
  receiptOrder?: ReceiptOrderVo
  shipmentOrder?: ShipmentOrderVo
  item?: ItemVo
  area?: AreaVo
}

/** 响应信息主体 */
export interface RListWarehouseVo {
  code?: number
  msg?: string
  data?: WarehouseVo[]
}

/** 装运方式 */
export interface ShippingMethod {
  /** 创建者 */
  createBy?: string
  /** 创建时间 */
  createTime?: string
  /** 更新者 */
  updateBy?: string
  /** 更新时间 */
  updateTime?: string
  /** 请求参数 */
  params?: Record<string, unknown>
  id?: number
  /** 编码 */
  shippingMethodCode?: string
  /** 名称 */
  shippingMethodName?: string
  /** 柜数 */
  areaNumber?: number
}

/** 生产加工单视图对象 wms_production_order */
export interface ProductionOrderVo {
  /** 创建者 */
  createBy?: string
  /** 创建时间 */
  createTime?: string
  /** 更新者 */
  updateBy?: string
  /** 更新时间 */
  updateTime?: string
  id?: number
  /** 生产单号 */
  productionOrderNo?: string
  /** 生产工单 */
  workOrderNo?: string
  /** 完工工单 */
  finishOrderNo?: string
  /** 生产类型 0 投料出库 1 加工过程 */
  productionType?: number
  /** 委托方 */
  consignorId?: number
  /** 物料id（产出成品） */
  itemId?: number
  /** 生产批次 */
  batchNo?: string
  /** 目标仓库（成品入库） */
  targetWarehouseId?: number
  /** 目标库区（成品入库） */
  targetAreaId?: number
  /** 存放位置(json字符串) */
  areaItems?: string
  /** 工序名称 */
  processName?: string
  /** 消耗干重(吨) */
  dryWeight?: number
  /** 产出干重(吨) */
  productionWeight?: number
  /** 开始时间 */
  startTime?: string
  /** 结束时间 */
  endTime?: string
  /** 状态 0 投料生产 1 混成品 2 已出库 */
  productionOrderStatus?: number
  /** 备注 */
  remark?: string
  consignor?: MerchantVo
  item?: ItemVo
  area?: AreaVo
  /** 投料报关单/出库单 */
  productionOrderDetails?: ProductionOrderDetailVo[]
}

export interface ItemCategoryVo {
  /** 物料类型id */
  id?: number
  /** 父物料类型id */
  parentId?: number
  /** 祖级列表 */
  ancestors?: string
  /** 物料类型名称 */
  categoryName?: string
  /** 显示顺序 */
  orderNum?: number
  /** 物料类型状态（0正常 1停用） */
  status?: string
  /** 子物料类型 */
  children?: ItemCategoryVo[]
}

/** 响应信息主体 */
export interface RProductionOrderVo {
  code?: number
  msg?: string
  data?: ProductionOrderVo
}

/** 库存详情业务对象 wms_inventory_detail */
export interface InventoryDetailBo {
  /** 创建者 */
  createBy?: string
  /** 创建时间 */
  createTime?: string
  /** 更新者 */
  updateBy?: string
  /** 更新时间 */
  updateTime?: string
  /** 请求参数 */
  params?: Record<string, unknown>
  id?: number
  /** 库存id */
  inventoryId?: number
  /** 业务单id */
  orderId?: number
  /** 报关单号 */
  recordNo?: string
  /** 生产批次 */
  batchNo?: string
  /** 物料id */
  itemId?: number
  /** 业务单号 */
  orderNo?: string
  /** 库存来源 1 入库 2 生产 */
  type?: number
  /** 流向企业 */
  receivingCompanyId?: number
}

export interface ItemSkuVo {
  id?: number
  /** 规格名称 */
  skuName?: string
  itemId?: number
  /** sku条码 */
  barcode?: string
  /** sku编码 */
  skuCode?: string
  /** 长(cm) */
  length?: number
  /** 宽(cm) */
  width?: number
  /** 高(cm) */
  height?: number
  /** 毛重(kg) */
  grossWeight?: number
  /** 净重(kg) */
  netWeight?: number
  /** 成本价(元) */
  costPrice?: number
  /** 销售价(元) */
  sellingPrice?: number
  item?: ItemVo
}

/** OCR 上传对象 */
export interface OcrLogAddBo {
  /** 类型 0 入库报关单 1 出库报关单 2 重量单 3 品质证书 */
  ocrLogType: number
  /** 关联单号 */
  orderNo?: string
}

export interface OcrLogVo {
  /** 创建者 */
  createBy?: string
  /** 创建时间 */
  createTime?: string
  /** 更新者 */
  updateBy?: string
  /** 更新时间 */
  updateTime?: string
  id?: number
  /** 任务号 */
  ocrLogNo?: string
  /** 入库单号/出库单号 */
  orderId?: number
  /** 类型 0 入库报关单 1 出库报关单 2 重量单 3 品质证书 */
  ocrLogType?: number
  /** 关联单号 */
  orderNo?: string
  /** 状态 */
  ocrLogStatus?: number
  /** 识别结果JSON字符串 */
  resultJson?: string
  /** 影像图片 */
  sourceUrl?: string
  /** 识别结果 */
  result?: Record<string, unknown>
}

/** 响应信息主体 */
export interface RShipmentOrderDetailVo {
  code?: number
  msg?: string
  data?: ShipmentOrderDetailVo
}

/** 出库单视图对象 wms_shipment_order */
export interface ShipmentOrderVo {
  /** 创建者 */
  createBy?: string
  /** 创建时间 */
  createTime?: string
  /** 更新者 */
  updateBy?: string
  /** 更新时间 */
  updateTime?: string
  id?: number
  /** 出库单号 */
  shipmentOrderNo?: string
  consignorId?: number
  /** 委托方 */
  consignorName?: string
  receivingCompanyId?: number
  /** 流向企业 */
  receivingCompany?: string
  consumerId?: number
  /** 消费使用单位 */
  consumerName?: string
  /** 报关单号 */
  recordNo?: string
  /** 核注清单 */
  verificationCode?: string
  /** 批次号 */
  batchNo?: string
  /** 重量 */
  shipmentWeight?: number
  /** 报关单金额 */
  recordAmount?: number
  /** 计划时间 */
  planShipmentTime?: string
  /** 出库时间 */
  shipmentTime?: string
  /** 备注 */
  remark?: string
  /** 出库状态 */
  shipmentOrderStatus?: number
  consignor?: MerchantVo
}

/** 响应信息主体 */
export interface ROcrLogVo {
  code?: number
  msg?: string
  data?: OcrLogVo
}

/** 库存盘点单据业务对象 wms_check_order */
export interface CheckOrderBo {
  /** 创建者 */
  createBy?: string
  /** 创建时间 */
  createTime?: string
  /** 更新者 */
  updateBy?: string
  /** 更新时间 */
  updateTime?: string
  /** 请求参数 */
  params?: Record<string, unknown>
  id: number
  /** 状态 */
  checkOrderStatus?: number
  /** 盘点单号 */
  checkOrderNo?: string
  /** 计划日期 */
  planDate?: string
  /** 盘点人 */
  checkUser?: string
  /** 备注 */
  remark?: string
  /** 附件 */
  attachmentPath?: string
  details?: CheckOrderDetailBo[]
}

/** 库存盘点单据详情业务对象 wms_check_order_detail */
export interface CheckOrderDetailBo {
  /** 创建者 */
  createBy?: string
  /** 创建时间 */
  createTime?: string
  /** 更新者 */
  updateBy?: string
  /** 更新时间 */
  updateTime?: string
  /** 请求参数 */
  params?: Record<string, unknown>
  id: number
  /** 盘点单id */
  checkOrderId?: number
  /** 所属仓库 */
  warehouseId: number
  /** 所属库区 */
  areaId: number
  /** 备注 */
  remark?: string
}

/** 出库单详情视图对象 wms_shipment_order_detail */
export interface ShipmentOrderDetailVo {
  id?: number
  /** 出库单 */
  shipmentOrderId?: number
  /** 规格id */
  skuId?: number
  /** 数量 */
  quantity?: number
  /** 金额 */
  amount?: number
  /** 所属仓库 */
  warehouseId?: number
  /** 所属库区 */
  areaId?: number
  /** 批号 */
  batchNo?: string
  /** 生产日期 */
  productionDate?: string
  /** 过期时间 */
  expirationDate?: string
  /** 入库记录id */
  inventoryDetailId?: number
  /** 备注 */
  remark?: string
  itemSku?: ItemSkuVo
  remainQuantity?: number
  key?: string
}

/** 移库单业务对象 wms_movement_order */
export interface MovementOrderBo {
  /** 创建者 */
  createBy?: string
  /** 创建时间 */
  createTime?: string
  /** 更新者 */
  updateBy?: string
  /** 更新时间 */
  updateTime?: string
  /** 请求参数 */
  params?: Record<string, unknown>
  id: number
  /** 场景 0 整票移位 1 拆票移位 2 批量移库 */
  movementType?: number
  /** 类型 报关单/生产单 */
  type?: number
  /** 委托方 */
  consignorId?: number
  /** 库存id */
  inventoryId: number
  /** 业务单id */
  orderId?: number
  /** 移库单号 */
  movementOrderNo?: string
  /** 源仓库 */
  sourceWarehouseId: number
  /** 源库区 */
  sourceAreaId?: number
  /** 目标仓库 */
  targetWarehouseId: number
  /** 目标库区 */
  targetAreaId?: number
  /** 状态 */
  movementOrderStatus?: number
  /** 移库重量(吨)* */
  totalQuantity?: number
  /** 备注 */
  remark?: string
  /** 开始日期 */
  startDate?: string
  /** 开始时间 */
  startHour?: string
  /** 结束日期 */
  endDate?: string
  /** 结束时间 */
  endHour?: string
  /** 存放位置 */
  areas?: AreaItemBo[]
}

/** 表格分页数据对象 */
export interface TableDataInfoShipmentOrderDetailVo {
  /** 总记录数 */
  total?: number
  /** 列表数据 */
  rows?: ShipmentOrderDetailVo[]
  /** 消息状态码 */
  code?: number
  /** 消息内容 */
  msg?: string
}

/** 响应信息主体 */
export interface RListShipmentOrderDetailVo {
  code?: number
  msg?: string
  data?: ShipmentOrderDetailVo[]
}

/** 响应信息主体 */
export interface RShipmentOrderVo {
  code?: number
  msg?: string
  data?: ShipmentOrderVo
}

/** 操作日志记录业务对象 sys_oper_log */
export interface SysOperLogBo {
  /** 日志主键 */
  operId?: number
  /** 模块标题 */
  title?: string
  /** 业务类型 */
  businessCategory?: string
  /** 操作类型（0其它 1新增 2修改 3删除） */
  businessType?: number
  /** 业务类型数组 */
  businessTypes?: number[]
  /** 方法名称 */
  method?: string
  /** 请求方式 */
  requestMethod?: string
  /** 操作类别（0其它 1后台用户 2手机端用户） */
  operatorType?: number
  /** 操作人员 */
  operName?: string
  /** 部门名称 */
  deptName?: string
  /** 请求URL */
  operUrl?: string
  /** 主机地址 */
  operIp?: string
  /** 操作地点 */
  operLocation?: string
  /** 请求参数 */
  operParam?: string
  /** 返回参数 */
  jsonResult?: string
  /** 操作状态（0异常 1正常） */
  status?: number
  /** 错误消息 */
  errorMsg?: string
  /** 操作时间 */
  operTime?: string
  /** 消耗时间 */
  costTime?: number
  /** 业务单号 */
  businessNo?: string
  /** 操作内容：字段: 原值 → 新值 */
  operContent?: string
  /** 留痕详情：补充说明 */
  operDetail?: string
  /** 请求参数 */
  params?: Record<string, unknown>
}

/** MovementOrderBatchBo */
export interface MovementOrderBatchBo {
  /** 开始日期 */
  startDate?: string
  /** 开始时间 */
  startHour?: string
  /** 结束日期 */
  endDate?: string
  /** 结束时间 */
  endHour?: string
  list?: MovementOrderBo[]
}

/** 库存业务对象 wms_inventory */
export interface InventoryBo {
  /** 创建者 */
  createBy?: string
  /** 创建时间 */
  createTime?: string
  /** 更新者 */
  updateBy?: string
  /** 更新时间 */
  updateTime?: string
  /** 请求参数 */
  params?: Record<string, unknown>
  /** 报关单号 */
  recordNo?: string
  /** 物料 */
  itemId?: string
  /** 所属仓库 */
  areaId?: number
  /** 所属仓库 */
  warehouseId?: number
  /** 所属堆位 */
  areaCode?: string
  /** 委托方 */
  consignorId?: number
  /** 货物类型 */
  itemCategory?: string
  /** 物料类型 */
  itemType?: string
  /** 原产国 */
  originCountry?: string
  /** 矿源备案号 */
  recordNumber?: string
  /** 账册id */
  accountBookId?: number
  /** 状态 0 已入库 1 已用尽 */
  inventoryStatus?: number
}

/** 表格分页数据对象 */
export interface TableDataInfoShipmentOrderVo {
  /** 总记录数 */
  total?: number
  /** 列表数据 */
  rows?: ShipmentOrderVo[]
  /** 消息状态码 */
  code?: number
  /** 消息内容 */
  msg?: string
}

/** 响应信息主体 */
export interface RReceiptOrderDetailVo {
  code?: number
  msg?: string
  data?: ReceiptOrderDetailVo
}

/** 入库单详情视图对象 wms_receipt_order_detail */
export interface ReceiptOrderDetailVo {
  id?: number
  /** 入库单号 */
  receiptOrderId?: number
  /** 规格id */
  skuId?: number
  /** 入库数量 */
  quantity?: number
  /** 金额 */
  amount?: number
  /** 批号 */
  batchNo?: string
  /** 生产日期 */
  productionDate?: string
  /** 过期时间 */
  expirationDate?: string
  /** 备注 */
  remark?: string
  /** 所属仓库 */
  warehouseId?: number
  /** 所属库区 */
  areaId?: number
  itemSku?: ItemSkuVo
}

/** 表格分页数据对象 */
export interface TableDataInfoReceiptOrderDetailVo {
  /** 总记录数 */
  total?: number
  /** 列表数据 */
  rows?: ReceiptOrderDetailVo[]
  /** 消息状态码 */
  code?: number
  /** 消息内容 */
  msg?: string
}

export interface WarningRecordQuery {
  /** 分页大小 */
  pageSize?: number
  /** 当前页数 */
  pageNum?: number
  /** 排序列 */
  orderByColumn?: string
  /** 排序的方向desc或者asc */
  isAsc?: string
  /** 级别 1 低 2 中 3 高 */
  warningLevel?: number
  /** 类型 1 库容 2 库龄 3 码头超期 4 备案用量 */
  warningType?: number
  /** 关键字：仓库、批次或备案号 */
  keyword?: string
  /** 开始日期 */
  startDate?: string
  /** 结束日期 */
  endDate?: string
  firstNum?: number
}

/** 响应信息主体 */
export interface RListReceiptOrderDetailVo {
  code?: number
  msg?: string
  data?: ReceiptOrderDetailVo[]
}

/** 表格分页数据对象 */
export interface TableDataInfoWarningRecordVo {
  /** 总记录数 */
  total?: number
  /** 列表数据 */
  rows?: WarningRecordVo[]
  /** 消息状态码 */
  code?: number
  /** 消息内容 */
  msg?: string
}

/** 响应信息主体 */
export interface RReceiptOrderVo {
  code?: number
  msg?: string
  data?: ReceiptOrderVo
}

export interface WarningRecordVo {
  id?: number
  /** 时间（预警日期） */
  warningDate?: string
  /** 预警类型 1 库容 2 库龄 3 码头超期 4 备案用量 */
  warningType?: number
  /** 预警级别 1 低 2 中 3 高 */
  warningLevel?: number
  /** 对象 */
  targetName?: string
  /** 说明 */
  warningDesc?: string
  /** 状态 */
  status?: number
}

/** 响应信息主体 */
export interface RSystemParamVo {
  code?: number
  msg?: string
  data?: SystemParamVo
}

/** 表格分页数据对象 */
export interface TableDataInfoReceiptOrderVo {
  /** 总记录数 */
  total?: number
  /** 列表数据 */
  rows?: ReceiptOrderVo[]
  /** 消息状态码 */
  code?: number
  /** 消息内容 */
  msg?: string
}

/** SystemElementVo */
export interface SystemElementVo {
  /** 编号 */
  elementCode?: string
  /** 名称 */
  elementName?: string
  /** 是否必填（0 否 1是） */
  isRequired?: string
  /** 是否有害元素（0 否 1是） */
  isHarmful?: string
  /** 是否报税元素（0 否 1是） */
  isTaxDeclared?: string
}

/** 库存移动详情视图对象 wms_movement_order_detail */
export interface MovementOrderDetailVo {
  id?: number
  /** 移库单Id */
  movementOrderId?: number
  /** 规格id */
  skuId?: number
  /** 数量 */
  quantity?: number
  /** 备注 */
  remark?: string
  /** 批号 */
  batchNo?: string
  /** 生产日期 */
  productionDate?: string
  /** 过期时间 */
  expirationDate?: string
  /** 源仓库 */
  sourceWarehouseId?: number
  /** 源库区 */
  sourceAreaId?: number
  /** 目标仓库 */
  targetWarehouseId?: number
  /** 目标库区 */
  targetAreaId?: number
  /** 入库记录id */
  inventoryDetailId?: number
  itemSku?: ItemSkuVo
  inventoryDetail?: InventoryDetailVo
  remainQuantity?: number
}

/** 表格分页数据对象 */
export interface TableDataInfoShippingMethodVo {
  /** 总记录数 */
  total?: number
  /** 列表数据 */
  rows?: ShippingMethodVo[]
  /** 消息状态码 */
  code?: number
  /** 消息内容 */
  msg?: string
}

/** 响应信息主体 */
export interface RMovementOrderDetailVo {
  code?: number
  msg?: string
  data?: MovementOrderDetailVo
}

/** 响应信息主体 */
export interface RListShippingMethodVo {
  code?: number
  msg?: string
  data?: ShippingMethodVo[]
}

/** 表格分页数据对象 */
export interface TableDataInfoMovementOrderDetailVo {
  /** 总记录数 */
  total?: number
  /** 列表数据 */
  rows?: MovementOrderDetailVo[]
  /** 消息状态码 */
  code?: number
  /** 消息内容 */
  msg?: string
}

/** 响应信息主体 */
export interface RListMovementOrderDetailVo {
  code?: number
  msg?: string
  data?: MovementOrderDetailVo[]
}

/** 响应信息主体 */
export interface RMovementOrderVo {
  code?: number
  msg?: string
  data?: MovementOrderVo
}

/** 表格分页数据对象 */
export interface TableDataInfoMovementOrderVo {
  /** 总记录数 */
  total?: number
  /** 列表数据 */
  rows?: MovementOrderVo[]
  /** 消息状态码 */
  code?: number
  /** 消息内容 */
  msg?: string
}

/** OCR 查询对象 */
export interface OcrLogQueryBo {
  /** 创建者 */
  createBy?: string
  /** 创建时间 */
  createTime?: string
  /** 更新者 */
  updateBy?: string
  /** 更新时间 */
  updateTime?: string
  /** 请求参数 */
  params?: Record<string, unknown>
  id: number
  /** 类型 0 入库报关单 1 出库报关单 2 重量单 3 品质证书 */
  ocrLogType: number
  /** 任务号 */
  ocrLogNo?: string
  /** 关联单号(编码) */
  orderId?: number
  /** 关联单号 */
  orderNo?: string
  /** 状态 */
  ocrLogStatus?: number
  /** 开始时间 */
  beginTime?: string
  /** 结束时间 */
  endTime?: string
}

/** 响应信息主体 */
export interface RListReceiptOrderVo {
  code?: number
  msg?: string
  data?: ReceiptOrderVo[]
}

/** 表格分页数据对象 */
export interface TableDataInfoOcrLogVo {
  /** 总记录数 */
  total?: number
  /** 列表数据 */
  rows?: OcrLogVo[]
  /** 消息状态码 */
  code?: number
  /** 消息内容 */
  msg?: string
}

/** 响应信息主体 */
export interface RMerchantVo {
  code?: number
  msg?: string
  data?: MerchantVo
}

/** 表格分页数据对象 */
export interface TableDataInfoMerchantVo {
  /** 总记录数 */
  total?: number
  /** 列表数据 */
  rows?: MerchantVo[]
  /** 消息状态码 */
  code?: number
  /** 消息内容 */
  msg?: string
}

/** 响应信息主体 */
export interface RListMerchantVo {
  code?: number
  msg?: string
  data?: MerchantVo[]
}

/** 响应信息主体 */
export interface RItemSkuVo {
  code?: number
  msg?: string
  data?: ItemSkuVo
}

/** SystemParamVo */
export interface SystemParamVo {
  /** 库存预警阈值（库容占用%） */
  thresholdAlter?: number
  /** 原料库龄预警（天） */
  agingAlert?: number
  /** 码头仓库预警（天） */
  dockAlert?: number
  /** 矿源备案用量预警（%） */
  usageAlert?: number
  /** 密码最低长度 */
  passwordLength?: number
  /** 密码复杂度 */
  passwordComplexity?: string
  /** 密码错误次数后锁定 */
  passwordErrorNum?: number
  /** 账号异常尝试登录锁定时长 */
  accountLockTime?: number
  /** 系统未操作分钟数后退出 */
  sessionFreeTime?: number
  /** 首页数据刷新时效 */
  refreshInterval?: number
  elements?: SystemElementVo[]
}

/** 表格分页数据对象 */
export interface TableDataInfoItemSkuVo {
  /** 总记录数 */
  total?: number
  /** 列表数据 */
  rows?: ItemSkuVo[]
  /** 消息状态码 */
  code?: number
  /** 消息内容 */
  msg?: string
}

/** 响应信息主体 */
export interface RListItemSkuVo {
  code?: number
  msg?: string
  data?: ItemSkuVo[]
}

/** 响应信息主体 */
export interface RItemCategoryVo {
  code?: number
  msg?: string
  data?: ItemCategoryVo
}

/** 响应信息主体 */
export interface RReceiptDailyWeightDto {
  code?: number
  msg?: string
  data?: ReceiptDailyWeightDto
}

/** 响应信息主体 */
export interface RListItemTypeTreeSelectVo {
  code?: number
  msg?: string
  data?: ItemTypeTreeSelectVo[]
}

export interface ReceiptDailyWeightDto {
  arrivalDate?: string
  totalDryWeight?: number
}

/** 表格分页数据对象 */
export interface TableDataInfoItemCategoryVo {
  /** 总记录数 */
  total?: number
  /** 列表数据 */
  rows?: ItemCategoryVo[]
  /** 消息状态码 */
  code?: number
  /** 消息内容 */
  msg?: string
}

/** 响应信息主体 */
export interface RMineralSourceFilingVo {
  code?: number
  msg?: string
  data?: MineralSourceFilingVo
}

/** 表格分页数据对象 */
export interface TableDataInfoProductionOrderVo {
  /** 总记录数 */
  total?: number
  /** 列表数据 */
  rows?: ProductionOrderVo[]
  /** 消息状态码 */
  code?: number
  /** 消息内容 */
  msg?: string
}

/** 响应信息主体 */
export interface RListItemCategoryVo {
  code?: number
  msg?: string
  data?: ItemCategoryVo[]
}

/** 表格分页数据对象 */
export interface TableDataInfoMineralSourceFilingVo {
  /** 总记录数 */
  total?: number
  /** 列表数据 */
  rows?: MineralSourceFilingVo[]
  /** 消息状态码 */
  code?: number
  /** 消息内容 */
  msg?: string
}

/** 响应信息主体 */
export interface RListProductionOrderVo {
  code?: number
  msg?: string
  data?: ProductionOrderVo[]
}

/** 商品品牌视图对象 wms_item_brand */
export interface ItemBrandVo {
  /** 创建者 */
  createBy?: string
  /** 创建时间 */
  createTime?: string
  /** 更新者 */
  updateBy?: string
  /** 更新时间 */
  updateTime?: string
  id?: number
  /** 品牌名称 */
  brandName?: string
}

/** 响应信息主体 */
export interface RListMineralSourceFilingVo {
  code?: number
  msg?: string
  data?: MineralSourceFilingVo[]
}

/** 响应信息主体 */
export interface RItemBrandVo {
  code?: number
  msg?: string
  data?: ItemBrandVo
}

export interface ProductionOrderInspectionVo {
  id?: number
  /** 成品ID */
  productionOrderId?: number
  /** 附件URL */
  fileUrl?: string
  /** 备注 */
  remark?: string
}

/** 移库单视图对象 wms_movement_order */
export interface MovementOrderVo {
  /** 创建者 */
  createBy?: string
  /** 创建时间 */
  createTime?: string
  /** 更新者 */
  updateBy?: string
  /** 更新时间 */
  updateTime?: string
  id?: number
  /** 编号 */
  movementOrderNo?: string
  /** 报关单号 */
  recordNo?: string
  /** 生产批次 */
  batchNo?: string
  /** 库存id */
  inventoryId?: number
  /** 委托方 */
  consignorId?: number
  /** 物料 */
  itemId?: number
  /** 业务单 */
  orderId?: number
  /** 源仓库 */
  sourceWarehouseId?: number
  /** 源堆位 */
  sourceAreaId?: number
  /** 源存放位置(json字符串) */
  sourceAreaItems?: string
  /** 目标仓库 */
  targetWarehouseId?: number
  /** 目标堆位 */
  targetAreaId?: number
  /** 目标存放位置(json字符串) */
  targeAreaItems?: string
  /** 状态 */
  movementOrderStatus?: number
  /** 重量（吨） */
  totalQuantity?: number
  /** 备注 */
  remark?: string
  /** 开始日期 */
  startDate?: string
  /** 开始时间 */
  startHour?: string
  /** 结束日期 */
  endDate?: string
  /** 结束时间 */
  endHour?: string
  sourceArea?: AreaVo
  targetArea?: AreaVo
  consignor?: MerchantVo
  item?: ItemVo
  receiptOrder?: ReceiptOrderVo
  /** 存放位置(json字符串) */
  areaItems?: string
}

/** 表格分页数据对象 */
export interface TableDataInfoItemBrandVo {
  /** 总记录数 */
  total?: number
  /** 列表数据 */
  rows?: ItemBrandVo[]
  /** 消息状态码 */
  code?: number
  /** 消息内容 */
  msg?: string
}

/** 响应信息主体 */
export interface RProductionOrderInspectionVo {
  code?: number
  msg?: string
  data?: ProductionOrderInspectionVo
}

/** 响应信息主体 */
export interface RListItemBrandVo {
  code?: number
  msg?: string
  data?: ItemBrandVo[]
}

/** 表格分页数据对象 */
export interface TableDataInfoProductionOrderInspectionVo {
  /** 总记录数 */
  total?: number
  /** 列表数据 */
  rows?: ProductionOrderInspectionVo[]
  /** 消息状态码 */
  code?: number
  /** 消息内容 */
  msg?: string
}

/** 响应信息主体 */
export interface RItemVo {
  code?: number
  msg?: string
  data?: ItemVo
}

/** 响应信息主体 */
export interface RListProductionOrderInspectionVo {
  code?: number
  msg?: string
  data?: ProductionOrderInspectionVo[]
}

/** 表格分页数据对象 */
export interface TableDataInfoItemVo {
  /** 总记录数 */
  total?: number
  /** 列表数据 */
  rows?: ItemVo[]
  /** 消息状态码 */
  code?: number
  /** 消息内容 */
  msg?: string
}

/** 响应信息主体 */
export interface RListItemVo {
  code?: number
  msg?: string
  data?: ItemVo[]
}

/** 库存记录视图对象 wms_inventory_history */
export interface InventoryHistoryVo {
  id?: number
  /** 操作id（出库、入库、库存移动表单id） */
  orderId?: number
  /** 操作单号（入库、出库、移库、盘库单号） */
  orderNo?: string
  /** 操作类型 */
  orderType?: number
  /** 物料ID */
  skuId?: number
  /** 批号 */
  batchNo?: string
  /** 生产日期 */
  productionDate?: string
  /** 过期时间 */
  expirationDate?: string
  /** 金额 */
  amount?: number
  /** 库存变化 */
  quantity?: number
  /** 备注 */
  remark?: string
  /** 所属仓库 */
  warehouseId?: number
  /** 所属库区 */
  areaId?: number
  itemSku?: ItemSkuVo
  item?: ItemVo
  createTime?: string
}

/** 响应信息主体 */
export interface RInventoryHistoryVo {
  code?: number
  msg?: string
  data?: InventoryHistoryVo
}

/** 表格分页数据对象 */
export interface TableDataInfoInventoryHistoryVo {
  /** 总记录数 */
  total?: number
  /** 列表数据 */
  rows?: InventoryHistoryVo[]
  /** 消息状态码 */
  code?: number
  /** 消息内容 */
  msg?: string
}

/** 响应信息主体 */
export interface RInventoryDetailVo {
  code?: number
  msg?: string
  data?: InventoryDetailVo
}

/** 表格分页数据对象 */
export interface TableDataInfoInventoryDetailVo {
  /** 总记录数 */
  total?: number
  /** 列表数据 */
  rows?: InventoryDetailVo[]
  /** 消息状态码 */
  code?: number
  /** 消息内容 */
  msg?: string
}

/** 响应信息主体 */
export interface RListInventoryDetailVo {
  code?: number
  msg?: string
  data?: InventoryDetailVo[]
}

/** 响应信息主体 */
export interface RInventoryVo {
  code?: number
  msg?: string
  data?: InventoryVo
}

/** 表格分页数据对象 */
export interface TableDataInfoInventoryVo {
  /** 总记录数 */
  total?: number
  /** 列表数据 */
  rows?: InventoryVo[]
  /** 消息状态码 */
  code?: number
  /** 消息内容 */
  msg?: string
}

/** 响应信息主体 */
export interface RCheckOrderDetailVo {
  code?: number
  msg?: string
  data?: CheckOrderDetailVo
}

/** 表格分页数据对象 */
export interface TableDataInfoCheckOrderDetailVo {
  /** 总记录数 */
  total?: number
  /** 列表数据 */
  rows?: CheckOrderDetailVo[]
  /** 消息状态码 */
  code?: number
  /** 消息内容 */
  msg?: string
}

/** 响应信息主体 */
export interface RListCheckOrderDetailVo {
  code?: number
  msg?: string
  data?: CheckOrderDetailVo[]
}

export interface FloorPlanVo {
  /** ID */
  id?: number
  /** JSON数据 */
  jsonData?: string
}

/** 响应信息主体 */
export interface RListInventoryVo {
  code?: number
  msg?: string
  data?: InventoryVo[]
}

/** 响应信息主体 */
export interface RCheckOrderVo {
  code?: number
  msg?: string
  data?: CheckOrderVo
}

/** 响应信息主体 */
export interface RFloorPlanVo {
  code?: number
  msg?: string
  data?: FloorPlanVo
}

/** 表格分页数据对象 */
export interface TableDataInfoCheckOrderVo {
  /** 总记录数 */
  total?: number
  /** 列表数据 */
  rows?: CheckOrderVo[]
  /** 消息状态码 */
  code?: number
  /** 消息内容 */
  msg?: string
}

/** 表格分页数据对象 */
export interface TableDataInfoFloorPlanVo {
  /** 总记录数 */
  total?: number
  /** 列表数据 */
  rows?: FloorPlanVo[]
  /** 消息状态码 */
  code?: number
  /** 消息内容 */
  msg?: string
}

/** 响应信息主体 */
export interface RAreaVo {
  code?: number
  msg?: string
  data?: AreaVo
}

/** 响应信息主体 */
export interface RListFloorPlanVo {
  code?: number
  msg?: string
  data?: FloorPlanVo[]
}

/** 表格分页数据对象 */
export interface TableDataInfoAreaVo {
  /** 总记录数 */
  total?: number
  /** 列表数据 */
  rows?: AreaVo[]
  /** 消息状态码 */
  code?: number
  /** 消息内容 */
  msg?: string
}

/** 响应信息主体 */
export interface RListAreaVo {
  code?: number
  msg?: string
  data?: AreaVo[]
}

/** 库存盘点单据视图对象 wms_check_order */
export interface CheckOrderVo {
  /** 创建者 */
  createBy?: string
  /** 创建时间 */
  createTime?: string
  /** 更新者 */
  updateBy?: string
  /** 更新时间 */
  updateTime?: string
  id?: number
  /** 盘点单号 */
  checkOrderNo?: string
  /** 库存盘点单状态 -1：作废 0：未盘库 1：已盘库 */
  checkOrderStatus?: number
  /** 计划日期 */
  planDate?: string
  /** 盘点人 */
  checkUser?: string
  /** 附件 */
  attachmentPath?: string
  /** 备注 */
  remark?: string
  details?: CheckOrderDetailVo[]
}

/** 表格分页数据对象 */
export interface TableDataInfoGenTable {
  /** 总记录数 */
  total?: number
  /** 列表数据 */
  rows?: GenTable[]
  /** 消息状态码 */
  code?: number
  /** 消息内容 */
  msg?: string
}

/** 表格分页数据对象 */
export interface TableDataInfoGenTableColumn {
  /** 总记录数 */
  total?: number
  /** 列表数据 */
  rows?: GenTableColumn[]
  /** 消息状态码 */
  code?: number
  /** 消息内容 */
  msg?: string
}

/** 用户个人信息 */
export interface ProfileVo {
  user?: SysUserVo
  /** 用户所属角色组 */
  roleGroup?: string
  /** 用户所属岗位组 */
  postGroup?: string
}

/** 库存详情视图对象 wms_inventory_detail */
export interface InventoryDetailVo {
  /** 创建者 */
  createBy?: string
  /** 创建时间 */
  createTime?: string
  /** 更新者 */
  updateBy?: string
  /** 更新时间 */
  updateTime?: string
  id?: number
  /** 库存id */
  inventoryId?: number
  /** 报关单号 */
  recordNo?: string
  /** 生产批次 */
  batchNo?: string
  /** 业务单id */
  orderId?: number
  /** 物料id */
  itemId?: number
  /** 业务单号 */
  orderNo?: string
  /** 流向企业 */
  receivingCompanyId?: number
  /** 类型 1：入库 2：移库 3：出库 */
  inventoryType?: number
  /** 库存来源 1 入库 2 生产 */
  type?: number
  /** 所属仓库 */
  warehouseId?: number
  /** 所属库区/堆位 */
  areaId?: number
  /** 存放位置(json字符串) */
  areaItems?: string
  /** 原所属仓库 */
  oldWarehouseId?: number
  /** 原所属库区/堆位 */
  oldAreaId?: number
  /** 原存放位置(json字符串) */
  oldAreaItems?: string
  /** 湿重(吨) */
  wetWeight?: number
  /** 干重(吨) */
  dryWeight?: number
  /** 原湿重(吨) */
  oldWetWeight?: number
  /** 原干重(吨) */
  oldDryWeight?: number
  /** 日期 */
  oprDate?: string
  receivingCompany?: MerchantVo
  item?: ItemVo
  receiptOrder?: ReceiptOrderVo
  productionOrder?: ProductionOrderVo
  area?: AreaVo
  oldArea?: AreaVo
  /** 操作人 */
  createUser?: string
}

/** 响应信息主体 */
export interface RProfileVo {
  code?: number
  msg?: string
  data?: ProfileVo
}

/** 角色信息视图对象 sys_role */
export interface SysRoleVo {
  /** 角色ID */
  roleId?: number
  /** 角色名称 */
  roleName?: string
  /** 角色权限字符串 */
  roleKey?: string
  /** 显示顺序 */
  roleSort?: number
  /** 数据范围（1：全部数据权限 2：自定数据权限 3：本部门数据权限 4：本部门及以下数据权限） */
  dataScope?: string
  /** 菜单树选择项是否关联显示 */
  menuCheckStrictly?: boolean
  /** 部门树选择项是否关联显示 */
  deptCheckStrictly?: boolean
  /** 角色状态（0正常 1停用） */
  status?: string
  /** 备注 */
  remark?: string
  /** 创建时间 */
  createTime?: string
  /** 用户是否存在此角色标识 默认不存在 */
  flag?: boolean
  admin?: boolean
}

export interface SysUserVo {
  /** 用户ID */
  userId?: number
  /** 部门ID */
  deptId?: number
  /** 用户账号 */
  userName?: string
  /** 用户昵称 */
  nickName?: string
  /** 用户类型（sys_user系统用户） */
  userType?: string
  /** 用户邮箱 */
  email?: string
  /** 手机号码 */
  phonenumber?: string
  /** 用户性别 */
  sex?: string
  /** 用户头像 */
  avatar?: string
  /** 帐号状态（0正常 1停用） */
  status?: string
  /** 删除标志（0代表存在 1代表删除） */
  delFlag?: string
  /** 最后登录IP */
  loginIp?: string
  /** 最后登录时间 */
  loginDate?: string
  /** 备注 */
  remark?: string
  /** 部门名 */
  deptName?: string
  /** 角色对象 */
  roles?: SysRoleVo[]
  /** 角色组 */
  roleIds?: number[]
  /** 岗位组 */
  postIds?: number[]
  /** 数据权限 当前角色ID */
  roleId?: number
  /** 创建时间 */
  createTime?: string
}

/** 表格分页数据对象 */
export interface TableDataInfoSysUserVo {
  /** 总记录数 */
  total?: number
  /** 列表数据 */
  rows?: SysUserVo[]
  /** 消息状态码 */
  code?: number
  /** 消息内容 */
  msg?: string
}

/** 库存视图对象 wms_inventory */
export interface InventoryVo {
  id?: number
  /** 业务单id */
  orderId?: number
  /** 委托方 */
  consignorId?: number
  /** 报关单号 */
  recordNo?: string
  /** 生产批次 */
  batchNo?: string
  /** 库存来源 1 入库 2 生产 */
  type?: number
  /** 物料ID */
  itemId?: number
  /** 所属仓库 */
  warehouseId?: number
  /** 所属库区/堆位 */
  areaId?: number
  /** 存放位置(json字符串) */
  areaItems?: string
  /** 湿重(吨) */
  wetWeight?: number
  /** 干重(吨) */
  dryWeight?: number
  /** 入库时间 */
  inboundTime?: string
  consignor?: MerchantVo
  item?: ItemVo
  receiptOrder?: ReceiptOrderVo
  productionOrder?: ProductionOrderVo
  area?: AreaVo
  accountBook?: AccountBookVo
  /** 状态 0 在库 1 原料出清 2 生产中 3 出清，产品在库 4 已出库 */
  inventoryStatus?: number
}

/** 响应信息主体 */
export interface RListTreeLong {
  code?: number
  msg?: string
  data?: TreeLong[]
}

export interface TreeNodeConfig {
  idKey?: string
  parentIdKey?: string
  weightKey?: string
  nameKey?: string
  childrenKey?: string
  deep?: number
}

export interface InventorySumDto {
  /** 原料湿重(吨) */
  wetWeight?: number
  /** 原料干重(吨) */
  dryWeight?: number
  /** 成品湿重(吨) */
  prodWetWeight?: number
  /** 成品干重(吨) */
  prodDryWeight?: number
}

/** 响应信息主体 */
export interface RSysRoleVo {
  code?: number
  msg?: string
  data?: SysRoleVo
}

export interface AccountBookVo {
  /** id */
  id?: number
  /** 账册编号 */
  accountCode?: string
  /** 账册名称 */
  accountName?: string
  /** 经营单位 */
  operatingUnit?: string
  /** 货值 */
  goodsValue?: number
  /** 报关单号 */
  customsDeclarationNumber?: string
  /** 备案状态 */
  filingStatus?: string
  /** 衔接旧账ID */
  oldAccountId?: number
  /** 衔接旧账 */
  oldAccountName?: string
  /** 旧账册预警日期 */
  earlyWarningTime?: string
  /** 备注 */
  remark?: string
}

/** 响应信息主体 */
export interface RAreaInventoryDto {
  code?: number
  msg?: string
  data?: AreaInventoryDto
}

/** 响应信息主体 */
export interface RInventorySumDto {
  code?: number
  msg?: string
  data?: InventorySumDto
}

/** 响应信息主体 */
export interface RListSysRoleVo {
  code?: number
  msg?: string
  data?: SysRoleVo[]
}

/** 响应信息主体 */
export interface RAccountBookVo {
  code?: number
  msg?: string
  data?: AccountBookVo
}

/** 响应信息主体 */
export interface RListWarningRecordVo {
  code?: number
  msg?: string
  data?: WarningRecordVo[]
}

/** 表格分页数据对象 */
export interface TableDataInfoSysRoleVo {
  /** 总记录数 */
  total?: number
  /** 列表数据 */
  rows?: SysRoleVo[]
  /** 消息状态码 */
  code?: number
  /** 消息内容 */
  msg?: string
}

/** 表格分页数据对象 */
export interface TableDataInfoAccountBookVo {
  /** 总记录数 */
  total?: number
  /** 列表数据 */
  rows?: AccountBookVo[]
  /** 消息状态码 */
  code?: number
  /** 消息内容 */
  msg?: string
}

/** 响应信息主体 */
export interface RMapStringLong {
  code?: number
  msg?: string
  data?: Record<string, number>
}

/** 响应信息主体 */
export interface RSysPostVo {
  code?: number
  msg?: string
  data?: SysPostVo
}

/** 响应信息主体 */
export interface RListAccountBookVo {
  code?: number
  msg?: string
  data?: AccountBookVo[]
}

/** AreaInventoryDto */
export interface AreaInventoryDto {
  /** 干重 */
  dryWeight?: number
  /** 委托方 */
  consignorName?: string
  /** 堆位 */
  areaId?: number
  /** 仓库 */
  warehouseId?: number
  /** 网格信息 */
  areaItems?: string
  /** 矿种类型 */
  itemCategory?: string
}

/** 响应信息主体 */
export interface RListReceiptDailyWeightDto {
  code?: number
  msg?: string
  data?: ReceiptDailyWeightDto[]
}

/** 岗位信息视图对象 sys_post */
export interface SysPostVo {
  /** 岗位ID */
  postId?: number
  /** 岗位编码 */
  postCode?: string
  /** 岗位名称 */
  postName?: string
  /** 显示顺序 */
  postSort?: number
  /** 状态（0停用 1正常） */
  status?: string
  /** 备注 */
  remark?: string
  /** 创建时间 */
  createTime?: string
}

/** 响应信息主体 */
export interface RListAreaInventoryDto {
  code?: number
  msg?: string
  data?: AreaInventoryDto[]
}

/** 库存盘点单据详情视图对象 wms_check_order_detail */
export interface CheckOrderDetailVo {
  id?: number
  /** 盘点单id */
  checkOrderId?: number
  /** 所属仓库 */
  warehouseId?: number
  /** 所属库区 */
  areaId?: number
  /** 备注 */
  remark?: string
  area?: AreaVo
  warehouse?: WarehouseVo
}

/** 响应信息主体 */
export interface RListSysPostVo {
  code?: number
  msg?: string
  data?: SysPostVo[]
}

export interface DailyWeightDto {
  arrivalDate?: string
  totalDryWeight?: number
}

/** 表格分页数据对象 */
export interface TableDataInfoSysPostVo {
  /** 总记录数 */
  total?: number
  /** 列表数据 */
  rows?: SysPostVo[]
  /** 消息状态码 */
  code?: number
  /** 消息内容 */
  msg?: string
}

/** 响应信息主体 */
export interface RListDailyWeightDto {
  code?: number
  msg?: string
  data?: DailyWeightDto[]
}

/** OSS对象存储分页查询对象 sys_oss */
export interface SysOssBo {
  /** 创建者 */
  createBy?: string
  /** 创建时间 */
  createTime?: string
  /** 更新者 */
  updateBy?: string
  /** 更新时间 */
  updateTime?: string
  /** 请求参数 */
  params?: Record<string, unknown>
  /** ossId */
  ossId?: number
  /** 文件名 */
  fileName?: string
  /** 原名 */
  originalName?: string
  /** 文件后缀名 */
  fileSuffix?: string
  /** URL地址 */
  url?: string
  /** 服务商 */
  service?: string
}

/** OSS对象存储视图对象 sys_oss */
export interface SysOssVo {
  /** 对象存储主键 */
  ossId?: number
  /** 文件名 */
  fileName?: string
  /** 原名 */
  originalName?: string
  /** 文件后缀名 */
  fileSuffix?: string
  /** URL地址 */
  url?: string
  /** 创建时间 */
  createTime?: string
  /** 上传人 */
  createBy?: string
  /** 服务商 */
  service?: string
}

/** 表格分页数据对象 */
export interface TableDataInfoSysOssVo {
  /** 总记录数 */
  total?: number
  /** 列表数据 */
  rows?: SysOssVo[]
  /** 消息状态码 */
  code?: number
  /** 消息内容 */
  msg?: string
}

/** 响应信息主体 */
export interface RListSysOssVo {
  code?: number
  msg?: string
  data?: SysOssVo[]
}

/** 响应信息主体 */
export interface RSysOssConfigVo {
  code?: number
  msg?: string
  data?: SysOssConfigVo
}

/** 对象存储配置视图对象 sys_oss_config */
export interface SysOssConfigVo {
  /** 主建 */
  ossConfigId?: number
  /** 配置key */
  configKey?: string
  /** accessKey */
  accessKey?: string
  /** 秘钥 */
  secretKey?: string
  /** 桶名称 */
  bucketName?: string
  /** 前缀 */
  prefix?: string
  /** 访问站点 */
  endpoint?: string
  /** 自定义域名 */
  domain?: string
  /** 是否https（Y=是,N=否） */
  isHttps?: string
  /** 域 */
  region?: string
  /** 是否默认（0=是,1=否） */
  status?: string
  /** 扩展字段 */
  ext1?: string
  /** 备注 */
  remark?: string
  /** 桶权限类型(0private 1public 2custom) */
  accessPolicy?: string
}

/** 表格分页数据对象 */
export interface TableDataInfoSysOssConfigVo {
  /** 总记录数 */
  total?: number
  /** 列表数据 */
  rows?: SysOssConfigVo[]
  /** 消息状态码 */
  code?: number
  /** 消息内容 */
  msg?: string
}

/** 响应信息主体 */
export interface RSysNoticeVo {
  code?: number
  msg?: string
  data?: SysNoticeVo
}

/** 通知公告视图对象 sys_notice */
export interface SysNoticeVo {
  /** 公告ID */
  noticeId?: number
  /** 公告标题 */
  noticeTitle?: string
  /** 公告类型（1通知 2公告） */
  noticeType?: string
  /** 公告内容 */
  noticeContent?: string
  /** 公告状态（0正常 1关闭） */
  status?: string
  /** 备注 */
  remark?: string
  /** 创建者 */
  createBy?: string
  /** 创建人名称 */
  createByName?: string
  /** 创建时间 */
  createTime?: string
}

/** 表格分页数据对象 */
export interface TableDataInfoSysNoticeVo {
  /** 总记录数 */
  total?: number
  /** 列表数据 */
  rows?: SysNoticeVo[]
  /** 消息状态码 */
  code?: number
  /** 消息内容 */
  msg?: string
}

/** 响应信息主体 */
export interface RSysMenuVo {
  code?: number
  msg?: string
  data?: SysMenuVo
}

/** 菜单权限视图对象 sys_menu */
export interface SysMenuVo {
  /** 菜单ID */
  menuId?: number
  /** 菜单名称 */
  menuName?: string
  /** 父菜单ID */
  parentId?: number
  /** 显示顺序 */
  orderNum?: number
  /** 路由地址 */
  path?: string
  /** 组件路径 */
  component?: string
  /** 路由参数 */
  queryParam?: string
  /** 是否为外链（0是 1否） */
  isFrame?: string
  /** 是否缓存（0缓存 1不缓存） */
  isCache?: string
  /** 菜单类型（M目录 C菜单 F按钮） */
  menuType?: string
  /** 显示状态（0显示 1隐藏） */
  visible?: string
  /** 菜单状态（0正常 1停用） */
  status?: string
  /** 权限标识 */
  perms?: string
  /** 菜单图标 */
  icon?: string
  /** 创建部门 */
  createDept?: number
  /** 备注 */
  remark?: string
  /** 创建时间 */
  createTime?: string
  /** 子菜单 */
  children?: SysMenuVo[]
}

/** 响应信息主体 */
export interface RListSysMenuVo {
  code?: number
  msg?: string
  data?: SysMenuVo[]
}

/** 响应信息主体 */
export interface RSysDictTypeVo {
  code?: number
  msg?: string
  data?: SysDictTypeVo
}

/** 字典类型视图对象 sys_dict_type */
export interface SysDictTypeVo {
  /** 字典主键 */
  dictId?: number
  /** 字典名称 */
  dictName?: string
  /** 字典类型 */
  dictType?: string
  /** 备注 */
  remark?: string
  /** 状态 */
  status?: string
  /** 创建时间 */
  createTime?: string
}

/** 响应信息主体 */
export interface RListSysDictTypeVo {
  code?: number
  msg?: string
  data?: SysDictTypeVo[]
}

/** 表格分页数据对象 */
export interface TableDataInfoSysDictTypeVo {
  /** 总记录数 */
  total?: number
  /** 列表数据 */
  rows?: SysDictTypeVo[]
  /** 消息状态码 */
  code?: number
  /** 消息内容 */
  msg?: string
}

/** 响应信息主体 */
export interface RSysDictDataVo {
  code?: number
  msg?: string
  data?: SysDictDataVo
}

/** 响应信息主体 */
export interface RListSysDictDataVo {
  code?: number
  msg?: string
  data?: SysDictDataVo[]
}

export interface TreeLong {
  name?: {
    empty?: boolean
  }
  id?: number
  parentId?: number
  config?: TreeNodeConfig
  weight?: unknown
  empty?: boolean
}

/** 表格分页数据对象 */
export interface TableDataInfoSysDictDataVo {
  /** 总记录数 */
  total?: number
  /** 列表数据 */
  rows?: SysDictDataVo[]
  /** 消息状态码 */
  code?: number
  /** 消息内容 */
  msg?: string
}

/** 响应信息主体 */
export interface RSysDeptVo {
  code?: number
  msg?: string
  data?: SysDeptVo
}

/** 部门视图对象 sys_dept */
export interface SysDeptVo {
  /** 部门id */
  deptId?: number
  /** 父部门id */
  parentId?: number
  /** 父部门名称 */
  parentName?: string
  /** 祖级列表 */
  ancestors?: string
  /** 部门名称 */
  deptName?: string
  /** 显示顺序 */
  orderNum?: number
  /** 负责人 */
  leader?: string
  /** 联系电话 */
  phone?: string
  /** 邮箱 */
  email?: string
  /** 部门状态（0停用 1正常） */
  status?: string
  /** 创建时间 */
  createTime?: string
}

/** 响应信息主体 */
export interface RListSysDeptVo {
  code?: number
  msg?: string
  data?: SysDeptVo[]
}

/** 响应信息主体 */
export interface RSysConfigVo {
  code?: number
  msg?: string
  data?: SysConfigVo
}

/** 参数配置视图对象 sys_config */
export interface SysConfigVo {
  /** 参数主键 */
  configId?: number
  /** 参数名称 */
  configName?: string
  /** 参数键名 */
  configKey?: string
  /** 参数键值 */
  configValue?: string
  /** 系统内置（Y是 N否） */
  configType?: string
  /** 备注 */
  remark?: string
  /** 创建时间 */
  createTime?: string
}

/** 表格分页数据对象 */
export interface TableDataInfoSysConfigVo {
  /** 总记录数 */
  total?: number
  /** 列表数据 */
  rows?: SysConfigVo[]
  /** 消息状态码 */
  code?: number
  /** 消息内容 */
  msg?: string
}

/** 表格分页数据对象 */
export interface TableDataInfoSysOperLogVo {
  /** 总记录数 */
  total?: number
  /** 列表数据 */
  rows?: SysOperLogVo[]
  /** 消息状态码 */
  code?: number
  /** 消息内容 */
  msg?: string
}

/** 当前在线会话 */
export interface SysUserOnline {
  /** 会话编号 */
  tokenId?: string
  /** 部门名称 */
  deptName?: string
  /** 用户名称 */
  userName?: string
  /** 登录IP地址 */
  ipaddr?: string
  /** 登录地址 */
  loginLocation?: string
  /** 浏览器类型 */
  browser?: string
  /** 操作系统 */
  os?: string
  /** 登录时间 */
  loginTime?: number
}

/** 字典数据视图对象 sys_dict_data */
export interface SysDictDataVo {
  /** 字典编码 */
  dictCode?: number
  /** 字典排序 */
  dictSort?: number
  /** 字典标签 */
  dictLabel?: string
  /** 字典键值 */
  dictValue?: string
  /** 字典类型 */
  dictType?: string
  /** 样式属性（其他样式扩展） */
  cssClass?: string
  /** 表格回显样式 */
  listClass?: string
  /** 是否默认（Y是 N否） */
  isDefault?: string
  /** 状态（0停用 1正常） */
  status?: string
  /** 备注 */
  remark?: string
  /** 创建时间 */
  createTime?: string
  /** 是否必填（0 否 1是） */
  isRequired?: string
  isElement1?: string
  isElement2?: string
}

/** 表格分页数据对象 */
export interface TableDataInfoSysUserOnline {
  /** 总记录数 */
  total?: number
  /** 列表数据 */
  rows?: SysUserOnline[]
  /** 消息状态码 */
  code?: number
  /** 消息内容 */
  msg?: string
}

/** 系统访问记录视图对象 sys_logininfor */
export interface SysLogininforVo {
  /** 访问ID */
  infoId?: number
  /** 用户账号 */
  userName?: string
  /** 设备类型 */
  deviceType?: string
  /** 登录状态（0失败 1成功） */
  status?: string
  /** 登录IP地址 */
  ipaddr?: string
  /** 登录地点 */
  loginLocation?: string
  /** 浏览器类型 */
  browser?: string
  /** 操作系统 */
  os?: string
  /** 提示消息 */
  msg?: string
  /** 访问时间 */
  loginTime?: string
}

/** 表格分页数据对象 */
export interface TableDataInfoSysLogininforVo {
  /** 总记录数 */
  total?: number
  /** 列表数据 */
  rows?: SysLogininforVo[]
  /** 消息状态码 */
  code?: number
  /** 消息内容 */
  msg?: string
}

/** 响应信息主体 */
export interface RSysCache {
  code?: number
  msg?: string
  data?: SysCache
}

/** 缓存信息 */
export interface SysCache {
  /** 缓存名称 */
  cacheName?: string
  /** 缓存键名 */
  cacheKey?: string
  /** 缓存内容 */
  cacheValue?: string
  /** 备注 */
  remark?: string
}

/** 响应信息主体 */
export interface RListSysCache {
  code?: number
  msg?: string
  data?: SysCache[]
}

/** 响应信息主体 */
export interface RCollectionString {
  code?: number
  msg?: string
  data?: string[]
}

/** 路由显示信息 */
export interface MetaVo {
  /** 设置该路由在侧边栏和面包屑中展示的名字 */
  title?: string
  /** 设置该路由的图标，对应路径src/assets/icons/svg */
  icon?: string
  /** 设置为true，则不会被 <keep-alive>缓存 */
  noCache?: boolean
  /** 内链地址（http(s)://开头） */
  link?: string
}

/** 响应信息主体 */
export interface RListRouterVo {
  code?: number
  msg?: string
  data?: RouterVo[]
}

/** 路由配置信息 */
export interface RouterVo {
  /** 路由名字 */
  name?: string
  /** 路由地址 */
  path?: string
  /** 是否隐藏路由，当设置 true 的时候该路由不会再侧边栏出现 */
  hidden?: boolean
  /** 重定向地址，当设置 noRedirect 的时候该路由在面包屑导航中不可被点击 */
  redirect?: string
  /** 组件地址 */
  component?: string
  /** 路由参数：如 {"id": 1, "name": "ry"} */
  query?: string
  /** 当你一个路由下面的 children 声明的路由大于1个时，自动会变成嵌套的模式--如组件页面 */
  alwaysShow?: boolean
  meta?: MetaVo
}

/** 操作日志记录视图对象 sys_oper_log */
export interface SysOperLogVo {
  /** 日志主键 */
  operId?: number
  /** 模块标题 */
  title?: string
  /** 业务类型 */
  businessCategory?: string
  /** 操作类型（0其它 1新增 2修改 3删除） */
  businessType?: number
  /** 操作类型数组 */
  businessTypes?: number[]
  /** 方法名称 */
  method?: string
  /** 请求方式 */
  requestMethod?: string
  /** 操作类别（0其它 1后台用户 2手机端用户） */
  operatorType?: number
  /** 操作人员 */
  operName?: string
  /** 部门名称 */
  deptName?: string
  /** 请求URL */
  operUrl?: string
  /** 主机地址 */
  operIp?: string
  /** 操作地点 */
  operLocation?: string
  /** 请求参数 */
  operParam?: string
  /** 返回参数 */
  jsonResult?: string
  /** 操作状态（0异常 1正常） */
  status?: number
  /** 错误消息 */
  errorMsg?: string
  /** 操作时间 */
  operTime?: string
  /** 业务单号 */
  businessNo?: string
  /** 操作内容：字段: 原值 → 新值 */
  operContent?: string
  /** 留痕详情：补充说明 */
  operDetail?: string
  /** 消耗时间 */
  costTime?: number
}
