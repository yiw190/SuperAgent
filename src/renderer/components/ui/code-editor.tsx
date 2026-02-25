import { useEffect, useState } from 'react'
import Editor, { type OnMount } from '@monaco-editor/react'

interface CodeEditorProps {
  value: string
  onChange?: (value: string) => void
  language?: string
  readOnly?: boolean
  className?: string
}

export function CodeEditor({ value, onChange, language, readOnly, className }: CodeEditorProps) {
  const [isDark, setIsDark] = useState(
    document.documentElement.classList.contains('dark')
  )

  useEffect(() => {
    const observer = new MutationObserver(() => {
      setIsDark(document.documentElement.classList.contains('dark'))
    })
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    })
    return () => observer.disconnect()
  }, [])

  const handleMount: OnMount = (editor) => {
    editor.updateOptions({
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      wordWrap: 'on',
      fontSize: 13,
      lineNumbers: 'on',
      readOnly: readOnly ?? false,
      automaticLayout: true,
    })
  }

  return (
    <div className={className}>
      <Editor
        value={value}
        onChange={(val) => onChange?.(val ?? '')}
        language={language}
        theme={isDark ? 'vs-dark' : 'vs'}
        onMount={handleMount}
        loading={
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
            Loading editor...
          </div>
        }
      />
    </div>
  )
}
