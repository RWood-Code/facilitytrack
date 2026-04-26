import { useEffect, useState } from "react";
import {
  ChevronRight,
  Cloud,
  Folder,
  FolderPlus,
  Home,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import {
  createOneDriveFolder,
  listOneDriveFolders,
  type OneDriveFolderEntry,
} from "@/lib/backup";

interface OneDriveFolderPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Path to start the picker at — typically the currently saved folder. */
  initialPath?: string;
  /** Called with the selected path (no leading slash) when the user clicks "Use this folder". */
  onSelect: (path: string) => void;
}

/**
 * Modal that lists the user's OneDrive folders via the api-server proxy
 * and lets them drill in / create a new folder. The access token never
 * touches the renderer — all calls go through `/api/backup/folders`.
 */
export function OneDriveFolderPicker({
  open,
  onOpenChange,
  initialPath,
  onSelect,
}: OneDriveFolderPickerProps) {
  const { toast } = useToast();
  // Current folder being browsed. "" = drive root.
  const [currentPath, setCurrentPath] = useState("");
  const [folders, setFolders] = useState<OneDriveFolderEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // New-folder inline form state.
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [creating, setCreating] = useState(false);

  // When the dialog opens, jump to the parent of the saved path so the
  // user immediately sees their existing folder highlighted in the list.
  // (If the saved folder is `Foo/Bar`, we open `Foo` and they see `Bar`.)
  useEffect(() => {
    if (!open) return;
    const start = (initialPath ?? "").replace(/^\/+|\/+$/g, "");
    const parent = start.includes("/")
      ? start.slice(0, start.lastIndexOf("/"))
      : "";
    setCurrentPath(parent);
    setNewFolderOpen(false);
    setNewFolderName("");
  }, [open, initialPath]);

  // Load folders whenever the current path changes (or the dialog opens).
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    listOneDriveFolders(currentPath)
      .then((listing) => {
        if (cancelled) return;
        setFolders(listing.folders);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
        setFolders([]);
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, currentPath]);

  function handleNavigate(folder: OneDriveFolderEntry) {
    setCurrentPath(folder.path);
  }

  function handleBreadcrumb(toPath: string) {
    setCurrentPath(toPath);
  }

  async function handleRefresh() {
    setLoading(true);
    setError(null);
    try {
      const listing = await listOneDriveFolders(currentPath);
      setFolders(listing.folders);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateFolder() {
    const name = newFolderName.trim();
    if (!name) return;
    setCreating(true);
    try {
      const created = await createOneDriveFolder(currentPath, name);
      toast({ title: `Created "${created.name}"` });
      setNewFolderName("");
      setNewFolderOpen(false);
      // Refresh the listing and navigate into the new folder so the user
      // can immediately pick it (or drill further).
      await handleRefresh();
      setCurrentPath(created.path);
    } catch (err) {
      toast({
        title: "Could not create folder",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    } finally {
      setCreating(false);
    }
  }

  function handleSelect() {
    onSelect(currentPath);
    onOpenChange(false);
  }

  // Build breadcrumb segments from the current path.
  const segments = currentPath ? currentPath.split("/") : [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg" data-testid="dialog-onedrive-folder-picker">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Cloud className="w-4 h-4" />
            Choose a OneDrive folder
          </DialogTitle>
          <DialogDescription>
            Backups will be uploaded into the folder you select.
          </DialogDescription>
        </DialogHeader>

        {/* Breadcrumb */}
        <div className="flex items-center flex-wrap gap-1 text-sm border rounded-md px-2 py-1.5 bg-muted/40">
          <button
            type="button"
            onClick={() => handleBreadcrumb("")}
            className="inline-flex items-center gap-1 hover:underline font-medium"
            data-testid="button-onedrive-crumb-root"
          >
            <Home className="w-3.5 h-3.5" />
            OneDrive
          </button>
          {segments.map((seg, i) => {
            const subPath = segments.slice(0, i + 1).join("/");
            return (
              <span key={subPath} className="inline-flex items-center gap-1">
                <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
                <button
                  type="button"
                  onClick={() => handleBreadcrumb(subPath)}
                  className="hover:underline"
                >
                  {seg}
                </button>
              </span>
            );
          })}
        </div>

        {/* Folder list */}
        <div className="border rounded-md min-h-[14rem] max-h-72 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center h-32 text-sm text-muted-foreground gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading folders…
            </div>
          ) : error ? (
            <div className="p-4 text-sm text-destructive">
              <div className="font-medium">Could not list folders</div>
              <div className="text-xs mt-1">{error}</div>
              <Button
                size="sm"
                variant="outline"
                className="mt-3"
                onClick={handleRefresh}
              >
                <RefreshCw className="w-3 h-3 mr-1" />
                Retry
              </Button>
            </div>
          ) : folders.length === 0 ? (
            <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
              This folder has no subfolders.
            </div>
          ) : (
            <ul className="divide-y" data-testid="list-onedrive-folders">
              {folders.map((f) => (
                <li key={f.id}>
                  <button
                    type="button"
                    onClick={() => handleNavigate(f)}
                    className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left hover:bg-muted/60"
                    data-testid={`button-onedrive-folder-${f.name}`}
                  >
                    <span className="flex items-center gap-2 min-w-0">
                      <Folder className="w-4 h-4 text-blue-600 flex-shrink-0" />
                      <span className="truncate">{f.name}</span>
                    </span>
                    {f.hasChildFolders && (
                      <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* New folder inline form */}
        {newFolderOpen ? (
          <div className="flex gap-2">
            <Input
              autoFocus
              placeholder="New folder name"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void handleCreateFolder();
                } else if (e.key === "Escape") {
                  setNewFolderOpen(false);
                  setNewFolderName("");
                }
              }}
              disabled={creating}
              data-testid="input-onedrive-new-folder"
            />
            <Button
              size="sm"
              onClick={handleCreateFolder}
              disabled={creating || !newFolderName.trim()}
              data-testid="button-onedrive-create-folder-confirm"
            >
              {creating ? <Loader2 className="w-3 h-3 animate-spin" /> : "Create"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setNewFolderOpen(false);
                setNewFolderName("");
              }}
              disabled={creating}
            >
              Cancel
            </Button>
          </div>
        ) : (
          <Button
            size="sm"
            variant="outline"
            className="self-start"
            onClick={() => setNewFolderOpen(true)}
            disabled={loading || !!error}
            data-testid="button-onedrive-new-folder"
          >
            <FolderPlus className="w-3.5 h-3.5 mr-1" />
            New folder here
          </Button>
        )}

        <DialogFooter className="gap-2 sm:justify-between">
          <div className="text-xs text-muted-foreground self-center">
            Selected: <span className="font-mono">{currentPath || "OneDrive root"}</span>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSelect}
              disabled={!currentPath}
              data-testid="button-onedrive-select"
            >
              Use this folder
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
