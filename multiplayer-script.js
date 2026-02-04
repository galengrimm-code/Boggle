// ============================================
// MULTIPLAYER BOGGLE - Google Apps Script
// Add this code to your existing Apps Script
// ============================================

// Add a new sheet tab called "Rooms" with columns:
// A: roomId | B: boardCode | C: players | D: status | E: words | F: startTime | G: created

function doGet(e) {
  const action = e.parameter.action;

  // ... keep your existing actions (check, save, leaderboard) ...

  // ============================================
  // MULTIPLAYER ACTIONS
  // ============================================

  if (action === 'createRoom') {
    return handleCreateRoom(e);
  }

  if (action === 'joinRoom') {
    return handleJoinRoom(e);
  }

  if (action === 'pollRoom') {
    return handlePollRoom(e);
  }

  if (action === 'startRoom') {
    return handleStartRoom(e);
  }

  if (action === 'submitWords') {
    return handleSubmitWords(e);
  }

  if (action === 'getResults') {
    return handleGetResults(e);
  }

  if (action === 'leaveRoom') {
    return handleLeaveRoom(e);
  }

  // ... rest of your existing code ...
}

// Generate a 6-character room code
function generateRoomId() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Removed confusing chars (0,O,1,I)
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// Get Rooms sheet
function getRoomsSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName('Rooms');
  if (!sheet) {
    sheet = ss.insertSheet('Rooms');
    sheet.appendRow(['roomId', 'boardCode', 'players', 'status', 'words', 'startTime', 'created']);
  }
  return sheet;
}

// Find room row by ID
function findRoomRow(sheet, roomId) {
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === roomId) {
      return i + 1; // 1-indexed for sheets
    }
  }
  return -1;
}

// Clean up old rooms (older than 1 hour)
function cleanupOldRooms(sheet) {
  const data = sheet.getDataRange().getValues();
  const oneHourAgo = Date.now() - (60 * 60 * 1000);
  const rowsToDelete = [];

  for (let i = data.length - 1; i >= 1; i--) {
    const created = data[i][6];
    if (created && created < oneHourAgo) {
      rowsToDelete.push(i + 1);
    }
  }

  // Delete from bottom up to preserve row indices
  rowsToDelete.forEach(row => sheet.deleteRow(row));
}

// CREATE ROOM
function handleCreateRoom(e) {
  const player = e.parameter.player;
  const boardCode = e.parameter.boardCode;

  if (!player || !boardCode) {
    return jsonResponse({ error: 'Missing player or boardCode' });
  }

  const sheet = getRoomsSheet();
  cleanupOldRooms(sheet);

  const roomId = generateRoomId();
  const players = JSON.stringify([player]);
  const words = JSON.stringify({});

  sheet.appendRow([roomId, boardCode, players, 'waiting', words, '', Date.now()]);

  return jsonResponse({ roomId: roomId, boardCode: parseInt(boardCode) });
}

// JOIN ROOM
function handleJoinRoom(e) {
  const roomId = (e.parameter.roomId || '').toUpperCase();
  const player = e.parameter.player;

  if (!roomId || !player) {
    return jsonResponse({ error: 'Missing roomId or player' });
  }

  const sheet = getRoomsSheet();
  const row = findRoomRow(sheet, roomId);

  if (row === -1) {
    return jsonResponse({ error: 'Room not found' });
  }

  const data = sheet.getRange(row, 1, 1, 7).getValues()[0];
  const status = data[3];

  if (status !== 'waiting') {
    return jsonResponse({ error: 'Game already started' });
  }

  let players = JSON.parse(data[2]);

  if (!players.includes(player)) {
    players.push(player);
    sheet.getRange(row, 3).setValue(JSON.stringify(players));
  }

  return jsonResponse({
    success: true,
    players: players,
    boardCode: parseInt(data[1])
  });
}

// POLL ROOM
function handlePollRoom(e) {
  const roomId = (e.parameter.roomId || '').toUpperCase();

  if (!roomId) {
    return jsonResponse({ error: 'Missing roomId' });
  }

  const sheet = getRoomsSheet();
  const row = findRoomRow(sheet, roomId);

  if (row === -1) {
    return jsonResponse({ error: 'Room not found' });
  }

  const data = sheet.getRange(row, 1, 1, 7).getValues()[0];
  const players = JSON.parse(data[2]);
  const status = data[3];
  const words = JSON.parse(data[4] || '{}');
  const startTime = data[5];

  return jsonResponse({
    players: players,
    status: status,
    startTime: startTime || null,
    playersSubmitted: Object.keys(words)
  });
}

