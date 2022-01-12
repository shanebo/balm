const WebSocket = require('ws');
const { basename } = require('path');

let _socket;
let _timer;
let _changes = [];


function startWatching({ port }) {
  console.log('Balm watching...');
  _socket = new WebSocket.Server({ port });
}


function notifyClient(path) {
  clearTimeout(_timer);

  _changes.push(basename(path));
  _changes = [...new Set(_changes)];

  _timer = setTimeout(() => {
    if (!_changes.length) return;

    _socket.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        console.log('Balm notifying client of changes', _changes);
        client.send(JSON.stringify(_changes));
      }
    });

    _changes = [];
  }, 50);
}


exports.startWatching = startWatching;
exports.notifyClient = notifyClient;
