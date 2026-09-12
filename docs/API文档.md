# API 文档（草案）

> 0期为原型阶段，接口待开发后细化。后端：**Java Spring Boot**。统一响应：`{ "success": boolean, "data": any, "message": string }`

## 认证

- `POST /api/auth/login` — 登录（全站账号；按注册角色进入）
- `GET/POST /api/auth/users` — 账号管理（管理员/仓管员/关务员统一注册；无所属关区）
- `POST /api/auth/logout`

## 基础数据

- `GET/POST /api/warehouses` — 仓库档案（编号 1/2/4/5/6 及**码头仓库**，总库容，**面积㎡仅展示可编辑**）
- `GET/POST /api/warehouses/stacks` — 堆位（隶属于仓库；编码如 1#A1；含库容、片区标识；网格 rows/cols **由园区平面图该堆位占格计算**，不在堆位档案单独维护；档案页不展示报关单号/生产批次/占用率/查验状态）
- `PUT /api/warehouses/stacks/{id}/area-label` — 更新片区标识（报关单号/生产批次号查验完成等触发，留痕）
- `GET/PUT /api/floor-plans` — 园区平面图（`id=park`：网格行×列 `gridRows`/`gridCols`、功能区/仓库/生产线/门/堆位/道路/灌木坐标；`stackGrids` 各堆位行列）。旧 `GET/PUT /api/warehouses/{id}/floor-plan` 单仓接口保留兼容。0 期原型已实现，见下文「原型平面图」
- `GET/POST /api/materials` — 物料档案（原料：达标矿/报备矿；成品：混成品；报备矿关联矿源，不含原产国、备案号、商品编码、品质参数、附件）
- `GET /api/materials/export` — 物料档案导出 Excel（编码、名称、货物类型、类型、矿源）
- `GET/POST /api/material-sources/filings` — 矿源备案（报备矿；含备案原产国、备案数量/核销/剩余/用量%、附件；一矿源多备案号；入库按矿源自动匹配）
- `GET /api/material-sources/filings/export` — 矿源备案列表导出 Excel
- `GET /api/material-sources/filings/{code}/lots` — 该备案下全部票货（报关单/委托方/重量/堆位/状态）
- `GET /api/material-sources/filings/{code}/lots/export` — 备案票货导出 Excel
- `GET/POST /api/partners` — 往来主体（编码、名称、角色、联系电话、状态、来源；委托方/物流账册主体手工维护；**流向企业由出库报关单字段自动识别写入**；**不含统一社会信用代码**）
- `GET /api/partners/consignors` — 委托方列表（五矿有色、广西金川、广西南国）
- `GET/POST /api/bonded-books` — 保税账册（编号、名称、经营单位、**货值**、**报关单号**、状态；**新账衔接旧账时须填旧账预警日期**；旧账只出不进；到期未出库入库数据转入新账）
- `GET /api/bonded-books/{code}/lots` — 账册下全部出入库票矿
- `GET /api/bonded-books/{code}/lots/export` — 账册票矿导出 Excel
- `GET/PUT /api/roles/{id}/permissions` — 角色菜单权限（可见模块列表）

## 驾驶舱

- `GET /api/dashboard/cockpit` — 可视化驾驶舱汇总（KPI、仓库堆位占用、近 7 日入出库湿吨、作业流水时间到小时、账实一致率、预警列表）

## 业务单据

