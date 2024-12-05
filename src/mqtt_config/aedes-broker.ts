// src/mqtt_config/aedes-broker.ts
import Aedes, { Client, PublishPacket, Subscription } from 'aedes';
import { createServer, Server } from 'net';
import WebSocket from 'ws';

export const createMQTTBroker = (port: number): Server => {
  const broker = new Aedes();
  const server = createServer(broker.handle);

  const wsServer = new WebSocket.Server({ noServer: true });
  wsServer.on('connection', (ws: WebSocket) => {
    ws.on('message', (message) => {
      console.log(`Received WebSocket message: ${message}`);
    });
  });

  server.on('upgrade', (req, socket, head) => {
    wsServer.handleUpgrade(req, socket, head, (ws) => {
      wsServer.emit('connection', ws, req);
    });
  });

  broker.on('publish', async (packet: PublishPacket) => {
    console.log(`Message published on topic ${packet.topic}: ${packet.payload.toString()}`);
  });

  broker.on('client', (client: Client) => {
    console.log(`Client connected: ${client.id}`);
  });

  broker.on('clientDisconnect', (client: Client) => {
    console.log(`Client disconnected: ${client.id}`);
  });

  broker.on('subscribe', (subscriptions: Subscription[], client: Client) => {
    console.log(`Client ${client.id} subscribed to topics: ${subscriptions.map((s) => s.topic).join(', ')}`);
  });

  broker.on('unsubscribe', (subscriptions: string[], client: Client) => {
    console.log(`Client ${client.id} unsubscribed from topics: ${subscriptions.join(', ')}`);
  });

  server.listen(port, () => {
    console.log(`MQTT broker running on port ${port}`);
  });

  return server;
};


