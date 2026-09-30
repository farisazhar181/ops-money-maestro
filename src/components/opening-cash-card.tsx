import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MoneyInput } from "@/components/money-input";
import { fmtDate, idr, today } from "@/lib/format";

/** Opening cash balance: Finance/Management view and edit; every change is logged by the database. */
export function OpeningCashCard({ canEdit }: { canEdit: boolean }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [amount, setAmount] = useState("");
  const [asOf, setAsOf] = useState("");
  const [saving, setSaving] = useState(false);
  const { data } = useQuery({
    queryKey: ["opening-cash"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("opening_cash")
        .select("amount, as_of, updated_at")
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const save = async () => {
    setSaving(true);
    const { error } = await supabase.rpc("set_opening_cash", {
      _amount: Number(amount || 0),
      _as_of: asOf,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Opening cash balance saved");
    setEditing(false);
    qc.invalidateQueries();
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-2 pb-2">
        <div>
          <CardDescription>Opening cash balance</CardDescription>
          <CardTitle className="font-display text-xl">{idr(Number(data?.amount ?? 0))}</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            {data?.as_of ? `As of ${fmtDate(data.as_of)}` : "Not set (default 0)"}
          </p>
        </div>
        {canEdit && !editing && (
          <Button
            variant="ghost"
            size="icon"
            title="Edit opening cash balance"
            onClick={() => {
              setAmount(String(Number(data?.amount ?? 0)));
              setAsOf(data?.as_of ?? today());
              setEditing(true);
            }}
          >
            <Pencil className="h-4 w-4" />
          </Button>
        )}
      </CardHeader>
      {editing && (
        <CardContent className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <div className="space-y-1">
            <Label>Amount (IDR)</Label>
            <MoneyInput value={amount} onChange={setAmount} />
          </div>
          <div className="space-y-1">
            <Label>As-of date</Label>
            <Input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} />
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setEditing(false)}>
              Cancel
            </Button>
            <Button onClick={save} disabled={saving || !asOf}>
              Save
            </Button>
          </div>
        </CardContent>
      )}
    </Card>
  );
}
