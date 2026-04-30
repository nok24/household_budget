import { expose } from 'comlink';
import { decodeAndParse, type MfRow } from '../lib/csv';

const api = {
  parseCsv(buf: ArrayBuffer): MfRow[] {
    return decodeAndParse(buf);
  },
};

export type CsvWorkerApi = typeof api;
expose(api);
