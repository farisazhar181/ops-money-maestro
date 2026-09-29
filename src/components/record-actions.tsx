import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { fmtDate } from "@/lib/format";

/** Names of users the current role is allowed to read (for "voided by"). */
export function useProfileNames() {
  const { data } = useQuery({
    queryKey: ["profile-names"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("id, full_name, email");
      if (error) throw error;
      return new Map((data ?? []).map((p) => [p.id, p.full_name || p.email || "user"]));
    },
    staleTime: 5 * 60 * 1000,
  });
  return (id: string | null | undefined) => (id ? (data?.get(id) ?? "another user") : "unknown");
}

export function VoidedNote({
  at,
  by,
  reason,
}: {
  at: string | null | undefined;
  by: string | null | undefined;
  reason: string | null | undefined;
}) {
  const name = useProfileNames();
  return (
    <span className="block text-xs text-muted-foreground">
      Voided by {name(by)} on {fmtDate(at)}
      {reason ? ` — ${reason}` : ""}
    </span>
  );
}

/** Splits a "Void these … first: a; b" database message into a readable list. */
export function BlockedMessage({ message }: { message: string }) {
  const idx = message.indexOf(":");
  const blocked = /first/i.test(message) && idx > 0;
  if (!blocked) return <p className="text-sm text-destructive">{message}</p>;
  const items = message
    .slice(idx + 1)
    .split(/;\s*/)
    .map((s) => s.trim())
    .filter(Boolean);
  return (
    <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">
      <p className="font-medium text-destructive">{message.slice(0, idx)}:</p>
      <ul className="mt-1 list-disc pl-5 text-muted-foreground">
        {items.map((i) => (
          <li key={i}>{i}</li>
        ))}
      </ul>
    </div>
  );
}

export function VoidDialog({
  open,
  onOpenChange,
  title,
  description,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: ReactNode;
  onConfirm: (reason: string) => Promise<void>;
}) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const close = (o: boolean) => {
    if (!o) {
      setReason("");
      setError(null);
    }
    onOpenChange(o);
  };
  const submit = async () => {
    setPending(true);
    setError(null);
    try {
      await onConfirm(reason.trim());
      close(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPending(false);
    }
  };
  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {description ?? "The entry stays visible, marked Voided, and is excluded from all totals."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label>Reason (required)</Label>
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. duplicate entry" />
        </div>
        {error && <BlockedMessage message={error} />}
        <DialogFooter>
          <Button variant="destructive" onClick={submit} disabled={!reason.trim() || pending}>
            Void
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function FormField({
  label,
  value,
  onChange,
  type = "text",
  min,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  min?: string;
  placeholder?: string;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Input type={type} min={min} placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

/** Before/after table for an activity entry; skips bookkeeping fields. */
const HIDDEN_KEYS = new Set(["id", "updated_at", "created_at", "created_by"]);
export function ChangeDiff({ before, after }: { before: unknown; after: unknown }) {
  const b = (before && typeof before === "object" ? before : {}) as Record<string, unknown>;
  const a = (after && typeof after === "object" ? after : {}) as Record<string, unknown>;
  const keys = Array.from(new Set([...Object.keys(b), ...Object.keys(a)])).filter(
    (k) => !HIDDEN_KEYS.has(k) && JSON.stringify(b[k] ?? null) !== JSON.stringify(a[k] ?? null),
  );
  if (!before || keys.length === 0) return null;
  const show = (v: unknown) => (v === null || v === undefined || v === "" ? "—" : String(v));
  return (
    <table className="mt-2 w-full text-xs">
      <thead>
        <tr className="text-muted-foreground">
          <th className="pr-3 text-left font-normal">Field</th>
          <th className="pr-3 text-left font-normal">Before</th>
          <th className="text-left font-normal">After</th>
        </tr>
      </thead>
      <tbody>
        {keys.map((k) => (
          <tr key={k}>
            <td className="pr-3 text-muted-foreground">{k.replaceAll("_", " ")}</td>
            <td className="pr-3 line-through decoration-muted-foreground/50">{show(b[k])}</td>
            <td className="font-medium">{show(a[k])}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
