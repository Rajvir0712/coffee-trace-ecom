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
    location_code?: string;
    counterparty?: string;
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
        'min-w-[400px] max-w-[450px] rounded-lg border-2 shadow-lg transition-all duration-300',
        'hover:shadow-xl backdrop-blur-sm',
        getProcessColor(processTypes),
        typedData.is_origin && 'ring-2 ring-accent'
      )}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!w-4 !h-4 !bg-accent !border-2 !border-background"
      />

      {/* Header */}
      <div 
        className="p-4 cursor-pointer hover:bg-background/5 transition-colors rounded-t-lg"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-start gap-3">
          <div className="flex gap-1.5 flex-shrink-0 mt-1">
            {processTypes.slice(0, 2).map((type, idx) => {
              const Icon = getProcessIcon(type);
              return <Icon key={idx} className="w-6 h-6 text-accent" />;
            })}
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-mono font-bold text-base text-foreground truncate">
              {typedData.lot_no}
            </div>
            {details.description && (
              <div className="text-sm text-muted-foreground mt-1 line-clamp-2">
                {details.description}
              </div>
            )}
          </div>
          {typedData.sources_count > 0 && (
            <button className="flex-shrink-0 p-1.5 hover:bg-background/20 rounded transition-colors">
              {isExpanded ? (
                <ChevronDown className="w-5 h-5" />
              ) : (
                <ChevronRight className="w-5 h-5" />
              )}
            </button>
          )}
        </div>

        {/* Process Type Badges */}
        {processTypes.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-3">
            {processTypes.map((type, idx) => (
              <Badge key={idx} variant="outline" className="text-xs px-2 py-0.5">
                {type}
              </Badge>
            ))}
          </div>
        )}
      </div>

      {/* Expanded Details */}
      {isExpanded && (
        <div className="px-4 pb-4 space-y-1.5 text-sm animate-accordion-down bg-background/5 border-t border-border/50">
          <div className="pt-3 space-y-1.5 font-mono">
            {details.item_no && (
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">item_no:</span>
                <span className="text-primary font-semibold text-right">"{details.item_no}"</span>
              </div>
            )}
            {details.certified && (
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">certified:</span>
                <span className="text-accent font-semibold text-right">"{details.certified}"</span>
              </div>
            )}
            {details.location_code && (
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">location_code:</span>
                <span className="text-foreground text-right">"{details.location_code}"</span>
              </div>
            )}
            {details.counterparty && (
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">counterparty:</span>
                <span className="text-foreground text-right">"{details.counterparty}"</span>
              </div>
            )}
            {details.unit_of_measure && (
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">unit:</span>
                <span className="text-foreground text-right">"{details.unit_of_measure}"</span>
              </div>
            )}
            {details.output_quantity !== undefined && (
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">quantity:</span>
                <span className="text-primary font-semibold text-right">{details.output_quantity}</span>
              </div>
            )}
            {details.production_order && (
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">prod_order:</span>
                <span className="text-foreground text-xs text-right break-all">"{details.production_order}"</span>
              </div>
            )}
            {details.output_date && (
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">date:</span>
                <span className="text-foreground text-right">
                  "{new Date(details.output_date).toLocaleDateString()}"
                </span>
              </div>
            )}
            {details.transfer && (
              <>
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">transfer_qty:</span>
                  <span className="text-primary font-semibold text-right">{details.transfer.transfer_quantity}</span>
                </div>
                {details.transfer.transferred_to && (
                  <div className="flex justify-between gap-4">
                    <span className="text-muted-foreground">transferred_to:</span>
                    <span className="text-accent font-semibold text-xs text-right break-all">"{details.transfer.transferred_to}"</span>
                  </div>
                )}
              </>
            )}
            {details.purchase && (
              <>
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">purchase_qty:</span>
                  <span className="text-primary font-semibold text-right">{details.purchase.quantity}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">purchase_date:</span>
                  <span className="text-foreground text-right">"{new Date(details.purchase.date).toLocaleDateString()}"</span>
                </div>
              </>
            )}
          </div>

          {/* Status Badges */}
          <div className="pt-3 flex flex-wrap gap-1.5">
            {typedData.relationship && (
              <Badge variant="secondary" className="text-xs px-2 py-0.5">
                {typedData.relationship}
              </Badge>
            )}
            {typedData.is_origin && (
              <Badge className="text-xs px-2 py-0.5 bg-accent">
                Origin
              </Badge>
            )}
            {typedData.sources_count > 0 && (
              <Badge variant="outline" className="text-xs px-2 py-0.5">
                {typedData.sources_count} sources
              </Badge>
            )}
          </div>

          {typedData.warning && (
            <div className="pt-3 text-xs text-destructive border-t border-destructive/20 mt-3">
              {typedData.warning}
            </div>
          )}
        </div>
      )}

      <Handle
        type="source"
        position={Position.Right}
        className="!w-4 !h-4 !bg-accent !border-2 !border-background"
      />
    </div>
  );
});

CustomNode.displayName = 'CustomNode';
