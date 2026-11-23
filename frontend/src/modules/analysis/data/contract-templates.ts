import { format } from 'date-fns';

import { DocumentType } from '../../core/utils/document-types';

export interface ContractTemplate {
  id: string;
  /** The type of the documents it starts. */
  documentType: DocumentType;
  name: string;
  description: string;
  text: string;
}

const SAAS_TERMS = `# Terms of Service

Last updated: [date]

## 1. Acceptance of the terms

These terms are a contract between you and [Company], the provider of [Service]. By creating an account or using the service you accept them. If you do not agree, do not use the service.

## 2. The service

[Service] is an online tool that lets you [describe what it does]. We may add or remove features, and we will tell you in advance if a change removes something you pay for.

## 3. Accounts

You must be at least 16 years old to create an account. Give us accurate information and keep it up to date.

Keep your password secret. You are responsible for what happens in your account unless someone used it without your permission and you told us as soon as you knew.

## 4. Fees and payment

The plans and their prices are set out in the pricing at [Pricing link], which is part of these terms.

Some plans are paid. Prices are shown before you buy, taxes included. Plans are billed monthly or yearly in advance and renew automatically until you cancel.

You can cancel at any time from your account settings; the plan stays active until the end of the period you paid for. If you are a consumer in the EU you can withdraw within 14 days of buying and get a full refund.

## 5. Your content

You keep ownership of the content you upload. You give us a licence to store, copy and show it only to provide the service to you, and that licence ends when you delete the content or your account.

We may remove content that breaks the law or these terms. We will tell you which content and why, and you can ask us to review the decision.

## 6. Acceptable use

You must not use the service to:

- break the law or infringe the rights of others;
- send spam or malware;
- try to access other users' accounts or data;
- overload or attack the service.

## 7. Privacy

We handle your personal data as explained in our Privacy Policy, which is part of how we provide the service but is not part of these terms.

## 8. Changes to these terms

We may change these terms to reflect changes in the service or in the law. We will tell you by email at least 30 days before a change takes effect. If you do not agree, you can close your account before that date and we will refund any period you paid for and did not use.

## 9. Termination

You can close your account at any time.

We may suspend or close your account if you seriously or repeatedly breach these terms. Unless the law or an urgent risk prevents it, we will tell you before and explain why, and you will be able to export your content.

## 10. Limitation of liability

We provide the service with reasonable skill and care. We are liable for damages caused by our gross negligence or wilful misconduct, and in any case as the law requires. Nothing in these terms limits your rights as a consumer.

## 11. Governing law

These terms are governed by Spanish law. If you are a consumer, you also keep the protection of the mandatory law of the country where you live.

## 12. Disputes

If we disagree, write to us first and we will try to solve it. If we cannot, you can go to the courts of the place where you live.

## 13. Contact

[Company], [registered address], [tax ID].
Questions about these terms: [email].
`;

const SAAS_SLA = `# Service Level Agreement

Last updated: [date]

## 1. Scope

This Service Level Agreement is part of the [Service] Terms of Service between you and [Company]. It applies to the paid plans of [Service].

## 2. Definitions

"Downtime" means a period of at least 5 consecutive minutes in which the service cannot be used. "Monthly Uptime Percentage" is the share of a calendar month without Downtime.

## 3. Service commitment

We will make [Service] available with a Monthly Uptime Percentage of at least 99.9%.

## 4. Exclusions

Downtime does not include:

- planned maintenance announced at least 48 hours before;
- problems caused by your own systems, or by using the service against the Terms of Service;
- events beyond our reasonable control.

## 5. Support and response times

Report problems at [support email]. We answer critical incidents, when the service cannot be used, within 1 hour, and other requests within 1 business day.

## 6. Service credits

If the Monthly Uptime Percentage falls below the commitment, you get a credit on the monthly fee of your plan, as listed in the pricing at [Pricing link]:

- below 99.9%: 10% of the monthly fee;
- below 99%: 25% of the monthly fee;
- below 95%: 50% of the monthly fee.

## 7. How to claim

To receive a credit, write to [support email] within 30 days of the end of the month, with the dates and times of the Downtime. Credits are applied to your next invoice.

## 8. Changes

We may change this agreement. We will tell you by email at least 30 days before a change takes effect, and a change never lowers the commitment during a period you already paid for.
`;

export const CONTRACT_TEMPLATES: ContractTemplate[] = [
  {
    id: 'saas',
    documentType: 'terms-of-service',
    name: 'SaaS Terms of Service',
    description: 'A complete, balanced model for an online service, with every expected section filled in.',
    text: SAAS_TERMS,
  },
  {
    id: 'saas-sla',
    documentType: 'service-level-agreement',
    name: 'SaaS Service Level Agreement',
    description: 'Availability, support times and service credits for an online service, linked to its pricing.',
    text: SAAS_SLA,
  },
];

/** A blank document of a type that has no template: only its title. */
export const blankDocument = (title: string) => `# ${title}\n\nLast updated: [date]\n\n`;

/** A template as a new contract starts from it: last updated today, written out ("22 November 2026"). */
export function templateText(template: ContractTemplate): string {
  return template.text.replace('[date]', format(new Date(), 'd MMMM yyyy'));
}
