import { readers } from '@lapxo/topos/capsule';
export const { observe, run } = readers(import.meta.url);
