// ============================================
// GOOGLE APPS SCRIPT FOR DAILY BOGGLE
// ============================================
//
// SETUP INSTRUCTIONS:
// 1. Create a new Google Sheet
// 2. Go to Extensions → Apps Script
// 3. Delete any code there and paste this entire file
// 4. Select "SETUP_SHEET" from the dropdown (next to Run button)
// 5. Click Run (▶) - this creates your sheet with headers
// 6. Click Deploy → New Deployment
// 7. Choose "Web app"
// 8. Set "Execute as" to "Me"
// 9. Set "Who has access" to "Anyone"
// 10. Click Deploy and copy the URL
// 11. Paste that URL into your game code (SCRIPT_URL variable)
//
// ============================================

function doGet(e) {
  return handleRequest(e);
}

function doPost(e) {
  return handleRequest(e);
}

function handleRequest(e) {
  var output;

  try {
    var params = e.parameter;
    var action = params.action;

    // ============================================
    // DAILY MODE ACTIONS
    // ============================================
    if (action === 'check') {
      output = checkPlay(params.player, params.date);
    } else if (action === 'save') {
      output = saveScore(params.player, params.date, params.score, params.words);
    } else if (action === 'leaderboard') {
      output = getLeaderboard(params.date);
    }
    // ============================================
    // MULTIPLAYER ACTIONS
    // ============================================
    else if (action === 'createRoom') {
      output = handleCreateRoom(params);
    } else if (action === 'joinRoom') {
      output = handleJoinRoom(params);
    } else if (action === 'pollRoom') {
      output = handlePollRoom(params);
    } else if (action === 'startRoom') {
      output = handleStartRoom(params);
    } else if (action === 'submitWords') {
      output = handleSubmitWords(params);
    } else if (action === 'getResults') {
      output = handleGetResults(params);
    } else if (action === 'leaveRoom') {
      output = handleLeaveRoom(params);
    } else {
      output = { error: 'Unknown action' };
    }
  } catch (error) {
    output = { error: error.toString() };
  }

  return ContentService
    .createTextOutput(JSON.stringify(output))
    .setMimeType(ContentService.MimeType.JSON);
}

// ============================================
// DAILY MODE FUNCTIONS
// ============================================

function checkPlay(player, date) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Scores');
  var data = sheet.getDataRange().getValues();

  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === date && data[i][1].toLowerCase() === player.toLowerCase()) {
      return {
        played: true,
        score: data[i][2],
        words: data[i][3]
      };
    }
  }

  return { played: false };
}

function saveScore(player, date, score, words) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Scores');

  var check = checkPlay(player, date);
  if (check.played) {
    return { success: false, message: 'Already played today' };
  }

  sheet.appendRow([
    date,
    player,
    parseInt(score),
    parseInt(words),
    new Date().toISOString()
  ]);

  return { success: true };
}

function getLeaderboard(date) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Scores');
  var data = sheet.getDataRange().getValues();

  var scores = [];

  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === date) {
      scores.push({
        player: data[i][1],
        score: data[i][2],
        words: data[i][3]
      });
    }
  }

  scores.sort(function(a, b) {
    return b.score - a.score;
  });

  return { leaderboard: scores };
}

// ============================================
// MULTIPLAYER FUNCTIONS
// ============================================

function generateRoomId() {
  // Generate 5-digit numeric code (10000-99999)
  return String(Math.floor(10000 + Math.random() * 90000));
}

function getRoomsSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Rooms');
  if (!sheet) {
    sheet = ss.insertSheet('Rooms');
    sheet.appendRow(['roomId', 'boardCode', 'players', 'status', 'words', 'startTime', 'created']);
  }
  return sheet;
}

function findRoomRow(sheet, roomId) {
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    // Compare as strings to handle number/string mismatch
    if (String(data[i][0]) === String(roomId)) {
      return i + 1;
    }
  }
  return -1;
}

function cleanupOldRooms(sheet) {
  var data = sheet.getDataRange().getValues();
  var oneHourAgo = Date.now() - (60 * 60 * 1000);
  var rowsToDelete = [];

  for (var i = data.length - 1; i >= 1; i--) {
    var created = data[i][6];
    if (created && created < oneHourAgo) {
      rowsToDelete.push(i + 1);
    }
  }

  for (var j = 0; j < rowsToDelete.length; j++) {
    sheet.deleteRow(rowsToDelete[j]);
  }
}

function handleCreateRoom(params) {
  var player = params.player;
  var boardCode = params.boardCode;

  if (!player || !boardCode) {
    return { error: 'Missing player or boardCode' };
  }

  var sheet = getRoomsSheet();
  cleanupOldRooms(sheet);

  var roomId = generateRoomId();
  var players = JSON.stringify([player]);
  var words = JSON.stringify({});

  sheet.appendRow([roomId, boardCode, players, 'waiting', words, '', Date.now()]);

  return { roomId: roomId, boardCode: parseInt(boardCode) };
}

