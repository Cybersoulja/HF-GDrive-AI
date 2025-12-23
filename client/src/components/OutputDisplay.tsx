import ReactMarkdown from 'react-markdown';
import { cn } from '@/lib/utils';
import { Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';

interface OutputDisplayProps {
  content: string;
  isStreaming?: boolean;
  className?: string;
}

export function OutputDisplay({ content, isStreaming, className }: OutputDisplayProps) {
  const { toast } = useToast();

  const copyToClipboard = () => {
    navigator.clipboard.writeText(content);
    toast({ title: "Copied to clipboard" });
  };

  if (!content && !isStreaming) return null;

  return (
    <div className={cn("relative group rounded-lg border border-border bg-card overflow-hidden", className)}>
        <div className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 transition-opacity">
            <Button variant="secondary" size="icon" className="h-6 w-6" onClick={copyToClipboard}>
                <Copy className="h-3 w-3" />
            </Button>
        </div>
      <div className="p-4 text-sm prose prose-neutral dark:prose-invert max-w-none prose-sm leading-relaxed">
        <ReactMarkdown>{content}</ReactMarkdown>
        {isStreaming && (
            <span className="inline-block w-2 h-4 ml-1 align-middle bg-primary animate-pulse" />
        )}
      </div>
    </div>
  );
}
