import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import * as AlertDialog from "@radix-ui/react-alert-dialog";
import * as Popover from "@radix-ui/react-popover";
import {
  MessageSquarePlus,
  Settings,
  Trash2,
  Sun,
  Moon,
  Search,
  X,
  Pin,
  PinOff,
  Filter,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { ScrollArea } from "@/components/ui/ScrollArea";
import { useAppStore } from "@/stores/appStore";
import { useChatStore, ConversationSearchResult } from "@/stores/chatStore";
import { cn, formatDate, truncateText } from "@/lib/utils";

interface SidebarProps {
  isOpen: boolean;
}

export function Sidebar({ isOpen }: SidebarProps) {
  const { theme, setTheme, setSettingsOpen } = useAppStore();
  const {
    conversations,
    currentConversationId,
    createConversation,
    selectConversation,
    deleteConversation,
    setConversationPinned,
    searchConversations,
  } = useChatStore();
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<ConversationSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [filterPopoverOpen, setFilterPopoverOpen] = useState(false);
  const [selectedTagFilter, setSelectedTagFilter] = useState<string | null>(null);
  const [selectedFolderFilter, setSelectedFolderFilter] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [conversationToDelete, setConversationToDelete] = useState<{id: string, title: string} | null>(null);

  const handleNewChat = async () => {
    await createConversation("New Chat");
  };

  const handleDeleteClick = (e: React.MouseEvent, id: string, title: string) => {
    e.stopPropagation();
    setConversationToDelete({ id, title });
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (conversationToDelete) {
      await deleteConversation(conversationToDelete.id);
      setConversationToDelete(null);
      setDeleteDialogOpen(false);
    }
  };

  const renderTags = (tags?: string[]) => {
    if (!tags || tags.length === 0) return null;
    const visibleTags = tags.slice(0, 2);
    const remaining = tags.length - visibleTags.length;
    return (
      <div className="flex flex-wrap gap-1 mt-1.5">
        {visibleTags.map((tag) => (
          <span
            key={tag}
            className="px-1.5 py-0.5 rounded-md text-[10px] bg-primary/10 text-primary font-medium"
          >
            {tag}
          </span>
        ))}
        {remaining > 0 && (
          <span className="px-1.5 py-0.5 rounded-md text-[10px] bg-muted text-muted-foreground">
            +{remaining}
          </span>
        )}
      </div>
    );
  };

  const renderFolder = (folder?: string | null) => {
    if (!folder) return null;
    return (
      <span className="px-2 py-0.5 rounded-full text-[10px] bg-secondary text-secondary-foreground font-medium">
        {folder}
      </span>
    );
  };

  const handlePinToggle = async (
    e: React.MouseEvent,
    id: string,
    pinned: boolean | undefined
  ) => {
    e.stopPropagation();
    await setConversationPinned(id, !pinned);
    setSearchResults((prev) =>
      prev.map((result) =>
        result.id === id ? { ...result, pinned: !pinned } : result
      )
    );
  };

  const availableTags = useMemo(() => {
    const tags = new Set<string>();
    conversations.forEach((conversation) => {
      conversation.tags?.forEach((tag) => tags.add(tag));
    });
    return Array.from(tags).sort((a, b) => a.localeCompare(b));
  }, [conversations]);

  const availableFolders = useMemo(() => {
    const folders = new Set<string>();
    conversations.forEach((conversation) => {
      if (conversation.folder) {
        folders.add(conversation.folder);
      }
    });
    return Array.from(folders).sort((a, b) => a.localeCompare(b));
  }, [conversations]);

  const applyFilters = <T extends { tags?: string[]; folder?: string | null }>(
    items: T[]
  ) => {
    return items.filter((item) => {
      if (selectedTagFilter && !item.tags?.includes(selectedTagFilter)) {
        return false;
      }
      if (selectedFolderFilter && item.folder !== selectedFolderFilter) {
        return false;
      }
      return true;
    });
  };

  const filteredConversations = applyFilters(conversations);
  const filteredSearchResults = applyFilters(searchResults);

  useEffect(() => {
    const trimmedQuery = searchQuery.trim();
    if (!trimmedQuery) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    let isActive = true;
    setIsSearching(true);

    const timeout = setTimeout(() => {
      searchConversations(trimmedQuery)
        .then((results) => {
          if (isActive) {
            setSearchResults(results);
          }
        })
        .catch(() => {
          if (isActive) {
            setSearchResults([]);
          }
        })
        .finally(() => {
          if (isActive) {
            setIsSearching(false);
          }
        });
    }, 250);

    return () => {
      isActive = false;
      clearTimeout(timeout);
    };
  }, [searchQuery, searchConversations, conversations]);

  const ConversationItem = ({ conversation, isSearchResult = false }: { conversation: typeof conversations[0] | ConversationSearchResult, isSearchResult?: boolean }) => (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      className="relative group"
      onMouseEnter={() => setHoveredId(conversation.id)}
      onMouseLeave={() => setHoveredId(null)}
    >
      <button
        onClick={() => selectConversation(conversation.id)}
        className={cn(
          "w-full text-left px-3 py-2.5 rounded-xl transition-all duration-200",
          "hover:bg-accent/50",
          currentConversationId === conversation.id
            ? "bg-primary/10 border border-primary/20"
            : "border border-transparent"
        )}
      >
        <div className="flex items-center gap-2 pr-14">
          {!!conversation.pinned && (
            <Pin className="h-3 w-3 text-primary flex-shrink-0" />
          )}
          <p className={cn(
            "text-sm font-medium truncate",
            currentConversationId === conversation.id && "text-primary"
          )}>
            {truncateText(conversation.title, 25)}
          </p>
        </div>
        <div className="flex items-center gap-1.5 mt-1 text-xs text-muted-foreground">
          {isSearchResult && 'snippet' in conversation && conversation.snippet
            ? truncateText(conversation.snippet, 50)
            : formatDate(conversation.updated_at)}
        </div>
        <div className="flex items-center flex-wrap gap-1 mt-1">
          {renderFolder(conversation.folder)}
          {renderTags(conversation.tags)}
        </div>
      </button>

      <AnimatePresence>
        {hoveredId === conversation.id && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-0.5 bg-background/90 backdrop-blur-sm rounded-lg p-0.5 border border-border shadow-sm"
          >
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-primary"
              onClick={(e) =>
                handlePinToggle(e, conversation.id, conversation.pinned)
              }
              title={conversation.pinned ? "Unpin" : "Pin"}
            >
              {conversation.pinned ? (
                <PinOff className="h-3.5 w-3.5" />
              ) : (
                <Pin className="h-3.5 w-3.5" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-destructive"
              onClick={(e) => handleDeleteClick(e, conversation.id, conversation.title)}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );

  return (
    <>
      <AnimatePresence mode="wait">
        {isOpen && (
          <motion.aside
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 300, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
            className="flex flex-col border-r border-border bg-card/50 backdrop-blur-xl h-full overflow-hidden"
          >
            {/* Header */}
            <div className="p-4 space-y-4">
              {/* Logo & New Chat */}
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-gradient-primary flex items-center justify-center shadow-md shadow-primary/20 flex-shrink-0">
                  <Sparkles className="h-4 w-4 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <h1 className="font-semibold text-sm truncate">Multi-Model Chat</h1>
                  <p className="text-[10px] text-muted-foreground">AI Assistant</p>
                </div>
              </div>

              {/* New Chat Button */}
              <Button
                onClick={handleNewChat}
                className="w-full justify-center gap-2 h-10 rounded-xl shadow-sm"
                variant="default"
              >
                <MessageSquarePlus className="h-4 w-4" />
                New Chat
              </Button>
              
              {/* Search Input */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search conversations..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 pr-9 h-9 bg-background/50"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery("")}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>

              {/* Filters */}
              <div className="flex items-center gap-2">
                <Popover.Root open={filterPopoverOpen} onOpenChange={setFilterPopoverOpen}>
                  <Popover.Trigger asChild>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className={cn(
                        "h-8 px-3 text-xs",
                        (selectedTagFilter || selectedFolderFilter) && "text-primary"
                      )}
                    >
                      <Filter className="h-3.5 w-3.5 mr-1.5" />
                      Filters
                      {(selectedTagFilter || selectedFolderFilter) && (
                        <span className="ml-1.5 px-1.5 py-0.5 bg-primary/20 rounded-md text-[10px] font-semibold">
                          {[selectedTagFilter, selectedFolderFilter].filter(Boolean).length}
                        </span>
                      )}
                    </Button>
                  </Popover.Trigger>
                  <Popover.Portal>
                    <Popover.Content
                      className="w-64 rounded-2xl border border-border bg-popover/95 backdrop-blur-xl p-4 shadow-xl animate-fade-in"
                      sideOffset={8}
                      align="start"
                    >
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-sm font-semibold">Filters</span>
                        <button
                          onClick={() => setFilterPopoverOpen(false)}
                          className="text-muted-foreground hover:text-foreground transition-colors"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                      <div className="space-y-4">
                        <div>
                          <p className="text-xs font-medium text-muted-foreground mb-2">
                            Folders
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            {availableFolders.length === 0 ? (
                              <span className="text-xs text-muted-foreground/60">
                                No folders yet
                              </span>
                            ) : (
                              availableFolders.map((folder) => (
                                <button
                                  key={folder}
                                  onClick={() =>
                                    setSelectedFolderFilter(
                                      selectedFolderFilter === folder ? null : folder
                                    )
                                  }
                                  className={cn(
                                    "px-2.5 py-1 rounded-lg text-xs font-medium transition-all",
                                    selectedFolderFilter === folder
                                      ? "bg-primary text-primary-foreground"
                                      : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                                  )}
                                >
                                  {folder}
                                </button>
                              ))
                            )}
                          </div>
                        </div>
                        <div>
                          <p className="text-xs font-medium text-muted-foreground mb-2">Tags</p>
                          <div className="flex flex-wrap gap-1.5">
                            {availableTags.length === 0 ? (
                              <span className="text-xs text-muted-foreground/60">
                                No tags yet
                              </span>
                            ) : (
                              availableTags.map((tag) => (
                                <button
                                  key={tag}
                                  onClick={() =>
                                    setSelectedTagFilter(
                                      selectedTagFilter === tag ? null : tag
                                    )
                                  }
                                  className={cn(
                                    "px-2.5 py-1 rounded-lg text-xs font-medium transition-all",
                                    selectedTagFilter === tag
                                      ? "bg-primary text-primary-foreground"
                                      : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                                  )}
                                >
                                  {tag}
                                </button>
                              ))
                            )}
                          </div>
                        </div>
                      </div>
                      {(selectedTagFilter || selectedFolderFilter) && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="mt-4 w-full text-xs"
                          onClick={() => {
                            setSelectedTagFilter(null);
                            setSelectedFolderFilter(null);
                          }}
                        >
                          Clear all filters
                        </Button>
                      )}
                    </Popover.Content>
                  </Popover.Portal>
                </Popover.Root>
              </div>
            </div>

            {/* Conversations List */}
            <ScrollArea className="flex-1 px-2">
              <div className="space-y-1 pb-4">
                {conversations.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
                    <div className="w-12 h-12 rounded-2xl bg-muted flex items-center justify-center mb-3">
                      <MessageSquarePlus className="h-6 w-6 text-muted-foreground" />
                    </div>
                    <p className="text-sm font-medium text-muted-foreground">No conversations yet</p>
                    <p className="text-xs text-muted-foreground/60 mt-1">
                      Start a new chat to begin
                    </p>
                  </div>
                ) : searchQuery.trim() ? (
                  isSearching ? (
                    <div className="flex items-center justify-center py-12">
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <div className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                        <span className="text-sm">Searching...</span>
                      </div>
                    </div>
                  ) : filteredSearchResults.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
                      <Search className="h-8 w-8 text-muted-foreground/40 mb-3" />
                      <p className="text-sm text-muted-foreground">No matches found</p>
                    </div>
                  ) : (
                    filteredSearchResults.map((conversation) => (
                      <ConversationItem key={conversation.id} conversation={conversation} isSearchResult />
                    ))
                  )
                ) : filteredConversations.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
                    <Filter className="h-8 w-8 text-muted-foreground/40 mb-3" />
                    <p className="text-sm text-muted-foreground">No matches</p>
                  </div>
                ) : (
                  filteredConversations.map((conversation) => (
                    <ConversationItem key={conversation.id} conversation={conversation} />
                  ))
                )}
              </div>
            </ScrollArea>

            {/* Footer */}
            <div className="p-3 border-t border-border/50 bg-card/30">
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                  className="h-9 w-9 rounded-xl flex-shrink-0"
                  title={theme === "dark" ? "Light mode" : "Dark mode"}
                >
                  {theme === "dark" ? (
                    <Sun className="h-4 w-4" />
                  ) : (
                    <Moon className="h-4 w-4" />
                  )}
                </Button>
                <Button
                  variant="ghost"
                  className="flex-1 justify-start gap-2 h-9 rounded-xl"
                  onClick={() => setSettingsOpen(true)}
                >
                  <Settings className="h-4 w-4" />
                  <span className="text-sm">Settings</span>
                </Button>
              </div>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* Delete Confirmation Dialog */}
      <AlertDialog.Root open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialog.Portal>
          <AlertDialog.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50" />
          <AlertDialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-background border border-border rounded-2xl p-6 w-[400px] z-50 shadow-2xl animate-fade-in">
            <AlertDialog.Title className="text-lg font-semibold">
              Delete Conversation
            </AlertDialog.Title>
            <AlertDialog.Description className="text-sm text-muted-foreground mt-2">
              Are you sure you want to delete "{conversationToDelete?.title}"? This action cannot be undone.
            </AlertDialog.Description>
            <div className="flex justify-end gap-3 mt-6">
              <AlertDialog.Cancel asChild>
                <Button variant="outline">Cancel</Button>
              </AlertDialog.Cancel>
              <AlertDialog.Action asChild>
                <Button variant="destructive" onClick={confirmDelete}>
                  Delete
                </Button>
              </AlertDialog.Action>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </>
  );
}
