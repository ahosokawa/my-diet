// Single source of truth for the Dexie schema version. Dependency-free on
// purpose: e2e helpers import it in Node, where instantiating Dexie
// (lib/db/schema.ts) would fail.
export const DB_SCHEMA_VERSION = 7;

// Dexie scales the user-facing `this.version(N)` by 10 when opening the
// underlying IndexedDB (`Math.round(verno * 10)`). Raw `indexedDB.open` calls
// (e2e seed/read helpers) must use this value.
export const IDB_VERSION = DB_SCHEMA_VERSION * 10;
