import { describe, expect, it } from 'vitest';
import { followHeading, isServiceLevelAgreement, retitle, titleFromName } from './document-title';

describe('document title', () => {
  it('follows the heading until they are told apart', () => {
    expect(followHeading('Terms of Service', '# Terms of Service', '# Service Level Agreement')).toBe('Service Level Agreement');
    expect(followHeading('Terms of Service', '', '# SLA')).toBe('SLA');
    expect(followHeading('My own title', '# Terms of Service', '# SLA')).toBe('My own title');
  });

  it('follows a pasted title without a #', () => {
    for (const pasted of ['Service Level Agreement\n\nText.', 'Service Level Agreement\n=======\n\nText.']) {
      expect(followHeading('Terms of Service', '# Terms of Service', pasted)).toBe('Service Level Agreement');
    }
    expect(followHeading('Terms of Service', '# Terms of Service', 'We agree on these terms.')).toBe('Terms of Service');
    expect(retitle('SLA\n====\n\nText.', 'SLA', 'Support')).toBe('Support\n====\n\nText.');
  });

  it('rewrites the heading, also typed from empty', () => {
    expect(retitle('# Terms of Service\n\nText', 'Terms of Service', '')).toBe('# \n\nText');
    expect(retitle('# \n\nText', '', 'S')).toBe('# S\n\nText');
  });

  it('takes the typed name as the title', () => {
    expect(titleFromName('YouRoom — SLA', 'YouRoom')).toBe('SLA');
    expect(isServiceLevelAgreement('YouRoom SLA')).toBe(true);
    expect(isServiceLevelAgreement('Slack terms')).toBe(false);
  });
});
