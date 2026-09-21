import container from '../config/container';
import ContractCollectionService from '../services/ContractCollectionService';
import ContractService from '../services/ContractService';
import { CollectionIndexQueryParams } from '../types/services/ContractCollection';
import { handleError } from '../utils/users/helpers';

class ContractCollectionController {
  private readonly contractCollectionService: ContractCollectionService;
  private readonly contractService: ContractService;

  constructor() {
    this.contractCollectionService = container.resolve('contractCollectionService');
    this.contractService = container.resolve('contractService');
    this.index = this.index.bind(this);
    this.indexByOrganizationId = this.indexByOrganizationId.bind(this);
    this.indexByAuthenticatedUser = this.indexByAuthenticatedUser.bind(this);
    this.show = this.show.bind(this);
    this.create = this.create.bind(this);
    this.addContractToCollection = this.addContractToCollection.bind(this);
    this.update = this.update.bind(this);
    this.destroy = this.destroy.bind(this);
    this.removeContractFromCollection = this.removeContractFromCollection.bind(this);
  }

  async index(req: any, res: any) {
    try {
      const queryParams: CollectionIndexQueryParams = this._transformIndexQueryParams(req.query);
      const result = await this.contractCollectionService.index(queryParams, req.user);
      res.json(result);
    } catch (err: any) {
      const { status, message } = handleError(err);
      res.status(status).send({ error: message });
    }
  }

  async indexByAuthenticatedUser(req: any, res: any) {
    try {
      const queryParams: CollectionIndexQueryParams = this._transformIndexQueryParams(req.query);
      const targetUserUsername = req.params.username === 'me' ? req.user.username : req.params.username;
      const collections = await this.contractCollectionService.indexByUser(
        targetUserUsername,
        req.user,
        queryParams
      );
      res.json(collections);
    } catch (err: any) {
      const { status, message } = handleError(err);
      res.status(status).send({ error: message });
    }
  }

  async indexByOrganizationId(req: any, res: any) {
    try {
      const queryParams: CollectionIndexQueryParams = this._transformIndexQueryParams(req.query);
      const collections = await this.contractCollectionService.indexByOrganizationId(
        req.params.organizationId,
        req.user,
        queryParams
      );
      res.json(collections);
    } catch (err: any) {
      const { status, message } = handleError(err);
      res.status(status).send({ error: message });
    }
  }

  async show(req: any, res: any) {
    try {
      const collection = await this.contractCollectionService.show(
        req.params.organizationId,
        req.params.collectionSlug,
        req.user
      );
      res.json(collection);
    } catch (err: any) {
      const { status, message } = handleError(err);
      res.status(status).send({ error: message });
    }
  }

  async create(req: any, res: any) {
    try {
      const collection = await this.contractCollectionService.create(
        req.body,
        req.params.organizationId,
        req.user
      );
      res.status(201).json(collection);
    } catch (err: any) {
      const { status, message } = handleError(err);
      res.status(status).send({ error: message });
    }
  }

  async addContractToCollection(req: any, res: any) {
    try {
      await this.contractService.addContractToCollection(
        req.body.contractSlug,
        req.params.organizationId,
        req.params.collectionSlug,
        req.user
      );
      res.json({ message: 'Contract added to collection successfully' });
    } catch (err: any) {
      const { status, message } = handleError(err);
      res.status(status).send({ error: message });
    }
  }

  async update(req: any, res: any) {
    try {
      const collection = await this.contractCollectionService.update(
        req.params.organizationId,
        req.params.collectionSlug,
        req.body,
        req.user
      );
      res.json(collection);
    } catch (err: any) {
      const { status, message } = handleError(err);
      res.status(status).send({ error: message });
    }
  }

  async destroy(req: any, res: any) {
    try {
      const { cascade } = req.query;
      const deleteCascade = String(cascade).toLowerCase() === 'true';

      const result = await this.contractCollectionService.destroy(
        req.params.organizationId,
        req.params.collectionSlug,
        deleteCascade,
        false,
        req.user
      );
      res.status(200).json({ message: result ? 'Successfully deleted.' : 'Could not delete collection.' });
    } catch (err: any) {
      const { status, message } = handleError(err);
      res.status(status).send({ error: message });
    }
  }

  async removeContractFromCollection(req: any, res: any) {
    try {
      await this.contractCollectionService.removeContractFromCollection(
        req.params.contractSlug,
        req.params.organizationId,
        req.user
      );
      res.json({ message: 'Contract removed from collection successfully.' });
    } catch (err: any) {
      const { status, message } = handleError(err);
      res.status(status).send({ error: message });
    }
  }

  _transformIndexQueryParams(indexQueryParams: Record<string, string>): CollectionIndexQueryParams {
    const transformedData: CollectionIndexQueryParams = {
      name: indexQueryParams.name,
      sortBy: indexQueryParams.sortBy,
      sort: indexQueryParams.sort ?? 'asc',
      organizationIds: indexQueryParams.organizationIds ? indexQueryParams.organizationIds.split(',') : undefined,
      limit: parseInt(indexQueryParams.limit) || 10,
      offset: parseInt(indexQueryParams.offset) || 0,
      writableOnly: indexQueryParams.writableOnly === 'true',
    };

    (['name', 'sortBy', 'sort', 'organizationIds'] as const).forEach(field => {
      if (!transformedData[field]) {
        delete transformedData[field];
      }
    });

    return transformedData;
  }
}

export default ContractCollectionController;