// START ROOM
function handleStartRoom(e) {
  const roomId = (e.parameter.roomId || '').toUpperCase();

  if (!roomId) {
    return jsonResponse({ error: 'Missing roomId' });
  }

  const sheet = getRoomsSheet();
  const row = findRoomRow(sheet, roomId);

  if (row === -1) {
    return jsonResponse({ error: 'Room not found' });
  }

  const startTime = Date.now() + 5000; // Start in 5 seconds (countdown)

  sheet.getRange(row, 4).setValue('playing');
  sheet.getRange(row, 6).setValue(startTime);

  return jsonResponse({ success: true, startTime: startTime });
}

// SUBMIT WORDS
function handleSubmitWords(e) {
  const roomId = (e.parameter.roomId || '').toUpperCase();
  const player = e.parameter.player;
  const wordsParam = e.parameter.words || '';

  if (!roomId || !player) {
    return jsonResponse({ error: 'Missing roomId or player' });
  }

  const sheet = getRoomsSheet();
  const row = findRoomRow(sheet, roomId);

  if (row === -1) {
    return jsonResponse({ error: 'Room not found' });
  }

  const data = sheet.getRange(row, 1, 1, 7).getValues()[0];
  let words = JSON.parse(data[4] || '{}');

  // Parse words (comma-separated)
  const playerWords = wordsParam ? wordsParam.split(',').map(w => w.trim().toLowerCase()) : [];
  words[player] = playerWords;

  sheet.getRange(row, 5).setValue(JSON.stringify(words));

  // Check if all players have submitted
  const players = JSON.parse(data[2]);
  const allSubmitted = players.every(p => words[p] !== undefined);

  if (allSubmitted) {
    sheet.getRange(row, 4).setValue('finished');
  }

  return jsonResponse({ success: true, allSubmitted: allSubmitted });
}

// GET RESULTS
function handleGetResults(e) {
  const roomId = (e.parameter.roomId || '').toUpperCase();

  if (!roomId) {
    return jsonResponse({ error: 'Missing roomId' });
  }

  const sheet = getRoomsSheet();
  const row = findRoomRow(sheet, roomId);

  if (row === -1) {
    return jsonResponse({ error: 'Room not found' });
  }

  const data = sheet.getRange(row, 1, 1, 7).getValues()[0];
  const players = JSON.parse(data[2]);
  const words = JSON.parse(data[4] || '{}');

  // Count word occurrences across all players
  const wordCounts = {};
  players.forEach(player => {
    const playerWords = words[player] || [];
    playerWords.forEach(word => {
      wordCounts[word] = (wordCounts[word] || 0) + 1;
    });
  });

  // Find duplicates (words found by 2+ players)
  const duplicates = Object.keys(wordCounts).filter(word => wordCounts[word] > 1);

  // Calculate scores - only unique words count
  const results = players.map(player => {
    const playerWords = words[player] || [];
    const uniqueWords = playerWords.filter(word => wordCounts[word] === 1);
    const score = uniqueWords.reduce((total, word) => total + getWordScore(word), 0);

    return {
      name: player,
      words: playerWords,
      uniqueWords: uniqueWords,
      score: score
    };
  });

  // Sort by score descending
  results.sort((a, b) => b.score - a.score);

  return jsonResponse({
    players: results,
    duplicates: duplicates,
    status: data[3]
  });
}

// LEAVE ROOM
function handleLeaveRoom(e) {
  const roomId = (e.parameter.roomId || '').toUpperCase();
  const player = e.parameter.player;

  if (!roomId || !player) {
    return jsonResponse({ error: 'Missing roomId or player' });
  }

  const sheet = getRoomsSheet();
  const row = findRoomRow(sheet, roomId);

  if (row === -1) {
    return jsonResponse({ success: true }); // Room already gone
  }

  const data = sheet.getRange(row, 1, 1, 7).getValues()[0];
  let players = JSON.parse(data[2]);

  players = players.filter(p => p !== player);

  if (players.length === 0) {
    // Delete room if empty
    sheet.deleteRow(row);
  } else {
    sheet.getRange(row, 3).setValue(JSON.stringify(players));
  }

  return jsonResponse({ success: true });
}

// Score calculation (must match client-side)
function getWordScore(word) {
  const len = word.replace(/qu/gi, 'Q').length;
  if (len <= 2) return 0;
  if (len <= 4) return 1;
  if (len === 5) return 2;
  if (len === 6) return 3;
  if (len === 7) return 5;
  return 11;
}

// JSON response helper
function jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
