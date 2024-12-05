import { Request, Response, NextFunction } from 'express';
import { Schema, connection, Model, Document } from 'mongoose';
import mqtt, { MqttClient } from 'mqtt';

// MongoDB Schema for storing messages
interface IMessage extends Document {
  topic: string;
  message: string;
  timestamp: Date;
}

// MongoDB Schema for storing client information (clientId and active subscriptions)
interface IClientInfo extends Document {
  clientId: string;
  subscriptions: string[];
}

const clientInfoModel = connection.model<IClientInfo>('client_info', new Schema<IClientInfo>({
  clientId: { type: String, required: true, unique: true },
  subscriptions: { type: [String], default: [] },
}));

// Dynamic model for client-topic-specific collections
const clientTopicMessageModels: { [key: string]: Model<IMessage> } = {};
const getModelForClientTopic = (clientId: string, topic: string): Model<IMessage> => {
  const collectionName = `${clientId}_${topic}`.replace(/[^a-zA-Z0-9_]/g, '_'); // Sanitize collection name
  if (!clientTopicMessageModels[collectionName]) {
    const clientTopicSchema = new Schema<IMessage>({
      topic: { type: String, required: true },
      message: { type: String, required: true },
      timestamp: { type: Date, default: Date.now },
    }, { collection: collectionName });
    clientTopicMessageModels[collectionName] = connection.model<IMessage>(collectionName, clientTopicSchema);
  }
  return clientTopicMessageModels[collectionName];
};

// Map to track MQTT clients and their subscriptions
const mqttClients: Map<string, MqttClient> = new Map();
const subscribedTopics: Map<string, string[]> = new Map();

// Configure an MQTT client
export const configureMqttClient = (req: Request, res: Response): void => {
  const { brokerUrl, options, clientId } = req.body;

  if (!brokerUrl || !clientId) {
    res.status(400).send('Broker URL and Client ID are required');
    return;
  }

  if (mqttClients.has(clientId)) {
    res.status(400).send(`MQTT client ${clientId} is already configured`);
    return;
  }

  try {
    const mqttClient = mqtt.connect(brokerUrl, options);

    mqttClient.on('connect', async () => {
      console.log(`[${clientId}] Connected to MQTT broker`);

      // Fetch previously subscribed topics from MongoDB
      const clientInfo = await clientInfoModel.findOne({ clientId });
      if (clientInfo) {
        const { subscriptions } = clientInfo;
        for (const topic of subscriptions) {
          mqttClient.subscribe(topic, (err: Error | null) => {
            if (err) {
              console.error(`[${clientId}] Failed to resubscribe to topic: ${topic}`, err);
            } else {
              console.log(`[${clientId}] Resubscribed to topic: ${topic}`);
            }
          });
        }
      }

      res.send(`MQTT client ${clientId} configured and connected successfully`);
    });

    mqttClient.on('message', async (topic: string, message: Buffer) => {
      console.log(`[${clientId}] Received message on ${topic}: ${message.toString()}`);
      try {
        // Use a collection specific to this clientId and topic
        const clientTopicModel = getModelForClientTopic(clientId, topic);
        const messageData = new clientTopicModel({
          topic,
          message: message.toString(),
        });
        await messageData.save();
      } catch (err) {
        console.error(`[${clientId}] Error saving data:`, err);
      }
    });

    mqttClient.on('reconnect', () => {
      console.log(`[${clientId}] Reconnecting to MQTT broker`);
    });

    mqttClient.on('close', () => {
      console.log(`[${clientId}] MQTT connection closed`);
    });

    mqttClients.set(clientId, mqttClient);
    subscribedTopics.set(clientId, []);
  } catch (err) {
    console.error(`[${clientId}] MQTT configuration error:`, err);
    res.status(500).send('Error configuring MQTT client');
  }
};
export const ensureMqttConfigured = (req: Request, res: Response, next: NextFunction): void => {
  const { clientId } = req.body;

  if (!clientId || !mqttClients.has(clientId)) {
    res.status(400).send('MQTT client is not configured');
    return;
  }
  next();
};


