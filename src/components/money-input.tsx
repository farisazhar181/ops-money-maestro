import { Input } from "@/components/ui/input";

/** Formats a raw numeric string as Indonesian digits, e.g. "6500000" -> "6.500.000". */
export function formatMoneyInput(raw: string | number | null | undefined): string {
  if (raw === null || raw === undefined || raw === "") return "";
  const n = Number(raw);
  if (!Number.isFinite(n)) return "";
  return new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(Math.round(n));
}

/** Rupiah input: displays thousand separators, but reports the plain number string (e.g. "6500000"). */
export function MoneyInput({
  value,
  onChange,
  placeholder,
  id,
}: {
  value: string;
  onChange: (raw: string) => void;
  placeholder?: string;
  id?: string;
}) {
  return (
    <Input
      id={id}
      inputMode="numeric"
      placeholder={placeholder ?? "0"}
      value={formatMoneyInput(value)}
      onChange={(e) => {
        const digits = e.target.value.replace(/\D/g, "").replace(/^0+(?=\d)/, "");
        onChange(digits);
      }}
    />
  );
}
