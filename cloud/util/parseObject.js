/*******************************************************************************
*                                                                              *
*                                PARSE OBJECTS                                 *
*                                                                              *
*   This class contains all currently defined parse classes for consistency    *
*                          across multiple files                               *
 ******************************************************************************/
const Party = Parse.Object.extend("Party");
const Song = Parse.Object.extend("Song");
const PlaylistEntry = Parse.Object.extend("PlaylistEntry");
const SpotifyToken = Parse.Object.extend("SpotifyToken");
const Like = Parse.Object.extend("Like");
const SearchCache = Parse.Object.extend("SearchCache");

module.exports = {
  Party: Party,
  Song: Song,
  PlaylistEntry: PlaylistEntry,
  SpotifyToken: SpotifyToken,
  Like: Like,
  SearchCache: SearchCache
}
