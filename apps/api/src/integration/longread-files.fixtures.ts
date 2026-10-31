export function compound(name: string) {
  const bytes = Buffer.alloc(1536); Buffer.from('d0cf11e0a1b11ae1', 'hex').copy(bytes);
  bytes.writeUInt16LE(0xfffe, 28); bytes.writeUInt16LE(9, 30); bytes.writeUInt32LE(0, 48); bytes.writeUInt32LE(0xfffffffe, 68);
  for (let i = 0; i < 109; i++) bytes.writeUInt32LE(i === 0 ? 1 : 0xffffffff, 76 + i * 4);
  bytes.write(`${name}\0`, 512, 'utf16le'); bytes.writeUInt16LE((name.length + 1) * 2, 512 + 64); bytes[512 + 66] = 2;
  bytes.writeUInt32LE(0xfffffffe, 1024); return bytes;
}
export function officeZip(root: string, options: { expanded?: number; compressed?: number; flags?: number } = {}) {
  const entries = ['[Content_Types].xml', root], locals: Buffer[] = [], central: Buffer[] = []; let offset = 0;
  for (const name of entries) {
    const local = Buffer.alloc(30 + name.length + 1); local.writeUInt32LE(0x04034b50); local.writeUInt32LE(1, 18); local.writeUInt32LE(1, 22); local.writeUInt16LE(name.length, 26); local.write(name, 30);
    const c = Buffer.alloc(46 + name.length); c.writeUInt32LE(0x02014b50); c.writeUInt16LE(options.flags ?? 0, 8); c.writeUInt32LE(options.compressed ?? 1, 20); c.writeUInt32LE(options.expanded ?? 1, 24); c.writeUInt16LE(name.length, 28); c.writeUInt32LE(offset, 42); c.write(name, 46); central.push(c); locals.push(local); offset += local.length;
  }
  const directory = Buffer.concat(central), end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50); end.writeUInt16LE(2, 8); end.writeUInt16LE(2, 10); end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}
