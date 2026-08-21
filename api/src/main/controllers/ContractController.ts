import container from '../config/container';
import ContractService from '../services/ContractService';
import { ContractIndexQueryParams, SortByType } from '../types/services/ContractService';
import { handleError } from '../utils/users/helpers';

class ContractController {
  private contractService: ContractService;

  constructor() {
    this.contractService = container.resolve('contractService');
    this.index = this.index.bind(this);
    this.indexByOrganization = this.indexByOrganization.bind(this);
    this.indexByAuthenticatedUser = this.indexByAuthenticatedUser.bind(this);
    this.show = this.show.bind(this);
    this.create = this.create.bind(this);
    this.update = this.update.bind(this);
    this.destroy = this.destroy.bind(this);
  }

  async index(req: any, res: any) {
    try {
      const queryParams: ContractIndexQueryParams = this._transformIndexQueryParams(req.query);
      const contracts = await this.contractService.index(queryParams, req.user);
      res.json(contracts);
    } catch (err: any) {
      const { status, message } = handleError(err);
      res.status(status).send({ error: message });
    }
  }

  async indexByOrganization(req: any, res: any) {
    try {
      const queryParams: ContractIndexQueryParams = this._transformIndexQueryParams(req.query);
      const contracts = await this.contractService.indexByOrganizationId(
        req.params.organizationId,
        req.user,
        queryParams
      );
      res.json(contracts);
    } catch (err: any) {
      const { status, message } = handleError(err);
      res.status(status).send({ error: message });
    }
  }

  async indexByAuthenticatedUser(req: any, res: any) {
    try {
      const queryParams: ContractIndexQueryParams = this._transformIndexQueryParams(req.query);
      const targetUserUsername = req.params.username === 'me' ? req.user.username : req.params.username;
      const contracts = await this.contractService.indexByUser(targetUserUsername, req.user, queryParams);
      res.json(contracts);
    } catch (err: any) {
      const { status, message } = handleError(err);
      res.status(status).send({ error: message });
    }
  }

  async show(req: any, res: any) {
    try {
      const contract = await this.contractService.show(
        req.params.contractSlug,
        req.params.organizationId,
        req.user,
        req.query
      );
      res.json(contract);
    } catch (err: any) {
      const { status, message } = handleError(err);
      res.status(status).send({ error: message });
    }
  }

  async create(req: any, res: any) {
    try {
      const isPrivate = req.body.private === 'true' || req.body.private === true;
      const collectionId = req.body.collectionId;
      const contract = await this.contractService.create(
        req.body,
        req.params.organizationId,
        isPrivate,
        req.user,
        collectionId
      );
      res.status(201).json(contract);
    } catch (err: any) {
      const { status, message } = handleError(err);
      res.status(status).send({ error: message });
    }
  }

  async update(req: any, res: any) {
    try {
      const contract = await this.contractService.update(
        req.params.contractSlug,
        req.params.organizationId,
        req.user,
        req.body
      );
      res.json(contract);
    } catch (err: any) {
      const { status, message } = handleError(err);
      res.status(status).send({ error: message });
    }
  }

  async destroy(req: any, res: any) {
    try {
      const result = await this.contractService.destroy(
        req.params.contractSlug,
        req.params.organizationId,
        req.user
      );
      if (!result) {
        res.status(404).send({ error: 'NOT FOUND: Contract not found' });
      } else {
        res.status(200).send({ message: 'Contract deleted successfully' });
      }
    } catch (err: any) {
      const { status, message } = handleError(err);
      res.status(status).send({ error: message });
    }
  }

  _transformIndexQueryParams(indexQueryParams: Record<string, string>): ContractIndexQueryParams {
    const transformedData: ContractIndexQueryParams = {
      name: indexQueryParams.name as string,
      sortBy: indexQueryParams.sortBy as SortByType,
      sort: indexQueryParams.sort === 'asc' ? 'asc' : 'desc',
      selectedOrganizations: indexQueryParams.selectedOrganizations
        ? (indexQueryParams.selectedOrganizations as string).split(',')
        : undefined,
      collection: indexQueryParams.collection as string,
      excludeContractsInCollection: indexQueryParams.excludeContractsInCollection === 'true',
      limit: parseInt(indexQueryParams.limit) || 10,
      offset: parseInt(indexQueryParams.offset) || 0,
    };

    (['name', 'selectedOrganizations', 'sortBy', 'sort', 'collection', 'excludeContractsInCollection'] as const).forEach(
      field => {
        if (!transformedData[field]) {
          delete transformedData[field];
        }
      }
    );

    return transformedData;
  }
}

export default ContractController;
