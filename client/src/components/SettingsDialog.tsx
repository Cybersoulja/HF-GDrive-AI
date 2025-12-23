import { useState, useEffect } from "react";
import { useStore } from "@/lib/store";
import { checkConnection } from "@/lib/hf";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Settings, CheckCircle2, XCircle, Key } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export function SettingsDialog() {
  const { apiKey, setApiKey } = useStore();
  const [inputKey, setInputKey] = useState("");
  const [status, setStatus] = useState<"idle" | "checking" | "valid" | "invalid">("idle");
  const [open, setOpen] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (open) {
      setInputKey(apiKey || "");
      setStatus("idle");
    }
  }, [open, apiKey]);

  const handleSave = async () => {
    if (!inputKey.trim()) {
      setApiKey(null);
      toast({ title: "API Key removed" });
      setOpen(false);
      return;
    }

    setStatus("checking");
    const isValid = await checkConnection(inputKey);
    
    if (isValid) {
      setStatus("valid");
      setApiKey(inputKey);
      toast({ title: "Connected to Hugging Face", className: "bg-green-500/10 border-green-500/20 text-green-500" });
      setTimeout(() => setOpen(false), 1000);
    } else {
      setStatus("invalid");
      toast({ title: "Connection Failed", description: "Please check your token.", variant: "destructive" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="icon" className="h-9 w-9">
          <Settings className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>
            Configure your Hugging Face Access Token.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="apiKey" className="flex items-center gap-2">
                <Key className="h-3.5 w-3.5" />
                Access Token
            </Label>
            <div className="relative">
              <Input
                id="apiKey"
                type="password"
                placeholder="hf_..."
                value={inputKey}
                onChange={(e) => {
                    setInputKey(e.target.value);
                    setStatus("idle");
                }}
                className="pr-10 font-mono"
              />
              <div className="absolute right-3 top-2.5">
                {status === "checking" && <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />}
                {status === "valid" && <CheckCircle2 className="h-5 w-5 text-green-500" />}
                {status === "invalid" && <XCircle className="h-5 w-5 text-destructive" />}
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground">
              Your token is stored locally in your browser.
            </p>
          </div>
        </div>
        <div className="flex justify-end gap-2">
           <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
           <Button onClick={handleSave} disabled={status === "checking"}>
             {status === "checking" ? "Verifying..." : "Save Token"}
           </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
