# API 文档（草案）

> 0期为原型阶段，接口待开发后细化。后端：**Java Spring Boot**。统一响应：`{ "success": boolean, "data": any, "message": string }`

## 认证

- `POST /api/auth/login` — 登录（支持普通账号 / 海关专用账号标识）
- `POST /api/auth/logout`

## 基础数据

- `GET/POST /api/warehouses` — 仓库档案（编号 1/2/4/5/6，总库容，无名称字段）
- `GET/POST /api/warehouses/stacks` — 堆位（隶属于仓库；编码如 1#A1；含库容与占用）
- `PUT /api/warehouses/stacks/{id}/area-label` — 更新片区标识（报关单号/生产批次号查验完成等触发，留痕）
- `GET/PUT /api/warehouses/{id}/floor-plan` — 仓库平面图（门/功能区/堆位矩形坐标与 90° 旋转；数量）；未配置则驾驶舱不展示。0 期原型已实现，见下文「原型平面图」
- `GET/POST /api/materials` — 物料档案（原料/成品、达标矿/报备矿；报备矿关联矿源，不含备案号/商品编码/品质参数）
- `GET/POST /api/material-sources/filings` — 矿源备案（报备矿；含备案数量/核销/剩余/用量%；一矿源多备案号；入库按矿源自动匹配）
- `GET/POST /api/partners` — 往来主体（委托方/货主/流向企业）
- `GET /api/partners/consignors` — 委托方列表（五矿有色、广西金川、广西南国）
- `GET/POST /api/bonded-books` — 保税账册
- `GET/PUT /api/roles/{id}/permissions` — 角色菜单权限（可见模块列表）

## 驾驶舱

- `GET /api/dashboard/cockpit` — 可视化驾驶舱汇总（KPI、仓库堆位占用、近 7 日入出库、作业流水、账实一致率、预警列表）

## 业务单据

- `GET/POST /api/inbound` — 入库
- `GET/POST /api/transfers` — 移库
- `POST /api/transfers/batch` — 批量/整票/拆票移库，统一校验库容并生成库存流水
- `GET/POST /api/inventory` — 库存查询
- `GET /api/inventory/batches/{batchNo}` — 本票详情（报关单、重量证书、品质证书及品质参数；`batchNo` 为报关单号或生产批次号）
- `GET /api/inventory/batches/{batchNo}/ledger` — 干湿重及业务流水穿透；`batchNo` 为**报关单号**或**生产批次号**（query `type=customs|production`）
- `GET /api/inventory/alerts` — 库容、库龄、账册到期与账实差异预警
- `GET/POST /api/stocktakes` — 盘点
- `GET/POST /api/production` — 生产流转；投料按**生产批次号**挂接 **1:N 报关单号**，完工入库库存批次取该生产批次号
- `GET /api/production/{prodBatchNo}` — 生产批次详情及关联报关单号谱系
- `GET/POST /api/outbound` — 出库；创建时可提交出库报关单 OCR 识别结果并回填报关单号、核注清单号

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
- `GET /api/floor-plans`（及 `/api/floorplans`）— 全量 `{ updatedAt, plans }`
- `PUT /api/floor-plans` — body：`{ id, rooms, doors, items, savedAt? }`；成功时 `data` 为 `{ id, rooms, doors, savedAt }`（整图已落盘，不在回包里重复）
- `GET/PUT /api/warehouses/{id}/floor-plan` — 单仓（兼容）

服务端联调仍可用 `node server.js`（需自行 `npm install`）。本地浏览原型**不必**再起本地批注服务。
