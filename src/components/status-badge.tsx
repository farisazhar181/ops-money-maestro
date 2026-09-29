import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const map: Record<string, string> = {
  Draft: "bg-muted text-muted-foreground",
  "In Progress": "bg-info/15 text-info border-info/30",
  Completed: "bg-success/15 text-success border-success/30",
  Cancelled: "bg-destructive/15 text-destructive border-destructive/30",
  Unpaid: "bg-destructive/15 text-destructive border-destructive/30",
  "Partially Paid": "bg-warning/15 text-warning border-warning/30",
  Paid: "bg-success/15 text-success border-success/30",
  Issued: "bg-info/15 text-info border-info/30",
  Overdue: "bg-destructive/15 text-destructive border-destructive/30",
  Voided: "bg-muted text-muted-foreground line-through",
  Pipeline: "bg-muted text-muted-foreground",
  Active: "bg-info/15 text-info border-info/30",
  Closed: "bg-success/15 text-success border-success/30",
};

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  return (
    <Badge
      variant="outline"
      className={cn("border font-medium", map[status] ?? "bg-muted", className)}
    >
      {status}
    </Badge>
  );
}
