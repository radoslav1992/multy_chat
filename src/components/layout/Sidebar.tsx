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
    const visibleTags = tags.slice(0, 3);
    const remaining = tags.length - visibleTags.length;
    return (
      <div className="flex flex-wrap gap-1 mt-1">
        {visibleTags.map((tag) => (
          <span
            key={tag}
            className="px-1.5 py-0.5 rounded-sm text-[10px] bg-muted/60 text-muted-foreground"
          >
            {tag}
          </span>
        ))}
        {remaining > 0 && (
          <span className="px-1.5 py-0.5 rounded-sm text-[10px] bg-muted/60 text-muted-foreground">
            +{remaining}
          </span>
        )}
      </div>
    );
  };

  const renderFolder = (folder?: string | null) => {
    if (!folder) return null;
    return (
      <span className="px-2 py-0.5 rounded-full text-[10px] bg-primary/10 text-primary">
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

  return (
    <>
      <AnimatePresence mode="wait">
        {isOpen && (
          <motion.aside
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 280, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="flex flex-col border-r border-border bg-card h-full overflow-hidden"
          >
            {/* Header */}
            <div className="p-4 border-b border-border space-y-3">
              <Button
                onClick={handleNewChat}
                className="w-full justify-start gap-2"
                variant="outline"
              >
                <MessageSquarePlus className="h-4 w-4" />
                New Chat
              </Button>
              
              {/* Search Input */}
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search chats..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8 pr-8 h-9 text-sm"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery("")}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>

              {/* Filters */}
              <div className="flex items-center justify-between text-xs">
                <Popover.Root open={filterPopoverOpen} onOpenChange={setFilterPopoverOpen}>
                  <Popover.Trigger asChild>
                    <Button variant="ghost" size="sm" className="h-7 px-2">
                      <Filter className="h-3.5 w-3.5 mr-1" />
                      Filters
                    </Button>
                  </Popover.Trigger>
                  <Popover.Portal>
                    <Popover.Content
                      className="w-64 rounded-xl border border-border bg-popover p-3 shadow-lg"
                      sideOffset={8}
                      align="start"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium">Filters</span>
                        <button
                          onClick={() => setFilterPopoverOpen(false)}
                          className="text-muted-foreground hover:text-foreground"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                      <div className="space-y-3">
                        <div>
                          <p className="text-xs font-medium text-muted-foreground mb-1">
                            Folders
                          </p>
                          <div className="flex flex-wrap gap-1">
                            {availableFolders.length === 0 ? (
                              <span className="text-xs text-muted-foreground">
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
                                  className={`px-2 py-1 rounded-md text-xs border ${
                                    selectedFolderFilter === folder
                                      ? "border-primary text-primary bg-primary/10"
                                      : "border-border text-muted-foreground hover:text-foreground"
                                  }`}
                                >
                                  {folder}
                                </button>
                              ))
                            )}
                          </div>
                        </div>
                        <div>
                          <p className="text-xs font-medium text-muted-foreground mb-1">Tags</p>
                          <div className="flex flex-wrap gap-1">
                            {availableTags.length === 0 ? (
                              <span className="text-xs text-muted-foreground">
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
                                  className={`px-2 py-1 rounded-md text-xs border ${
                                    selectedTagFilter === tag
                                      ? "border-primary text-primary bg-primary/10"
                                      : "border-border text-muted-foreground hover:text-foreground"
                                  }`}
                                >
                                  {tag}
                                </button>
                              ))
                            )}
                          </div>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="mt-3 w-full"
                        onClick={() => {
                          setSelectedTagFilter(null);
                          setSelectedFolderFilter(null);
                        }}
                        disabled={!selectedTagFilter && !selectedFolderFilter}
                      >
                        Clear filters
                      </Button>
                    </Popover.Content>
                  </Popover.Portal>
                </Popover.Root>
                {(selectedTagFilter || selectedFolderFilter) && (
                  <div className="flex items-center gap-1 text-muted-foreground">
                    {selectedFolderFilter && (
                      <span className="px-2 py-0.5 rounded-full bg-muted/60">
                        {selectedFolderFilter}
                      </span>
                    )}
                    {selectedTagFilter && (
                      <span className="px-2 py-0.5 rounded-full bg-muted/60">
                        {selectedTagFilter}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Conversations List */}
            <ScrollArea className="flex-1">
              <div className="p-2 space-y-1">
                {conversations.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    No conversations yet
                  </p>
                ) : searchQuery.trim() ? (
                  isSearching ? (
                    <p className="text-sm text-muted-foreground text-center py-8">
                      Searching...
                    </p>
                  ) : filteredSearchResults.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-8">
                      No matches found
                    </p>
                  ) : (
                    filteredSearchResults.map((conversation) => (
                      <motion.div
                        key={conversation.id}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        className="relative"
                        onMouseEnter={() => setHoveredId(conversation.id)}
                        onMouseLeave={() => setHoveredId(null)}
                      >
                        <button
                          onClick={() => selectConversation(conversation.id)}
                          className={cn(
                            "w-full text-left px-3 py-2 rounded-lg transition-colors duration-150",
                            "hover:bg-accent/50",
                            currentConversationId === conversation.id &&
                              "bg-accent text-accent-foreground"
                          )}
                        >
                        <div className="flex items-center gap-2 pr-8">
                          {!!conversation.pinned && (
                            <Pin className="h-3.5 w-3.5 text-primary flex-shrink-0" />
                          )}
                          <p className="text-sm font-medium truncate">
                            {truncateText(conversation.title, 25)}
                          </p>
                        </div>
                        <div className="flex items-center flex-wrap gap-1 mt-0.5 text-xs text-muted-foreground">
                          {conversation.snippet
                            ? truncateText(conversation.snippet, 60)
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
                              initial={{ opacity: 0, scale: 0.8 }}
                              animate={{ opacity: 1, scale: 1 }}
                              exit={{ opacity: 0, scale: 0.8 }}
                              className="absolute right-2 top-1/2 -translate-y-1/2"
                            >
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-muted-foreground hover:text-destructive"
                                onClick={(e) =>
                                  handleDeleteClick(
                                    e,
                                    conversation.id,
                                    conversation.title
                                  )
                                }
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-muted-foreground hover:text-primary"
                                onClick={(e) =>
                                  handlePinToggle(
                                    e,
                                    conversation.id,
                                    conversation.pinned
                                  )
                                }
                                title={
                                  conversation.pinned
                                    ? "Unpin conversation"
                                    : "Pin conversation"
                                }
                              >
                                {conversation.pinned ? (
                                  <PinOff className="h-3.5 w-3.5" />
                                ) : (
                                  <Pin className="h-3.5 w-3.5" />
                                )}
                              </Button>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </motion.div>
                    ))
                  )
                ) : filteredConversations.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    No conversations match the filters
                  </p>
                ) : (
                  filteredConversations.map((conversation) => (
                    <motion.div
                      key={conversation.id}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      className="relative"
                      onMouseEnter={() => setHoveredId(conversation.id)}
                      onMouseLeave={() => setHoveredId(null)}
                    >
                      <button
                        onClick={() => selectConversation(conversation.id)}
                        className={cn(
                          "w-full text-left px-3 py-2 rounded-lg transition-colors duration-150",
                          "hover:bg-accent/50",
                          currentConversationId === conversation.id &&
                            "bg-accent text-accent-foreground"
                        )}
                      >
                        <div className="flex items-center gap-2 pr-8">
                          {!!conversation.pinned && (
                            <Pin className="h-3.5 w-3.5 text-primary flex-shrink-0" />
                          )}
                          <p className="text-sm font-medium truncate">
                            {truncateText(conversation.title, 25)}
                          </p>
                        </div>
                        <div className="flex items-center flex-wrap gap-1 mt-0.5 text-xs text-muted-foreground">
                          {formatDate(conversation.updated_at)}
                        </div>
                        <div className="flex items-center flex-wrap gap-1 mt-1">
                          {renderFolder(conversation.folder)}
                          {renderTags(conversation.tags)}
                        </div>
                      </button>

                      <AnimatePresence>
                        {hoveredId === conversation.id && (
                          <motion.div
                            initial={{ opacity: 0, scale: 0.8 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.8 }}
                            className="absolute right-2 top-1/2 -translate-y-1/2"
                          >
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-muted-foreground hover:text-destructive"
                              onClick={(e) =>
                                handleDeleteClick(
                                  e,
                                  conversation.id,
                                  conversation.title
                                )
                              }
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-muted-foreground hover:text-primary"
                              onClick={(e) =>
                                handlePinToggle(
                                  e,
                                  conversation.id,
                                  conversation.pinned
                                )
                              }
                              title={
                                conversation.pinned
                                  ? "Unpin conversation"
                                  : "Pin conversation"
                              }
                            >
                              {conversation.pinned ? (
                                <PinOff className="h-3.5 w-3.5" />
                              ) : (
                                <Pin className="h-3.5 w-3.5" />
                              )}
                            </Button>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  ))
                )}
              </div>
            </ScrollArea>

            {/* Footer */}
            <div className="p-3 border-t border-border space-y-2">
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                  className="flex-shrink-0"
                >
                  {theme === "dark" ? (
                    <Sun className="h-4 w-4" />
                  ) : (
                    <Moon className="h-4 w-4" />
                  )}
                </Button>
                <Button
                  variant="ghost"
                  className="flex-1 justify-start gap-2"
                  onClick={() => setSettingsOpen(true)}
                >
                  <Settings className="h-4 w-4" />
                  Settings
                </Button>
              </div>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* Delete Confirmation Dialog */}
      <AlertDialog.Root open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialog.Portal>
          <AlertDialog.Overlay className="fixed inset-0 bg-black/50 z-50" />
          <AlertDialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-background border border-border rounded-xl p-6 w-[400px] z-50 shadow-xl">
            <AlertDialog.Title className="text-lg font-semibold">
              Delete Conversation
            </AlertDialog.Title>
            <AlertDialog.Description className="text-sm text-muted-foreground mt-2">
              Are you sure you want to delete "{conversationToDelete?.title}"? This action cannot be undone.
            </AlertDialog.Description>
            <div className="flex justify-end gap-3 mt-6">
              <AlertDialog.Cancel asChild>
                <Button variant="ghost">Cancel</Button>
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
