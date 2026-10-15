import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import './FloatingPopover.css'

const WIDTH_FALLBACK = 264
const MARGIN = 8
const GAP = 6

type Point = { top: number; left: number }

type FloatingPopoverProps = {
  /** 触发它的元素；为 null 时不渲染。 */
  anchor: HTMLElement | null
  label: string
  /** 关闭：Esc、点到外面、列表滚动、窗口大小变化。 */
  onClose: () => void
  children: ReactNode
}

function placement(anchor: HTMLElement, width: number, height: number): Point {
  const rect = anchor.getBoundingClientRect()
  const above = rect.top - height - GAP
  const top = above >= MARGIN ? above : rect.bottom + GAP
  const left = Math.min(Math.max(rect.left, MARGIN), window.innerWidth - width - MARGIN)
  return { top, left }
}

/**
 * 锚定在某个元素旁边的小浮层（风格同 WhenPopover）。渲染到 body 下，列表重新排序、
 * 滚动时焦点和位置都不受影响。Esc 关闭并把焦点还给触发元素。
 */
export function FloatingPopover({ anchor, label, onClose, children }: FloatingPopoverProps) {
  const ref = useRef<HTMLDivElement>(null)
  const closeRef = useRef(onClose)
  const [point, setPoint] = useState<Point | null>(null)

  useEffect(() => {
    closeRef.current = onClose
  })

  // 每次渲染都重新定位（内容变高、比如出现了新建输入框时也能放对位置），位置没变就不再更新。
  useLayoutEffect(() => {
    if (anchor === null || ref.current === null) return
    const next = placement(anchor, ref.current.offsetWidth || WIDTH_FALLBACK, ref.current.offsetHeight)
    setPoint((previous) => (previous !== null && previous.top === next.top && previous.left === next.left ? previous : next))
  })

  useEffect(() => {
    ref.current?.focus()
  }, [])

  useEffect(() => {
    function onPointerDown(event: PointerEvent): void {
      const target = event.target
      if (!(target instanceof Node)) return
      if (ref.current?.contains(target) || anchor?.contains(target)) return
      closeRef.current()
    }
    function onScroll(event: Event): void {
      // 浮层里面的滚动（分类很多时的列表）不关闭。
      const target = event.target
      if (target instanceof Node && ref.current?.contains(target)) return
      closeRef.current()
    }
    function onResize(): void {
      closeRef.current()
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onResize)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onResize)
    }
  }, [anchor])

  if (anchor === null) return null

  // 输入框里按 Esc 由输入框自己处理（会停止冒泡），这里只处理焦点在浮层本身或其中按钮上的 Esc。
  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (event.key !== 'Escape' || event.nativeEvent.isComposing) return
    event.preventDefault()
    event.stopPropagation()
    onClose()
    anchor?.focus()
  }

  return createPortal(
    <div
      ref={ref}
      className="floating-popover"
      role="dialog"
      aria-label={label}
      tabIndex={-1}
      style={point ?? { top: 0, left: 0, visibility: 'hidden' }}
      onKeyDown={handleKeyDown}
    >
      {children}
    </div>,
    document.body
  )
}
