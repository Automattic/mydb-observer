"use strict";

/**
 * Module dependencies.
 */

const EventEmitter = require('events').EventEmitter;
const debug = require('debug')('mydb-observer');

/**
 * MyDB Observer
 *
 * @api public
 */

class MyDBObserver extends EventEmitter {

  /**
   * Creates the MyDBObserver instance
   *
   * @param {redis.Client} (optional) redis client to publish the events to
   * @api public
   */

  constructor(redis) {
    super();
    if (redis) {
      this.redis = redis;
      this.on('op', (id, query, op) => {
        debug('publishing to redis %s channel', id);
        this.redis.publish(id, JSON.stringify([query, op]));
      });
    }
    this.on('op', (id, query, op) => debug('emitted ("%s", %j, %j)', id, query, op));
  }

  /**
   * Observes a MongoDB Collection object, and emits events on object updates
   *
   * @param {mongodb.Collection} a collection to observe
   * @api public
   */

  observe(collection) {

    debug('patching mongodb.Collection methods');

    let findAndModify = collection.findAndModify;
    let update = collection.update;
    let findOneAndUpdate = collection.findOneAndUpdate;
    // Other methods, such as findOneAndUpdate will internally call findAndModify,
    // and need not to be directly patched.
    // NOTE: No longer true, latest driver `findAndModify` is deprecated, need to call `findOneAndUpdate` directly

    /**
     * Find and Modify
     */

    collection.findAndModify = (query, sort, doc, opts, callback) => {

      if (typeof callback == 'undefined' && typeof opts == 'function') {
        callback = opts;
        opts = undefined;
      }

      return findAndModify
        .call(collection, query, sort, doc, opts)
        .then(r => {
          if (r && r.value && r.value._id) {
            let id = r.value._id.toString();
            // event must be emitted async to avoid catching exceptions in the promise
            setImmediate(() => {
              this.emit('op', id, this.omit(query, '_id'), doc);
            });
          }
          if (callback) callback(null, r);
          return r;
        })
        .catch(callback);
    }

    /**
     * Find One and Update
     */
    collection.findOneAndUpdate = (query, doc, opts, callback) => {

      if (typeof callback == 'undefined' && typeof opts == 'function') {
        callback = opts;
        opts = undefined;
      }

      return findOneAndUpdate
        .call(collection, query, doc, opts)
        .then(r => {
          if (r && r.value && r.value._id) {
            let id = r.value._id.toString();
            // event must be emitted async to avoid catching exceptions in the promise
            setImmediate(() => {
              this.emit('op', id, this.omit(query, '_id'), doc);
            });
          }
          if (callback) callback(null, r);
          return r;
        })
        .catch(callback);
    }

    /**
     * Update
     */

    collection.update = (selector, document, options, callback) => {

      if (typeof callback == 'undefined' && typeof options == 'function') {
        callback = options;
        options = undefined;
      }

      if ((options && options.multi) || selector._id) {
        // update queries with the `multi` option will not produce events, unless `_id` is specified
        debug('`options.multi` specified or `_id`-based query, calling `update` normally');
        return update
          .call(collection, selector, document, options)
          .then(r => {
            if (selector._id) {
              debug('query has _id: ' + selector._id);
              let id = selector._id.toString();
              // event must be emitted async to avoid catching exceptions in the promise
              setImmediate(() => {
                this.emit('op', id, this.omit(selector, '_id'), document);
              });
            }
            if (callback) callback(null, r);
            return r;
          })
          .catch(callback);
      } else {
        // we findAndModify here to fetch the `_id` of the modified object
        debug('falling back to `findAndModify` to grab `_id`');

        options = this._includeId(options);

        return collection.findAndModify(selector, [['_id', 1]], document, options, callback);
      }
    }
  }

  /**
   * Omits a value from an object based on its key
   */
  omit(objectToFilter, omitValue) {
    const {[omitValue]: omitted, ...returnObj} = objectToFilter;
    return returnObj;
  }
  /**
   * Clones an object and adds a new key/value pair
   */
  put(objectToClone, newKey, newValue) {
    const newObject = structuredClone(objectToClone);
    newObject[newKey] = newValue;
    return newObject;
  }

  /**
   * Make sure `_id` is present in the `options.field` property.
   * (Without modifying the original options object.)
   *
   * @param {Object} (optional) options
   * @api private
   */

  _includeId(options) {
    return this.put(options || {}, 'fields', this.put((options || {}).fields || {}, '_id', 1));
  }
}

/**
 * Module exports
 */

module.exports = MyDBObserver;
