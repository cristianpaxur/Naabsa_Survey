/**
 * @naabsa/db — migrations SQL e tipos gerados do Supabase.
 *
 * - migrations/ → DDL versionada (schema, RLS, constraints, seed) — aplicada
 *   pelo runner `src/migrate.ts` contra o `DATABASE_URL` (PRD §13).
 * - types/database.ts → tipos gerados (`supabase gen types`) reexportados abaixo.
 */
export type * from '../types/database';
