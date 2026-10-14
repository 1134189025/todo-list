import { aiErrorKind, aiErrorTitle } from '../lib/aiErrors'
import { type AiFlow, quoteOf } from '../state/useAiFlow'
import { ConfirmCard } from './ConfirmCard'
import { NoticeCard } from './NoticeCard'
import { ThinkingCard } from './ThinkingCard'
import './AiCard.css'

type AiCardProps = {
  flow: AiFlow
  today: string
  onOpenSettings: () => void
  /** 语音指令没听清时「再说一次」：重新录音。 */
  onVoiceAgain: () => void
}

/** 输入区的位置：AI 指令期间依次显示思考中、确认、没对上、或出错卡片。 */
export function AiCard({ flow, today, onOpenSettings, onVoiceAgain }: AiCardProps) {
  const { stage } = flow
  if (stage.kind === 'idle') return null
  const quote = quoteOf(stage)
  // 语音指令里没有听写出的原话：没有可以放回输入框或存成待办的文字。
  const wordless = stage.script === ''
  switch (stage.kind) {
    case 'thinking':
      return <ThinkingCard quote={quote} voice={stage.clip !== null} onCancel={flow.cancelThinking} />
    case 'confirm':
      return <ConfirmCard flow={flow} stage={stage} today={today} />
    case 'unmatched':
      return (
        <NoticeCard
          tone="ai"
          title="没对上现有的待办"
          body={`没找到：${stage.unmatched.join('、')}${stage.applied === null ? '' : `。${stage.applied.message}`}`}
          quote={quote}
          primary={{ label: '知道了', onClick: flow.dismiss }}
          secondary={wordless ? undefined : { label: '重新输入', onClick: flow.reenter }}
        />
      )
    case 'empty':
      if (wordless) {
        return (
          <NoticeCard
            tone="ai"
            title="没听清你说的话"
            body="靠近麦克风、说完一整句再结束；也可以直接打字"
            quote={quote}
            primary={{
              label: '再说一次',
              onClick: () => {
                flow.dismiss()
                onVoiceAgain()
              }
            }}
            secondary={{ label: '取消', onClick: flow.dismiss }}
          />
        )
      }
      return (
        <NoticeCard
          tone="ai"
          title="这句话里没找到要做的事"
          quote={quote}
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
            quote={quote}
            primary={wordless ? { label: '重试', onClick: flow.retry } : { label: '先存成 1 条', onClick: flow.saveAsOne }}
            secondary={wordless ? { label: '取消', onClick: flow.dismiss } : { label: '重试', onClick: flow.retry }}
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
          primary={wordless ? { label: '知道了', onClick: flow.dismiss } : { label: '重新输入', onClick: flow.reenter }}
        />
      )
    }
  }
}
