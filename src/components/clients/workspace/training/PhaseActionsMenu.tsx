/**
 * PhaseActionsMenu — three-dot dropdown for a phase in the client-profile
 * Training two-pane layout. Wires Rename / Change Duration / Duplicate /
 * Delete / Copy to Master / Copy to Client to caller-supplied callbacks.
 */
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent,
  DropdownMenuSubTrigger, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { MoreVertical, Pencil, Clock, Copy, Trash2, Library, Users, Sparkles } from "lucide-react";

interface Props {
  onRename: () => void;
  onChangeDuration: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onCopyToMaster: () => void;
  onCopyToClient: () => void;
  onAICreate?: () => void;
}

export const PhaseActionsMenu = ({
  onRename, onChangeDuration, onDuplicate, onDelete, onCopyToMaster, onCopyToClient, onAICreate,
}: Props) => (
  <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <Button
        size="icon"
        variant="ghost"
        className="h-7 w-7 text-muted-foreground hover:text-foreground"
        onClick={(e) => e.stopPropagation()}
        aria-label="Phase actions"
      >
        <MoreVertical className="h-4 w-4" />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
      {onAICreate && (
        <>
          <DropdownMenuItem onClick={onAICreate} className="text-primary focus:text-primary">
            <Sparkles className="h-3.5 w-3.5 mr-2" /> AI Create New Phase
          </DropdownMenuItem>
          <DropdownMenuSeparator />
        </>
      )}
      <DropdownMenuItem onClick={onRename}><Pencil className="h-3.5 w-3.5 mr-2" /> Rename</DropdownMenuItem>
      <DropdownMenuItem onClick={onChangeDuration}><Clock className="h-3.5 w-3.5 mr-2" /> Change Duration</DropdownMenuItem>
      <DropdownMenuItem onClick={onDuplicate}><Copy className="h-3.5 w-3.5 mr-2" /> Duplicate</DropdownMenuItem>
      <DropdownMenuSub>
        <DropdownMenuSubTrigger><Copy className="h-3.5 w-3.5 mr-2" /> Copy to…</DropdownMenuSubTrigger>
        <DropdownMenuSubContent>
          <DropdownMenuItem onClick={onCopyToMaster}><Library className="h-3.5 w-3.5 mr-2" /> Master Programs</DropdownMenuItem>
          <DropdownMenuItem onClick={onCopyToClient}><Users className="h-3.5 w-3.5 mr-2" /> Another Client</DropdownMenuItem>
        </DropdownMenuSubContent>
      </DropdownMenuSub>
      <DropdownMenuSeparator />
      <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={onDelete}>
        <Trash2 className="h-3.5 w-3.5 mr-2" /> Delete
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
);

export default PhaseActionsMenu;
