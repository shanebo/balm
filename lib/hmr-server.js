const WebSocket = require('ws');
const { basename } = require('path');


let _socket;
let _timer;
let _changes = [];


function start({ port }) {
  _socket = new WebSocket.Server({ port });
}


function notify(path) {
  clearTimeout(_timer);

  _changes.push(basename(path));
  _changes = [...new Set(_changes)];

  _timer = setTimeout(() => {
    if (!_changes.length) return;

    _socket.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        console.log('Balm hmr', _changes);
        client.send(JSON.stringify(_changes));
      }
    });

    _changes = [];
  }, 50);
}


exports.start = start;
exports.notify = notify;