- `GET/POST /api/inbound` — 入库（状态：暂存码头/待收货/已入库/混成品；字段含矿种、五项有害元素 As/Pb/Cd/F/Hg、装运方式集装箱|散货、集装箱柜数；查询支持时间范围、货运方式、矿种）；预约须提交预定堆位及堆位内存放格子（`stackCode` + `cells[{r,c}]`）
- `GET/POST /api/transfers` — 移库（先选原堆位再选批次；含船名、柜数；`timeFrom`/`timeTo` 精确到时）
- `POST /api/transfers/batch` — 批量移库，勾选多票后**各生成一条移库单**（不合并）
- `GET/POST /api/inventory` — 库存查询（时间维度 `timeMode=month|range`，`range` 时 `from`/`to` 精确到小时；品质八项；成品 `cargoType=混成品`、`originCountry` 为空；已出库 `stackCode` 为空；响应不含类型列）
- `GET /api/inventory/batches/{batchNo}` — 本票详情。原料：报关单、重量证书、品质证书及八项品质参数；成品：仅出库报关单与品质证书（未出库时出库报关单为空）。`batchNo` 为报关单号或生产批次号
- `GET /api/inventory/batches/{batchNo}/ledger` — 干湿重及业务流水穿透；出库行含 `consignee`（流向企业）；`batchNo` 为**报关单号**或**生产批次号**（query `type=customs|production`）
- `GET /api/inventory/alerts` — 库容、库龄、**码头仓库超期（默认 7 天）**、账册到期与账实差异预警
- `GET/POST /api/stocktakes` — 盘点
- `GET /api/stocktakes/onhand-export` — 按月份导出各委托方在库（数量湿/干重、堆位、货物类型、提单号、报关单号；`month=YYYY-MM`，取月末在库快照）
- `GET/POST /api/production` — 生产流转；投料按**生产批次号**挂接 **1:N 报关单号**，记录**出库报关单号**；矿物按**达标矿/报备矿**展示；物料、船名/航次、提单号、来源国家在批次详情；完工入库库存批次取该生产批次号
- `GET /api/production/{prodBatchNo}` — 生产批次详情及关联报关单号谱系
- `GET/POST /api/outbound` — 出库；创建时可提交出库报关单 OCR（报关单号、核注清单号、流向企业、**消费使用单位**、重量、报关单金额）及备注；查询支持 `from`/`to` 时间范围；OCR 字段人工修正写入审计日志

## 关务 / OCR / 审计

- `GET /api/customs/reconcile` — 账实对账
- `GET /api/customs/reconcile/{id}/details` — 从差异汇总穿透至核注清单、报关单号和生产批次号
- `POST /api/customs/declarations` — 海关联网申报预留
- `POST /api/customs/bonded-books/write-off` — 电子账册核销预留
- `POST /api/ocr/recognize` — 单据识别
- `GET /api/audit-logs` — 操作日志（支持 `dateFrom`、`dateTo` 时间段及模块、操作人、业务单号等筛选）
- `GET /api/audit-logs/{id}` — 操作人、来源地址、业务单号及修改前后值详情

## 外部系统对接（预留）

- `/api/integrations/park/*` — 园区辅助监管
- `/api/integrations/erp/*` — 企业 ERP 订单、库存或主数据
- `/api/integrations/mes/*` — 生产系统工单与投入产出
- `/api/integrations/customs/*` — 海关单一窗口申报、回执与核销状态

所有外部接口须采用白名单及 HTTPS/专线，统一鉴权、幂等键、错误码、重试补偿和联调日志；最终报文以甲方及对端规范为准。

## 原型批注同步（0期已实现）

多设备共享批注。生产部署用 **宿主机 Python**（`wms/api/server.py`），避免国内 ECS 拉不到 Node 镜像；Nginx 反代 `/api/` → `host.docker.internal:3000`。接口已允许跨域（`Access-Control-Allow-Origin: *`），本地打开原型时前端直接请求线上地址。

- 线上（同源）：`/api/annotations`
- 本地预览：`http://wms.skd.wang/api/annotations`
- `GET /api/annotations` — 拉取全量 `{ revision, updatedAt, items }`
- `PUT /api/annotations` — 推送变更；body：`{ items, deletedIds?, baseRevision? }`；`baseRevision` 一致时整表替换，否则按 `id` + `updatedAt` 合并
- `DELETE /api/annotations` — 清空全部
- `GET /api/health` — 健康检查

## 原型平面图（0期已实现）

与批注同一 Node/Python 服务。数据文件 **`wms/data/floor-plans.json`**（与 `api` 目录分开，避免 XFTP 覆盖代码时丢数据）。

- 线上（同源）：`/api/floor-plans`、`/api/warehouses/{id}/floor-plan`
- 本地预览：`http://wms.skd.wang/api/...`
- `GET /api/floor-plans`（及 `/api/floorplans`）— 全量 `{ updatedAt, plans }`；园区图键为 `park`
- `PUT /api/floor-plans` — body：`{ id: "park", kind: "park", gridRows, gridCols, canvasW, canvasH, items, stackGrids?, savedAt? }`；旧字段 `grid`（像素）读取时按画板尺寸换算行列；成功时 `data` 为短回包（整图已落盘，不在回包里重复）
- `GET/PUT /api/warehouses/{id}/floor-plan` — 单仓（兼容旧数据）
- `items[].type`：`warehouse` / `idle` / `office` / `zone` / `line` / `door` / `stack` / `stamp`（`kind=road|bush` 为图标重复铺贴）；编辑器中 `stack` 填充固定为白色

服务端联调仍可用 `node server.js`（需自行 `npm install`）。本地浏览原型**不必**再起本地批注服务。
