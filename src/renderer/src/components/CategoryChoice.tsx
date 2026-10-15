import { useRef, useState } from 'react'
import type { Category } from '@shared/types'
import type { CategoryResult } from '../state/useCategories'
import { checkNewCategory } from '../lib/categoryOps'
import { categoryIdOrNull, sortCategories } from '../lib/categoryFilter'
import { CategoryNameInput } from './CategoryNameInput'
import { CheckIcon, PlusIcon } from './icons'
import './CategoryChoice.css'

type CategoryChoiceProps = {
  categories: readonly Category[]
  /** 当前分类；null = 未分类（指向不存在的分类也算未分类）。 */
  value: string | null
  onSelect: (id: string | null) => void
  /** 新建分类：成功后调用方会把它选中（见 onSelect）。 */
  onCreate: (name: string) => CategoryResult
}

/** 分类单选：未分类在最前，最下面是「+ 新建分类」（行内输入，新建后直接选中）。 */
export function CategoryChoice({ categories, value, onSelect, onCreate }: CategoryChoiceProps) {
  const [creating, setCreating] = useState(false)
  const addRef = useRef<HTMLButtonElement>(null)
  const selected = categoryIdOrNull(value, categories)
  const sorted = sortCategories(categories)

  function finishCreate(): void {
    setCreating(false)
    addRef.current?.focus()
  }

  return (
    <div className="category-choice">
      <div className="category-choice-list" role="group" aria-label="分类">
        <button
          type="button"
          className="category-choice-item"
          aria-pressed={selected === null}
          onClick={() => onSelect(null)}
        >
          <span className="category-choice-name">未分类</span>
          {selected === null && <CheckIcon size={13} />}
        </button>
        {sorted.map((category) => {
          const pressed = category.id === selected
          return (
            <button
              key={category.id}
              type="button"
              className="category-choice-item"
              aria-pressed={pressed}
              onClick={() => onSelect(category.id)}
            >
              <span className="category-choice-name" title={category.name}>
                {category.name}
              </span>
              {pressed && <CheckIcon size={13} />}
            </button>
          )
        })}
      </div>
      {creating ? (
        <CategoryNameInput
          label="新分类的名字"
          placeholder="分类名字，Enter 保存"
          check={(raw) => checkNewCategory(raw, categories)}
          onSave={(name) => {
            const result = onCreate(name)
            if (!result.ok) return result.message
            onSelect(result.id)
            finishCreate()
            return null
          }}
          onCancel={finishCreate}
        />
      ) : (
        <button type="button" ref={addRef} className="category-choice-add" onClick={() => setCreating(true)}>
          <PlusIcon size={13} />
          新建分类
        </button>
      )}
    </div>
  )
}
