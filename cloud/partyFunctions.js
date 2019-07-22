/*******************************************************************************
*                                                                              *
*                               PARTY FUNCTIONS                                *
*                                                                              *
*    This class contains all cloud functions that manipulate a party object    *
*                                                                              *
 ******************************************************************************/

const util = require('./util/utilFunctions.js')
const parseObject = require('./util/parseObject.js')

/**
 * This function creates a new party with the current user as the owner
 *
 * @param name the name of the party as set by the current user
 * @return the new party that was created
 */
Parse.Cloud.define("createParty", async (request) => {
  const user = request.user;
  const name = request.params.name;

  if(user.get("currParty") != null) {
    throw 'Current user already has a party!'
  }

  const party = new parseObject.Party();
  party.set("admin", user);
  party.set("name", name);
  party.set("joinCode", await util.generateJoinCode());
  await party.save();

  user.set("currParty", party);
  await user.save(null, {useMasterKey:true});

  return party;
});

/**
 * This function sets the user's current party name
 *
 * @throws an error if the user isn't the admin of the current party
 * @param name the new name of the party as set by the user
**/
Parse.Cloud.define("setPartyName", async (request) => {
  const user = request.user;
  const party = await util.getPartyFromUser(user);

  if(!util.isUserAdmin(user, party)) {
    throw "Cannot change party name if user is not admin!";
  }

  party.set("name", name);
  await party.save();

  return user;
});

/**
 * This function returns the party the current user is part of
 *
 * There are no parameters for this function
 * @return the current user's party if it exists, null if it does not
 */
Parse.Cloud.define("getCurrentParty", async (request) => {
  const user = request.user;
  try {
    return await util.getPartyFromUser(user);
  } catch(e) {
    return null;
  }
});

/**
 * This function returns nearby parties ordered closest to farthest
 *
 * @param location the location to get parties near to
 * @param [maxDistance = 0.5] the max distance in miles to search
 * @return a list of parties within maxDistance miles of the location
 */
Parse.Cloud.define("getNearbyParties", async (request) => {
  const location = request.params.location;
  const maxDistance = request.params.maxDistance == null
                            ? 0.5 : request.params.maxDistance;
  const partyQuery = new Parse.Query(parseObject.Party);
  partyQuery.withinMiles("location", location, maxDistance, true);
  return await partyQuery.find();
});

/**
 * This function adds the current user to an existing party
 *
 * @param partyId the Parse objectId of the party to join
 * @param joinCode the join code of the party to join
 * @return the party that was joined
 * @throws an error if the current user is already in a party
 */
Parse.Cloud.define("joinParty", async (request) => {
  const user = request.user;
  const joinCode = request.params.joinCode;
  const partyId = request.params.partyId;

  if(user.get("currParty") != null) {
    throw 'Current user already has a party!';
  }

  var party;
  if(joinCode != null) {
    party = await util.getPartyByJoinCode(joinCode);
  } else {
    party = await util.getPartyById(partyId);
  }

  user.set("currParty", party)
  await user.save(null, {useMasterKey:true});

  return party;
});

/**
 * This function removes the current user from their party
 *
 * There are no parameters for this function
 * @throws an error if the current user is not in a party or if the user is the
 *         admin of their current party
 */
Parse.Cloud.define("leaveParty", async (request) => {
  const user = request.user;

  const party = await util.getPartyFromUser(user);

  // check if user is not the party's admin
  if(util.isUserAdmin(user, party)) {
    throw "Cannot leave party if user is admin";
  }

  user.set("currParty", null);
  await user.save(null, {useMasterKey:true});

  return user;
});

/**
 * This function deletes the current user's party if it exists and the user is
 * the party's admin
 *
 * There are no parameters for this function
 */
Parse.Cloud.define("deleteParty", async (request) => {
  const user = request.user;
  const party = await util.getPartyFromUser(user);

  // check if user is party's admin
  if(!util.isUserAdmin(user, party)) {
    throw "User is not the admin of their party!"
  }

  // loop through clients in the party and remove them
  const userQuery = new Parse.Query(Parse.User);
  userQuery.equalTo("currParty", party);
  const members = await userQuery.find();
  for(const member of members) {
    member.set("currParty", null);
    await member.save(null, {useMasterKey:true});
  }

  // remove the party
  user.set("currParty", null);
  await user.save(null, {useMasterKey:true});
  await party.destroy();

  return user;
});

Parse.Cloud.define("updatePartyLocation", async (request) => {
  const user = request.user;
  const location = request.params.location;
  const party = await util.getPartyFromUser(user);
  if(!util.isUserAdmin(user, party)) {
    throw "User is not the admin of their party!";
  }

  party.set("location", location);
  return await party.save();
});
