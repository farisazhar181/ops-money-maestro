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
