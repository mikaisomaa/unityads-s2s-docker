// NODE.js S2S callback endpoint sample implementation
// Mika Isomaa 2017 for Unity Ads
// MIT License
// Create rewards for the user on the backend - register new players
// return reward IDs when player logs in
// use reward IDs as SID parameter
// When the server gets a S2S callback - release that reward for the player
// When player requests that reward, they're granted it on the backend and on the client
// Player logs in: ask for access token

//TODO:
// Users
// Item codes -- could be a table
// Query for item details in the other collection based on item code whenever player stores rewards
// heuristics: frequency caps, time stamps,
// challenge token for signing the rewards - new token for each ad impression. s2s payload is signed with token.
// Input validation - prevent blowing up the database
// Rate limiting per user
// Delay for user creation?
// ITEM CODE ISSUE: store them on the client only - backend could be agnostic?

var express = require('express');
var crypto = require('crypto');
var mongoose = require ('mongoose');
var nodeuuid = require('node-uuid');

const uuid = require('uuid');
const uuidv4 = require('uuid/v4');

mongoose.connect('mongodb://mongodb:27017/test');

var Schema = mongoose.Schema;
var app = express();

var inventoryItemSchema = new Schema({
  typecode:       String,
  oid:        String,
  hasBeenRetrieved:   Boolean
},{_id: false});

var userSchema = new Schema({
  name:            String,
  playerToken:      String,
  passToken:       String,
  cyclicToken:      String,
  inventory:       [inventoryItemSchema]
});

var User = mongoose.model('User',userSchema);

app.listen(process.env.PORT || 1337);

// returns HMAC signature for the given parameters
function getHMAC(parameters, secret) {
  var sortedParameterString = sortParams(parameters);
  return crypto.createHmac('md5', secret).update(sortedParameterString).digest('hex');
}

// rehashes the token
// TODO: Don't use cyclicity - more trust in pure random and cycling doesn't make sense and might only expose a vulnerability
function getNewHash(oldstring, secret){
  return crypto.createHmac('md5', secret).update(oldstring).digest('hex');
}

// Sorts the parameters alphabetically
function sortParams(parameters) {
  var params = parameters || {};
  return Object.keys(params)
    .filter(key => key !== 'hmac')
    .sort()
    .map(key => params[key] === null ? `${key}=` : `${key}=${params[key]}`)
    .join(',');
}

// TOKEN1: 98as7df9a8dsf7s9a8df7
// Checksum made with MD5(TOKEN1 + salt)
// SID should have: token_checksum_otherdatalikeitemtypecode
function delimitParams(parametrs, callback)
{
  // 0 : token
  // 1 : checksum = hash(token + secret)
  // 2 : item type code
  callback(parameters.split("_"));
}

// Hands out a unique UUID v4
function getNewToken(callback) {
  var randomToken = nodeuuid.v4();
  User.findOne({playerToken:randomToken}, function(err, token) {
    if (err) {
      return callback(true);
    } else {
      if (token != undefined) { // uuid is already taken
        getNewToken(callback); // try again
      } else {
        callback(false,randomToken); //  return uuid/token
      }
    }
  });
}

// GET SIGN IN TOKEN
app.get('/challenge', function (req,res) {
  getNewToken(function (err, newToken) {
    if (err) {
      // error handling. maybe:
      // console.log('DATABASE ERROR');
      // res.status(200).send('ERROR');
    } else {
      console.log('NEW TOKEN ' + newToken);
      res.status(200).send(newToken);
    }
  });
});

// Login endpoint
app.get('/login', function (req,res) {
  // login with playerToken + currentRewardToken
  // return currentRewardToken + json with items

  var playerID = req.query.playerID;
  var rewardToken  = req.query.token;

  User.findOne({playerToken:playerID, passToken:rewardToken}, function(err, doc) {
    if (err) {
      res.status(500).send('ERROR!');
    } else {
      if (doc != null) {
        var rewards = [];
        var hasRewards = false;
        for (var i = 0; i < doc.inventory.length; i++)
        {
          var currentItem = doc.inventory[i];
          hasRewards = true;
          rewards.push(currentItem);
        }
        if (hasRewards)
        {
          res.status(200).send(rewards);
        } else {
          res.status(200).send(doc.cyclicToken);
        }
      } else {
        console.log('Reward ID ' + rewardId);
        res.status(500).send('NOT FOUND!');
      }
    }
  });
  // login using access token
  // return items and rewardID
});

