import { useState, useRef, useEffect } from "react";
import { Link } from "wouter";
import { useStore } from "@/lib/store";
import { runInference } from "@/lib/hf";
import { SettingsDialog } from "@/components/SettingsDialog";
import { HistoryPanel } from "@/components/HistoryPanel";
import { OutputDisplay } from "@/components/OutputDisplay";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { FlaskConical, Send, Bot, User, Trash, StopCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface Message {
  role: "system" | "user" | "assistant";
  content: string;
}

export default function Chat() {
  const store = useStore();
  const { toast } = useToast();
  const scrollRef = useRef<HTMLDivElement>(null);
  
  const [messages, setMessages] = useState<Message[]>([
    { role: "system", content: "You are a helpful and knowledgeable AI assistant." }
  ]);
  const [input, setInput] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [currentStream, setCurrentStream] = useState("");

  useEffect(() => {
    if (scrollRef.current) {
        scrollRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, currentStream]);

  const handleSend = async () => {
    if (!store.apiKey) {
      toast({ title: "No API Key", description: "Configure in settings first.", variant: "destructive" });
      return;
    }
    if (!input.trim() || isGenerating) return;

    const newMsgs: Message[] = [...messages, { role: "user", content: input }];
    setMessages(newMsgs);
    setInput("");
    setIsGenerating(true);
    setCurrentStream("");

    try {
        const output = await runInference(
            store.apiKey,
            store.activeModelId,
            newMsgs,
            store.generationParams,
            (chunk) => setCurrentStream(chunk)
        );

        setMessages(prev => [...prev, { role: "assistant", content: output }]);
        
        store.addToHistory({
            id: crypto.randomUUID(),
            timestamp: Date.now(),
            modelId: store.activeModelId,
            systemPrompt: messages[0].content,
            userPrompt: input,
            output: output,
            params: store.generationParams,
            type: 'chat'
        });

    } catch (error: any) {
        toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
        setIsGenerating(false);
        setCurrentStream("");
    }
  };

  const handleClear = () => {
      setMessages([{ role: "system", content: "You are a helpful and knowledgeable AI assistant." }]);
  };

  return (
    <div className="h-screen bg-background text-foreground flex flex-col md:flex-row overflow-hidden">
       {/* Sidebar / Header on Mobile */}
       <header className="md:w-64 border-b md:border-r border-border p-4 flex md:flex-col justify-between items-center md:items-stretch bg-secondary/30 backdrop-blur-sm z-10 shrink-0">
        <div className="flex items-center gap-2 font-bold text-lg md:mb-8">
            <div className="h-8 w-8 rounded bg-primary text-primary-foreground flex items-center justify-center">
                <FlaskConical className="h-5 w-5" />
            </div>
            <span>HF Lab</span>
        </div>

        <nav className="hidden md:flex flex-col gap-1 flex-1">
             <Link href="/">
                <Button variant="ghost" className="justify-start w-full">Prompt Tester</Button>
             </Link>
             <Button variant="secondary" className="justify-start">Chat Mode</Button>
        </nav>

        <div className="flex items-center gap-2">
            <HistoryPanel />
            <SettingsDialog />
        </div>
      </header>

      {/* Chat Area */}
      <main className="flex-1 flex flex-col w-full max-w-4xl mx-auto h-full relative">
        <div className="absolute top-0 w-full z-10 bg-background/80 backdrop-blur p-2 border-b border-border flex items-center justify-between px-4">
            <div className="text-xs font-mono text-muted-foreground">
                Model: {store.activeModelId}
            </div>
            <Button variant="ghost" size="sm" onClick={handleClear} className="text-muted-foreground hover:text-destructive">
                <Trash className="h-4 w-4 mr-2" /> Clear Chat
            </Button>
        </div>

        <ScrollArea className="flex-1 p-4 pt-12 pb-4">
            <div className="space-y-6">
                {messages.filter(m => m.role !== 'system').map((msg, idx) => (
                    <div key={idx} className={cn("flex gap-3", msg.role === 'user' ? "flex-row-reverse" : "flex-row")}>
                        <Avatar className={cn("h-8 w-8 mt-1", msg.role === 'assistant' ? "bg-primary text-primary-foreground" : "bg-muted")}>
                            <AvatarFallback>{msg.role === 'assistant' ? <Bot className="h-4 w-4" /> : <User className="h-4 w-4" />}</AvatarFallback>
                        </Avatar>
                        <div className={cn(
                            "max-w-[85%] rounded-lg p-3 text-sm",
                            msg.role === 'user' 
                                ? "bg-primary text-primary-foreground" 
                                : "bg-card border border-border"
                        )}>
                            {msg.role === 'user' ? (
                                <div className="whitespace-pre-wrap">{msg.content}</div>
                            ) : (
                                <OutputDisplay content={msg.content} className="border-0 bg-transparent p-0" />
                            )}
                        </div>
                    </div>
                ))}
                
                {isGenerating && (
                    <div className="flex gap-3 flex-row">
                        <Avatar className="h-8 w-8 mt-1 bg-primary text-primary-foreground">
                            <AvatarFallback><Bot className="h-4 w-4" /></AvatarFallback>
                        </Avatar>
                        <div className="max-w-[85%] rounded-lg p-3 text-sm bg-card border border-border">
                            <OutputDisplay content={currentStream} isStreaming={true} className="border-0 bg-transparent p-0" />
                        </div>
                    </div>
                )}
                <div ref={scrollRef} />
            </div>
        </ScrollArea>

        <div className="p-4 bg-background border-t border-border mt-auto">
            <div className="relative flex items-end gap-2">
                <Input 
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
                    placeholder="Type a message..."
                    className="pr-12 py-3 h-12 bg-secondary/50 border-transparent focus:border-primary"
                />
                <Button 
                    size="icon" 
                    className="absolute right-1 top-1 h-10 w-10" 
                    onClick={isGenerating ? () => setIsGenerating(false) : handleSend}
                    variant={isGenerating ? "destructive" : "default"}
                >
                    {isGenerating ? <StopCircle className="h-4 w-4" /> : <Send className="h-4 w-4" />}
                </Button>
            </div>
        </div>
      </main>
    </div>
  );
}
