import { Fragment } from "react"

// A deliberately small Markdown subset for Mira's replies: headings, bold,
// italic, inline code, code fences and bullet/numbered lists. It builds React
// elements rather than HTML strings, so nothing Mira writes can inject markup,
// and links are left as plain text.

const INLINE = /(\*\*[^*\n]+?\*\*|__[^_\n]+?__|`[^`\n]+?`|\*[^*\s][^*\n]*?\*|_[^_\s][^_\n]*?_)/g

export function renderInline(text, keyPrefix = "i") {
  const parts = text.split(INLINE).filter((part) => part !== "")
  return parts.map((part, index) => {
    const key = `${keyPrefix}-${index}`
    if (/^\*\*[^*]+\*\*$/.test(part) || /^__[^_]+__$/.test(part)) return <strong key={key}>{part.slice(2, -2)}</strong>
    if (/^`[^`]+`$/.test(part)) return <code key={key}>{part.slice(1, -1)}</code>
    if (/^\*[^*]+\*$/.test(part) || /^_[^_]+_$/.test(part)) return <em key={key}>{part.slice(1, -1)}</em>
    return <Fragment key={key}>{part}</Fragment>
  })
}

export function parseBlocks(source) {
  const lines = source.replace(/\r\n?/g, "\n").split("\n")
  const blocks = []
  let paragraph = []
  let list = null
  let fence = null

  const flushParagraph = () => {
    if (paragraph.length) blocks.push({ type: "p", lines: paragraph })
    paragraph = []
  }
  const flushList = () => {
    if (list) blocks.push(list)
    list = null
  }

  for (const line of lines) {
    if (fence) {
      if (/^\s*```/.test(line)) {
        blocks.push({ type: "code", text: fence.join("\n") })
        fence = null
      } else fence.push(line)
      continue
    }
    if (/^\s*```/.test(line)) {
      flushParagraph()
      flushList()
      fence = []
      continue
    }
    const heading = /^(#{1,3})\s+(.*)$/.exec(line)
    const bullet = /^\s*[-*•]\s+(.*)$/.exec(line)
    const numbered = /^\s*\d+[.)]\s+(.*)$/.exec(line)
    if (heading) {
      flushParagraph()
      flushList()
      blocks.push({ type: "h", level: heading[1].length, text: heading[2] })
    } else if (bullet || numbered) {
      flushParagraph()
      const ordered = Boolean(numbered)
      if (!list || list.ordered !== ordered) {
        flushList()
        list = { type: "list", ordered, items: [] }
      }
      list.items.push((bullet || numbered)[1])
    } else if (!line.trim()) {
      flushParagraph()
      flushList()
    } else {
      flushList()
      paragraph.push(line)
    }
  }
  if (fence) blocks.push({ type: "code", text: fence.join("\n") })
  flushParagraph()
  flushList()
  return blocks
}

export default function MiraMarkdown({ text }) {
  const blocks = parseBlocks(text || "")
  return (
    <div className="mira-markdown">
      {blocks.map((block, index) => {
        const key = `b-${index}`
        if (block.type === "h") {
          const Tag = `h${Math.min(block.level + 2, 6)}`
          return <Tag key={key}>{renderInline(block.text, key)}</Tag>
        }
        if (block.type === "code") return <pre key={key}><code>{block.text}</code></pre>
        if (block.type === "list") {
          const Tag = block.ordered ? "ol" : "ul"
          return <Tag key={key}>{block.items.map((item, i) => <li key={i}>{renderInline(item, `${key}-${i}`)}</li>)}</Tag>
        }
        return (
          <p key={key}>
            {block.lines.map((line, i) => (
              <Fragment key={i}>
                {i > 0 && <br />}
                {renderInline(line, `${key}-${i}`)}
              </Fragment>
            ))}
          </p>
        )
      })}
    </div>
  )
}
