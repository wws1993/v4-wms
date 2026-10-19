# API 文档（草案）

> 下文「认证」起是前端草案，`frontend/` 已按此封装。默认 `VITE_USE_MOCK=true`，浏览器内返回 `{ "success": boolean, "data": any, "message": string }`；`VITE_USE_MOCK=false` 时请求发往 `VITE_API_BASE`（默认 `/api`）。不调用对外对接、开发进度、批注接口。
>
> 丰联已交付的后端契约是 [对接文档/广西丰联仓储系统_接口文档.openapi.yaml](对接文档/广西丰联仓储系统_接口文档.openapi.yaml)（OpenAPI 3.1，版本 5.2.0，若依风格）。开发环境基地址为 `http://47.108.190.246:8090`。字段对照见 [对接计划.md](对接计划.md)。`VITE_USE_MOCK=false` 时，只有 `VITE_LIVE_MODULES` 中的模块由 `frontend/src/api/fenglian.ts` 转发到丰联路径；未列入或文档未覆盖的路径仍走本地 mock。
>
> 前端动作额外预留：`PUT /api/warehouses/{id}`、`PUT /api/warehouses/stacks/{id}`、`PUT /api/materials/{id}`、`PUT /api/partners/{id}`、`PUT /api/bonded-books/{id}`、`PUT /api/inbound/{id}`、`PUT /api/outbound/{id}`、`PUT /api/auth/users/{id}`、`POST /api/production/{id}/complete`、`POST /api/production/{id}/inspect`、`POST /api/outbound/{id}/approve`、`GET /api/ocr/tasks`、`PUT /api/ocr/tasks/{id}`、`GET/PUT /api/settings/params`。

## 丰联后端协议（2026-10-06）

成功体为 `{ code, msg, data }`，分页为 `{ code, msg, rows, total }`，查询参数 `pageNum` / `pageSize`。鉴权头名为 `Authorization`。登录 `POST /login`（`username`、`password`、`code`、`uuid`），验证码 `GET /captchaImage`，登录后再调 `GET /getInfo`、`GET /getRouters`。主键为 `int64`。导出为 `POST` 文件流。开发环境基地址为 `http://47.108.190.246:8090`（OpenAPI `servers`）。本地 `VITE_API_BASE` 仍为 `/api`，由 `VITE_PROXY_TARGET` 转发到该地址。当前该环境 `GET /captchaImage` 返回 `captchaEnabled: false`。登录令牌在 `data.token`，请求头为 `Authorization: Bearer {token}`。登录、验证码、退出不随模块白名单关闭。其余模块由 `frontend/.env` 的 `VITE_LIVE_MODULES` 逐个放行。

列表查询里大量 `required` 来自业务对象注解，联调时按可选处理。

### 已覆盖路径

