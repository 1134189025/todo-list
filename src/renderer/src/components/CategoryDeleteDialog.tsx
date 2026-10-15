import type { Category } from '@shared/types'
import { Dialog } from './Dialog'
import './CategoryDeleteDialog.css'

type CategoryDeleteDialogProps = {
  /** 要删除的分类；为 null 时对话框关闭。 */
  category: Category | null
  /** 指向它的待办条数（含已完成的），用来说明会有几件变成未分类。 */
  total: number
  onCancel: () => void
  onConfirm: () => void
}

/** 删除分类前的确认。 */
export function CategoryDeleteDialog({ category, total, onCancel, onConfirm }: CategoryDeleteDialogProps) {
  return (
    <Dialog open={category !== null} title="确认删除" onRequestClose={onCancel}>
      {category !== null && (
        <div className="category-delete">
          <p className="category-delete-text">
            {total > 0
              ? `删除分类「${category.name}」？其中 ${total} 件待办会变成未分类`
              : `删除分类「${category.name}」？`}
          </p>
          <div className="category-delete-actions">
            <button type="button" className="category-delete-cancel" onClick={onCancel}>
              取消
            </button>
            <button type="button" className="category-delete-confirm" onClick={onConfirm}>
              删除
            </button>
          </div>
        </div>
      )}
    </Dialog>
  )
}
