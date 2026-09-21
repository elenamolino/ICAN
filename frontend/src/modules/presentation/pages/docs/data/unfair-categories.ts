export type QuoteSegment = string | { bold: string };

export interface UnfairCategory {
  id: string;
  title: string;
  definition: string;
  example: {
    source: string;
    url: string;
    quote: QuoteSegment[];
  };
}

const OVERLEAF = { source: 'Overleaf', url: 'https://www.overleaf.com/legal' };
const GITHUB = { source: 'GitHub', url: 'https://github.com/customer-terms/general-terms' };
const OPENAI = { source: 'OpenAI', url: 'https://openai.com/policies/row-terms-of-use/' };

const unfairCategories: UnfairCategory[] = [
  {
    id: 'ltd',
    title: 'Limitation of liability',
    definition:
      'The provider limits its responsibility for damage or loss. It may be unfair if it also excludes serious harm, such as physical injury, intentional damage or gross negligence.',
    example: {
      ...OVERLEAF,
      quote: [
        'We shall ',
        {
          bold: 'have no liability for delays or failures in delivery or performance of our obligations to you resulting from any act, events, omissions, failures or accidents that are outside of our control',
        },
        '.',
      ],
    },
  },
  {
    id: 'ter',
    title: 'Unilateral termination',
    definition:
      'The provider can end the contract or suspend access. It may be unfair if this can happen without notice or a clear reason.',
    example: {
      ...OVERLEAF,
      quote: [
        'We may ',
        { bold: 'stop, suspend' },
        ', or modify ',
        { bold: 'the Services at any time without prior notice' },
        ' to you.',
      ],
    },
  },
  {
    id: 'ch',
    title: 'Unilateral change',
    definition:
      "The provider can change the terms or the service without the consumer's consent. The consumer is then bound by terms they did not accept.",
    example: {
      ...GITHUB,
      quote: [{ bold: 'GitHub may change or discontinue Previews at any time without notice.' }],
    },
  },
  {
    id: 'cr',
    title: 'Content removal',
    definition:
      'The provider can delete content created by users. It may be unfair if this happens without notice, without a clear reason, or with no way to recover the content.',
    example: {
      ...OPENAI,
      quote: [
        'We may ',
        { bold: 'delete or disable content that we believe violates these terms' },
        '.',
      ],
    },
  },
  {
    id: 'use',
    title: 'Contract by using',
    definition:
      'The user accepts the terms just by using the service. Consent is assumed, so users may be bound by terms they have not read.',
    example: {
      ...OPENAI,
      quote: [{ bold: 'By using our Services, you agree to these terms.' }],
    },
  },
  {
    id: 'law',
    title: 'Choice of law',
    definition:
      "The term sets which country's law applies to disputes. It may be unfair if it chooses the provider's law instead of the user's.",
    example: {
      ...GITHUB,
      quote: [
        'This Agreement will be ',
        {
          bold: 'governed by and construed in accordance with the laws of the State of California',
        },
        '.',
      ],
    },
  },
  {
    id: 'j',
    title: 'Jurisdiction',
    definition:
      'The term sets where disputes must be resolved. It may be unfair if users have to go to a distant court.',
    example: {
      ...GITHUB,
      quote: [
        'Any legal action or proceeding will be brought exclusively in the ',
        { bold: 'federal or state courts located in the Northern District of California.' },
      ],
    },
  },
  {
    id: 'a',
    title: 'Arbitration',
    definition:
      'Disputes are resolved by a private arbitrator instead of a court. It may be unfair if arbitration is mandatory, favours the provider, or takes place far from the user.',
    example: {
      ...OPENAI,
      quote: [
        'The ',
        { bold: 'arbitrator will have exclusive authority to resolve any Dispute' },
        '.',
      ],
    },
  },
];

export default unfairCategories;