| 前端草案 | 丰联路径 | 说明 |
|----------|----------|------|
| `POST /api/auth/login`、`POST /api/auth/logout` | `POST /login`、`POST /logout`、`GET /getInfo`、`GET /getRouters`、`GET /captchaImage` | 登录后用路由过滤现有三角色侧栏 |
| `GET/POST /api/auth/users` | `/system/user`、`PUT /system/user/changeStatus` | 账号增改。列表启停走 changeStatus，不走整单编辑 |
| `GET/POST/DELETE /api/warehouses` | `/wms/warehouse` | 含 `list`、`listNoPage`、`export`、`DELETE /{id}` |
| `GET/POST/DELETE /api/warehouses/stacks` | `/wms/area` | 堆位；`DELETE /{id}`；网格仍来自平面图 |
| `GET/POST/DELETE /api/materials` | `/wms/item` | 矿源对应 `mineralSource`。列表和详情回读该字段；新增、修改一并提交。本机仍留一份，只在服务器没带回时补显示。`DELETE /{id}` 删除物料 |
| `GET/POST /api/material-sources/filings` | `/wms/mineralSourceFiling` | 列表 `list`，新建 `POST`，修改 `PUT`。矿源字典 `wms_mineral_source`，状态字典 `wms_filing_status`。附件为同一路径的 `multipart` 字段 `file`。导出 `POST /export`。票货走 `GET /wms/inventory/list` 的 `filingNo` |
| `GET/POST /api/partners` | `/wms/merchant` | `source`：0 手工、1 入库自动、2 出库自动；删除 `DELETE /wms/merchant/{id}` |
| `GET/POST /api/bonded-books` | `/wms/accountBook` | 备案默认衔接在用账册并停用旧账；无票矿结转 |
| （入库筛选项写死集装箱/散货） | `/wms/shippingMethod` | 货运方式档案，柜数在 `areaNumber` |
| `GET/PUT /api/settings/params` | `GET /wms/system/params/{id}`、`PUT /wms/system/params` | 库容、库龄、码头、备案用量、品质参数。本地 `qualityItems` 含是否有害、是否报税；丰联 `elements` 仅有元素编码与名称 |
| `GET/POST /api/inbound` | `/wms/receiptOrder` | `POST` 新建预约，`PUT` 到货收货。状态 `wms_receipt_status`，矿种 `wms_mineral_type`，币制 `wms_currency_type` |
| `GET /api/inventory` | `/wms/inventory/list` | 库存本票，按页查询。条件含委托方、堆位、仓库、单号、货物类型和起止时间；报关单号从关联入库单带回 |
| `GET /api/inventory/batches/{batchNo}` | `/wms/inventory/list` + `/wms/receiptOrder/{id}` + `/wms/ocr/{id}` | 本票详情。入库单上的报关单、重量单、品质证书 OCR 带回 `sourceUrl` 作为识别影像。台账先记入库一行。成品去向后端未提供 |
| `GET/POST /api/transfers` | `/wms/movementOrder` | `POST` 提交移库，必填移库单号和 `inventoryId`。列表只展示带目标堆位或移库单号的记录 |
| `POST /api/ocr/recognize`、`GET/PUT /api/ocr/tasks` | `/wms/ocr` | `POST` 为文件上传；类型 0–3 不含提单 |
| `GET/POST/PUT/DELETE /api/dicts` | `/system/dict/type`、`/system/dict/data` | 类型与字典值分开维护。状态 1 正常、0 停用。刷新缓存 `DELETE /system/dict/type/refreshCache`，同时清除浏览器 `sessionStorage` 中的字典枚举缓存。按类型读取 `/system/dict/data/type/{dictType}` 的结果按类型写入该缓存，同一会话内复用。`GET /dicts/labels?type=` 给堆位片区标识、物料货物类型和类型、往来主体角色提供下拉，只返回未停用的标签 |
| `GET /api/audit-logs` | `GET /monitor/operlog/list` | `operContent` 为字段原值到新值；不对接清理 |
| `GET/PUT /api/floor-plans` | `GET /wms/floorPlan/listNoPage`、`POST/PUT /wms/floorPlan` | 整图放在 `jsonData` 字符串。已有记录走修改并带 `id`，没有记录走新增。列表没有 JSON 时再读 `GET /wms/floorPlan/{id}` |

### 缺口（继续 mock）

OpenAPI 未单列路径、开发环境已实测可用：库存查询 `/wms/inventory/list`，移库 `/wms/movementOrder`。仍保持本地 mock：驾驶舱汇总、盘点与按月在库导出、库存预警、生产投料/完工/查验、出库单与审核、关务对账/申报/核销、账册票矿结转、月度账册。矿源备案走 `/wms/mineralSourceFiling`，票货用库存列表的备案号。入库预约与到货收货走 `/wms/receiptOrder`。园区平面图已对接。部门、公告、缓存、在线用户不进业务菜单。字典管理已进系统菜单，各业务页暂不改现有字典读取。

## 认证

- `POST /api/auth/login` — 登录（全站账号；按注册角色进入）。同一浏览器连续失败达到安全策略次数后，前端不再提交，并显示锁定倒计时。验证码错误不计入。成功后清除该账号的失败记录
- `PUT /api/auth/users/{id}/status` — 启用或停用账号，转发 `PUT /system/user/changeStatus`（`userId`、`status`：0 启用，1 停用）
- `GET/POST /api/auth/users` — 账号管理（管理员/仓管员/关务员统一注册；无所属关区）。新建时密码须符合安全策略。列表可启用或停用
- `POST /api/auth/logout`
- `POST /api/auth/password` — 修改当前用户密码。体为 `oldPassword`、`newPassword`。前端先按安全策略校验，且新密码不能与原密码相同。登录始终走丰联时，转发 `PUT /system/user/profile/updatePwd`（查询参数 `oldPassword`、`newPassword`）
- 安全策略存在浏览器 `localStorage` 键 `wms_security_policy`（最小长度、大小写/数字/特殊字符、失败次数、锁定分钟、空闲分钟），不写入丰联系统参数。失败计数与锁定截止时间在 `wms_login_lock`。空闲计时在 `sessionStorage` 键 `wms_session_at`。默认至少 8 位且含大小写、数字和特殊字符；连续失败 5 次锁定 10 分钟；空闲 30 分钟退出，提前 1 分钟提示

