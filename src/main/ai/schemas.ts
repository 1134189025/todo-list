/**
 * AI 回复要遵守的结构（约束解码用）。
 *
 * 背景：Sub2API 反代的 Gemini 会在系统提示词前插一段身份说明，待办多、话长时模型容易写歪字段结构，
 * 本地校验随后报「AI 返回的内容看不懂」。这里用一份中立描述同时生成两种接口格式的写法：
 * Gemini 原生用 responseSchema（OpenAPI 子集：大写类型、nullable、enum、propertyOrdering，
 * 不用 additionalProperties / anyOf / $ref）；OpenAI 兼容用 response_format 的 json_schema
 * （标准 JSON Schema：小写类型、可空写 ["string","null"]）。
 *
 * 本地校验（extractJsonObject、readActions、sanitizeItem…）一律保留：结构只是让模型少写歪，兜底不变。
 */

/** 中立的结构描述：能生成 Gemini 和 OpenAI 两种写法的最小集合。 */
type NeutralSchema =
  | { kind: 'object'; fields: NeutralField[]; required: string[] }
  | { kind: 'array'; items: NeutralSchema }
  | { kind: 'string'; values?: readonly string[]; nullable?: boolean }
  | { kind: 'integer'; nullable?: boolean }

type NeutralField = { name: string; value: NeutralSchema }

/** 一次请求要用的结构约束：两种接口格式各自的写法。 */
export type RequestSchema = {
  /** Gemini 原生：generationConfig.responseSchema。 */
  gemini: Record<string, unknown>
  /** OpenAI 兼容：请求体里的 response_format。 */
  openai: Record<string, unknown>
}

function uppercaseType(kind: 'object' | 'array' | 'string' | 'integer'): string {
  return kind.toUpperCase()
}

function geminiNullable(nullable: boolean | undefined): Record<string, unknown> {
  return nullable === true ? { nullable: true } : {}
}

function toGemini(schema: NeutralSchema): Record<string, unknown> {
  switch (schema.kind) {
    case 'object':
      return {
        type: uppercaseType('object'),
        properties: Object.fromEntries(schema.fields.map((field) => [field.name, toGemini(field.value)])),
        required: schema.required,
        propertyOrdering: schema.fields.map((field) => field.name)
      }
    case 'array':
      return { type: uppercaseType('array'), items: toGemini(schema.items) }
    case 'string':
      return {
        type: uppercaseType('string'),
        ...(schema.values === undefined ? {} : { enum: schema.values }),
        ...geminiNullable(schema.nullable)
      }
    case 'integer':
      return { type: uppercaseType('integer'), ...geminiNullable(schema.nullable) }
  }
}

function toOpenAi(schema: NeutralSchema): Record<string, unknown> {
  switch (schema.kind) {
    case 'object':
      return {
        type: 'object',
        properties: Object.fromEntries(schema.fields.map((field) => [field.name, toOpenAi(field.value)])),
        required: schema.required
      }
    case 'array':
      return { type: 'array', items: toOpenAi(schema.items) }
    case 'string':
      return {
        type: schema.nullable === true ? ['string', 'null'] : 'string',
        // 可空又带枚举时，null 也要写进 enum（标准 JSON Schema 的要求）。目前没有这种字段，留着防以后写错。
        ...(schema.values === undefined
          ? {}
          : { enum: schema.nullable === true ? [...schema.values, null] : schema.values })
      }
    case 'integer':
      return { type: schema.nullable === true ? ['integer', 'null'] : 'integer' }
  }
}

function buildSchema(name: string, schema: NeutralSchema): RequestSchema {
  return {
    gemini: toGemini(schema),
    openai: { type: 'json_schema', json_schema: { name, strict: false, schema: toOpenAi(schema) } }
  }
}

// 待办操作的类型和紧急度取值，和 prompts.ts 里写的格式说明、本地校验认的值保持一致。
const ACTION_OPS = [
  'add',
  'complete',
  'reopen',
  'reschedule',
  'rename',
  'delete',
  'categorize',
  'urgency',
  'start',
  'pause',
  'create_category',
  'unknown'
] as const
const URGENCY_LEVELS = ['high', 'normal', 'low'] as const

/**
 * 一项操作：扁平的单一对象（不用 anyOf / oneOf / $ref，兼容性最好），只有 op 必填，其余按操作类型省略。
 * date / time 不能进 required：reschedule 里「没写 = 不改」和「null = 清掉」是两种意思。
 */
const ACTION_SCHEMA: NeutralSchema = {
  kind: 'object',
  fields: [
    { name: 'op', value: { kind: 'string', values: ACTION_OPS } },
    { name: 'id', value: { kind: 'integer' } },
    { name: 'title', value: { kind: 'string' } },
    { name: 'date', value: { kind: 'string', nullable: true } },
    { name: 'time', value: { kind: 'string', nullable: true } },
    { name: 'category', value: { kind: 'string', nullable: true } },
    { name: 'urgency', value: { kind: 'string', values: URGENCY_LEVELS } },
    { name: 'level', value: { kind: 'string', values: URGENCY_LEVELS } },
    { name: 'name', value: { kind: 'string' } },
    { name: 'text', value: { kind: 'string' } }
  ],
  required: ['op']
}

const ORDER_ITEM_SCHEMA: NeutralSchema = {
  kind: 'object',
  fields: [
    { name: 'id', value: { kind: 'string' } },
    { name: 'reason', value: { kind: 'string' } }
  ],
  required: ['id', 'reason']
}

/** 指令（文字）：{ actions, reply }。 */
export const COMMAND_TEXT_SCHEMA = buildSchema('qingxin_command', {
  kind: 'object',
  fields: [
    { name: 'actions', value: { kind: 'array', items: ACTION_SCHEMA } },
    { name: 'reply', value: { kind: 'string' } }
  ],
  required: ['actions', 'reply']
})

/** 指令（语音）：{ heard, actions, reply }，先听写再操作。 */
export const COMMAND_VOICE_SCHEMA = buildSchema('qingxin_command_voice', {
  kind: 'object',
  fields: [
    { name: 'heard', value: { kind: 'string' } },
    { name: 'actions', value: { kind: 'array', items: ACTION_SCHEMA } },
    { name: 'reply', value: { kind: 'string' } }
  ],
  required: ['heard', 'actions', 'reply']
})

/** 总结：{ headline, overview, order }。 */
export const SUMMARY_SCHEMA = buildSchema('qingxin_summary', {
  kind: 'object',
  fields: [
    { name: 'headline', value: { kind: 'string' } },
    { name: 'overview', value: { kind: 'string' } },
    { name: 'order', value: { kind: 'array', items: ORDER_ITEM_SCHEMA } }
  ],
  required: ['headline', 'overview', 'order']
})
