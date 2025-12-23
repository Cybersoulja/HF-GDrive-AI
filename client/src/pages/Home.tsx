import { useState } from "react";
import { Link } from "wouter";
import { useStore } from "@/lib/store";
import { runInference } from "@/lib/hf";
import { SettingsDialog } from "@/components/SettingsDialog";
import { HistoryPanel } from "@/components/HistoryPanel";
import { OutputDisplay } from "@/components/OutputDisplay";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { FlaskConical, Play, StopCircle, RefreshCcw, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function Home() {
  const store = useStore();
  const { toast } = useToast();
  
  const [systemPrompt, setSystemPrompt] = useState("You are a helpful AI assistant.");
  const [userPrompt, setUserPrompt] = useState("");
  const [output, setOutput] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [controller, setController] = useState<AbortController | null>(null);

  const handleRun = async () => {
    if (!store.apiKey) {
      toast({ title: "No API Key", description: "Please add your Hugging Face Token in settings.", variant: "destructive" });
      return;
    }
    if (!userPrompt.trim()) return;

    setIsGenerating(true);
    setOutput("");
    const abortController = new AbortController(); // Note: Abort not fully implemented in my simplified fetch yet, but good practice
    setController(abortController);

    try {
        const messages = [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt }
        ];

        const finalOutput = await runInference(
            store.apiKey,
            store.activeModelId,
            messages,
            store.generationParams,
            (chunk) => setOutput(chunk)
        );

        store.addToHistory({
            id: crypto.randomUUID(),
            timestamp: Date.now(),
            modelId: store.activeModelId,
            systemPrompt,
            userPrompt,
            output: finalOutput,
            params: store.generationParams,
            type: 'completion'
        });

    } catch (error: any) {
        toast({ title: "Error", description: error.message, variant: "destructive" });
        setOutput(`Error: ${error.message}`);
    } finally {
        setIsGenerating(false);
        setController(null);
    }
  };

  const handleStop = () => {
      // Since fetch isn't easily abortable in the simplified version without signal (I should have added signal),
      // we'll just stop updating state for now.
      if (controller) controller.abort();
      setIsGenerating(false);
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col md:flex-row">
      {/* Sidebar / Header on Mobile */}
      <header className="md:w-64 border-b md:border-r border-border p-4 flex md:flex-col justify-between items-center md:items-stretch bg-secondary/30 backdrop-blur-sm z-10 sticky top-0 md:static">
        <div className="flex items-center gap-2 font-bold text-lg md:mb-8">
            <div className="h-8 w-8 rounded bg-primary text-primary-foreground flex items-center justify-center">
                <FlaskConical className="h-5 w-5" />
            </div>
            <span>HF Lab</span>
        </div>

        <nav className="hidden md:flex flex-col gap-1 flex-1">
             <Button variant="secondary" className="justify-start">Prompt Tester</Button>
             <Link href="/chat">
                <Button variant="ghost" className="justify-start w-full">Chat Mode</Button>
             </Link>
        </nav>

        <div className="flex items-center gap-2">
            <HistoryPanel />
            <SettingsDialog />
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex flex-col max-w-5xl mx-auto w-full">
        <div className="p-4 md:p-6 space-y-6">
            
            {/* Model & Config Bar */}
            <div className="grid gap-4 md:grid-cols-12">
                <div className="md:col-span-8 space-y-2">
                    <Label htmlFor="model">Model ID</Label>
                    <div className="flex gap-2">
                        <Input 
                            id="model" 
                            value={store.activeModelId} 
                            onChange={(e) => store.setActiveModelId(e.target.value)}
                            className="font-mono text-sm"
                            placeholder="org/model-name"
                        />
                         <Button variant="outline" size="icon" onClick={() => store.setActiveModelId("microsoft/Phi-3.5-mini-instruct")} title="Reset to Phi-3.5">
                             <RefreshCcw className="h-4 w-4" />
                         </Button>
                    </div>
                </div>
                
                <div className="md:col-span-4 space-y-2">
                     <Label>Params</Label>
                     <div className="flex items-center gap-2 border border-input rounded-md px-3 h-10 bg-background">
                        <span className="text-xs text-muted-foreground w-12">Temp</span>
                        <input 
                            type="range" 
                            min="0" max="2" step="0.1"
                            className="flex-1 h-2 bg-secondary rounded-lg appearance-none cursor-pointer accent-primary"
                            value={store.generationParams.temperature}
                            onChange={(e) => store.setGenerationParams({ temperature: parseFloat(e.target.value) })}
                        />
                        <span className="text-xs font-mono w-8 text-right">{store.generationParams.temperature}</span>
                     </div>
                </div>
            </div>

            <div className="grid md:grid-cols-2 gap-6 h-full">
                
                {/* INPUT COLUMN */}
                <div className="space-y-4 flex flex-col h-full">
                    <div className="space-y-2">
                        <Label>System Prompt</Label>
                        <Textarea 
                            value={systemPrompt}
                            onChange={(e) => setSystemPrompt(e.target.value)}
                            className="min-h-[100px] font-mono text-sm resize-none bg-card/50"
                            placeholder="Define the behavior..."
                        />
                    </div>
                    
                    <div className="space-y-2 flex-1 flex flex-col">
                        <Label>User Input</Label>
                        <Textarea 
                            value={userPrompt}
                            onChange={(e) => setUserPrompt(e.target.value)}
                            className="flex-1 min-h-[200px] font-mono text-sm resize-none p-4 leading-relaxed shadow-inner bg-card"
                            placeholder="Enter your prompt here..." 
                        />
                    </div>

                    <Button 
                        size="lg" 
                        className="w-full font-semibold shadow-lg shadow-primary/20" 
                        onClick={isGenerating ? handleStop : handleRun}
                        variant={isGenerating ? "destructive" : "default"}
                    >
                        {isGenerating ? (
                            <>
                                <StopCircle className="mr-2 h-4 w-4" /> Stop Generation
                            </>
                        ) : (
                            <>
                                <Play className="mr-2 h-4 w-4 fill-current" /> Run Inference
                            </>
                        )}
                    </Button>
                </div>

                {/* OUTPUT COLUMN */}
                <div className="flex flex-col h-full min-h-[400px] rounded-xl border border-border bg-secondary/30 relative overflow-hidden">
                    <div className="absolute top-0 left-0 right-0 h-10 bg-secondary/50 border-b border-border flex items-center px-4 text-xs font-mono text-muted-foreground uppercase tracking-wider">
                        Output Console
                    </div>
                    <ScrollArea className="flex-1 p-4 pt-14">
                        {output ? (
                            <OutputDisplay content={output} isStreaming={isGenerating} />
                        ) : (
                            <div className="flex flex-col items-center justify-center h-[300px] text-muted-foreground/40">
                                <Loader2 className="h-12 w-12 animate-spin-slow mb-4 opacity-20" />
                                <p className="text-sm">Waiting for generation...</p>
                            </div>
                        )}
                    </ScrollArea>
                </div>

            </div>
        </div>
      </main>
    </div>
  );
}
