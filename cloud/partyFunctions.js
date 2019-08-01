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

    if (user.get("currParty") != null) {
        throw 'Current user already has a party!'
    }

    const party = new parseObject.Party();
    party.set("admin", user);
    party.set("name", name);
    party.set("locationEnabled", true);
    party.set("joinCode", await util.generateJoinCode());
    party.set("userCount", 1);
    await party.save();

    user.set("currParty", party);
    await user.save(null, { useMasterKey: true });

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
    return await util.getPartyFromUser(user);
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

    if (user.get("currParty") != null) {
        throw 'Current user already has a party!';
    }

    const party = await util.getPartyByJoinCode(joinCode);
    if (party == null) {
        throw "A party with that join code does not exist!";
    }
    const userCount = await party.get("userCount");
    const userLimit = await party.get("userLimit");
    if (userCount >= userLimit) {
      throw "The party has reached its user limit!";
    }
    party.set("userCount", userCount + 1);
    await party.save();

    user.set("currParty", party)
    await user.save(null, { useMasterKey: true });
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
    if (party == null) {
        throw "User does not have a party";
    }

    // check if user is not the party's admin
    if (util.isUserAdmin(user, party)) {
        throw "Cannot leave party if user is admin";
    }
    const userCount = party.get("userCount");
    party.set("userCount", userCount - 1);
    await party.save();

    user.set("currParty", null);
    await user.save(null, { useMasterKey: true });

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
    if (!util.isUserAdmin(user, party)) {
        throw "User is not the admin of their party!"
    }

    // loop through clients in the party and remove them
    const userQuery = new Parse.Query(Parse.User);
    userQuery.equalTo("currParty", party);
    const members = await userQuery.find();
    for (const member of members) {
        member.set("currParty", null);
        await member.save(null, { useMasterKey: true });
    }

    util.cleanupPlaylistEntries(party);

    // remove the party
    user.set("currParty", null);
    await user.save(null, { useMasterKey: true });
    await party.destroy();

    return user;
});

Parse.Cloud.define("updatePartyLocation", async (request) => {
    const user = request.user;
    const location = request.params.location;
    const party = await util.getPartyFromUser(user);
    if (!util.isUserAdmin(user, party)) {
        throw "User is not the admin of their party!";
    }

    party.set("location", location);
    return await party.save();
});

Parse.Cloud.define("clearPartyLocation", async (request) => {
    const user = request.user;
    const party = await util.getPartyFromUser(user);
    if (!util.isUserAdmin(user, party)) {
        throw "User is not the admin of their party!";
    }

    party.set("location", null);
    return await party.save();
})

Parse.Cloud.define("savePartySettings", async (request) => {
    const user = request.user;
    const party = await util.getPartyFromUser(user);
    if (!util.isUserAdmin(user, party)) {
        throw "User is not the admin of their party!";
    }
    const locationEnabled = request.params.locationEnabled;
    if (locationEnabled != null) {
        party.set("locationEnabled", locationEnabled);
    }
    const name = request.params.name;
    if (name != null) {
        party.set("name", name);
    }
    const userLimit = request.params.userLimit;
    if (userLimit != null) {
        party.set("userLimit", userLimit);
    }
    const songLimit = request.params.songLimit;
    if (songLimit != null) {
        party.set("songLimit", songLimit);
    }
    await party.save();
    return party;
})


/**
 * This function sets the user's screen name
 */

Parse.Cloud.define("setScreenName", async (request) => {
    const user = request.user;
    const screenName = request.params.screenName;
    user.set("screenName", screenName);
    user.set("songsAdded", 0);
    await user.save(null, { useMasterKey: true });
    return screenName;
})

/**
 * This function returns the current user's screen name
 */
Parse.Cloud.define("getCurrentScreenName", async (request) => {
    const user = request.user;
    return await user.get("screenName");
})

Parse.Cloud.afterDelete(parseObject.Party, async (request) => {
  util.cleanupPlaylistEntries(request.object);
})
