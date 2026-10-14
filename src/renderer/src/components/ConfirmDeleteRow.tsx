import type { DeleteDraft } from '../lib/aiActions'

type ConfirmDeleteRowProps = {
  item: DeleteDraft
  onToggle: (include: boolean) => void
}

/** 确认卡片里待确认的一条删除：勾选才会删，标题只读。 */
export function ConfirmDeleteRow({ item, onToggle }: ConfirmDeleteRowProps) {
  return (
    <li className={item.include ? 'confirm-row is-delete' : 'confirm-row is-delete is-off'}>
      <label className="confirm-row-check">
        <input
          type="checkbox"
          checked={item.include}
          aria-label={`删除「${item.title}」`}
          onChange={(event) => onToggle(event.target.checked)}
        />
      </label>
      <span className="confirm-row-badge">删除</span>
      <span className="confirm-row-title is-readonly" title={item.title}>
        {item.title}
      </span>
    </li>
  )
}
