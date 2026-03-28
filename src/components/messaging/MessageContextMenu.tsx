import { useState, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Pencil, Copy, Trash2, X, Check } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Sheet,
  SheetContent,
} from "@/components/ui/sheet";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { cn } from "@/lib/utils";

interface MessageContextMenuProps {
  messageId: string;
  content: string;
  senderId: string;
  isOwn: boolean;
  hasAttachment?: boolean;
  onEdit: (messageId: string, newContent: string) => void;
  onDelete: (messageId: string) => void;
  children: React.ReactNode;
}

const MessageContextMenu = ({
  messageId,
  content,
  senderId,
  isOwn,
  hasAttachment,
  onEdit,
  onDelete,
  children,
}: MessageContextMenuProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [showSheet, setShowSheet] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(content);
  const [saving, setSaving] = useState(false);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchMoved = useRef(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(content);
      toast({ title: "Copied to clipboard" });
    } catch {
      toast({ title: "Failed to copy", variant: "destructive" });
    }
    setShowSheet(false);
  }, [content, toast]);

  const handleEditStart = useCallback(() => {
    setEditText(content);
    setEditing(true);
    setShowSheet(false);
  }, [content]);

  const handleEditSave = useCallback(async () => {
    if (!editText.trim() || editText.trim() === content) {
      setEditing(false);
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from("thread_messages")
      .update({ content: editText.trim(), edited_at: new Date().toISOString() } as any)
      .eq("id", messageId);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      onEdit(messageId, editText.trim());
    }
    setSaving(false);
    setEditing(false);
  }, [editText, content, messageId, onEdit, toast]);

  const handleDeleteConfirm = useCallback(async () => {
    const { error } = await supabase
      .from("thread_messages")
      .delete()
      .eq("id", messageId);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      onDelete(messageId);
    }
    setShowDeleteDialog(false);
    setShowSheet(false);
  }, [messageId, onDelete, toast]);

  // Long-press handlers for mobile
  const handleTouchStart = useCallback(() => {
    touchMoved.current = false;
    longPressTimer.current = setTimeout(() => {
      if (!touchMoved.current) {
        setShowSheet(true);
      }
    }, 500);
  }, []);

  const handleTouchMove = useCallback(() => {
    touchMoved.current = true;
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
  }, []);

  const menuItems = (
    <>
      {isOwn && content && !hasAttachment && (
        <button
          onClick={handleEditStart}
          className="flex w-full items-center gap-3 px-4 py-3 text-sm text-foreground hover:bg-muted active:bg-muted/80 transition-colors"
        >
          <Pencil className="h-4 w-4 text-muted-foreground" />
          Edit
        </button>
      )}
      {content && (
        <button
          onClick={handleCopy}
          className="flex w-full items-center gap-3 px-4 py-3 text-sm text-foreground hover:bg-muted active:bg-muted/80 transition-colors"
        >
          <Copy className="h-4 w-4 text-muted-foreground" />
          Copy Text
        </button>
      )}
      {isOwn && (
        <button
          onClick={() => { setShowSheet(false); setShowDeleteDialog(true); }}
          className="flex w-full items-center gap-3 px-4 py-3 text-sm text-destructive hover:bg-destructive/10 active:bg-destructive/20 transition-colors"
        >
          <Trash2 className="h-4 w-4" />
          Delete
        </button>
      )}
    </>
  );

  // If editing, render inline edit mode
  if (editing) {
    return (
      <div className="flex gap-2 items-start w-full max-w-[85%]">
        <Textarea
          value={editText}
          onChange={(e) => setEditText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && e.shiftKey) { e.preventDefault(); handleEditSave(); }
            if (e.key === "Escape") setEditing(false);
          }}
          className="flex-1 text-sm min-h-[40px] max-h-[200px] resize-none"
          autoFocus
          disabled={saving}
          rows={2}
        />
        <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" onClick={handleEditSave} disabled={saving}>
          <Check className="h-4 w-4 text-primary" />
        </Button>
        <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" onClick={() => setEditing(false)}>
          <X className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  return (
    <>
      {/* Desktop: right-click context menu */}
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            className="select-none"
          >
            {children}
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent className="w-48">
          {isOwn && content && !hasAttachment && (
            <ContextMenuItem onClick={handleEditStart}>
              <Pencil className="h-4 w-4 mr-2" /> Edit
            </ContextMenuItem>
          )}
          {content && (
            <ContextMenuItem onClick={handleCopy}>
              <Copy className="h-4 w-4 mr-2" /> Copy Text
            </ContextMenuItem>
          )}
          {isOwn && (
            <ContextMenuItem onClick={() => setShowDeleteDialog(true)} className="text-destructive focus:text-destructive">
              <Trash2 className="h-4 w-4 mr-2" /> Delete
            </ContextMenuItem>
          )}
        </ContextMenuContent>
      </ContextMenu>

      {/* Mobile: bottom sheet on long-press */}
      <Sheet open={showSheet} onOpenChange={setShowSheet}>
        <SheetContent side="bottom" className="px-0 pb-8 pt-2 rounded-t-2xl">
          <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-muted-foreground/30" />
          <div className="flex flex-col">{menuItems}</div>
        </SheetContent>
      </Sheet>

      {/* Delete confirmation */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Message</AlertDialogTitle>
            <AlertDialogDescription>
              This message will be permanently deleted for everyone. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConfirm} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default MessageContextMenu;
