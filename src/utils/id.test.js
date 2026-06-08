import { describe, expect, it } from 'vitest';
import { generateRoomCode, generateUserId } from './id.js';

describe('utils/id', () => {
  describe('generateRoomCode()', () => {
    it('produces a 9-char code grouped by 3 with dashes', () => {
      const code = generateRoomCode();
      expect(code).toMatch(/^[A-Z0-9]{3}-[A-Z0-9]{3}-[A-Z0-9]{3}$/);
    });

    it('does not include ambiguous chars (0, O, 1, I)', () => {
      const code = generateRoomCode().replace(/-/g, '');
      expect(code).not.toMatch(/[O01I]/);
    });

    it('returns different values across calls (probabilistically)', () => {
      const seen = new Set();
      for (let i = 0; i < 30; i++) seen.add(generateRoomCode());
      expect(seen.size).toBeGreaterThan(20);
    });
  });

  describe('generateUserId()', () => {
    it('prefixes with "user-"', () => {
      const id = generateUserId();
      expect(id.startsWith('user-')).toBe(true);
    });

    it('produces unique-ish ids', () => {
      const ids = new Set();
      for (let i = 0; i < 20; i++) ids.add(generateUserId());
      expect(ids.size).toBeGreaterThan(15);
    });
  });
});
