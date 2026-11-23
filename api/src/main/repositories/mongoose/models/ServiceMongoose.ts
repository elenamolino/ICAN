import mongoose, { Schema } from 'mongoose';
import { generateSlug } from '../../../utils/slug-manager';

const serviceSchema = new Schema(
  {
    name: { type: String, required: true },
    slug: { type: String, required: false },
    _collectionId: { type: String, ref: 'ContractCollection', required: true },
    _organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    // Where the service's pricing is published, such as its permanent link in SPHERE.
    pricingUrl: { type: String, required: false, default: null },
    // The provider's own pricing page, its official source.
    pricingSourceUrl: { type: String, required: false, default: null },
    // The secret of the permanent link to this service's Customer Agreement: who has it
    // reads all its documents. Never selected, so no list hands it out.
    shareToken: { type: String, required: false, select: false, index: { unique: true, sparse: true } },
  },
  {
    timestamps: true,
    toObject: {
      getters: true,
      virtuals: true,
    },
  }
);

serviceSchema.pre('save', function (next) {
  if (!this.slug && this.name) {
    this.slug = generateSlug(this.name);
  }
  next();
});

serviceSchema.pre('findOneAndUpdate', function (next) {
  const update = this.getUpdate() as any;
  if (update?.name && !update?.slug) {
    update.slug = generateSlug(update.name);
  }
  if (update?.$set?.name && !update?.$set?.slug) {
    update.$set.slug = generateSlug(update.$set.name);
  }
  next();
});

serviceSchema.virtual('collection', {
  ref: 'ContractCollection',
  localField: '_collectionId',
  foreignField: '_id',
  justOne: true,
});

// Unique slug per collection
serviceSchema.index({ slug: 1, _collectionId: 1 }, { unique: true });

const serviceModel = mongoose.model('Service', serviceSchema, 'services');

export default serviceModel;
