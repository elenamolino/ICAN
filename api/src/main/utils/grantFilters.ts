import mongoose from 'mongoose';
import { EntityGrant } from '../types/policies';

/** Conditions matching exactly the granted entities: a slug is only unique inside its organization. */
export function grantFilters(grants: EntityGrant[]) {
  return grants.map(({ organizationId, slug }) => ({
    _organizationId: new mongoose.Types.ObjectId(organizationId),
    slug,
  }));
}
