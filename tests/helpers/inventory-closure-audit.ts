// Shared audit configuration and discriminator oracle for the inventory-closure
// core-behaviour suite and disk-walk gate.

import { SDK_SURFACE_INVENTORY } from "../../src/extension/sdk-inventory";
import {
  runInventoryClosureAudit,
  type AuditResult,
} from "../../src/extension/inventory-closure-audit";

export const TYPEBOX_NAMED_IMPORT_ALLOW_LIST = ["Type"] as const;
export const TYPEBOX_MEMBER_ACCESS_ALLOW_LIST = ["Unsafe"] as const;

/** Run the audit with the shared inventory and typebox allow-lists. */
export function auditWith(files: ReadonlyMap<string, string>): AuditResult {
  return runInventoryClosureAudit({
    files,
    inventory: SDK_SURFACE_INVENTORY,
    typeboxNamedImportAllowList: TYPEBOX_NAMED_IMPORT_ALLOW_LIST,
    typeboxMemberAccessAllowList: TYPEBOX_MEMBER_ACCESS_ALLOW_LIST,
  });
}

/** The `audit/<class>/<family>/<symptom>` structural shape (audit-failures.md). */
export const DISCRIMINATOR_SHAPE =
  /^audit\/(violation|infra|canary)\/[a-z0-9]+(-[a-z0-9]+)*\/[a-z0-9]+(-[a-z0-9]+)*$/;
