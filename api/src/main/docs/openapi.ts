// OpenAPI description of the ICAN REST API. Kept as a TypeScript module (not a .yaml) so it
// is compiled and shipped with the rest of `src/main`, and served at /api/v1/docs.
// The frontend uses these very endpoints, so anything it can do can be scripted.

const errorResponse = (description: string) => ({
  description,
  content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
});

const orgParam = {
  name: 'organizationId',
  in: 'path',
  required: true,
  schema: { type: 'string' },
  description: 'Id of the organization that owns the collection.',
};

const secured = [{ bearerAuth: [] }, { apiKeyAuth: [] }];

const saveBodyCommon = {
  collectionId: { type: 'string', description: 'Collection to save into (must belong to the organization).' },
  serviceId: { type: 'string', description: 'Existing service. Always send this or `serviceName`.' },
  serviceName: { type: 'string', description: 'Service to find or create by name.' },
  contractId: { type: 'string', description: 'Existing contract. Send this or `contractName` (always required).' },
  contractName: { type: 'string', description: 'New contract name.' },
  versionId: {
    type: 'string',
    description:
      'Attach the result to this existing version of `contractId` (overwriting that analysis) instead of creating or reusing a version by content hash.',
  },
  provider: { type: 'string', description: 'Required when creating a new contract.' },
  title: { type: 'string', description: 'Required when creating a new contract.' },
  date: { type: 'string', format: 'date', description: 'Capture date of the text (ISO 8601).' },
};

const saveResponses = {
  '201': {
    description: 'Saved.',
    content: { 'application/json': { schema: { $ref: '#/components/schemas/SaveResult' } } },
  },
  '401': errorResponse('Missing or invalid credentials.'),
  '403': errorResponse('No permission on this organization (API keys need a scope for it).'),
  '404': errorResponse('Collection, service, contract or version not found.'),
  '422': errorResponse('Validation error.'),
};

