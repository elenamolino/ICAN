# mongo-init/init-mongo.sh
echo "Creating mongo users..."
mongosh admin --host localhost -u $MONGO_INITDB_ROOT_USERNAME -p $MONGO_INITDB_ROOT_PASSWORD <<-EOJS
    use $MONGO_INITDB_DATABASE;
    db.createUser({
        user: '$DATABASE_USERNAME',
        pwd: '$DATABASE_PASSWORD',
        roles: [{role: 'readWrite', db: '$MONGO_INITDB_DATABASE'}, {role: 'dbAdmin', db: '$MONGO_INITDB_DATABASE'}]
    });
    // Separate database for the test suite (api/.env.testing), scoped to its
    // own name so testApp.ts's dropDatabase() on suite startup can never
    // touch the dev database that shares this same testUser/testUser login.
    db.getSiblingDB('ican_test_db').createUser({
        user: '$DATABASE_USERNAME',
        pwd: '$DATABASE_PASSWORD',
        roles: [{role: 'readWrite', db: 'ican_test_db'}, {role: 'dbAdmin', db: 'ican_test_db'}]
    });
EOJS
echo "Mongo users created."