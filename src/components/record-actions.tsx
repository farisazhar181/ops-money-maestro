import { useState, type ReactNode } from "react";
import { MoneyInput } from "@/components/money-input";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { fmtDate, idr } from "@/lib/format";

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
            {description ??
              "The entry stays visible, marked Voided, and is excluded from all totals."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label>Reason (required)</Label>
          <Input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. duplicate entry"
          />
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
  if (type === "money")
    return (
      <div className="space-y-2">
        <Label>{label}</Label>
        <MoneyInput value={value} onChange={onChange} placeholder={placeholder} />
      </div>
    );
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Input
        type={type}
        min={min}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

const HIDDEN_KEYS = new Set(["id", "updated_at", "created_at", "created_by"]);
const MONEY_FIELD = /amount|selling|buying|margin_value|balance|paid|remaining|^margin$/;
const showValue = (v: unknown, field = "") => {
  if (v === null || v === undefined || v === "") return "—";
  if (field === "role" && v === "owner") return "Management";
  if (MONEY_FIELD.test(field) && !/pct/.test(field) && Number.isFinite(Number(v)))
    return idr(Number(v));
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}T/.test(v))
    return new Date(v).toLocaleString("en-GB", { timeZone: "Asia/Jakarta" });
  return String(v);
};

export type FieldChange = { field: string; before: unknown; after: unknown };

/** Fields that differ between two snapshots; skips bookkeeping fields. */
export function diffFields(before: unknown, after: unknown): FieldChange[] {
  if (!before || typeof before !== "object") return [];
  const b = before as Record<string, unknown>;
  const a = (after && typeof after === "object" ? after : {}) as Record<string, unknown>;
  return Array.from(new Set([...Object.keys(b), ...Object.keys(a)]))
    .filter(
      (k) => !HIDDEN_KEYS.has(k) && JSON.stringify(b[k] ?? null) !== JSON.stringify(a[k] ?? null),
    )
    .map((k) => ({ field: k, before: b[k], after: a[k] }));
}

/** "Field: old → new" lines. Strikethrough only for voids. */
export function ChangeList({
  changes,
  voided = false,
}: {
  changes: FieldChange[];
  voided?: boolean;
}) {
  if (changes.length === 0) return null;
  return (
    <ul className="mt-2 space-y-0.5 text-xs">
      {changes.map((c) => (
        <li key={c.field}>
          <span className="capitalize text-muted-foreground">{c.field.replaceAll("_", " ")}:</span>{" "}
          <span className={voided ? "line-through decoration-muted-foreground/50" : ""}>
            {showValue(c.before, c.field)}
          </span>{" "}
          → <span className="font-medium">{showValue(c.after, c.field)}</span>
        </li>
      ))}
    </ul>
  );
}

export function ChangeDiff({ before, after }: { before: unknown; after: unknown }) {
  return <ChangeList changes={diffFields(before, after)} />;
}