## 基础数据

- `GET/POST /api/warehouses` — 仓库档案（编号 1/2/4/5/6 及**码头仓库**，总库容，**面积㎡仅展示可编辑**，**排序 `orderNum`，数字越小越靠前**）。列表启停走 `PUT /warehouses/{id}/status`，丰联侧为编辑接口 `PUT /wms/warehouse`
- `GET/POST /api/warehouses/stacks` — 堆位（隶属于仓库；编码如 1#A1；含库容、片区标识、**排序 `orderNum`**；列表按排序号从小到大；网格 rows/cols **由园区平面图该堆位占格计算**，不在堆位档案单独维护；档案页不展示报关单号/生产批次/占用率/查验状态/状态，操作列无启用停用）。新建默认启用，编辑不提交状态
- `PUT /api/warehouses/stacks/{id}/area-label` — 更新片区标识（三类：**原料区 / 待检区 / 成品区**；完工入库写入待检区，查验完成改为成品区，留痕）
- `GET/PUT /api/floor-plans` — 园区平面图。`data` 为 `{ id, gridPx, gridCols, gridRows, items[] }`。`items[]` 含 `id/type/name/col/row/cols/rows/color?/stackId?/warehouseId?/capacity?/area?/archiveCode?/areaLabel?/status?/archive?`。点击保存时，已标为仓库的区块写入 `POST/PUT /warehouses`（新建须带库容、面积），仓库内堆位写入 `POST/PUT /warehouses/stacks`（堆位画笔在仓库内绘制即标为堆位；库容按所占格子占仓库的百分比，对仓库库容向下取整；改堆位大小或仓库库容后重算）。只提交这次打开后改过或删过的仓库和堆位，保存过程不再查询仓库或堆位列表。刷新后直接保存只写平面图，图上还没有编号的旧堆位不会再次新建。从图上删除的仓库、堆位在保存时调用对应 `DELETE`，先删除已记录的堆位，全部成功后再删除仓库。门、过道、设备、生产线不写入档案。门（`type=door`）固定一格长、三分之一格宽，设置里可绕中心旋转 90 度，不强制吸附网格，边线距网格线 2 像素内时自动贴上，坐标可为小数。普通区域同样不强制吸附，边线靠近网格线 2 像素时贴上，不设初始长宽。仓库和堆位不能改成普通区域或门。右上角「初始化」先清空平面图，再读取全部仓库和堆位，按面积估算占用画板约 70% 格子（留白 30%），堆位按库容平分所在仓库，不保留道路、办公楼等默认区块。右键仓库「初始化堆位」读取 `GET /warehouses/stacks`，按库容把该仓剩余空位（扣除过道、设备、门等占用）画成堆位。丰联侧把整图 `JSON.stringify` 后放在 `jsonData`：`GET /wms/floorPlan/listNoPage` 取最新一条，没有 JSON 时再 `GET /wms/floorPlan/{id}`；已有 `id` 时 `PUT /wms/floorPlan`，否则 `POST /wms/floorPlan`。平面图设置和驾驶舱都读这一份。服务器还没有记录、浏览器里仍有图块时，第一次读取会把本机 JSON 上传。`localStorage` 键 `wws.floor-plan` 只保留最近一次成功读回或上传的缓存。0 期原型文件存储见下文「原型平面图」
- `DELETE /api/materials/{id}` — 删除物料。丰联对应 `DELETE /wms/item/{id}`。本机补显示用的矿源一并去掉
- `GET/POST /api/materials` — 物料档案（原料：达标矿/报备矿；成品：混成品；原料手填矿源；可按货物类型、类型、编码/名称筛选；可导入 CSV。档案仅基础信息，不含原产国、备案号、商品编码、品质参数、附件、干湿重规则、默认账册、单证样例。矿源读写丰联字段 `mineralSource`）
- `GET /api/materials/export` — 物料档案导出（物料编码、名称、货物类型、类型、矿源；跟随当前筛选）
- `GET/POST /api/material-sources/filings` — 矿源备案。丰联为 `GET/POST/PUT /wms/mineralSourceFiling`。列含备案原产国、备案数量/核销/剩余/用量%、附件。状态字典 `wms_filing_status`（1 有效、2 即将用尽、3 已用尽）。弹窗单列手填矿源和备案编号，矿源按字典 `wms_mineral_source` 存编码，矿源种类选自 `wms_mineral_type` 并按名称写入 `category`。不展示状态、核销、剩余、用量和生产批次号。列表查询支持矿源、编号、状态、备案日期起止；矿源种类在页面上过滤。附件先以图片或 PDF 上传，路径写入 `fileUrl`
- `GET /api/material-sources/filings/export` — 矿源备案列表导出。未选矿源种类时为丰联 `POST /wms/mineralSourceFiling/export` 的 Excel；选了种类时按过滤结果导出 CSV
- `GET /api/material-sources/filings/{code}/lots` — 该备案下票货。丰联无单独路径，用 `GET /wms/inventory/list?filingNo=`（报关单、生产批次号、委托方、重量、堆位、状态）
- `GET /api/material-sources/filings/{code}/lots/export` — 备案票货导出 CSV，数据与上一接口相同
- `GET/POST /api/partners` — 往来主体（编码、名称、角色、联系电话、来源；弹窗不含状态，新建默认启用；委托方/物流账册主体手工维护；**流向企业由出库报关单字段自动识别写入**，不能改档、不能删除，列表可启停；**不含统一社会信用代码**）。启停走 `PUT /partners/{id}/status`，丰联侧为 `PUT /wms/merchant`。删除走 `DELETE /partners/{id}`，丰联侧为 `DELETE /wms/merchant/{id}`
- `GET /api/partners/consignors` — 委托方列表（五矿有色、广西金川、广西南国）
- `GET/POST /api/bonded-books` — 保税账册（编号、名称、旧账预警日；**默认衔接当前在用账册**；保存后旧账册改为**停用**，只把在册未出库票货转入新账册；列表查询支持关键字、**旧账预警起止日期**）
- `GET /api/bonded-books/{code}/lots` — 账册下全部出入库票矿
- `GET /api/bonded-books/{code}/lots/export` — 账册票矿导出 Excel
- `GET /api/ledger/monthly` — 月度账册（仅查询）。当月耗用大于 0 即全额出清，次月不再返回该票；未耗用继续返回
- `GET /api/ledger/monthly/export` — 按当前筛选导出月度账册 CSV（入库账期、票次、报关单号、入库吨、当月耗用、出清、次月库存）。不填月份时导出 2026-08
- `GET/PUT /api/roles/{id}/permissions` — 角色菜单权限（可见模块列表）

