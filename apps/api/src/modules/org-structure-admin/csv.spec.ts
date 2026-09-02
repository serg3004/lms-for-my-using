import { BadRequestException } from '@nestjs/common';
import { parseCsv, rowsAsObjects } from './csv.js';

describe('organization structure CSV parser', () => {
  it('parses quoted commas and escaped quotes', () => {
    expect(rowsAsObjects(parseCsv(Buffer.from('code,name\nENG,"Engineering, ""Core"""\n')), ['code', 'name']))
      .toEqual([{ code: 'ENG', name: 'Engineering, "Core"' }]);
  });
  it('rejects an unexpected header', () => {
    expect(() => rowsAsObjects(parseCsv(Buffer.from('name,code\nEngineering,ENG\n')), ['code', 'name']))
      .toThrow(BadRequestException);
  });
  it('rejects invalid UTF-8', () => {
    expect(() => parseCsv(Buffer.from([0xc3, 0x28]))).toThrow();
  });
});
