'use client'

import { useEffect, useState } from 'react'

interface TerminalLine {
  text: string
  color: string
  delay: number
  isCommand?: boolean // 是否是命令（需要打字效果）
  prefix?: string
  showPrefixFirst?: boolean // 是否先显示前缀
}

const terminalLines: TerminalLine[] = [
  { text: 'docker run -d --name sparklab huaqiao:v1.2 -p 80:80', color: 'text-white/90', delay: 500, isCommand: true, prefix: '$ ', showPrefixFirst: true },
  { text: 'Unable to find image \'huaqiao:v1.2\' locally', color: 'text-white/58', delay: 800, prefix: '  ' },
  { text: 'v1.2: Pulling from library/huaqiao', color: 'text-white/58', delay: 100, prefix: '  ' },
  { text: 'a2abf6c4d29d: Pull complete', color: 'text-white/72', delay: 150, prefix: '  ' },
  { text: 'a9edb18cadd1: Pull complete', color: 'text-white/72', delay: 150, prefix: '  ' },
  { text: '589b7251471a: Pull complete', color: 'text-white/72', delay: 150, prefix: '  ' },
  { text: 'Digest: sha256:0d17b565c37bcbd895e9d92315a05c1c3c9a29f762b011a10c54a66cd53c9b31', color: 'text-white/78', delay: 100, prefix: '  ' },
  { text: 'Status: Downloaded newer image for huaqiao:v1.2', color: 'text-white/78', delay: 100, prefix: '  ' },
  { text: 'f8a9c3e5d7b2a1c4e6f8d9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0', color: 'text-white/90', delay: 100, prefix: '  ' },
  { text: '', color: '', delay: 600, prefix: '' },
  { text: 'docker ps', color: 'text-white/90', delay: 800, isCommand: true, prefix: '$ ', showPrefixFirst: true },
  { text: 'CONTAINER ID   IMAGE          STATUS         PORTS                NAMES', color: 'text-white/50', delay: 200, prefix: '  ' },
  { text: 'f8a9c3e5d7b2   huaqiao:v1.2   Up 2 seconds   0.0.0.0:80->80/tcp   sparklab', color: 'text-white/90', delay: 100, prefix: '  ' },
]

export default function AnimatedTerminal() {
  const [lines, setLines] = useState<Array<{ text: string; color: string; prefix: string }>>([])
  const [currentLineIndex, setCurrentLineIndex] = useState(0)
  const [currentText, setCurrentText] = useState('')
  const [showPrefix, setShowPrefix] = useState(false)
  const [showCursor, setShowCursor] = useState(true)

  useEffect(() => {
    if (currentLineIndex >= terminalLines.length) {
      // 动画完成，不再重复
      return
    }

    const line = terminalLines[currentLineIndex]
    
    const delayTimer = setTimeout(() => {
      if (line.text === '') {
        setLines(prev => [...prev, { text: '', color: '', prefix: '' }])
        setCurrentLineIndex(prev => prev + 1)
        return
      }

      if (line.isCommand && line.showPrefixFirst) {
        // 命令行 - 先显示 $，然后打字
        setShowPrefix(true)
        
        setTimeout(() => {
          let charIndex = 0
          const typeInterval = setInterval(() => {
            if (charIndex <= line.text.length) {
              setCurrentText(line.text.substring(0, charIndex))
              charIndex++
            } else {
              clearInterval(typeInterval)
              setLines(prev => [...prev, { 
                text: line.text, 
                color: line.color,
                prefix: line.prefix || ''
              }])
              setCurrentText('')
              setShowPrefix(false)
              setCurrentLineIndex(prev => prev + 1)
            }
          }, 40)

          return () => clearInterval(typeInterval)
        }, 200) // $ 显示后等待 200ms 再开始打字
      } else if (line.isCommand) {
        // 命令行 - 打字效果（旧逻辑，保留兼容）
        let charIndex = 0
        const typeInterval = setInterval(() => {
          if (charIndex <= line.text.length) {
            setCurrentText(line.text.substring(0, charIndex))
            charIndex++
          } else {
            clearInterval(typeInterval)
            setLines(prev => [...prev, { 
              text: line.text, 
              color: line.color,
              prefix: line.prefix || ''
            }])
            setCurrentText('')
            setCurrentLineIndex(prev => prev + 1)
          }
        }, 40)

        return () => clearInterval(typeInterval)
      } else {
        // 输出内容 - 直接显示
        setLines(prev => [...prev, { 
          text: line.text, 
          color: line.color,
          prefix: line.prefix || ''
        }])
        setCurrentLineIndex(prev => prev + 1)
      }
    }, line.delay)

    return () => clearTimeout(delayTimer)
  }, [currentLineIndex])

  // 光标闪烁效果
  useEffect(() => {
    const interval = setInterval(() => {
      setShowCursor(prev => !prev)
    }, 500)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="max-w-3xl mx-auto">
      <div className="terminal-shell overflow-hidden rounded-lg">
        {/* 终端头部 */}
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-2.5">
          <div className="text-xs font-medium text-white/72">Terminal</div>
          <div className="text-xs text-white/44 font-mono">huaqiao@sparklab</div>
        </div>
        
        {/* 终端内容 - 固定高度 */}
        <div className="p-5 font-mono text-xs h-[280px] overflow-hidden">
          {lines.map((line, index) => (
            <div key={index} className={`${line.color} leading-relaxed`}>
              {line.prefix && <span className={line.prefix.includes('$') ? 'text-white/90' : ''}>{line.prefix}</span>}
              {line.text}
            </div>
          ))}
          
          {/* 当前正在打字的行 - 带下划线光标 */}
          {(currentText || showPrefix) && currentLineIndex < terminalLines.length && (
            <div className={`${terminalLines[currentLineIndex].color} leading-relaxed`}>
              {(showPrefix || terminalLines[currentLineIndex].prefix) && (
                <span className={terminalLines[currentLineIndex].prefix?.includes('$') ? 'text-white/90' : ''}>
                  {terminalLines[currentLineIndex].prefix}
                </span>
              )}
              {currentText}
              <span className="inline-block w-1.5 border-b-2 border-white ml-0.5"></span>
            </div>
          )}

          {/* 最终提示符 - 带闪烁光标 */}
          {currentLineIndex >= terminalLines.length && (
            <div className="leading-relaxed mt-1">
              <span className="text-white/90">$ </span>
              {showCursor && (
                <span className="inline-block w-1.5 border-b-2 border-white"></span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
