import RepositoryBase from '../RepositoryBase';
import ContractVersionMongoose from './models/ContractVersionMongoose';

class ContractVersionRepository extends RepositoryBase {
  async findByContractId(contractId: string) {
    const versions = await ContractVersionMongoose.find({ _contractId: String(contractId) })
      .select('-content -clauses')
      .sort({ capturedAt: 1 });
    return versions.map(v => v.toObject());
  }

  async findById(id: string) {
    const version = await ContractVersionMongoose.findById(id);
    if (!version) return null;
    return version.toObject();
  }

  async findByContractAndCommit(contractId: string, commitHash: string) {
    const version = await ContractVersionMongoose.findOne({
      _contractId: String(contractId),
      commitHash,
    });
    if (!version) return null;
    return version.toObject();
  }

  async updateLabel(id: string, label: string) {
    const version = await ContractVersionMongoose.findByIdAndUpdate(id, { label }, { new: true });
    return version ? version.toObject() : null;
  }

  async create(data: Record<string, any>) {
    if (data._contractId) data._contractId = String(data._contractId);
    const version = await ContractVersionMongoose.create(data);
    return version.toObject();
  }

  async deleteById(id: string) {
    const result = await ContractVersionMongoose.deleteOne({ _id: id });
    return result?.deletedCount === 1;
  }

  async deleteManyNotIn(contractId: string, keepCommitHashes: string[]) {
    return ContractVersionMongoose.deleteMany({
      _contractId: String(contractId),
      commitHash: { $nin: keepCommitHashes },
    });
  }

  async deleteByContractIds(contractIds: string[]) {
    return ContractVersionMongoose.deleteMany({
      _contractId: { $in: contractIds.map(String) },
    });
  }
}

export default ContractVersionRepository;
