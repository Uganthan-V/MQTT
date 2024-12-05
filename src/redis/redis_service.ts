import Redis from 'ioredis';
import { Request, Response, NextFunction } from 'express';



export const testRedisConnection = async (): Promise<void> => {
  try {
    await redis.ping();
    console.log('Redis is reachable');
  } catch (err) {
    console.error('Redis is not reachable:', err);
  }
};

export const startRedisServer = async (): Promise<void> => {
  console.log('Ensure Redis server is running');
};

export const ensureRedisConnection = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const response = await redis.ping();
    if (response === 'PONG') {
      next();
    } else {
      res.status(500).send('Redis connection failed');
    }
  } catch (err) {
    console.error('Redis connection check failed:', err);
    res.status(500).send('Redis is not connected');
  }
};


const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: Number(process.env.REDIS_PORT) || 6379,
  retryStrategy: (times) => Math.min(times * 50, 2000),
});

redis.on('connect', () => {
  console.log('Connected to Redis');
});

redis.on('error', (err) => {
  console.error('Redis connection error:', err);
});

export default redis;


