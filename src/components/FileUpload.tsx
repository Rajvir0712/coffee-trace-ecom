import { Upload, FileSpreadsheet } from "lucide-react";
import { useCallback } from "react";
import { cn } from "@/lib/utils";

interface FileUploadProps {
  onFileSelect: (file: File) => void;
  selectedFile: File | null;
  isLoading?: boolean;
}

export const FileUpload = ({ onFileSelect, selectedFile, isLoading }: FileUploadProps) => {
  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (file && (file.name.endsWith('.xlsx') || file.name.endsWith('.xls'))) {
        onFileSelect(file);
      }
    },
    [onFileSelect]
  );

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onFileSelect(file);
    }
  };

  return (
    <div
      onDrop={handleDrop}
      onDragOver={(e) => e.preventDefault()}
      className={cn(
        "relative border-2 border-dashed rounded-lg p-8 transition-all duration-300",
        "hover:border-primary hover:bg-accent/5",
        selectedFile ? "border-accent bg-accent/10" : "border-border",
        isLoading && "opacity-50 pointer-events-none"
      )}
    >
      <input
        type="file"
        accept=".xlsx,.xls"
        onChange={handleFileInput}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        disabled={isLoading}
      />
      <div className="flex flex-col items-center gap-4 text-center">
        {selectedFile ? (
          <>
            <FileSpreadsheet className="w-12 h-12 text-accent" />
            <div>
              <p className="font-medium text-foreground">{selectedFile.name}</p>
              <p className="text-sm text-muted-foreground mt-1">
                {(selectedFile.size / 1024).toFixed(2)} KB
              </p>
            </div>
          </>
        ) : (
          <>
            <Upload className="w-12 h-12 text-muted-foreground" />
            <div>
              <p className="font-medium text-foreground">Drop Excel file here</p>
              <p className="text-sm text-muted-foreground mt-1">
                or click to browse (.xlsx, .xls)
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
