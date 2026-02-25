import { useState } from 'react'
import { FileCode } from 'lucide-react'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@renderer/components/ui/context-menu'
import { SkillFilesDialog } from './skill-files-dialog'
import type { ApiSkillWithStatus } from '@shared/lib/types/api'

interface SkillContextMenuProps {
  skill: ApiSkillWithStatus
  agentSlug: string
  children: React.ReactNode
}

export function SkillContextMenu({ skill, agentSlug, children }: SkillContextMenuProps) {
  const [filesDialogOpen, setFilesDialogOpen] = useState(false)

  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger asChild>
          {children}
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem onClick={() => setFilesDialogOpen(true)}>
            <FileCode className="h-4 w-4 mr-2" />
            View Files
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>

      <SkillFilesDialog
        open={filesDialogOpen}
        onOpenChange={setFilesDialogOpen}
        agentSlug={agentSlug}
        skillDir={skill.path}
        skillName={skill.name}
      />
    </>
  )
}
