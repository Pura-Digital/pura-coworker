import { describe, expect, it } from 'vitest';
import { summarizeProtection } from '../src/main/anonymization/audit';

describe('privacy audit metadata', () => {
  const token = `[AIDEN_${'a'.repeat(24)}_EMAIL_1]`;
  const email = 'test.person@example.com';
  const mapping = new Map([[token, email]]);

  it('distinguishes protected egress from a restored local reply without disclosing either', () => {
    const outgoing = summarizeProtection({ text: `La mia email è ${token}` }, mapping);
    expect(outgoing).toMatchObject({
      references: 1,
      emailReferences: 1,
      knownEmailValuesInClear: 0,
    });
    const restored = summarizeProtection({ text: `Email: ${email}` }, mapping);
    expect(restored).toMatchObject({ references: 0, knownEmailValuesInClear: 1 });
    expect(JSON.stringify([outgoing, restored])).not.toContain(email);
    expect(JSON.stringify([outgoing, restored])).not.toContain(token);
  });

  it('does not claim to inspect an unserializable payload', () => {
    expect(summarizeProtection({ value: 1n }, mapping)).toEqual({ inspectable: false });
  });
});
