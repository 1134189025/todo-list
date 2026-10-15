import type { TasksState } from '@shared/taskPatch'
import { normalizeCategoryName, sameCategoryName } from '@shared/text'
import { CATEGORY_LIMIT, CATEGORY_NAME_MAX, type Category } from '@shared/types'

export type NameCheck = { ok: true; name: string } | { ok: false; message: string }

/**
 * 分类名检查，不保存：trim、压缩空白后 1–20 个字，和其它分类不重名（不区分大小写）。
 * selfId：改名时排除自己。creating：新建时还要检查没有超过上限。
 */
export function checkCategoryName(
  raw: string,
  categories: readonly Category[],
  selfId?: string,
  creating = false
): NameCheck {
  const collapsed = raw.replace(/\s+/g, ' ').trim()
  if (collapsed === '') return { ok: false, message: '分类名不能为空' }
  if (collapsed.length > CATEGORY_NAME_MAX) return { ok: false, message: `分类名最多 ${CATEGORY_NAME_MAX} 个字` }
  if (creating && categories.length >= CATEGORY_LIMIT) {
    return { ok: false, message: `分类最多 ${CATEGORY_LIMIT} 个，先删掉一些再新建` }
  }
  const name = normalizeCategoryName(collapsed)
  if (categories.some((category) => category.id !== selfId && sameCategoryName(category.name, name))) {
    return { ok: false, message: `已经有叫「${name}」的分类了` }
  }
  return { ok: true, name }
}

/** 新建分类的检查：和 checkCategoryName 一样，另外不能超过上限。 */
export function checkNewCategory(raw: string, categories: readonly Category[]): NameCheck {
  return checkCategoryName(raw, categories, undefined, true)
}

/** 删除分类：分类去掉，指向它的待办改成未分类。 */
export function removeCategoryState(state: TasksState, id: string): TasksState {
  return {
    tasks: state.tasks.map((task) => (task.categoryId === id ? { ...task, categoryId: null } : task)),
    categories: state.categories.filter((category) => category.id !== id)
  }
}

/**
 * 撤销删除分类：分类放回（同名或已满 50 个时放不回），那几件待办里仍是未分类的改回指向它。
 * 放不回时原样返回，restored 为 false。
 */
export function restoreCategoryState(
  state: TasksState,
  category: Category,
  affected: ReadonlySet<string>
): { state: TasksState; restored: boolean } {
  const taken = state.categories.some(
    (existing) => existing.id === category.id || sameCategoryName(existing.name, category.name)
  )
  if (taken || state.categories.length >= CATEGORY_LIMIT) return { state, restored: false }
  return {
    restored: true,
    state: {
      categories: [...state.categories, category],
      tasks: state.tasks.map((task) =>
        affected.has(task.id) && task.categoryId === null ? { ...task, categoryId: category.id } : task
      )
    }
  }
}
