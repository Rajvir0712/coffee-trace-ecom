import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

interface JoinStepsViewerProps {
  steps: Array<{
    step: string;
    matches: any[];
  }>;
}

export const JoinStepsViewer = ({ steps }: JoinStepsViewerProps) => {
  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Purchase Lot Join Steps</CardTitle>
        <CardDescription>
          Tracing connections from purchase lot through all data sheets
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Accordion type="single" collapsible className="w-full">
          {steps.map((stepData, index) => (
            <AccordionItem key={index} value={`step-${index}`}>
              <AccordionTrigger className="text-sm">
                <div className="flex items-center gap-2">
                  <Badge variant={stepData.matches.length > 0 ? "default" : "secondary"}>
                    {stepData.matches.length} matches
                  </Badge>
                  <span>{stepData.step}</span>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                {stepData.matches.length === 0 ? (
                  <p className="text-sm text-muted-foreground italic">No matches found</p>
                ) : (
                  <div className="space-y-2">
                    {stepData.matches.map((match, matchIndex) => (
                      <div
                        key={matchIndex}
                        className="p-3 rounded-lg bg-muted/50 text-sm font-mono"
                      >
                        {Object.entries(match).map(([key, value]) => (
                          <div key={key} className="flex gap-2">
                            <span className="text-muted-foreground">{key}:</span>
                            <span className="font-semibold">{String(value)}</span>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                )}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </CardContent>
    </Card>
  );
};
