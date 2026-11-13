import { describe, expect, it } from 'vitest';
import UserMongoose, { EMAIL_REGEX } from '../../main/repositories/mongoose/models/UserMongoose';

const emailError = (email: string) =>
  new UserMongoose({ username: 'ada', email }).validateSync()?.errors.email;

describe('User email validation', () => {
  it.each([
    'ada@us.es',
    'some.one-x@alum.us.es',
    'Ada.Lovelace+ican@score.tech',
    'ada@research.example.info',
  ])('accepts %s', email => {
    expect(email).toMatch(EMAIL_REGEX);
    expect(emailError(email)).toBeUndefined();
  });

  it.each(['ada', 'ada@us', 'ada@@us.es', 'ada @us.es', 'ada@us..es', '.ada@us.es'])(
    'rejects %s',
    email => {
      expect(emailError(email)).toBeDefined();
    }
  );

  // The previous pattern took seconds to minutes on addresses like these, and the
  // API stopped answering every request while it ran.
  it('answers at once on long addresses', () => {
    const long = 'a'.repeat(60) + '@' + 'b'.repeat(60) + '.' + 'c'.repeat(60) + '!';
    const start = performance.now();
    emailError(long);
    emailError('elenamolino99@scoretechxxxxxx.info');
    expect(performance.now() - start).toBeLessThan(50);
  });
});