function handleJoinRoom(params) {
  var roomId = String(params.roomId || '');
  var player = params.player;

  if (!roomId || !player) {
    return { error: 'Missing roomId or player' };
  }

  var sheet = getRoomsSheet();
  var row = findRoomRow(sheet, roomId);

  if (row === -1) {
    return { error: 'Room not found' };
  }

  var data = sheet.getRange(row, 1, 1, 7).getValues()[0];
  var status = data[3];

  if (status !== 'waiting') {
    return { error: 'Game already started' };
  }

  var players = JSON.parse(data[2]);

  if (players.indexOf(player) === -1) {
    players.push(player);
    sheet.getRange(row, 3).setValue(JSON.stringify(players));
  }

  return {
    success: true,
    players: players,
    boardCode: parseInt(data[1])
  };
}

function handlePollRoom(params) {
  var roomId = String(params.roomId || '');

  if (!roomId) {
    return { error: 'Missing roomId' };
  }

  var sheet = getRoomsSheet();
  var row = findRoomRow(sheet, roomId);

  if (row === -1) {
    return { error: 'Room not found' };
  }

  var data = sheet.getRange(row, 1, 1, 7).getValues()[0];
  var players = JSON.parse(data[2]);
  var status = data[3];
  var words = JSON.parse(data[4] || '{}');
  var startTime = data[5];

  return {
    players: players,
    status: status,
    startTime: startTime || null,
    playersSubmitted: Object.keys(words)
  };
}

function handleStartRoom(params) {
  var roomId = String(params.roomId || '');

  if (!roomId) {
    return { error: 'Missing roomId' };
  }

  var sheet = getRoomsSheet();
  var row = findRoomRow(sheet, roomId);

  if (row === -1) {
    return { error: 'Room not found' };
  }

  var startTime = Date.now() + 5000;

  sheet.getRange(row, 4).setValue('playing');
  sheet.getRange(row, 6).setValue(startTime);

  return { success: true, startTime: startTime };
}

function handleSubmitWords(params) {
  var roomId = String(params.roomId || '');
  var player = (params.player || '').toLowerCase();
  var wordsParam = params.words || '';

  if (!roomId || !player) {
    return { error: 'Missing roomId or player' };
  }

  var sheet = getRoomsSheet();
  var row = findRoomRow(sheet, roomId);

  if (row === -1) {
    return { error: 'Room not found' };
  }

  var data = sheet.getRange(row, 1, 1, 7).getValues()[0];
  var words = JSON.parse(data[4] || '{}');

  var playerWords = wordsParam ? wordsParam.split(',').map(function(w) { return w.trim().toLowerCase(); }) : [];
  words[player] = playerWords;

  sheet.getRange(row, 5).setValue(JSON.stringify(words));

  // Check if all players submitted (case-insensitive)
  var players = JSON.parse(data[2]).map(function(p) { return p.toLowerCase(); });
  var submittedPlayers = Object.keys(words).map(function(p) { return p.toLowerCase(); });
  var allSubmitted = players.every(function(p) {
    return submittedPlayers.indexOf(p) !== -1;
  });

  if (allSubmitted) {
    sheet.getRange(row, 4).setValue('finished');
  }

  return { success: true, allSubmitted: allSubmitted, submitted: submittedPlayers.length, total: players.length };
}

function handleGetResults(params) {
  var roomId = String(params.roomId || '');

  if (!roomId) {
    return { error: 'Missing roomId' };
  }

  var sheet = getRoomsSheet();
  var row = findRoomRow(sheet, roomId);

  if (row === -1) {
    return { error: 'Room not found' };
  }

  var data = sheet.getRange(row, 1, 1, 7).getValues()[0];
  var players = JSON.parse(data[2]);
  var wordsRaw = JSON.parse(data[4] || '{}');

  // Normalize words object keys to lowercase
  var words = {};
  Object.keys(wordsRaw).forEach(function(key) {
    words[key.toLowerCase()] = wordsRaw[key];
  });

  var wordCounts = {};
  players.forEach(function(player) {
    var playerWords = words[player.toLowerCase()] || [];
    playerWords.forEach(function(word) {
      wordCounts[word] = (wordCounts[word] || 0) + 1;
    });
  });

  var duplicates = Object.keys(wordCounts).filter(function(word) {
    return wordCounts[word] > 1;
  });

  var results = players.map(function(player) {
    var playerWords = words[player.toLowerCase()] || [];
    var uniqueWords = playerWords.filter(function(word) {
      return wordCounts[word] === 1;
    });
    var score = uniqueWords.reduce(function(total, word) {
      return total + getWordScore(word);
    }, 0);

    return {
      name: player,
      words: playerWords,
      uniqueWords: uniqueWords,
      score: score
    };
  });

  results.sort(function(a, b) {
    return b.score - a.score;
  });

  return {
    players: results,
    duplicates: duplicates,
    status: data[3]
  };
}

