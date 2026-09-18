// Shared allow-lists and discriminator oracle for the inventory-closure audit
// core-behaviour suite and disk-walk gate.

export const TYPEBOX_NAMED_IMPORT_ALLOW_LIST = ["Type"] as const;
export const TYPEBOX_MEMBER_ACCESS_ALLOW_LIST = ["Unsafe"] as const;

/** The `audit/<class>/<family>/<symptom>` structural shape (audit-failures.md). */
export const DISCRIMINATOR_SHAPE =
  /^audit\/(violation|infra|canary)\/[a-z0-9]+(-[a-z0-9]+)*\/[a-z0-9]+(-[a-z0-9]+)*$/;
