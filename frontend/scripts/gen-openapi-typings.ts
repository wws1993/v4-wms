/**
 * 从丰联 OpenAPI YAML 提取 components.schemas，生成 TypeScript interface。
 * 用法：在 frontend 目录执行 `bun run scripts/gen-openapi-typings.ts`
 */

import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/** 当前脚本所在目录 */
const scriptDir = path.dirname(fileURLToPath(import.meta.url))
/** frontend 根目录 */
const frontendRoot = path.resolve(scriptDir, '..')
/** 仓库根目录 */
const repoRoot = path.resolve(frontendRoot, '..')
/** OpenAPI YAML 源文件路径 */
const openapiPath = path.join(
  repoRoot,
  'docs',
  '对接文档',
  '广西丰联仓储系统_接口文档.openapi.yaml',
)
/** typings 输出目录 */
const outDir = path.join(frontendRoot, 'src', 'typings', 'openapi')
/** schemas.ts 输出路径 */
const schemasOutPath = path.join(outDir, 'schemas.ts')
/** index.ts 输出路径 */
const indexOutPath = path.join(outDir, 'index.ts')

/** OpenAPI schema 节点（宽松结构，覆盖本仓库契约） */
type OpenApiSchema = {
  /** JSON Schema 类型，可为单值或含 null 的数组 */
  type?: string | string[]
  /** 属性映射 */
  properties?: Record<string, OpenApiSchema>
  /** 必填属性名列表 */
  required?: string[]
  /** 数组元素 schema */
  items?: OpenApiSchema
  /** 组件引用 */
  $ref?: string
  /** 字段或类型说明 */
  description?: string
  /** 额外属性约束；false 表示禁止 */
  additionalProperties?: boolean | OpenApiSchema
  /** 数字/字符串格式（如 int64、date-time） */
  format?: string
}

/** OpenAPI 文档根结构中用到的片段 */
type OpenApiDoc = {
  /** 组件集合 */
  components?: {
    /** 具名 schema 映射 */
    schemas?: Record<string, OpenApiSchema>
  }
}

/**
 * 将 $ref 路径解析为 TypeScript 类型名。
 * @param ref OpenAPI 引用，如 `#/components/schemas/WarehouseVo`
 */
function refToTypeName(ref: string): string {
  /** 路径分段 */
  const segments = ref.split('/')
  return segments[segments.length - 1] ?? 'unknown'
}

/**
 * 转义 JSDoc 文本中的结束符与换行。
 * @param text 原始描述
 */
