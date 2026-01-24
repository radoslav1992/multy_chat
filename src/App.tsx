import { useEffect } from "react";
import { Sidebar } from "@/components/layout/Sidebar";
import { ChatWindow } from "@/components/chat/ChatWindow";
import { SettingsDialog } from "@/components/settings/SettingsDialog";
import { KnowledgeSidebar } from "@/components/knowledge/KnowledgeSidebar";
import { Toaster } from "@/components/ui/Toaster";
import { useAppStore } from "@/stores/appStore";
import { useChatStore } from "@/stores/chatStore";

function App() {
  const { theme, sidebarOpen, knowledgeSidebarOpen } = useAppStore();
  const { initializeDatabase } = useChatStore();

  useEffect(() => {
    // Apply theme
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  useEffect(() => {
    // Initialize database on app start
    initializeDatabase();
  }, [initializeDatabase]);

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Left Sidebar - Chat History */}
      <Sidebar isOpen={sidebarOpen} />

      {/* Main Chat Area */}
      <main className="flex-1 flex flex-col min-w-0">
        <ChatWindow />
      </main>

      {/* Right Sidebar - Knowledge Buckets */}
      <KnowledgeSidebar isOpen={knowledgeSidebarOpen} />

      {/* Settings Dialog */}
      <SettingsDialog />

      {/* Toast Notifications */}
      <Toaster />
    </div>
  );
}

export default App;
