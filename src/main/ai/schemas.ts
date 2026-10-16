/**
 * AI 回复要遵守的结构（Gemini 原生 generationConfig.responseSchema，OpenAPI 子集：大写类型、nullable、enum、
 * required、propertyOrdering，不用 additionalProperties / $ref / oneOf）。
 *
 * 实测（sub2api 反代的 Gemini）：responseSchema 会被透传并真正约束输出；responseJsonSchema 会被丢掉；
 * OpenAI 兼容接口忽略 response_format，所以这里只有 Gemini 写法，OpenAI 请求不带结构。
 *
 * Action 用按操作分支的 anyOf：实测扁平的单一对象（所有字段可选、只有 op 必填）会让模型往 reschedule 里塞 urgency、
 * 重复操作、漏 date，所以不用。date / time 在 reschedule 分支里不进 required：「没写 = 不改，null = 清掉」。
 *
 * 本地校验（extractJsonObject、readActions、sanitizeItem…）一律保留：结构只是让模型少写歪，兜底不变。
 */

/** Gemini 的 responseSchema 对象。 */
export type RequestSchema = Record<string, unknown>

const S: RequestSchema = { type: 'STRING' }
const SN: RequestSchema = { type: 'STRING', nullable: true }
const I: RequestSchema = { type: 'INTEGER' }
const LEVEL: RequestSchema = { type: 'STRING', enum: ['high', 'normal', 'low'] }

/** 一个操作分支：op 限定为若干取值，required 之外的字段可以省略。 */
function branch(ops: string[], props: Record<string, RequestSchema>, required: string[]): RequestSchema {
  return {
    type: 'OBJECT',
    properties: { op: { type: 'STRING', enum: ops }, ...props },
    required: ['op', ...required],
    propertyOrdering: ['op', ...Object.keys(props)]
  }
}

const ACTION: RequestSchema = {
  anyOf: [
    branch(['add'], { title: S, date: SN, time: SN, category: SN, urgency: LEVEL }, ['title', 'date', 'time']),
    branch(['complete', 'reopen', 'delete', 'start', 'pause'], { id: I }, ['id']),
    branch(['reschedule'], { id: I, date: SN, time: SN }, ['id']),
    branch(['rename'], { id: I, title: S }, ['id', 'title']),
    branch(['categorize'], { id: I, category: SN }, ['id', 'category']),
    branch(['urgency'], { id: I, level: LEVEL }, ['id', 'level']),
    branch(['create_category'], { name: S }, ['name']),
    branch(['unknown'], { text: S }, ['text'])
  ]
}

/** 指令：文字是 { actions, reply }；语音是 { heard, actions, reply }，先听写再操作。 */
function commandSchema(voice: boolean): RequestSchema {
  const names = voice ? ['heard', 'actions', 'reply'] : ['actions', 'reply']
  return {
    type: 'OBJECT',
    properties: {
      ...(voice ? { heard: S } : {}),
      actions: { type: 'ARRAY', items: ACTION },
      reply: S
    },
    required: names,
    propertyOrdering: names
  }
}

/** 指令（文字）：{ actions, reply }。 */
export const COMMAND_TEXT_SCHEMA: RequestSchema = commandSchema(false)

/** 指令（语音）：{ heard, actions, reply }。 */
export const COMMAND_VOICE_SCHEMA: RequestSchema = commandSchema(true)

/** 总结：{ headline, overview, order: [{ id, reason }] }，全部必填。 */
export const SUMMARY_SCHEMA: RequestSchema = {
  type: 'OBJECT',
  properties: {
    headline: S,
    overview: S,
    order: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: { id: S, reason: S },
        required: ['id', 'reason'],
        propertyOrdering: ['id', 'reason']
      }
    }
  },
  required: ['headline', 'overview', 'order'],
  propertyOrdering: ['headline', 'overview', 'order']
}
