import mongoose from 'mongoose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import testContainer from './utils/config/testContainer';
import { up as createFis } from '../main/migrations/mongo/1782200000000-create-fis-2026-2027';

describe('Migration: FIS 2026-2027 organization', () => {
  const created: { organizations: mongoose.Types.ObjectId[]; users: mongoose.Types.ObjectId[] } = { organizations: [], users: [] };

  beforeAll(async () => {
    testContainer.resolve('app');
    const db = mongoose.connection;
    const admin = await db.collection('users').insertOne({ username: `migration_admin_${Date.now()}`, email: `migration_admin_${Date.now()}@example.com`, role: 'ADMIN' });
    const owner = await db.collection('users').insertOne({ username: 'marmolpen3', email: 'marmolpen3@example.com', role: 'USER' });
    created.users.push(admin.insertedId, owner.insertedId);
    // The top of the chain already exists, written differently: it must be reused.
    const university = await db.collection('organizations').insertOne({
      name: `us-${Date.now()}`, displayName: 'universidad de sevilla', _parentId: null, ancestors: [], isPersonal: false,
    });
    created.organizations.push(university.insertedId);

    await createFis(db);
    await createFis(db);
  });

  afterAll(async () => {
    const db = mongoose.connection;
    const chain = await db.collection('organizations').find({ ancestors: { $in: created.organizations } }).toArray();
    const ids = [...created.organizations, ...chain.map(o => o._id)];
    await db.collection('organizationMemberships').deleteMany({ _organizationId: { $in: ids } });
    await db.collection('organizations').deleteMany({ _id: { $in: ids } });
    await db.collection('users').deleteMany({ _id: { $in: created.users } });
  });

  it('creates the missing links under the existing university, once', async () => {
    const db = mongoose.connection;
    const [universityId] = created.organizations;
    const chain = await db.collection('organizations').find({ ancestors: universityId }).sort({ createdAt: 1 }).toArray();

    expect(chain.map(o => o.displayName)).toEqual([
      'Máster Universitario en Ingeniería del Software: Cloud, Datos y Gestión TI',
      'FIS – Fundamentos de Ingeniería del Software',
      '2026-2027',
    ]);
    const [master, fis, course] = chain;
    expect(String(master._parentId)).toBe(String(universityId));
    expect(String(fis._parentId)).toBe(String(master._id));
    expect(String(course._parentId)).toBe(String(fis._id));
    expect(course.ancestors.map(String)).toEqual([universityId, master._id, fis._id].map(String));
  });

  it('makes the platform admins owners of the organizations it creates', async () => {
    const db = mongoose.connection;
    const chain = await db.collection('organizations').find({ ancestors: created.organizations[0] }).toArray();
    const memberships = await db.collection('organizationMemberships')
      .find({ _organizationId: { $in: chain.map(o => o._id) } }).toArray();

    // The test container has its own global admin, who becomes an owner too.
    const ofOurAdmin = memberships.filter(m => String(m._userId) === String(created.users[0]));
    expect(ofOurAdmin).toHaveLength(3);
    expect(memberships.every(m => m.role === 'OWNER' && m._roleWeight === 3)).toBe(true);
  });

  it('makes marmolpen3 owner of the whole chain, the existing university included, once', async () => {
    const db = mongoose.connection;
    const chain = await db.collection('organizations').find({ ancestors: created.organizations[0] }).toArray();
    const ownerships = await db.collection('organizationMemberships')
      .find({ _userId: created.users[1] }).toArray();

    expect(ownerships.map(m => String(m._organizationId)).sort())
      .toEqual([created.organizations[0], ...chain.map(o => o._id)].map(String).sort());
    expect(ownerships.every(m => m.role === 'OWNER')).toBe(true);
  });
});
