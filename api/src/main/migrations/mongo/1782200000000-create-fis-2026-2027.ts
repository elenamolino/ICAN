import mongoose from 'mongoose';

// The FIS course of 2026-2027 and the chain of organizations above it, as in
// SPHERE: Universidad de Sevilla > Máster > FIS > 2026-2027. Each link is looked
// up by its display name under its parent first, so running this where some of
// them already exist (the dev seed has them all) creates only the missing ones.
const CHAIN = [
  {
    name: 'universidad-de-sevilla',
    displayName: 'Universidad de Sevilla',
    description: 'Universidad de Sevilla.',
  },
  {
    name: 'master-ingenieria-software',
    displayName: 'Máster Universitario en Ingeniería del Software: Cloud, Datos y Gestión TI',
    description: 'Máster Universitario en Ingeniería del Software: Cloud, Datos y Gestión TI de la Universidad de Sevilla.',
  },
  {
    name: 'fis',
    displayName: 'FIS – Fundamentos de Ingeniería del Software',
    description: 'Asignatura Fundamentos de Ingeniería del Software.',
  },
  {
    name: 'fis-2026-2027',
    displayName: '2026-2027',
    description: 'Curso 2026-2027 de FIS.',
  },
];

const OWNER_WEIGHT = 3;
// Owner of the whole chain, whether this migration creates each link or finds it.
const CHAIN_OWNER = 'marmolpen3';

const escapeRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

async function freeSlug(organizations: mongoose.mongo.Collection, slug: string) {
  let candidate = slug;
  for (let i = 2; await organizations.findOne({ name: candidate }); i++) {
    candidate = `${slug}-${i}`;
  }
  return candidate;
}

export async function up(db: mongoose.Connection) {
  const organizations = db.collection('organizations');
  const memberships = db.collection('organizationMemberships');
  // The platform admins also own the links this migration creates, so they can
  // manage them from the organization page.
  const admins = await db.collection('users').find({ role: 'ADMIN' }, { projection: { _id: 1 } }).toArray();
  const chainOwner = await db.collection('users').findOne({ username: CHAIN_OWNER }, { projection: { _id: 1 } });

  const makeOwner = async (userId: unknown, organizationId: unknown) => {
    const now = new Date();
    // Upgrades an existing membership instead of adding a second one.
    await memberships.updateOne(
      { _userId: userId, _organizationId: organizationId },
      {
        $set: { role: 'OWNER', _roleWeight: OWNER_WEIGHT, updatedAt: now },
        $setOnInsert: { joinedAt: now, createdAt: now },
      },
      { upsert: true }
    );
  };

  let parent: { _id: mongoose.Types.ObjectId; ancestors: mongoose.Types.ObjectId[] } | null = null;
  for (const link of CHAIN) {
    const existing: mongoose.mongo.WithId<mongoose.mongo.Document> | null = await organizations.findOne({
      displayName: { $regex: `^${escapeRegex(link.displayName)}$`, $options: 'i' },
      _parentId: parent ? parent._id : null,
      isPersonal: { $ne: true },
    });

    if (existing) {
      if (chainOwner) await makeOwner(chainOwner._id, existing._id);
      parent = { _id: existing._id as mongoose.Types.ObjectId, ancestors: existing.ancestors ?? [] };
      continue;
    }

    const now = new Date();
    const ancestors: mongoose.Types.ObjectId[] = parent ? [...parent.ancestors, parent._id] : [];
    const { insertedId } = await organizations.insertOne({
      name: await freeSlug(organizations, link.name),
      displayName: link.displayName,
      description: link.description,
      avatar: null,
      _parentId: parent ? parent._id : null,
      ancestors,
      isPersonal: false,
      createdAt: now,
      updatedAt: now,
    });

    for (const owner of [...admins, ...(chainOwner ? [chainOwner] : [])]) {
      await makeOwner(owner._id, insertedId);
    }

    parent = { _id: insertedId as mongoose.Types.ObjectId, ancestors };
  }
}

// Leaves the organizations in place: by then they may hold collections and members.
export async function down() {}
