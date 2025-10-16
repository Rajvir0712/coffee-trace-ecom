import { memo, useState } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { ChevronDown, ChevronRight, Package, ShoppingCart, ArrowLeftRight, Factory } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

interface CustomNodeData {
  lot_no: string;
  process_types: string[];
  details: {
    item_no?: string;
    description?: string;
    certified?: string;
    unit_of_measure?: string;
    output_quantity?: number;
    production_order?: string;
    output_date?: string;
    transfer?: {
      transfer_quantity: number;
      transfer_date: string;
      transferred_to?: string;
    };
    purchase?: {
      quantity: number;
      date: string;
    };
  };
  relationship?: string;
  is_origin?: boolean;
  warning?: string;
  sources_count: number;
}

export const CustomNode = memo(({ data }: NodeProps) => {
  const [isExpanded, setIsExpanded] = useState(false);
  
  const typedData = data as unknown as CustomNodeData;

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

  const getProcessColor = (processTypes: string[]) => {
    if (!processTypes || processTypes.length === 0) return 'bg-card border-border';
    
    const type = processTypes[0].toLowerCase();
    switch (type) {
      case 'purchase':
        return 'bg-accent/10 border-accent/50';
      case 'output':
        return 'bg-primary/10 border-primary/50';
      case 'transfer':
        return 'bg-secondary/20 border-secondary-foreground/30';
      case 'consumption':
        return 'bg-muted/50 border-muted-foreground/30';
      default:
        return 'bg-card border-border';
    }
  };

  const processTypes = typedData.process_types;
  const details = typedData.details;

  return (
    <div
      className={cn(
        'min-w-[280px] max-w-[320px] rounded-lg border-2 shadow-lg transition-all duration-300',
        'hover:shadow-xl backdrop-blur-sm',
        getProcessColor(processTypes),
        typedData.is_origin && 'ring-2 ring-accent'
      )}
    >
      <Handle
        type="target"
        position={Position.Right}
        className="!w-3 !h-3 !bg-accent !border-2 !border-background"
      />

      {/* Header */}
      <div 
        className="p-3 cursor-pointer hover:bg-background/5 transition-colors rounded-t-lg"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-start gap-2">
          <div className="flex gap-1 flex-shrink-0 mt-0.5">
            {processTypes.slice(0, 2).map((type, idx) => {
              const Icon = getProcessIcon(type);
              return <Icon key={idx} className="w-4 h-4 text-accent" />;
            })}
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-mono font-bold text-sm text-foreground truncate">
              {typedData.lot_no}
            </div>
            {details.description && (
              <div className="text-xs text-muted-foreground mt-1 line-clamp-1">
                {details.description}
              </div>
            )}
          </div>
          {typedData.sources_count > 0 && (
            <button className="flex-shrink-0 p-1 hover:bg-background/20 rounded transition-colors">
              {isExpanded ? (
                <ChevronDown className="w-4 h-4" />
              ) : (
                <ChevronRight className="w-4 h-4" />
              )}
            </button>
          )}
        </div>

        {/* Process Type Badges */}
        {processTypes.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {processTypes.map((type, idx) => (
              <Badge key={idx} variant="outline" className="text-[10px] px-1.5 py-0">
                {type}
              </Badge>
            ))}
          </div>
        )}
      </div>

      {/* Expanded Details */}
      {isExpanded && (
        <div className="px-3 pb-3 space-y-1 text-xs animate-accordion-down bg-background/5 border-t border-border/50">
          <div className="pt-2 space-y-1 font-mono">
            {details.item_no && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">item_no:</span>
                <span className="text-primary font-semibold">"{details.item_no}"</span>
              </div>
            )}
            {details.certified && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">certified:</span>
                <span className="text-accent font-semibold">"{details.certified}"</span>
              </div>
            )}
            {details.unit_of_measure && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">unit:</span>
                <span className="text-foreground">"{details.unit_of_measure}"</span>
              </div>
            )}
            {details.output_quantity !== undefined && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">quantity:</span>
                <span className="text-primary font-semibold">{details.output_quantity}</span>
              </div>
            )}
            {details.production_order && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">prod_order:</span>
                <span className="text-foreground text-[10px]">"{details.production_order}"</span>
              </div>
            )}
            {details.output_date && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">date:</span>
                <span className="text-foreground">
                  "{new Date(details.output_date).toLocaleDateString()}"
                </span>
              </div>
            )}
            {details.transfer && (
              <>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">transfer_qty:</span>
                  <span className="text-primary font-semibold">{details.transfer.transfer_quantity}</span>
                </div>
                {details.transfer.transferred_to && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">transferred_to:</span>
                    <span className="text-accent font-semibold text-[10px]">"{details.transfer.transferred_to}"</span>
                  </div>
                )}
              </>
            )}
            {details.purchase && (
              <>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">purchase_qty:</span>
                  <span className="text-primary font-semibold">{details.purchase.quantity}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">purchase_date:</span>
                  <span className="text-foreground">"{new Date(details.purchase.date).toLocaleDateString()}"</span>
                </div>
              </>
            )}
          </div>

          {/* Status Badges */}
          <div className="pt-2 flex flex-wrap gap-1">
            {typedData.relationship && (
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                {typedData.relationship}
              </Badge>
            )}
            {typedData.is_origin && (
              <Badge className="text-[10px] px-1.5 py-0 bg-accent">
                Origin
              </Badge>
            )}
            {typedData.sources_count > 0 && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                {typedData.sources_count} sources
              </Badge>
            )}
          </div>

          {typedData.warning && (
            <div className="pt-2 text-[10px] text-destructive border-t border-destructive/20 mt-2">
              {typedData.warning}
            </div>
          )}
        </div>
      )}

      <Handle
        type="source"
        position={Position.Left}
        className="!w-3 !h-3 !bg-accent !border-2 !border-background"
      />
    </div>
  );
});

CustomNode.displayName = 'CustomNode';
