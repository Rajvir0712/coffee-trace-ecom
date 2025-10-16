import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface LotInputProps {
  lotNumber: string;
  onLotNumberChange: (value: string) => void;
  availableLots: string[];
  disabled?: boolean;
}

export const LotInput = ({
  lotNumber,
  onLotNumberChange,
  availableLots,
  disabled
}: LotInputProps) => {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="lot-input">Lot Number</Label>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            id="lot-input"
            value={lotNumber}
            onChange={(e) => onLotNumberChange(e.target.value)}
            placeholder="Enter lot number (e.g., 1601-4197257020-3)"
            className="pl-9"
            disabled={disabled}
          />
        </div>
      </div>

      {availableLots.length > 0 && (
        <div className="space-y-2">
          <Label htmlFor="lot-select">Or select from available lots</Label>
          <Select
            value={lotNumber}
            onValueChange={onLotNumberChange}
            disabled={disabled}
          >
            <SelectTrigger id="lot-select">
              <SelectValue placeholder="Select a lot number" />
            </SelectTrigger>
            <SelectContent className="max-h-[300px]">
              {availableLots.map((lot) => (
                <SelectItem key={lot} value={lot}>
                  {lot}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  );
};