## 驾驶舱

- `GET /api/dashboard/cockpit` — 可视化驾驶舱汇总（KPI、仓库堆位占用、近 7 日入出库湿吨、作业流水时间到小时、账实一致率、预警列表）

## 业务单据

- `GET/POST /api/inbound` — 入库。状态来自 `wms_receipt_status`（待收货、暂存码头、已入库、混成品、作废）。矿种来自 `wms_mineral_type`（精铜矿、冰铜）。币制来自 `wms_currency_type`。装运方式取货运方式档案，柜数只展示。预约与到货登记不提交五项有害元素。查询支持时间范围、委托方、货运方式、矿种；关键字先按报关单号再按提单号。预约须提交预定堆位及堆位内存放格子（`stackCode` + `cells[{r,c}]`）。堆位按档案 id 或编码对应 `areaId`；图上 `1#B1` 与档案 `B1` 按所属仓库对齐。到货收货提交湿重、干重、水分，以及原料/成品分类和账册
- `GET/POST /api/transfers` — 移库（先选原堆位再选批次；委托方/报关单号/生产批次/物料/船名/柜数由批次带出只读；列表查询支持委托方、时间范围；`timeFrom`/`timeTo` 精确到时）。列表原堆位、目标堆位为堆位编号 `areaCode`（如 `1#A1`）
- `POST /api/transfers/batch` — 批量移库，可跨仓库勾选多票（支持仓库/堆位/委托方/关键字查询）后**各生成一条移库单**（不合并）
- `GET/POST /api/inventory` — 库存查询。查询先按单号、委托方、货物类型、堆位和时间，更多条件含物料类型、原产国、矿源备案号、保税账册、仓库。时间不限、本月，或自定义起止精确到时。列表按 `page` / `pageSize` 分页。品质八项；成品 `cargoType=混成品`、`originCountry` 为空；已出库堆位为空；响应不含类型列。丰联列表走 `/wms/inventory/list` 的 `pageNum` / `pageSize`
- `GET /api/inventory/batches/{batchNo}` — 本票详情。原料：报关单、重量证书、品质证书及八项品质参数，以及本票投入后的**成品/库存/出库**；成品：出库报关单、品质证书，以及本批次库存与出库（未出库时出库报关单为空）。`docs.customs` / `docs.weight` / `docs.quality` 为识别影像，`image` 指向 `/api` 下的 `sourceUrl`。`batchNo` 为报关单号或生产批次号
- `GET /api/inventory/batches/{batchNo}/ledger` — 干湿重及业务流水穿透；出库行含 `consignee`（流向企业）；`batchNo` 为**报关单号**或**生产批次号**（query `type=customs|production`）
- `GET /api/inventory/alerts` — 库容、库龄、**码头仓库超期（默认 7 天）**、备案用量预警。仓储菜单「库存预警」和驾驶舱预警使用该列表，查询支持 `type`、`level`、`keyword`、`from`/`to`。只读，`link` 为查看跳转地址。系统菜单不再提供预警日志
- `GET/POST /api/stocktakes` — 盘点（无类型字段；范围可多选仓库与堆位；创建可上传附件；不回写库存重量、不生成账实差异）
- `GET /api/stocktakes/onhand-export` — 按月份导出各委托方在库（数量湿/干重、堆位、货物类型、提单号、报关单号；`month=YYYY-MM`，取月末在库快照）
- `GET/POST /api/production` — 生产流转。单据 `docType` 为投料出库、加工过程或完工入库，投料与加工留在同一列表，完工另成单据。投料 `feedLines` 一票一行，`feedDry` 不得超过该报关单可用干吨；加工提交工序、起止时间和备注；完工入库提交成品物料、产量和待检区堆位。查询支持委托方、起止日期。完工入库库存批次取该生产批次号
- `GET /api/production/{prodBatchNo}` — 生产批次详情及关联报关单号谱系
- `GET/POST /api/outbound` — 出库；创建时可提交出库报关单 OCR（报关单号、核注清单号、流向企业、**消费使用单位**、重量、报关单金额）及备注；查询支持 `from`/`to` 时间范围；OCR 字段人工修正写入审计日志

