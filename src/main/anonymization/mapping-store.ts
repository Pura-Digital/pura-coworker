import Database from 'better-sqlite3';
import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto';

interface MappingRow {
  placeholder: string;
  ciphertext: Buffer;
  iv: Buffer;
  tag: Buffer;
}

/** Only encrypted values and keyed digests enter SQLite, including its journal. */
export class AnonymizationMappingStore {
  private db: Database.Database;
  constructor(
    filename: string,
    private key: Buffer
  ) {
    if (key.length !== 32) throw new Error('Invalid anonymization key');
    this.db = new Database(filename);
    this.db.pragma('foreign_keys = ON');
    this.db.pragma('secure_delete = ON');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS scopes (chat_id TEXT PRIMARY KEY, namespace TEXT NOT NULL, next_id INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS mappings (
        chat_id TEXT NOT NULL REFERENCES scopes(chat_id) ON DELETE CASCADE,
        digest TEXT NOT NULL, placeholder TEXT NOT NULL,
        ciphertext BLOB NOT NULL, iv BLOB NOT NULL, tag BLOB NOT NULL,
        PRIMARY KEY(chat_id, digest), UNIQUE(chat_id, placeholder)
      );
    `);
    const columns = this.db.pragma('table_info(scopes)') as { name: string }[];
    if (!columns.some((column) => column.name === 'next_id')) {
      this.db.exec(
        'ALTER TABLE scopes ADD COLUMN next_id INTEGER NOT NULL DEFAULT 0; UPDATE scopes SET next_id=(SELECT COUNT(*) FROM mappings WHERE mappings.chat_id=scopes.chat_id)'
      );
    }
  }

  private decrypt(chatId: string, row: MappingRow): string {
    const decipher = createDecipheriv('aes-256-gcm', this.key, row.iv);
    decipher.setAAD(Buffer.from(`${chatId}:${row.placeholder}`));
    decipher.setAuthTag(row.tag);
    return Buffer.concat([decipher.update(row.ciphertext), decipher.final()]).toString('utf8');
  }

  remember(chatId: string, label: string, value: string): string {
    return this.db.transaction(() => {
      const digest = createHmac('sha256', this.key)
        .update(JSON.stringify([chatId, label, value]))
        .digest('hex');
      const existing = this.db
        .prepare('SELECT placeholder FROM mappings WHERE chat_id=? AND digest=?')
        .get(chatId, digest) as { placeholder: string } | undefined;
      if (existing) return existing.placeholder;
      this.db
        .prepare('INSERT OR IGNORE INTO scopes (chat_id,namespace) VALUES (?,?)')
        .run(chatId, randomBytes(12).toString('hex'));
      const scope = this.db
        .prepare('UPDATE scopes SET next_id=next_id+1 WHERE chat_id=? RETURNING namespace,next_id')
        .get(chatId) as { namespace: string; next_id: number };
      const placeholder = `[AIDEN_${scope.namespace}_${label.replace(/[^A-Z0-9]/g, '')}_${scope.next_id}]`;
      const iv = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', this.key, iv);
      cipher.setAAD(Buffer.from(`${chatId}:${placeholder}`));
      const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
      this.db
        .prepare('INSERT INTO mappings VALUES (?,?,?,?,?,?)')
        .run(chatId, digest, placeholder, ciphertext, iv, cipher.getAuthTag());
      return placeholder;
    })();
  }

  rememberMany(chatId: string, values: { label: string; value: string }[]): string[] {
    return this.db.transaction(() =>
      values.map((item) => this.remember(chatId, item.label, item.value))
    )();
  }

  entries(chatId: string): Map<string, string> {
    const rows = this.db
      .prepare('SELECT placeholder,ciphertext,iv,tag FROM mappings WHERE chat_id=?')
      .all(chatId) as MappingRow[];
    return new Map(rows.map((row) => [row.placeholder, this.decrypt(chatId, row)]));
  }

  validateKey(): void {
    const row = this.db
      .prepare('SELECT chat_id,placeholder,ciphertext,iv,tag FROM mappings LIMIT 1')
      .get() as (MappingRow & { chat_id: string }) | undefined;
    if (row) this.decrypt(row.chat_id, row);
  }

  deleteChat(chatId: string): void {
    this.db.prepare('DELETE FROM scopes WHERE chat_id=?').run(chatId);
  }
  close(): void {
    this.db.close();
  }
}