// Subscribe a client to a topic
export const subscribeToTopic = async (req: Request, res: Response): Promise<void> => {
  const { clientId, topic } = req.body;

  if (!clientId || !topic) {
    res.status(400).send('Client ID and topic are required');
    return;
  }

  const mqttClient = mqttClients.get(clientId);
  if (!mqttClient) {
    res.status(400).send(`MQTT client ${clientId} is not configured`);
    return;
  }

  const clientTopics = subscribedTopics.get(clientId) || [];
  if (clientTopics.includes(topic)) {
    res.status(400).send(`Client ${clientId} is already subscribed to ${topic}`);
    return;
  }

  try {
    mqttClient.subscribe(topic, async (err: Error | null) => {
      if (err) {
        console.error(`[${clientId}] Subscription to ${topic} failed:`, err);
        res.status(500).send('Subscription failed');
      } else {
        clientTopics.push(topic);
        subscribedTopics.set(clientId, clientTopics);

        // Save subscription to MongoDB
        await clientInfoModel.findOneAndUpdate(
          { clientId },
          { $addToSet: { subscriptions: topic } },
          { upsert: true }
        );

        console.log(`[${clientId}] Subscribed to topic: ${topic}`);
        res.send(`Client ${clientId} subscribed to ${topic}`);
      }
    });
  } catch (err) {
    console.error(`[${clientId}] Subscription error:`, err);
    res.status(500).send('Subscription error');
  }
};

// Unsubscribe a client from a topic
export const unsubscribeFromTopic = async (req: Request, res: Response): Promise<void> => {
  const { clientId, topic } = req.body;

  if (!clientId || !topic) {
    res.status(400).send('Client ID and topic are required');
    return;
  }

  const mqttClient = mqttClients.get(clientId);
  if (!mqttClient) {
    res.status(400).send(`MQTT client ${clientId} is not configured`);
    return;
  }

  const clientTopics = subscribedTopics.get(clientId) || [];
  if (!clientTopics.includes(topic)) {
    res.status(400).send(`Client ${clientId} is not subscribed to topic ${topic}`);
    return;
  }

  try {
    mqttClient.unsubscribe(topic, async (err: Error | undefined) => {
      if (err) {
        console.error(`[${clientId}] Unsubscription from ${topic} failed:`, err);
        res.status(500).send('Unsubscription failed');
      } else {
        const updatedTopics = clientTopics.filter((t) => t !== topic);
        subscribedTopics.set(clientId, updatedTopics);

        // Remove subscription from MongoDB
        await clientInfoModel.findOneAndUpdate(
          { clientId },
          { $pull: { subscriptions: topic } }
        );

        console.log(`[${clientId}] Unsubscribed from topic: ${topic}`);
        res.send(`Client ${clientId} unsubscribed from ${topic}`);
      }
    });
  } catch (err) {
    console.error(`[${clientId}] Unsubscription error:`, err);
    res.status(500).send('Unsubscription error');
  }
};

// Get all current subscriptions for a client
export const getSubscriptions = async (req: Request, res: Response): Promise<void> => {
  const { clientId } = req.query;

  if (!clientId || typeof clientId !== 'string') {
    res.status(400).send('Client ID is required');
    return;
  }

  try {
    const clientSubscriptions = await clientInfoModel.findOne({ clientId }).select('subscriptions -_id');
    if (clientSubscriptions) {
      res.json(clientSubscriptions.subscriptions);
    } else {
      res.status(404).send('Client not found');
    }
  } catch (err) {
    console.error('Error fetching subscriptions:', err);
    res.status(500).send('Error fetching subscriptions');
  }
};

// Get health status
export const getHealthStatus = (req: Request, res: Response): void => {
  const connectedClients = Array.from(mqttClients.keys());
  res.status(200).json({
    status: 'OK',
    connectedClients,
    timestamp: new Date().toISOString(),
  });
};