## 关务 / OCR / 审计

- `GET /api/customs/reconcile` — 账实对账
- `GET /api/customs/reconcile/{id}/details` — 从差异汇总穿透至核注清单、报关单号和生产批次号
- `POST /api/customs/declarations` — 海关联网申报预留
- `POST /api/customs/bonded-books/write-off` — 电子账册核销预留
- `POST /api/ocr/recognize` — 单据识别
- `GET/POST /api/dicts/types`、`PUT/DELETE /api/dicts/types/{id}` — 字典类型。丰联为 `/system/dict/type` 与 `DELETE /system/dict/type/{dictIds}`。状态 1 正常、0 停用
- `GET/POST /api/dicts/data`、`PUT/DELETE /api/dicts/data/{id}` — 字典值，按所选类型查询。丰联为 `/system/dict/data` 与 `DELETE /system/dict/data/{dictCodes}`
- `DELETE /api/dicts/cache` — 刷新字典缓存，丰联为 `DELETE /system/dict/type/refreshCache`
- `GET /api/dicts/labels?type=` — 某字典类型下未停用的标签，供下拉使用。堆位片区标识 `wms_area_identification`，物料货物类型 `wms_item_category`，物料类型 `wms_item_type`，往来主体角色 `wms_merchant_type`（没有未停用值时再读 `merchant_type`）
- `GET /api/audit-logs` — 操作日志（操作人、模块、业务单号、报关单号、生产批次、仅关务、`from`/`to` 时间段；列表含操作内容与留痕详情）
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

## 原型开发进度（0期已实现）

与批注、平面图同一服务。数据文件 **`wms/data/dev-progress.json`**（覆盖代码时不要覆盖 `data/`）。能力清单基线在前端 `wms/dist/progress-seed.js`（来自 `docs/汇报/开发进度跟踪表.xlsx`），服务端只存提交后的覆盖值与变更日志。

- `GET /api/dev-progress` — `{ revision, updatedAt, clientIp, overrides, logs }`
- `PUT /api/dev-progress` — body：`{ id, patch, before, operator, operatorUser, capName, module }`；`id` 为 `CAP-###`。成功时 `data` 含本条 `item`、新日志 `log`、全量 `logs` 与 `clientIp`
- 日志字段：`at` / `atDisplay`（东八区）、`ip`（`X-Forwarded-For` 或连接地址）、`operator`、`capId`、`changes[]`（字段、修改前、修改后）
- 任一轨道为「阻塞」时必须带 `block`；无字段变化返回 400「没有变更」