function escapeJsDoc(text: string): string {
  return text.replace(/\*\//g, '*\\/').replace(/\r?\n/g, ' ')
}

/**
 * 生成 JSDoc 注释行（不含尾随多余空行）。
 * @param description 描述文案；空则返回空串
 * @param indent 缩进空格数
 */
function formatJsDoc(description: string | undefined, indent: number): string {
  if (!description?.trim()) return ''
  /** 缩进前缀 */
  const pad = ' '.repeat(indent)
  /** 清洗后的描述 */
  const safe = escapeJsDoc(description.trim())
  return `${pad}/** ${safe} */`
}

/**
 * 从 type 字段拆出基础类型与是否可空。
 * @param typeField schema.type
 */
function normalizeTypeField(typeField: string | string[] | undefined): {
  /** 基础类型名；缺省为 object */
  baseType: string
  /** 是否包含 null */
  nullable: boolean
} {
  if (Array.isArray(typeField)) {
    /** 是否可空 */
    const nullable = typeField.includes('null')
    /** 非 null 的第一个类型 */
    const baseType = typeField.find((t) => t !== 'null') ?? 'object'
    return { baseType, nullable }
  }
  return { baseType: typeField ?? 'object', nullable: false }
}

/**
 * 将 OpenAPI schema 转为 TypeScript 类型表达式（属性级 / 内联）。
 * @param schema schema 节点
 * @param indent 当前缩进（用于内联对象属性）
 */
function schemaToTsType(schema: OpenApiSchema, indent = 0): string {
  if (schema.$ref) {
    return refToTypeName(schema.$ref)
  }

  /** 规范化后的类型信息 */
  const { baseType, nullable } = normalizeTypeField(schema.type)
  /** 核心类型字符串 */
  let core = 'unknown'

  if (baseType === 'string') {
    core = 'string'
  } else if (baseType === 'integer' || baseType === 'number') {
    core = 'number'
  } else if (baseType === 'boolean') {
    core = 'boolean'
  } else if (baseType === 'array') {
    /** 元素类型 */
    const itemType = schema.items ? schemaToTsType(schema.items, indent) : 'unknown'
    core = `${itemType}[]`
  } else if (baseType === 'object') {
    core = objectSchemaToTsType(schema, indent)
  }

  return nullable ? `${core} | null` : core
}

/**
 * 将 object schema 转为 TS 对象类型或 Record。
 * @param schema object schema
 * @param indent 缩进空格数
 */
function objectSchemaToTsType(schema: OpenApiSchema, indent: number): string {
  /** 属性字典 */
  const properties = schema.properties
  /** 必填集合 */
  const requiredSet = new Set(schema.required ?? [])
  /** 是否有具名属性 */
  const hasProps = Boolean(properties && Object.keys(properties).length > 0)

  if (hasProps && properties) {
    /** 属性缩进 */
    const propIndent = indent + 2
    /** 属性缩进前缀 */
    const pad = ' '.repeat(propIndent)
    /** 内联对象各行 */
    const lines: string[] = ['{']

    for (const [propName, propSchema] of Object.entries(properties)) {
      /** 属性 JSDoc */
      const doc = formatJsDoc(propSchema.description, propIndent)
      if (doc) lines.push(doc)
      /** 是否可选 */
      const optional = requiredSet.has(propName) ? '' : '?'
      /** 属性类型 */
      const propType = schemaToTsType(propSchema, propIndent)
      lines.push(`${pad}${propName}${optional}: ${propType}`)
    }
    lines.push(`${' '.repeat(indent)}}`)
    return lines.join('\n')
  }

  /** additionalProperties 约束 */
  const additional = schema.additionalProperties
  if (additional === true) {
    return 'Record<string, unknown>'
  }
  if (additional && typeof additional === 'object') {
    /** 值类型 */
    const valueType = schemaToTsType(additional, indent)
    return `Record<string, ${valueType}>`
  }

  // 空 object（如 RVoid.data）
  return 'unknown'
}

/**
 * 将顶层 schema 生成为 export interface / type 源码。
 * @param name schema 名称
 * @param schema schema 节点
 */
function schemaToDeclaration(name: string, schema: OpenApiSchema): string {
  if (schema.$ref) {
    return [
      formatJsDoc(schema.description, 0),
      `export type ${name} = ${refToTypeName(schema.$ref)}`,
    ]
      .filter(Boolean)
      .join('\n')
  }

  /** 规范化类型 */
  const { baseType, nullable } = normalizeTypeField(schema.type)

  // 非 object 顶层用 type 别名
  if (baseType !== 'object') {
    /** 别名目标（含可空） */
    const alias = schemaToTsType(schema, 0)
    return [formatJsDoc(schema.description, 0), `export type ${name} = ${alias}`]
      .filter(Boolean)
      .join('\n')
  }

  /** 属性字典 */
  const properties = schema.properties ?? {}
  /** 属性名列表 */
  const propNames = Object.keys(properties)

  // 无具名属性：退化为 type（Record / unknown）
  if (propNames.length === 0) {
    /** map/空对象类型 */
    let alias = objectSchemaToTsType(schema, 0)
    if (nullable) alias = `${alias} | null`
    return [formatJsDoc(schema.description, 0), `export type ${name} = ${alias}`]
      .filter(Boolean)
      .join('\n')
  }

  /** 必填集合 */
  const requiredSet = new Set(schema.required ?? [])
  /** 属性行 */
  const bodyLines: string[] = []
  for (const propName of propNames) {
    /** 属性 schema */
    const propSchema = properties[propName]!
    /** 属性 JSDoc */
    const doc = formatJsDoc(propSchema.description, 2)
    if (doc) bodyLines.push(doc)
    /** 可选标记 */
    const optional = requiredSet.has(propName) ? '' : '?'
    /** 属性类型 */
    const propType = schemaToTsType(propSchema, 2)
    bodyLines.push(`  ${propName}${optional}: ${propType}`)
  }

  /** interface 声明正文 */
  const iface = `export interface ${name} {\n${bodyLines.join('\n')}\n}`
  if (nullable) {
    return [
      formatJsDoc(schema.description, 0),
      `export type ${name} = {`,
      ...bodyLines,
      '} | null',
    ]
      .filter(Boolean)
      .join('\n')
  }
  return [formatJsDoc(schema.description, 0), iface].filter(Boolean).join('\n')
}

/**
 * 读取并解析 OpenAPI YAML。
 */
async function loadOpenApi(): Promise<OpenApiDoc> {
  /** YAML 文件句柄 */
  const file = Bun.file(openapiPath)
  if (!(await file.exists())) {
    throw new Error(`找不到 OpenAPI 文件：${openapiPath}`)
  }
  /** 原始文本 */
  const text = await file.text()
  return Bun.YAML.parse(text) as OpenApiDoc
}

/**
 * 生成 schemas.ts 与 index.ts 内容并写入磁盘。
 */
async function generate(): Promise<void> {
  /** 解析后的 OpenAPI 文档 */
  const doc = await loadOpenApi()
  /** 具名 schemas */
  const schemas = doc.components?.schemas
  if (!schemas || Object.keys(schemas).length === 0) {
    throw new Error('components.schemas 为空或不存在')
  }

  /** 生成文件头 */
  const header = [
    '/**',
    ' * 本文件由 scripts/gen-openapi-typings.ts 自动生成，请勿手动修改。',
    ' * 源：docs/对接文档/广西丰联仓储系统_接口文档.openapi.yaml',
    ' */',
    '',
  ].join('\n')

  /** 各 schema 源码块 */
  const chunks: string[] = []
  /** 已生成类型数量 */
  let typeCount = 0

  for (const [name, schema] of Object.entries(schemas)) {
    typeCount += 1
    chunks.push(schemaToDeclaration(name, schema))
  }

  /** schemas.ts 全文 */
  const schemasSource = `${header}${chunks.join('\n\n')}\n`
  /** index.ts 全文 */
  const indexSource = [
    '/**',
    ' * 本文件由 scripts/gen-openapi-typings.ts 自动生成，请勿手动修改。',
    ' */',
    "export type * from './schemas'",
    '',
  ].join('\n')

  await mkdir(outDir, { recursive: true })
  await Bun.write(schemasOutPath, schemasSource)
  await Bun.write(indexOutPath, indexSource)

  console.log(`已生成 ${typeCount} 个类型 → ${path.relative(frontendRoot, schemasOutPath)}`)
  console.log(`入口：${path.relative(frontendRoot, indexOutPath)}`)
}

await generate()
