import mongoose, { Schema } from 'mongoose';
import { generateSlug } from '../../../utils/slug-manager';

const contractSchema = new Schema(
  {
    name: { type: String, required: true },
    slug: { type: String, required: false },
    _collectionId: { type: String, ref: 'ContractCollection', required: false },
    _organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    version: { type: String, required: false },
    createdAt: { type: Date, required: true, default: Date.now },
    url: { type: String, required: false },
    content: { type: String, required: false },
    private: { type: Boolean, required: true, default: false },
  },
  {
    toObject: {
      getters: true,
      virtuals: true,
    },
  }
);

contractSchema.pre('save', function (next) {
  if (!this.slug && this.name) {
    this.slug = generateSlug(this.name);
  }
  next();
});

contractSchema.pre('findOneAndUpdate', function (next) {
  const update = this.getUpdate() as any;
  if (update?.name && !update?.slug) {
    update.slug = generateSlug(update.name);
  }
  if (update?.$set?.name && !update?.$set?.slug) {
    update.$set.slug = generateSlug(update.$set.name);
  }
  next();
});

contractSchema.virtual('collection', {
  ref: 'ContractCollection',
  localField: '_collectionId',
  foreignField: '_id',
  justOne: true,
});

contractSchema.virtual('organization', {
  ref: 'Organization',
  localField: '_organizationId',
  foreignField: '_id',
  justOne: true,
});

// Unique slug per organization
contractSchema.index({ slug: 1, _organizationId: 1 }, { unique: true });

const contractModel = mongoose.model('Contract', contractSchema, 'contracts');

export default contractModel;
