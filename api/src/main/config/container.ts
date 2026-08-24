// deno-lint-ignore-file no-explicit-any
import { createContainer, asValue, asClass, AwilixContainer } from "awilix";
import dotenv from "dotenv";
import process from "node:process";

import MongooseUserRepository from "../repositories/mongoose/UserRepository";
import MongooseContractRepository from "../repositories/mongoose/ContractRepository";
import MongooseContractCollectionRepository from "../repositories/mongoose/ContractCollectionRepository";
import MongooseServiceRepository from "../repositories/mongoose/ServiceRepository";
import MongooseContractVersionRepository from "../repositories/mongoose/ContractVersionRepository";
import OrganizationRepository from '../repositories/mongoose/OrganizationRepository';
import OrganizationMembershipRepository from '../repositories/mongoose/OrganizationMembershipRepository';
import OrganizationInvitationRepository from '../repositories/mongoose/OrganizationInvitationRepository';
import EntityPermissionRepository from '../repositories/mongoose/EntityPermissionRepository';
import NotificationRepository from '../repositories/mongoose/NotificationRepository';

import UserService from "../services/UserService";
import ContractService from "../services/ContractService";
import ContractCollectionService from "../services/ContractCollectionService";
import CacheService from "../services/CacheService";
import OrganizationService from '../services/OrganizationService';
import PermissionService from '../services/PermissionService';
import UserSettingsService from '../services/UserSettingsService';
import NotificationService from '../services/NotificationService';
import ApiKeyService from '../services/ApiKeyService';
import AuthProviderService from '../services/AuthProviderService';
import AnalysisService from '../services/AnalysisService';
import TermsCockpitClient from '../services/clients/TermsCockpitClient';
import TermsCockpitSyncService from '../services/TermsCockpitSyncService';
import ContractVersionService from '../services/ContractVersionService';
import OntologyAnalysisService from '../services/OntologyAnalysisService';

dotenv.config();

function initContainer(databaseType: string): AwilixContainer {
  const container: AwilixContainer = createContainer();
  let userRepository, contractRepository, contractCollectionRepository, serviceRepository, contractVersionRepository, organizationRepository, organizationMembershipRepository, organizationInvitationRepository, entityPermissionRepository, notificationRepository;

  switch (databaseType) {
    case "mongoDB":
      userRepository = new MongooseUserRepository();
      contractRepository = new MongooseContractRepository();
      contractCollectionRepository = new MongooseContractCollectionRepository();
      serviceRepository = new MongooseServiceRepository();
      contractVersionRepository = new MongooseContractVersionRepository();
      organizationRepository = new OrganizationRepository();
      organizationMembershipRepository = new OrganizationMembershipRepository();
      organizationInvitationRepository = new OrganizationInvitationRepository();
      entityPermissionRepository = new EntityPermissionRepository();
      notificationRepository = new NotificationRepository();
      break;
    default:
      throw new Error(`Unsupported database type: ${databaseType}`);
  }
  container.register({
    userRepository: asValue(userRepository),
    contractRepository: asValue(contractRepository),
    contractCollectionRepository: asValue(contractCollectionRepository),
    serviceRepository: asValue(serviceRepository),
    contractVersionRepository: asValue(contractVersionRepository),
    organizationRepository: asValue(organizationRepository),
    organizationMembershipRepository: asValue(organizationMembershipRepository),
    organizationInvitationRepository: asValue(organizationInvitationRepository),
    entityPermissionRepository: asValue(entityPermissionRepository),
    notificationRepository: asValue(notificationRepository),
    userService: asClass(UserService).singleton(),
    contractService: asClass(ContractService).singleton(),
    contractCollectionService: asClass(ContractCollectionService).singleton(),
    cacheService: asClass(CacheService).singleton(),
    organizationService: asClass(OrganizationService).singleton(),
    permissionService: asClass(PermissionService).singleton(),
    userSettingsService: asClass(UserSettingsService).singleton(),
    notificationService: asClass(NotificationService).singleton(),
    apiKeyService: asClass(ApiKeyService).singleton(),
    authProviderService: asClass(AuthProviderService).singleton(),
    analysisService: asClass(AnalysisService).singleton(),
    termsCockpitClient: asClass(TermsCockpitClient).singleton(),
    termsCockpitSyncService: asClass(TermsCockpitSyncService).singleton(),
    contractVersionService: asClass(ContractVersionService).singleton(),
    ontologyAnalysisService: asClass(OntologyAnalysisService).singleton(),
  });
  return container;
}

let container: AwilixContainer | null = null;
if (!container) { container = initContainer(process.env.DATABASE_TECHNOLOGY ?? ""); }

export default container as AwilixContainer;