// Call URL/getreward to fetch the stored rewards
// Call this from the game client
app.get('/getreward', function (req, res) {

  // login with playerToken + currentRewardToken
  // return currentRewardToken + json with items

  var playerID = req.query.playerID;
  var rewardToken  = req.query.token;

  User.findOne({playerToken:playerID, passToken:rewardToken}, function(err, doc) {
    if (err) {
      res.status(500).send('ERROR!');
    } else {
      if (doc != null) {
        var rewards = [];
        var hasRewards = false;
        for (var i = 0; i < doc.inventory.length; i++)
        {
          var currentItem = doc.inventory[i];
          if (!currentItem.hasBeenRetrieved)
          {
            hasRewards = true;
            rewards.push(currentItem);
            currentItem.hasBeenRetrieved = true;
          }
        }
        if (hasRewards)
        {
          doc.cyclicToken = uuid.v4();
          doc.save();
          res.status(200).send(rewards + doc.cyclicToken);
        }
      } else {
        console.log('Reward ID ' + rewardId);
        res.status(500).send('NOT FOUND!');
      }
    }
  });
});

// Store the reward - Unity Ads S2S callbacks will call this
app.get('/storerewards', function (req, res) {
  console.log("New callback: " + req.query.sid + " " + req.query.oid + " " + req.query.hmac);

  //var sid = req.query.sid;
  //var oidi = req.query.oid;
  var hmacci = req.query.hmac;
  //var payload = delimitParams(req.query.sid);
  var payload = req.query.sid.split("_");
  // do the hash check with payload[0] and payload[1]
  var clientSecret = process.env.GAMECLIENTSECRET || 'gameclientsecret12341234';
  var newchecksum = getNewHash(payload[0], clientSecret);
  
  console.log("NEW S2S! - " + payload[0] + " - " + payload[1] + " - " + newchecksum );
  if (newchecksum === payload[1])
  {
    // Passed - store for player with token
    var Useri = {
      playerToken : payload[0], currentRewardToken : payload [1]
    };
    // if player doesn't exist - create new player
    var secret = process.env.UNITYADSSECRET || 'xyzKEY';
    console.log("secret: " + secret);
    var newHmac = getHMAC(req.query, secret);
    console.log("HMAC: " + newHmac + " Hmac2: " + hmacci)
    if (hmacci === newHmac) {
    // Signatures match
    console.log("hmac valid")
      // Check for duplicate oid here (player already received reward) and return 403 if it exists
      User.findOne({playerToken:Useri.playerToken}, function(err, doc) {
        // We're dealing with a whole new user
        if (err) {
          var newUser = new User(Useri);
          newUser.playerToken = Useri.playerToken;
          newUser.save();
          // If there's no duplicate - give virtual goods to player. Return 500 if it fails.
          res.status(200).send('1');
        } else {
          // Save the oid for duplicate checking. Return 500 if it fails.
          // doc.length means it was found and there's something there

          var found = false;

          if (doc != null && doc.inventory != null && doc.inventory.length > 0) {
            // Go through the inventory array and check for duplicates
            for ( i=0 ; i<doc.inventory.length ; i++)
            {
              if (doc.inventory[i].oid === req.query.oid)
              {
                found = true;
                res.status(500).send('Duplicate order');
                break;
              }
            }
            // TODO: do this logic better. Check if there's duplicates and if there isn't, add item (below)
          }
        }
        // User was found, and it didn't have this reward yet
        if (!found) {
          var newUser = new User(doc);
          // TODO: Add item table, add items to item table
          newUser.playerToken = Useri.playerToken;
          newUser.inventory.push({
            typecode: payload[2],
            oid: req.query.oid,
            hasBeenRetrieved: false
          });
          newUser.save();
          // Callback passed, return 200 and include '1' in the message body
          res.status(200).send('1');
        }
      });
      //console.log(printUser(Useri.oid));
    } else {
    // no match
      res.sendStatus(403);
    }
    // TODO: Move the stuff from below to around this to first check if the hmac is valid
    // Then:
      // First: check if there exists token
      // If not: check if token hash matches signature
      //   If not: FU, IF: create new user with that token
      // If: create a new token for the player
  } else {
    res.status(400).send('WTF WAS THIS QUERY?!\n');
  }
  // Save the secret as an environment variable. If none is set, default to xyzKEY
});
