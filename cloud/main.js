const spotify = require('./spotify.js')

const Party = Parse.Object.extend("Party");
const Song = Parse.Object.extend("Song");
const PlaylistEntry = Parse.Object.extend("PlaylistEntry");
const SpotifyToken = Parse.Object.extend("SpotifyToken");

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

  const party = new Party();
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
    return await getPartyFromUser(user);
  } catch(e) {
    return null;
  }
});

/**
 * This function deletes the current user's party if it exists and the user is
 * the party's admin
 *
 * There are no parameters for this function
 */
Parse.Cloud.define("deleteParty", async (request) => {
  const user = request.user;
  const party = await getPartyFromUser(user);

  // check if user is party's admin
  verifyUserIsAdmin(user, party);

  // remove the party
  // TODO: loop through clients in the party and remove them
  user.set("currParty", null);
  await user.save(null, {useMasterKey:true});
  await party.destroy();

  return user;
});

/**
 * This function adds a song to the current user's party
 *
 * @param artist the song's artist from Spotify API
 * @param title the song's title from Spotify API
 * @param album the song's album name from Spotify API
 * @param artUrl the song's album art URL from Spotify API
 * @param spotifyId the song's Spotify ID from Spotify API
 * @throws error if the user is not in a party or the song is already in the
 *         current party's playlist
* @return the playlist entry that was added
 */
Parse.Cloud.define("addSong", async (request) => {
  const user = request.user;
  const party = await getPartyFromUser(user);
  const song = new Song();
  song.set("artist", request.params.artist);
  song.set("title", request.params.title);
  song.set("album", request.params.album);
  song.set("artUrl", request.params.artUrl);
  song.set("spotifyId", request.params.spotifyId);

  // Save the song to the database
  const cachedSong = await saveSong(song);

  if(await isSongInParty(cachedSong, party)) {
    // TODO: maybe like the song instead?
    throw 'Song is already in the playlist!';
  } else {
    // Add song to party
    const entry = new PlaylistEntry();
    entry.set("song", cachedSong);
    entry.set("party", party);
    entry.set("score", 0); // TODO: calculate this
    return await entry.save();
  }
});

/**
 * This function removes a song from the current user's party
 *
 * @param spotifyId the song's Spotify ID from Spotify API
 * @throws error if the user is not the admin of their current party or if the
 *         song isn't in the party's playlist
 * @return the playlist entry that was removed
 */
Parse.Cloud.define("removeSong", async (request) => {
  const user = request.user;
  const party = await getPartyFromUser(user);
  verifyUserIsAdmin(user, party);

  const song = await getSongById(request.params.spotifyId);

  if(await isSongInParty(song, party)) {
    const entry = await getPlaylistEntry(song, party);
    return await entry.destroy();
  } else {
    throw 'Song is not in the playlist!';
  }
});

/**
 * This function removes a song from the current user's party
 *
 * There are no parameters for this function
 * @throws error if the user is not in a party
 * @return a list of playlist entries
 */
Parse.Cloud.define("getPlaylist", async (request) => {
  const user = request.user;
  const party = await getPartyFromUser(user);

  const playlistQuery = new Parse.Query(PlaylistEntry);
  playlistQuery.equalTo("party", party);
  playlistQuery.descending("score");
  playlistQuery.include("song");
  return await playlistQuery.find();
});

/**
 * This function searches spotify for a track
 *
 * @param query the search query
 * @param [limit = 20] the number of results to get, default 20
 * @throws error if the user is not in a party
 * @return a list of songs returned by the search
 */
Parse.Cloud.define("search", async (request) => {
  const token = await getSpotifyToken();
  const query = request.params.query;
  const limit = request.params.limit == null ? 20 : request.params.limit;

  const result = await spotify.search(token, query, limit);
  return await formatSearchResult(result);
});

/*******************************************************************************
*                                                                              *
*                               HELPER FUNCTIONS                               *
*                                                                              *
 ******************************************************************************/

/**
 * Gets the party the user is currently part of.  If no such party exists,
 * throws an error.
 *
 * @param user the user whose party will be obtained
 * @throws error if the user is not in a party
 */
async function getPartyFromUser(user) {
  // check if the current user has a party
  const partyPointer = user.get("currParty");
  if(partyPointer == null) {
    throw 'Current user does not have a party!'
  }

  // get the user's current party
  const query = new Parse.Query(Party);
  const party = await query.get(partyPointer.id);

  // check if party exists
  if(party == null) {
    throw 'Current user\'s party does not exist!'
  }
  return party;
}

