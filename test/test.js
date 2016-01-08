"use strict";

const expect = require('expect.js');
const MyDBObserver = require('..');
const mongodb = require('mongodb');
const redis = require('redis');

describe('mydb-observer', function () {
  let db, users, observer;
  
  before(function (done) {
    mongodb.MongoClient
      .connect('mongodb://localhost')
      .then(_db => {
        db = _db;
        users = db.collection('users-' + Date.now());
        observer = new MyDBObserver();
        done();
      })
      .catch(e => {
        throw e;
      });
  });
  
  describe('`observe` method', function () {
    it('should patch the methods', function () {
      expect(users.findAndModify).to.equal(mongodb.Collection.prototype.findAndModify);
      expect(users.update).to.equal(mongodb.Collection.prototype.update);
      observer.observe(users);
      expect(users.findAndModify).to.be.a('function').and.to.not.equal(mongodb.Collection.prototype.findAndModify);
      expect(users.update).to.be.a('function').and.to.not.equal(mongodb.Collection.prototype.update);
    });
  });
        
  describe('`op` event', function() {
    let userId;
    let e1, e2, e3, e4;
    
    before(function() {
      return users
        .insertOne({ a: 0 })
        .then(r => {
          userId = r.insertedId;
        })
    });
    
    it('should fire on `update` (`_id`-based query)', function (done) {
      users
        .update({ _id: userId }, { $set: { a: 1 } })
        .catch(done);
        
      observer.once('op', (id, query, op) => {
        e1 = { id, query, op };
        done();
      });
    });

    it('should fire on `update` (regular query)', function (done) {
      users
        .update({ a: 1 }, { $set: { a: 2 } })
        .catch(done);
        
      observer.once('op', (id, query, op) => {
        e2 = { id, query, op };
        done();
      });
    });
    
    it('should fire on `findAndModify`', function (done) {
      users
        .findAndModify({ _id: userId }, [['_id', 1]], { $set: { a: 3 } })
        .catch(done);

      observer.once('op', (id, query, op) => {
        e3 = { id, query, op };
        done();
      });
    });

    it('should fire on `findOneAndUpdate`', function (done) {
      users
        .findOneAndUpdate({ _id: userId }, { $set: { a: 4 } })
        .catch(done);

      observer.once('op', (id, query, op) => {
        e4 = { id, query, op };
        done();
      });
    });
    
    it('should not fire on `update` (`options.multi` query)', function(done) {
      let listener;
      
      users
        .update({ a: { $gt: 0 }}, { $set: { a: 5 } }, { multi: true })
        .then(r => {
          observer.removeListener('op', listener);
          done();
        })
        .catch(done);
        
        observer.once('op', listener = ((id, query, op) => {
          expect().fail('Should not have fired.');
        }));
    });
    
    it('should not fire when errors occur', function(done) {
      users
        .findOneAndUpdate({ _id: userId }, { $set: { a: [1, 2] } })
        .catch(done);
      observer.once('op', (id, query, op) => {
        users
          .findOneAndUpdate({ _id: userId }, { $pull: { a: 1 }, $push: { a: 3 } })
          .catch(err => {
            done();
          });
        observer.once('op', (id, query, op) => {
          expect().fail('Should not have fired.');
        });
      });
    });
    
    it('should have the right `id`', function() {
      expect(e1.id).to.equal(userId.toString());
      expect(e2.id).to.equal(userId.toString());
      expect(e3.id).to.equal(userId.toString());
      expect(e4.id).to.equal(userId.toString());
    });

    it('should omit `_id` from `query`', function() {
      expect(e1.query._id).to.be(undefined);
      expect(e2.query._id).to.be(undefined);
      expect(e3.query._id).to.be(undefined);
      expect(e4.query._id).to.be(undefined);
    });
    
    it('should have the right `op` value', function() {
      expect(e1.op).to.eql({ $set: { a: 1 } });
      expect(e2.op).to.eql({ $set: { a: 2 } });
      expect(e3.op).to.eql({ $set: { a: 3 } });
      expect(e4.op).to.eql({ $set: { a: 4 } });
    });
  });
});