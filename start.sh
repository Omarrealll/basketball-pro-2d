#!/bin/bash
chmod +x start.sh
npm install
npm install -g pm2
pm2 start server.js --name basketball-game
pm2 save
pm2 logs 