/**
 * Checks if a song is already in a party's playlist
 *
 * @param song the song to check
 * @param party the party whose playlist will be checked for the song
 * @return true if the party's playlist contains the song, false otherwise
 */
async function isSongInParty(song, party) {
  const playlistQuery = new Parse.Query(PlaylistEntry);
  playlistQuery.equalTo("party", party);
  playlistQuery.equalTo("song", song);
  return await playlistQuery.count() > 0
}

/**
 * Returns a song in a party's playlist
 *
 * @param song the song to check
 * @param party the party whose playlist will be checked for the song
 * @return true if the party's playlist contains the song, false otherwise
 */
async function getPlaylistEntry(song, party) {
  const playlistQuery = new Parse.Query(PlaylistEntry);
  playlistQuery.equalTo("party", party);
  playlistQuery.equalTo("song", song);
  return await playlistQuery.first();
}

/**
 * Returns a song with the specified Spotify ID.
 *
 * @param spotifyId the Spotify ID of the song to obtain
 * @return a song from the database with the specified Spotify ID
 * @throws error if there is no song in the database with the specified Spotify
 *         ID
 */
async function getSongById(spotifyId) {
  const songQuery = new Parse.Query(Song);
  songQuery.equalTo("spotifyId", spotifyId);
  return await songQuery.first();
}

/**
 * If a song with the same spotifyId already exists in the database, returns a
 * reference to the existing song in the database.
 *
 * If no song in the database has the same spotifyId, saves the song to the
 * database
 *
 * @param song a song to save to the database
 * @return a reference to a song in the database with the same spotifyId
 */
async function saveSong(song) {
  // Check if a song with the same spotifyId is already in the database
  const songQuery = new Parse.Query(Song);
  songQuery.equalTo("spotifyId", song.get("spotifyId"));
  var cachedSong;
  if(await songQuery.count() == 0) {
    // If not, save the song to the database
    cachedSong = await song.save();
  } else {
    // If so, return the song already in the database
    cachedSong = await songQuery.first();
  }
  return cachedSong;
}

/**
 * Checks if the user is the admin of the specified party
 *
 * @param user the user whose privileges should be checked
 * @param party the party to check the user's privileges for
 * @throws error if the user is not the party's admin
 */
function verifyUserIsAdmin(user, party) {
  if(party.get("admin") == null || party.get("admin").id != user.id) {
    throw 'Current user is not their party\'s admin!'
  }
}

/**
 * Gets a valid Spotify access token.  Checks to see if there is already a valid
 * access token cached and if not, creates a new one.
 *
 * There are no paramters for this function.
 * @return a spotify access token string
 */
async function getSpotifyToken() {
  // Check to see if a token already exists
  const tokenQuery = new Parse.Query(SpotifyToken);
  tokenQuery.descending("createdAt");
  if(await tokenQuery.count() > 0) {
    const token = await tokenQuery.first();

    // If a token already exists, see if it has expired yet
    const currentDate = new Date();
    const tokenDate = token.get("createdAt");
    const diffSecs = (currentDate.getTime() - tokenDate.getTime()) / 1000;
    // Refresh the token 1 minute before it expires
    if(diffSecs < token.get("expiresIn") - 60) {
      return token.get("value");
    } else {
      // Destroy the token if it is expired
      await token.destroy();
    }
  }

  // Otherwise, create a new token
  const tokenRaw = await spotify.getAccessToken();
  var token = new SpotifyToken();
  token.set("value", tokenRaw.access_token);
  token.set("type", tokenRaw.token_type);
  token.set("expiresIn", tokenRaw.expires_in);
  await token.save();
  return token.get("value");
}

/**
 * Formats the response from a Spotify search into an array of song objects.
 *
 * @param result the JSON result from a Spotify search request
 * @return a list of song objects
 */
async function formatSearchResult(result) {
  var formattedResult = [];
  for(const track of result.tracks.items) {
    // Create a new song from the result json
    const song = new Song();
    song.set("spotifyId", track.id);
    song.set("artist", track.artists[0].name);
    song.set("title", track.name);
    song.set("album", track.album.name);
    song.set("artUrl", track.album.images[0].url);

    // Add it to the return array
    formattedResult.push(await saveSong(song));
  }
  return formattedResult;
}
