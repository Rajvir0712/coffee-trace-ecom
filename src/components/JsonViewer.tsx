import { useState } from "react";
import { ChevronDown, ChevronRight, Copy, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface JsonViewerProps {
  data: any;
  filename?: string;
}

export const JsonViewer = ({ data, filename = "lineage" }: JsonViewerProps) => {
  const handleCopy = () => {
    navigator.clipboard.writeText(JSON.stringify(data, null, 2));
    toast.success("Copied to clipboard");
  };

  const handleDownload = () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${filename}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Downloaded successfully");
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2 justify-end">
        <Button onClick={handleCopy} variant="outline" size="sm">
          <Copy className="w-4 h-4 mr-2" />
          Copy
        </Button>
        <Button onClick={handleDownload} variant="outline" size="sm">
          <Download className="w-4 h-4 mr-2" />
          Download
        </Button>
      </div>
      <div className="bg-card border rounded-lg p-4 max-h-[600px] overflow-auto font-mono text-sm">
        <JsonNode data={data} />
      </div>
    </div>
  );
};

interface JsonNodeProps {
  data: any;
  depth?: number;
}

const JsonNode = ({ data, depth = 0 }: JsonNodeProps) => {
  const [isExpanded, setIsExpanded] = useState(depth < 2);

  if (data === null) {
    return <span className="text-muted-foreground">null</span>;
  }

  if (data === undefined) {
    return <span className="text-muted-foreground">undefined</span>;
  }

  if (typeof data === "boolean") {
    return <span className="text-accent">{data.toString()}</span>;
  }

  if (typeof data === "number") {
    return <span className="text-primary">{data}</span>;
  }

  if (typeof data === "string") {
    return <span className="text-foreground">"{data}"</span>;
  }

  if (Array.isArray(data)) {
    if (data.length === 0) {
      return <span className="text-muted-foreground">[]</span>;
    }

    return (
      <div>
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="inline-flex items-center hover:text-primary transition-colors"
        >
          {isExpanded ? (
            <ChevronDown className="w-4 h-4" />
          ) : (
            <ChevronRight className="w-4 h-4" />
          )}
          <span className="text-muted-foreground ml-1">[{data.length}]</span>
        </button>
        {isExpanded && (
          <div className="ml-4 border-l border-border pl-4 mt-1">
            {data.map((item, index) => (
              <div key={index} className="my-1">
                <span className="text-muted-foreground mr-2">{index}:</span>
                <JsonNode data={item} depth={depth + 1} />
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (typeof data === "object") {
    const keys = Object.keys(data);
    if (keys.length === 0) {
      return <span className="text-muted-foreground">{'{}'}</span>;
    }

    return (
      <div>
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="inline-flex items-center hover:text-primary transition-colors"
        >
          {isExpanded ? (
            <ChevronDown className="w-4 h-4" />
          ) : (
            <ChevronRight className="w-4 h-4" />
          )}
          <span className="text-muted-foreground ml-1">
            {'{'}{keys.length}{'}'}
          </span>
        </button>
        {isExpanded && (
          <div className="ml-4 border-l border-border pl-4 mt-1">
            {keys.map((key) => (
              <div key={key} className="my-1">
                <span className="text-accent font-medium mr-2">"{key}":</span>
                <JsonNode data={data[key]} depth={depth + 1} />
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return <span>{String(data)}</span>;
};
