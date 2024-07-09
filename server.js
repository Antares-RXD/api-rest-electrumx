const express = require('express');
const axios = require('axios');
const WebSocket = require('ws');
const NodeCache = require('node-cache');
const fs = require('fs');
const path = require('path');

const app = express();
const cache = new NodeCache({ stdTTL: 60 });
const PORT = 3000;

const jsonFilePath = path.join(__dirname, 'servers-electrumx.json');

let servers = [];
try {
  const fileContent = fs.readFileSync(jsonFilePath, 'utf8');
  const jsonData = JSON.parse(fileContent);
  if (jsonData.servers && Array.isArray(jsonData.servers)) {
    servers = jsonData.servers;
  } else {
    console.error('Invalid format in servers-electrumx.json');
  }
} catch (error) {
  console.error('Error reading the file servers-electrumx.json:', error.message);
}

const checkServers = async () => {
  if (servers.length === 0) {
    return [{ error: 'No servers available for checking' }];
  }

  const results = await Promise.all(
    servers.map(server => new Promise((resolve) => {
      const ws = new WebSocket(server);
      
      ws.on('open', () => {
        ws.send(JSON.stringify({
          id: 1,
          method: 'blockchain.headers.subscribe',
          params: []
        }));
      });

      ws.on('message', (data) => {
        const response = JSON.parse(data);
        if (response.id === 1 && response.result) {
          resolve({
            server,
            block_height: response.result.height,
            status: 'online',
            last_checked: new Date().toISOString()
          });
        } else {
          resolve({
            server,
            block_height: null,
            status: 'error',
            last_checked: new Date().toISOString()
          });
        }
        ws.close();
      });

      ws.on('error', () => {
        resolve({
          server,
          block_height: null,
          status: 'offline',
          last_checked: new Date().toISOString()
        });
      });

      ws.on('close', () => {
        resolve({
          server,
          block_height: null,
          status: 'offline',
          last_checked: new Date().toISOString()
        });
      });
    }))
  );

  return results;
};

app.get('/api/electrumx', async (req, res) => {
  let status = cache.get('status');
  
  if (!status) {
    status = await checkServers();
    cache.set('status', status);
  }

  res.json(status);
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
