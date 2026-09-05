import mongoose, { Schema } from 'mongoose';

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/[\s]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

const contractCollectionSchema = new Schema(
  {
    name: { type: String, required: true },
    slug: { type: String, required: true },
    description: { type: String, required: false },
    _organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: false },
    private: { type: Boolean, required: true, default: true },
  },
  {
    timestamps: true,
    toObject: {
      virtuals: true,
      transform: function (doc, resultObject) {
        delete (resultObject as any)._id;
        delete (resultObject as any).__v;
        delete (resultObject as any)._organizationId;
        delete (resultObject as any).organization?._id;
        return resultObject;
      },
    },
  }
);

contractCollectionSchema.virtual('organization', {
  ref: 'Organization',
  localField: '_organizationId',
  foreignField: '_id',
  justOne: true,
});

contractCollectionSchema.pre('save', function (next) {
  if (!this.slug && this.name) {
    this.slug = generateSlug(this.name);
  }
  next();
});

contractCollectionSchema.pre('findOneAndUpdate', function (next) {
  const update = this.getUpdate() as any;
  if (update?.name && !update?.slug) {
    update.slug = generateSlug(update.name);
  }
  if (update?.$set?.name && !update?.$set?.slug) {
    update.$set.slug = generateSlug(update.$set.name);
  }
  next();
});

// Adding unique index for [name, _organizationId]
contractCollectionSchema.index({ name: 1, _organizationId: 1 }, { unique: true });

// Adding unique index for [slug, _organizationId]
contractCollectionSchema.index({ slug: 1, _organizationId: 1 }, { unique: true, sparse: true });

const contractCollectionModel = mongoose.model(
  'ContractCollection',
  contractCollectionSchema,
  'contractCollections'
);

export { generateSlug };
export default contractCollectionModel;
