import { GraphQLDataPreview } from "@/components/GraphQLDataPreview";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";

const Export = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background flex flex-col p-6">
      <div className="mb-4">
        <Button variant="ghost" onClick={() => navigate("/")} className="gap-2">
          <ArrowLeft className="w-4 h-4" />
          Back to Tracker
        </Button>
      </div>
      <GraphQLDataPreview />
    </div>
  );
};

export default Export;
