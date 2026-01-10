import type { db } from ".";

export type Tx = typeof db.transaction extends (
  // oxlint-disable-next-line no-explicit-any
  callback: (tx: infer T) => any,
  // oxlint-disable-next-line no-explicit-any
) => any
  ? T
  : never;

export type Db = typeof db;
