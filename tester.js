import axios from 'axios';
import mqtt from 'mqtt';
import fs from 'fs';

// Configuration
const BASE_URL = 'http://localhost:22000';
const MQTT_BROKER_URL = 'mqtt://localhost:1883';
const NUM_CLIENTS = 100; // Adjust this to stress test with more or fewer clients
const TOPIC_BASE = 'test/topic'; // Base topic name for subscriptions
const MIN_TOPICS = 10; // Minimum number of topics per client
const MAX_TOPICS = 25; // Maximum number of topics per client
const MESSAGE_INTERVAL = 1000; // Message publish interval in milliseconds
const RESULT_FILE = 'test_res.txt';

// Initialize result file
fs.writeFileSync(RESULT_FILE, 'Stress Test Results\n');
fs.appendFileSync(RESULT_FILE, '====================\n');

// Function to log results to the file
const logResult = (message) => {
  fs.appendFileSync(RESULT_FILE, `${new Date().toISOString()} - ${message}\n`);
};

// Function to simulate a single MQTT client
const simulateClient = async (clientId, topics) => {
  try {
    // Configure MQTT client
    await axios.post(`${BASE_URL}/configure-mqtt`, {
      brokerUrl: MQTT_BROKER_URL,
      options: {
        username: 'testUser', // Replace with actual credentials if needed
        password: 'testPassword',
        keepalive: 60,
        clean: true,
      },
      clientId,
    });
    logResult(`Configured MQTT client: ${clientId}`);

    // Subscribe to all topics for this client
    for (const topic of topics) {
      await axios.post(`${BASE_URL}/subscribe`, {
        clientId,
        topic,
      });
      logResult(`Client ${clientId} subscribed to topic: ${topic}`);
    }

    // Connect to MQTT broker
    const mqttClient = mqtt.connect(MQTT_BROKER_URL, {
      clientId,
      username: 'testUser',
      password: 'testPassword',
    });

    mqttClient.on('connect', () => {
      logResult(`MQTT client ${clientId} connected`);
      setInterval(() => {
        // Publish a message to each topic
        for (const topic of topics) {
          mqttClient.publish(topic, `Message from ${clientId} to topic ${topic}`);
          logResult(`MQTT client ${clientId} published to topic: ${topic}`);
        }
      }, MESSAGE_INTERVAL);
    });

    mqttClient.on('error', (err) => {
      logResult(`MQTT client ${clientId} encountered an error: ${err.message}`);
    });

    mqttClient.on('close', () => {
      logResult(`MQTT client ${clientId} disconnected`);
    });
  } catch (error) {
    logResult(`Error for client ${clientId}: ${error.message}`);
  }
};

// Main function to simulate multiple clients
const stressTest = async () => {
  logResult('Starting stress test...');
  const clients = Array.from({ length: NUM_CLIENTS }, (_, i) => `client${i}`);
  const topicPromises = clients.map((clientId) => {
    // Generate a random number of topics (between MIN_TOPICS and MAX_TOPICS) for each client
    const numTopics = Math.floor(Math.random() * (MAX_TOPICS - MIN_TOPICS + 1)) + MIN_TOPICS;
    const topics = Array.from({ length: numTopics }, (_, j) => `${TOPIC_BASE}/${clientId}/${j}`);
    return simulateClient(clientId, topics);
  });

  await Promise.all(topicPromises);
  logResult('Stress test initialized. Monitor the server performance.');
};

// Run the stress test
stressTest();
