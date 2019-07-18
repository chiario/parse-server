const util = require('./util/utilFunctions.js')
const parseObject = require('./util/parseObject.js')

/**
 * This function creates a new party with the current user as the owner
 *
 * There are no parameters for this function
 * @return the new party that was created
 */
Parse.Cloud.define("createParty", async (request) => {
  const user = request.user;

  if(user.get("currParty") != null) {
    throw 'Current user already has a party!'
  }

  const party = new parseObject.Party();
  party.set("admin", user);
  await party.save();

  user.set("currParty", party);
  await user.save(null, {useMasterKey:true});

  return party;
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
 * This function adds the current user to an existing party
 *
 * @param partyId the Parse objectId of the party to join
 * @return the party that was joined
 * @throws an error if the current user is already in a party
 */
Parse.Cloud.define("joinParty", async (request) => {
  const user = request.user;
  const partyId = request.params.partyId;

  if(user.get("currParty") != null) {
    throw 'Current user already has a party!';
  }

  const party = await util.getPartyById(partyId)
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
