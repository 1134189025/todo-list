export type TaskSource = 'manual' | 'ai'

/** 紧急度三档：紧急 / 普通 / 不急。排序时 high 在前、low 在后。 */
export type Urgency = 'high' | 'normal' | 'low'

export const URGENCIES: readonly Urgency[] = ['high', 'normal', 'low']

export const DEFAULT_URGENCY: Urgency = 'normal'

/** 分类由用户完全自定义，一开始没有分类。createdAt 为 ISO 时间。 */
export type Category = { id: string; name: string; createdAt: string }

/** 分类名 trim、压缩空白后 1–20 个字符。 */
export const CATEGORY_NAME_MAX = 20

/** 最多 50 个分类（读文件时超出的部分跳过，合并新增时按现有条数判断）。 */
export const CATEGORY_LIMIT = 50

export type Task = {
  id: string
  title: string
  done: boolean
  dueDate: string | null
  dueTime: string | null
  createdAt: string
  completedAt: string | null
  source: TaskSource
  urgency: Urgency
  /** 进行中；done 为 true 时必须为 false。 */
  inProgress: boolean
  /** 指向 Category.id；指向不存在的分类时界面按「未分类」处理（不报错、不删字段）。 */
  categoryId: string | null
}