function handleLeaveRoom(params) {
  var roomId = String(params.roomId || '');
  var player = params.player;

  if (!roomId || !player) {
    return { error: 'Missing roomId or player' };
  }

  var sheet = getRoomsSheet();
  var row = findRoomRow(sheet, roomId);

  if (row === -1) {
    return { success: true };
  }

  var data = sheet.getRange(row, 1, 1, 7).getValues()[0];
  var players = JSON.parse(data[2]);

  players = players.filter(function(p) { return p !== player; });

  if (players.length === 0) {
    sheet.deleteRow(row);
  } else {
    sheet.getRange(row, 3).setValue(JSON.stringify(players));
  }

  return { success: true };
}

function getWordScore(word) {
  var len = word.replace(/qu/gi, 'Q').length;
  if (len <= 2) return 0;
  if (len <= 4) return 1;
  if (len === 5) return 2;
  if (len === 6) return 3;
  if (len === 7) return 5;
  return 11;
}

// ============================================
// SETUP FUNCTION
// RUN THIS FIRST!
// Click the Run button (▶) with this function selected
// ============================================
function SETUP_SHEET() {
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();

  // Setup Scores sheet
  var scoresSheet = spreadsheet.getSheetByName('Scores');
  if (!scoresSheet) {
    scoresSheet = spreadsheet.insertSheet('Scores');
    Logger.log('Created "Scores" sheet');
  }

  scoresSheet.getRange('A1:E1').setValues([['date', 'player', 'score', 'words', 'timestamp']]);
  scoresSheet.getRange('A1:E1').setFontWeight('bold');
  scoresSheet.getRange('A1:E1').setBackground('#4285f4');
  scoresSheet.getRange('A1:E1').setFontColor('white');
  scoresSheet.setColumnWidth(1, 120);
  scoresSheet.setColumnWidth(2, 150);
  scoresSheet.setColumnWidth(3, 80);
  scoresSheet.setColumnWidth(4, 80);
  scoresSheet.setColumnWidth(5, 180);
  scoresSheet.setFrozenRows(1);

  // Setup Rooms sheet for multiplayer
  var roomsSheet = spreadsheet.getSheetByName('Rooms');
  if (!roomsSheet) {
    roomsSheet = spreadsheet.insertSheet('Rooms');
    Logger.log('Created "Rooms" sheet');
  }

  roomsSheet.getRange('A1:G1').setValues([['roomId', 'boardCode', 'players', 'status', 'words', 'startTime', 'created']]);
  roomsSheet.getRange('A1:G1').setFontWeight('bold');
  roomsSheet.getRange('A1:G1').setBackground('#9c27b0');
  roomsSheet.getRange('A1:G1').setFontColor('white');
  roomsSheet.setColumnWidth(1, 100);
  roomsSheet.setColumnWidth(2, 100);
  roomsSheet.setColumnWidth(3, 200);
  roomsSheet.setColumnWidth(4, 80);
  roomsSheet.setColumnWidth(5, 300);
  roomsSheet.setColumnWidth(6, 150);
  roomsSheet.setColumnWidth(7, 150);
  roomsSheet.setFrozenRows(1);

  Logger.log('====================================');
  Logger.log('SETUP COMPLETE!');
  Logger.log('====================================');
  Logger.log('');
  Logger.log('Next steps:');
  Logger.log('1. Click Deploy → New Deployment');
  Logger.log('2. Select "Web app"');
  Logger.log('3. Set "Execute as" to "Me"');
  Logger.log('4. Set "Who has access" to "Anyone"');
  Logger.log('5. Click Deploy');
  Logger.log('6. Copy the URL and paste it into your game code');

  SpreadsheetApp.getUi().alert(
    'Setup Complete!\n\n' +
    'Created sheets:\n' +
    '- Scores (for daily mode)\n' +
    '- Rooms (for multiplayer)\n\n' +
    'Next steps:\n' +
    '1. Click Deploy → New Deployment\n' +
    '2. Select "Web app"\n' +
    '3. Set "Execute as" to "Me"\n' +
    '4. Set "Who has access" to "Anyone"\n' +
    '5. Click Deploy\n' +
    '6. Copy the URL into your game code'
  );
}
