import type { Route } from '@/api-map/types'
import { fail, ok } from '@/api/result'
import { encodeComplexity, loadPolicy, policyFromParams, savePolicy } from '@/security/policy'
import { ruoyiGet, ruoyiSend } from '@/api/ruoyi'
import type { Row } from '@/controller/shared/types'
import { idOf, num, text, yesCode, yesFlag } from '@/controller/shared/coerce'
import type { SystemParamBo, SystemParamVo } from '@/typings/openapi'

/** 判断参数字段是否已有有效值。 */
function hasParamValue(value: unknown) {
  return value !== undefined && value !== null && value !== ''
}

/** 保存系统参数与安全策略。 */
async function saveParams(body: Row) {
  const needBase = !hasParamValue(body.capacityWarn)
    || !hasParamValue(body.ageWarn)
    || !hasParamValue(body.dockDays)
    || !hasParamValue(body.filingUsageWarn)
    || !hasParamValue(body.refreshInterval)
    || (!Array.isArray(body.qualityItems) && !hasParamValue(body.qualities))
    || !hasParamValue(body.minLength)
  let merged: Row = { ...body }
  if (needBase) {
    const current = await loadParams()
    if (current.success && current.data && typeof current.data === 'object') {
      merged = { ...(current.data as Row), ...body }
    } else if (!hasParamValue(body.capacityWarn) || !hasParamValue(body.minLength)) {
      return fail(current.message || '无法读取当前系统参数')
    }
  }
  const items = Array.isArray(merged.qualityItems) ? merged.qualityItems as Row[] : []
  const elements = items.map((item) => ({
    elementCode: text(item.symbol).trim(),
    elementName: text(item.name).trim() || text(item.symbol).trim(),
    isRequired: text(item.isRequired) || '0',
    isHarmful: yesCode(item.harmful),
    isTaxDeclared: yesCode(item.taxable),
  })).filter((item) => item.elementCode || item.elementName)
  const fallback = elements.length ? elements : text(merged.qualities).split(/[、,，]/).map((item) => item.trim()).filter(Boolean).map((symbol) => ({
    elementCode: symbol,
    elementName: symbol,
    isRequired: '0',
    isHarmful: '0',
    isTaxDeclared: '0',
  }))
  const policy = policyFromParams({ ...loadPolicy(), ...merged })
  const payload: Partial<SystemParamBo> & { id?: number | string; elements?: unknown } & Row = {
    id: idOf(import.meta.env.VITE_SYSTEM_PARAM_ID || '1'),
    thresholdAlter: num(merged.capacityWarn),
    agingAlert: num(merged.ageWarn),
    dockAlert: num(merged.dockDays),
    usageAlert: num(merged.filingUsageWarn),
    refreshInterval: num(merged.refreshInterval),
    passwordLength: policy.minLength,
    passwordComplexity: encodeComplexity(policy),
    passwordErrorNum: policy.maxRetry,
    accountLockTime: policy.lockMinutes,
    sessionFreeTime: policy.idleMinutes,
    elements: fallback,
  }
  const result = await ruoyiSend('PUT', '/wms/system/params', payload)
  if (!result.ok) return fail(result.message)
  savePolicy(policy)
  return ok(true, '参数已保存')
}

/** 读取系统参数并同步本地安全策略。 */
async function loadParams() {
  const result = await ruoyiGet<SystemParamVo, SystemParamVo>(`/wms/system/params`)
  if (!result.ok) return fail(result.message)
  const data = (result.data || {}) as SystemParamVo & Row
  const elements = Array.isArray(data.elements) ? data.elements as Row[] : []
  const policy = policyFromParams(data)
  savePolicy(policy)
  return ok({
    capacityWarn: data.thresholdAlter,
    ageWarn: data.agingAlert,
    dockDays: data.dockAlert,
    filingUsageWarn: data.usageAlert,
    refreshInterval: data.refreshInterval,
    minLength: policy.minLength,
    requireUpper: policy.requireUpper,
    requireLower: policy.requireLower,
    requireDigit: policy.requireDigit,
    requireSpecial: policy.requireSpecial,
    maxRetry: policy.maxRetry,
    lockMinutes: policy.lockMinutes,
    idleMinutes: policy.idleMinutes,
    qualities: elements.map((item) => text(item.elementCode || item.elementName)).filter(Boolean).join('、'),
    qualityItems: elements.map((item) => {
      const row: Row = {
        symbol: text(item.elementCode),
        name: text(item.elementName || item.elementCode),
        isRequired: text(item.isRequired || '0'),
      }
      const harmful = yesFlag(item.isHarmful)
      const taxable = yesFlag(item.isTaxDeclared)
      if (harmful !== undefined) row.harmful = harmful
      if (taxable !== undefined) row.taxable = taxable
      return row
    }).filter((item) => item.symbol || item.name),
  })
}

/** 系统参数路由表 */
export const settingsRoutes: Route[] = [
  { method: 'GET', match: '/settings/params', handle: () => loadParams() },
  { method: 'PUT', match: '/settings/params', handle: ({ body }) => saveParams(body) },
]
