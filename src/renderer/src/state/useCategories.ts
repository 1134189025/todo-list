import { useCallback, useEffect, useState } from 'react'
import { CATEGORY_LIMIT } from '@shared/types'
import { ALL_FILTER, type CategoryFilter, isFilterValid } from '../lib/categoryFilter'
import { checkCategoryName, removeCategoryState, restoreCategoryState } from '../lib/categoryOps'
import { createCategory } from '../lib/taskOps'
import type { TasksController } from './useTasks'

export type CategoryResult = { ok: true; id: string } | { ok: false; message: string }

export type CategoryActions = {
  /** 新建并返回新分类的 id；名字不合法（空、过长、重名、已满）时返回原因，不保存。 */
  create: (rawName: string) => CategoryResult
  /** 改名；名字不合法时返回原因，不保存。改成同一个名字视为成功、不做任何改动。 */
  rename: (id: string, rawName: string) => CategoryResult
  /** 删除：指向它的待办改成未分类；提示条可撤销，撤销时分类和待办的分类一起放回。 */
  remove: (id: string) => void
}

export type CategoriesController = CategoryActions & {
  /** 当前筛选。所选分类被删掉（这边删或别的窗口删）后回到「全部」。 */
  filter: CategoryFilter
  setFilter: (filter: CategoryFilter) => void
  /** 撤销删除时没能放回分类的说明（同名或已满）；下一次分类操作时清掉。 */
  notice: string | null
}

/** 分类的增删改和列表筛选。分类数据在 tasks 控制器里，这里只做操作和筛选状态。 */
export function useCategories(tasks: TasksController): CategoriesController {
  const { categories, snapshot, categoriesSnapshot, replace, replaceWithUndoState } = tasks
  const [chosen, setChosen] = useState<CategoryFilter>(ALL_FILTER)
  const [notice, setNotice] = useState<string | null>(null)
  const filter = categories === null || isFilterValid(chosen, categories) ? chosen : ALL_FILTER

  useEffect(() => {
    if (categories !== null && !isFilterValid(chosen, categories)) setChosen(ALL_FILTER)
  }, [categories, chosen])

  const create = useCallback(
    (rawName: string): CategoryResult => {
      const current = snapshot()
      const list = categoriesSnapshot()
      if (current === null || list === null) return { ok: false, message: '待办还没读取完成，稍后再试' }
      const check = checkCategoryName(rawName, list, undefined, true)
      if (!check.ok) return check
      const category = createCategory(check.name, new Date().toISOString())
      replace(current, [...list, category])
      setNotice(null)
      return { ok: true, id: category.id }
    },
    [snapshot, categoriesSnapshot, replace]
  )

  const rename = useCallback(
    (id: string, rawName: string): CategoryResult => {
      const current = snapshot()
      const list = categoriesSnapshot()
      const target = list?.find((category) => category.id === id)
      if (current === null || list === null || target === undefined) {
        return { ok: false, message: '这个分类已经不存在了' }
      }
      const check = checkCategoryName(rawName, list, id)
      if (!check.ok) return check
      if (check.name !== target.name) {
        replace(
          current,
          list.map((category) => (category.id === id ? { ...category, name: check.name } : category))
        )
      }
      setNotice(null)
      return { ok: true, id }
    },
    [snapshot, categoriesSnapshot, replace]
  )

  const remove = useCallback(
    (id: string): void => {
      const current = snapshot()
      const list = categoriesSnapshot()
      const target = list?.find((category) => category.id === id)
      if (current === null || list === null || target === undefined) return
      // 撤销时只把「这次被改成未分类」的待办改回去：那几件之后又被改过分类的不动。
      const affected = new Set(current.filter((task) => task.categoryId === id).map((task) => task.id))
      const next = removeCategoryState({ tasks: current, categories: list }, id)
      setNotice(null)
      replaceWithUndoState(next, `已删除分类「${target.name}」`, (now) => {
        const result = restoreCategoryState(now, target, affected)
        if (!result.restored) {
          setNotice(`没能恢复分类「${target.name}」（已有同名分类或已满 ${CATEGORY_LIMIT} 个），那几件待办保持未分类`)
        }
        return result.state
      })
    },
    [snapshot, categoriesSnapshot, replaceWithUndoState]
  )

  return { filter, setFilter: setChosen, notice, create, rename, remove }
}
