import { describe, expect, it } from 'vitest';
import { mapStringValues, restoreText } from '../src/main/anonymization/restore';

const token = '[AIDEN_0123456789abcdef01234567_FULLNAME_1]';
describe('local streaming restoration', () => {
  it('withholds every possible split token until it can restore the value', () => {
    const mapping = new Map([[token, 'Mario Rossi']]);
    for (let offset = 1; offset < token.length; offset++) {
      expect(restoreText(`Ciao ${token.slice(0, offset)}`, mapping, false)).toBe('Ciao ');
    }
    expect(restoreText(`Ciao ${token}!`, mapping)).toBe('Ciao Mario Rossi!');
  });
  it('does not recursively replace literal tokens in original values', () => {
    const second = '[AIDEN_0123456789abcdef01234567_LITERAL_2]';
    expect(
      restoreText(
        second,
        new Map([
          [second, token],
          [token, 'Mario'],
        ])
      )
    ).toBe(token);
  });
  it('rejects references belonging to another chat', () => {
    expect(() => restoreText(token, new Map())).toThrow('Unresolved');
  });
  it('withholds malformed bare references and refuses to release them', () => {
    const bare = token.slice(1, -1);
    expect(restoreText(`Ciao ${bare}`, new Map(), false)).toBe('Ciao ');
    expect(() => restoreText(`Ciao ${bare}!`, new Map())).toThrow('Unresolved');
  });
  it('preserves harmless brackets and JSON keys', () => {
    expect(restoreText('[array] [example]', new Map())).toBe('[array] [example]');
    expect(
      mapStringValues({ filename: token, nested: [token, 42] }, (text) =>
        restoreText(text, new Map([[token, 'Mario']]))
      )
    ).toEqual({ filename: 'Mario', nested: ['Mario', 42] });
  });
});
