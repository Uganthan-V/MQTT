import cluster from 'cluster';
import os from 'os';
import express, { Request, Response } from 'express';
import bodyParser from 'body-parser';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { configureMqttClient, subscribeToTopic, unsubscribeFromTopic, getHealthStatus, getSubscriptions, ensureMqttConfigured } from './mqtt_config/mqttService';
import { startRedisServer, testRedisConnection, ensureRedisConnection } from './redis/redis_service';
import Redis from 'ioredis';
import './mqtt_config/clustering';


dotenv.config();

// MongoDB connection
mongoose
  .connect(process.env.MONGO_URI || 'mongodb://localhost:27017/MQTT_TESTING')
  .then(() => console.log('Connected to MongoDB'))
  .catch((error) => console.error('MongoDB connection error:', error));

// Redis connection
const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: Number(process.env.REDIS_PORT) || 6379,
});

if (process.env.CLUSTER_MODE === 'true' && cluster.isPrimary) {
  // const numCPUs = os.cpus().length;
  const numCPUs = 4;

  console.log(`Primary process ${process.pid} is running. Forking for ${numCPUs} CPUs.`);
  for (let i = 0; i < numCPUs; i++) {
    cluster.fork();
  }
  // console.log(`Primary process ${process.pid} is running. Forking for ${4} CPUs.`);
  // for (let i = 0; i < 4; i++) {
  //   cluster.fork();
  // }
  cluster.on('exit', (worker, code, signal) => {
    console.log(`Worker ${worker.process.pid} exited. Starting a new worker.`);
    cluster.fork();
  });
} else {
  // Create Express app
  const app = express();
  app.use(bodyParser.json());

  // Ensure Redis connection is active before processing requests
  app.use(ensureRedisConnection);

  // API Endpoints
  app.post('/configure-mqtt', configureMqttClient);
  app.post('/subscribe', ensureMqttConfigured, subscribeToTopic);
  app.post('/unsubscribe', ensureMqttConfigured, unsubscribeFromTopic);
  app.get('/subscriptions', ensureMqttConfigured, getSubscriptions);
  app.get('/api/health/status', ensureMqttConfigured, getHealthStatus);

  // Start server
  const PORT = process.env.PORT || 22000;
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT} (Worker ${process.pid})`);
  });
}
