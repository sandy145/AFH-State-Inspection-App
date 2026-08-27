/**
 * Human-facing identifiers.
 *
 * Case numbers, finding labels and receipt numbers appear on printed records and
 * in conversations between a provider and the State, so they are short, readable
 * and stable. They are formatting helpers only — uniqueness is enforced by the
 * database and by the callers that allocate the next sequence number.
 */
import { randomBytes } from "node:crypto";

export function caseNumber(year: number, sequence: number): string {
  return `AFH-${year}-${String(sequence).padStart(6, "0")}`;
}

export function findingReference(sequence: number): string {
  return `F-${String(sequence).padStart(3, "0")}`;
}

export function evidenceRequestReference(sequence: number): string {
  return `ER-${String(sequence).padStart(3, "0")}`;
}

export function citationNumber(year: number, sequence: number): string {
  return `CIT-${year}-${String(sequence).padStart(6, "0")}`;
}

export function idrReference(year: number, sequence: number): string {
  return `IDR-${year}-${String(sequence).padStart(6, "0")}`;
}

/**
 * Submission and receipt identifiers are random rather than sequential: they end
 * up in emails and on printed receipts, and a sequential id would leak how much
 * activity the system is handling.
 */
export function submissionReference(): string {
  return `EV-${randomBytes(4).toString("hex").toUpperCase().slice(0, 7)}`;
}

export function receiptNumber(): string {
  return `RCPT-${randomBytes(5).toString("hex").toUpperCase().slice(0, 9)}`;
}
