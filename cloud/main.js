const parseObject = require('./util/parseObject.js')
const spotifyUtil = require('./util/spotifyUtil.js')
const util = require('./util/utilFunctions.js')
require('./partyFunctions.js')
require('./songFunctions.js')

/**
 * This function removes a song from the current user's party
 *
 * There are no parameters for this function
 * @throws error if the user is not in a party
 * @return a list of playlist entries
 */
Parse.Cloud.define("getPlaylist", async (request) => {
  const user = request.user;
  const party = await util.getPartyFromUser(user);

  const playlistQuery = new Parse.Query(parseObject.PlaylistEntry);
  playlistQuery.equalTo("party", party);
  playlistQuery.descending("score");
  playlistQuery.include("song");
  return await playlistQuery.find();
});
