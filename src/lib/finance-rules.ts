// Form-side mirrors of database rules. The database enforces these too; these give instant feedback.

export function closingError(status: string, actualSelling: number | null, actualBuying: number | null): string | null {
  if ((actualSelling !== null && actualSelling < 0) || (actualBuying !== null && actualBuying < 0)) {
    return "Financial amounts cannot be negative";
  }
  if (status !== "Closed") return null;
  if (actualSelling === null || actualSelling <= 0 || actualBuying === null || actualBuying <= 0) {
    return "Actual selling and actual buying must both be greater than zero to close a job";
  }
  return null;
}

export function paymentDateError(paymentDate: string, documentDate: string | null | undefined): string | null {
  if (!paymentDate) return "Payment date is required";
  if (documentDate && paymentDate.slice(0, 10) < documentDate.slice(0, 10)) {
    return `Payment date cannot be earlier than ${documentDate.slice(0, 10)}`;
  }
  return null;
}

export type CashFlowType = "AR_RECEIPT" | "AP_PAYMENT" | "OPERATIONAL_EXPENSE";

/** Every operating cash-flow type is classified explicitly; investor money is financing and never appears here. */
export function cashFlowDirection(type: CashFlowType): "in" | "out" {
  switch (type) {
    case "AR_RECEIPT":
      return "in";
    case "AP_PAYMENT":
    case "OPERATIONAL_EXPENSE":
      return "out";
  }
}

export function cashFlowLabel(type: CashFlowType): string {
  return { AR_RECEIPT: "Customer receipt", AP_PAYMENT: "Vendor payment", OPERATIONAL_EXPENSE: "Overhead payment" }[type];
}
