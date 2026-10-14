import { aiErrorKind, aiErrorTitle } from '../lib/aiErrors'
import type { AiFlow } from '../state/useAiFlow'
import { ConfirmCard } from './ConfirmCard'
import { NoticeCard } from './NoticeCard'
import { ThinkingCard } from './ThinkingCard'
import './AiCard.css'

type AiCardProps = {
  flow: AiFlow
  today: string
  onOpenSettings: () => void
}

/** 输入区的位置：AI 指令期间依次显示思考中、确认、没对上、或出错卡片。 */
export function AiCard({ flow, today, onOpenSettings }: AiCardProps) {
  const { stage } = flow
  switch (stage.kind) {
    case 'idle':
      return null
    case 'thinking':
      return <ThinkingCard script={stage.script} onCancel={flow.cancelThinking} />
    case 'confirm':
      return <ConfirmCard flow={flow} stage={stage} today={today} />
    case 'unmatched':
      return (
        <NoticeCard
          tone="ai"
          title="没对上现有的待办"
          body={`没找到：${stage.unmatched.join('、')}${stage.applied === null ? '' : `。${stage.applied.message}`}`}
          quote={stage.script}
          primary={{ label: '知道了', onClick: flow.dismiss }}
          secondary={{ label: '重新输入', onClick: flow.reenter }}
        />
      )
    case 'empty':
      return (
        <NoticeCard
          tone="ai"
          title="这句话里没找到要做的事"
          quote={stage.script}
          primary={{ label: '直接存为待办', onClick: flow.saveAsOne }}
          secondary={{ label: '重新输入', onClick: flow.reenter }}
        />
      )
    case 'failed': {
      const kind = aiErrorKind(stage.code)
      const title = aiErrorTitle(stage.code)
      if (kind === 'retry') {
        return (
          <NoticeCard
            tone="peach"
            title={title}
            body={stage.message === title ? undefined : stage.message}
            quote={stage.script}
            primary={{ label: '先存成 1 条', onClick: flow.saveAsOne }}
            secondary={{ label: '重试', onClick: flow.retry }}
          />
        )
      }
      if (kind === 'settings') {
        return (
          <NoticeCard
            tone="peach"
            title={title}
            body={stage.message}
            primary={{ label: '去设置', onClick: onOpenSettings }}
            secondary={{ label: '取消', onClick: flow.dismiss }}
          />
        )
      }
      return (
        <NoticeCard
          tone="peach"
          title={title}
          body={stage.message}
          primary={{ label: '重新输入', onClick: flow.reenter }}
        />
      )
    }
  }
}
