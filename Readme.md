# MyDB Observer

Observes MongoDB Collection objects, publishes write events to Redis for MyDB.

## Compatibility

For compatible node, mongodb and redis versions, please check the `peerDependencies` field in package.json.

## Usage

```javascript
"use strict";

const mongodb = require('mongodb');
const redis = require('redis');
const MyDBObserver = require('mydb-observer');

let redisClient = redis.createClient();
let observer = new MyDBObserver(redisClient);

mongodb.MongoClient
  .connect('mongodb://localhost')
  .then(db => {
    let foo = db.collection('foo');
    observer.observe(foo);

    // changes will be published to Redis, for MyDB
    foo.update(/* ... */);
  });
```
