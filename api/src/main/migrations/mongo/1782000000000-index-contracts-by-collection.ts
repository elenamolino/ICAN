import mongoose from 'mongoose';

const INDEX_NAME = 'collection_service';

// Opening a collection looks up its contracts by _collectionId, and without an
// index that scanned every contract.
export async function up(db: mongoose.Connection) {
  await db.collection('contracts').createIndex({ _collectionId: 1, _serviceId: 1 }, { name: INDEX_NAME });
}

export async function down(db: mongoose.Connection) {
  try {
    await db.collection('contracts').dropIndex(INDEX_NAME);
  } catch {
    // ignore
  }
}
