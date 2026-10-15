import type { SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement> & { size?: number }

function Icon({ size = 16, children, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  )
}

export function LeafIcon(props: IconProps) {
  return (
    <Icon strokeWidth={2.2} {...props}>
      <path d="M12 21V11" />
      <path d="M12 14c-4 0-6.5-2.5-7-6.5 4 0 6.5 2.5 7 6.5z" />
      <path d="M12 11c.4-4 3-6.5 7-6.5-.4 4-3 6.5-7 6.5z" />
    </Icon>
  )
}

export function SettingsIcon(props: IconProps) {
  return (
    <Icon strokeWidth={1.7} {...props}>
      <path d="M4 7h10M18 7h2M4 17h4M12 17h8" />
      <circle cx="16" cy="7" r="2" />
      <circle cx="10" cy="17" r="2" />
    </Icon>
  )
}

export function CloseIcon(props: IconProps) {
  return (
    <Icon strokeWidth={2} {...props}>
      <path d="M5 5l14 14M19 5L5 19" />
    </Icon>
  )
}

export function MicIcon(props: IconProps) {
  return (
    <Icon strokeWidth={2} {...props}>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" />
    </Icon>
  )
}

export function SendIcon(props: IconProps) {
  return (
    <Icon strokeWidth={2.2} {...props}>
      <path d="M12 19V5M6 11l6-6 6 6" />
    </Icon>
  )
}

export function TrashIcon(props: IconProps) {
  return (
    <Icon strokeWidth={1.8} {...props}>
      <path d="M4.5 7h15M9 7V4.5h6V7M6.5 7l1 13h9l1-13" />
    </Icon>
  )
}

export function ChevronRightIcon(props: IconProps) {
  return (
    <Icon strokeWidth={2.2} {...props}>
      <path d="M9 6l6 6-6 6" />
    </Icon>
  )
}

export function CheckIcon(props: IconProps) {
  return (
    <Icon strokeWidth={3.2} {...props}>
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </Icon>
  )
}

export function ClockIcon(props: IconProps) {
  return (
    <Icon strokeWidth={2.2} {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </Icon>
  )
}

export function CalendarIcon(props: IconProps) {
  return (
    <Icon strokeWidth={2.2} {...props}>
      <rect x="3.5" y="5" width="17" height="15" rx="3" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
    </Icon>
  )
}

export function SparkIcon(props: IconProps) {
  return (
    <Icon strokeWidth={1.4} {...props}>
      <path
        d="M11 3.5l1.9 5.6 5.6 1.9-5.6 1.9L11 18.5l-1.9-5.6L3.5 11l5.6-1.9z"
        strokeLinejoin="round"
        style={{ fill: 'var(--color-ai-border)', stroke: 'var(--color-ai-deep)' }}
      />
      <path
        d="M18.5 15.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z"
        style={{ fill: 'var(--color-ai-deep)', stroke: 'none' }}
      />
    </Icon>
  )
}

export function CloudOffIcon(props: IconProps) {
  return (
    <Icon strokeWidth={1.9} {...props}>
      <path d="M7 18h10a4 4 0 0 0 .7-7.9A6 6 0 0 0 6.3 9.2 4.5 4.5 0 0 0 7 18z" />
      <path d="M4 4l16 16" />
    </Icon>
  )
}

export function SpeakIcon(props: IconProps) {
  return (
    <Icon strokeWidth={1.8} {...props}>
      <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" />
      <path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a7.5 7.5 0 0 1 0 11" />
    </Icon>
  )
}

export function CopyIcon(props: IconProps) {
  return (
    <Icon strokeWidth={1.8} {...props}>
      <rect x="8" y="8" width="12" height="12" rx="2.5" />
      <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
    </Icon>
  )
}

export function RefreshIcon(props: IconProps) {
  return (
    <Icon strokeWidth={1.8} {...props}>
      <path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3" />
      <path d="M19.5 4.5v4h-4" />
    </Icon>
  )
}

export function PlusIcon(props: IconProps) {
  return (
    <Icon strokeWidth={2.2} {...props}>
      <path d="M12 5v14M5 12h14" />
    </Icon>
  )
}

/** 悬浮窗：大框里一个小框。 */
export function FloatIcon(props: IconProps) {
  return (
    <Icon strokeWidth={1.7} {...props}>
      <rect x="3.5" y="5" width="17" height="14" rx="2.5" />
      <rect x="12" y="11" width="6" height="5" rx="1" />
    </Icon>
  )
}

/** 置顶：图钉。 */
export function PinIcon(props: IconProps) {
  return (
    <Icon strokeWidth={1.8} {...props}>
      <path d="M9 4h6M10 4v5.5L7 13h10l-3-3.5V4M12 13v7" />
    </Icon>
  )
}

/** 固定：锁。 */
export function LockIcon(props: IconProps) {
  return (
    <Icon strokeWidth={1.8} {...props}>
      <rect x="5.5" y="10.5" width="13" height="9.5" rx="2" />
      <path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" />
    </Icon>
  )
}

/** 紧急：小旗。 */
export function FlagIcon(props: IconProps) {
  return (
    <Icon strokeWidth={2} {...props}>
      <path d="M5.5 21V4M5.5 4.5h11l-2 4 2 4h-11" />
    </Icon>
  )
}

/** 分类：标签。 */
export function TagIcon(props: IconProps) {
  return (
    <Icon strokeWidth={1.9} {...props}>
      <path d="M3.5 12.2V4.5a1 1 0 0 1 1-1h7.7l8.3 8.3a1.4 1.4 0 0 1 0 2l-6.2 6.2a1.4 1.4 0 0 1-2 0z" />
      <circle cx="8" cy="8" r="1.4" />
    </Icon>
  )
}

/** 更多：三个点。 */
export function MoreIcon(props: IconProps) {
  return (
    <Icon strokeWidth={2.4} {...props}>
      <path d="M5 12h.01M12 12h.01M19 12h.01" />
    </Icon>
  )
}

/** 开始做：播放箭头。 */
export function PlayIcon(props: IconProps) {
  return (
    <Icon strokeWidth={2} {...props}>
      <path d="M8 5.5v13l10-6.5z" />
    </Icon>
  )
}

/** 打开主窗口：向右上的箭头出框。 */
export function OpenMainIcon(props: IconProps) {
  return (
    <Icon strokeWidth={1.8} {...props}>
      <path d="M13 4.5h6.5V11M19.5 4.5L11 13" />
      <path d="M17 14v3.5a2 2 0 0 1-2 2H6.5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2H10" />
    </Icon>
  )
}
