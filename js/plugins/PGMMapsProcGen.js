/*:
 * @plugindesc Generate random dungeons, being responsible for all the stages of the game.
 * @author Lucas "Bardo" Martins.
 * 
 * @help
 * Plugin Commands:
 *  ProcGen GenerateMap
 *  - Generate a random map with the defined parameters.
 *  
 * How to use:
 * 1. Create a map in your project
 * 2. In the (0, 0) position, put a tile that will represent the WALL
 * 3. In the (1, 0) position, put a tile that will represent the FLOOR
 * 4. In the (2, 0) position, put a tile that will represent the DOOR
 * 5. In the (3, 0) position, define the initial position of the player.
 * 6. Create an event anywhere in the map and call the plugin command: "ProcGen GenerateMap"
 */

(function () {
  'use strict';

  const PLUGIN_NAME = 'PGMMapsProcGen';

  // Helpers for the tiles
  function mapTileIndex(width, height, x, y, z) {
    return (z * width * height) + (y * width) + x;
  }

  function setTile(layer, x, y, tileId) {
    const mapWidth = $gameMap.width();
    const mapHeight = $gameMap.height();

    if (x < 0 || y < 0 || x >= mapWidth || y>= mapHeight) return;

    const data = $gameMap.data();
    if (!data) return;

    const index = mapTileIndex(mapWidth, mapHeight, x, y, layer);

    data[index] = tileId;
  }

  function refreshMap() {
    const scene = SceneManager._scene;

    if (scene && scene._spriteset && scene._spriteset._tilemap) {
      scene._spriteset._tilemap.refresh();
    }

    $gameMap.requestRefresh();
  }

  // Simple generation: room in the middle

  function generateDungeon() {
    if (!$gameMap || !$gameMap.data()) {
      console.warn('[PGMMapsProcGen] $gameMap is not ready.]');
      return;
    }

    const mapWidth = $gameMap.width();
    const mapHeight = $gameMap.height();

    // Get tile IDs from the tileset. Layer 0 = tileset A
    const wallId = $gameMap.tileId(0, 0, 0);
    const floorId = $gameMap.tileId(1, 0, 0);
    const doorId = $gameMap.tileId(2, 0, 0);

    if (!wallId || !floorId || !doorId || wallId === floorId || wallId === doorId || floorId === doorId) {
      console.warn('[PGMMapsProcGen] Ivalid tiles. Check positions (0, 0), (1, 0) and (2, 0) (tileset A).');
      return;
    }

    // Fill the whole map with walls.
    // NOTE: I tried with a 'while' loop, but it didn't work as expected.
    // I don't know why, but it works fine with 'for' loops.
    for (let y = 0; y < mapHeight; y++) {
      for (let x = 0; x < mapWidth; x++) {
        setTile(0, x, y, wallId)
      }
    }

    // Create a room in the middle of the dungeon;
    const roomWidth = Math.max(4, Math.floor(mapWidth / 2));
    const roomHeight = Math.max(4, Math.floor(mapHeight / 2));
    const roomX = Math.floor((mapWidth - roomWidth) / 2);
    const roomY = Math.floor((mapHeight - roomHeight) / 2);

    for (let y = roomY; y < roomY + roomHeight; y++) {
      for (let x = roomX; x < roomX + roomWidth; x++) {
        setTile(0, x, y, floorId);
      }
    }

    refreshMap();//
    console.log('[PGMMapsProcGen] Map generated successfully.');
  }

  const _pluginCommand = Game_Interpreter.prototype.pluginCommand;
  Game_Interpreter.prototype.pluginCommand = function(command, args) {
    _pluginCommand.call(this, command, args);

    if (command === 'ProcGen') {
      const subCommand = (args[0] || '').toLowerCase();

      if (subCommand === 'generatemap') {
        generateDungeon();
      }
    }
  };
})()