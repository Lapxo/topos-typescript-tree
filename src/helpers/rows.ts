export type Row = { readonly scope: string; readonly measure: string; readonly role: 'reads'; readonly bound: { readonly kind: 'enumerated'; readonly values: readonly string[] } | { readonly kind: 'interval'; readonly lo: number; readonly hi: number } };
export const said = (scope: string, measure: string, values: readonly string[]): Row => ({ scope, measure, role: 'reads', bound: { kind: 'enumerated', values } });
export const counted = (scope: string, n: number, measure = 'count'): Row => ({ scope, measure, role: 'reads', bound: { kind: 'interval', lo: n, hi: n } });
