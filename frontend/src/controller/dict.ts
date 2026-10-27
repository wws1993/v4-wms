import type { Route } from '@/api-map/types'
import { fail, ok } from '@/api/result'
import { ruoyiGet, ruoyiSend } from '@/api/ruoyi'
import type { Query, Row } from '@/controller/shared/types'
import { dictStatusCode, dictStatusLabel, idOf, num, text } from '@/controller/shared/coerce'
import { pageOf, pageParams } from '@/controller/shared/page'
import { clearDictCache, dictLabels, dictOptions } from '@/controller/shared/dict'
import type { SysDictDataBo, SysDictDataVo, SysDictTypeBo, SysDictTypeVo } from '@/typings/openapi'

/** 将字典类型 Vo 映射为列表行。 */
function dictTypeRow(row: SysDictTypeVo | Row): Row {
  return {
    id: text(row.dictId),
    name: text(row.dictName),
    type: text(row.dictType),
    status: dictStatusLabel(row.status),
    remark: text(row.remark),
    createdAt: text(row.createTime),
  }
}

/** 将字典数据 Vo 映射为列表行。 */
function dictDataRow(row: SysDictDataVo | Row): Row {
  return {
    id: text(row.dictCode),
    sort: row.dictSort ?? 0,
    label: text(row.dictLabel),
    value: text(row.dictValue),
    type: text(row.dictType),
    isDefault: text(row.isDefault) === 'Y' ? '是' : '否',
    cssClass: text(row.cssClass),
    listClass: text(row.listClass),
    status: dictStatusLabel(row.status),
    remark: text(row.remark),
    createdAt: text(row.createTime),
  }
}

/** 新建或更新字典类型。 */
async function saveDictType(id: string | undefined, body: Row) {
  const name = text(body.name).trim()
  const type = text(body.type).trim()
  if (!name) return fail('请填写字典名称')
  if (!/^[a-z][a-z0-9_]*$/.test(type)) return fail('字典类型须以小写字母开头，只能含小写字母、数字和下划线')
  const payload: Partial<SysDictTypeBo> = {
    dictName: name,
    dictType: type,
    status: dictStatusCode(body.status || '正常'),
    remark: text(body.remark),
  }
  if (id) payload.dictId = idOf(id) as SysDictTypeBo['dictId']
  const result = await ruoyiSend(id ? 'PUT' : 'POST', '/system/dict/type', payload)
  if (result.ok) clearDictCache()
  return result.ok ? ok(true, '已保存') : fail(result.message)
}

/** 新建或更新字典数据。 */
async function saveDictData(id: string | undefined, body: Row) {
  const label = text(body.label).trim()
  const value = text(body.value).trim()
  const type = text(body.type).trim()
  if (!type) return fail('请选择字典类型')
  if (!label) return fail('请填写字典标签')
  if (!value) return fail('请填写字典键值')
  const payload: Partial<SysDictDataBo> = {
    dictSort: num(body.sort) ?? 0,
    dictLabel: label,
    dictValue: value,
    dictType: type,
    isDefault: text(body.isDefault) === '是' ? 'Y' : 'N',
    cssClass: text(body.cssClass),
    listClass: text(body.listClass),
    status: dictStatusCode(body.status || '正常'),
    remark: text(body.remark),
  }
  if (id) payload.dictCode = idOf(id) as SysDictDataBo['dictCode']
  const result = await ruoyiSend(id ? 'PUT' : 'POST', '/system/dict/data', payload)
  if (result.ok) clearDictCache()
  return result.ok ? ok(true, '已保存') : fail(result.message)
}

/** 字典路由表 */
export const dictRoutes: Route[] = [
  { method: 'GET', match: '/dicts/types', handle: async ({ query }) => {
    const result = await ruoyiGet<SysDictTypeVo>('/system/dict/type/list', pageParams(query, {
      dictName: query.name || undefined,
      dictType: query.type || undefined,
      status: query.status ? dictStatusCode(query.status) : undefined,
    }))
    return pageOf(result, result.rows.map(dictTypeRow), query)
  } },
  { method: 'POST', match: '/dicts/types', handle: ({ body }) => saveDictType(undefined, body) },
  { method: 'DELETE', match: '/dicts/cache', handle: async () => {
    const result = await ruoyiSend('DELETE', '/system/dict/type/refreshCache')
    return result.ok ? ok(true, '字典缓存已刷新') : fail(result.message)
  } },
  { method: 'GET', match: '/dicts/labels', handle: async ({ query }) => ok(await dictLabels(text(query.type))) },
  { method: 'GET', match: '/dicts/options', handle: async ({ query }) => ok(await dictOptions(text(query.type))) },
  { method: 'PUT', match: /^\/dicts\/types\/([^/]+)$/, handle: ({ params, body }) => saveDictType(params[0], body) },
  { method: 'DELETE', match: /^\/dicts\/types\/([^/]+)$/, handle: async ({ params }) => {
    const result = await ruoyiSend('DELETE', `/system/dict/type/${params[0]}`)
    if (result.ok) clearDictCache()
    return result.ok ? ok(true, '已删除') : fail(result.message)
  } },
  { method: 'GET', match: '/dicts/data', handle: async ({ query }) => {
    const result = await ruoyiGet<SysDictDataVo>('/system/dict/data/list', pageParams(query, {
      dictType: query.type || undefined,
      dictLabel: query.label || undefined,
      status: query.status ? dictStatusCode(query.status) : undefined,
    }))
    return pageOf(result, result.rows.map(dictDataRow), query)
  } },
  { method: 'POST', match: '/dicts/data', handle: ({ body }) => saveDictData(undefined, body) },
  { method: 'PUT', match: /^\/dicts\/data\/([^/]+)$/, handle: ({ params, body }) => saveDictData(params[0], body) },
  { method: 'DELETE', match: /^\/dicts\/data\/([^/]+)$/, handle: async ({ params }) => {
    const result = await ruoyiSend('DELETE', `/system/dict/data/${params[0]}`)
    if (result.ok) clearDictCache()
    return result.ok ? ok(true, '已删除') : fail(result.message)
  } },
]
