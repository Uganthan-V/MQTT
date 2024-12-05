// src/mqtt_config/clustering.ts
import cluster from 'cluster';
import { cpus } from 'os';
import { createMQTTBroker } from './aedes-broker';

const PORT_BASE = 22000; // Starting port number
// const numCPUs = cpus().length;
 const numCPUs = 4;

if (cluster.isPrimary) {
  console.log(`Master process is running with PID: ${process.pid}`);

  // Fork workers
  for (let i = 0; i < numCPUs; i++) {
    cluster.fork();
  }

  cluster.on('exit', (worker, code, signal) => {
    console.log(`Worker ${worker.process.pid} exited`);
    cluster.fork(); // Replace the worker
  });
} else {
  const port = PORT_BASE + cluster.worker!.id;
  console.log(`Worker ${process.pid} is starting on port ${port}`);
  createMQTTBroker(port);
}