export const openApiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'ICAN API',
    version: '1.0.0',
    description: [
      'REST API of ICAN, a platform to analyse SaaS Terms of Service for potentially unfair clauses.',
      '',
      '**What you can do**',
      '- Analyse a text with **AI Classify** (one call) or **Ontology Analysis** (submit a job, poll it, read the report).',
      '- Save either result into an organization: collection → service → contract → version.',
      '- Read collections, contracts and their versions.',
      '',
      '**Same clauses in both analysers.** The text is cut into sentences once, by the API, and both analysers receive those sentences, so their clause lists match one to one.',
      '',
      '**Authentication.** Send `Authorization: Bearer <token>` (from the login) or `x-api-key: <key>`. ' +
        'Create a key with `POST /users/{username}/api-keys` and give it a scope per organization (`VIEW`, `MANAGEMENT` or `ALL`). ' +
        'Endpoints marked as public need no credentials.',
    ].join('\n'),
  },
  servers: [{ url: '/api/v1' }],
  tags: [
    { name: 'Analysis', description: 'Analyse a text. Public.' },
    { name: 'Save', description: 'Store an analysis result as a contract version.' },
    { name: 'Collections', description: 'Contract collections.' },
    { name: 'Contracts', description: 'Contracts and their versions.' },
    { name: 'Services', description: 'Services that group contracts.' },
    { name: 'API keys', description: 'Credentials for scripts and integrations.' },
  ],
  paths: {
    '/analysis/ai-classify': {
      post: {
        tags: ['Analysis'],
        summary: 'Classify a text with AI Classify',
        description:
          'Cuts the text into sentences and flags potentially unfair ones across eight categories (a clause is flagged when a category scores above 0.5). Synchronous.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['text'],
                properties: { text: { type: 'string', minLength: 1, maxLength: 200000 } },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Analysis result.',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/AiClassifyResult' } } },
          },
          '422': errorResponse('Validation error.'),
          '502': errorResponse('The classifier service is unavailable.'),
        },
      },
    },
    '/analysis/ontology-analysis/models': {
      get: {
        tags: ['Analysis'],
        summary: 'List the models available for Ontology Analysis',
        responses: {
          '200': {
            description: 'Model presets.',
            content: {
              'application/json': {
                schema: { type: 'array', items: { $ref: '#/components/schemas/ModelPreset' } },
              },
            },
          },
        },
      },
    },
    '/analysis/ontology-analysis': {
      post: {
        tags: ['Analysis'],
        summary: 'Start an Ontology Analysis job',
        description:
          'Cuts the text into sentences, converts each into an ODRL graph and queries it for unfair terms. The job runs in the background: poll `GET /analysis/ontology-analysis/{jobId}` until `status` is `done`, then read the report. The text is sent to the configured external LLM provider.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['text'],
                properties: {
                  text: { type: 'string', description: 'Plain text of the contract.' },
                  provider: { type: 'string' },
                  title: { type: 'string' },
                  date: { type: 'string' },
                  model: { type: 'string', description: '`model` of one of the presets.' },
                  baseUrl: { type: 'string', description: '`base_url` of that preset ("" for OpenAI).' },
                  runEvaluation: { type: 'boolean', description: 'Also compute semantic similarity (slower).' },
                },
              },
            },
          },
        },
        responses: {
          '202': {
            description: 'Job accepted.',
            content: {
              'application/json': {
                schema: { type: 'object', properties: { jobId: { type: 'string' } }, required: ['jobId'] },
              },
            },
          },
          '422': errorResponse('Validation error (`text` is required and must not be blank).'),
          '502': errorResponse('The ontology service is unavailable.'),
        },
      },
    },
    '/analysis/ontology-analysis/{jobId}': {
      get: {
        tags: ['Analysis'],
        summary: 'Job status',
        parameters: [{ name: 'jobId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': {
            description: 'Current status and per-step progress.',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/JobStatus' } } },
          },
          '404': errorResponse('Job not found.'),
        },
      },
    },
    '/analysis/ontology-analysis/{jobId}/report': {
      get: {
        tags: ['Analysis'],
        summary: 'Job report',
        description: 'Available once the job status is `done`.',
        parameters: [{ name: 'jobId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': {
            description: 'The Ontology Analysis report.',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/JobReport' } } },
          },
          '404': errorResponse('Job not found.'),
        },
      },
    },
    '/contracts/{organizationId}/ai-classify/save': {
      post: {
        tags: ['Save'],
        summary: 'Save an AI Classify result',
        description:
          'Creates (or reuses) the service and contract and stores the result as a version. Send `text`, `summary` and `clauses` exactly as analysed.',
        security: secured,
        parameters: [orgParam],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['collectionId', 'date', 'text', 'summary', 'clauses'],
                properties: {
                  ...saveBodyCommon,
                  text: { type: 'string', description: 'The analysed text.' },
                  summary: { $ref: '#/components/schemas/AiClassifySummary' },
                  clauses: { type: 'array', items: { $ref: '#/components/schemas/AiClassifyClause' } },
                },
              },
            },
          },
        },
        responses: saveResponses,
      },
    },
    '/contracts/{organizationId}/ontology-analysis/save': {
      post: {
        tags: ['Save'],
        summary: 'Save an Ontology Analysis report',
        description:
          'Same as the AI Classify save, but stores the ontology report. Saving both results on the same contract version keeps both.',
        security: secured,
        parameters: [orgParam],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['collectionId', 'date', 'report'],
                properties: {
                  ...saveBodyCommon,
                  text: { type: 'string', description: 'The analysed text (the version content).' },
                  report: { $ref: '#/components/schemas/JobReport' },
                },
              },
            },
          },
        },
        responses: saveResponses,
      },
    },
    '/contractCollections': {
      get: {
        tags: ['Collections'],
        summary: 'List collections',
        description: 'Public collections, plus private ones the caller can access.',
        responses: { '200': { description: 'Collections and total.' } },
      },
    },
    '/contractCollections/{organizationId}': {
      get: {
        tags: ['Collections'],
        summary: 'List the collections of an organization',
        parameters: [orgParam],
        responses: { '200': { description: 'Collections.' }, '404': errorResponse('Organization not found.') },
      },
      post: {
        tags: ['Collections'],
        summary: 'Create a collection',
        security: secured,
        parameters: [orgParam],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name'],
                properties: { name: { type: 'string' }, private: { type: 'boolean' } },
              },
            },
          },
        },
        responses: { '201': { description: 'Created.' }, '422': errorResponse('Validation error.') },
      },
    },
    '/contractCollections/{organizationId}/{collectionSlug}': {
      get: {
        tags: ['Collections'],
        summary: 'Get a collection with its contracts',
        parameters: [
          orgParam,
          { name: 'collectionSlug', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: { '200': { description: 'The collection.' }, '404': errorResponse('Not found.') },
      },
      put: {
        tags: ['Collections'],
        summary: 'Update a collection',
        security: secured,
        parameters: [
          orgParam,
          { name: 'collectionSlug', in: 'path', required: true, schema: { type: 'string' } },
        ],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: { name: { type: 'string' }, description: { type: 'string' }, private: { type: 'boolean' } },
              },
            },
          },
        },
        responses: { '200': { description: 'Updated.' } },
      },
      delete: {
        tags: ['Collections'],
        summary: 'Delete a collection',
        security: secured,
        parameters: [
          orgParam,
          { name: 'collectionSlug', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'cascade', in: 'query', schema: { type: 'boolean' }, description: 'Also delete its contracts.' },
        ],
        responses: { '204': { description: 'Deleted.' } },
      },
    },
    '/contracts': {
      get: {
        tags: ['Contracts'],
        summary: 'List contracts',
        parameters: [
          { name: 'name', in: 'query', schema: { type: 'string' } },
          { name: 'collection', in: 'query', schema: { type: 'string' } },
          { name: 'limit', in: 'query', schema: { type: 'integer' } },
          { name: 'offset', in: 'query', schema: { type: 'integer' } },
        ],
        responses: { '200': { description: 'Contracts and total.' } },
      },
    },
    '/contracts/{organizationId}/{contractSlug}': {
      get: {
        tags: ['Contracts'],
        summary: 'Get a contract',
        parameters: [orgParam, { name: 'contractSlug', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'The contract.' }, '404': errorResponse('Not found.') },
      },
      delete: {
        tags: ['Contracts'],
        summary: 'Delete a contract and its versions',
        security: secured,
        parameters: [orgParam, { name: 'contractSlug', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '204': { description: 'Deleted.' } },
      },
    },
    '/contracts/{organizationId}/{contractSlug}/versions': {
      get: {
        tags: ['Contracts'],
        summary: 'List the versions of a contract',
        description:
          'Each version says whether it has an AI Classify `summary` and/or an ontology report (`hasOntologyReport`).',
        parameters: [orgParam, { name: 'contractSlug', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Versions.' } },
      },
    },
    '/contracts/{organizationId}/{contractSlug}/versions/{versionId}': {
      get: {
        tags: ['Contracts'],
        summary: 'Get one version, with its text, clauses and ontology report',
        parameters: [
          orgParam,
          { name: 'contractSlug', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'versionId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: { '200': { description: 'The version.' }, '404': errorResponse('Not found.') },
      },
      delete: {
        tags: ['Contracts'],
        summary: 'Delete a version',
        security: secured,
        parameters: [
          orgParam,
          { name: 'contractSlug', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'versionId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: { '204': { description: 'Deleted.' } },
      },
    },
    '/services': {
      get: {
        tags: ['Services'],
        summary: 'List the services of a collection',
        parameters: [{ name: 'collectionId', in: 'query', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Services.' } },
      },
    },
    '/users/{username}/api-keys': {
      post: {
        tags: ['API keys'],
        summary: 'Create an API key',
        description: 'The plain key is returned once, in `plainKey`. Send it later as the `x-api-key` header.',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'username', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name', 'scopes'],
                properties: {
                  name: { type: 'string' },
                  expiresAt: { type: 'string', format: 'date-time' },
                  scopes: {
                    type: 'array',
                    items: {
                      type: 'object',
                      required: ['organizationId', 'scope'],
                      properties: {
                        organizationId: { type: 'string' },
                        scope: { type: 'string', enum: ['VIEW', 'MANAGEMENT', 'ALL'] },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        responses: {
          '201': {
            description: 'Created.',
            content: {
              'application/json': {
                schema: { type: 'object', properties: { apiKey: { type: 'object' }, plainKey: { type: 'string' } } },
              },
            },
          },
        },
      },
    },
  },
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      apiKeyAuth: { type: 'apiKey', in: 'header', name: 'x-api-key' },
    },
    schemas: {
      Error: { type: 'object', properties: { error: { type: 'string' } } },
      SaveResult: {
        type: 'object',
        properties: {
          organizationId: { type: 'string' },
          contractSlug: { type: 'string' },
          versionId: { type: 'string' },
        },
      },
      AiClassifySummary: {
        type: 'object',
        properties: {
          totalClauses: { type: 'integer' },
          unfairClauses: { type: 'integer' },
          totalWords: { type: 'integer' },
          sectionCount: { type: 'integer', nullable: true },
        },
      },
      AiClassifyClause: {
        type: 'object',
        description:
          'Scores per category: ltd limitation of liability, ter unilateral termination, ch unilateral change, cr content removal, use contract by using, law choice of law, j jurisdiction, a arbitration.',
        properties: {
          term: { type: 'string' },
          isUnfair: { type: 'boolean' },
          wordCount: { type: 'integer' },
          ltd: { type: 'number' },
          ter: { type: 'number' },
          ch: { type: 'number' },
          cr: { type: 'number' },
          use: { type: 'number' },
          law: { type: 'number' },
          j: { type: 'number' },
          a: { type: 'number' },
        },
      },
      AiClassifyResult: {
        type: 'object',
        properties: {
          summary: { $ref: '#/components/schemas/AiClassifySummary' },
          clauses: { type: 'array', items: { $ref: '#/components/schemas/AiClassifyClause' } },
        },
      },
      ModelPreset: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          label: { type: 'string' },
          model: { type: 'string' },
          base_url: { type: 'string' },
        },
      },
      JobStatus: {
        type: 'object',
        properties: {
          job_id: { type: 'string' },
          status: { type: 'string', enum: ['pending', 'running', 'done', 'error'] },
          created: { type: 'string' },
          finished: { type: 'string', nullable: true },
          error: { type: 'string', nullable: true },
          steps: {
            type: 'object',
            additionalProperties: {
              type: 'object',
              properties: {
                status: { type: 'string', enum: ['pending', 'running', 'done', 'error'] },
                done: { type: 'integer' },
                total: { type: 'integer' },
                error: { type: 'string', nullable: true },
              },
            },
          },
        },
      },
      DeonticEntry: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          actions: { type: 'array', items: { type: 'string' } },
          targets: { type: 'array', items: { type: 'string' } },
          assignee: { type: 'string', nullable: true },
          assigner: { type: 'string', nullable: true },
          description: { type: 'string', nullable: true },
        },
      },
      JobReport: {
        type: 'object',
        properties: {
          job_id: { type: 'string' },
          provider: { type: 'string' },
          title: { type: 'string' },
          date: { type: 'string' },
          aggregate: {
            type: 'object',
            properties: {
              total_clauses: { type: 'integer' },
              conforming: { type: 'integer' },
              permissions: { type: 'integer' },
              prohibitions: { type: 'integer' },
              duties: { type: 'integer' },
              unfair_count: { type: 'integer' },
              mean_semantic_sim: { type: 'number', nullable: true },
            },
          },
          clauses: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                clause_id: { type: 'string' },
                clause_text: { type: 'string' },
                type: { type: 'string' },
                party: { type: 'string' },
                action: { type: 'string' },
                asset: { type: 'string' },
                conforms: { type: 'boolean' },
                repair_rounds: { type: 'integer' },
                permissions: { type: 'array', items: { $ref: '#/components/schemas/DeonticEntry' } },
                prohibitions: { type: 'array', items: { $ref: '#/components/schemas/DeonticEntry' } },
                duties: { type: 'array', items: { $ref: '#/components/schemas/DeonticEntry' } },
                unfair_terms: {
                  type: 'object',
                  description:
                    'Matches per category: change, termination, contract_by_use, choice_of_law, jurisdiction, arbitration, content_removal, limitation_of_liability.',
                  additionalProperties: { type: 'array', items: { type: 'object' } },
                },
                semantic_sim: { type: 'number', nullable: true },
                back_translated: { type: 'string', nullable: true },
                ttl: { type: 'string', description: 'Turtle (TOSL/ODRL) graph of the clause.' },
              },
            },
          },
        },
      },
    },
  },
};
