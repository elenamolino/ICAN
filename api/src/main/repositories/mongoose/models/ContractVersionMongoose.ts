import mongoose, { Schema } from 'mongoose';

const contractVersionSchema = new Schema(
  {
    _contractId: { type: String, ref: 'Contract', required: true },
    commitHash: { type: String, required: true },
    capturedAt: { type: Date, required: true },
    label: { type: String, enum: ['first', 'intermediate', 'last'], required: true },
    content: { type: String, required: true },
    insertions: { type: Number, required: false, default: null },
    deletions: { type: Number, required: false, default: null },
    summary: {
      type: {
        totalClauses: { type: Number, required: true },
        unfairClauses: { type: Number, required: true },
        totalWords: { type: Number, required: true },
        sectionCount: { type: Number, required: false, default: null },
      },
      required: false,
      default: null,
    },
    clauses: { type: Schema.Types.Mixed, required: false, default: null },
    analysisSkipped: { type: Boolean, required: true, default: false },
  },
  {
    timestamps: true,
    toObject: {
      getters: true,
      virtuals: true,
    },
  }
);

contractVersionSchema.index({ _contractId: 1, commitHash: 1 }, { unique: true });
contractVersionSchema.index({ _contractId: 1, label: 1 });

const contractVersionModel = mongoose.model('ContractVersion', contractVersionSchema, 'contractVersions');

export default contractVersionModel;
