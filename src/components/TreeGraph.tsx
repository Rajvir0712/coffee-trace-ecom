import { useState } from "react";
import { ChevronDown, ChevronRight, Package, ShoppingCart, ArrowLeftRight, Factory } from "lucide-react";
import { LineageNode } from "@/lib/excelParser";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

interface TreeGraphProps {
  data: LineageNode;
}

export const TreeGraph = ({ data }: TreeGraphProps) => {
  return (
    <div className="w-full overflow-auto p-6 bg-gradient-to-br from-background to-accent/5 rounded-lg border">
      <TreeNode node={data} isRoot={true} />
    </div>
  );
};

interface TreeNodeProps {
  node: LineageNode;
  isRoot?: boolean;
}

const TreeNode = ({ node, isRoot = false }: TreeNodeProps) => {
  const [isExpanded, setIsExpanded] = useState<boolean>(true);
  const hasSources = node.sources && node.sources.length > 0;
  const hasDestinations = node.destinations && node.destinations.length > 0;

  const getProcessIcon = (processType: string) => {
    switch (processType.toLowerCase()) {
      case 'purchase':
        return ShoppingCart;
      case 'output':
        return Factory;
      case 'transfer':
        return ArrowLeftRight;
      case 'consumption':
        return Package;
      default:
        return Package;
    }
  };

  const getProcessColor = (processTypes?: string[]) => {
    if (!processTypes || processTypes.length === 0) return 'bg-muted';
    
    const type = processTypes[0].toLowerCase();
    switch (type) {
      case 'purchase':
        return 'bg-accent/20 border-accent';
      case 'output':
        return 'bg-primary/20 border-primary';
      case 'transfer':
        return 'bg-secondary/40 border-secondary-foreground/30';
      case 'consumption':
        return 'bg-muted border-muted-foreground/30';
      default:
        return 'bg-muted border-border';
    }
  };

  return (
    <div className="relative">
      {/* Node Card */}
      <div className={cn(
        "inline-block min-w-[320px]",
        isRoot && "mb-4"
      )}>
        <div className={cn(
          "border-2 rounded-lg p-4 transition-all duration-300 hover:shadow-lg",
          getProcessColor(node.process_types),
          isRoot && "ring-2 ring-primary/50"
        )}>
          {/* Header */}
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                {node.process_types && node.process_types.map((type, idx) => {
                  const Icon = getProcessIcon(type);
                  return (
                    <Icon key={idx} className="w-4 h-4 text-accent flex-shrink-0" />
                  );
                })}
                <h3 className="font-mono font-bold text-sm truncate">
                  {node.lot_no}
                </h3>
              </div>
              {node.details?.description && (
                <p className="text-xs text-muted-foreground line-clamp-1">
                  {node.details.description}
                </p>
              )}
            </div>
            {(hasSources || hasDestinations) && (
              <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="flex-shrink-0 p-1 hover:bg-background/50 rounded transition-colors"
              >
                {isExpanded ? (
                  <ChevronDown className="w-5 h-5" />
                ) : (
                  <ChevronRight className="w-5 h-5" />
                )}
              </button>
            )}
          </div>

          {/* Process Types */}
          {node.process_types && node.process_types.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-3">
              {node.process_types.map((type, idx) => (
                <Badge key={idx} variant="outline" className="text-xs">
                  {type}
                </Badge>
              ))}
            </div>
          )}

          {/* Details */}
          <div className="space-y-1 text-xs">
            {node.details?.item_no && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Item:</span>
                <span className="font-medium font-mono">{node.details.item_no}</span>
              </div>
            )}
            {node.details?.certified && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Certified:</span>
                <span className="font-medium">{node.details.certified}</span>
              </div>
            )}
            {node.details?.output_quantity !== undefined && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Quantity:</span>
                <span className="font-medium">
                  {node.details.output_quantity} {node.details.unit_of_measure || 'KG'}
                </span>
              </div>
            )}
            {node.details?.production_order && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Prod Order:</span>
                <span className="font-medium font-mono text-xs">{node.details.production_order}</span>
              </div>
            )}
            {node.details?.output_date && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Date:</span>
                <span className="font-medium">
                  {new Date(node.details.output_date).toLocaleDateString()}
                </span>
              </div>
            )}
            {node.relationship && (
              <div className="mt-2 pt-2 border-t border-border/50">
                <Badge variant="secondary" className="text-xs">
                  {node.relationship}
                </Badge>
              </div>
            )}
            {node.is_origin && (
              <div className="mt-2 pt-2 border-t border-border/50">
                <Badge className="text-xs bg-accent text-accent-foreground">
                  Origin Point
                </Badge>
              </div>
            )}
            {node.warning && (
              <div className="mt-2 pt-2 border-t border-destructive/50">
                <p className="text-xs text-destructive">{node.warning}</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Sources/Children */}
      {hasSources && isExpanded && (
        <div className="relative ml-8 mt-4 pl-8 border-l-2 border-border/50">
          {/* Vertical connecting line styling */}
          <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-gradient-to-b from-border/50 to-transparent" />
          
          <div className="mb-2 text-xs font-semibold text-muted-foreground uppercase">
            Sources (Consumed from)
          </div>
          
          <div className="space-y-6">
            {node.sources.map((source, idx) => (
              <div key={idx} className="relative">
                {/* Horizontal connecting line */}
                <div className="absolute left-[-2rem] top-6 w-8 h-0.5 bg-border/50" />
                <TreeNode node={source} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Destinations */}
      {hasDestinations && isExpanded && (
        <div className="relative ml-8 mt-4 pl-8 border-l-2 border-secondary/50">
          {/* Vertical connecting line styling */}
          <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-gradient-to-b from-secondary/50 to-transparent" />
          
          <div className="mb-2 text-xs font-semibold text-secondary-foreground uppercase">
            Destinations (Transferred to)
          </div>
          
          <div className="space-y-6">
            {node.destinations.map((dest, idx) => (
              <div key={idx} className="relative">
                {/* Horizontal connecting line */}
                <div className="absolute left-[-2rem] top-6 w-8 h-0.5 bg-secondary/50" />
                <TreeNode node={dest} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
