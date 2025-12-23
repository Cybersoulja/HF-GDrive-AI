import { useStore, RunHistoryItem } from "@/lib/store";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { History, Download, Trash2, Terminal, MessageSquare } from "lucide-react";
import { format } from "date-fns";

export function HistoryPanel() {
  const { history, clearHistory } = useStore();

  const handleExport = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(history, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", `hf-lab-history-${Date.now()}.json`);
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="h-9 w-9">
          <History className="h-4 w-4" />
        </Button>
      </SheetTrigger>
      <SheetContent className="w-[320px] sm:w-[400px] flex flex-col p-0 gap-0">
        <SheetHeader className="p-4 border-b border-border">
          <SheetTitle className="flex items-center justify-between">
            <span>Run History</span>
            <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleExport} title="Export JSON">
                    <Download className="h-3.5 w-3.5" />
                </Button>
                {history.length > 0 && (
                     <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={clearHistory} title="Clear All">
                        <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                )}
            </div>
          </SheetTitle>
        </SheetHeader>
        
        <ScrollArea className="flex-1 p-4">
            {history.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-40 text-muted-foreground text-sm">
                    <History className="h-8 w-8 mb-2 opacity-20" />
                    No runs yet
                </div>
            ) : (
                <div className="space-y-4">
                    {history.map((item) => (
                        <div key={item.id} className="group flex flex-col gap-2 rounded-lg border border-border bg-card p-3 text-sm transition-colors hover:bg-accent/50">
                            <div className="flex items-center justify-between text-xs text-muted-foreground">
                                <span className="flex items-center gap-1.5 font-mono">
                                    {item.type === 'chat' ? <MessageSquare className="h-3 w-3" /> : <Terminal className="h-3 w-3" />}
                                    {format(item.timestamp, "HH:mm:ss")}
                                </span>
                                <span className="font-mono truncate max-w-[120px]">{item.modelId}</span>
                            </div>
                            <div className="font-medium line-clamp-2">{item.userPrompt}</div>
                            <div className="text-xs text-muted-foreground line-clamp-3 font-mono bg-muted/50 p-1.5 rounded">
                                {item.output || "(No output)"}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
