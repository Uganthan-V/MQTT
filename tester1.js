import axios from 'axios';
import mqtt from 'mqtt';
import fs from 'fs';

// Configuration
const BASE_URL = 'http://localhost:22000';
const MQTT_BROKER_URL = 'mqtt://localhost:1883';
const NUM_CLIENTS = 100; // Adjust this to stress test with more or fewer clients
const TOPIC_BASE = 'test1/topic'; // Base topic name for subscriptions
const MESSAGE_INTERVAL = 1000; // Message publish interval in milliseconds
const RESULT_FILE = 'test_res1.txt';

// Initialize result file
fs.writeFileSync(RESULT_FILE, 'Stress Test Results\n');
fs.appendFileSync(RESULT_FILE, '====================\n');

// Function to log results to the file
const logResult = (message) => {
  fs.appendFileSync(RESULT_FILE, `${new Date().toISOString()} - ${message}\n`);
};

// Function to simulate a single MQTT client
const simulateClient = async (clientId, topic) => {
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

    // Subscribe to topic
    await axios.post(`${BASE_URL}/subscribe`, {
      clientId,
      topic,
    });
    logResult(`Client ${clientId} subscribed to topic: ${topic}`);

    // Connect to MQTT broker
    const mqttClient = mqtt.connect(MQTT_BROKER_URL, {
      clientId,
      username: 'testUser',
      password: 'testPassword',
    });

    mqttClient.on('connect', () => {
      logResult(`MQTT client ${clientId} connected`);
      setInterval(() => {
        mqttClient.publish(topic, `Message from ${clientId}`);
        logResult(`MQTT client ${clientId} published to topic: ${topic}`);
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
  const clients = Array.from({ length: NUM_CLIENTS }, (_, i) => `1client${i}`);
  const topicPromises = clients.map((clientId, index) =>
    simulateClient(clientId, `${TOPIC_BASE}/${index}`)
  );

  await Promise.all(topicPromises);
  logResult('Stress test initialized. Monitor the server performance.');
};

// Run the stress test
stressTest();



