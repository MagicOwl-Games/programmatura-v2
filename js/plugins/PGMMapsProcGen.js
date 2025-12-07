/*:
 * @plugindesc Generate random dungeons, being responsible for all the stages of the game.
 * @author Lucas "Bardo" Martins.
 * 
 * @help
 * Plugin Commands:
 *  ProcGen GenerateMap
 *  - Generate a random map with the defined parameters.
 *  - The player is positioned randomly in the map.
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

  // Basic internal setup
  const MIN_ROOM_SIZE = 5;
  const MAX_ROOM_SIZE = 9;
  const MAX_ATTEMPTS = 45;  // Max attempts the algorithm will try to place a room.
  const MAX_ROOM_ASPECT_RATIO = 1.8; // Max width/height ratio, avoid thin rooms.
  const ROOM_GAP = 1; // Minimum gap between rooms.

  // Room Structure
  function Room(x, y, width, height) {
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
    this.centerX = Math.floor(x + width / 2);
    this.centerY = Math.floor(y + height / 2);
  }

  // Check the intersection between two rooms and guarantees a minimum gap.
  function isRoomsToClose(candidateRoom, existingRoom, gap = ROOM_GAP) {
    const eXGapped = existingRoom.x - gap;
    const eYGapped = existingRoom.y - gap;
    const eWidthGapped = existingRoom.width + (gap * 2);
    const eHeightGapped = existingRoom.height + (gap * 2);
    
    return (
      candidateRoom.x < eXGapped + eWidthGapped &&
      candidateRoom.x + candidateRoom.width > eXGapped &&
      candidateRoom.y < eYGapped + eHeightGapped &&
      candidateRoom.y + candidateRoom.height > eYGapped
    );
  }

  // Helpers for the tiles
  function clamp(value, a, b) {
    return Math.max(a, Math.min(b, value));
  }

  function mapTileIndex(width, height, x, y, z) {
    return (z * width * height) + (y * width) + x;
  }

  function getMapDataArray() {
    if (!$gameMap || typeof $gameMap.data !== 'function') return null;
    return $gameMap.data();
  }

  function setTile(layer, x, y, tileId) {
    const data = getMapDataArray();
    if (!data) return;
    
    const mapWidth = $gameMap.width();
    const mapHeight = $gameMap.height();

    if (x < 0 || y < 0 || x >= mapWidth || y>= mapHeight) return;

    const index = mapTileIndex(mapWidth, mapHeight, x, y, layer);

    data[index] = tileId;
  }

  function getTileIdAt(x, y, layer) {
    return $gameMap.tileId(x, y, layer);
  }

  function refreshMap() {
    const scene = SceneManager._scene;

    if (scene && scene._spriteset && scene._spriteset._tilemap) {
      scene._spriteset._tilemap.refresh();
    }

    $gameMap.requestRefresh();
  }

  function getRandomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  // Carve rooms and coorridors
  function carveRoom(room, floorId) {
    for (let y = room.y; y < room.y + room.height; y++) {
      for (let x = room.x; x < room.x + room.width; x++) {
        setTile(0, x, y, floorId);
      }
    }
  }

  function carveHorizontalCorridor(x1, x2, y, floorId) {
    const start = Math.min(x1, x2);
    const end = Math.max(x1, x2);

    for (let x = start; x <= end; x++) {
      setTile(0, x, y, floorId);
    }
  }

  function carveVerticalCorridor(y1, y2, x, floorId) {
    const start = Math.min(y1, y2);
    const end = Math.max(y1, y2);

    for (let y = start; y <= end; y++) {
      setTile(0, x, y, floorId);
    }
  }

  function connectRooms(roomA, roomB, floorId) {
    // L-shaped corridors. It randomly chooses horizontal-first or vertical-first.
    if (Math.random() < 0.5) {
      carveHorizontalCorridor(roomA.centerX, roomB.centerX, roomA.centerY, floorId);
      carveVerticalCorridor(roomA.centerY, roomB.centerY, roomB.centerX, floorId);
    } else {
      carveVerticalCorridor(roomA.centerY, roomB.centerY, roomA.centerX, floorId);
      carveHorizontalCorridor(roomA.centerX, roomB.centerX, roomB.centerY, floorId);
    }
  }

  // Rooms generation: multiple rooms, connected by corridors.

  function generateDungeon() {
    if (getMapDataArray() === null) {
      console.warn('[PGMMapsProcGen] $gameMap is not ready.]');
      return;
    }

    const mapWidth = $gameMap.width();
    const mapHeight = $gameMap.height();

    // Get tile IDs from the tileset. Layer 0 = tileset A
    const wallId = getTileIdAt(0, 0, 0);
    const floorId = getTileIdAt(1, 0, 0);
    const doorId = getTileIdAt(2, 0, 0);

    if (!wallId || !floorId || !doorId || wallId === floorId || wallId === doorId || floorId === doorId) {
      console.warn('[PGMMapsProcGen] Ivalid tiles. Check positions (0, 0), (1, 0) and (2, 0) (tileset A).');
      return;
    }

    // Log if the map is too small (less than 8x8);
    if (mapWidth < 8 || mapHeight < 8) {
      console.log('[PGMMapsProcGen] The map is smaller than 8x8. Please, use a bigger map.');
    }

    const mapArea = mapWidth * mapHeight;
    const dynamicTargetRooms = clamp(Math.floor(mapArea / 100), 2, 6);

    console.log({
      mapWidth,
      mapHeight,
      mapArea,
      dynamicTargetRooms,
    });

    // Fill the whole map with walls.
    // NOTE: I tried with a 'while' loop, but it didn't work as expected.
    // I don't know why, but it works fine with 'for' loops.
    for (let y = 0; y < mapHeight; y++) {
      for (let x = 0; x < mapWidth; x++) {
        setTile(0, x, y, wallId)
      }
    }


    // Create multiple rooms
    const rooms = [];
    let numberOfAttempts = 0;

    while (rooms.length < dynamicTargetRooms && numberOfAttempts < MAX_ATTEMPTS) {
      const maxWidth = Math.min(MAX_ROOM_SIZE, mapWidth - 2);
      const maxHeight = Math.min(MAX_ROOM_SIZE, mapHeight - 2);

      if (maxWidth < MIN_ROOM_SIZE || maxHeight < MIN_ROOM_SIZE) {
        console.warn('[PGMMapsProcGen] The map is too small for the defined room sizes.');
        break;
      }
       
      const roomWidth = getRandomInt(MIN_ROOM_SIZE, maxWidth);
      const roomHeight = getRandomInt(MIN_ROOM_SIZE, maxHeight);

      // Avoid thin rooms.
      const aspect = roomWidth / roomHeight;
      if (aspect > MAX_ROOM_ASPECT_RATIO || aspect < (1 / MAX_ROOM_ASPECT_RATIO)) {
        // 3x10/10x3 rooms, for example, are not allowed.
        continue;
      }

      const roomX = getRandomInt(1, mapWidth - roomWidth - 1);
      const roomY = getRandomInt(1, mapHeight - roomHeight - 1);

      const newRoom = new Room(roomX, roomY, roomWidth, roomHeight);

      // Check for any intersection within the existing rooms.
      let itIntersects = false;
      for (let i = 0; i < rooms.length; i++) {
        if (isRoomsToClose(newRoom, rooms[i])) {
          itIntersects = true;
          break;
        }
      }

      if (!itIntersects) {
        rooms.push(newRoom);
      }

      numberOfAttempts++;
    }

    if (rooms.length === 0) {
      console.warn('[PGMMapsProcGen] It was impossible to place any rooms. Try changing the following values: TARGET_ROOMS, MIN_ROOM_SIZE, MAX_ROOM_SIZE, MAX_ATTEMPTS or the map size');
      refreshMap();
      return;
    }

    for (let i = 0; i < rooms.length; i++) {
      carveRoom(rooms[i], floorId);
      connectRooms(rooms[rooms.length - 1], rooms[i], floorId);
    }


    // Place the player in the first room created.
    // TODO: Put the player in the farthest position from the door.
    const firstRoom = rooms[0];
    let exitRoom = rooms[rooms.length - 1] || null; // initial value of the exit room (the farthest from the first).
    $gameMap._procGenExitX = null;
    $gameMap._procGenExitY = null;

    if (firstRoom && rooms.length > 1) {
      let bestDistance = -1; // initial value for the best distance. It makes sure any distance is better.

      for (let i = 0; i < rooms.length; i++) {
        const room = rooms[i];
        // const distance = Math.hypot(room.centerX - firstRoom.centerX, room.centerY - firstRoom.centerY);
        const distance = Math.abs(room.centerX - firstRoom.centerX) + Math.abs(room.centerY - firstRoom.centerY);

        if (distance > bestDistance) {
          // We assign the farthest room found so far so the loop can keep checking based on the new distance.
          bestDistance = distance;
          exitRoom = room;
        }
      }
    }

    $gamePlayer.locate(firstRoom.centerX, firstRoom.centerY);

    if (exitRoom && doorId) {
      setTile(0, exitRoom.centerX, exitRoom.centerY, doorId);
      // setTile(0, 2, 0, wallId); // Clear the door tile to avoid having a door in the tileset.
      $gameMap._proGenExitX = exitRoom.centerX;
      $gameMap._procGenExitY = exitRoom.centerY;
    }

    // TODO: Place random enemies.

    // Update map
    refreshMap();//
    console.log('[PGMMapsProcGen] Map generated successfully.');
  }

  // Transfer to the next floor.
  function markNextFloorAndTransfer() {
    if (!$gameMap) return;
    if ($gameMap._procGenNextFloor) return;
    $gameMap._procGenNextFloor = true;

    // 'reserveTransfer' using the same mapId so the map has a safe reload.
    $gamePlayer.reserveTransfer($gameMap.mapId(), $gamePlayer.x, $gamePlayer.y, $gamePlayer.direction(), 0);
  }

  // Detects when the player reaches the exit.
  const _Scene_Map_onMapLoaded = Scene_Map.prototype.onMapLoaded;
  Scene_Map.prototype.onMapLoaded = function() {
    _Scene_Map_onMapLoaded.call(this);

    if ($gameMap && $gameMap._procGenNextFloor) {
      generateDungeon();
      $gameMap._procGenNextFloor = false;
    }
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