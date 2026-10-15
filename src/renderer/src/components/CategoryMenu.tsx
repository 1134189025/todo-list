import { useState } from 'react'
import { FloatingPopover } from './FloatingPopover'
import { MoreIcon } from './icons'
import './CategoryMenu.css'

type CategoryMenuProps = {
  name: string
  onRename: () => void
  onDelete: () => void
}

/** 分类项右边的「…」：改名、删除。键盘可以打开，Esc 关闭并回到这个按钮。 */
export function CategoryMenu({ name, onRename, onDelete }: CategoryMenuProps) {
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null)
  return (
    <>
      <button
        type="button"
        className="category-more"
        aria-label={`分类操作：${name}`}
        aria-haspopup="dialog"
        aria-expanded={anchor !== null}
        title="分类操作"
        onClick={(event) => {
          const button = event.currentTarget
          setAnchor((current) => (current === null ? button : null))
        }}
      >
        <MoreIcon size={15} />
      </button>
      {anchor !== null && (
        <FloatingPopover anchor={anchor} label={`分类操作：${name}`} onClose={() => setAnchor(null)}>
          <div className="category-menu">
            <button
              type="button"
              className="category-menu-item"
              onClick={() => {
                setAnchor(null)
                onRename()
              }}
            >
              改名
            </button>
            <button
              type="button"
              className="category-menu-item is-danger"
              onClick={() => {
                setAnchor(null)
                onDelete()
              }}
            >
              删除
            </button>
          </div>
        </FloatingPopover>
      )}
    </>
  )
}
